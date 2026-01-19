// CentroVision EHR - Tauri Backend
// Supports dual connection: Supabase (cloud) and local PostgreSQL server

pub mod db;
pub mod commands;
pub mod sync;
pub mod auth;
pub mod config;
pub mod postgres;
pub mod connection_manager;

use db::Database;
use config::AppConfig;
use connection_manager::ConnectionManager;
use tauri::Manager;
use std::sync::Arc;

/// Application state shared across all commands
pub struct AppState {
    pub db: Arc<Database>,
    pub connection_manager: Arc<ConnectionManager>,
    pub config: AppConfig,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Get app data directory for SQLite database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            // Create directory if it doesn't exist
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("centrovision.db");
            log::info!("Database path: {:?}", db_path);

            // Initialize SQLite database (local cache)
            let db = Database::new(db_path.to_str().unwrap())
                .expect("Failed to create database");

            db.initialize().expect("Failed to initialize database schema");
            log::info!("SQLite database initialized successfully");

            // Load configuration
            let config = match AppConfig::load() {
                Ok(cfg) => {
                    log::info!("Configuration loaded successfully");
                    cfg
                }
                Err(e) => {
                    log::warn!("Failed to load config, using defaults: {}", e);
                    // Create default config file for user reference
                    if let Err(e) = AppConfig::create_default_if_missing() {
                        log::warn!("Failed to create default config: {}", e);
                    }
                    AppConfig::default()
                }
            };

            // Initialize connection manager (handles Supabase and local PostgreSQL)
            let config_clone = config.clone();
            let connection_manager = tauri::async_runtime::block_on(async {
                match ConnectionManager::new(config_clone).await {
                    Ok(cm) => {
                        log::info!("Connection manager initialized");
                        Arc::new(cm)
                    }
                    Err(e) => {
                        log::error!("Failed to initialize connection manager: {}", e);
                        // Create a default connection manager without local server
                        Arc::new(ConnectionManager::new(AppConfig::default()).await.unwrap())
                    }
                }
            });

            // Start background health check task
            let cm_for_health = connection_manager.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
                loop {
                    interval.tick().await;
                    cm_for_health.check_connections().await;
                }
            });

            // Wrap database in Arc for sharing
            let db = Arc::new(db);

            // Manage full app state
            let app_state = AppState {
                db: db.clone(),
                connection_manager,
                config,
            };
            let app_state = Arc::new(app_state);

            // Manage database state (legacy - for existing commands that use State<Database>)
            app.manage(db);

            // Manage full app state
            app.manage(app_state);

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            // Connection status command (NEW)
            commands::get_connection_status,
            // Sync commands
            sync::trigger_initial_sync,
            sync::check_network_status,
            sync::process_sync_queue,
            sync::get_pending_sync_count,
            // Read commands
            commands::get_sync_status,
            commands::get_branches,
            commands::get_rooms,
            commands::get_patients,
            commands::get_patient_by_id,
            commands::get_appointments,
            commands::get_doctors,
            commands::get_user_roles,
            // Write commands
            commands::create_patient,
            commands::update_patient,
            commands::create_appointment,
            commands::update_appointment,
            commands::delete_appointment,
            // Cache commands (write-through)
            commands::save_appointments_to_sqlite,
            commands::remove_appointment_from_sqlite,
            // Print command
            commands::print_webview,
            // Auth commands
            auth::cache_auth_session,
            auth::get_cached_session,
            auth::clear_cached_session,
            auth::has_valid_cached_session,
            auth::get_cached_user,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
