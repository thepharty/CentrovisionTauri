-- Crear función para crear movimiento de inventario automáticamente desde facturas
CREATE OR REPLACE FUNCTION public.create_inventory_movement_from_invoice()
RETURNS TRIGGER AS $$
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
      'invoice',
      NEW.invoice_id,
      'Venta automática - Factura',
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Crear trigger para ejecutar la función al insertar items de factura
CREATE TRIGGER invoice_item_inventory_trigger
  AFTER INSERT ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.create_inventory_movement_from_invoice();