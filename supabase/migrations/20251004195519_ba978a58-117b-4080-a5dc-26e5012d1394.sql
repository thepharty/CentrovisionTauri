-- Crear política que permite insertar rol durante el registro
-- Solo si el usuario está creando su propio rol y no existe uno previo
CREATE POLICY "Usuarios pueden crear su propio rol inicial"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid()
  )
);