# Guía Completa de Migración - CentroVision

Esta guía te llevará paso a paso para migrar todo el sistema a un nuevo proyecto de Supabase sin errores.

## 📋 Resumen del Proceso

```
ORIGEN (Sistema actual)                    DESTINO (Nuevo Supabase)
├── 1. Exportar datos (ZIP)                ├── 2. Crear proyecto
├── 1. Exportar usuarios (Script)          ├── 3. Ejecutar migraciones SQL
├── 1. Exportar migraciones SQL            ├── 4. Ejecutar script de usuarios ⚠️
├── 1. Validar CSVs (Dry-run)             ├── 5. Desactivar FKs (SQL)
└── 1. Exportar storage                    ├── 6. Importar CSVs (cualquier orden)
                                           ├── 7. Reactivar FKs (SQL)
                                           ├── 8. Verificar integridad
                                           └── 9. Subir archivos storage
```

---

## FASE 1: Preparación y Exportación (Sistema Origen)

### 1.1 Exportar Datos
1. Ve a **Admin → Exportar Datos**
2. Click en **"Exportar Todo (ZIP)"** - Espera a que complete
3. Guarda el archivo `full_export_FECHA.zip`

### 1.2 Exportar Script de Usuarios ⚠️ CRÍTICO
1. Click en **"Script Migración Usuarios"**
2. Guarda el ZIP que contiene `create_users.js` y `update_profiles.sql`

### 1.3 Exportar Migraciones SQL
1. Click en **"Descargar Migraciones SQL"**
2. Guarda el archivo `migrations_FECHA.sql`

### 1.4 Validar CSVs (Opcional pero recomendado)
1. Click en **"Validar CSVs Antes de Importar"**
2. Carga el ZIP exportado
3. Revisa el reporte:
   - ✅ Verde = Listo para importar
   - ⚠️ Amarillo = Requiere importar tabla padre primero
   - ❌ Rojo = Referencia inválida (datos huérfanos)
   - 🔐 Azul = Referencias a auth.users

### 1.5 Exportar Storage
1. Descarga cada bucket: `documents`, `results`, `studies`, `surgeries`

---

## FASE 2: Crear Proyecto Destino

