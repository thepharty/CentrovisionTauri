# Especificación: CentroVision Sync Service

## Propósito

Programa independiente que corre en el servidor de la clínica y sincroniza datos entre:
- **Supabase** (base de datos en la nube)
- **PostgreSQL local** (servidor de respaldo en la clínica)

```
                    INTERNET
                       │
┌──────────────────────┼──────────────────────┐
│                      │                      │
│     ┌────────────────▼────────────────┐     │
│     │      centrovision-sync-service  │     │
│     │      (este programa)            │     │
│     └────────────────┬────────────────┘     │
│                      │                      │
│     ┌────────────────▼────────────────┐     │
│     │      PostgreSQL Local           │     │
│     │      (192.168.1.100:5432)       │     │
│     └─────────────────────────────────┘     │
│                                             │
│            SERVIDOR DE LA CLÍNICA           │
└─────────────────────────────────────────────┘
```

---

## Funcionalidades Requeridas

### 1. Sincronización Supabase → PostgreSQL Local
- Descargar datos nuevos/modificados desde Supabase
- Insertar/actualizar en PostgreSQL local
- Ejecutar cada 30 segundos cuando hay internet

### 2. Sincronización PostgreSQL Local → Supabase
- Detectar cambios hechos localmente (cuando no había internet)
- Subir esos cambios a Supabase cuando vuelve la conexión
- Manejar conflictos con estrategia "last-write-wins"

### 3. Detección de Conectividad
- Health check a Supabase cada 30 segundos
- Si no hay internet, solo registrar en logs
- Reintentar automáticamente cuando vuelve

### 4. Logging
- Registrar todas las operaciones de sync
- Registrar errores con detalles
- Rotar logs automáticamente

### 5. Manejo de Errores
- Reintentos con backoff exponencial
- No perder datos si falla una operación
- Alertar si hay muchos errores consecutivos

---

## Tablas a Sincronizar

Basado en el esquema de CentroVision (`ESQUEMA_COMPLETO_2026-01-18.sql`):

### Tablas Principales (sincronizar completo)
```
- branches              (sucursales)
- rooms                 (consultorios)
- profiles              (usuarios/doctores)
- patients              (pacientes)
- appointments          (citas)
- services              (servicios médicos)
- service_categories    (categorías de servicios)
```

### Tablas de Facturación
```
- invoices              (facturas)
- invoice_items         (items de factura)
- payments              (pagos)
- cash_closures         (cierres de caja)
```

### Tablas de Expediente Clínico
```
- encounters            (consultas/encuentros)
- prescriptions         (recetas)
- prescription_items    (items de receta)
- referrals             (referencias médicas)
```

### Tablas de Inventario
```
- inventory_items       (productos)
- inventory_categories  (categorías)
- inventory_movements   (movimientos)
```

### Tablas de Estudios
```
- studies               (estudios médicos)
- study_files           (archivos de estudios)
```

### Tablas de CRM
```
- crm_leads             (prospectos)
- crm_pipelines         (pipelines)
- crm_pipeline_stages   (etapas)
```

---

## Esquema de Base de Datos para Sync

### Tabla de Control de Sincronización

Crear en PostgreSQL local:

```sql
-- Registro de última sincronización por tabla
CREATE TABLE IF NOT EXISTS _sync_metadata (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) UNIQUE NOT NULL,
    last_sync_from_supabase TIMESTAMPTZ,
    last_sync_to_supabase TIMESTAMPTZ,
    records_synced_down INTEGER DEFAULT 0,
    records_synced_up INTEGER DEFAULT 0,
    last_error TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log de cambios locales pendientes de subir
CREATE TABLE IF NOT EXISTS _sync_pending (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    operation VARCHAR(10) NOT NULL,  -- INSERT, UPDATE, DELETE
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ,
    error TEXT,
    retry_count INTEGER DEFAULT 0
);

-- Índices
CREATE INDEX idx_sync_pending_unsynced ON _sync_pending(synced) WHERE synced = FALSE;
CREATE INDEX idx_sync_pending_table ON _sync_pending(table_name);

-- Log de operaciones
CREATE TABLE IF NOT EXISTS _sync_log (
    id SERIAL PRIMARY KEY,
    direction VARCHAR(10) NOT NULL,  -- DOWN (Supabase→Local), UP (Local→Supabase)
    table_name VARCHAR(100),
    records_affected INTEGER,
    status VARCHAR(20),  -- SUCCESS, ERROR, PARTIAL
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Triggers para Detectar Cambios Locales

Crear trigger en cada tabla para registrar cambios:

```sql
-- Función genérica para registrar cambios
CREATE OR REPLACE FUNCTION log_local_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo registrar si el cambio NO vino de sync (evitar loops)
    IF current_setting('app.is_sync', true) IS DISTINCT FROM 'true' THEN
        IF TG_OP = 'DELETE' THEN
            INSERT INTO _sync_pending (table_name, record_id, operation, data)
            VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD)::jsonb);
            RETURN OLD;
        ELSE
            INSERT INTO _sync_pending (table_name, record_id, operation, data)
            VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW)::jsonb);
            RETURN NEW;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Crear trigger en cada tabla
