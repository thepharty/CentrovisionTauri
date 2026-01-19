# EDGE FUNCTIONS - CentroVisión
=======================================

Fecha de exportación: 2026-01-16T23:10:01.990Z

## FUNCIONES INCLUIDAS

1. **approve-registration**
   - Propósito: Gestión de registro de usuarios
   - Descripción: Aprueba registros pendientes y crea usuarios en el sistema

2. **cleanup-old-photos**
   - Propósito: Mantenimiento de storage
   - Descripción: Limpia fotos antiguas del storage para liberar espacio

3. **create-user**
   - Propósito: Gestión de usuarios
   - Descripción: Crea usuarios nuevos con roles y permisos

4. **delete-user**
   - Propósito: Gestión de usuarios
   - Descripción: Elimina usuarios del sistema de forma segura

5. **export-migrations**
   - Propósito: Herramienta de migración
   - Descripción: Genera el SQL completo del esquema de la base de datos

6. **generate-prescription-pdf**
   - Propósito: Documentos clínicos
   - Descripción: Genera PDFs de recetas médicas

7. **submit-registration**
   - Propósito: Gestión de registro de usuarios
   - Descripción: Recibe y procesa solicitudes de registro de usuarios

8. **update-user-password**
   - Propósito: Gestión de usuarios
   - Descripción: Permite a administradores cambiar contraseñas de usuarios


## CÓMO DESPLEGAR EN EL NUEVO PROYECTO

### Opción 1: Usando Supabase CLI (Recomendado)

1. Instala Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Inicia sesión:
   ```bash
   supabase login
   ```

3. Vincula tu proyecto:
   ```bash
   supabase link --project-ref TU_PROJECT_REF
   ```

4. Copia la carpeta 'functions' a tu proyecto local en 'supabase/functions/'

5. Despliega todas las funciones:
   ```bash
   supabase functions deploy
   ```

### Opción 2: Manualmente en Supabase Dashboard

1. Ve a Edge Functions en tu proyecto Supabase
2. Crea una nueva función con el mismo nombre
3. Copia el contenido del index.ts correspondiente
4. Guarda y despliega

## CONFIGURACIÓN IMPORTANTE

Algunas funciones requieren variables de entorno o secrets:

- **SUPABASE_SERVICE_ROLE_KEY**: Ya está disponible automáticamente
- **SUPABASE_URL**: Ya está disponible automáticamente

## NOTAS

- Las funciones que modifican usuarios (approve-registration, create-user, 
  delete-user, update-user-password) usan SERVICE_ROLE_KEY para 
  operaciones administrativas.

- Asegúrate de que las políticas RLS estén correctamente configuradas
  antes de desplegar las funciones.

- Prueba cada función después de desplegarla para verificar que funciona
  correctamente con el nuevo proyecto.
