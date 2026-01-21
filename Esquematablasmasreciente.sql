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
-- Fecha de exportación: 2026-01-20T20:16:20.808Z
-- ============================================================

-- ============================================================
-- ENUMS (Tipos personalizados)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_type AS ENUM ('consulta', 'estudio', 'cirugia', 'procedimiento', 'reconsulta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'doctor', 'recepcion', 'asistente', 'optometrista', 'enfermeria');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.branch_code AS ENUM ('VY', 'BR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.document_kind AS ENUM ('receta', 'indicaciones', 'consentimiento', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.encounter_type AS ENUM ('consulta', 'estudio', 'cirugia', 'procedimiento', 'reconsulta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.eye_side AS ENUM ('OD', 'OS', 'OU');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_kind AS ENUM ('study', 'lab', 'imaging', 'referral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_priority AS ENUM ('routine', 'urgent', 'stat');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('ordered', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.room_kind AS ENUM ('consultorio', 'optometria', 'sala', 'estudios', 'preconsulta', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLAS DE CONFIGURACIÓN (Sin dependencias)
-- ============================================================

-- Sucursales/Sedes
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  code branch_code,
  theme_primary_hsl TEXT DEFAULT '221 74% 54%', -- Color primario HSL para personalización de tema
  pdf_header_url TEXT, -- URL de imagen de encabezado para PDFs
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuración de la aplicación
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Configuración de Edge Functions
CREATE TABLE IF NOT EXISTS public.edge_function_settings (
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

CREATE TABLE IF NOT EXISTS public.study_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surgery_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procedure_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind document_kind NOT NULL,
  body JSONB NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  service_type appointment_type NOT NULL,
  price NUMERIC NOT NULL,
  requires_deposit BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
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

CREATE TABLE IF NOT EXISTS public.profiles (
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

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.user_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS public.pending_registrations (
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

CREATE TABLE IF NOT EXISTS public.rooms (
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

CREATE TABLE IF NOT EXISTS public.patients (
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

CREATE TABLE IF NOT EXISTS public.appointments (
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

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
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

CREATE TABLE IF NOT EXISTS public.encounters (
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

CREATE TABLE IF NOT EXISTS public.exam_eye (
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

CREATE TABLE IF NOT EXISTS public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE,
  code TEXT,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

CREATE TABLE IF NOT EXISTS public.surgeries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  tipo_cirugia TEXT NOT NULL,
  ojo_operar eye_side NOT NULL DEFAULT 'OD',
  consentimiento_informado BOOLEAN NOT NULL DEFAULT FALSE,
  medicacion TEXT,
  nota_operatoria TEXT,
  consent_signature_id UUID, -- Referencia a firma digital (se agrega FK después de crear consent_signatures)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surgery_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surgery_id UUID NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  tipo_procedimiento TEXT NOT NULL,
  ojo_operar eye_side NOT NULL DEFAULT 'OD',
  consentimiento_informado BOOLEAN NOT NULL DEFAULT FALSE,
  medicacion TEXT,
  consent_signature_id UUID, -- Referencia a firma digital (se agrega FK después de crear consent_signatures)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Firmas digitales de consentimientos informados
CREATE TABLE IF NOT EXISTS public.consent_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surgery_id UUID REFERENCES surgeries(id) ON DELETE SET NULL, -- Cirugía asociada (opcional)
  procedure_id UUID REFERENCES procedures(id) ON DELETE SET NULL, -- Procedimiento asociado (opcional)
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE, -- Paciente que firma
  patient_signature TEXT NOT NULL, -- Base64 de la imagen PNG de la firma
  patient_name TEXT NOT NULL, -- Nombre del paciente como fue escrito
  witness_signature TEXT NOT NULL, -- Base64 de la imagen PNG de la firma del testigo
  witness_name TEXT NOT NULL, -- Nombre del testigo
  consent_text TEXT NOT NULL, -- Texto del consentimiento que firmaron
  pdf_url TEXT, -- URL del PDF generado con las firmas
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- Momento de la firma
  signed_by UUID REFERENCES profiles(user_id), -- Usuario que operó el sistema (kiosko)
  branch_id UUID REFERENCES branches(id) -- Sucursal donde se firmó
);

-- Agregar FKs a surgeries y procedures (después de crear consent_signatures)
ALTER TABLE public.surgeries
  ADD CONSTRAINT surgeries_consent_signature_fk
  FOREIGN KEY (consent_signature_id) REFERENCES consent_signatures(id) ON DELETE SET NULL;

ALTER TABLE public.procedures
  ADD CONSTRAINT procedures_consent_signature_fk
  FOREIGN KEY (consent_signature_id) REFERENCES consent_signatures(id) ON DELETE SET NULL;

-- Médicos que refieren pacientes (internos y externos)
CREATE TABLE IF NOT EXISTS public.referring_doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false, -- true si es médico del sistema
  internal_profile_id UUID REFERENCES profiles(user_id), -- si es interno
  created_at TIMESTAMPTZ DEFAULT now(),
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  referring_doctor_id UUID REFERENCES referring_doctors(id), -- OPCIONAL: médico que refirió el estudio
  title TEXT NOT NULL,
  eye_side eye_side NOT NULL DEFAULT 'OU',
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
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

CREATE TABLE IF NOT EXISTS public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  side eye_side,
  extracted_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
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

CREATE TABLE IF NOT EXISTS public.invoices (
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

CREATE TABLE IF NOT EXISTS public.invoice_items (
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

CREATE TABLE IF NOT EXISTS public.payments (
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

CREATE TABLE IF NOT EXISTS public.cash_closures (
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

CREATE TABLE IF NOT EXISTS public.inventory_items (
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

CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  expiry_date DATE,
  cost_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
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

CREATE TABLE IF NOT EXISTS public.room_inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES room_inventory_categories(id) ON DELETE CASCADE,
  display_order INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_inventory_items (
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

CREATE TABLE IF NOT EXISTS public.room_inventory_movements (
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

CREATE TABLE IF NOT EXISTS public.crm_procedure_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  default_stages JSONB NOT NULL DEFAULT '[]',
  display_order INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_pipelines (
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

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
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

CREATE TABLE IF NOT EXISTS public.crm_pipeline_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_activity_log (
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

CREATE TABLE IF NOT EXISTS public.crm_activity_read (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SISTEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.backup_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type TEXT NOT NULL,
  table_counts JSONB NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FUNCIONES UTILITARIAS
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 5) AS INTEGER)), 0) + 1
  INTO next_number
  FROM invoices
  WHERE invoice_number LIKE 'INV-%';
  
  RETURN 'INV-' || LPAD(next_number::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función para verificar rol de usuario
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Función para obtener rol del usuario
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Función para verificar acceso CRM
CREATE OR REPLACE FUNCTION public.has_crm_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = _user_id
    AND role IN ('admin', 'recepcion', 'caja', 'contabilidad', 'enfermeria', 'diagnostico')
  )
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS update_patients_updated_at ON patients;
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_encounters_updated_at ON encounters;
CREATE TRIGGER update_encounters_updated_at BEFORE UPDATE ON encounters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(code);
CREATE INDEX IF NOT EXISTS idx_patients_names ON patients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_dates ON appointments(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_appointments_branch ON appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_appointment ON encounters(appointment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch ON inventory_items(branch_id);

-- ============================================================
-- ROW LEVEL SECURITY - Habilitar RLS en todas las tablas
-- ============================================================

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_eye ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_function_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_procedure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activity_read ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLÍTICAS RLS (Row Level Security)
-- ============================================================

-- PACIENTES
CREATE POLICY "Todos pueden leer pacientes" ON patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Recepción y admins pueden crear pacientes" ON patients FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion'));
CREATE POLICY "Recepción y admins pueden actualizar pacientes" ON patients FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion'));
CREATE POLICY "Admins pueden borrar pacientes" ON patients FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Médicos pueden actualizar antecedentes de pacientes" ON patients FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'doctor'));

-- PERFILES
CREATE POLICY "Usuarios pueden ver todos los perfiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Usuarios pueden insertar su propio perfil" ON profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ROLES
CREATE POLICY "Todos pueden ver roles" ON user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Solo admin puede gestionar roles" ON user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- BRANCHES Y USER_BRANCHES
CREATE POLICY "Todos pueden ver branches" ON branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar branches" ON branches FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Todos pueden ver user_branches" ON user_branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar user_branches" ON user_branches FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- SALAS
CREATE POLICY "Todos pueden ver salas" ON rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar salas" ON rooms FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- CITAS
CREATE POLICY "Todos pueden ver citas" ON appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear citas" ON appointments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "Personal clínico puede actualizar citas" ON appointments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "Personal clínico puede eliminar citas" ON appointments FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion') OR has_role(auth.uid(), 'doctor'));

-- BLOQUEOS DE AGENDA
CREATE POLICY "Todos pueden ver bloqueos" ON schedule_blocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal puede gestionar bloqueos" ON schedule_blocks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion') OR has_role(auth.uid(), 'doctor'));

-- ENCUENTROS CLÍNICOS
CREATE POLICY "Todos pueden ver encuentros" ON encounters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear encuentros" ON encounters FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'optometrista') OR has_role(auth.uid(), 'asistente'));
CREATE POLICY "Personal clínico puede actualizar encuentros" ON encounters FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'optometrista') OR has_role(auth.uid(), 'asistente'));
CREATE POLICY "Admin y doctor pueden eliminar encuentros" ON encounters FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- EXÁMENES OCULARES
CREATE POLICY "Todos pueden ver exámenes" ON exam_eye FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar exámenes" ON exam_eye FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'optometrista'));

-- DIAGNÓSTICOS
CREATE POLICY "Todos pueden ver diagnósticos" ON diagnoses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar diagnósticos" ON diagnoses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- CIRUGÍAS
CREATE POLICY "Todos pueden ver cirugías" ON surgeries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Médicos pueden gestionar cirugías" ON surgeries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- ARCHIVOS DE CIRUGÍAS
CREATE POLICY "Personal clínico puede ver archivos de cirugías" ON surgery_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear archivos de cirugías" ON surgery_files FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'enfermeria'));
CREATE POLICY "Personal clínico puede eliminar archivos de cirugías" ON surgery_files FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- PROCEDIMIENTOS
CREATE POLICY "Todos pueden ver procedimientos" ON procedures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar procedimientos" ON procedures FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- MÉDICOS REFERIDORES
ALTER TABLE referring_doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos pueden ver médicos referidores" ON referring_doctors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal puede crear médicos referidores" ON referring_doctors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Personal puede actualizar médicos referidores" ON referring_doctors FOR UPDATE TO authenticated USING (true);

-- FIRMAS DE CONSENTIMIENTOS
ALTER TABLE consent_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos pueden ver firmas de consentimientos" ON consent_signatures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal puede crear firmas" ON consent_signatures FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin puede actualizar firmas" ON consent_signatures FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin puede eliminar firmas" ON consent_signatures FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- ESTUDIOS
CREATE POLICY "Todos pueden ver estudios" ON studies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal puede gestionar estudios" ON studies FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'diagnostico'));

-- ARCHIVOS DE ESTUDIOS
CREATE POLICY "Personal clínico puede ver archivos de estudios" ON study_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear archivos de estudios" ON study_files FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede eliminar archivos de estudios" ON study_files FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- ÓRDENES Y RESULTADOS
CREATE POLICY "Todos pueden ver órdenes" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar órdenes" ON orders FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));
CREATE POLICY "Todos pueden ver resultados" ON results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar resultados" ON results FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'diagnostico'));

-- DOCUMENTOS
CREATE POLICY "Todos pueden ver documentos" ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear documentos" ON documents FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- PLANTILLAS
CREATE POLICY "Todos pueden ver plantillas" ON templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar plantillas" ON templates FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- FACTURAS, ITEMS Y PAGOS
CREATE POLICY "Todos pueden ver facturas" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar facturas" ON invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Todos pueden ver items de factura" ON invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar items" ON invoice_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Todos pueden ver pagos" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar pagos" ON payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

-- CIERRES DE CAJA
CREATE POLICY "Admin y caja pueden ver cierres" ON cash_closures FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Admin y caja pueden crear cierres" ON cash_closures FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

-- INVENTARIO (BOX)
CREATE POLICY "Todos pueden ver inventario" ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar inventario" ON inventory_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "Todos pueden ver lotes" ON inventory_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar lotes" ON inventory_lots FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "Todos pueden ver movimientos" ON inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar movimientos" ON inventory_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja'));

-- INVENTARIO DE SALAS
CREATE POLICY "Todos pueden ver categorías de inventario de sala" ON room_inventory_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y enfermería pueden gestionar categorías" ON room_inventory_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'enfermeria'));
CREATE POLICY "Todos pueden ver items de inventario de sala" ON room_inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y enfermería pueden gestionar items" ON room_inventory_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'enfermeria'));
CREATE POLICY "Todos pueden ver movimientos de sala" ON room_inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y enfermería pueden gestionar movimientos de sala" ON room_inventory_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'enfermeria'));

-- PRECIOS DE SERVICIOS
CREATE POLICY "Todos pueden ver precios" ON service_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar precios" ON service_prices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

-- PROVEEDORES
CREATE POLICY "Todos pueden ver proveedores" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar proveedores" ON suppliers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja'));

-- CATÁLOGOS (tipos de cirugía, estudio, procedimiento)
CREATE POLICY "Todos pueden ver tipos de cirugía" ON surgery_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Solo admin puede gestionar tipos de cirugía" ON surgery_types FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Todos pueden ver tipos de estudio" ON study_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Solo admin puede gestionar tipos de estudio" ON study_types FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Todos pueden ver tipos de procedimiento" ON procedure_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Solo admin puede gestionar tipos de procedimiento" ON procedure_types FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- REGISTROS PENDIENTES
CREATE POLICY "Admin puede ver registros pendientes" ON pending_registrations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin puede gestionar registros pendientes" ON pending_registrations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- CONFIGURACIÓN
CREATE POLICY "Todos pueden ver app_settings" ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar app_settings" ON app_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Todos pueden ver edge_function_settings" ON edge_function_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar edge_function_settings" ON edge_function_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- AUDITORÍA Y BACKUPS
CREATE POLICY "Todos pueden ver audit_logs" ON audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sistema puede insertar audit_logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin puede gestionar snapshots" ON backup_snapshots FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- CRM - TIPOS DE PROCEDIMIENTO
CREATE POLICY "Usuarios CRM pueden ver tipos de procedimiento CRM" ON crm_procedure_types FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Admin puede gestionar tipos de procedimiento CRM" ON crm_procedure_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- CRM - PIPELINES
CREATE POLICY "Usuarios CRM pueden ver pipelines" ON crm_pipelines FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios CRM pueden gestionar pipelines" ON crm_pipelines FOR ALL TO authenticated
  USING (has_crm_access(auth.uid())) WITH CHECK (has_crm_access(auth.uid()));

-- CRM - ETAPAS
CREATE POLICY "Usuarios CRM pueden ver etapas" ON crm_pipeline_stages FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios CRM pueden gestionar etapas" ON crm_pipeline_stages FOR ALL TO authenticated
  USING (has_crm_access(auth.uid())) WITH CHECK (has_crm_access(auth.uid()));

-- CRM - NOTAS
CREATE POLICY "Usuarios CRM pueden ver notas" ON crm_pipeline_notes FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios CRM pueden gestionar notas" ON crm_pipeline_notes FOR ALL TO authenticated
  USING (has_crm_access(auth.uid())) WITH CHECK (has_crm_access(auth.uid()));

-- CRM - ACTIVIDAD
CREATE POLICY "Usuarios CRM pueden ver actividades" ON crm_activity_log FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios CRM pueden registrar actividades" ON crm_activity_log FOR INSERT TO authenticated
  WITH CHECK (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios pueden gestionar su lectura de actividad" ON crm_activity_read FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FIN DE MIGRACIÓN CONSOLIDADA
-- ============================================================

-- NOTA: Después de ejecutar este script:
-- 1. Ejecutar el script de creación de usuarios (create_users.js)
-- 2. Importar los CSVs en el orden indicado en _IMPORT_ORDER.txt
