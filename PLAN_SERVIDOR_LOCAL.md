# Plan: Servidor de Respaldo Local para CentroVision EHR

## Objetivo

Mantener la app funcionando con normalidad cuando no hay internet, usando un servidor PostgreSQL físico en la clínica como respaldo automático de Supabase.

**NO es offline-first** - la app sigue funcionando normal con Supabase. El servidor local solo toma el control cuando no hay internet.

---

## Arquitectura

```
CON INTERNET (modo normal):
┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ PC Recepción     │────→│                 │     │                  │
│ PC Consultorio   │────→│    SUPABASE     │←───→│ Servidor Clínica │
│ PC Doctor        │────→│    (nube)       │     │ (sync background)│
└──────────────────┘     └─────────────────┘     └──────────────────┘

SIN INTERNET (failover automático):
┌──────────────────┐     ┌──────────────────┐
│ PC Recepción     │────→│                  │
│ PC Consultorio   │────→│ Servidor Clínica │
│ PC Doctor        │────→│ (PostgreSQL LAN) │
└──────────────────┘     └──────────────────┘

CUANDO VUELVE INTERNET:
Servidor Clínica ←──sync──→ Supabase (reconcilia cambios)
Apps vuelven automáticamente a usar Supabase
```

---

## Comportamiento Esperado

1. **Con internet:** Apps usan Supabase normalmente (como ahora)
2. **Servidor clínica:** Sincroniza con Supabase cada 30 segundos en background
3. **Sin internet:** Apps detectan automáticamente y cambian al servidor local
4. **Reconexión:** Servidor sincroniza cambios pendientes, apps vuelven a Supabase

---

## Componentes a Implementar

### 1. Backend Rust - Conexión Dual

**Nuevo archivo:** `src-tauri/src/postgres/mod.rs`

```rust
use deadpool_postgres::{Config, Pool, Runtime};
use tokio_postgres::NoTls;

pub struct PostgresPool {
    pool: Pool,
}

impl PostgresPool {
    pub async fn new(host: &str, port: u16, db: &str, user: &str, pass: &str) -> Result<Self, String> {
        let mut cfg = Config::new();
        cfg.host = Some(host.to_string());
        cfg.port = Some(port);
        cfg.dbname = Some(db.to_string());
        cfg.user = Some(user.to_string());
        cfg.password = Some(pass.to_string());

        let pool = cfg.create_pool(Some(Runtime::Tokio1), NoTls)
            .map_err(|e| format!("Failed to create pool: {}", e))?;

        Ok(Self { pool })
    }

    pub async fn health_check(&self) -> bool {
        match self.pool.get().await {
            Ok(client) => client.query("SELECT 1", &[]).await.is_ok(),
            Err(_) => false,
        }
    }
}
```

**Nuevo archivo:** `src-tauri/src/connection_manager.rs`

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;

pub enum ConnectionMode {
    Supabase,      // Normal - conectado a la nube
    LocalServer,   // Failover - usando servidor de clínica
    Offline,       // Sin conexión a ninguno
}

pub struct ConnectionManager {
    supabase_available: AtomicBool,
    local_available: AtomicBool,
    current_mode: RwLock<ConnectionMode>,
    local_pool: Option<PostgresPool>,
}

impl ConnectionManager {
    /// Determina qué conexión usar (prioridad: Supabase > Local > Offline)
    pub async fn get_active_connection(&self) -> ConnectionMode {
        if self.supabase_available.load(Ordering::SeqCst) {
            return ConnectionMode::Supabase;
        }
        if self.local_available.load(Ordering::SeqCst) {
            return ConnectionMode::LocalServer;
        }
        ConnectionMode::Offline
    }

    /// Health check cada 5 segundos
    pub async fn check_connections(&self) {
        // Check Supabase
        let supabase_ok = check_supabase_health().await;
        self.supabase_available.store(supabase_ok, Ordering::SeqCst);

        // Check local PostgreSQL
        if let Some(pool) = &self.local_pool {
            let local_ok = pool.health_check().await;
            self.local_available.store(local_ok, Ordering::SeqCst);
        }
    }
}
```

### 2. Configuración

**Nuevo archivo:** `src-tauri/src/config.rs`

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Deserialize, Serialize)]
pub struct AppConfig {
    pub supabase: SupabaseConfig,
    pub local_server: Option<LocalServerConfig>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SupabaseConfig {
    pub url: String,
    pub anon_key: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LocalServerConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
}

impl AppConfig {
    pub fn load() -> Result<Self, String> {
        let config_path = get_config_path()?;
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        toml::from_str(&content)
            .map_err(|e| format!("Failed to parse config: {}", e))
    }
}

fn get_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".centrovision").join("config.toml"))
}
```

