-- Actualizar función del trigger para incluir branch_id en movimientos de inventario
CREATE OR REPLACE FUNCTION public.create_inventory_movement_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item_branch_id uuid;
BEGIN
  -- Solo para productos (no servicios)
  IF NEW.item_type = 'producto' AND NEW.item_id IS NOT NULL THEN
    -- Obtener el branch_id del item de inventario
    SELECT branch_id INTO item_branch_id
    FROM public.inventory_items
    WHERE id = NEW.item_id;
    
    -- Si no se encuentra el item o no tiene branch_id, no crear el movimiento
    IF item_branch_id IS NULL THEN
      RAISE WARNING 'No se pudo obtener branch_id para inventory_item %', NEW.item_id;
      RETURN NEW;
    END IF;
    
    INSERT INTO public.inventory_movements (
      item_id,
      branch_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      NEW.item_id,
      item_branch_id,
      'salida',
      NEW.quantity,
      'venta',
      NEW.invoice_id,
      'Venta automática - Factura',
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$function$;