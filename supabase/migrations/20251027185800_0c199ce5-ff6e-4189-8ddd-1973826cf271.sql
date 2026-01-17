-- Actualizar políticas RLS para incluir 'contabilidad' (nombres cortos)

-- service_prices
DROP POLICY IF EXISTS "Admin y caja pueden gestionar precios de servicios" ON public.service_prices;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden gestionar precios de servicio" ON public.service_prices;
CREATE POLICY "admin_caja_contabilidad_servicios"
ON public.service_prices
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'caja'::app_role) OR 
  public.has_role(auth.uid(), 'contabilidad'::app_role)
);

-- invoices
DROP POLICY IF EXISTS "Admin y caja pueden gestionar facturas" ON public.invoices;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden gestionar facturas" ON public.invoices;
CREATE POLICY "admin_caja_contabilidad_facturas"
ON public.invoices
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'caja'::app_role) OR 
  public.has_role(auth.uid(), 'contabilidad'::app_role)
);

-- invoice_items
DROP POLICY IF EXISTS "Admin y caja pueden gestionar items de factura" ON public.invoice_items;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden gestionar items de factura" ON public.invoice_items;
CREATE POLICY "admin_caja_contabilidad_items"
ON public.invoice_items
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'caja'::app_role) OR 
  public.has_role(auth.uid(), 'contabilidad'::app_role)
);

-- payments
DROP POLICY IF EXISTS "Admin y caja pueden gestionar pagos" ON public.payments;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden gestionar pagos" ON public.payments;
CREATE POLICY "admin_caja_contabilidad_pagos"
ON public.payments
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'caja'::app_role) OR 
  public.has_role(auth.uid(), 'contabilidad'::app_role)
);

-- inventory_items
DROP POLICY IF EXISTS "Admin y caja pueden gestionar inventario" ON public.inventory_items;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden gestionar inventario" ON public.inventory_items;
CREATE POLICY "admin_caja_contabilidad_inventario"
ON public.inventory_items
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'caja'::app_role) OR 
  public.has_role(auth.uid(), 'contabilidad'::app_role)
);

-- inventory_lots
DROP POLICY IF EXISTS "Admin y caja pueden gestionar lotes" ON public.inventory_lots;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden gestionar lotes" ON public.inventory_lots;
CREATE POLICY "admin_caja_contabilidad_lotes"
ON public.inventory_lots
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'caja'::app_role) OR 
  public.has_role(auth.uid(), 'contabilidad'::app_role)
);

-- inventory_movements
DROP POLICY IF EXISTS "Admin y caja pueden gestionar movimientos de inventario" ON public.inventory_movements;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden gestionar movimientos de inventario" ON public.inventory_movements;
CREATE POLICY "admin_caja_contabilidad_movimientos"
ON public.inventory_movements
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'caja'::app_role) OR 
  public.has_role(auth.uid(), 'contabilidad'::app_role)
);

-- cash_closures
DROP POLICY IF EXISTS "Admin y caja pueden crear cierres" ON public.cash_closures;
DROP POLICY IF EXISTS "Admin y caja pueden ver cierres" ON public.cash_closures;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden crear cierres" ON public.cash_closures;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden ver cierres" ON public.cash_closures;

CREATE POLICY "admin_caja_contabilidad_crear_cierres"
ON public.cash_closures
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'caja'::app_role) OR
  has_role(auth.uid(), 'contabilidad'::app_role)
);

CREATE POLICY "admin_caja_contabilidad_ver_cierres"
ON public.cash_closures
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'caja'::app_role) OR
  has_role(auth.uid(), 'contabilidad'::app_role)
);

-- suppliers
DROP POLICY IF EXISTS "Admin y caja pueden gestionar proveedores" ON public.suppliers;
DROP POLICY IF EXISTS "Admin, caja y contabilidad pueden gestionar proveedores" ON public.suppliers;
CREATE POLICY "admin_caja_contabilidad_proveedores"
ON public.suppliers
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'caja'::app_role) OR
  has_role(auth.uid(), 'contabilidad'::app_role)
);