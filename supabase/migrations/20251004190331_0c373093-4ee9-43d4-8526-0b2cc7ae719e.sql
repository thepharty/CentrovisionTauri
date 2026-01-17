-- Agregar campos faltantes a patients
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS address text;

-- Agregar campos de autorefractor y lensometria a appointments
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS autorefractor text,
ADD COLUMN IF NOT EXISTS lensometry text,
ADD COLUMN IF NOT EXISTS photo_od text,
ADD COLUMN IF NOT EXISTS photo_oi text,
ADD COLUMN IF NOT EXISTS post_op_type text;

-- Agregar nuevos valores al enum appointment_type
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'nueva_consulta';
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'reconsulta_menos_3m';
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'reconsulta_mas_3m';
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'post_operado';
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'lectura_resultados';
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'cortesia';