CREATE TRIGGER sync_changes_patients
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION log_local_changes();

CREATE TRIGGER sync_changes_appointments
    AFTER INSERT OR UPDATE OR DELETE ON appointments
    FOR EACH ROW EXECUTE FUNCTION log_local_changes();

-- ... repetir para cada tabla a sincronizar
```

---

## Configuración

### Archivo: `config.toml`

```toml
[supabase]
url = "https://dlfgyupitvrqbxnucwsf.supabase.co"
service_key = "eyJ..."  # Service role key (NO anon key)

[local_postgres]
host = "localhost"
port = 5432
database = "centrovision"
user = "centrovision_app"
password = "tu_contraseña_segura"

[sync]
interval_seconds = 30
batch_size = 100
retry_max_attempts = 3
retry_delay_seconds = 5

[logging]
level = "info"  # debug, info, warn, error
file = "/var/log/centrovision-sync/sync.log"
max_size_mb = 10
max_files = 5
```

---

## Algoritmo de Sincronización

### Sync Supabase → Local (cada 30 segundos)

```python
def sync_from_supabase():
    for table in TABLES_TO_SYNC:
        try:
            # 1. Obtener timestamp de última sync
            last_sync = get_last_sync_timestamp(table, direction='down')

            # 2. Consultar Supabase por registros nuevos/modificados
            query = supabase.table(table).select("*")
            if last_sync:
                query = query.gte("updated_at", last_sync.isoformat())

            records = query.execute().data

            # 3. Upsert en PostgreSQL local
            if records:
                # Marcar que estamos en modo sync (evitar triggers)
                execute("SET LOCAL app.is_sync = 'true'")

                for record in records:
                    upsert_to_local(table, record)

                # Actualizar metadata
                update_sync_metadata(table, 'down', len(records))

            log_success(f"Synced {len(records)} records from {table}")

        except Exception as e:
            log_error(f"Error syncing {table}: {e}")
```

### Sync Local → Supabase (cuando hay cambios pendientes)

```python
def sync_to_supabase():
    # 1. Obtener cambios pendientes
    pending = query("""
        SELECT * FROM _sync_pending
        WHERE synced = FALSE
        ORDER BY created_at ASC
        LIMIT 100
    """)

    for change in pending:
        try:
            if change.operation == 'INSERT':
                supabase.table(change.table_name).insert(change.data).execute()
            elif change.operation == 'UPDATE':
                supabase.table(change.table_name).update(change.data).eq('id', change.record_id).execute()
            elif change.operation == 'DELETE':
                supabase.table(change.table_name).delete().eq('id', change.record_id).execute()

            # Marcar como sincronizado
            mark_as_synced(change.id)

        except Exception as e:
            # Incrementar contador de reintentos
            increment_retry(change.id, str(e))

            # Si hay conflicto, aplicar last-write-wins
            if is_conflict_error(e):
                resolve_conflict(change)
```

### Resolución de Conflictos

```python
def resolve_conflict(local_change):
    """
    Estrategia: Last-Write-Wins basado en updated_at
    """
    # Obtener registro de Supabase
    remote = supabase.table(local_change.table_name).select("*").eq('id', local_change.record_id).single().execute()

    if remote.data:
        remote_updated = parse_datetime(remote.data['updated_at'])
        local_updated = parse_datetime(local_change.data['updated_at'])

        if local_updated > remote_updated:
            # Local es más reciente, forzar actualización
            supabase.table(local_change.table_name).upsert(local_change.data).execute()
            log_info(f"Conflict resolved: local wins for {local_change.record_id}")
        else:
            # Remoto es más reciente, descartar cambio local
            mark_as_synced(local_change.id)
            log_info(f"Conflict resolved: remote wins for {local_change.record_id}")
    else:
        # Registro no existe en remoto, insertarlo
        supabase.table(local_change.table_name).insert(local_change.data).execute()
```

---

## Estructura del Proyecto

```
centrovision-sync-service/
├── src/
│   ├── main.py (o main.rs)
│   ├── config.py
│   ├── supabase_client.py
│   ├── postgres_client.py
│   ├── sync_engine.py
│   ├── conflict_resolver.py
│   └── logger.py
├── sql/
│   ├── create_sync_tables.sql
│   └── create_triggers.sql
├── config.toml.example
├── requirements.txt (o Cargo.toml)
├── install_windows.bat
├── install_linux.sh
├── README.md
└── tests/
    ├── test_sync_down.py
    ├── test_sync_up.py
    └── test_conflicts.py
