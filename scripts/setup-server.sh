#!/bin/bash
# =============================================================================
# CentroVision EHR - Script de Configuración del Servidor Local
# =============================================================================
#
# Este script configura un servidor PostgreSQL en la clínica para funcionar
# como respaldo cuando no hay internet.
#
# Uso:
#   sudo ./setup-server.sh
#
# Requisitos:
#   - Ubuntu 22.04 LTS o macOS
#   - Acceso root/sudo
#
# =============================================================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "=============================================="
echo "  CentroVision EHR - Configuración de Servidor"
echo "=============================================="
echo -e "${NC}"

# Detectar sistema operativo
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    echo "Sistema detectado: macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    echo "Sistema detectado: Linux"
else
    echo -e "${RED}Sistema operativo no soportado: $OSTYPE${NC}"
    exit 1
fi

# Configuración por defecto
DB_NAME="centrovision"
DB_USER="centrovision_app"
DB_PASS=""
SERVER_IP=""

# Obtener IP del servidor
if [[ "$OS" == "macos" ]]; then
    SERVER_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
else
    SERVER_IP=$(hostname -I | awk '{print $1}')
fi

echo ""
echo "Este script configurará PostgreSQL para CentroVision EHR."
echo ""
echo -e "${YELLOW}Configuración detectada:${NC}"
echo "  - IP del servidor: $SERVER_IP"
echo "  - Base de datos: $DB_NAME"
echo "  - Usuario: $DB_USER"
echo ""

# Pedir contraseña
read -sp "Ingresa una contraseña para el usuario de la base de datos: " DB_PASS
echo ""

if [ -z "$DB_PASS" ]; then
    echo -e "${RED}Error: La contraseña no puede estar vacía${NC}"
    exit 1
fi

# Confirmar
echo ""
echo -e "${YELLOW}¿Deseas continuar con la instalación? (s/n)${NC}"
read -r confirm
if [[ ! "$confirm" =~ ^[Ss]$ ]]; then
    echo "Instalación cancelada."
    exit 0
fi

echo ""
echo -e "${GREEN}Iniciando instalación...${NC}"
echo ""

# =============================================================================
# Instalar PostgreSQL
# =============================================================================

echo "1. Instalando PostgreSQL..."

if [[ "$OS" == "macos" ]]; then
    # macOS - usar Homebrew
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}Homebrew no está instalado. Instálalo primero: https://brew.sh${NC}"
        exit 1
    fi

    if ! brew list postgresql@16 &>/dev/null; then
        brew install postgresql@16
    fi

    brew services start postgresql@16

    # Esperar a que PostgreSQL inicie
    sleep 3

    PSQL_CMD="psql"
    PG_CONF="/opt/homebrew/var/postgresql@16/postgresql.conf"
    PG_HBA="/opt/homebrew/var/postgresql@16/pg_hba.conf"

else
    # Linux - usar apt
    sudo apt update
    sudo apt install -y postgresql-16 postgresql-contrib-16

    sudo systemctl start postgresql
    sudo systemctl enable postgresql

    PSQL_CMD="sudo -u postgres psql"
    PG_CONF="/etc/postgresql/16/main/postgresql.conf"
    PG_HBA="/etc/postgresql/16/main/pg_hba.conf"
fi

echo -e "${GREEN}✓ PostgreSQL instalado${NC}"

# =============================================================================
# Crear base de datos y usuario
# =============================================================================

echo "2. Creando base de datos y usuario..."

if [[ "$OS" == "macos" ]]; then
    # En macOS, el usuario actual puede crear bases de datos
    createdb "$DB_NAME" 2>/dev/null || echo "Base de datos ya existe"

    psql -d "$DB_NAME" << EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
    ELSE
        ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';
    END IF;
END
\$\$;

GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
EOF

else
    # En Linux, usar sudo -u postgres
    sudo -u postgres createdb "$DB_NAME" 2>/dev/null || echo "Base de datos ya existe"

    sudo -u postgres psql << EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
    ELSE
        ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';
    END IF;
END
\$\$;

GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

    sudo -u postgres psql -d "$DB_NAME" << EOF
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
EOF
fi

