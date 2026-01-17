-- Actualizar función del trigger para usar 'venta' en lugar de 'invoice'
CREATE OR REPLACE FUNCTION public.create_inventory_movement_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Solo para productos (no servicios)
  IF NEW.item_type = 'producto' AND NEW.item_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements (
      item_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      NEW.item_id,
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