-- =====================================================
-- FASE 1: BASE DE DATOS - SISTEMA DE CAJA (Parte 2)
-- =====================================================

-- 2. Crear tabla de precios de servicios
CREATE TABLE public.service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type appointment_type NOT NULL UNIQUE,
  service_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Crear tabla de facturas (invoices)
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE RESTRICT NOT NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  balance_due DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'pagada', 'cancelada')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Crear tabla de items de factura (invoice_items)
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('servicio', 'producto')),
  item_id UUID,
  description TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Crear tabla de pagos (payments)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE RESTRICT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('efectivo', 'tarjeta', 'transferencia', 'cheque', 'otro')),
  reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completado' CHECK (status IN ('completado', 'cancelado')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. Crear tabla de items de inventario (inventory_items)
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('medicamento', 'gota', 'lente', 'armazon', 'accesorio', 'otro')),
  requires_lot BOOLEAN NOT NULL DEFAULT false,
  current_stock DECIMAL(10,3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  min_stock DECIMAL(10,3) DEFAULT 0 CHECK (min_stock >= 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 7. Crear tabla de lotes de inventario (inventory_lots)
CREATE TABLE public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
  lot_number TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  expiry_date DATE,
  cost_price DECIMAL(10,2) CHECK (cost_price >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(item_id, lot_number)
);

-- 8. Crear tabla de movimientos de inventario (inventory_movements)
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE RESTRICT NOT NULL,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'salida', 'ajuste')),
  quantity DECIMAL(10,3) NOT NULL CHECK (quantity != 0),
  reference_type TEXT CHECK (reference_type IN ('compra', 'venta', 'ajuste', 'devolucion')),
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- FUNCIONES DE BASE DE DATOS
-- =====================================================

-- Función para generar número de factura correlativo
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  new_invoice_number TEXT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(invoice_number FROM 6) AS INTEGER)), 
    0
  ) + 1 INTO next_number
  FROM public.invoices
  WHERE invoice_number ~ '^FACT-[0-9]+$';
  
  new_invoice_number := 'FACT-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN new_invoice_number;
END;
$$;

-- Función para actualizar el saldo de factura
CREATE OR REPLACE FUNCTION public.update_invoice_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_paid DECIMAL(10,2);
  invoice_total DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id AND status = 'completado';
  
  SELECT total_amount INTO invoice_total
  FROM public.invoices
  WHERE id = NEW.invoice_id;
  
  UPDATE public.invoices
  SET 
    balance_due = invoice_total - total_paid,
    status = CASE 
      WHEN (invoice_total - total_paid) <= 0 THEN 'pagada'
      ELSE 'pendiente'
    END,
    updated_at = now()
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$;

-- Función para actualizar stock de inventario
CREATE OR REPLACE FUNCTION public.update_item_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.movement_type = 'entrada' THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock + ABS(NEW.quantity),
        updated_at = now()
    WHERE id = NEW.item_id;
    
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
      SET quantity = quantity + ABS(NEW.quantity)
      WHERE id = NEW.lot_id;
    END IF;
    
  ELSIF NEW.movement_type = 'salida' THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock - ABS(NEW.quantity),
        updated_at = now()
    WHERE id = NEW.item_id;
    
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
      SET quantity = quantity - ABS(NEW.quantity)
      WHERE id = NEW.lot_id;
    END IF;
    
  ELSIF NEW.movement_type = 'ajuste' THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock + NEW.quantity,
        updated_at = now()
    WHERE id = NEW.item_id;
    
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
      SET quantity = quantity + NEW.quantity
      WHERE id = NEW.lot_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER trigger_update_invoice_balance
AFTER INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_invoice_balance();

CREATE TRIGGER trigger_update_item_stock
AFTER INSERT ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.update_item_stock();

CREATE TRIGGER update_service_prices_updated_at
BEFORE UPDATE ON public.service_prices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE public.service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Políticas para service_prices
CREATE POLICY "Admin y caja pueden gestionar precios de servicios"
ON public.service_prices
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'caja'));

CREATE POLICY "Todos pueden ver precios de servicios"
ON public.service_prices
FOR SELECT
USING (true);

-- Políticas para invoices
CREATE POLICY "Admin y caja pueden gestionar facturas"
ON public.invoices
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'caja'));

CREATE POLICY "Recepción puede ver facturas"
ON public.invoices
FOR SELECT
USING (public.has_role(auth.uid(), 'reception'));

-- Políticas para invoice_items
CREATE POLICY "Admin y caja pueden gestionar items de factura"
ON public.invoice_items
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'caja'));

CREATE POLICY "Recepción puede ver items de factura"
ON public.invoice_items
FOR SELECT
USING (public.has_role(auth.uid(), 'reception'));

-- Políticas para payments
CREATE POLICY "Admin y caja pueden gestionar pagos"
ON public.payments
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'caja'));

CREATE POLICY "Recepción puede ver pagos"
ON public.payments
FOR SELECT
USING (public.has_role(auth.uid(), 'reception'));

-- Políticas para inventory_items
CREATE POLICY "Admin y caja pueden gestionar inventario"
ON public.inventory_items
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'caja'));

CREATE POLICY "Personal clínico puede ver inventario"
ON public.inventory_items
FOR SELECT
USING (
  public.has_role(auth.uid(), 'doctor') OR 
  public.has_role(auth.uid(), 'nurse') OR 
  public.has_role(auth.uid(), 'diagnostico') OR
  public.has_role(auth.uid(), 'reception')
);

-- Políticas para inventory_lots
CREATE POLICY "Admin y caja pueden gestionar lotes"
ON public.inventory_lots
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'caja'));

CREATE POLICY "Personal clínico puede ver lotes"
ON public.inventory_lots
FOR SELECT
USING (
  public.has_role(auth.uid(), 'doctor') OR 
  public.has_role(auth.uid(), 'nurse') OR 
  public.has_role(auth.uid(), 'diagnostico') OR
  public.has_role(auth.uid(), 'reception')
);

-- Políticas para inventory_movements
CREATE POLICY "Admin y caja pueden gestionar movimientos de inventario"
ON public.inventory_movements
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'caja'));

CREATE POLICY "Personal clínico puede ver movimientos de inventario"
ON public.inventory_movements
FOR SELECT
USING (
  public.has_role(auth.uid(), 'doctor') OR 
  public.has_role(auth.uid(), 'nurse') OR 
  public.has_role(auth.uid(), 'diagnostico') OR
  public.has_role(auth.uid(), 'reception')
);

-- =====================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- =====================================================

CREATE INDEX idx_invoices_patient_id ON public.invoices(patient_id);
CREATE INDEX idx_invoices_appointment_id ON public.invoices(appointment_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_created_at ON public.invoices(created_at DESC);

CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_item_id ON public.invoice_items(item_id);

CREATE INDEX idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX idx_payments_created_at ON public.payments(created_at DESC);

CREATE INDEX idx_inventory_items_category ON public.inventory_items(category);
CREATE INDEX idx_inventory_items_active ON public.inventory_items(active);

CREATE INDEX idx_inventory_lots_item_id ON public.inventory_lots(item_id);
CREATE INDEX idx_inventory_lots_expiry_date ON public.inventory_lots(expiry_date);

CREATE INDEX idx_inventory_movements_item_id ON public.inventory_movements(item_id);
CREATE INDEX idx_inventory_movements_created_at ON public.inventory_movements(created_at DESC);