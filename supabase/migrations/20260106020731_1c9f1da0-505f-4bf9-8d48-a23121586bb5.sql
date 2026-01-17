-- Fase 2.3: Agregar filtro branch_filter a get_inventory_details
-- SEGURIDAD: CREATE OR REPLACE no borra datos
-- SEGURIDAD: branch_filter DEFAULT NULL = backward compatible

CREATE OR REPLACE FUNCTION get_inventory_details(
  start_date timestamptz, 
  end_date timestamptz,
  branch_filter uuid DEFAULT NULL
)
RETURNS TABLE(
  product_name text,
  category text,
  cantidad bigint,
  total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ii.description as product_name,
    'inventario'::text as category,
    SUM(ii.quantity)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  WHERE i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
    AND ii.item_type = 'inventario'
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY ii.description
  ORDER BY total DESC;
END;
$$;