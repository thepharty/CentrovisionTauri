-- Agregar campo para antecedentes oftalmológicos en la tabla patients
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS ophthalmic_history TEXT DEFAULT '';