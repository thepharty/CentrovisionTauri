# Guía Completa: Servidor de Respaldo Local para CentroVision

Esta guía detalla paso a paso cómo configurar un servidor PostgreSQL local en la clínica que funcione como respaldo cuando no hay internet.

---

## Índice

1. [Requisitos de Hardware](#1-requisitos-de-hardware)
2. [Instalación del Sistema Operativo](#2-instalación-del-sistema-operativo)
3. [Instalación de PostgreSQL](#3-instalación-de-postgresql)
4. [Configuración de PostgreSQL para LAN](#4-configuración-de-postgresql-para-lan)
5. [Creación de la Base de Datos](#5-creación-de-la-base-de-datos)
6. [Migración del Esquema desde Supabase](#6-migración-del-esquema-desde-supabase)
7. [Sincronización de Datos Existentes](#7-sincronización-de-datos-existentes)
8. [Configuración de Storage (Archivos/Imágenes)](#8-configuración-de-storage-archivosimágenes)
9. [Servicio de Sincronización](#9-servicio-de-sincronización)
10. [Configuración de la App Tauri](#10-configuración-de-la-app-tauri)
11. [Pruebas y Verificación](#11-pruebas-y-verificación)
12. [Mantenimiento](#12-mantenimiento)

---

## 1. Requisitos de Hardware

### Opción A: Mini PC (Recomendado)
- **Intel NUC** o similar (Intel i3/i5, 8GB RAM, 256GB SSD)
- Costo aproximado: $300-500 USD

### Opción B: Mac Mini (usado)
- Mac Mini 2014 o posterior
- 8GB RAM mínimo
- Costo aproximado: $200-400 USD

### Opción C: Computadora existente
- Cualquier PC con Windows/Linux/macOS
- 8GB RAM, 100GB espacio libre

### Requisitos de Red
- Conexión Ethernet al router de la clínica (WiFi no recomendado)
- IP estática en la LAN (ej: 192.168.1.100)

---

## 2. Instalación del Sistema Operativo

### Para Mini PC / PC nueva: Ubuntu Server 22.04 LTS

1. Descargar Ubuntu Server: https://ubuntu.com/download/server
2. Crear USB booteable con Rufus (Windows) o balenaEtcher (Mac)
3. Instalar con configuración mínima
4. Durante instalación, seleccionar "OpenSSH server" para acceso remoto

### Para Mac Mini: macOS (ya instalado)
- Solo necesitas instalar Homebrew:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

## 3. Instalación de PostgreSQL

### En Windows 10/11 (Recomendado para la clínica):

1. **Descargar PostgreSQL 16:**
   - Ir a: https://www.postgresql.org/download/windows/
   - Descargar el instalador de EDB (Enterprise DB)
   - Ejecutar el instalador `.exe`

2. **Durante la instalación:**
   - Seleccionar todos los componentes (PostgreSQL Server, pgAdmin, Command Line Tools)
   - **Puerto:** 5432 (dejar por defecto)
   - **Contraseña de postgres:** Elegir una segura y GUARDARLA
   - **Locale:** Spanish, Honduras o Spanish, Guatemala

3. **Verificar instalación:**
   - Abrir "SQL Shell (psql)" desde el menú inicio
   - O abrir PowerShell y ejecutar:
   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres
   ```

4. **Agregar PostgreSQL al PATH (opcional pero recomendado):**
   - Buscar "Variables de entorno" en Windows
   - Editar la variable PATH del sistema
   - Agregar: `C:\Program Files\PostgreSQL\16\bin`

### En Ubuntu Server:

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar PostgreSQL 16
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install postgresql-16 postgresql-contrib-16 -y

# Verificar instalación
sudo systemctl status postgresql
```

### En macOS:

```bash
# Instalar PostgreSQL 16
brew install postgresql@16

# Iniciar servicio
brew services start postgresql@16

# Agregar al PATH
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verificar
psql --version
```

---

## 4. Configuración de PostgreSQL para LAN

### 4.1 Configurar para aceptar conexiones de red

**En Windows:**

1. Abrir el archivo `postgresql.conf`:
   - Ubicación: `C:\Program Files\PostgreSQL\16\data\postgresql.conf`
   - Abrir con Notepad como Administrador

2. Buscar y cambiar:
   ```conf
   # Cambiar de:
   #listen_addresses = 'localhost'

   # A:
   listen_addresses = '*'
   ```

**En Ubuntu:**
```bash
# Editar postgresql.conf
sudo nano /etc/postgresql/16/main/postgresql.conf
```

**En macOS:**
```bash
# Encontrar archivo de configuración
psql -c "SHOW config_file;"
# Generalmente: /opt/homebrew/var/postgresql@16/postgresql.conf
nano /opt/homebrew/var/postgresql@16/postgresql.conf
```

**Cambiar estas líneas:**
```conf
# Escuchar en todas las interfaces (no solo localhost)
listen_addresses = '*'

# Puerto estándar
port = 5432
```

### 4.2 Configurar autenticación

**En Windows:**

1. Abrir el archivo `pg_hba.conf`:
   - Ubicación: `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
   - Abrir con Notepad como Administrador

2. Agregar al final:
   ```conf
   # Permitir conexiones desde la red local
   host    centrovision    centrovision_app    192.168.1.0/24    scram-sha-256
   ```

**En Ubuntu:**
```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

**En macOS:**
```bash
nano /opt/homebrew/var/postgresql@16/pg_hba.conf
```

**Agregar al final del archivo:**
```conf
# Permitir conexiones desde la red local (ajustar según tu red)
# Si tu red es 192.168.1.x:
host    centrovision    centrovision_app    192.168.1.0/24    scram-sha-256

# Si tu red es 192.168.0.x:
host    centrovision    centrovision_app    192.168.0.0/24    scram-sha-256

# Si tu red es 10.0.0.x:
host    centrovision    centrovision_app    10.0.0.0/24       scram-sha-256
```

### 4.3 Reiniciar PostgreSQL

**Windows:**
```powershell
# Opción 1: Desde Servicios de Windows
# Buscar "Servicios" → postgresql-x64-16 → Reiniciar

# Opción 2: Desde PowerShell (como Administrador)
Restart-Service postgresql-x64-16
```

**Ubuntu:**
```bash
sudo systemctl restart postgresql
```

**macOS:**
```bash
brew services restart postgresql@16
```

### 4.4 Configurar Firewall

**Windows:**
```powershell
# Ejecutar PowerShell como Administrador
New-NetFirewallRule -DisplayName "PostgreSQL" -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow -RemoteAddress 192.168.1.0/24
```

O manualmente:
1. Buscar "Firewall de Windows con seguridad avanzada"
2. Reglas de entrada → Nueva regla
3. Puerto → TCP → 5432
4. Permitir conexión
5. Solo para redes Privadas
6. Nombre: "PostgreSQL"

**Ubuntu:**
```bash
# Abrir puerto 5432 solo para red local
sudo ufw allow from 192.168.1.0/24 to any port 5432
sudo ufw enable
sudo ufw status
```

---

## 5. Creación de la Base de Datos

### En Windows (usando pgAdmin - más fácil):

1. **Abrir pgAdmin 4** (se instaló con PostgreSQL)
2. Conectar al servidor local (contraseña que pusiste en instalación)
3. Click derecho en "Databases" → Create → Database
   - Name: `centrovision`
   - Click "Save"

4. Click derecho en "Login/Group Roles" → Create → Login/Group Role
   - General → Name: `centrovision_app`
   - Definition → Password: `TU_CONTRASEÑA_SEGURA`
   - Privileges → Can login: Yes
   - Click "Save"

5. Click derecho en la base `centrovision` → Properties
   - Security → Add
   - Grantee: `centrovision_app`
   - Privileges: ALL
   - Click "Save"

### En Windows (usando SQL Shell):

```sql
-- Abrir "SQL Shell (psql)" desde menú inicio
-- Conectar como postgres (Enter para defaults, luego tu contraseña)

-- Crear base de datos
CREATE DATABASE centrovision;

-- Crear usuario
CREATE USER centrovision_app WITH PASSWORD 'TU_CONTRASEÑA_SEGURA_AQUI';

-- Dar permisos
GRANT ALL PRIVILEGES ON DATABASE centrovision TO centrovision_app;

-- Conectar a la base
\c centrovision

-- Permisos en schema
GRANT ALL ON SCHEMA public TO centrovision_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO centrovision_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO centrovision_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO centrovision_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO centrovision_app;

-- Salir
\q
```

### En Ubuntu/macOS:

```bash
# Conectar como superusuario
sudo -u postgres psql

# Crear base de datos
CREATE DATABASE centrovision;

# Crear usuario para la aplicación
CREATE USER centrovision_app WITH PASSWORD 'TU_CONTRASEÑA_SEGURA_AQUI';

# Dar permisos
GRANT ALL PRIVILEGES ON DATABASE centrovision TO centrovision_app;

# Conectar a la base de datos
\c centrovision

# Dar permisos en schema public
GRANT ALL ON SCHEMA public TO centrovision_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO centrovision_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO centrovision_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO centrovision_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO centrovision_app;

# Salir
\q
```

**IMPORTANTE:** Guarda la contraseña en un lugar seguro.

---

## 6. Migración del Esquema desde Supabase

### 6.1 YA TIENES LOS ARCHIVOS DE MIGRACIÓN

En tu proyecto ya existen estos archivos listos para usar:

- **`ESQUEMA_COMPLETO_2026-01-18.sql`** - Esquema completo con ENUMs, tablas, funciones, triggers
- **`MIGRACION_CONSOLIDADA.sql`** - Igual, estructura completa

**Ambos archivos incluyen:**
- ✅ Todos los ENUMs (appointment_status, appointment_type, etc.)
- ✅ Todas las tablas (patients, appointments, invoices, etc.)
- ✅ Columnas deleted_at incluidas
- ✅ Funciones (generate_invoice_number, etc.)
- ✅ Triggers (update_updated_at)
- ✅ Índices para performance

### 6.2 Importar esquema al servidor local

**En Windows (usando pgAdmin - MÁS FÁCIL):**

1. Abrir **pgAdmin 4**
2. Conectar al servidor local
3. Click derecho en base de datos `centrovision`
4. **Query Tool** (o presionar Alt+Shift+Q)
5. Click en el icono de carpeta 📁 → Abrir archivo
6. Seleccionar `ESQUEMA_COMPLETO_2026-01-18.sql`
7. Click en **Execute** (▶️ o F5)
8. Esperar a que termine (puede tomar 10-30 segundos)

**En Windows (usando línea de comandos):**

```powershell
# Abrir PowerShell
# Navegar a la carpeta del proyecto
cd "C:\ruta\a\CentroVision Tauri"

# Importar el esquema
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d centrovision -f "ESQUEMA_COMPLETO_2026-01-18.sql"
# Ingresa la contraseña de postgres cuando te la pida
```

**En Ubuntu/macOS:**

```bash
# Copiar archivo al servidor (desde tu Mac)
scp ESQUEMA_COMPLETO_2026-01-18.sql usuario@192.168.1.100:~/

# En el servidor, importar
psql -U postgres -d centrovision -f ~/ESQUEMA_COMPLETO_2026-01-18.sql
```

### 6.3 Verificar tablas creadas

**En pgAdmin:**
1. Expandir `centrovision` → `Schemas` → `public` → `Tables`
2. Deberías ver todas las tablas listadas

**En SQL Shell:**
```sql
-- Conectar a la base
\c centrovision

-- Listar todas las tablas
\dt

-- Deberías ver algo como:
--  Schema |          Name           | Type  |  Owner
-- --------+-------------------------+-------+----------
--  public | appointments            | table | postgres
--  public | branches                | table | postgres
--  public | cash_closures           | table | postgres
--  public | crm_pipelines           | table | postgres
--  public | encounters              | table | postgres
--  public | invoices                | table | postgres
--  public | patients                | table | postgres
--  ... (40+ tablas en total)
```

---

## 7. Sincronización de Datos Existentes

### 7.1 Exportar datos de Supabase

```bash
# Exportar solo datos (sin esquema)
pg_dump "postgresql://postgres.[PROJECT-ID]:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres" \
  --data-only \
  --no-owner \
  -f datos_supabase.sql
```

### 7.2 Importar datos al servidor local

```bash
# Copiar al servidor
scp datos_supabase.sql usuario@192.168.1.100:~/

# Importar
psql -U centrovision_app -d centrovision -f ~/datos_supabase.sql
```

### 7.3 Script de sincronización automática

Crear archivo `sync_from_supabase.sh`:

```bash
#!/bin/bash

# Configuración
SUPABASE_URL="postgresql://postgres.[PROJECT-ID]:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
LOCAL_DB="centrovision"
LOCAL_USER="centrovision_app"
BACKUP_DIR="/var/backups/centrovision"
DATE=$(date +%Y%m%d_%H%M%S)

# Crear directorio de backups
mkdir -p $BACKUP_DIR

# 1. Backup local antes de sincronizar
pg_dump -U $LOCAL_USER $LOCAL_DB > "$BACKUP_DIR/local_backup_$DATE.sql"

# 2. Exportar datos de Supabase
pg_dump "$SUPABASE_URL" --data-only --no-owner -f "/tmp/supabase_data.sql"

# 3. Importar a local (esto sobrescribe datos)
# CUIDADO: Esto borra datos locales. Ver sección de sincronización bidireccional.
# psql -U $LOCAL_USER -d $LOCAL_DB -f /tmp/supabase_data.sql

echo "Sync completado: $DATE"
```

---

## 8. Configuración de Storage (Archivos/Imágenes)

Los archivos de Supabase Storage (estudios, imágenes, etc.) necesitan tratamiento especial.

### 8.1 Descargar archivos de Supabase Storage

Crear script `download_storage.py`:

```python
#!/usr/bin/env python3
"""
Script para descargar todos los archivos de Supabase Storage
"""

import os
import requests
from supabase import create_client

# Configuración
SUPABASE_URL = "https://[PROJECT-ID].supabase.co"
SUPABASE_KEY = "tu-service-role-key"  # Usar service role, no anon key
LOCAL_STORAGE_PATH = "/var/centrovision/storage"

# Buckets a sincronizar
BUCKETS = ["studies", "patient-files", "documents"]

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    for bucket in BUCKETS:
        print(f"Descargando bucket: {bucket}")
        bucket_path = os.path.join(LOCAL_STORAGE_PATH, bucket)
        os.makedirs(bucket_path, exist_ok=True)

        # Listar archivos en el bucket
        files = supabase.storage.from_(bucket).list()

        for file_info in files:
            file_name = file_info['name']

            # Si es una carpeta, listar recursivamente
            if file_info.get('id') is None:
                download_folder(supabase, bucket, file_name, bucket_path)
            else:
                download_file(supabase, bucket, file_name, bucket_path)

def download_folder(supabase, bucket, folder_path, local_base):
    """Descarga una carpeta recursivamente"""
    files = supabase.storage.from_(bucket).list(folder_path)
    local_folder = os.path.join(local_base, folder_path)
    os.makedirs(local_folder, exist_ok=True)

    for file_info in files:
        file_name = file_info['name']
        full_path = f"{folder_path}/{file_name}"

        if file_info.get('id') is None:
            download_folder(supabase, bucket, full_path, local_base)
        else:
            download_file(supabase, bucket, full_path, local_base)

def download_file(supabase, bucket, file_path, local_base):
    """Descarga un archivo individual"""
    local_path = os.path.join(local_base, file_path)
    os.makedirs(os.path.dirname(local_path), exist_ok=True)

    # Verificar si ya existe
    if os.path.exists(local_path):
        print(f"  Ya existe: {file_path}")
        return

    try:
        # Descargar archivo
        data = supabase.storage.from_(bucket).download(file_path)

        with open(local_path, 'wb') as f:
            f.write(data)

        print(f"  Descargado: {file_path}")
    except Exception as e:
        print(f"  Error descargando {file_path}: {e}")

if __name__ == "__main__":
    main()
```

### 8.2 Instalar dependencias para el script

```bash
pip3 install supabase python-dotenv
```

### 8.3 Configurar servidor de archivos local

Para servir los archivos localmente, usar nginx:

```bash
# Instalar nginx
sudo apt install nginx -y

# Configurar
sudo nano /etc/nginx/sites-available/centrovision-storage
```

Contenido:
```nginx
server {
    listen 8080;
    server_name _;

    location /storage/ {
        alias /var/centrovision/storage/;
        autoindex off;

        # Solo permitir red local
        allow 192.168.1.0/24;
        deny all;
    }
}
```

```bash
# Activar configuración
sudo ln -s /etc/nginx/sites-available/centrovision-storage /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 9. Servicio de Sincronización

### 9.1 Crear servicio de sincronización bidireccional

Este servicio:
- Sincroniza Supabase → Local cuando hay internet
- Guarda cambios locales cuando no hay internet
- Sincroniza Local → Supabase cuando vuelve internet

Crear `/opt/centrovision-sync/sync_service.py`:

```python
#!/usr/bin/env python3
"""
Servicio de sincronización bidireccional CentroVision
"""

import os
import time
import json
import logging
from datetime import datetime
import psycopg2
from supabase import create_client

# Configuración
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
LOCAL_DB_HOST = "localhost"
LOCAL_DB_PORT = 5432
LOCAL_DB_NAME = "centrovision"
LOCAL_DB_USER = "centrovision_app"
LOCAL_DB_PASS = os.getenv("LOCAL_DB_PASS")

SYNC_INTERVAL = 30  # segundos
TABLES_TO_SYNC = [
    "patients",
    "appointments",
    "invoices",
    "payments",
    "services",
    "inventory",
    "profiles",
]

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def get_local_connection():
    """Conectar a PostgreSQL local"""
    return psycopg2.connect(
        host=LOCAL_DB_HOST,
        port=LOCAL_DB_PORT,
        dbname=LOCAL_DB_NAME,
        user=LOCAL_DB_USER,
        password=LOCAL_DB_PASS
    )

def check_supabase_connection():
    """Verificar si hay conexión a Supabase"""
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Intentar query simple
        supabase.table("branches").select("id").limit(1).execute()
        return True, supabase
    except Exception as e:
        logger.warning(f"Sin conexión a Supabase: {e}")
        return False, None

def sync_table_from_supabase(supabase, table_name, local_conn):
    """Sincronizar una tabla desde Supabase a local"""
    try:
        # Obtener última fecha de sync
        cursor = local_conn.cursor()
        cursor.execute(f"""
            SELECT MAX(updated_at) FROM {table_name}
        """)
        last_sync = cursor.fetchone()[0]

        # Obtener registros nuevos/actualizados de Supabase
        query = supabase.table(table_name).select("*")
        if last_sync:
            query = query.gte("updated_at", last_sync.isoformat())

        result = query.execute()

        for record in result.data:
            upsert_record(local_conn, table_name, record)

        local_conn.commit()
        logger.info(f"Sincronizados {len(result.data)} registros de {table_name}")

    except Exception as e:
        logger.error(f"Error sincronizando {table_name}: {e}")
        local_conn.rollback()

def sync_table_to_supabase(supabase, table_name, local_conn):
    """Sincronizar cambios locales a Supabase"""
    try:
        cursor = local_conn.cursor()

        # Obtener registros pendientes de sync
        cursor.execute(f"""
            SELECT * FROM {table_name}
            WHERE _pending_sync = true
        """)

        columns = [desc[0] for desc in cursor.description]
        pending = cursor.fetchall()

        for row in pending:
            record = dict(zip(columns, row))
            del record['_pending_sync']  # Remover campo local

            # Upsert a Supabase
            supabase.table(table_name).upsert(record).execute()

            # Marcar como sincronizado
            cursor.execute(f"""
                UPDATE {table_name}
                SET _pending_sync = false
                WHERE id = %s
            """, (record['id'],))

        local_conn.commit()
        logger.info(f"Enviados {len(pending)} registros de {table_name} a Supabase")

    except Exception as e:
        logger.error(f"Error enviando {table_name} a Supabase: {e}")
        local_conn.rollback()

def upsert_record(conn, table_name, record):
    """Insertar o actualizar un registro"""
    cursor = conn.cursor()

    columns = list(record.keys())
    values = list(record.values())

    # Construir query UPSERT
    placeholders = ", ".join(["%s"] * len(values))
    columns_str = ", ".join(columns)
    update_str = ", ".join([f"{col} = EXCLUDED.{col}" for col in columns if col != 'id'])

    query = f"""
        INSERT INTO {table_name} ({columns_str})
        VALUES ({placeholders})
        ON CONFLICT (id) DO UPDATE SET {update_str}
    """

    cursor.execute(query, values)

def main_loop():
    """Loop principal de sincronización"""
    logger.info("Iniciando servicio de sincronización CentroVision")

    while True:
        try:
            local_conn = get_local_connection()
            has_internet, supabase = check_supabase_connection()

            if has_internet:
                logger.info("Conexión a Supabase disponible - sincronizando...")

                # Primero enviar cambios locales a Supabase
                for table in TABLES_TO_SYNC:
                    sync_table_to_supabase(supabase, table, local_conn)

                # Luego traer cambios de Supabase
                for table in TABLES_TO_SYNC:
                    sync_table_from_supabase(supabase, table, local_conn)
            else:
                logger.info("Sin conexión a Supabase - modo offline")

            local_conn.close()

        except Exception as e:
            logger.error(f"Error en loop de sincronización: {e}")

        time.sleep(SYNC_INTERVAL)

if __name__ == "__main__":
    main_loop()
```

### 9.2 Crear servicio systemd

```bash
sudo nano /etc/systemd/system/centrovision-sync.service
```

Contenido:
```ini
[Unit]
Description=CentroVision Sync Service
After=postgresql.service network.target

[Service]
Type=simple
User=centrovision
Environment=SUPABASE_URL=https://xxx.supabase.co
Environment=SUPABASE_SERVICE_KEY=eyJ...
Environment=LOCAL_DB_PASS=tu_contraseña
ExecStart=/usr/bin/python3 /opt/centrovision-sync/sync_service.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Habilitar e iniciar
sudo systemctl daemon-reload
sudo systemctl enable centrovision-sync
sudo systemctl start centrovision-sync

# Ver logs
sudo journalctl -u centrovision-sync -f
```

---

## 10. Configuración de la App Tauri

### 10.1 Crear archivo de configuración

En cada computadora de la clínica, crear `~/.centrovision/config.toml`:

```toml
[supabase]
url = "https://dlfgyupitvrqbxnucwsf.supabase.co"
anon_key = "eyJ..."

[local_server]
host = "192.168.1.100"  # IP del servidor local
port = 5432
database = "centrovision"
user = "centrovision_app"
password = "tu_contraseña"

[storage]
# URL para archivos cuando hay internet
supabase_storage_url = "https://dlfgyupitvrqbxnucwsf.supabase.co/storage/v1"
# URL para archivos locales (servidor nginx)
local_storage_url = "http://192.168.1.100:8080/storage"
```

### 10.2 Verificar conectividad

```bash
# Desde cualquier computadora de la clínica
# Probar conexión al servidor local
psql -h 192.168.1.100 -U centrovision_app -d centrovision -c "SELECT 1"

# Probar acceso a archivos
curl http://192.168.1.100:8080/storage/studies/test.pdf
```

---

## 11. Pruebas y Verificación

### 11.1 Prueba de funcionamiento normal (con internet)

1. Abrir la app CentroVision
2. Crear una cita nueva
3. Verificar que aparece en Supabase (dashboard)
4. Verificar que el servidor local también tiene el dato:
```bash
psql -h 192.168.1.100 -U centrovision_app -d centrovision -c "SELECT * FROM appointments ORDER BY created_at DESC LIMIT 1"
```

### 11.2 Prueba de modo offline

1. Desconectar el router de internet (o desactivar WiFi del servidor)
2. La app debe seguir funcionando
3. Crear una cita nueva
4. Verificar que se guarda en el servidor local
5. Reconectar internet
6. Verificar que la cita aparece en Supabase después de la sincronización

### 11.3 Prueba de conflictos

1. Desconectar internet
2. Modificar un registro en la app
3. Desde otra fuente, modificar el mismo registro en Supabase
4. Reconectar internet
5. Verificar qué versión prevalece (última modificación gana)

---

## 12. Mantenimiento

### 12.1 Backups automáticos

Crear `/etc/cron.daily/centrovision-backup`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/centrovision"
DATE=$(date +%Y%m%d)
mkdir -p $BACKUP_DIR

# Backup de base de datos
pg_dump -U centrovision_app centrovision | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Backup de archivos
tar -czf "$BACKUP_DIR/storage_$DATE.tar.gz" /var/centrovision/storage

# Mantener solo últimos 30 días
find $BACKUP_DIR -mtime +30 -delete

echo "Backup completado: $DATE"
```

```bash
sudo chmod +x /etc/cron.daily/centrovision-backup
```

### 12.2 Monitoreo

Ver estado del servicio de sync:
```bash
sudo systemctl status centrovision-sync
sudo journalctl -u centrovision-sync --since "1 hour ago"
```

Ver conexiones activas a PostgreSQL:
```bash
psql -U centrovision_app -d centrovision -c "SELECT * FROM pg_stat_activity WHERE datname = 'centrovision'"
```

### 12.3 Actualizar esquema

Cuando hay cambios en Supabase:

1. Exportar nuevo esquema:
```bash
pg_dump "postgresql://..." --schema-only -f nuevo_esquema.sql
```

2. Comparar con esquema local (usar herramienta como `pgdiff` o manualmente)

3. Aplicar migraciones necesarias:
```bash
psql -U centrovision_app -d centrovision -f migracion.sql
```

---

## Resumen de Comandos Importantes

```bash
# Estado de PostgreSQL
sudo systemctl status postgresql

# Conectar a base de datos local
psql -U centrovision_app -d centrovision

# Ver logs de sincronización
sudo journalctl -u centrovision-sync -f

# Reiniciar servicios
sudo systemctl restart postgresql
sudo systemctl restart centrovision-sync
sudo systemctl restart nginx

# Backup manual
pg_dump -U centrovision_app centrovision > backup.sql

# Restaurar backup
psql -U centrovision_app -d centrovision < backup.sql

# Ver IP del servidor
ip addr show | grep "inet "
```

---

## Soporte

Si tienes problemas:

1. Verificar que PostgreSQL está corriendo: `sudo systemctl status postgresql`
2. Verificar conectividad de red: `ping 192.168.1.100`
3. Verificar puerto abierto: `nc -zv 192.168.1.100 5432`
4. Ver logs de PostgreSQL: `sudo tail -f /var/log/postgresql/postgresql-16-main.log`
5. Ver logs de sync: `sudo journalctl -u centrovision-sync -f`
