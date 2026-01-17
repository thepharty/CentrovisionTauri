CREATE OR REPLACE FUNCTION public.get_storage_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  stats json;
BEGIN
  SELECT json_agg(bucket_stats)
  INTO stats
  FROM (
    SELECT 
      bucket_id,
      COUNT(*)::int as total_files,
      COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint as total_bytes
    FROM storage.objects
    WHERE bucket_id IN ('documents', 'results', 'studies', 'surgeries')
    GROUP BY bucket_id
  ) bucket_stats;
  
  RETURN COALESCE(stats, '[]'::json);
END;
$$;