**Archivo de configuración:** `~/.centrovision/config.toml`

```toml
[supabase]
url = "https://dlfgyupitvrqbxnucwsf.supabase.co"
anon_key = "eyJ..."

[local_server]
host = "192.168.1.100"  # IP del servidor en la clínica
port = 5432
database = "centrovision"
user = "centrovision_app"
password = "secure_password_here"
```

### 3. Modificar Comandos Existentes

**Modificar:** `src-tauri/src/commands/mod.rs`

Cada comando debe usar el ConnectionManager para decidir la fuente:

```rust
#[tauri::command]
pub async fn get_appointments(
    state: State<'_, AppState>,
    branch_id: String,
    date: String,
) -> Result<Vec<Appointment>, String> {
    let conn_manager = &state.connection_manager;

    match conn_manager.get_active_connection().await {
        ConnectionMode::Supabase => {
            // Usar Supabase REST API (como ahora)
            fetch_appointments_supabase(&state.supabase_client, &branch_id, &date).await
        }
        ConnectionMode::LocalServer => {
            // Usar PostgreSQL local
            fetch_appointments_postgres(&state.local_pool, &branch_id, &date).await
        }
        ConnectionMode::Offline => {
            // Usar SQLite local como último recurso
            fetch_appointments_sqlite(&state.db, &branch_id, &date).await
        }
    }
}
```

### 4. Nuevo Comando para Exponer Modo de Conexión

**Agregar a:** `src-tauri/src/commands/mod.rs`

```rust
#[derive(Serialize)]
pub struct ConnectionStatus {
    pub mode: String,           // "supabase", "local", "offline"
    pub supabase_available: bool,
    pub local_available: bool,
    pub local_server_ip: Option<String>,
}

#[tauri::command]
pub async fn get_connection_status(
    state: State<'_, AppState>,
) -> Result<ConnectionStatus, String> {
    let conn_manager = &state.connection_manager;

    let mode = match conn_manager.get_active_connection().await {
        ConnectionMode::Supabase => "supabase",
        ConnectionMode::LocalServer => "local",
        ConnectionMode::Offline => "offline",
    };

    Ok(ConnectionStatus {
        mode: mode.to_string(),
        supabase_available: conn_manager.supabase_available.load(Ordering::SeqCst),
        local_available: conn_manager.local_available.load(Ordering::SeqCst),
        local_server_ip: state.config.local_server.as_ref().map(|s| s.host.clone()),
    })
}
```

### 5. Actualizar SyncIndicator

**Modificar:** `src/components/SyncIndicator.tsx`

```tsx
import { Wifi, WifiOff, RefreshCw, Cloud, Server } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { isTauri } from '@/lib/dataSource';
// ... imports existentes

export function SyncIndicator() {
  const { isOnline, syncStatus, isSyncing, connectionMode } = useNetworkStatus();

  if (!isTauri()) {
    return null;
  }

  const pendingChanges = syncStatus?.pending_changes ?? 0;
  const lastSync = syncStatus?.last_sync;

  const getStatusIcon = () => {
    if (isSyncing) {
      return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
    }

    // Nuevo: mostrar modo de conexión
    switch (connectionMode) {
      case 'supabase':
        return <Cloud className="h-4 w-4 text-green-500" />;  // Nube
      case 'local':
        return <Server className="h-4 w-4 text-yellow-500" />; // Servidor local
      case 'offline':
      default:
        return <WifiOff className="h-4 w-4 text-red-500" />;
    }
  };

  const getTooltipText = () => {
    if (isSyncing) {
      return 'Sincronizando...';
    }

    switch (connectionMode) {
      case 'supabase':
        return pendingChanges > 0
          ? `Nube (${pendingChanges} pendientes)`
          : 'Conectado a la nube';
      case 'local':
        return `Servidor local${pendingChanges > 0 ? ` (${pendingChanges} pendientes)` : ''}`;
      case 'offline':
      default:
        return `Sin conexión${pendingChanges > 0 ? ` (${pendingChanges} pendientes)` : ''}`;
    }
  };

  // ... resto del componente
}
```

