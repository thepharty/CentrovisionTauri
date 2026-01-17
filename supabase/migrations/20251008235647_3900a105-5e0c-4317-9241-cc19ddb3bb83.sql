-- Agregar columna occupation a la tabla patients
ALTER TABLE public.patients 
ADD COLUMN occupation text;