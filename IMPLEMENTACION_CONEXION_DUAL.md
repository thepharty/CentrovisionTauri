# Implementación de Conexión Dual en Tauri

## Estado Actual: 90% Implementado

La infraestructura para conexión dual (Supabase + PostgreSQL local) **ya existe** en el código de Tauri. Este documento detalla qué está listo y qué falta completar.

---

## Arquitectura Actual

```
┌─────────────────────────────────────┐
│      React Frontend (Web/Tauri)     │
│                                     │
│  useBranch, useNetworkStatus, etc   │
└──────────────┬──────────────────────┘
               │
               │ invokeCommand()
               │
┌──────────────▼──────────────────────┐
│     Tauri Commands Layer            │
│                                     │
│  get_branches, create_patient, etc  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     ConnectionManager               │
│  (Decide: Supabase, Local, Offline) │
└──┬───────────────────────────────┬──┘
   │                               │
   ▼                               ▼
PostgreSQL Pool              SQLite Cache
(Servidor Local)             (Fallback Offline)
```

---

## Archivos Existentes

### 1. `src-tauri/src/postgres/mod.rs` - Cliente PostgreSQL Local

**Estado: COMPLETO**

```rust
// Ya implementado:
pub struct PostgresPool {
    pool: Pool,
}

impl PostgresPool {
    pub async fn new(config: &Config) -> Result<Self, String>
    pub async fn health_check(&self) -> bool

    // Operaciones de lectura (COMPLETAS):
    pub async fn get_branches(&self) -> Result<Vec<Branch>, String>
    pub async fn get_rooms(&self, branch_id: &str) -> Result<Vec<Room>, String>
    pub async fn get_patients(&self, search: Option<&str>) -> Result<Vec<Patient>, String>
    pub async fn get_patient(&self, id: &str) -> Result<Option<Patient>, String>
    pub async fn get_appointments(&self, params) -> Result<Vec<Appointment>, String>
    pub async fn get_doctors(&self, branch_id: &str) -> Result<Vec<Doctor>, String>
    pub async fn get_user_role(&self, user_id: &str) -> Result<Option<String>, String>
}
```

### 2. `src-tauri/src/connection_manager.rs` - Gestor de Conexiones

**Estado: COMPLETO**

```rust
// Modos de conexión
pub enum ConnectionMode {
    Supabase,  // Internet disponible, usar Supabase
    Local,     // Sin internet, usar servidor local
    Offline,   // Sin conexión a ninguno, usar SQLite cache
}

pub struct ConnectionManager {
    supabase_available: AtomicBool,
    local_available: AtomicBool,
    postgres_pool: Option<PostgresPool>,
    config: Config,
}

// Métodos implementados:
impl ConnectionManager {
    pub fn get_mode(&self) -> ConnectionMode        // Obtener modo actual
    pub fn get_status(&self) -> ConnectionStatus    // Estado detallado para frontend
    pub async fn check_connections(&self)           // Health check cada 10 seg
    pub fn should_use_local(&self) -> bool          // Lógica de decisión
    pub fn has_connection(&self) -> bool            // ¿Hay alguna conexión?
    pub fn get_postgres_pool(&self) -> Option<&PostgresPool>
}
```

### 3. `src-tauri/src/config.rs` - Configuración

**Estado: COMPLETO**

```rust
// Lee: ~/.centrovision/config.toml

#[derive(Deserialize)]
pub struct Config {
    pub supabase: SupabaseConfig,
    pub local_server: Option<LocalServerConfig>,
}

#[derive(Deserialize)]
pub struct LocalServerConfig {
    pub host: String,      // "192.168.1.100"
    pub port: u16,         // 5432
    pub database: String,  // "centrovision"
    pub user: String,      // "centrovision_app"
    pub password: String,  // "..."
    pub enabled: bool,     // true/false
}
```

**Archivo de configuración generado automáticamente:**
```toml
# ~/.centrovision/config.toml

[supabase]
url = "https://xxx.supabase.co"
anon_key = "eyJ..."

[local_server]
enabled = true
host = "192.168.1.100"
port = 5432
database = "centrovision"
user = "centrovision_app"
password = "tu_contraseña"
```

### 4. `src-tauri/src/lib.rs` - Inicialización

**Estado: COMPLETO**

