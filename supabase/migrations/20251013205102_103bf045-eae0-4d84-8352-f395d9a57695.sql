-- Crear tabla para historial de cierres de caja
CREATE TABLE public.cash_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Totales generales
  total_invoiced NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_collected NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_pending NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_discounts NUMERIC(10,2) DEFAULT 0,
  
  -- Por tipo de servicio
  consultas_total NUMERIC(10,2) DEFAULT 0,
  consultas_count INTEGER DEFAULT 0,
  cirugias_total NUMERIC(10,2) DEFAULT 0,
  cirugias_count INTEGER DEFAULT 0,
  procedimientos_total NUMERIC(10,2) DEFAULT 0,
  procedimientos_count INTEGER DEFAULT 0,
  estudios_total NUMERIC(10,2) DEFAULT 0,
  estudios_count INTEGER DEFAULT 0,
  
  -- Inventario
  inventory_total NUMERIC(10,2) DEFAULT 0,
  inventory_count INTEGER DEFAULT 0,
  
  -- Métodos de pago
  efectivo_total NUMERIC(10,2) DEFAULT 0,
  tarjeta_total NUMERIC(10,2) DEFAULT 0,
  transferencia_total NUMERIC(10,2) DEFAULT 0,
  cheque_total NUMERIC(10,2) DEFAULT 0,
  otro_total NUMERIC(10,2) DEFAULT 0,
  
  -- Datos detallados en JSON
  detailed_data JSONB,
  
  -- Auditoría
  closed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;

-- Admin y caja pueden crear cierres
CREATE POLICY "Admin y caja pueden crear cierres"
ON public.cash_closures
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'caja'::app_role)
);

-- Admin y caja pueden ver cierres
CREATE POLICY "Admin y caja pueden ver cierres"
ON public.cash_closures
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'caja'::app_role)
);

-- Crear índices para mejorar rendimiento
CREATE INDEX idx_cash_closures_date ON public.cash_closures(closure_date DESC);
CREATE INDEX idx_cash_closures_closed_by ON public.cash_closures(closed_by);