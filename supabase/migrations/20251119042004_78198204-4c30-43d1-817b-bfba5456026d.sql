-- Crear tabla surgery_files para almacenar archivos de cirugías
CREATE TABLE public.surgery_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surgery_id UUID NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Habilitar RLS en surgery_files
ALTER TABLE public.surgery_files ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para surgery_files (similar a study_files)
CREATE POLICY "Personal clínico puede ver archivos de cirugías"
ON public.surgery_files
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Personal clínico puede crear archivos de cirugías"
ON public.surgery_files
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR 
  has_role(auth.uid(), 'diagnostico'::app_role)
);

CREATE POLICY "Personal clínico puede eliminar archivos de cirugías"
ON public.surgery_files
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR 
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- Crear bucket de storage para cirugías
INSERT INTO storage.buckets (id, name, public) 
VALUES ('surgeries', 'surgeries', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para el bucket surgeries
CREATE POLICY "Personal clínico puede ver archivos de cirugías en storage"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'surgeries');

CREATE POLICY "Personal clínico puede subir archivos de cirugías"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'surgeries' AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'doctor'::app_role) OR 
    has_role(auth.uid(), 'nurse'::app_role) OR 
    has_role(auth.uid(), 'diagnostico'::app_role)
  )
);

CREATE POLICY "Personal clínico puede eliminar archivos de cirugías de storage"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'surgeries' AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'doctor'::app_role) OR 
    has_role(auth.uid(), 'nurse'::app_role) OR 
    has_role(auth.uid(), 'diagnostico'::app_role)
  )
);