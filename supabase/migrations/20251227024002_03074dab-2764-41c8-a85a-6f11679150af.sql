-- Política especial para el primer admin bootstrap
-- Solo permite insertar rol 'admin' si NO existe ningún admin en el sistema
CREATE POLICY "first_admin_bootstrap"
ON public.user_roles
FOR INSERT
WITH CHECK (
  role = 'admin' 
  AND user_id = auth.uid()
  AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
);