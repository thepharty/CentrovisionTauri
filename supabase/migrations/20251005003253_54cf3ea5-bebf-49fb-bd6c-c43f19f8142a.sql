-- Políticas RLS para el bucket 'results' donde se suben las fotos

-- Permitir a usuarios autenticados subir archivos
CREATE POLICY "Usuarios autenticados pueden subir archivos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'results');

-- Permitir a usuarios autenticados ver archivos
CREATE POLICY "Usuarios autenticados pueden ver archivos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'results');

-- Permitir a usuarios autenticados actualizar archivos
CREATE POLICY "Usuarios autenticados pueden actualizar archivos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'results');

-- Permitir a usuarios autenticados eliminar archivos
CREATE POLICY "Usuarios autenticados pueden eliminar archivos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'results');