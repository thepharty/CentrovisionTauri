-- Limpieza completa de datos de prueba de inventario y facturación
-- Manteniendo intactos los service_prices y demás configuración

-- 1. Eliminar pagos (dependen de facturas)
DELETE FROM public.payments;

-- 2. Eliminar items de factura (dependen de facturas y productos)
DELETE FROM public.invoice_items;

-- 3. Eliminar facturas
DELETE FROM public.invoices;

-- 4. Eliminar movimientos de inventario (dependen de productos)
DELETE FROM public.inventory_movements;

-- 5. Eliminar lotes de inventario (dependen de productos)
DELETE FROM public.inventory_lots;

-- 6. Eliminar productos de inventario
DELETE FROM public.inventory_items;