```rust
// Health check automático cada 10 segundos
let check_interval = Duration::from_secs(10);

tauri::async_runtime::spawn(async move {
    loop {
        connection_manager.check_connections().await;
        tokio::time::sleep(check_interval).await;
    }
});
```

### 5. Dependencias en `src-tauri/Cargo.toml`

**Estado: COMPLETO**

```toml
[dependencies]
# PostgreSQL
tokio-postgres = "0.7"
deadpool-postgres = "0.14"
postgres-types = "0.2"

# Configuración
toml = "0.8"
dirs = "5.0"

# HTTP para health checks
reqwest = "0.12"
```

---

## Lo Que Falta Implementar (10%)

### 1. Operaciones de ESCRITURA en PostgreSQL Local

**Archivo:** `src-tauri/src/commands/mod.rs`

**Problema actual:** Los comandos de escritura (`create_patient`, `update_patient`, `create_appointment`, etc.) NO escriben al PostgreSQL local. Solo leen de él, pero las escrituras van a SQLite + cola de sync.

**Solución:** Modificar cada comando de escritura para que, cuando `connection_mode == Local`, escriba directamente al PostgreSQL local.

```rust
// ACTUAL (incompleto):
#[tauri::command]
pub async fn create_patient(...) -> Result<Patient, String> {
    // Solo guarda en SQLite y encola para Supabase
    // NO escribe al PostgreSQL local
}

// NECESARIO:
#[tauri::command]
pub async fn create_patient(
    state: State<'_, AppState>,
    patient_data: PatientInput,
) -> Result<Patient, String> {
    let conn_manager = &state.connection_manager;

    match conn_manager.get_mode() {
        ConnectionMode::Supabase => {
            // Usar Supabase directamente (ya implementado en frontend)
            // O encolar para sync
        }
        ConnectionMode::Local => {
            // NUEVO: Escribir directamente a PostgreSQL local
            if let Some(pool) = conn_manager.get_postgres_pool() {
                return pool.create_patient(&patient_data).await;
            }
        }
        ConnectionMode::Offline => {
            // Guardar en SQLite y encolar
        }
    }
}
```

**Métodos de escritura que faltan en `postgres/mod.rs`:**

```rust
impl PostgresPool {
    // AGREGAR estos métodos:
    pub async fn create_patient(&self, data: &PatientInput) -> Result<Patient, String>
    pub async fn update_patient(&self, id: &str, data: &PatientInput) -> Result<Patient, String>
    pub async fn create_appointment(&self, data: &AppointmentInput) -> Result<Appointment, String>
    pub async fn update_appointment(&self, id: &str, data: &AppointmentInput) -> Result<Appointment, String>
    pub async fn delete_appointment(&self, id: &str) -> Result<(), String>
}
```

### 2. Cola de Sincronización Inteligente

**Problema actual:** Todas las escrituras crean entradas en la cola de sync, incluso cuando estamos en modo Local.

**Solución:** No encolar cuando `connection_mode == Local`, porque el servidor de sync se encarga de sincronizar PostgreSQL ↔ Supabase.

```rust
// En commands/mod.rs, después de cada escritura:

fn should_queue_for_sync(conn_manager: &ConnectionManager) -> bool {
    match conn_manager.get_mode() {
        ConnectionMode::Local => false,    // El sync service lo maneja
        ConnectionMode::Offline => true,   // Guardar para cuando haya conexión
        ConnectionMode::Supabase => false, // Ya está en Supabase
    }
}
```

### 3. UI de Estado de Conexión ✅ YA IMPLEMENTADO

**Archivos:**
- `src/components/SyncIndicator.tsx`
- `src/hooks/useNetworkStatus.tsx`

**Estado: COMPLETO** - La UI ya está completamente implementada con los tres modos de conexión:

```tsx
// YA IMPLEMENTADO en SyncIndicator.tsx:
const getStatusIcon = () => {
  if (isSyncing) {
    return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
  }
  switch (connectionMode) {
    case 'supabase':
      return <Cloud className="h-4 w-4 text-green-500" />;  // ☁️ Verde = Nube
    case 'local':
      return <Server className="h-4 w-4 text-yellow-500" />; // 🖥️ Amarillo = Local
    case 'offline':
    default:
      return <WifiOff className="h-4 w-4 text-red-500" />;   // ❌ Rojo = Sin conexión
  }
};
```

