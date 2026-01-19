use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

const AUTH_STORE_FILE: &str = "auth_store.json";
const SESSION_KEY: &str = "cached_session";
const SESSION_MAX_AGE_DAYS: i64 = 7;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedSession {
    pub user_id: String,
    pub email: String,
    pub access_token: String,
    pub refresh_token: String,
    pub roles: Vec<String>,
    pub full_name: Option<String>,
    pub cached_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedUser {
    pub id: String,
    pub email: String,
    pub roles: Vec<String>,
    pub full_name: Option<String>,
}

/// Save session to secure store
#[tauri::command]
pub async fn cache_auth_session(
    app: AppHandle,
    user_id: String,
    email: String,
    access_token: String,
    refresh_token: String,
    roles: Vec<String>,
    full_name: Option<String>,
) -> Result<(), String> {
    let store = app
        .store(AUTH_STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let session = CachedSession {
        user_id,
        email,
        access_token,
        refresh_token,
        roles,
        full_name,
        cached_at: chrono::Utc::now().to_rfc3339(),
    };

    store.set(
        SESSION_KEY,
        serde_json::to_value(&session).map_err(|e| e.to_string())?,
    );

    store.save().map_err(|e| format!("Failed to save store: {}", e))?;

    log::info!("Auth session cached for user: {}", session.email);
    Ok(())
}

/// Get cached session if valid
#[tauri::command]
pub async fn get_cached_session(app: AppHandle) -> Result<Option<CachedSession>, String> {
    let store = app
        .store(AUTH_STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let session_value = store.get(SESSION_KEY);

    match session_value {
        Some(value) => {
            let session: CachedSession =
                serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;

            // Check if session is expired (7 days max)
            let cached_at = chrono::DateTime::parse_from_rfc3339(&session.cached_at)
                .map_err(|e| e.to_string())?;
            let now = chrono::Utc::now();
            let age = now.signed_duration_since(cached_at);

            if age.num_days() > SESSION_MAX_AGE_DAYS {
                log::info!("Cached session expired, clearing");
                store.delete(SESSION_KEY);
                store.save().ok();
                return Ok(None);
            }

            log::info!("Found valid cached session for: {}", session.email);
            Ok(Some(session))
        }
        None => {
            log::info!("No cached session found");
            Ok(None)
        }
    }
}

/// Clear cached session on logout
#[tauri::command]
pub async fn clear_cached_session(app: AppHandle) -> Result<(), String> {
    let store = app
        .store(AUTH_STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    store.delete(SESSION_KEY);
    store.save().map_err(|e| format!("Failed to save store: {}", e))?;

    log::info!("Cached session cleared");
    Ok(())
}

/// Check if we have a valid cached session (for quick offline check)
#[tauri::command]
pub async fn has_valid_cached_session(app: AppHandle) -> Result<bool, String> {
    match get_cached_session(app).await {
        Ok(Some(_)) => Ok(true),
        _ => Ok(false),
    }
}

/// Get cached user info without tokens (for UI display)
#[tauri::command]
pub async fn get_cached_user(app: AppHandle) -> Result<Option<CachedUser>, String> {
    match get_cached_session(app).await {
        Ok(Some(session)) => Ok(Some(CachedUser {
            id: session.user_id,
            email: session.email,
            roles: session.roles,
            full_name: session.full_name,
        })),
        _ => Ok(None),
    }
}
