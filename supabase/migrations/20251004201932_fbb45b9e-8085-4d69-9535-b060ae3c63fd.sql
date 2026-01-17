-- Agregar campos para notas de OD (Ojo Derecho) y OS (Ojo Izquierdo)
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS od_text TEXT,
ADD COLUMN IF NOT EXISTS os_text TEXT;