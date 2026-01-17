-- Eliminar constraints existentes
ALTER TABLE inventory_movements 
DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE inventory_movements 
DROP CONSTRAINT IF EXISTS inventory_movements_reference_type_check;

-- Crear nuevos constraints que incluyan 'cortesia'
ALTER TABLE inventory_movements 
ADD CONSTRAINT inventory_movements_movement_type_check 
CHECK (movement_type IN ('entrada', 'salida', 'ajuste', 'cortesia'));

ALTER TABLE inventory_movements 
ADD CONSTRAINT inventory_movements_reference_type_check 
CHECK (reference_type IN ('compra', 'venta', 'ajuste', 'devolucion', 'cortesia'));