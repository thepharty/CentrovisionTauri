# Guía Completa de Migración - CentroVision

## 📋 Índice
1. [Preparación](#1-preparación)
2. [Crear nuevo proyecto Supabase](#2-crear-nuevo-proyecto-supabase)
3. [Ejecutar migraciones SQL](#3-ejecutar-migraciones-sql)
4. [Configurar Storage Buckets](#4-configurar-storage-buckets)
5. [Importar datos](#5-importar-datos)
6. [Configurar Edge Functions](#6-configurar-edge-functions)
7. [Conectar Supabase al Codebase](#7-conectar-supabase-al-codebase)
8. [Configurar Autenticación](#8-configurar-autenticación)
9. [Deploy en servicios de hosting](#9-deploy-en-servicios-de-hosting)
10. [Verificación final](#10-verificación-final)

---

## 1. Preparación

### Descargar el código fuente
1. En Lovable, ve a **Settings → GitHub** y conecta tu cuenta
2. Transfiere el proyecto a tu GitHub
3. Clona el repositorio en tu máquina local:
   ```bash
   git clone https://github.com/tu-usuario/tu-proyecto.git
   cd tu-proyecto
   ```

### Exportar datos del Supabase actual
1. Ve al **Panel de Administración** en la app
2. Activa la sección de exportación (10 clicks rápidos en "Panel de Administración")
3. Descarga:
   - Archivo ZIP de migraciones SQL
   - Archivos JSON de cada tabla

---

## 2. Crear nuevo proyecto Supabase

1. Ve a [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click en **"New Project"**
3. Configura:
   - **Name**: Nombre de tu proyecto
   - **Database Password**: Guárdala en lugar seguro
   - **Region**: Selecciona la más cercana a tus usuarios
4. Espera a que el proyecto se cree (~2 minutos)

---

## 3. Ejecutar migraciones SQL

1. En tu proyecto Supabase, ve a **SQL Editor**
2. Ejecuta los archivos SQL en este orden:
   - `01_create_enums.sql` - Tipos enumerados
   - `02_create_tables.sql` - Tablas principales
   - `03_create_functions.sql` - Funciones de base de datos
   - `04_create_triggers.sql` - Triggers
   - `05_create_rls_policies.sql` - Políticas de seguridad
   - `06_create_storage.sql` - Configuración de storage

⚠️ **Importante**: Ejecuta cada archivo por separado y verifica que no haya errores antes de continuar.

---

## 4. Configurar Storage Buckets

1. Ve a **Storage** en el dashboard de Supabase
2. Crea los siguientes buckets:
   - `documents` (privado)
   - `results` (privado)
   - `studies` (privado)
   - `surgeries` (privado)

3. Sube los archivos exportados a cada bucket correspondiente

---

## 5. Importar datos

### Opción A: Usando el SQL Editor
1. Convierte los JSON exportados a sentencias INSERT
2. Ejecuta en el SQL Editor

### Opción B: Usando la API de Supabase
```javascript
// Ejemplo con Node.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('TU_SUPABASE_URL', 'TU_SERVICE_ROLE_KEY');

// Importar datos
const data = require('./patients.json');
const { error } = await supabase.from('patients').insert(data);
```

### Orden de importación (respetar por foreign keys):
1. `branches`
2. `patients`
3. `profiles`
4. `user_roles`
5. `rooms`
6. `appointments`
7. `encounters`
8. El resto de tablas

---

## 6. Configurar Edge Functions

1. Ve a **Edge Functions** en Supabase
2. Crea las siguientes funciones:
   - `approve-registration`
   - `create-user`
   - `delete-user`
   - `generate-prescription-pdf`
   - `submit-registration`
   - `update-user-password`

3. El código de cada función está en la carpeta `supabase/functions/` del proyecto

---

## 7. Conectar Supabase al Codebase

### 7.1 Obtener credenciales de Supabase

1. Ve a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard)
2. Click en **Settings** (ícono de engranaje) → **API**
3. Aquí encontrarás:

| Credencial | Dónde encontrarla | Variable de entorno |
|------------|-------------------|---------------------|
| **Project URL** | Sección "Project URL" | `VITE_SUPABASE_URL` |
| **anon/public key** | Sección "Project API keys" → `anon` `public` | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| **Project Reference ID** | En la URL del dashboard: `https://supabase.com/dashboard/project/[ESTE_ES_EL_ID]` | `VITE_SUPABASE_PROJECT_ID` |

### 7.2 Configurar archivo `.env`

Crea o edita el archivo `.env` en la raíz del proyecto:

```env
VITE_SUPABASE_PROJECT_ID="tu_project_id_aqui"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
VITE_SUPABASE_URL="https://tu_project_id.supabase.co"
```

### 7.3 Verificar conexión

El archivo `src/integrations/supabase/client.ts` ya está configurado para leer estas variables:

```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

**No necesitas modificar este archivo**, solo asegúrate de que las variables de entorno estén correctas.

### 7.4 Probar localmente

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

Abre `http://localhost:5173` y verifica que la conexión funcione.

---

## 8. Configurar Autenticación

⚠️ **IMPORTANTE**: Las contraseñas de usuarios NO se pueden migrar directamente.

### Opciones:

**Opción A**: Resetear contraseñas
1. Notifica a los usuarios que deben resetear su contraseña
2. Usa la función "Olvidé mi contraseña"

**Opción B**: Crear usuarios manualmente
1. Ve a **Authentication → Users** en Supabase
2. Click en "Add user"
3. Ingresa email y contraseña temporal
4. Notifica a cada usuario su nueva contraseña

### Configurar Auto-confirm (desarrollo)
1. Ve a **Authentication → Settings**
2. En "Email Auth", habilita "Enable email confirmations" = OFF (para desarrollo)

---

## 9. Deploy en servicios de hosting

### Vercel

1. Conecta tu repositorio de GitHub a Vercel
2. En **Settings → Environment Variables**, agrega:

| Variable | Valor |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://tu_project_id.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `VITE_SUPABASE_PROJECT_ID` | `tu_project_id` |

3. Deploy

### Netlify

1. Conecta tu repositorio de GitHub a Netlify
2. En **Site settings → Environment variables**, agrega las mismas variables
3. En **Build settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy

### Configurar dominio personalizado

1. En Vercel/Netlify, ve a **Domains**
2. Agrega tu dominio
3. Configura los DNS según las instrucciones

### ⚠️ Actualizar URLs en Supabase

Después de tener tu URL de producción:

1. Ve a **Authentication → URL Configuration** en Supabase
2. Actualiza:
   - **Site URL**: `https://tu-dominio.com`
   - **Redirect URLs**: Agrega `https://tu-dominio.com/**`

---

## 10. Verificación final

### Checklist de verificación:

- [ ] Todas las tablas tienen datos
- [ ] Los usuarios pueden iniciar sesión
- [ ] Los storage buckets tienen los archivos
- [ ] Las Edge Functions responden correctamente
- [ ] Los roles y permisos funcionan
- [ ] La app carga sin errores en consola
- [ ] Los formularios guardan datos correctamente

### Pruebas recomendadas:

1. **Login**: Iniciar sesión con diferentes roles
2. **CRUD**: Crear, leer, actualizar y eliminar registros
3. **Archivos**: Subir y descargar archivos
4. **Reportes**: Generar reportes y exportaciones

---

## 🆘 Solución de problemas

### Error: "Invalid API key"
- Verifica que `VITE_SUPABASE_PUBLISHABLE_KEY` sea la clave `anon` (public), no la `service_role`

### Error: "Database connection failed"
- Verifica que `VITE_SUPABASE_URL` tenga el formato correcto: `https://[project_id].supabase.co`

### Error: "CORS policy"
- En Supabase, ve a **Authentication → URL Configuration**
- Agrega tu dominio a las URLs permitidas

### Los datos no aparecen
- Verifica las políticas RLS en las tablas
- Para desarrollo, puedes desactivar RLS temporalmente:
  ```sql
  ALTER TABLE nombre_tabla DISABLE ROW LEVEL SECURITY;
  ```

### Edge Functions no funcionan
- Verifica que estén deployadas correctamente
- Revisa los logs en **Edge Functions → Logs**

---

## 📞 Soporte

Si encuentras problemas durante la migración:
1. Revisa los logs de Supabase
2. Verifica la consola del navegador
3. Consulta la [documentación de Supabase](https://supabase.com/docs)

---

*Última actualización: Diciembre 2024*
