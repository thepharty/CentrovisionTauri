# Diagnóstico: Por qué no veo pipelines en el CRM

## Problema Identificado

He revisado el código y encontré la configuración. El problema puede deberse a varias razones:

## Verificaciones que debes hacer:

### 1. Verificar que existen datos en las tablas

Ejecuta estos queries en Supabase SQL Editor (https://supabase.com/dashboard/project/ydscwmgiiqhyovhzgnxr/editor):

```sql
-- Ver cuántos pipelines existen
SELECT COUNT(*) as total_pipelines FROM crm_pipelines;

-- Ver pipelines activos
SELECT
  p.id,
  p.status,
  p.current_stage,
  pat.first_name,
  pat.last_name,
  pt.name as procedure_name,
  p.created_at
FROM crm_pipelines p
LEFT JOIN patients pat ON p.patient_id = pat.id
LEFT JOIN crm_procedure_types pt ON p.procedure_type_id = pt.id
WHERE p.status = 'activo'
ORDER BY p.created_at DESC;

-- Ver todos los tipos de procedimiento
SELECT * FROM crm_procedure_types ORDER BY display_order;

-- Ver todas las sucursales
SELECT * FROM branches;
```

### 2. Verificar permisos RLS (Row Level Security)

El problema más probable es que las políticas RLS están bloqueando el acceso. Las políticas actuales solo permiten acceso a usuarios con rol 'admin'.

Verifica tu rol de usuario:

```sql
-- Ver tu usuario actual
SELECT
  auth.uid() as mi_user_id,
  p.full_name,
  p.role
FROM profiles p
WHERE p.user_id = auth.uid();
```

Si tu rol NO es 'admin', ese es el problema.

### 3. Solución: Agregar políticas RLS más permisivas

Si necesitas que otros roles puedan ver los pipelines, ejecuta:

```sql
-- Permitir que todos los usuarios autenticados vean pipelines
CREATE POLICY "Usuarios autenticados pueden ver pipelines"
  ON public.crm_pipelines FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Permitir que todos los usuarios autenticados vean stages
CREATE POLICY "Usuarios autenticados pueden ver pipeline stages"
  ON public.crm_pipeline_stages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Permitir que todos los usuarios autenticados vean notas
CREATE POLICY "Usuarios autenticados pueden ver pipeline notes"
  ON public.crm_pipeline_notes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Permitir que médicos y admin gestionen pipelines
CREATE POLICY "Médicos y admin pueden gestionar pipelines"
  ON public.crm_pipelines FOR INSERT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'doctor'::app_role)
  );

CREATE POLICY "Médicos y admin pueden actualizar pipelines"
  ON public.crm_pipelines FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'doctor'::app_role)
  );
```

### 4. Verificar filtros en la aplicación

El código filtra pipelines por:
- **Status**: Solo muestra pipelines con `status = 'activo'` (línea 76 de KanbanBoard.tsx)
- **Branch**: Filtra por sucursal actual
- **Flow Category**:
  - "Cirugías" (surgeries) muestra solo: CLEAR, TransPRK, FemtoLasik, Catarata, Cross Linking, Estrabismo
  - "Cirugías con Anticipo" (supplies) muestra: ICL, Anillos, Lente Tórico, Lente Multifocal, Lente Escleral

### 5. Crear datos de prueba

Si no tienes pipelines, crea uno de prueba:

```sql
-- Primero, obtén IDs necesarios
SELECT id, first_name, last_name FROM patients LIMIT 5;
SELECT id, name FROM crm_procedure_types LIMIT 5;
SELECT id, name FROM branches LIMIT 5;

-- Luego crea un pipeline de prueba (reemplaza los UUIDs)
INSERT INTO crm_pipelines (
  patient_id,
  procedure_type_id,
  branch_id,
  current_stage,
  eye_side,
  status,
  priority
) VALUES (
  'UUID_DEL_PACIENTE',      -- Reemplaza con un patient_id real
  'UUID_DEL_PROCEDIMIENTO', -- Reemplaza con un procedure_type_id real
  'UUID_DE_LA_SUCURSAL',    -- Reemplaza con un branch_id real
  'info',
  'OD',
  'activo',
  'normal'
);
```

## Checklist de diagnóstico:

- [ ] ¿Existen pipelines en la tabla? (Query #1)
- [ ] ¿Los pipelines tienen status = 'activo'?
- [ ] ¿Tu usuario tiene el rol correcto? (Query #2)
- [ ] ¿Las políticas RLS permiten ver los datos?
- [ ] ¿La sucursal actual (currentBranch) coincide con los pipelines?
- [ ] ¿Los procedimientos están en la categoría correcta (surgeries vs supplies)?
- [ ] ¿Hay errores en la consola del navegador? (F12 > Console)
- [ ] ¿Hay errores en la pestaña Network? (F12 > Network > busca requests a 'crm_pipelines')

## Siguiente paso después de configurar MCP:

Una vez que configures el MCP de Supabase, podrás pedirle a Claude directamente:

- "Muéstrame todos los pipelines de la tabla crm_pipelines"
- "Verifica las políticas RLS de la tabla crm_pipelines"
- "Cuántos pacientes tengo registrados?"
- "Muéstrame los últimos 5 registros de crm_pipelines"

Esto te permitirá diagnosticar más rápido sin tener que ir al dashboard de Supabase.
