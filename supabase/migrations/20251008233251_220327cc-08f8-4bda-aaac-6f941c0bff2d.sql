-- Habilitar extensiones necesarias para limpieza automática y monitoreo
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Política RLS para que admins puedan ver estadísticas de storage
CREATE POLICY "Admins pueden ver estadísticas de almacenamiento"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Programar limpieza automática diaria a las 3 AM
-- Esto ejecutará el edge function cleanup-old-photos cada día
SELECT cron.schedule(
  'cleanup-old-preconsult-photos',
  '0 3 * * *', -- 3 AM todos los días
  $$
  SELECT
    net.http_post(
        url:='https://ydscwmgiiqhyovhzgnxr.supabase.co/functions/v1/cleanup-old-photos',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkc2N3bWdpaXFoeW92aHpnbnhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTU2NzcxMSwiZXhwIjoyMDc1MTQzNzExfQ.Z9Xfj_VfhXFE4zLj8p_wZYFp8OxQy9xCIyG6C6YQbqg"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);