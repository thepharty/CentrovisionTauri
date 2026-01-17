-- Eliminar movimientos de inventario relacionados con ventas de prueba
DELETE FROM inventory_movements WHERE reference_type = 'venta';