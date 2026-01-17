-- Limpieza de datos de prueba de facturación
-- ADVERTENCIA: Esta operación eliminará TODOS los registros de estas tablas

-- 1. Eliminar todos los pagos (tienen FK a invoices)
DELETE FROM payments;

-- 2. Eliminar todos los items de factura (tienen FK a invoices)
DELETE FROM invoice_items;

-- 3. Eliminar todas las facturas
DELETE FROM invoices;

-- 4. Eliminar todos los cierres de caja
DELETE FROM cash_closures;