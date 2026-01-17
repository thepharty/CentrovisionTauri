-- Crear enum para códigos de sede
CREATE TYPE branch_code AS ENUM ('central', 'santa_lucia');

-- Crear tabla de sedes
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code branch_code NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insertar las dos sedes
INSERT INTO branches (code, name, address) VALUES
  ('central', 'Sede Central', 'Dirección Sede Central'),
  ('santa_lucia', 'Santa Lucía', 'Dirección Santa Lucía');

-- RLS policies para branches
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden ver sedes" ON branches
  FOR SELECT USING (true);

CREATE POLICY "Solo admin puede gestionar sedes" ON branches
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Crear tabla de asignación de usuarios a sedes
CREATE TABLE user_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

CREATE INDEX idx_user_branches_user ON user_branches(user_id);
CREATE INDEX idx_user_branches_branch ON user_branches(branch_id);

-- RLS policies para user_branches
ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver sus propias sedes" ON user_branches
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Solo admin puede gestionar asignaciones" ON user_branches
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Agregar branch_id a appointments (primero nullable)
ALTER TABLE appointments ADD COLUMN branch_id UUID REFERENCES branches(id);
UPDATE appointments SET branch_id = (SELECT id FROM branches WHERE code = 'central' LIMIT 1);
ALTER TABLE appointments ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX idx_appointments_branch ON appointments(branch_id);

-- Agregar branch_id a rooms
ALTER TABLE rooms ADD COLUMN branch_id UUID REFERENCES branches(id);
UPDATE rooms SET branch_id = (SELECT id FROM branches WHERE code = 'central' LIMIT 1);
ALTER TABLE rooms ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX idx_rooms_branch ON rooms(branch_id);

-- Agregar branch_id a invoices
ALTER TABLE invoices ADD COLUMN branch_id UUID REFERENCES branches(id);
UPDATE invoices SET branch_id = (SELECT id FROM branches WHERE code = 'central' LIMIT 1);
ALTER TABLE invoices ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX idx_invoices_branch ON invoices(branch_id);

-- Agregar branch_id a inventory_items
ALTER TABLE inventory_items ADD COLUMN branch_id UUID REFERENCES branches(id);
UPDATE inventory_items SET branch_id = (SELECT id FROM branches WHERE code = 'central' LIMIT 1);
ALTER TABLE inventory_items ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX idx_inventory_items_branch ON inventory_items(branch_id);

-- Agregar branch_id a inventory_movements
ALTER TABLE inventory_movements ADD COLUMN branch_id UUID REFERENCES branches(id);
UPDATE inventory_movements SET branch_id = (SELECT id FROM branches WHERE code = 'central' LIMIT 1);
ALTER TABLE inventory_movements ALTER COLUMN branch_id SET NOT NULL;

-- Agregar branch_id a cash_closures
ALTER TABLE cash_closures ADD COLUMN branch_id UUID REFERENCES branches(id);
UPDATE cash_closures SET branch_id = (SELECT id FROM branches WHERE code = 'central' LIMIT 1);
ALTER TABLE cash_closures ALTER COLUMN branch_id SET NOT NULL;

-- Asignar todos los doctores existentes a Sede Central por defecto
INSERT INTO user_branches (user_id, branch_id)
SELECT ur.user_id, b.id
FROM user_roles ur
CROSS JOIN branches b
WHERE ur.role = 'doctor' AND b.code = 'central'
ON CONFLICT (user_id, branch_id) DO NOTHING;

-- Trigger para updated_at en branches
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();