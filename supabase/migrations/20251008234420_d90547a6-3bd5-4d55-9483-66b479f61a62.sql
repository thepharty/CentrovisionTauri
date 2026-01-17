-- Crear función para obtener estadísticas de almacenamiento
-- Esta función tiene SECURITY DEFINER para poder acceder a storage.objects
CREATE OR REPLACE FUNCTION public.get_storage_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  stats json;
BEGIN
  -- Agregar estadísticas por bucket
  SELECT json_agg(bucket_stats)
  INTO stats
  FROM (
    SELECT 
      bucket_id,
      COUNT(*)::int as total_files,
      COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint as total_bytes
    FROM storage.objects
    WHERE bucket_id IN ('documents', 'results', 'studies')
    GROUP BY bucket_id
  ) bucket_stats;
  
  -- Retornar array vacío si no hay datos
  RETURN COALESCE(stats, '[]'::json);
END;
$$;

-- Política RLS para que admins puedan ejecutar la función
-- (Las funciones SECURITY DEFINER se ejecutan con privilegios del creador,
-- pero igual verificamos el rol por seguridad)