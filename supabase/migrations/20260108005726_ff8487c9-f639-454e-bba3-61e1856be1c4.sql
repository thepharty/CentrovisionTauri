-- Permitir a admin y doctor eliminar encounters
CREATE POLICY "Admin y doctor pueden eliminar encuentros" 
ON encounters
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'doctor'::app_role)
);