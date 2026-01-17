-- Drop existing versions of get_service_sales
DROP FUNCTION IF EXISTS public.get_service_sales(timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.get_service_sales(timestamptz, timestamptz);

-- Recreate get_service_sales with correct logic
CREATE FUNCTION public.get_service_sales(
  start_date timestamptz, 
  end_date timestamptz,
  branch_filter uuid DEFAULT NULL
)
RETURNS TABLE(
  service_type text,
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
    sp.service_type as service_type,
    COUNT(*)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  JOIN service_prices sp ON ii.item_id = sp.id
  WHERE i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
    AND ii.item_type = 'servicio'
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY sp.service_type
  ORDER BY total DESC;
END;
$$;