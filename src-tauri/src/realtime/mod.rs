// Realtime Module for CentroVision EHR
// Implements PostgreSQL LISTEN/NOTIFY for local server realtime updates

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;
use tokio_postgres::{AsyncMessage, NoTls};

use crate::config::LocalServerConfig;

/// Payload sent to frontend when a database change is detected
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbChangeEvent {
    pub table: String,
    pub operation: String,
    pub id: Option<String>,
}

/// Realtime listener for PostgreSQL LISTEN/NOTIFY
pub struct RealtimeListener {
    config: LocalServerConfig,
    app_handle: AppHandle,
    shutdown_rx: watch::Receiver<bool>,
}

impl RealtimeListener {
    pub fn new(
        config: LocalServerConfig,
        app_handle: AppHandle,
        shutdown_rx: watch::Receiver<bool>,
    ) -> Self {
        Self {
            config,
            app_handle,
            shutdown_rx,
        }
    }

    /// Start listening for PostgreSQL notifications
    pub async fn start(&mut self) {
        log::info!("RealtimeListener: Starting LISTEN/NOTIFY listener");

        loop {
            // Check if we should shutdown
            if *self.shutdown_rx.borrow() {
                log::info!("RealtimeListener: Shutdown signal received");
                break;
            }

            // Try to connect and listen
            match self.connect_and_listen().await {
                Ok(()) => {
                    log::info!("RealtimeListener: Connection closed normally");
                }
                Err(e) => {
                    log::warn!("RealtimeListener: Connection error: {}. Retrying in 5 seconds...", e);
                }
            }

            // Wait before reconnecting (unless shutdown)
            tokio::select! {
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(5)) => {}
                _ = self.shutdown_rx.changed() => {
                    if *self.shutdown_rx.borrow() {
                        break;
                    }
                }
            }
        }

        log::info!("RealtimeListener: Stopped");
    }

    async fn connect_and_listen(&mut self) -> Result<(), String> {
        // Build connection string
        let conn_string = format!(
            "host={} port={} dbname={} user={} password={}",
            self.config.host,
            self.config.port,
            self.config.database,
            self.config.user,
            self.config.password
        );

        // Connect to PostgreSQL
        let (client, mut connection) = tokio_postgres::connect(&conn_string, NoTls)
            .await
            .map_err(|e| format!("Failed to connect: {}", e))?;

        log::info!("RealtimeListener: Connected to PostgreSQL at {}:{}",
            self.config.host, self.config.port);

        // Convert connection to a stream for notifications
        let mut stream = futures_util::stream::poll_fn(move |cx| connection.poll_message(cx));

        // Spawn connection handler that processes messages
        let app_handle = self.app_handle.clone();
        let mut shutdown_rx = self.shutdown_rx.clone();

        // Handle connection messages in a separate task
        let conn_handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    msg = stream.next() => {
                        match msg {
                            Some(Ok(msg)) => {
                                if let AsyncMessage::Notification(notification) = msg {
                                    log::debug!("RealtimeListener: Received notification on channel: {}",
                                        notification.channel());

                                    // Parse the payload (JSON from trigger)
                                    let event = parse_notification(&notification);

                                    // Emit to frontend
                                    if let Err(e) = app_handle.emit("db:change", &event) {
                                        log::warn!("RealtimeListener: Failed to emit event: {}", e);
                                    } else {
                                        log::debug!("RealtimeListener: Emitted db:change event: {:?}", event);
                                    }
                                }
                            }
                            Some(Err(e)) => {
                                log::error!("RealtimeListener: Connection error: {}", e);
                                break;
                            }
                            None => {
                                log::info!("RealtimeListener: Connection stream ended");
                                break;
                            }
                        }
                    }
                    _ = shutdown_rx.changed() => {
                        if *shutdown_rx.borrow() {
                            log::info!("RealtimeListener: Shutdown during connection");
                            break;
                        }
                    }
                }
            }
        });

        // Subscribe to channels
        let channels = vec![
            // Core tables
            "appointments_changes",
            "schedule_blocks_changes",
            "patients_changes",
            "encounters_changes",
            "invoices_changes",
            // CRM tables
            "crm_pipelines_changes",
            "crm_pipeline_stages_changes",
            "crm_activity_log_changes",
            "crm_pipeline_notes_changes",
            "crm_activity_read_changes",
        ];

        for channel in &channels {
            client
                .execute(&format!("LISTEN {}", channel), &[])
                .await
                .map_err(|e| format!("Failed to LISTEN on {}: {}", channel, e))?;
            log::info!("RealtimeListener: Listening on channel: {}", channel);
        }

        // Wait for connection task to finish (which happens on error or shutdown)
        let _ = conn_handle.await;

        Ok(())
    }
}

fn parse_notification(notification: &tokio_postgres::Notification) -> DbChangeEvent {
    // Try to parse JSON payload from trigger
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(notification.payload()) {
        DbChangeEvent {
            table: json["table"].as_str().unwrap_or("unknown").to_string(),
            operation: json["operation"].as_str().unwrap_or("unknown").to_string(),
            id: json["id"].as_str().map(|s| s.to_string()),
        }
    } else {
        // Fallback: extract table name from channel
        let channel = notification.channel();
        let table = channel.trim_end_matches("_changes").to_string();
        DbChangeEvent {
            table,
            operation: "unknown".to_string(),
            id: None,
        }
    }
}

/// Manager for the realtime listener
pub struct RealtimeManager {
    shutdown_tx: Option<watch::Sender<bool>>,
}

impl RealtimeManager {
    pub fn new() -> Self {
        Self { shutdown_tx: None }
    }

    /// Start the realtime listener for local PostgreSQL
    pub fn start(&mut self, config: LocalServerConfig, app_handle: AppHandle) {
        // Create shutdown channel
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        self.shutdown_tx = Some(shutdown_tx);

        // Spawn listener task
        let mut listener = RealtimeListener::new(config, app_handle, shutdown_rx);
        tauri::async_runtime::spawn(async move {
            listener.start().await;
        });

        log::info!("RealtimeManager: Started realtime listener");
    }

    /// Stop the realtime listener
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
            log::info!("RealtimeManager: Sent shutdown signal");
        }
    }

    /// Check if listener is running
    pub fn is_running(&self) -> bool {
        self.shutdown_tx.is_some()
    }
}

impl Default for RealtimeManager {
    fn default() -> Self {
        Self::new()
    }
}