### 6. Actualizar Hook de Network Status

**Modificar:** `src/hooks/useNetworkStatus.tsx`

```tsx
// Agregar al estado
const [connectionMode, setConnectionMode] = useState<'supabase' | 'local' | 'offline'>('supabase');

// En refreshStatus, agregar:
const refreshStatus = useCallback(async () => {
  try {
    if (isTauri()) {
      const online = await checkNetworkStatus();
      const status = await getSyncStatus();

      // Nuevo: obtener modo de conexión
      const connStatus = await invokeCommand<ConnectionStatus>('get_connection_status');
      setConnectionMode(connStatus.mode as 'supabase' | 'local' | 'offline');

      setIsOnline(online);
      setSyncStatus(status);
    }
  } catch (error) {
    console.error('Failed to refresh network status:', error);
  }
}, []);

// Exponer en el contexto
return (
  <NetworkStatusContext.Provider value={{
    isOnline,
    syncStatus,
    isSyncing,
    connectionMode,  // Nuevo
    triggerSync,
    refreshStatus
  }}>
    {children}
  </NetworkStatusContext.Provider>
);
```

---

## Servicio de Sincronización (corre en el servidor)

Este es un **programa separado** que corre en el servidor de la clínica.

### Estructura del Proyecto

```
centrovision-sync-service/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── config.rs
│   ├── supabase.rs       # Cliente REST para Supabase
│   ├── postgres.rs       # Cliente para PostgreSQL local
│   └── sync.rs           # Lógica de sincronización
└── config.toml
```

### Lógica de Sincronización

```rust
// src/sync.rs

pub struct SyncEngine {
    supabase: SupabaseClient,
    postgres: PostgresPool,
}

impl SyncEngine {
    /// Sincroniza Supabase → PostgreSQL local
    pub async fn sync_down(&self) -> Result<SyncResult, String> {
        let tables = vec![
            "branches", "rooms", "profiles", "user_roles", "user_branches",
            "patients", "appointments", "encounters", "exam_eye", "diagnoses",
            // ... todas las tablas
        ];

        for table in tables {
            let last_sync = self.get_last_sync_time(table).await?;
            let records = self.supabase
                .fetch_updated_since(table, last_sync)
                .await?;

            for record in records {
                self.postgres.upsert(table, &record).await?;
            }

            self.update_last_sync_time(table).await?;
        }

        Ok(SyncResult::success())
    }

    /// Sincroniza PostgreSQL local → Supabase
    pub async fn sync_up(&self) -> Result<SyncResult, String> {
        // Obtener cambios pendientes del log local
        let pending = self.postgres
            .query("SELECT * FROM _sync_log WHERE synced_to_supabase = FALSE ORDER BY created_at")
            .await?;

        for change in pending {
            match change.action.as_str() {
                "INSERT" => self.supabase.insert(&change.table_name, &change.data).await?,
                "UPDATE" => self.supabase.update(&change.table_name, &change.record_id, &change.data).await?,
                "DELETE" => self.supabase.delete(&change.table_name, &change.record_id).await?,
                _ => {}
            }

            // Marcar como sincronizado
            self.postgres.execute(
                "UPDATE _sync_log SET synced_to_supabase = TRUE, synced_at = NOW() WHERE id = $1",
                &[&change.id]
            ).await?;
        }

        Ok(SyncResult::success())
    }
}
```

### Tablas de Control en PostgreSQL Local

