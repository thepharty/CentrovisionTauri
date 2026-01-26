use crate::AppState;
use crate::db::Database;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub tables_synced: Vec<String>,
    pub records_count: HashMap<String, usize>,
    pub error: Option<String>,
}

pub struct SyncManager {
    client: Client,
    api_key: String,
    supabase_url: String,
}

impl SyncManager {
    pub fn new(api_key: &str, supabase_url: &str) -> Self {
        SyncManager {
            client: Client::new(),
            api_key: api_key.to_string(),
            supabase_url: supabase_url.to_string(),
        }
    }

    pub async fn initial_sync(&self, db: &Database) -> Result<SyncResult, String> {
        let mut result = SyncResult {
            success: true,
            tables_synced: Vec::new(),
            records_count: HashMap::new(),
            error: None,
        };

        // Sync order matters due to foreign keys
        let tables = vec![
            ("branches", "id,name,code,address,phone,active,created_at,updated_at"),
            ("rooms", "id,name,kind,branch_id,active,created_at,updated_at"),
            ("profiles", "id,user_id,full_name,email,specialty,gender,is_visible_in_dashboard,created_at,updated_at"),
            ("user_roles", "id,user_id,role,created_at"),
            ("user_branches", "id,user_id,branch_id,created_at"),
            ("patients", "id,code,first_name,last_name,dob,phone,email,allergies,notes,address,diabetes,hta,ophthalmic_history,occupation,created_at,updated_at,deleted_at"),
            ("appointments", "id,patient_id,room_id,doctor_id,branch_id,starts_at,ends_at,reason,type,status,autorefractor,lensometry,photo_od,photo_oi,post_op_type,is_courtesy,created_at,updated_at,deleted_at"),
            ("encounters", "id,patient_id,appointment_id,doctor_id,type,date,motivo_consulta,summary,plan_tratamiento,created_at,updated_at,deleted_at"),
            ("exam_eye", "id,encounter_id,side,av_sc,av_cc,iop,ref_sphere,ref_cyl,ref_axis,slit_lamp,fundus,plan,created_at,updated_at,deleted_at"),
            ("diagnoses", "id,encounter_id,code,label,created_at,deleted_at"),
        ];

        for (table, columns) in tables {
            match self.sync_table(db, table, columns).await {
                Ok(count) => {
                    result.tables_synced.push(table.to_string());
                    result.records_count.insert(table.to_string(), count);
                    log::info!("Synced {} records from {}", count, table);
                }
                Err(e) => {
                    log::error!("Failed to sync table {}: {}", table, e);
                    result.success = false;
                    result.error = Some(format!("Failed to sync {}: {}", table, e));
                    // Continue with other tables
                }
            }
        }

        // Update last sync timestamp
        if result.success {
            let now = chrono::Utc::now().to_rfc3339();
            db.set_sync_metadata("last_sync", &now).map_err(|e| e.to_string())?;
        }

        Ok(result)
    }

    async fn sync_table(&self, db: &Database, table: &str, columns: &str) -> Result<usize, String> {
        let url = format!("{}/rest/v1/{}?select={}", self.supabase_url, table, columns);

        let response = self
            .client
            .get(&url)
            .header("apikey", &self.api_key)
            .header("Authorization", format!("Bearer {}", &self.api_key))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!("HTTP error: {}", response.status()));
        }

        let data: Vec<Value> = response.json().await.map_err(|e| e.to_string())?;
        let count = data.len();

        // Insert data into SQLite
        self.insert_records(db, table, &data)?;

        Ok(count)
    }

    fn insert_records(&self, db: &Database, table: &str, records: &[Value]) -> Result<(), String> {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        for record in records {
            if let Value::Object(map) = record {
                let columns: Vec<&str> = map.keys().map(|k| k.as_str()).collect();
                let placeholders: Vec<&str> = columns.iter().map(|_| "?").collect();

                let sql = format!(
                    "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
                    table,
                    columns.join(", "),
                    placeholders.join(", ")
                );

                let values: Vec<String> = columns
                    .iter()
                    .map(|col| {
                        match map.get(*col) {
                            Some(Value::String(s)) => s.clone(),
                            Some(Value::Number(n)) => n.to_string(),
                            Some(Value::Bool(b)) => if *b { "1".to_string() } else { "0".to_string() },
                            Some(Value::Null) | None => String::new(),
                            Some(v) => v.to_string(),
                        }
                    })
                    .collect();

                let params: Vec<&dyn rusqlite::ToSql> = values
                    .iter()
                    .map(|v| v as &dyn rusqlite::ToSql)
                    .collect();

                conn.execute(&sql, params.as_slice()).map_err(|e| {
                    log::error!("SQL Error for {}: {} - SQL: {}", table, e, sql);
                    e.to_string()
                })?;
            }
        }

        // Mark all as synced
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            &format!("UPDATE {} SET synced_at = ?", table),
            [&now],
        )
        .ok(); // Ignore error if column doesn't exist

        Ok(())
    }
}

// Tauri command to trigger sync
#[tauri::command]
pub async fn trigger_initial_sync(
    app_state: tauri::State<'_, Arc<AppState>>,
    api_key: String,
) -> Result<SyncResult, String> {
    let supabase_url = &app_state.config.supabase.url;
    let sync_manager = SyncManager::new(&api_key, supabase_url);
    sync_manager.initial_sync(&app_state.db).await
}

