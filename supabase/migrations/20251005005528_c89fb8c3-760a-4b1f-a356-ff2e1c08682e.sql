-- Agregar campos faltantes a la tabla encounters para guardar toda la información de la consulta
ALTER TABLE public.encounters
ADD COLUMN IF NOT EXISTS plan_tratamiento TEXT,
ADD COLUMN IF NOT EXISTS cirugias TEXT,
ADD COLUMN IF NOT EXISTS estudios TEXT,
ADD COLUMN IF NOT EXISTS proxima_cita TEXT,
ADD COLUMN IF NOT EXISTS motivo_consulta TEXT,
ADD COLUMN IF NOT EXISTS excursiones_od TEXT,
ADD COLUMN IF NOT EXISTS excursiones_os TEXT;

-- Agregar campos adicionales a exam_eye para refracción subjetiva y receta final
ALTER TABLE public.exam_eye
ADD COLUMN IF NOT EXISTS ref_subj_sphere NUMERIC,
ADD COLUMN IF NOT EXISTS ref_subj_cyl NUMERIC,
ADD COLUMN IF NOT EXISTS ref_subj_axis INTEGER,
ADD COLUMN IF NOT EXISTS rx_sphere NUMERIC,
ADD COLUMN IF NOT EXISTS rx_cyl NUMERIC,
ADD COLUMN IF NOT EXISTS rx_axis INTEGER,
ADD COLUMN IF NOT EXISTS rx_add NUMERIC;