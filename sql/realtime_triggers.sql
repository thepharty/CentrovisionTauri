-- ============================================================
-- TRIGGERS PARA REALTIME LOCAL - CentroVision EHR
-- ============================================================
--
-- Este script crea los triggers necesarios para que PostgreSQL
-- emita eventos NOTIFY cuando cambian los datos.
--
-- Ejecutar en: PostgreSQL local de la clínica
-- Requiere: Ejecutar DESPUÉS de crear las tablas
-- ============================================================

-- ============================================================
-- FUNCIÓN GENÉRICA DE NOTIFICACIÓN
-- ============================================================

CREATE OR REPLACE FUNCTION notify_table_changes()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
    record_id UUID;
BEGIN
    -- Obtener el ID del registro (NEW para INSERT/UPDATE, OLD para DELETE)
    IF TG_OP = 'DELETE' THEN
        record_id := OLD.id;
    ELSE
        record_id := NEW.id;
    END IF;

    -- Construir el payload JSON
    payload := json_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'id', record_id::text
    );

    -- Emitir la notificación en el canal correspondiente
    PERFORM pg_notify(TG_TABLE_NAME || '_changes', payload::text);

    -- Retornar el registro apropiado
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS PARA TABLAS PRINCIPALES
-- ============================================================

-- APPOINTMENTS (Citas)
DROP TRIGGER IF EXISTS appointments_notify_trigger ON appointments;
CREATE TRIGGER appointments_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- SCHEDULE_BLOCKS (Bloqueos de agenda)
DROP TRIGGER IF EXISTS schedule_blocks_notify_trigger ON schedule_blocks;
CREATE TRIGGER schedule_blocks_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON schedule_blocks
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- PATIENTS (Pacientes)
DROP TRIGGER IF EXISTS patients_notify_trigger ON patients;
CREATE TRIGGER patients_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON patients
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- ENCOUNTERS (Encuentros/Consultas)
DROP TRIGGER IF EXISTS encounters_notify_trigger ON encounters;
CREATE TRIGGER encounters_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON encounters
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- INVOICES (Facturas)
DROP TRIGGER IF EXISTS invoices_notify_trigger ON invoices;
CREATE TRIGGER invoices_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- ============================================================
-- TRIGGERS OPCIONALES (para otras tablas)
-- ============================================================

-- CRM_PIPELINES
DROP TRIGGER IF EXISTS crm_pipelines_notify_trigger ON crm_pipelines;
CREATE TRIGGER crm_pipelines_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON crm_pipelines
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- CRM_PIPELINE_STAGES
DROP TRIGGER IF EXISTS crm_pipeline_stages_notify_trigger ON crm_pipeline_stages;
CREATE TRIGGER crm_pipeline_stages_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON crm_pipeline_stages
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- CRM_ACTIVITY_LOG (Para notificaciones de actividad CRM)
DROP TRIGGER IF EXISTS crm_activity_log_notify_trigger ON crm_activity_log;
CREATE TRIGGER crm_activity_log_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON crm_activity_log
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- CRM_PIPELINE_NOTES (Notas de pipelines)
DROP TRIGGER IF EXISTS crm_pipeline_notes_notify_trigger ON crm_pipeline_notes;
CREATE TRIGGER crm_pipeline_notes_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON crm_pipeline_notes
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- CRM_ACTIVITY_READ (Lecturas de actividad)
DROP TRIGGER IF EXISTS crm_activity_read_notify_trigger ON crm_activity_read;
CREATE TRIGGER crm_activity_read_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON crm_activity_read
FOR EACH ROW EXECUTE FUNCTION notify_table_changes();

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- Ejecutar esta consulta para verificar que los triggers existen:
/*
SELECT
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%_notify_trigger'
ORDER BY event_object_table;
*/

-- ============================================================
-- PRUEBA MANUAL
-- ============================================================

-- Para probar que funciona, abrir 2 conexiones a PostgreSQL:
--
-- Conexión 1 (escucha):
--   LISTEN appointments_changes;
--
-- Conexión 2 (modificar):
--   UPDATE appointments SET status = 'confirmed' WHERE id = '...' ;
--
-- En Conexión 1 debería aparecer:
--   Asynchronous notification "appointments_changes" with payload "{"table":"appointments","operation":"UPDATE","id":"..."}"

-- ============================================================
-- FIN
-- ============================================================
