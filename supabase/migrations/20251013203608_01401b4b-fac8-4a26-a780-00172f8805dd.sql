-- Agregar columnas para sistema de descuentos en facturas
ALTER TABLE public.invoices
ADD COLUMN discount_type text CHECK (discount_type IN ('percentage', 'fixed', NULL)),
ADD COLUMN discount_value numeric(10,2) DEFAULT 0,
ADD COLUMN discount_reason text;

-- Agregar comentarios para documentación
COMMENT ON COLUMN public.invoices.discount_type IS 'Tipo de descuento: percentage (porcentaje) o fixed (monto fijo)';
COMMENT ON COLUMN public.invoices.discount_value IS 'Valor del descuento (15 = 15% o GTQ 15 según el tipo)';
COMMENT ON COLUMN public.invoices.discount_reason IS 'Razón por la que se aplicó el descuento (obligatorio para auditoría)';