// CentroVision EHR - Tauri Backend
// Supports dual connection: Supabase (cloud) and local PostgreSQL server

pub mod db;
pub mod commands;
pub mod sync;
pub mod auth;
pub mod config;
pub mod postgres;
pub mod connection_manager;
pub mod realtime;

use db::Database;
use config::AppConfig;
use connection_manager::ConnectionManager;
use realtime::RealtimeManager;
use tauri::Manager;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Application state shared across all commands
pub struct AppState {
    pub db: Arc<Database>,
    pub connection_manager: Arc<ConnectionManager>,
    pub config: AppConfig,
    pub realtime_manager: RwLock<RealtimeManager>,
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

            // Initialize realtime manager
            let mut realtime_manager = RealtimeManager::new();

            // Start realtime listener if local server is configured and enabled
            if let Some(ref local_config) = config.local_server {
                if local_config.enabled {
                    log::info!("Starting realtime listener for local PostgreSQL");
                    realtime_manager.start(local_config.clone(), app.handle().clone());
                }
            }

            // Wrap database in Arc for sharing
            let db = Arc::new(db);

            // Manage full app state
            let app_state = AppState {
                db: db.clone(),
                connection_manager,
                config,
                realtime_manager: RwLock::new(realtime_manager),
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
        .plugin(tauri_plugin_stt::init())
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
            // Encounters (expedientes médicos)
            commands::get_encounter_by_id,
            commands::get_encounters_by_patient,
            commands::get_encounter_by_appointment,
            commands::create_encounter,
            commands::update_encounter,
            // Exam Eye (exámenes oculares)
            commands::get_exam_eye,
            commands::get_exam_eyes_by_encounter,
            commands::upsert_exam_eye,
            // Studies (estudios)
            commands::get_studies_by_appointment,
            commands::get_studies_by_patient,
            commands::create_study,
            commands::update_study_status,
            // Surgeries (cirugías)
            commands::get_surgeries_by_appointment,
            commands::get_surgeries_by_patient,
            commands::create_surgery,
            commands::update_surgery,
            commands::delete_surgery,
            // Procedures (procedimientos)
            commands::get_procedures_by_appointment,
            commands::get_procedures_by_patient,
            commands::create_procedure,
            commands::update_procedure,
            // Diagnoses (diagnósticos)
            commands::get_diagnoses_by_encounter,
            commands::create_diagnosis,
            commands::update_diagnosis,
            commands::delete_diagnosis,
            // Invoices (facturas)
            commands::get_invoices_by_patient,
            commands::get_invoices_by_branch_and_date,
            commands::get_invoice_by_id,
            commands::create_invoice,
            commands::update_invoice_status,
            commands::get_invoice_items,
            // Payments (pagos)
            commands::get_payments_by_invoice,
            commands::get_payments_by_date_range,
            commands::create_payment,
            commands::delete_payment,
            // Service prices (precios de servicios)
            commands::get_service_prices,
            commands::create_service_price,
            commands::update_service_price,
            // Inventory (inventario)
            commands::get_inventory_items,
            commands::create_inventory_item,
            commands::update_inventory_item,
            commands::get_suppliers,
            // CRM pipelines
            commands::get_crm_pipelines,
            commands::get_crm_pipeline_by_id,
            commands::create_crm_pipeline,
            commands::update_crm_pipeline_stage,
            commands::get_crm_pipeline_stages,
            commands::get_crm_pipeline_notes,
            commands::create_crm_pipeline_note,
            commands::get_crm_procedure_types,
            // Schedule blocks (bloques de horario)
            commands::get_schedule_blocks,
            commands::create_schedule_block,
            commands::delete_schedule_block,
            // Clinical types (tipos clínicos)
            commands::get_surgery_types,
            commands::get_study_types,
            commands::get_procedure_types,
            // Referring doctors (médicos referidores)
            commands::get_referring_doctors,
            commands::create_referring_doctor,
            // Sync pending count (Phase 21)
            commands::get_sync_pending_count,
            commands::get_sync_pending_details,
            // Local storage commands (Phase 22)
            commands::upload_file_to_local_storage,
            commands::read_file_from_local_storage,
            commands::get_local_storage_status,
            commands::list_local_storage_files,
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
