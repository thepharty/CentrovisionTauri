-- Allow doctors to update specific medical history fields on patients
-- 1) Create UPDATE policy for doctors on patients
CREATE POLICY "Médicos pueden actualizar antecedentes de pacientes"
ON public.patients
FOR UPDATE
USING (public.has_role(auth.uid(), 'doctor'))
WITH CHECK (public.has_role(auth.uid(), 'doctor'));

-- 2) Create trigger function to restrict what columns a doctor can modify
CREATE OR REPLACE FUNCTION public.enforce_doctor_patient_update_columns()
RETURNS trigger AS $$
DECLARE
  is_doctor boolean;
BEGIN
  is_doctor := public.has_role(auth.uid(), 'doctor');

  IF is_doctor THEN
    -- Doctors can only modify these fields: diabetes, hta, allergies, notes, ophthalmic_history
    IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
       OR (NEW.last_name IS DISTINCT FROM OLD.last_name)
       OR (NEW.phone IS DISTINCT FROM OLD.phone)
       OR (NEW.email IS DISTINCT FROM OLD.email)
       OR (NEW.address IS DISTINCT FROM OLD.address)
       OR (NEW.dob IS DISTINCT FROM OLD.dob)
       OR (NEW.code IS DISTINCT FROM OLD.code) THEN
      RAISE EXCEPTION 'Los médicos solo pueden actualizar antecedentes y alertas médicas del paciente.';
    END IF;
  END IF;

  -- Always keep updated_at current on updates
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3) Attach trigger to patients table
DROP TRIGGER IF EXISTS trg_enforce_doctor_patient_update_columns ON public.patients;
CREATE TRIGGER trg_enforce_doctor_patient_update_columns
BEFORE UPDATE ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.enforce_doctor_patient_update_columns();