**Características implementadas:**
- Icono de nube verde cuando usa Supabase
- Icono de servidor amarillo cuando usa PostgreSQL local
- Icono de wifi-off rojo cuando no hay conexión
- Animación de sincronización cuando está procesando
- Tooltip con detalles del estado de conexión
- Auto-refresh cada 30 segundos
- Auto-sync cuando vuelve la conexión

---

## Pasos Para Completar la Implementación

> **Nota:** Solo quedan 2 pasos - la UI ya está implementada.

### Paso 1: Agregar métodos de escritura a PostgresPool

```rust
// src-tauri/src/postgres/mod.rs

impl PostgresPool {
    pub async fn create_patient(&self, data: &PatientInput) -> Result<Patient, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let row = client.query_one(
            r#"
            INSERT INTO patients (id, first_name, last_name, email, phone, ...)
            VALUES ($1, $2, $3, $4, $5, ...)
            RETURNING *
            "#,
            &[&uuid::Uuid::new_v4().to_string(), &data.first_name, ...]
        ).await.map_err(|e| e.to_string())?;

        Ok(Patient::from_row(&row))
    }

    // Similar para update_patient, create_appointment, etc.
}
```

### Paso 2: Modificar comandos para usar PostgreSQL local

```rust
// src-tauri/src/commands/mod.rs

#[tauri::command]
pub async fn create_patient(
    state: State<'_, AppState>,
    data: PatientInput,
) -> Result<Patient, String> {
    let conn_manager = state.connection_manager.lock().await;

    // Verificar modo de conexión
    if let Some(pool) = conn_manager.get_postgres_pool() {
        if conn_manager.get_mode() == ConnectionMode::Local {
            // Escribir directamente a PostgreSQL local
            return pool.create_patient(&data).await;
        }
    }

    // Fallback: SQLite + cola de sync
    // ... código existente ...
}
```

### ~~Paso 3: Actualizar el indicador visual~~ ✅ YA COMPLETADO

La UI en `src/components/SyncIndicator.tsx` ya implementa todos los estados de conexión con iconos y colores apropiados.

---

## Testing

### Probar modo Supabase (con internet)
1. Asegurarse que `~/.centrovision/config.toml` tiene credenciales correctas
2. Iniciar la app: `npm run tauri dev`
3. Verificar que el indicador muestra "Nube"
4. Crear una cita → debe guardarse en Supabase

### Probar modo Local (sin internet)
1. Asegurarse que PostgreSQL local está corriendo
2. Desconectar internet
3. La app debe cambiar a "Local" después de ~10 segundos
4. Crear una cita → debe guardarse en PostgreSQL local
5. Verificar: `psql -U centrovision_app -d centrovision -c "SELECT * FROM appointments ORDER BY created_at DESC LIMIT 1"`

### Probar modo Offline (sin nada)
1. Desconectar internet
2. Detener PostgreSQL local
3. La app debe cambiar a "Sin conexión"
4. Crear una cita → debe guardarse en SQLite local
5. Reconectar → debe sincronizarse

---

## Resumen de Archivos a Modificar

| Archivo | Cambio | Estado |
|---------|--------|--------|
| `src-tauri/src/postgres/mod.rs` | Agregar métodos `create_*`, `update_*`, `delete_*` | ⏳ Pendiente |
| `src-tauri/src/commands/mod.rs` | Usar PostgresPool para escrituras en modo Local | ⏳ Pendiente |
| `src/components/SyncIndicator.tsx` | Mostrar modo de conexión actual | ✅ Completo |
| `src/hooks/useNetworkStatus.tsx` | Exponer `connectionStatus.mode` | ✅ Completo |

---

## Notas Importantes

1. **El servidor de sync es separado** - La app Tauri NO sincroniza datos entre Supabase y el servidor local. Eso lo hace el `centrovision-sync-service` que corre en el servidor de la clínica.

2. **La autenticación sigue siendo Supabase** - Los usuarios se autentican con Supabase. El servidor local no maneja auth, solo datos.

3. **Conflictos los maneja el sync service** - Si hay cambios en ambos lados, el servicio de sync usa "last-write-wins" basado en `updated_at`.