1. Ve a [supabase.com](https://supabase.com) y crea cuenta si no tienes
2. Click **"New Project"**
3. Configura:
   - Nombre: ej. `centrovision-produccion`
   - Contraseña: **FUERTE y guardada en lugar seguro**
   - Región: La más cercana a tus usuarios
4. Espera 2-3 minutos a que se cree
5. **Guarda estos valores** (Settings → API):
   - `Project URL`
   - `anon/public key`
   - `service_role key` (secreto)
   - `Project ID` (de la URL)

---

## FASE 3: Ejecutar Migraciones SQL

### ⭐ Opción A: Migración Consolidada (RECOMENDADA)

Usa el archivo `MIGRACION_CONSOLIDADA_FECHA.sql`:

1. En Supabase Dashboard → **SQL Editor**
2. Click **"+ New query"**
3. Copia TODO el contenido del archivo consolidado
4. Click **"Run"**
5. Verifica que diga "Success"

**Ventajas:**
- ✅ Un solo archivo en lugar de 120+
- ✅ Esquema completo desde el inicio
- ✅ Incluye columnas como `deleted_at` automáticamente
- ✅ Sin errores de columnas faltantes al importar CSVs

### Opción B: Migraciones Individuales (más lento)

Usa el archivo `migrations_FECHA.sql`:

1. En Supabase Dashboard → **SQL Editor**
2. Click **"+ New query"**
3. Copia TODO el contenido de `migrations_FECHA.sql`
4. Click **"Run"**

> ⚠️ Si hay errores de "already exists", ignóralos.
> ⚠️ Puede que falten columnas agregadas posteriormente (como `deleted_at`)

---

## FASE 4: Crear Usuarios con Script ⚠️ ANTES de importar datos

Este paso es **CRÍTICO** porque preserva los UUIDs originales de los usuarios.

### ⚠️ Dependencias de auth.users (20 tablas afectadas)

Estas tablas requieren que los usuarios existan en auth.users **ANTES** de importar:

#### Referencias DIRECTAS a auth.users (6 tablas):
| Tabla | Columna | Nullable |
|-------|---------|----------|
| profiles | user_id | NO |
| user_roles | user_id | NO |
| user_branches | user_id | NO |
| crm_activity_read | user_id | NO |
| room_inventory_movements | user_id | SÍ |
| audit_logs | user_id | SÍ |

#### Referencias INDIRECTAS vía profiles.user_id (14 tablas, 20 columnas):
| Tabla | Columnas |
|-------|----------|
| edge_function_settings | disabled_by |
| crm_pipelines | doctor_id, created_by |
| crm_pipeline_stages | created_by, updated_by |
| crm_pipeline_notes | created_by |
| crm_activity_log | created_by |
| appointments | doctor_id |
| schedule_blocks | doctor_id, created_by |
| encounters | doctor_id |
| inventory_movements | created_by |
| documents | created_by |
| invoices | created_by |
| payments | created_by |
| cash_closures | closed_by |
| backup_snapshots | created_by |

> 💡 **Por eso es CRÍTICO** ejecutar el script de usuarios (FASE 4) **ANTES** de importar CSVs.

### 4.1 Preparar entorno
```bash
# Crear carpeta
mkdir migration-users
cd migration-users

# Copiar create_users.js aquí
# (desde el ZIP de user_migration_scripts)

# Inicializar proyecto Node
npm init -y
npm install @supabase/supabase-js
```

### 4.2 Configurar script
Edita `create_users.js` y cambia:
```javascript
const SUPABASE_URL = 'https://TU-PROJECT-ID.supabase.co';
const SERVICE_ROLE_KEY = 'tu-service-role-key-aqui';
```

### 4.3 Ejecutar
```bash
node create_users.js
```

### 4.4 Verificar
- Ve a Supabase Dashboard → Authentication → Users
- Confirma que aparecen todos los usuarios

### 4.5 Actualizar Profiles (después de importar CSVs)
Ejecuta `update_profiles.sql` en SQL Editor para vincular emails.

---

## FASE 5: Importar Datos (CSVs)

### Método A: Con FKs desactivadas (Recomendado)

#### 5.1 Desactivar validación de FKs
En SQL Editor, ejecuta:
```sql
SET session_replication_role = 'replica';
```

#### 5.2 Importar CSVs
1. Ve a **Table Editor**
2. Para cada tabla:
   - Selecciona la tabla
   - Click **"Import data from CSV"**
   - Sube el CSV correspondiente

> 💡 Con FKs desactivadas puedes importar en cualquier orden

#### 5.3 Reactivar validación de FKs
```sql
SET session_replication_role = 'origin';
```

### Método B: Sin desactivar FKs (orden estricto)

Sigue el orden en `_IMPORT_ORDER.txt`:
1. branches
2. suppliers
3. patients
4. ... (seguir el orden exacto)

---

## FASE 6: Verificar Integridad

Ejecuta estas queries para detectar huérfanos:

```sql
-- Verificar encounters sin patient
SELECT 'encounters sin patient' as check_name, COUNT(*) 
FROM encounters e
LEFT JOIN patients p ON e.patient_id = p.id
WHERE e.patient_id IS NOT NULL AND p.id IS NULL;

-- Verificar crm_pipelines sin patient
SELECT 'crm_pipelines sin patient' as check_name, COUNT(*) 
FROM crm_pipelines cp
LEFT JOIN patients p ON cp.patient_id = p.id
WHERE p.id IS NULL;

-- Verificar surgeries sin encounter
SELECT 'surgeries sin encounter' as check_name, COUNT(*)
FROM surgeries s
LEFT JOIN encounters e ON s.encounter_id = e.id
WHERE e.id IS NULL;
```

✅ Si todos los counts son 0, la importación fue exitosa.

---

## FASE 7: Subir Archivos de Storage

1. Ve a **Storage** en Supabase Dashboard
2. Crea los 4 buckets:
   - `documents`
   - `results`
   - `studies`
   - `surgeries`
3. Descomprime cada ZIP de bucket
4. Sube los archivos manteniendo la estructura de carpetas

---

## FASE 8: Configuración Final

### 8.1 Authentication Settings
1. Ve a Authentication → Settings
2. Configura **Site URL** con la URL de tu aplicación

### 8.2 Actualizar .env
```env
VITE_SUPABASE_URL=https://tu-nuevo-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu-anon-key
```

### 8.3 Edge Functions
Despliega las edge functions desde tu código.

### 8.4 Notificar usuarios
Los usuarios deben usar "Olvidé mi contraseña" para crear una nueva.

---

## 🎉 ¡Migración Completa!

### Checklist Final
- [ ] Datos importados correctamente
- [ ] Sin errores de integridad (huérfanos)
- [ ] Usuarios pueden hacer login
- [ ] Archivos de storage accesibles
- [ ] Edge functions funcionando

---

## 🔧 Solución de Problemas

### Error: "violates foreign key constraint"
- **Causa**: Intentaste importar sin desactivar FKs o en orden incorrecto
- **Solución**: Ejecuta `SET session_replication_role = 'replica';` primero

### Error: "User already exists"
- **Causa**: El script de usuarios ya se ejecutó
- **Solución**: Puedes ignorar, o borrar usuarios y re-ejecutar

### Datos no aparecen
- **Causa**: Puede ser tema de RLS
- **Solución**: Verifica que las políticas RLS estén configuradas

### Referencias rotas (null donde no debería)
- **Causa**: Huérfanos en los datos originales
- **Solución**: Usa el validador pre-importación para detectarlos antes
