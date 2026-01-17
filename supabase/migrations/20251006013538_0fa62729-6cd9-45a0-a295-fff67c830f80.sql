-- Actualizar política para permitir que personal de diagnóstico también pueda crear pacientes
DROP POLICY IF EXISTS "Recepción y admins pueden crear pacientes" ON public.patients;

CREATE POLICY "Personal autorizado puede crear pacientes" 
ON public.patients 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role) OR 
  has_role(auth.uid(), 'diagnostico'::app_role)
);