```sql
-- Agregar al esquema local

-- Registro de última sincronización por tabla
CREATE TABLE _sync_metadata (
    table_name VARCHAR(100) PRIMARY KEY,
    last_sync_down TIMESTAMPTZ,
    last_sync_up TIMESTAMPTZ,
    record_count INTEGER DEFAULT 0
);

-- Log de cambios locales pendientes de subir
CREATE TABLE _sync_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,  -- INSERT, UPDATE, DELETE
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_to_supabase BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ,
    error_message TEXT
);

-- Trigger genérico para capturar cambios
CREATE OR REPLACE FUNCTION log_table_changes() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO _sync_log (table_name, record_id, action, data)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD));
        RETURN OLD;
    ELSE
        INSERT INTO _sync_log (table_name, record_id, action, data)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW));
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas principales
CREATE TRIGGER log_patients_changes
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION log_table_changes();

CREATE TRIGGER log_appointments_changes
    AFTER INSERT OR UPDATE OR DELETE ON appointments
    FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- ... repetir para cada tabla que necesite sync
```

---

## Pasos de Implementación

### Fase 1: Setup de Desarrollo (tu Mac)

```bash
# 1. Instalar PostgreSQL
brew install postgresql@16
brew services start postgresql@16

# 2. Crear base de datos
createdb centrovision_local

# 3. Ejecutar migración
psql centrovision_local < MIGRACION_CONSOLIDADA.sql

# 4. Agregar tablas de sync
psql centrovision_local < sync_tables.sql  # (crear este archivo)

# 5. Crear usuario de app
psql centrovision_local << 'EOF'
CREATE USER centrovision_app WITH PASSWORD 'dev_password';
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO centrovision_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO centrovision_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO centrovision_app;
EOF

# 6. Configurar la app
mkdir -p ~/.centrovision
cat > ~/.centrovision/config.toml << 'EOF'
[supabase]
url = "https://dlfgyupitvrqbxnucwsf.supabase.co"
anon_key = "tu-anon-key-aqui"

[local_server]
host = "localhost"
port = 5432
database = "centrovision_local"
user = "centrovision_app"
password = "dev_password"
EOF
```

### Fase 2: Backend Rust

1. [ ] Agregar dependencias a `src-tauri/Cargo.toml`:
   ```toml
   tokio-postgres = "0.7"
   deadpool-postgres = "0.12"
   toml = "0.8"
   dirs = "5.0"
   ```

2. [ ] Crear `src-tauri/src/postgres/mod.rs`
3. [ ] Crear `src-tauri/src/config.rs`
4. [ ] Crear `src-tauri/src/connection_manager.rs`
5. [ ] Modificar `src-tauri/src/lib.rs` para inicializar ConnectionManager
6. [ ] Agregar comando `get_connection_status`
7. [ ] Modificar comandos existentes para usar conexión dual

### Fase 3: Frontend

8. [ ] Actualizar `src/hooks/useNetworkStatus.tsx` con connectionMode
9. [ ] Actualizar `src/components/SyncIndicator.tsx` con iconos por modo
10. [ ] Agregar tipo ConnectionStatus a `src/lib/dataSource.ts`

### Fase 4: Servicio de Sincronización

11. [ ] Crear proyecto `centrovision-sync-service/`
12. [ ] Implementar cliente Supabase REST
13. [ ] Implementar sync bidireccional
14. [ ] Crear script de instalación como servicio

### Fase 5: Testing

15. [ ] Probar con PostgreSQL local en Mac
16. [ ] Simular pérdida de internet (desconectar WiFi)
17. [ ] Verificar failover automático
18. [ ] Verificar sincronización al reconectar
19. [ ] Probar conflictos (editar mismo registro en ambos lados)

### Fase 6: Producción

20. [ ] Documentar setup del servidor de clínica
21. [ ] Crear script de instalación automatizado
22. [ ] Configurar backups automáticos del PostgreSQL local

---

## Setup para Producción (Clínica)

### Hardware Recomendado

- **Mini PC** (Intel NUC, Beelink, o similar)
  - CPU: Intel i3 o superior
  - RAM: 8GB mínimo
  - Storage: 256GB SSD
  - Red: Puerto Ethernet Gigabit

- **Alternativas:**
  - Mac Mini (si tienes uno viejo)
  - Raspberry Pi 4 (8GB) - más económico pero más lento
  - PC vieja reciclada

### Instalación Rápida (Script Automático)

```bash
# En el servidor de la clínica, ejecutar:
cd /ruta/a/CentroVision\ Tauri/scripts
sudo ./setup-server.sh
```

