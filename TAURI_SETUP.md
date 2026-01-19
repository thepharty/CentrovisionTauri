# CentroVision EHR - Guía de Configuración Tauri

Esta guía te ayudará a convertir CentroVision EHR en una app de escritorio con Tauri que funciona offline.

---

## PASO 0: Crear Supabase de Desarrollo (IMPORTANTE)

Para no arriesgar los datos reales, primero crea un proyecto Supabase separado para desarrollo.

### 1. Crear proyecto nuevo en Supabase

1. Ve a https://supabase.com/dashboard
2. Click "New Project"
3. Configuración:
   - **Organization**: Tu organización
   - **Name**: `centrovision-dev` o `centrovision-tauri-test`
   - **Database Password**: Genera uno seguro
   - **Region**: El más cercano a ti
4. Click "Create new project"
5. Espera ~2 minutos a que se cree

### 2. Guardar las nuevas credenciales

Una vez creado, ve a **Project Settings → API** y copia:
- **Project URL**: `https://xxxxx.supabase.co`
- **anon public key**: `eyJhbGc...`

Guárdalos en un lugar seguro.

### 3. Aplicar migraciones (crear tablas)

**Opción A - Usando Supabase CLI:**
```bash
# En tu proyecto copiado
cd centrovision-desktop

# Linkear al nuevo proyecto
supabase link --project-ref xxxxx

# Aplicar todas las migraciones
supabase db push
```

**Opción B - Manualmente desde el SQL Editor:**
1. Ve al dashboard del proyecto nuevo
2. SQL Editor → New Query
3. Copia y pega el contenido de cada archivo en `supabase/migrations/`
4. Ejecuta en orden cronológico

### 4. Crear datos de prueba

En el SQL Editor, crea datos ficticios:

```sql
-- Usuario admin de prueba (después crear en Auth)
INSERT INTO profiles (user_id, full_name, specialty) VALUES
('test-admin-id', 'Admin Prueba', NULL);

INSERT INTO user_roles (user_id, role) VALUES
('test-admin-id', 'admin');

-- Sucursal de prueba
INSERT INTO branches (id, code, name, address, phone, active) VALUES
('test-branch-1', 'central', 'Central Prueba', 'Dirección de prueba', '555-0000', true);

-- Sala de prueba
INSERT INTO rooms (id, name, kind, active, branch_id) VALUES
('test-room-1', 'Consultorio 1', 'consultorio', true, 'test-branch-1');

-- Pacientes de prueba
INSERT INTO patients (id, code, first_name, last_name, dob, phone) VALUES
('test-patient-1', 'P001', 'Juan', 'Pérez García', '1985-03-15', '555-1111'),
('test-patient-2', 'P002', 'María', 'López Hernández', '1990-07-22', '555-2222'),
('test-patient-3', 'P003', 'Carlos', 'Rodríguez Martínez', '1978-11-08', '555-3333');

-- Citas de prueba (para hoy)
INSERT INTO appointments (id, patient_id, room_id, branch_id, starts_at, ends_at, type, status) VALUES
('test-apt-1', 'test-patient-1', 'test-room-1', 'test-branch-1',
 NOW()::date + '09:00'::time, NOW()::date + '09:30'::time, 'consulta', 'scheduled'),
('test-apt-2', 'test-patient-2', 'test-room-1', 'test-branch-1',
 NOW()::date + '10:00'::time, NOW()::date + '10:30'::time, 'consulta', 'scheduled'),
('test-apt-3', 'test-patient-3', 'test-room-1', 'test-branch-1',
 NOW()::date + '11:00'::time, NOW()::date + '11:30'::time, 'consulta', 'scheduled');
```

### 5. Crear usuario de prueba en Auth

1. Ve a **Authentication → Users**
2. Click "Add user"
3. Email: `admin@test.com`
4. Password: `test123456`
5. Click "Create user"
6. Actualiza el `user_id` en la tabla `profiles` y `user_roles` con el ID real

### 6. Configurar variables de entorno

Crea `.env.development` en tu proyecto:

