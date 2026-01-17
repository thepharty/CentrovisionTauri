-- Add external_doctor_name column to appointments table
ALTER TABLE appointments 
ADD COLUMN external_doctor_name TEXT;

COMMENT ON COLUMN appointments.external_doctor_name IS 
  'Nombre del doctor externo cuando es alquiler de sala';