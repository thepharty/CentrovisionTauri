-- Crear tabla para estudios
CREATE TABLE IF NOT EXISTS public.studies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  eye_side eye_side NOT NULL DEFAULT 'OU',
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Personal clínico puede ver estudios"
ON public.studies
FOR SELECT
USING (true);

CREATE POLICY "Personal clínico puede crear estudios"
ON public.studies
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

CREATE POLICY "Personal clínico puede actualizar estudios"
ON public.studies
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- Tabla para archivos de estudios
CREATE TABLE IF NOT EXISTS public.study_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.study_files ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para archivos
CREATE POLICY "Personal clínico puede ver archivos de estudios"
ON public.study_files
FOR SELECT
USING (true);

CREATE POLICY "Personal clínico puede crear archivos de estudios"
ON public.study_files
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- Trigger para updated_at
CREATE TRIGGER update_studies_updated_at
BEFORE UPDATE ON public.studies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Crear bucket de storage para archivos de estudios si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('studies', 'studies', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para estudios
CREATE POLICY "Personal clínico puede ver archivos de estudios"
ON storage.objects
FOR SELECT
USING (bucket_id = 'studies');

CREATE POLICY "Personal clínico puede subir archivos de estudios"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'studies' AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'doctor'::app_role) OR
    has_role(auth.uid(), 'nurse'::app_role) OR
    has_role(auth.uid(), 'diagnostico'::app_role)
  )
);