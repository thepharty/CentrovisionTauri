-- ============================================================
-- FILE SYNC LOG - Para el servicio de sincronización de archivos
-- Ejecutar en PostgreSQL local del servidor Windows
-- ============================================================

-- Tabla para trackear archivos ya sincronizados a Supabase Storage
-- Esto evita subir el mismo archivo dos veces
CREATE TABLE IF NOT EXISTS _file_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    local_full_path TEXT NOT NULL,
    file_size BIGINT,
    file_hash TEXT,  -- MD5 o SHA256 del archivo (opcional, para detectar cambios)
    mime_type TEXT,
    sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bucket_name, file_path)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_file_sync_log_bucket ON _file_sync_log(bucket_name);
CREATE INDEX IF NOT EXISTS idx_file_sync_log_status ON _file_sync_log(sync_status);

-- ============================================================
-- QUERIES ÚTILES PARA EL SERVICIO
-- ============================================================

-- 1. Verificar si un archivo ya fue sincronizado
-- SELECT EXISTS(SELECT 1 FROM _file_sync_log WHERE bucket_name = $1 AND file_path = $2);

-- 2. Registrar archivo sincronizado
-- INSERT INTO _file_sync_log (bucket_name, file_path, local_full_path, file_size, mime_type)
-- VALUES ($1, $2, $3, $4, $5)
-- ON CONFLICT (bucket_name, file_path) DO UPDATE SET synced_at = NOW();

-- 3. Contar archivos sincronizados por bucket
-- SELECT bucket_name, COUNT(*) FROM _file_sync_log GROUP BY bucket_name;

-- 4. Archivos con error (para retry)
-- SELECT * FROM _file_sync_log WHERE sync_status = 'error';

-- 5. Marcar para re-sync (si el archivo cambió)
-- UPDATE _file_sync_log SET sync_status = 'pending' WHERE bucket_name = $1 AND file_path = $2;
