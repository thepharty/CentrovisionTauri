// Connection Manager for CentroVision EHR
// Handles automatic failover between Supabase (cloud) and local PostgreSQL server

use crate::config::AppConfig;
use crate::postgres::PostgresPool;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Current connection mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionMode {
    /// Connected to Supabase (cloud) - normal operation
    Supabase,
    /// Connected to local PostgreSQL server (clinic) - failover mode
    Local,
    /// No connection available - offline mode (uses SQLite cache)
    Offline,
}

impl std::fmt::Display for ConnectionMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConnectionMode::Supabase => write!(f, "supabase"),
            ConnectionMode::Local => write!(f, "local"),
            ConnectionMode::Offline => write!(f, "offline"),
        }
    }
}

/// Connection status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    /// Current active connection mode
    pub mode: String,
    /// Whether Supabase is reachable
    pub supabase_available: bool,
    /// Whether local PostgreSQL server is reachable
    pub local_available: bool,
    /// IP address of local server (if configured)
    pub local_server_ip: Option<String>,
    /// Description of current state
    pub description: String,
}

/// Manages connections to Supabase and local PostgreSQL
pub struct ConnectionManager {
    /// Whether Supabase is currently available
    supabase_available: AtomicBool,
    /// Whether local PostgreSQL is currently available
    local_available: AtomicBool,
    /// Current connection mode
    current_mode: RwLock<ConnectionMode>,
    /// PostgreSQL connection pool (if configured)
    pub postgres_pool: Option<Arc<PostgresPool>>,
    /// App configuration
    config: AppConfig,
    /// Supabase URL for health checks
    supabase_url: String,
}

impl ConnectionManager {
    /// Create a new connection manager
    pub async fn new(config: AppConfig) -> Result<Self, String> {
        let supabase_url = config.supabase.url.clone();

        // Initialize PostgreSQL pool if local server is configured
        let postgres_pool = if let Some(ref local_config) = config.local_server {
            if local_config.enabled {
                match PostgresPool::new(local_config).await {
                    Ok(pool) => {
                        log::info!("PostgreSQL pool initialized for local server");
                        Some(Arc::new(pool))
                    }
                    Err(e) => {
                        log::warn!("Failed to initialize PostgreSQL pool: {}", e);
                        None
                    }
                }
            } else {
                log::info!("Local server is disabled in config");
                None
            }
        } else {
            log::info!("No local server configured");
            None
        };

        let manager = Self {
            supabase_available: AtomicBool::new(true), // Assume available initially
            local_available: AtomicBool::new(false),
            current_mode: RwLock::new(ConnectionMode::Supabase),
            postgres_pool,
            config,
            supabase_url,
        };

        // Skip initial blocking check - let background task handle it
        // This allows slow devices to start the app immediately
        // The background task in lib.rs runs every 10s to verify connection

        Ok(manager)
    }

    /// Get the current connection mode
    pub async fn get_mode(&self) -> ConnectionMode {
        *self.current_mode.read().await
    }

    /// Get detailed connection status
    pub async fn get_status(&self) -> ConnectionStatus {
        let mode = self.get_mode().await;
        let supabase_available = self.supabase_available.load(Ordering::SeqCst);
        let local_available = self.local_available.load(Ordering::SeqCst);

        let local_server_ip = self.config.local_server.as_ref().map(|s| {
            format!("{}:{}", s.host, s.port)
        });

        let description = match mode {
            ConnectionMode::Supabase => "Conectado a la nube".to_string(),
            ConnectionMode::Local => format!(
                "Usando servidor local ({})",
                local_server_ip.as_deref().unwrap_or("unknown")
            ),
            ConnectionMode::Offline => "Sin conexión - usando caché local".to_string(),
        };

        ConnectionStatus {
            mode: mode.to_string(),
            supabase_available,
            local_available,
            local_server_ip,
            description,
        }
    }

