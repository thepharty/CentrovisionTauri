-- ============================================================
-- QUERIES PARA ESTADO DE SINCRONIZACIÓN - CentroVision EHR
-- ============================================================
--
-- Estas queries son útiles para monitorear el estado de sync
-- entre PostgreSQL local y Supabase.
--
-- Ejecutar en: PostgreSQL local de la clínica (192.168.0.9)
-- ============================================================

-- ============================================================
-- QUERY: Contar cambios pendientes por tabla
-- ============================================================
-- Esta query es usada por la app Tauri para mostrar cuántos
-- cambios están pendientes de sincronizar a Supabase.

-- Vista para facilitar consultas de estado de sync
CREATE OR REPLACE VIEW sync_pending_summary AS
SELECT
    table_name,
    COUNT(*) as pending_count
FROM _sync_pending
GROUP BY table_name
ORDER BY pending_count DESC;

-- Función para obtener el total de pendientes
CREATE OR REPLACE FUNCTION get_total_sync_pending()
RETURNS BIGINT AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM _sync_pending);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- QUERY: Ver detalle de cambios pendientes
-- ============================================================
-- Útil para debugging

-- SELECT * FROM _sync_pending ORDER BY created_at DESC LIMIT 20;

-- ============================================================
-- QUERY: Limpiar registros sincronizados antiguos (opcional)
-- ============================================================
-- Si la tabla _sync_pending acumula muchos registros ya procesados,
-- puedes limpiarla periódicamente.

-- DELETE FROM _sync_pending
-- WHERE synced_at IS NOT NULL
--   AND synced_at < NOW() - INTERVAL '7 days';

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- Ejecutar para verificar que todo está correcto:

/*
-- Ver resumen de pendientes
SELECT * FROM sync_pending_summary;

-- Ver total
SELECT get_total_sync_pending();

-- Ver estructura de _sync_pending (si existe)
\d _sync_pending
*/

-- ============================================================
-- FIN
-- ============================================================
