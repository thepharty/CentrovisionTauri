-- Eliminar política existente que da ALL a admin, caja y contabilidad
DROP POLICY IF EXISTS "admin_caja_contabilidad_pagos" ON public.payments;

-- Política para SELECT: admin, caja, contabilidad pueden ver
CREATE POLICY "admin_caja_contabilidad_select_pagos"
ON public.payments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'caja'::app_role) OR 
  has_role(auth.uid(), 'contabilidad'::app_role)
);

-- Política para INSERT: admin, caja, contabilidad pueden crear
CREATE POLICY "admin_caja_contabilidad_insert_pagos"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'caja'::app_role) OR 
  has_role(auth.uid(), 'contabilidad'::app_role)
);

-- Política para UPDATE: admin, caja, contabilidad pueden actualizar
CREATE POLICY "admin_caja_contabilidad_update_pagos"
ON public.payments
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'caja'::app_role) OR 
  has_role(auth.uid(), 'contabilidad'::app_role)
);

-- Política para DELETE: SOLO admin y contabilidad pueden eliminar
CREATE POLICY "admin_contabilidad_delete_pagos"
ON public.payments
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'contabilidad'::app_role)
);