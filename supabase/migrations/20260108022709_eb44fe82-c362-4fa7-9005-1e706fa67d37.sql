-- Eliminar el constraint actual
ALTER TABLE inventory_items 
DROP CONSTRAINT IF EXISTS inventory_items_category_check;

-- Crear el nuevo constraint con "aro" incluido
ALTER TABLE inventory_items 
ADD CONSTRAINT inventory_items_category_check 
CHECK (category IN ('medicamento', 'gota', 'lente', 'aro', 'accesorio', 'otro'));