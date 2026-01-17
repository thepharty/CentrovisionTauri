-- Agregar columna cost_price a inventory_items
ALTER TABLE public.inventory_items 
ADD COLUMN cost_price NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN public.inventory_items.cost_price IS 'Precio de costo/adquisición del producto';

-- Actualizar productos existentes con costo promedio de sus lotes si existen
UPDATE public.inventory_items i
SET cost_price = (
  SELECT AVG(l.cost_price)
  FROM public.inventory_lots l
  WHERE l.item_id = i.id
  AND l.cost_price IS NOT NULL
)
WHERE EXISTS (
  SELECT 1 FROM public.inventory_lots l
  WHERE l.item_id = i.id
  AND l.cost_price IS NOT NULL
);