-- Eliminar política existente de gestión completa
DROP POLICY IF EXISTS "Personal clínico puede gestionar citas" ON public.appointments;

-- Crear políticas granulares

-- INSERT: Personal clínico + caja pueden crear citas
CREATE POLICY "clinico_caja_insert_appointments"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR 
  has_role(auth.uid(), 'diagnostico'::app_role) OR
  has_role(auth.uid(), 'caja'::app_role)
);

-- UPDATE: Personal clínico + caja pueden actualizar citas
CREATE POLICY "clinico_caja_update_appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR 
  has_role(auth.uid(), 'diagnostico'::app_role) OR
  has_role(auth.uid(), 'caja'::app_role)
);

-- DELETE: Solo admin, reception y doctor pueden eliminar
CREATE POLICY "clinico_delete_appointments"
ON public.appointments
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role)
);