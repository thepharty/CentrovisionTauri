-- Fase 2.2: Agregar filtro branch_filter a get_payment_methods
-- SEGURIDAD: CREATE OR REPLACE no borra datos
-- SEGURIDAD: branch_filter DEFAULT NULL = backward compatible

CREATE OR REPLACE FUNCTION get_payment_methods(
  start_date timestamptz, 
  end_date timestamptz,
  branch_filter uuid DEFAULT NULL
)
RETURNS TABLE(
  payment_method text,
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
    p.payment_method,
    COUNT(*)::bigint as cantidad,
    COALESCE(SUM(p.amount), 0)::numeric as total
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  WHERE p.created_at >= start_date
    AND p.created_at <= end_date
    AND p.status = 'completado'
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY p.payment_method
  ORDER BY total DESC;
END;
$$;