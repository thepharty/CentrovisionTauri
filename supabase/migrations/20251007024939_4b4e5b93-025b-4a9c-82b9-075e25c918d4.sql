-- Permitir al personal clínico eliminar archivos de estudios
CREATE POLICY "Personal clínico puede eliminar archivos de estudios"
ON public.study_files
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR 
  has_role(auth.uid(), 'diagnostico'::app_role)
);