    /// Check health of all connections and update status
    pub async fn check_connections(&self) {
        // Check Supabase
        let supabase_ok = self.check_supabase().await;
        self.supabase_available.store(supabase_ok, Ordering::SeqCst);

        // Check local PostgreSQL
        let local_ok = if let Some(ref pool) = self.postgres_pool {
            let result = pool.health_check().await;
            log::info!("[HealthCheck] Local PostgreSQL: {}", if result { "available" } else { "unavailable" });
            result
        } else {
            false
        };
        self.local_available.store(local_ok, Ordering::SeqCst);

        // Determine best connection mode
        let new_mode = if supabase_ok {
            ConnectionMode::Supabase
        } else if local_ok {
            ConnectionMode::Local
        } else {
            ConnectionMode::Offline
        };

        // Update mode if changed
        let mut current = self.current_mode.write().await;
        if *current != new_mode {
            log::warn!("[HealthCheck] CONNECTION MODE CHANGED: {:?} -> {:?} (supabase={}, local={})",
                *current, new_mode, supabase_ok, local_ok);
            *current = new_mode;
        }
    }

    /// Check if Supabase is reachable
    async fn check_supabase(&self) -> bool {
        if self.supabase_url.is_empty() {
            log::warn!("[HealthCheck] Supabase URL is empty - cannot check");
            return false;
        }

        // Try to reach Supabase health endpoint
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build();

        let client = match client {
            Ok(c) => c,
            Err(e) => {
                log::error!("[HealthCheck] Failed to create HTTP client: {}", e);
                return false;
            }
        };

        // Just check if we can reach the Supabase URL
        let health_url = format!("{}/rest/v1/", self.supabase_url);
        log::info!("[HealthCheck] Checking Supabase at: {}", health_url);

        match client.get(&health_url)
            .header("apikey", &self.config.supabase.anon_key)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                // Any response (even 400) means the server is reachable
                let is_reachable = status.as_u16() < 500;
                if is_reachable {
                    log::info!("[HealthCheck] Supabase reachable (HTTP {})", status);
                } else {
                    log::warn!("[HealthCheck] Supabase returned server error: HTTP {}", status);
                }
                is_reachable
            }
            Err(e) => {
                // Detailed error diagnosis
                if e.is_timeout() {
                    log::error!("[HealthCheck] TIMEOUT connecting to Supabase (>10s) - possible slow network or firewall");
                } else if e.is_connect() {
                    log::error!("[HealthCheck] CONNECTION REFUSED to Supabase - possible firewall or DNS issue");
                } else if e.is_request() {
                    log::error!("[HealthCheck] REQUEST ERROR to Supabase: {} - possible TLS/certificate issue", e);
                } else {
                    log::error!("[HealthCheck] UNKNOWN ERROR reaching Supabase: {}", e);
                }
                false
            }
        }
    }

    /// Check if Supabase is currently available
    pub fn is_supabase_available(&self) -> bool {
        self.supabase_available.load(Ordering::SeqCst)
    }

    /// Check if local PostgreSQL is currently available
    pub fn is_local_available(&self) -> bool {
        self.local_available.load(Ordering::SeqCst)
    }

    /// Get the PostgreSQL pool if available
    /// Returns the pool if it exists, regardless of connection mode
    /// This allows using local PostgreSQL when configured, even if Supabase is available
    pub async fn get_postgres_pool(&self) -> Option<Arc<PostgresPool>> {
        let pool = self.postgres_pool.clone();
        log::info!("get_postgres_pool: pool exists = {}", pool.is_some());
        pool
    }

    /// Check if we should use local PostgreSQL for this operation
    pub async fn should_use_local(&self) -> bool {
        let mode = self.get_mode().await;
        mode == ConnectionMode::Local && self.postgres_pool.is_some()
    }

    /// Check if we have any connection (not offline)
    pub async fn has_connection(&self) -> bool {
        let mode = self.get_mode().await;
        mode != ConnectionMode::Offline
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_mode_display() {
        assert_eq!(ConnectionMode::Supabase.to_string(), "supabase");
        assert_eq!(ConnectionMode::Local.to_string(), "local");
        assert_eq!(ConnectionMode::Offline.to_string(), "offline");
    }
}
