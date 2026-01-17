-- Agregar campos para antecedentes médicos críticos en la tabla patients
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS diabetes boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS hta boolean DEFAULT false;

-- Comentarios para documentar
COMMENT ON COLUMN public.patients.diabetes IS 'Indica si el paciente tiene diabetes';
COMMENT ON COLUMN public.patients.hta IS 'Indica si el paciente tiene hipertensión arterial (HTA)';
COMMENT ON COLUMN public.patients.allergies IS 'Alergias del paciente';