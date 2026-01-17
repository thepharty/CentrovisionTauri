-- ============================================================
-- MIGRACIÓN CONSOLIDADA - CentroVisión
-- ============================================================
-- 
-- Este archivo crea TODAS las tablas con su estructura FINAL,
-- incluyendo columnas agregadas posteriormente como deleted_at.
-- 
-- USO: Ejecutar este archivo en SQL Editor del nuevo proyecto
--      Supabase ANTES de importar los CSVs.
-- 
-- VENTAJAS vs migraciones individuales:
-- - Un solo archivo en lugar de 120+
-- - Esquema completo desde el inicio
-- - Sin errores de columnas faltantes al importar CSVs
-- 
-- Fecha de generación: Estructura actual de la base de datos
-- ============================================================

-- ============================================================
-- ENUMS (Tipos personalizados)
-- ============================================================

CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.appointment_type AS ENUM ('consulta', 'estudio', 'cirugia', 'procedimiento', 'reconsulta');
CREATE TYPE public.app_role AS ENUM ('admin', 'doctor', 'recepcion', 'asistente', 'optometrista', 'enfermeria');
CREATE TYPE public.branch_code AS ENUM ('VY', 'BR');
CREATE TYPE public.document_kind AS ENUM ('receta', 'indicaciones', 'consentimiento', 'otro');
CREATE TYPE public.encounter_type AS ENUM ('consulta', 'estudio', 'cirugia', 'procedimiento', 'reconsulta');
CREATE TYPE public.eye_side AS ENUM ('OD', 'OS', 'OU');
CREATE TYPE public.order_kind AS ENUM ('study', 'lab', 'imaging', 'referral');
CREATE TYPE public.order_priority AS ENUM ('routine', 'urgent', 'stat');
CREATE TYPE public.order_status AS ENUM ('ordered', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.room_kind AS ENUM ('consultorio', 'optometria', 'sala', 'estudios', 'preconsulta', 'otro');

-- ============================================================
-- TABLAS DE CONFIGURACIÓN (Sin dependencias)
-- ============================================================

-- Sucursales/Sedes
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  code branch_code,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuración de la aplicación
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Configuración de Edge Functions
CREATE TABLE public.edge_function_settings (
  function_name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_by UUID,
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLAS DE CATÁLOGOS
-- ============================================================

-- Tipos de estudio
CREATE TABLE public.study_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tipos de cirugía
CREATE TABLE public.surgery_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tipos de procedimiento
CREATE TABLE public.procedure_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Plantillas de documentos
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind document_kind NOT NULL,
  body JSONB NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Precios de servicios
CREATE TABLE public.service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  service_type appointment_type NOT NULL,
  price NUMERIC NOT NULL,
  requires_deposit BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Proveedores
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- USUARIOS Y PERFILES
-- ============================================================

-- Perfiles de usuario (referencia a auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  specialty TEXT,
  gender TEXT,
  is_visible_in_dashboard BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Roles de usuario
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Sedes asignadas a usuarios
CREATE TABLE public.user_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);

-- Registros pendientes de aprobación
CREATE TABLE public.pending_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role app_role NOT NULL,
  specialty TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SALAS Y ESPACIOS
-- ============================================================

-- Salas/Consultorios
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind room_kind NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PACIENTES - CON deleted_at INCLUIDO
-- ============================================================

CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob DATE,
  phone TEXT,
  email TEXT,
  allergies TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  address TEXT,
  diabetes BOOLEAN DEFAULT FALSE,
  hta BOOLEAN DEFAULT FALSE,
  ophthalmic_history TEXT DEFAULT '',
  occupation TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA DESDE EL INICIO
);

-- ============================================================
-- CITAS Y AGENDA
-- ============================================================

-- Citas
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  doctor_id UUID,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  type appointment_type NOT NULL DEFAULT 'consulta',
  status appointment_status NOT NULL DEFAULT 'scheduled',
  autorefractor TEXT,
  lensometry TEXT,
  photo_od TEXT,
  photo_oi TEXT,
  post_op_type TEXT,
  od_text TEXT,
  os_text TEXT,
  keratometry_od_k1 TEXT,
  keratometry_od_k2 TEXT,
  keratometry_od_axis TEXT,
  keratometry_os_k1 TEXT,
  keratometry_os_k2 TEXT,
  keratometry_os_axis TEXT,
  pio_od NUMERIC,
  pio_os NUMERIC,
  is_courtesy BOOLEAN DEFAULT FALSE,
  reception_notes TEXT,
  external_doctor_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

-- Bloqueos de agenda
CREATE TABLE public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  doctor_id UUID,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ENCUENTROS CLÍNICOS
-- ============================================================

-- Encuentros (consultas, estudios, cirugías, procedimientos)
CREATE TABLE public.encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  doctor_id UUID,
  type encounter_type NOT NULL DEFAULT 'consulta',
  date TIMESTAMPTZ DEFAULT now(),
  motivo_consulta TEXT,
  estudios TEXT,
  cirugias TEXT,
  plan_tratamiento TEXT,
  interpretacion_resultados TEXT,
  summary TEXT,
  proxima_cita TEXT,
  excursiones_od TEXT,
  excursiones_os TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

-- Exámenes oculares
CREATE TABLE public.exam_eye (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE,
  side eye_side NOT NULL,
  av_sc TEXT,
  av_cc TEXT,
  iop NUMERIC,
  ref_sphere NUMERIC,
  ref_cyl NUMERIC,
  ref_axis INTEGER,
  ref_subj_sphere NUMERIC,
  ref_subj_cyl NUMERIC,
  ref_subj_axis INTEGER,
  ref_subj_av TEXT,
  rx_sphere NUMERIC,
  rx_cyl NUMERIC,
  rx_axis INTEGER,
  rx_add NUMERIC,
  slit_lamp TEXT,
  fundus TEXT,
  plan TEXT,
  prescription_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

-- Diagnósticos
CREATE TABLE public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE,
  code TEXT,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

-- Cirugías
CREATE TABLE public.surgeries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  tipo_cirugia TEXT NOT NULL,
  ojo_operar eye_side NOT NULL DEFAULT 'OD',
  consentimiento_informado BOOLEAN NOT NULL DEFAULT FALSE,
  medicacion TEXT,
  nota_operatoria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Archivos de cirugías
CREATE TABLE public.surgery_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surgery_id UUID NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Procedimientos
CREATE TABLE public.procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  tipo_procedimiento TEXT NOT NULL,
  ojo_operar eye_side NOT NULL DEFAULT 'OD',
  consentimiento_informado BOOLEAN NOT NULL DEFAULT FALSE,
  medicacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estudios
CREATE TABLE public.studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  eye_side eye_side NOT NULL DEFAULT 'OU',
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Archivos de estudios
CREATE TABLE public.study_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Órdenes médicas
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  kind order_kind NOT NULL,
  side eye_side,
  status order_status NOT NULL DEFAULT 'ordered',
  priority order_priority NOT NULL DEFAULT 'routine',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Resultados de órdenes
CREATE TABLE public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  side eye_side,
  extracted_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Documentos clínicos
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  kind document_kind NOT NULL,
  file_path TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FACTURACIÓN
-- ============================================================

-- Facturas
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  balance_due NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  discount_type TEXT,
  discount_value NUMERIC,
  discount_reason TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

-- Items de factura
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id UUID,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pagos
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cierres de caja
CREATE TABLE public.cash_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  closure_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_invoiced NUMERIC NOT NULL DEFAULT 0,
  total_collected NUMERIC NOT NULL DEFAULT 0,
  total_pending NUMERIC NOT NULL DEFAULT 0,
  total_discounts NUMERIC,
  efectivo_total NUMERIC,
  tarjeta_total NUMERIC,
  transferencia_total NUMERIC,
  cheque_total NUMERIC,
  otro_total NUMERIC,
  consultas_count INTEGER,
  consultas_total NUMERIC,
  estudios_count INTEGER,
  estudios_total NUMERIC,
  procedimientos_count INTEGER,
  procedimientos_total NUMERIC,
  cirugias_count INTEGER,
  cirugias_total NUMERIC,
  inventory_count INTEGER,
  inventory_total NUMERIC,
  detailed_data JSONB,
  closed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INVENTARIO DE CAJA
-- ============================================================

-- Artículos de inventario
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  category TEXT NOT NULL,
  unit_price NUMERIC NOT NULL,
  cost_price NUMERIC,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER,
  requires_lot BOOLEAN NOT NULL DEFAULT FALSE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lotes de inventario
CREATE TABLE public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  expiry_date DATE,
  cost_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Movimientos de inventario
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INVENTARIO DE SALA
-- ============================================================

-- Categorías de inventario de sala
CREATE TABLE public.room_inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES room_inventory_categories(id) ON DELETE CASCADE,
  display_order INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Items de inventario de sala
CREATE TABLE public.room_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES room_inventory_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  brand TEXT,
  specification TEXT,
  unit TEXT,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Movimientos de inventario de sala
CREATE TABLE public.room_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES room_inventory_items(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  notes TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- CRM
-- ============================================================

-- Tipos de procedimiento CRM
CREATE TABLE public.crm_procedure_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  default_stages JSONB NOT NULL DEFAULT '[]',
  display_order INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pipelines CRM
CREATE TABLE public.crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  procedure_type_id UUID NOT NULL REFERENCES crm_procedure_types(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  doctor_id UUID,
  eye_side eye_side NOT NULL DEFAULT 'OD',
  current_stage TEXT NOT NULL DEFAULT 'Valoración',
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'normal',
  notes TEXT,
  cancellation_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Etapas de pipeline CRM
CREATE TABLE public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  amount NUMERIC,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notas de pipeline CRM
CREATE TABLE public.crm_pipeline_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log de actividad CRM
CREATE TABLE public.crm_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lectura de actividad CRM
CREATE TABLE public.crm_activity_read (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SISTEMA
-- ============================================================

-- Logs de auditoría
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Snapshots de backup
CREATE TABLE public.backup_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type TEXT NOT NULL,
  table_counts JSONB NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FOREIGN KEYS ADICIONALES (Referencias a profiles)
-- ============================================================

ALTER TABLE public.edge_function_settings 
  ADD CONSTRAINT edge_function_settings_disabled_by_fkey 
  FOREIGN KEY (disabled_by) REFERENCES profiles(user_id);

ALTER TABLE public.backup_snapshots 
  ADD CONSTRAINT backup_snapshots_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES profiles(user_id);

-- ============================================================
-- FUNCIONES
-- ============================================================

-- Función para generar número de factura
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  invoice_prefix TEXT := 'INV-';
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 5) AS INTEGER)), 0) + 1
  INTO next_number
  FROM invoices
  WHERE invoice_number LIKE 'INV-%';
  
  RETURN invoice_prefix || LPAD(next_number::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Función para generar número de factura por sucursal
CREATE OR REPLACE FUNCTION public.generate_invoice_number_for_branch(p_branch_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  branch_prefix TEXT;
BEGIN
  SELECT COALESCE(code::TEXT, 'XX') INTO branch_prefix FROM branches WHERE id = p_branch_id;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_number
  FROM invoices
  WHERE branch_id = p_branch_id;
  
  RETURN branch_prefix || '-' || LPAD(next_number::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Función para verificar si existe un admin
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a tablas con updated_at
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_encounters_updated_at BEFORE UPDATE ON encounters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================

CREATE INDEX idx_patients_code ON patients(code);
CREATE INDEX idx_patients_names ON patients(first_name, last_name);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_dates ON appointments(starts_at, ends_at);
CREATE INDEX idx_appointments_branch ON appointments(branch_id);
CREATE INDEX idx_encounters_patient ON encounters(patient_id);
CREATE INDEX idx_encounters_appointment ON encounters(appointment_id);
CREATE INDEX idx_invoices_patient ON invoices(patient_id);
CREATE INDEX idx_invoices_branch ON invoices(branch_id);
CREATE INDEX idx_inventory_items_branch ON inventory_items(branch_id);

-- ============================================================
-- FIN DE MIGRACIÓN CONSOLIDADA
-- ============================================================

-- NOTA: Después de ejecutar este script:
-- 1. Ejecutar el script de creación de usuarios (create_users.js)
-- 2. Importar los CSVs en el orden indicado en _IMPORT_ORDER.txt
-- 3. Configurar RLS policies según sea necesario