El script:
1. Instala PostgreSQL 16
2. Crea la base de datos `centrovision`
3. Crea el usuario `centrovision_app`
4. Configura PostgreSQL para aceptar conexiones de la red local
5. Importa el esquema de la base de datos
6. Genera el archivo de configuración para las PCs cliente

### Software del Servidor (Manual)

```bash
# Ubuntu Server 22.04 LTS

# Instalar PostgreSQL
sudo apt update
sudo apt install postgresql-16 postgresql-contrib-16

# Configurar para aceptar conexiones LAN
sudo nano /etc/postgresql/16/main/postgresql.conf
# Cambiar: listen_addresses = '*'

sudo nano /etc/postgresql/16/main/pg_hba.conf
# Agregar: host all centrovision_app 192.168.1.0/24 md5

sudo systemctl restart postgresql

# Crear base de datos
sudo -u postgres createdb centrovision
sudo -u postgres psql -c "CREATE USER centrovision_app WITH PASSWORD 'secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE centrovision TO centrovision_app;"

# Importar esquema
sudo -u postgres psql centrovision < MIGRACION_CONSOLIDADA.sql
sudo -u postgres psql centrovision < sync_tables.sql

# Instalar servicio de sync (después de compilarlo)
sudo cp centrovision-sync-service /usr/local/bin/
sudo cp centrovision-sync.service /etc/systemd/system/
sudo systemctl enable centrovision-sync
sudo systemctl start centrovision-sync
```

### Configuración de Red

- **IP estática** en el servidor: `192.168.1.100` (o la que uses)
- **Puerto 5432** abierto solo en LAN (no exponer a internet)
- **Firewall:**
  ```bash
  sudo ufw allow from 192.168.1.0/24 to any port 5432
  sudo ufw enable
  ```

---

## Verificación

### Test 1: Conexión Normal (con internet)

1. Abrir app
2. Verificar icono de nube (☁️) en SyncIndicator
3. Crear una cita
4. Verificar en dashboard de Supabase que aparece

### Test 2: Failover (sin internet)

1. Desconectar WiFi/Ethernet
2. Esperar 5-10 segundos
3. Verificar icono cambia a servidor (🖥️)
4. Crear una cita
5. Verificar en PostgreSQL local: `psql -c "SELECT * FROM appointments ORDER BY created_at DESC LIMIT 1;"`

### Test 3: Reconexión

1. Reconectar internet
2. Esperar sincronización (máx 30 segundos)
3. Verificar icono vuelve a nube (☁️)
4. Verificar cita creada offline aparece en Supabase

### Test 4: Sin ninguna conexión

1. Desconectar internet
2. Apagar servidor local
3. Verificar icono de sin conexión (❌)
4. App debe seguir funcionando con SQLite local

---

## Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src-tauri/Cargo.toml` | Modificar | Agregar dependencias PostgreSQL |
| `src-tauri/src/postgres/mod.rs` | Crear | Cliente PostgreSQL |
| `src-tauri/src/config.rs` | Crear | Manejo de configuración |
| `src-tauri/src/connection_manager.rs` | Crear | Lógica de failover |
| `src-tauri/src/lib.rs` | Modificar | Inicialización |
| `src-tauri/src/commands/mod.rs` | Modificar | Usar conexión dual |
| `src/hooks/useNetworkStatus.tsx` | Modificar | Exponer connectionMode |
| `src/components/SyncIndicator.tsx` | Modificar | Iconos por modo |
| `src/lib/dataSource.ts` | Modificar | Tipos nuevos |
| `sync_tables.sql` | Crear | Tablas de control de sync |
| `centrovision-sync-service/` | Crear | Proyecto del servicio |
| `~/.centrovision/config.toml` | Crear | Configuración local |

---

## Manejo de Conflictos

Estrategia: **Last-Write-Wins con timestamp**

1. Cada registro tiene `updated_at`
2. Al sincronizar, el registro más reciente gana
3. Los conflictos se registran en `_sync_log` con `error_message`
4. Dashboard opcional para revisar conflictos (futuro)

Para casos críticos (ej: dos doctores editando el mismo encuentro):
- El servicio de sync detecta el conflicto
- Guarda ambas versiones en una tabla `_conflicts`
- Notifica para resolución manual (futuro)
