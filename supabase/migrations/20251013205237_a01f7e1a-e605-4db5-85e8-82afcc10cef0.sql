-- Función para obtener ventas por tipo de servicio
CREATE OR REPLACE FUNCTION public.get_service_sales(start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS TABLE (
  service_type TEXT,
  cantidad BIGINT,
  total NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    sp.service_type::text,
    COUNT(ii.id)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN service_prices sp ON ii.item_id = sp.id
  JOIN invoices i ON ii.invoice_id = i.id
  WHERE ii.item_type = 'servicio'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY sp.service_type;
$$;

-- Función para obtener ventas de inventario por categoría
CREATE OR REPLACE FUNCTION public.get_inventory_sales(start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS TABLE (
  category TEXT,
  cantidad BIGINT,
  total NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    inv.category,
    COUNT(ii.id)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN inventory_items inv ON ii.item_id = inv.id
  JOIN invoices i ON ii.invoice_id = i.id
  WHERE ii.item_type = 'producto'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY inv.category;
$$;

-- Función para obtener pagos por método
CREATE OR REPLACE FUNCTION public.get_payment_methods(start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS TABLE (
  payment_method TEXT,
  cantidad BIGINT,
  total NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    payment_method,
    COUNT(*)::bigint as cantidad,
    COALESCE(SUM(amount), 0)::numeric as total
  FROM payments
  WHERE created_at >= start_date
    AND created_at <= end_date
    AND status = 'completado'
  GROUP BY payment_method;
$$;