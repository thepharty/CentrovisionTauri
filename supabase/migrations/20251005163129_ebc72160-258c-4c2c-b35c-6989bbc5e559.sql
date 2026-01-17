-- Agregar columnas faltantes a la tabla exam_eye para guardar AV de refracción subjetiva
ALTER TABLE public.exam_eye 
ADD COLUMN IF NOT EXISTS ref_subj_av TEXT,
ADD COLUMN IF NOT EXISTS prescription_notes TEXT;