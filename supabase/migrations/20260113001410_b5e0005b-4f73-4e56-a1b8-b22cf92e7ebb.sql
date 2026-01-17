CREATE OR REPLACE FUNCTION public.enforce_doctor_patient_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  is_reception boolean;
  is_doctor boolean;
BEGIN
  -- Check privileged roles first
  is_admin := public.has_role(auth.uid(), 'admin');
  is_reception := public.has_role(auth.uid(), 'reception');
  
  -- If user has admin or reception role, allow all updates
  IF is_admin OR is_reception THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- For doctors (without admin/reception), apply field restrictions
  is_doctor := public.has_role(auth.uid(), 'doctor');
  
  IF is_doctor THEN
    -- Doctors can only modify: diabetes, hta, allergies, notes, ophthalmic_history
    IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
       OR (NEW.last_name IS DISTINCT FROM OLD.last_name)
       OR (NEW.phone IS DISTINCT FROM OLD.phone)
       OR (NEW.email IS DISTINCT FROM OLD.email)
       OR (NEW.address IS DISTINCT FROM OLD.address)
       OR (NEW.dob IS DISTINCT FROM OLD.dob)
       OR (NEW.code IS DISTINCT FROM OLD.code)
       OR (NEW.occupation IS DISTINCT FROM OLD.occupation) THEN
      RAISE EXCEPTION 'Los médicos solo pueden actualizar antecedentes y alertas médicas del paciente.';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;