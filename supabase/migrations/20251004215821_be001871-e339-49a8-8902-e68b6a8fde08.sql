-- Agregar política RLS para permitir que admins y recepción borren pacientes
CREATE POLICY "Admins y recepción pueden borrar pacientes"
ON public.patients
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role)
);

-- Asegurar que cuando se borra un paciente, se borren sus citas en cascada
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_patient_id_fkey,
ADD CONSTRAINT appointments_patient_id_fkey 
  FOREIGN KEY (patient_id) 
  REFERENCES public.patients(id) 
  ON DELETE CASCADE;

-- Asegurar que cuando se borra un paciente, se borren sus encuentros en cascada
ALTER TABLE public.encounters 
DROP CONSTRAINT IF EXISTS encounters_patient_id_fkey,
ADD CONSTRAINT encounters_patient_id_fkey 
  FOREIGN KEY (patient_id) 
  REFERENCES public.patients(id) 
  ON DELETE CASCADE;