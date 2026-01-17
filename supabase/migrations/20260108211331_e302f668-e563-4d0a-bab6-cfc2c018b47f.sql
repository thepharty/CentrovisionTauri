-- Add branch_filter parameter to get_inventory_sales function
CREATE OR REPLACE FUNCTION public.get_inventory_sales(
  start_date text,
  end_date text,
  branch_filter uuid DEFAULT NULL
)
RETURNS TABLE(
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
    ii.category,
    SUM(inv_items.quantity)::bigint as cantidad,
    SUM(inv_items.subtotal) as total
  FROM invoice_items inv_items
  JOIN invoices inv ON inv.id = inv_items.invoice_id
  JOIN inventory_items ii ON ii.id::text = inv_items.item_id
  WHERE inv_items.item_type = 'inventory'
    AND inv.created_at >= start_date::timestamptz
    AND inv.created_at <= end_date::timestamptz
    AND inv.status != 'cancelada'
    AND (branch_filter IS NULL OR inv.branch_id = branch_filter)
  GROUP BY ii.category
  ORDER BY total DESC;
END;
$$;