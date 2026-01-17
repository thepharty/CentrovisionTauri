-- Eliminar la política existente y crear una nueva que incluya el rol diagnostico
DROP POLICY IF EXISTS clinico_delete_appointments ON appointments;

CREATE POLICY clinico_delete_appointments ON appointments 
FOR DELETE TO authenticated 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);