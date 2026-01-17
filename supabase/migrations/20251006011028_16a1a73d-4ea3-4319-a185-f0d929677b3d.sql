-- Agregar el nuevo tipo de cita 'estudio' al enum appointment_type
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'estudio';