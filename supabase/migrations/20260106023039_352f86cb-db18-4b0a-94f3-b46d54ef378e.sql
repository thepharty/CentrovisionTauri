-- Fix get_inventory_details_v2: Change ii.item_type to iit.item_type
CREATE OR REPLACE FUNCTION public.get_inventory_details_v2(
  start_date text,
  end_date text,
  branch_filter uuid DEFAULT NULL
)
RETURNS TABLE(
  item_id uuid,
  item_name text,
  total_quantity bigint,
  total_revenue numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    iit.item_id::uuid,
    iit.description AS item_name,
    SUM(iit.quantity)::bigint AS total_quantity,
    SUM(iit.subtotal)::numeric AS total_revenue
  FROM invoice_items iit
  JOIN invoices i ON i.id = iit.invoice_id
  WHERE i.created_at >= start_date::timestamptz
    AND i.created_at < (end_date::date + interval '1 day')::timestamptz
    AND iit.item_type = 'producto'
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY iit.item_id, iit.description
  ORDER BY total_revenue DESC
  LIMIT 10;
END;
$$;

-- Fix get_service_details_v2: Change ii.item_type to iit.item_type
CREATE OR REPLACE FUNCTION public.get_service_details_v2(
  start_date text,
  end_date text,
  branch_filter uuid DEFAULT NULL
)
RETURNS TABLE(
  item_id uuid,
  item_name text,
  total_quantity bigint,
  total_revenue numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    iit.item_id::uuid,
    iit.description AS item_name,
    SUM(iit.quantity)::bigint AS total_quantity,
    SUM(iit.subtotal)::numeric AS total_revenue
  FROM invoice_items iit
  JOIN invoices i ON i.id = iit.invoice_id
  WHERE i.created_at >= start_date::timestamptz
    AND i.created_at < (end_date::date + interval '1 day')::timestamptz
    AND iit.item_type = 'servicio'
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY iit.item_id, iit.description
  ORDER BY total_revenue DESC
  LIMIT 10;
END;
$$;