```bash
# .env.development - Supabase de PRUEBA
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJI...
```

Crea `.env.production` (para cuando esté listo):

```bash
# .env.production - Tu Supabase REAL (NO tocar hasta que todo funcione)
VITE_SUPABASE_URL=https://tuproyectoreal.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJab...
```

### 7. Verificar que funciona

```bash
npm run dev
```

Debería abrir la app conectada al Supabase de prueba.

---

## PASO 1: Requisitos del Sistema

### macOS
```bash
# Instalar Xcode Command Line Tools
xcode-select --install

# Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Reiniciar terminal y verificar
rustc --version
```

### Windows
1. Descargar e instalar [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - Seleccionar "Desktop development with C++"
2. Descargar e instalar [Rust](https://rustup.rs)
3. WebView2 viene incluido en Windows 10/11

### Verificar Node.js
```bash
node --version  # Debe ser 18+
npm --version
```

---

## PASO 2: Inicializar Tauri

```bash
# En la carpeta del proyecto
npm install @tauri-apps/cli @tauri-apps/api

# Inicializar Tauri
npx tauri init
```

Responde a las preguntas:
- **App name**: CentroVision EHR
- **Window title**: CentroVision EHR
- **Web assets location**: ../dist
- **Dev server URL**: http://localhost:8080
- **Dev command**: npm run dev
- **Build command**: npm run build

---

## PASO 3: Estructura del Proyecto

Después de inicializar, tu proyecto tendrá esta estructura:

```
centrovision-desktop/
├── src/                              ← React (sin cambios)
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── ...
├── src-tauri/                        ← NUEVO: Backend Rust
│   ├── Cargo.toml                    ← Dependencias Rust
│   ├── tauri.conf.json               ← Configuración de la app
│   ├── src/
│   │   ├── main.rs                   ← Entry point
│   │   ├── lib.rs                    ← Exports
│   │   ├── commands/                 ← Comandos invocables desde React
│   │   │   ├── mod.rs
│   │   │   ├── auth.rs               ← Login offline
│   │   │   ├── patients.rs           ← CRUD pacientes
│   │   │   ├── appointments.rs       ← CRUD citas
│   │   │   ├── encounters.rs         ← CRUD encuentros
│   │   │   ├── sync.rs               ← Sincronización
│   │   │   └── pdf.rs                ← Generación de PDFs
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── schema.rs             ← Definición de tablas SQLite
│   │   │   ├── migrations.rs         ← Migraciones
│   │   │   └── queries.rs            ← Queries SQL
│   │   └── sync/
│   │       ├── mod.rs
│   │       ├── queue.rs              ← Cola de sincronización
│   │       ├── resolver.rs           ← Resolución de conflictos
│   │       └── supabase.rs           ← Cliente Supabase
│   └── icons/                        ← Íconos de la app
│       ├── icon.ico                  ← Windows
│       ├── icon.icns                 ← macOS
│       └── icon.png                  ← Linux/genérico
├── package.json
├── vite.config.ts
└── ...
```

---

## PASO 4: Configurar Dependencias Rust

Edita `src-tauri/Cargo.toml`:

```toml
[package]
name = "centrovision-ehr"
version = "1.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["shell-open"] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.31", features = ["bundled"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
reqwest = { version = "0.11", features = ["json"] }

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

---

## PASO 5: Configurar Scripts

Agrega a `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

---

## PASO 6: Configuración Tauri

Edita `src-tauri/tauri.conf.json`:

```json
{
  "productName": "CentroVision EHR",
  "version": "1.0.0",
  "identifier": "com.centrovision.ehr",
  "build": {
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{
      "title": "CentroVision EHR",
      "width": 1400,
      "height": 900,
      "resizable": true,
      "fullscreen": false
    }],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "icon": ["icons/icon.png"],
    "targets": ["dmg", "nsis"]
  }
}
```

---

## PASO 7: Schema SQLite (Base de Datos Local)

Crea el archivo `src-tauri/src/db/schema.sql`:

```sql
-- Pacientes
CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    code TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    dob TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    occupation TEXT,
    allergies TEXT,
    notes TEXT,
    ophthalmic_history TEXT,
    diabetes BOOLEAN DEFAULT FALSE,
    hta BOOLEAN DEFAULT FALSE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced_at TEXT
);

-- Citas
CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    doctor_id TEXT,
    room_id TEXT,
    branch_id TEXT,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    type TEXT,
    status TEXT DEFAULT 'scheduled',
    reason TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced_at TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
);

-- Encuentros
CREATE TABLE IF NOT EXISTS encounters (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    doctor_id TEXT,
    appointment_id TEXT,
    type TEXT,
    date TEXT,
    motivo_consulta TEXT,
    summary TEXT,
    plan_tratamiento TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced_at TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
);

-- Examen de ojo
CREATE TABLE IF NOT EXISTS exam_eye (
    id TEXT PRIMARY KEY,
    encounter_id TEXT NOT NULL,
    side TEXT NOT NULL, -- OD, OI, OU
    av_sc TEXT,
    av_cc TEXT,
    esfera TEXT,
    cilindro TEXT,
    eje TEXT,
    rx_sphere TEXT,
    rx_cyl TEXT,
    rx_axis TEXT,
    rx_add TEXT,
    iop TEXT,
    slit_lamp TEXT,
    fundus TEXT,
    plan TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced_at TEXT,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id)
);

-- Diagnósticos
CREATE TABLE IF NOT EXISTS diagnoses (
    id TEXT PRIMARY KEY,
    encounter_id TEXT NOT NULL,
    code TEXT,
    label TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT,
    synced_at TEXT,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id)
);

-- Sucursales
CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    active BOOLEAN DEFAULT TRUE,
    synced_at TEXT
);

-- Salas
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT,
    active BOOLEAN DEFAULT TRUE,
    branch_id TEXT,
    synced_at TEXT,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Perfiles de usuario
CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY,
    full_name TEXT,
    specialty TEXT,
    email TEXT,
    synced_at TEXT
);

-- Roles de usuario
CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    synced_at TEXT
);

-- CRM Pipelines
CREATE TABLE IF NOT EXISTS crm_pipelines (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    procedure_type_id TEXT,
    doctor_id TEXT,
    branch_id TEXT,
    current_stage TEXT,
    eye_side TEXT,
    status TEXT DEFAULT 'activo',
    priority TEXT DEFAULT 'normal',
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced_at TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
);

-- Cola de sincronización
CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    data TEXT NOT NULL,   -- JSON con los datos
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    synced INTEGER DEFAULT 0
);

-- Metadatos de sincronización
CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(synced) WHERE synced = 0;
```

---

## PASO 8: Flujo de Sincronización

### Cómo funciona:

```
1. ONLINE → OFFLINE
   - Detectar pérdida de conexión
   - Cambiar a modo SQLite local
   - Mostrar indicador amarillo

2. ESCRITURA OFFLINE
   - Guardar en SQLite local
   - Agregar a sync_queue
   - Continuar trabajando normal

3. OFFLINE → ONLINE
   - Detectar conexión restaurada
   - Procesar sync_queue en orden
   - Para cada item:
     a. Enviar a Supabase
     b. Si éxito: marcar synced=1
     c. Si conflicto: timestamp más reciente gana
     d. Notificar al usuario si hubo conflictos
   - Mostrar indicador verde

4. SINCRONIZACIÓN INICIAL
   - Al abrir app con internet
   - Descargar: branch actual + últimos 6 meses de datos
   - Guardar en SQLite local
```

### Indicador visual:

```
🟢 Sincronizado          - Todo al día
🟡 3 cambios pendientes  - Sin internet, trabajando local
🔴 Sin conexión          - Offline mode activo
```

---

## PASO 9: Comandos Tauri (Ejemplo)

Crea `src-tauri/src/commands/patients.rs`:

```rust
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct Patient {
    pub id: String,
    pub code: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub dob: Option<String>,
    pub phone: Option<String>,
}

#[tauri::command]
pub async fn get_patients(
    state: State<'_, AppState>,
    search: Option<String>
) -> Result<Vec<Patient>, String> {
    let db = state.db.lock().await;

    let patients = if let Some(query) = search {
        db.query_patients_by_name(&query)
    } else {
        db.get_all_patients()
    };

    Ok(patients)
}

#[tauri::command]
pub async fn create_patient(
    state: State<'_, AppState>,
    patient: Patient
) -> Result<Patient, String> {
    let db = state.db.lock().await;

    // 1. Guardar en SQLite
    let saved = db.insert_patient(&patient)?;

    // 2. Si hay internet, sincronizar inmediatamente
    if state.is_online().await {
        sync_to_supabase(&saved).await?;
    } else {
        // Agregar a cola para sincronizar después
        db.add_to_sync_queue("patients", &saved.id, "INSERT", &saved)?;
    }

    Ok(saved)
}
```

---

## PASO 10: Uso desde React

Modifica tus hooks para usar Tauri:

```typescript
// src/hooks/usePatients.ts
import { invoke } from '@tauri-apps/api/tauri';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function usePatients(search?: string) {
  return useQuery({
    queryKey: ['patients', search],
    queryFn: async () => {
      // Llamar a comando Tauri en vez de Supabase directo
      return await invoke<Patient[]>('get_patients', { search });
    }
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patient: PatientInput) => {
      return await invoke<Patient>('create_patient', { patient });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    }
  });
}
```

---

## PASO 11: Detección de Conectividad

Crea `src/hooks/useNetworkStatus.ts`:

```typescript
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);

  useEffect(() => {
    // Escuchar cambios de red desde Rust
    const unlisten = listen('network-status', (event: any) => {
      setIsOnline(event.payload.online);
      setPendingSync(event.payload.pending);
    });

    // Check inicial
    invoke('check_network_status').then((status: any) => {
      setIsOnline(status.online);
      setPendingSync(status.pending);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  return { isOnline, pendingSync };
}
```

---

## PASO 12: Indicador de Estado (UI)

Crea `src/components/SyncIndicator.tsx`:

```tsx
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Wifi, WifiOff, RefreshCw, Check } from 'lucide-react';

export function SyncIndicator() {
  const { isOnline, pendingSync } = useNetworkStatus();

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 text-yellow-500 text-sm">
        <WifiOff className="h-4 w-4" />
        <span>Offline - {pendingSync} pendientes</span>
      </div>
    );
  }

  if (pendingSync > 0) {
    return (
      <div className="flex items-center gap-2 text-blue-500 text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Sincronizando {pendingSync}...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-green-500 text-sm">
      <Check className="h-4 w-4" />
      <span>Sincronizado</span>
    </div>
  );
}
```

---

## Comandos Útiles

```bash
# Desarrollo (abre la app de escritorio)
npm run tauri:dev

# Construir para producción
npm run tauri:build

# Solo construir el frontend
npm run build

# Solo ejecutar Tauri sin hot-reload
npm run tauri
```

---

## Verificación Final

- [ ] App se instala correctamente en Windows/Mac
- [ ] Funciona sin internet (crear cita, ver agenda)
- [ ] Sincroniza cuando vuelve la conexión
- [ ] No hay pérdida de datos
- [ ] Conflictos se manejan correctamente
- [ ] PDFs se generan localmente
- [ ] Fotos se guardan y sincronizan

---

## Notas Importantes

1. **Datos de desarrollo**: Siempre usa el Supabase de prueba durante desarrollo
2. **Backup**: Mantén tu proyecto original intacto como respaldo
3. **Testing**: Prueba el modo offline desconectando el WiFi
4. **Conflictos**: El cambio más reciente siempre gana (timestamp-based)
5. **Espacio**: SQLite local guarda últimos 6 meses de datos

---

## Soporte

Si tienes problemas:
1. Revisa la consola de Rust: `npm run tauri:dev`
2. Revisa la consola del navegador (DevTools)
3. Verifica que Rust esté instalado: `rustc --version`
4. Verifica permisos del filesystem