#[tauri::command]
pub async fn check_network_status(
    app_state: tauri::State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let client = Client::new();
    let supabase_url = &app_state.config.supabase.url;
    match client.get(format!("{}/rest/v1/", supabase_url)).send().await {
        Ok(_) => Ok(true),
        Err(e) => {
            log::warn!("[NetworkCheck] Failed to reach Supabase: {}", e);
            Ok(false)
        }
    }
}

// ============================================================
// SYNC QUEUE PROCESSING
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncQueueItem {
    pub id: i64,
    pub table_name: String,
    pub record_id: String,
    pub action: String,
    pub data: String,
    pub attempts: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncUploadResult {
    pub processed: i32,
    pub succeeded: i32,
    pub failed: i32,
    pub errors: Vec<String>,
}

impl SyncManager {
    /// Process pending items in sync queue and upload to Supabase
    pub async fn process_sync_queue(&self, db: &Database) -> Result<SyncUploadResult, String> {
        let mut result = SyncUploadResult {
            processed: 0,
            succeeded: 0,
            failed: 0,
            errors: Vec::new(),
        };

        // Get pending items from queue
        let items = self.get_pending_queue_items(db)?;

        for item in items {
            result.processed += 1;

            match self.sync_item_to_supabase(&item).await {
                Ok(_) => {
                    // Mark as synced
                    self.mark_item_synced(db, item.id)?;
                    result.succeeded += 1;
                    log::info!("Synced {} {} to Supabase", item.action, item.record_id);
                }
                Err(e) => {
                    // Update attempts count
                    self.increment_item_attempts(db, item.id, &e)?;
                    result.failed += 1;
                    result.errors.push(format!("{}: {}", item.record_id, e));
                    log::error!("Failed to sync {}: {}", item.record_id, e);
                }
            }
        }

        Ok(result)
    }

    fn get_pending_queue_items(&self, db: &Database) -> Result<Vec<SyncQueueItem>, String> {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, table_name, record_id, action, data, attempts
                 FROM sync_queue
                 WHERE synced = 0 AND attempts < 3
                 ORDER BY created_at ASC
                 LIMIT 50",
            )
            .map_err(|e| e.to_string())?;

        let items = stmt
            .query_map([], |row| {
                Ok(SyncQueueItem {
                    id: row.get(0)?,
                    table_name: row.get(1)?,
                    record_id: row.get(2)?,
                    action: row.get(3)?,
                    data: row.get(4)?,
                    attempts: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(items)
    }

    async fn sync_item_to_supabase(&self, item: &SyncQueueItem) -> Result<(), String> {
        let url = format!("{}/rest/v1/{}", self.supabase_url, item.table_name);

        match item.action.as_str() {
            "INSERT" => {
                let data: Value = serde_json::from_str(&item.data)
                    .map_err(|e| format!("Invalid JSON: {}", e))?;

                let response = self
                    .client
                    .post(&url)
                    .header("apikey", &self.api_key)
                    .header("Authorization", format!("Bearer {}", &self.api_key))
                    .header("Content-Type", "application/json")
                    .header("Prefer", "return=minimal")
                    .json(&data)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                if !response.status().is_success() {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    return Err(format!("HTTP {}: {}", status, body));
                }
            }
            "UPDATE" => {
                let data: Value = serde_json::from_str(&item.data)
                    .map_err(|e| format!("Invalid JSON: {}", e))?;

                let update_url = format!("{}?id=eq.{}", url, item.record_id);

                let response = self
                    .client
                    .patch(&update_url)
                    .header("apikey", &self.api_key)
                    .header("Authorization", format!("Bearer {}", &self.api_key))
                    .header("Content-Type", "application/json")
                    .header("Prefer", "return=minimal")
                    .json(&data)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                if !response.status().is_success() {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    return Err(format!("HTTP {}: {}", status, body));
                }
            }
            "DELETE" => {
                // Soft delete - update deleted_at
                let delete_url = format!("{}?id=eq.{}", url, item.record_id);
                let now = chrono::Utc::now().to_rfc3339();

                let response = self
                    .client
                    .patch(&delete_url)
                    .header("apikey", &self.api_key)
                    .header("Authorization", format!("Bearer {}", &self.api_key))
                    .header("Content-Type", "application/json")
                    .header("Prefer", "return=minimal")
                    .json(&serde_json::json!({ "deleted_at": now }))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                if !response.status().is_success() {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    return Err(format!("HTTP {}: {}", status, body));
                }
            }
            _ => {
                return Err(format!("Unknown action: {}", item.action));
            }
        }

        Ok(())
    }

    fn mark_item_synced(&self, db: &Database, id: i64) -> Result<(), String> {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE sync_queue SET synced = 1 WHERE id = ?", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn increment_item_attempts(&self, db: &Database, id: i64, error: &str) -> Result<(), String> {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?",
            rusqlite::params![error, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

// ============================================================
// TAURI COMMANDS FOR SYNC QUEUE
// ============================================================

#[tauri::command]
pub async fn process_sync_queue(
    app_state: tauri::State<'_, Arc<AppState>>,
    api_key: String,
) -> Result<SyncUploadResult, String> {
    let supabase_url = &app_state.config.supabase.url;
    let sync_manager = SyncManager::new(&api_key, supabase_url);
    sync_manager.process_sync_queue(&app_state.db).await
}

#[tauri::command]
pub async fn get_pending_sync_count(
    app_state: tauri::State<'_, Arc<AppState>>,
) -> Result<i64, String> {
    app_state.db.get_pending_sync_count().map_err(|e| e.to_string())
}
