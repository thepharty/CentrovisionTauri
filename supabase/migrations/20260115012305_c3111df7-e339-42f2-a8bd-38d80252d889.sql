-- =====================================================
-- INVENTARIO DE SALA - Sistema dinámico de categorías e items
-- =====================================================

-- Tabla de categorías (jerárquica con parent_id)
CREATE TABLE public.room_inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.room_inventory_categories(id) ON DELETE SET NULL,
  display_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de items de inventario
CREATE TABLE public.room_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.room_inventory_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  brand TEXT,
  specification TEXT,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  unit TEXT DEFAULT 'unidad',
  notes TEXT,
  active BOOLEAN DEFAULT true,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de movimientos (historial de entradas/salidas)
CREATE TABLE public.room_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.room_inventory_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'uso', 'ajuste')),
  notes TEXT,
  user_id UUID,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejor performance
CREATE INDEX idx_room_inv_categories_parent ON public.room_inventory_categories(parent_id);
CREATE INDEX idx_room_inv_categories_branch ON public.room_inventory_categories(branch_id);
CREATE INDEX idx_room_inv_items_category ON public.room_inventory_items(category_id);
CREATE INDEX idx_room_inv_items_branch ON public.room_inventory_items(branch_id);
CREATE INDEX idx_room_inv_movements_item ON public.room_inventory_movements(item_id);
CREATE INDEX idx_room_inv_movements_branch ON public.room_inventory_movements(branch_id);
CREATE INDEX idx_room_inv_movements_date ON public.room_inventory_movements(created_at);

-- Habilitar RLS
ALTER TABLE public.room_inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_inventory_movements ENABLE ROW LEVEL SECURITY;

-- RLS para categorías: admin y nurse pueden todo
CREATE POLICY "admin_nurse_full_access_categories"
ON public.room_inventory_categories
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'nurse'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'nurse'::app_role));

-- RLS para items: admin y nurse pueden todo
CREATE POLICY "admin_nurse_full_access_items"
ON public.room_inventory_items
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'nurse'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'nurse'::app_role));

-- RLS para movimientos: admin y nurse pueden todo
CREATE POLICY "admin_nurse_full_access_movements"
ON public.room_inventory_movements
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'nurse'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'nurse'::app_role));

-- Doctores pueden ver (solo lectura)
CREATE POLICY "doctor_read_categories"
ON public.room_inventory_categories
FOR SELECT
USING (has_role(auth.uid(), 'doctor'::app_role));

CREATE POLICY "doctor_read_items"
ON public.room_inventory_items
FOR SELECT
USING (has_role(auth.uid(), 'doctor'::app_role));

CREATE POLICY "doctor_read_movements"
ON public.room_inventory_movements
FOR SELECT
USING (has_role(auth.uid(), 'doctor'::app_role));

-- Trigger para actualizar updated_at
CREATE TRIGGER update_room_inv_categories_updated_at
  BEFORE UPDATE ON public.room_inventory_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_room_inv_items_updated_at
  BEFORE UPDATE ON public.room_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();