```

---

## Instalación en Windows

### Script: `install_windows.bat`

```batch
@echo off
echo ====================================
echo CentroVision Sync Service Installer
echo ====================================

REM Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no esta instalado
    echo Descargalo de https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Crear directorio
mkdir "C:\CentroVision\sync-service" 2>nul

REM Copiar archivos
xcopy /E /Y "src\*" "C:\CentroVision\sync-service\"

REM Instalar dependencias
pip install -r requirements.txt

REM Crear archivo de configuración
if not exist "C:\CentroVision\sync-service\config.toml" (
    copy config.toml.example "C:\CentroVision\sync-service\config.toml"
    echo.
    echo IMPORTANTE: Edita C:\CentroVision\sync-service\config.toml
    echo con tus credenciales de Supabase y PostgreSQL
)

REM Crear servicio de Windows
echo.
echo Creando servicio de Windows...
sc create CentroVisionSync ^
    binPath= "python C:\CentroVision\sync-service\main.py" ^
    start= auto ^
    DisplayName= "CentroVision Sync Service"

echo.
echo ====================================
echo Instalacion completada!
echo.
echo Pasos siguientes:
echo 1. Edita config.toml con tus credenciales
echo 2. Inicia el servicio: sc start CentroVisionSync
echo ====================================
pause
```

### Script alternativo con NSSM (más robusto)

```batch
@echo off
REM Usar NSSM para crear servicio más estable

REM Descargar NSSM si no existe
if not exist "C:\nssm\nssm.exe" (
    echo Descargando NSSM...
    powershell -Command "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile 'nssm.zip'"
    powershell -Command "Expand-Archive -Path 'nssm.zip' -DestinationPath 'C:\nssm'"
)

REM Instalar servicio
C:\nssm\nssm.exe install CentroVisionSync "python" "C:\CentroVision\sync-service\main.py"
C:\nssm\nssm.exe set CentroVisionSync AppDirectory "C:\CentroVision\sync-service"
C:\nssm\nssm.exe set CentroVisionSync DisplayName "CentroVision Sync Service"
C:\nssm\nssm.exe set CentroVisionSync Start SERVICE_AUTO_START
C:\nssm\nssm.exe set CentroVisionSync AppStdout "C:\CentroVision\logs\sync.log"
C:\nssm\nssm.exe set CentroVisionSync AppStderr "C:\CentroVision\logs\sync-error.log"

echo Servicio instalado. Iniciar con: net start CentroVisionSync
```

---

## Instalación en Linux

### Script: `install_linux.sh`

```bash
#!/bin/bash
set -e

echo "===================================="
echo "CentroVision Sync Service Installer"
echo "===================================="

# Verificar Python
if ! command -v python3 &> /dev/null; then
    echo "Instalando Python..."
    sudo apt update
    sudo apt install -y python3 python3-pip
fi

# Crear directorio
sudo mkdir -p /opt/centrovision-sync
sudo mkdir -p /var/log/centrovision-sync

