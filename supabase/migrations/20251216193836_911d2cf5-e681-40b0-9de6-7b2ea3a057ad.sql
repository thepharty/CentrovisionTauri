-- Actualizar función para manejar cortesías como salidas
CREATE OR REPLACE FUNCTION public.update_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.movement_type = 'entrada' THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock + ABS(NEW.quantity),
        updated_at = now()
    WHERE id = NEW.item_id;
    
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
      SET quantity = quantity + ABS(NEW.quantity)
      WHERE id = NEW.lot_id;
    END IF;
    
  ELSIF NEW.movement_type IN ('salida', 'cortesia') THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock - ABS(NEW.quantity),
        updated_at = now()
    WHERE id = NEW.item_id;
    
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
      SET quantity = quantity - ABS(NEW.quantity)
      WHERE id = NEW.lot_id;
    END IF;
    
  ELSIF NEW.movement_type = 'ajuste' THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock + NEW.quantity,
        updated_at = now()
    WHERE id = NEW.item_id;
    
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
      SET quantity = quantity + NEW.quantity
      WHERE id = NEW.lot_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Corregir el stock de ACRYLARM (descontar la cortesía que no se aplicó)
UPDATE public.inventory_items
SET current_stock = current_stock - 1, updated_at = now()
WHERE id = '5b7c7f08-b63e-4a36-bdd4-c621eb9fc99d';