-- Crear función para generar números de factura por sucursal
CREATE OR REPLACE FUNCTION generate_invoice_number_for_branch(p_branch_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  branch_code TEXT;
  prefix TEXT;
  next_number INTEGER;
  new_invoice_number TEXT;
BEGIN
  -- Obtener código de sucursal
  SELECT code INTO branch_code
  FROM branches
  WHERE id = p_branch_id;
  
  -- Definir prefijo según sucursal
  CASE branch_code
    WHEN 'central' THEN prefix := 'CV';
    WHEN 'santa_lucia' THEN prefix := 'SL';
    ELSE prefix := 'XX';
  END CASE;
  
  -- Obtener siguiente número para esta sucursal (buscando facturas con el nuevo formato)
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(invoice_number FROM 4) AS INTEGER)), 0
  ) + 1 INTO next_number
  FROM invoices
  WHERE branch_id = p_branch_id
  AND invoice_number ~ ('^' || prefix || '-[0-9]+$');
  
  -- Generar número con formato PREFIX-0001
  new_invoice_number := prefix || '-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN new_invoice_number;
END;
$$;