# Copiar archivos
sudo cp -r src/* /opt/centrovision-sync/
sudo cp config.toml.example /opt/centrovision-sync/config.toml

# Instalar dependencias
sudo pip3 install -r requirements.txt

# Crear usuario de servicio
sudo useradd -r -s /bin/false centrovision 2>/dev/null || true
sudo chown -R centrovision:centrovision /opt/centrovision-sync
sudo chown -R centrovision:centrovision /var/log/centrovision-sync

# Crear servicio systemd
cat << 'EOF' | sudo tee /etc/systemd/system/centrovision-sync.service
[Unit]
Description=CentroVision Sync Service
After=network.target postgresql.service

[Service]
Type=simple
User=centrovision
WorkingDirectory=/opt/centrovision-sync
ExecStart=/usr/bin/python3 /opt/centrovision-sync/main.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/centrovision-sync/sync.log
StandardError=append:/var/log/centrovision-sync/sync-error.log

[Install]
WantedBy=multi-user.target
EOF

# Habilitar servicio
sudo systemctl daemon-reload
sudo systemctl enable centrovision-sync

echo ""
echo "===================================="
echo "Instalación completada!"
echo ""
echo "Pasos siguientes:"
echo "1. Edita /opt/centrovision-sync/config.toml"
echo "2. Inicia: sudo systemctl start centrovision-sync"
echo "3. Ver logs: journalctl -u centrovision-sync -f"
echo "===================================="
```

---

## Dependencias (Python)

### `requirements.txt`

```
# Supabase
supabase==2.0.0
httpx==0.25.0

# PostgreSQL
psycopg2-binary==2.9.9
# o asyncpg==0.29.0 para async

# Configuración
toml==0.10.2

# Logging
python-json-logger==2.0.7

# Utilidades
schedule==1.2.0  # Para programar tareas
tenacity==8.2.3  # Reintentos con backoff
```

---

## Comandos Útiles

### Windows
```batch
REM Ver estado del servicio
sc query CentroVisionSync

REM Iniciar servicio
sc start CentroVisionSync

REM Detener servicio
sc stop CentroVisionSync

REM Ver logs
type C:\CentroVision\logs\sync.log

REM Ejecutar manualmente (para debug)
python C:\CentroVision\sync-service\main.py
```

### Linux
```bash
# Ver estado
sudo systemctl status centrovision-sync

# Iniciar
sudo systemctl start centrovision-sync

# Detener
sudo systemctl stop centrovision-sync

# Ver logs en tiempo real
journalctl -u centrovision-sync -f

# Ver últimos errores
journalctl -u centrovision-sync --since "1 hour ago" | grep ERROR

# Ejecutar manualmente (para debug)
cd /opt/centrovision-sync && python3 main.py
```

---

## Monitoreo y Alertas

### Verificar que está funcionando

```sql
-- Ejecutar en PostgreSQL local

-- Ver última sincronización por tabla
SELECT table_name,
       last_sync_from_supabase,
       records_synced_down,
       last_error
FROM _sync_metadata
ORDER BY last_sync_from_supabase DESC;

-- Ver cambios pendientes de subir
SELECT COUNT(*) as pending_changes,
       table_name
FROM _sync_pending
WHERE synced = FALSE
GROUP BY table_name;

-- Ver log de las últimas operaciones
SELECT * FROM _sync_log
ORDER BY created_at DESC
LIMIT 20;
```

### Script de monitoreo simple

```python
# monitor.py - Ejecutar con cron cada 5 minutos

import psycopg2
import smtplib
from email.mime.text import MIMEText

def check_sync_health():
    conn = psycopg2.connect(...)
    cur = conn.cursor()

    # Verificar si hay sync reciente
    cur.execute("""
        SELECT MAX(last_sync_from_supabase)
        FROM _sync_metadata
    """)
    last_sync = cur.fetchone()[0]

    if last_sync is None or (datetime.now() - last_sync).seconds > 300:
        send_alert("Sync no ha corrido en más de 5 minutos!")

    # Verificar cambios pendientes acumulados
    cur.execute("""
        SELECT COUNT(*) FROM _sync_pending WHERE synced = FALSE
    """)
    pending = cur.fetchone()[0]

    if pending > 100:
        send_alert(f"Hay {pending} cambios pendientes de sincronizar!")

def send_alert(message):
    # Enviar email, SMS, o notificación
    print(f"ALERTA: {message}")
```

---

## Información de la App CentroVision (Contexto)

### Credenciales Supabase
- URL: `https://dlfgyupitvrqbxnucwsf.supabase.co`
- Necesitas el **Service Role Key** (no el anon key) para sync server-side
- Se encuentra en: Supabase Dashboard → Settings → API → service_role key

### Estructura de datos clave
- Todas las tablas tienen `id` (UUID), `created_at`, `updated_at`
- Soft delete con columna `deleted_at` (NULL = activo)
- Branch filtering: muchas tablas tienen `branch_id`
- Zona horaria: America/Tegucigalpa (UTC-6)

### Consideraciones especiales
- **Storage (archivos)**: Los archivos de estudios están en Supabase Storage, no en PostgreSQL. Se necesita sincronización separada para archivos.
- **Auth**: La autenticación es solo Supabase Auth. El sync service no maneja usuarios, solo datos.
- **RLS**: Las políticas de Row Level Security de Supabase no aplican al sync service porque usa service_role key.

---

## Checklist de Implementación

- [ ] Crear proyecto Python/Rust
- [ ] Implementar cliente Supabase con service_role key
- [ ] Implementar cliente PostgreSQL con pool de conexiones
- [ ] Crear tablas de control (`_sync_metadata`, `_sync_pending`, `_sync_log`)
- [ ] Crear triggers en todas las tablas a sincronizar
- [ ] Implementar sync Supabase → Local
- [ ] Implementar sync Local → Supabase
- [ ] Implementar resolución de conflictos
- [ ] Agregar logging completo
- [ ] Agregar manejo de errores y reintentos
- [ ] Crear instalador Windows (.bat o .msi)
- [ ] Crear instalador Linux (.sh)
- [ ] Documentar configuración
- [ ] Probar failover completo
- [ ] Probar resolución de conflictos
