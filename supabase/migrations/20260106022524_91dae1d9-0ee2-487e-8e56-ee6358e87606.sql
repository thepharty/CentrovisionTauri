-- Crear función v2 para detalles de productos (inventario)
CREATE OR REPLACE FUNCTION public.get_inventory_details_v2(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  branch_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  total_quantity bigint,
  total_revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ii.id as item_id,
    ii.name as item_name,
    COALESCE(SUM(iit.quantity), 0)::bigint as total_quantity,
    COALESCE(SUM(iit.quantity * iit.unit_price), 0) as total_revenue
  FROM invoice_items iit
  JOIN invoices inv ON inv.id = iit.invoice_id
  JOIN inventory_items ii ON ii.id = iit.item_id
  WHERE inv.created_at >= start_date
    AND inv.created_at <= end_date
    AND inv.status != 'cancelled'
    AND ii.item_type = 'producto'
    AND (branch_filter IS NULL OR inv.branch_id = branch_filter)
  GROUP BY ii.id, ii.name
  ORDER BY total_quantity DESC;
END;
$$;

-- Crear función v2 para detalles de servicios
CREATE OR REPLACE FUNCTION public.get_service_details_v2(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  branch_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  total_quantity bigint,
  total_revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ii.id as item_id,
    ii.name as item_name,
    COALESCE(SUM(iit.quantity), 0)::bigint as total_quantity,
    COALESCE(SUM(iit.quantity * iit.unit_price), 0) as total_revenue
  FROM invoice_items iit
  JOIN invoices inv ON inv.id = iit.invoice_id
  JOIN inventory_items ii ON ii.id = iit.item_id
  WHERE inv.created_at >= start_date
    AND inv.created_at <= end_date
    AND inv.status != 'cancelled'
    AND ii.item_type = 'servicio'
    AND (branch_filter IS NULL OR inv.branch_id = branch_filter)
  GROUP BY ii.id, ii.name
  ORDER BY total_quantity DESC;
END;
$$;