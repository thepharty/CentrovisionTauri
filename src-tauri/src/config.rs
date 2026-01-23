// Configuration management for CentroVision EHR
// Handles both Supabase (cloud) and local PostgreSQL server settings

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Main application configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AppConfig {
    pub supabase: SupabaseConfig,
    pub local_server: Option<LocalServerConfig>,
    pub local_storage: Option<LocalStorageConfig>,
}

/// Local file storage configuration (SMB share on clinic server)
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LocalStorageConfig {
    /// SMB path to the shared folder (e.g., \\\\192.168.0.9\\CentroVisionStorage)
    pub smb_path: String,
    /// Optional username for SMB authentication
    pub username: Option<String>,
    /// Optional password for SMB authentication
    pub password: Option<String>,
    /// Whether local storage is enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

/// Supabase cloud configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SupabaseConfig {
    pub url: String,
    pub anon_key: String,
}

/// Local PostgreSQL server configuration (clinic server)
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LocalServerConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    /// Whether to enable local server failover
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            supabase: SupabaseConfig {
                url: String::new(),
                anon_key: String::new(),
            },
            local_server: None,
            local_storage: None,
        }
    }
}

impl AppConfig {
    /// Load configuration from file
    /// Path: ~/.centrovision/config.toml
    pub fn load() -> Result<Self, String> {
        let config_path = Self::get_config_path()?;

        if !config_path.exists() {
            log::info!("No config file found at {:?}, using defaults (no local server)", config_path);
            return Ok(Self::default());
        }

        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;

        let config: AppConfig = toml::from_str(&content)
            .map_err(|e| format!("Failed to parse config file: {}", e))?;

        log::info!("Loaded config from {:?}", config_path);
        if config.local_server.is_some() {
            log::info!("Local server configured: {}:{}",
                config.local_server.as_ref().unwrap().host,
                config.local_server.as_ref().unwrap().port
            );
        }
        if config.local_storage.is_some() {
            log::info!("Local storage configured: {}",
                config.local_storage.as_ref().unwrap().smb_path
            );
        }

        Ok(config)
    }

    /// Get the config file path
    pub fn get_config_path() -> Result<PathBuf, String> {
        let home = dirs::home_dir()
            .ok_or_else(|| "Could not find home directory".to_string())?;
        Ok(home.join(".centrovision").join("config.toml"))
    }

    /// Create default config file if it doesn't exist
    pub fn create_default_if_missing() -> Result<(), String> {
        let config_path = Self::get_config_path()?;

        if config_path.exists() {
            return Ok(());
        }

        // Create directory
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        // Write default config with comments
        let default_config = r#"# CentroVision EHR Configuration
# This file configures the connection to Supabase and optional local server

[supabase]
# Your Supabase project URL
url = "https://your-project.supabase.co"
# Your Supabase anon/public key
anon_key = "your-anon-key"

# Optional: Local PostgreSQL server for offline operation
# Uncomment and configure when you have a server in the clinic
# [local_server]
# host = "192.168.1.100"  # IP of the server in your clinic
# port = 5432
# database = "centrovision"
# user = "centrovision_app"
# password = "your-secure-password"
# enabled = true

# Optional: Local file storage (SMB share) for offline file access
# Files are stored here when offline, then synced to Supabase Storage
# [local_storage]
# smb_path = "\\\\192.168.0.9\\CentroVisionStorage"
# username = "centrovision_service"  # Optional if using Everyone access
# password = "your-password"
# enabled = true
"#;

        std::fs::write(&config_path, default_config)
            .map_err(|e| format!("Failed to write default config: {}", e))?;

        log::info!("Created default config at {:?}", config_path);
        Ok(())
    }

    /// Check if local server is configured and enabled
    pub fn has_local_server(&self) -> bool {
        self.local_server
            .as_ref()
            .map(|s| s.enabled)
            .unwrap_or(false)
    }

    /// Check if local storage is configured and enabled
    pub fn has_local_storage(&self) -> bool {
        self.local_storage
            .as_ref()
            .map(|s| s.enabled)
            .unwrap_or(false)
    }

    /// Get the local storage SMB path if configured
    pub fn get_storage_path(&self) -> Option<&str> {
        self.local_storage
            .as_ref()
            .filter(|s| s.enabled)
            .map(|s| s.smb_path.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_config() {
        let toml_str = r#"
[supabase]
url = "https://test.supabase.co"
anon_key = "test-key"

[local_server]
host = "192.168.1.100"
port = 5432
database = "centrovision"
user = "app"
password = "pass"
"#;
        let config: AppConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.supabase.url, "https://test.supabase.co");
        assert!(config.local_server.is_some());
        assert_eq!(config.local_server.as_ref().unwrap().host, "192.168.1.100");
    }
}