echo -e "${GREEN}✓ Base de datos y usuario creados${NC}"

# =============================================================================
# Configurar PostgreSQL para aceptar conexiones LAN
# =============================================================================

echo "3. Configurando PostgreSQL para aceptar conexiones de red local..."

if [[ "$OS" == "macos" ]]; then
    # En macOS, modificar postgresql.conf
    if [ -f "$PG_CONF" ]; then
        # Backup
        cp "$PG_CONF" "${PG_CONF}.backup"

        # Cambiar listen_addresses
        sed -i '' "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
        sed -i '' "s/listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"

        # Agregar regla en pg_hba.conf
        if ! grep -q "192.168" "$PG_HBA"; then
            echo "host    all    $DB_USER    192.168.0.0/16    scram-sha-256" >> "$PG_HBA"
        fi

        brew services restart postgresql@16
    fi
else
    # En Linux
    if [ -f "$PG_CONF" ]; then
        sudo cp "$PG_CONF" "${PG_CONF}.backup"

        sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
        sudo sed -i "s/listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"

        if ! sudo grep -q "192.168" "$PG_HBA"; then
            echo "host    all    $DB_USER    192.168.0.0/16    scram-sha-256" | sudo tee -a "$PG_HBA"
        fi

        sudo systemctl restart postgresql
    fi
fi

echo -e "${GREEN}✓ PostgreSQL configurado para conexiones LAN${NC}"

# =============================================================================
# Importar esquema
# =============================================================================

echo "4. Importando esquema de base de datos..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/../MIGRACION_CONSOLIDADA.sql"

if [ -f "$MIGRATION_FILE" ]; then
    if [[ "$OS" == "macos" ]]; then
        PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d "$DB_NAME" -h localhost -f "$MIGRATION_FILE"
    else
        PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d "$DB_NAME" -h localhost -f "$MIGRATION_FILE"
    fi
    echo -e "${GREEN}✓ Esquema importado${NC}"
else
    echo -e "${YELLOW}⚠ Archivo MIGRACION_CONSOLIDADA.sql no encontrado${NC}"
    echo "  Deberás importar el esquema manualmente después."
fi

# =============================================================================
# Crear archivo de configuración para las apps
# =============================================================================

echo "5. Generando archivo de configuración..."

CONFIG_CONTENT="# CentroVision EHR - Configuración del Cliente
# Copia este archivo a ~/.centrovision/config.toml en cada PC de la clínica

[supabase]
url = \"https://dlfgyupitvrqbxnucwsf.supabase.co\"
anon_key = \"TU_ANON_KEY_AQUI\"

[local_server]
host = \"$SERVER_IP\"
port = 5432
database = \"$DB_NAME\"
user = \"$DB_USER\"
password = \"$DB_PASS\"
enabled = true
"

echo "$CONFIG_CONTENT" > "$SCRIPT_DIR/client-config.toml"

echo -e "${GREEN}✓ Archivo de configuración generado: $SCRIPT_DIR/client-config.toml${NC}"

# =============================================================================
# Resumen
# =============================================================================

echo ""
echo -e "${GREEN}=============================================="
echo "  ¡Instalación completada!"
echo "==============================================${NC}"
echo ""
echo "Información del servidor:"
echo "  - IP: $SERVER_IP"
echo "  - Puerto: 5432"
echo "  - Base de datos: $DB_NAME"
echo "  - Usuario: $DB_USER"
echo ""
echo -e "${YELLOW}Próximos pasos:${NC}"
echo ""
echo "1. Copia el archivo 'client-config.toml' a cada PC de la clínica:"
echo "   mkdir -p ~/.centrovision"
echo "   cp client-config.toml ~/.centrovision/config.toml"
echo ""
echo "2. Edita el archivo y agrega tu SUPABASE_ANON_KEY"
echo ""
echo "3. Reinicia la app CentroVision en cada PC"
echo ""
echo "4. Verifica la conexión:"
echo "   psql -h $SERVER_IP -U $DB_USER -d $DB_NAME"
echo ""
echo -e "${GREEN}¡El servidor está listo!${NC}"
