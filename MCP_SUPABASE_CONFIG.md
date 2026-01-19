# Configuración del MCP de Supabase en Claude Code (VS Code)

## Paso 1: Instalar el servidor MCP de Supabase

```bash
npm install -g @supabase/mcp-server-supabase
```

**NOTA**: Ya NO necesitas generar un Personal Access Token (PAT). El cliente MCP ahora te redirige automáticamente para iniciar sesión en Supabase durante la configuración.

## Paso 2: Obtener tus credenciales de Supabase

Ya tienes las credenciales en tu archivo `.env`:

- **Project ID**: `ydscwmgiiqhyovhzgnxr`
- **URL**: `https://ydscwmgiiqhyovhzgnxr.supabase.co`
- **Anon Key**: La clave que empieza con `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

Necesitarás también obtener tu **Service Role Key** desde el dashboard de Supabase:
1. Ve a https://supabase.com/dashboard/project/ydscwmgiiqhyovhzgnxr/settings/api
2. Copia la "service_role key" (NO la anon key)

## Paso 3: Configurar Claude Code en VS Code

### Opción A: Configuración en settings.json de VS Code

1. Abre la paleta de comandos (Cmd+Shift+P en Mac, Ctrl+Shift+P en Windows/Linux)
2. Busca "Preferences: Open User Settings (JSON)"
3. Agrega la siguiente configuración:

```json
{
  "claude.mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase"
      ],
      "env": {
        "SUPABASE_URL": "https://ydscwmgiiqhyovhzgnxr.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "TU_SERVICE_ROLE_KEY_AQUI"
      }
    }
  }
}
```

### Opción B: Configuración en archivo de configuración de Claude

Alternativamente, puedes crear/editar el archivo de configuración de Claude:

**En Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**En Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**En Linux**: `~/.config/Claude/claude_desktop_config.json`

Contenido:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase"
      ],
      "env": {
        "SUPABASE_URL": "https://ydscwmgiiqhyovhzgnxr.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "TU_SERVICE_ROLE_KEY_AQUI"
      }
    }
  }
}
```

## Paso 4: Reiniciar VS Code

Después de configurar, reinicia VS Code para que los cambios surtan efecto.

## Paso 5: Verificar la conexión

Una vez configurado, podrás:
- Consultar tablas de Supabase directamente desde Claude Code
- Ejecutar queries SQL
- Ver datos de `crm_pipelines`, `crm_procedure_types`, etc.

## Comandos útiles que podrás usar

Una vez configurado el MCP, podrás pedirle a Claude:
- "Muéstrame todas las tablas de la base de datos"
- "Consulta todos los registros de crm_pipelines"
- "Cuántos pipelines activos hay?"
- "Muéstrame la estructura de la tabla crm_pipeline_stages"

---

## Troubleshooting

### Si no puedes instalar globalmente con npm:

Usa npx directamente en la configuración (ya incluido arriba con `-y` flag).

### Si el servidor no inicia:

1. Verifica que Node.js esté instalado: `node --version`
2. Verifica que tienes la service_role_key correcta
3. Revisa los logs de Claude Code en la consola de VS Code

### Si necesitas la service_role_key:

Ve a: https://supabase.com/dashboard/project/ydscwmgiiqhyovhzgnxr/settings/api
