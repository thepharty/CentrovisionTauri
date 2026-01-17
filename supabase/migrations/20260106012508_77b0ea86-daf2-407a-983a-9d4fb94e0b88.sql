-- Fase 2.1: Agregar filtro branch_filter a get_service_sales
-- SEGURIDAD: CREATE OR REPLACE no borra datos, solo actualiza lógica
-- SEGURIDAD: branch_filter DEFAULT NULL = backward compatible

CREATE OR REPLACE FUNCTION get_service_sales(
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
    ii.item_type as service_type,
    COUNT(*)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  WHERE i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
    AND ii.item_type IN ('consulta', 'cirugia', 'procedimiento', 'estudio', 'diagnostico')
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY ii.item_type
  ORDER BY total DESC;
END;
$$;