-- Función para obtener detalles de servicios vendidos
CREATE OR REPLACE FUNCTION public.get_service_details(
  start_date timestamp with time zone,
  end_date timestamp with time zone
)
RETURNS TABLE(
  service_type text,
  service_name text,
  cantidad bigint,
  total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    COALESCE(sp.service_type::text, 'otro') as service_type,
    ii.description as service_name,
    COUNT(ii.id)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN service_prices sp ON sp.id = ii.item_id
  WHERE ii.item_type = 'servicio'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY sp.service_type, ii.description
  ORDER BY sp.service_type, ii.description;
$function$;

-- Función para obtener detalles de productos vendidos
CREATE OR REPLACE FUNCTION public.get_inventory_details(
  start_date timestamp with time zone,
  end_date timestamp with time zone
)
RETURNS TABLE(
  category text,
  product_name text,
  cantidad numeric,
  total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    COALESCE(inv.category, 'Otros') as category,
    ii.description as product_name,
    SUM(ii.quantity)::numeric as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN inventory_items inv ON inv.id = ii.item_id
  WHERE ii.item_type = 'producto'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY inv.category, ii.description
  ORDER BY inv.category, ii.description;
$function$;