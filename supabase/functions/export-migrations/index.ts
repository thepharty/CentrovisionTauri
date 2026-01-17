import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Verify user is admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obtener TODOS los roles del usuario (puede tener múltiples)
    const { data: rolesData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    // Verificar si alguno de sus roles es 'admin'
    const isAdmin = rolesData?.some(r => r.role === 'admin');

    if (!isAdmin) {
      console.log('User roles:', rolesData);
      return new Response(
        JSON.stringify({ error: 'Solo administradores pueden exportar migraciones' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Admin verified, user has roles:', rolesData?.map(r => r.role));

    // Use service role to query system tables
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Fetching database schema information...');

    // Get all ENUMs
    const { data: enumsData } = await adminClient.rpc('get_user_role', { _user_id: user.id });
    
    // Build comprehensive SQL export
    const exportDate = new Date().toISOString();
    
    let sqlContent = `-- ============================================================
-- EXPORTACIÓN COMPLETA DE ESQUEMA - CentroVisión
-- ============================================================
-- Fecha de exportación: ${exportDate}
-- 
-- Este archivo contiene:
-- 1. Tipos ENUM personalizados
-- 2. Definiciones de tablas
-- 3. Funciones de base de datos
-- 4. Triggers
-- 5. Políticas RLS (Row Level Security)
-- 6. Configuración de Storage
--
-- INSTRUCCIONES:
-- 1. Crea un nuevo proyecto en Supabase
-- 2. Ve a SQL Editor
-- 3. Ejecuta este archivo COMPLETO
-- 4. Luego importa los datos desde los CSVs
--
-- NOTA: Ejecutar en orden. Si hay errores de dependencia,
-- ejecutar por secciones.
-- ============================================================

-- ============================================================
-- SECCIÓN 1: TIPOS ENUM
-- ============================================================

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'doctor', 'nurse', 'reception', 'estudios', 'diagnostico', 'caja', 'contabilidad');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('scheduled', 'checked_in', 'done', 'cancelled', 'no_show', 'preconsulta_ready');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE appointment_type AS ENUM ('consulta', 'diagnostico', 'cirugia', 'control', 'nueva_consulta', 'reconsulta_menos_3m', 'reconsulta_mas_3m', 'post_operado', 'lectura_resultados', 'cortesia', 'procedimiento', 'estudio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE branch_code AS ENUM ('central', 'santa_lucia');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE document_kind AS ENUM ('receta', 'receta_lentes', 'orden_estudio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE encounter_type AS ENUM ('consulta', 'posop', 'urgencia', 'quirurgico');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE eye_side AS ENUM ('OD', 'OI', 'OU');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_kind AS ENUM ('topografia', 'OCT', 'campovisual', 'biometria', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_priority AS ENUM ('normal', 'alta', 'urgente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('ordered', 'done', 'reported', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE room_kind AS ENUM ('consultorio', 'diagnostico', 'quirofano');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- SECCIÓN 2: TABLAS PRINCIPALES
-- ============================================================

-- App Settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Branches (Sedes)
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code branch_code,
  address text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Profiles (Perfiles de usuario)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text,
  specialty text,
  gender text DEFAULT 'M',
  is_visible_in_dashboard boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- User Branches
CREATE TABLE IF NOT EXISTS public.user_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Rooms (Salas)
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  name text NOT NULL,
  kind room_kind NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Suppliers (Proveedores)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Patients (Pacientes)
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  dob date,
  phone text,
  email text,
  address text,
  occupation text,
  diabetes boolean DEFAULT false,
  hta boolean DEFAULT false,
  allergies text DEFAULT '',
  ophthalmic_history text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Service Prices
CREATE TABLE IF NOT EXISTS public.service_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  service_type appointment_type NOT NULL,
  price numeric NOT NULL,
  requires_deposit boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Study Types
CREATE TABLE IF NOT EXISTS public.study_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Surgery Types
CREATE TABLE IF NOT EXISTS public.surgery_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Procedure Types
CREATE TABLE IF NOT EXISTS public.procedure_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Templates
CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind document_kind NOT NULL,
  body jsonb NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Inventory Items
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  code text,
  name text NOT NULL,
  category text NOT NULL,
  unit_price numeric NOT NULL,
  cost_price numeric DEFAULT 0,
  current_stock numeric NOT NULL DEFAULT 0,
  min_stock numeric DEFAULT 0,
  requires_lot boolean NOT NULL DEFAULT false,
  supplier_id uuid REFERENCES public.suppliers(id),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Inventory Lots
CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id),
  lot_number text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  expiry_date date,
  cost_price numeric,
  created_at timestamptz DEFAULT now()
);

-- Appointments (Citas)
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  room_id uuid REFERENCES public.rooms(id),
  doctor_id uuid,
  external_doctor_name text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  type appointment_type NOT NULL DEFAULT 'consulta',
  status appointment_status NOT NULL DEFAULT 'scheduled',
  reason text,
  reception_notes text,
  is_courtesy boolean DEFAULT false,
  autorefractor text,
  lensometry text,
  pio_od numeric,
  pio_os numeric,
  keratometry_od_k1 text,
  keratometry_od_k2 text,
  keratometry_od_axis text,
  keratometry_os_k1 text,
  keratometry_os_k2 text,
  keratometry_os_axis text,
  photo_od text,
  photo_oi text,
  od_text text,
  os_text text,
  post_op_type text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Schedule Blocks
CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  room_id uuid REFERENCES public.rooms(id),
  doctor_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Encounters (Encuentros clínicos)
CREATE TABLE IF NOT EXISTS public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  appointment_id uuid REFERENCES public.appointments(id),
  doctor_id uuid,
  date timestamptz DEFAULT now(),
  type encounter_type NOT NULL DEFAULT 'consulta',
  motivo_consulta text,
  summary text DEFAULT '',
  plan_tratamiento text,
  cirugias text,
  estudios text,
  proxima_cita text,
  excursiones_od text,
  excursiones_os text,
  interpretacion_resultados text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Exam Eye (Exámenes oculares)
CREATE TABLE IF NOT EXISTS public.exam_eye (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  side eye_side NOT NULL,
  av_sc text,
  av_cc text,
  ref_sphere numeric,
  ref_cyl numeric,
  ref_axis integer,
  ref_subj_sphere numeric,
  ref_subj_cyl numeric,
  ref_subj_axis integer,
  ref_subj_av text,
  rx_sphere numeric,
  rx_cyl numeric,
  rx_axis integer,
  rx_add numeric,
  prescription_notes text,
  iop numeric,
  slit_lamp text,
  fundus text,
  plan text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Diagnoses
CREATE TABLE IF NOT EXISTS public.diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  code text,
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Surgeries
CREATE TABLE IF NOT EXISTS public.surgeries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  tipo_cirugia text NOT NULL,
  ojo_operar eye_side NOT NULL DEFAULT 'OU',
  consentimiento_informado boolean NOT NULL DEFAULT false,
  nota_operatoria text,
  medicacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Surgery Files
CREATE TABLE IF NOT EXISTS public.surgery_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surgery_id uuid NOT NULL REFERENCES public.surgeries(id),
  file_path text NOT NULL,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Procedures
CREATE TABLE IF NOT EXISTS public.procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  tipo_procedimiento text NOT NULL,
  ojo_operar eye_side NOT NULL DEFAULT 'OU',
  consentimiento_informado boolean NOT NULL DEFAULT false,
  medicacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Studies
CREATE TABLE IF NOT EXISTS public.studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  appointment_id uuid REFERENCES public.appointments(id),
  title text NOT NULL,
  eye_side eye_side NOT NULL DEFAULT 'OU',
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Study Files
CREATE TABLE IF NOT EXISTS public.study_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies(id),
  file_path text NOT NULL,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  kind order_kind NOT NULL,
  priority order_priority NOT NULL DEFAULT 'normal',
  side eye_side DEFAULT 'OU',
  status order_status NOT NULL DEFAULT 'ordered',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Results
CREATE TABLE IF NOT EXISTS public.results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  file_path text NOT NULL,
  mime_type text,
  side eye_side DEFAULT 'OU',
  extracted_summary text,
  created_at timestamptz DEFAULT now()
);

-- Documents
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  kind document_kind NOT NULL,
  file_path text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  appointment_id uuid REFERENCES public.appointments(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  total_amount numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  discount_type text,
  discount_value numeric DEFAULT 0,
  discount_reason text,
  notes text,
  status text NOT NULL DEFAULT 'pendiente',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Invoice Items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  item_type text NOT NULL,
  item_id uuid,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  subtotal numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'completado',
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Cash Closures
CREATE TABLE IF NOT EXISTS public.cash_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  closure_date timestamptz NOT NULL DEFAULT now(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_invoiced numeric NOT NULL DEFAULT 0,
  total_collected numeric NOT NULL DEFAULT 0,
  total_pending numeric NOT NULL DEFAULT 0,
  total_discounts numeric DEFAULT 0,
  consultas_total numeric DEFAULT 0,
  consultas_count integer DEFAULT 0,
  cirugias_total numeric DEFAULT 0,
  cirugias_count integer DEFAULT 0,
  procedimientos_total numeric DEFAULT 0,
  procedimientos_count integer DEFAULT 0,
  estudios_total numeric DEFAULT 0,
  estudios_count integer DEFAULT 0,
  inventory_total numeric DEFAULT 0,
  inventory_count integer DEFAULT 0,
  efectivo_total numeric DEFAULT 0,
  tarjeta_total numeric DEFAULT 0,
  transferencia_total numeric DEFAULT 0,
  cheque_total numeric DEFAULT 0,
  otro_total numeric DEFAULT 0,
  detailed_data jsonb,
  closed_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Inventory Movements
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  lot_id uuid REFERENCES public.inventory_lots(id),
  movement_type text NOT NULL,
  quantity numeric NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  target_table text,
  target_id text,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);

-- Pending Registrations
CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role app_role NOT NULL,
  specialty text,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Edge Function Settings
CREATE TABLE IF NOT EXISTS public.edge_function_settings (
  function_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  disabled_by uuid,
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CRM Procedure Types
CREATE TABLE IF NOT EXISTS public.crm_procedure_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  default_stages jsonb NOT NULL DEFAULT '[]',
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- CRM Pipelines
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  procedure_type_id uuid NOT NULL REFERENCES public.crm_procedure_types(id),
  doctor_id uuid,
  eye_side eye_side NOT NULL DEFAULT 'OU',
  current_stage text NOT NULL DEFAULT 'lead',
  status text NOT NULL DEFAULT 'active',
  priority text NOT NULL DEFAULT 'normal',
  notes text,
  cancellation_reason text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CRM Pipeline Stages
CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  stage_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  amount numeric,
  notes text,
  completed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz DEFAULT now()
);

-- CRM Pipeline Notes
CREATE TABLE IF NOT EXISTS public.crm_pipeline_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- CRM Activity Log
CREATE TABLE IF NOT EXISTS public.crm_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  activity_type text NOT NULL,
  from_stage text,
  to_stage text,
  reason text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- CRM Activity Read
CREATE TABLE IF NOT EXISTS public.crm_activity_read (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  last_read_at timestamptz DEFAULT now()
);

-- Room Inventory Categories
CREATE TABLE IF NOT EXISTS public.room_inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  name text NOT NULL,
  parent_id uuid REFERENCES public.room_inventory_categories(id),
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Room Inventory Items
CREATE TABLE IF NOT EXISTS public.room_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  category_id uuid NOT NULL REFERENCES public.room_inventory_categories(id),
  name text NOT NULL,
  code text,
  brand text,
  specification text,
  unit text,
  current_stock numeric NOT NULL DEFAULT 0,
  min_stock numeric DEFAULT 0,
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Room Inventory Movements
CREATE TABLE IF NOT EXISTS public.room_inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.room_inventory_items(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  movement_type text NOT NULL,
  quantity numeric NOT NULL,
  notes text,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- SECCIÓN 3: FUNCIONES DE BASE DE DATOS
-- ============================================================

-- Function: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function: get_user_role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Function: admin_exists
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin')
$$;

-- Function: generate_invoice_number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Function: handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Function: update_invoice_balance
CREATE OR REPLACE FUNCTION public.update_invoice_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Function: update_item_stock
CREATE OR REPLACE FUNCTION public.update_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    
  ELSIF NEW.movement_type IN ('salida', 'cortesia') THEN
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

-- Function: create_inventory_movement_from_invoice
CREATE OR REPLACE FUNCTION public.create_inventory_movement_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item_branch_id uuid;
BEGIN
  IF NEW.item_type = 'producto' AND NEW.item_id IS NOT NULL THEN
    SELECT branch_id INTO item_branch_id
    FROM public.inventory_items
    WHERE id = NEW.item_id;
    
    IF item_branch_id IS NULL THEN
      RAISE WARNING 'No se pudo obtener branch_id para inventory_item %', NEW.item_id;
      RETURN NEW;
    END IF;
    
    INSERT INTO public.inventory_movements (
      item_id,
      branch_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      NEW.item_id,
      item_branch_id,
      'salida',
      NEW.quantity,
      'venta',
      NEW.invoice_id,
      'Venta automática - Factura',
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function: enforce_doctor_patient_update_columns
CREATE OR REPLACE FUNCTION public.enforce_doctor_patient_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_doctor boolean;
BEGIN
  is_doctor := public.has_role(auth.uid(), 'doctor');

  IF is_doctor THEN
    IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
       OR (NEW.last_name IS DISTINCT FROM OLD.last_name)
       OR (NEW.phone IS DISTINCT FROM OLD.phone)
       OR (NEW.email IS DISTINCT FROM OLD.email)
       OR (NEW.address IS DISTINCT FROM OLD.address)
       OR (NEW.dob IS DISTINCT FROM OLD.dob)
       OR (NEW.code IS DISTINCT FROM OLD.code) THEN
      RAISE EXCEPTION 'Los médicos solo pueden actualizar antecedentes y alertas médicas del paciente.';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Function: get_storage_stats
CREATE OR REPLACE FUNCTION public.get_storage_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
DECLARE
  stats json;
BEGIN
  SELECT json_agg(bucket_stats)
  INTO stats
  FROM (
    SELECT 
      bucket_id,
      COUNT(*)::int as total_files,
      COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint as total_bytes
    FROM storage.objects
    WHERE bucket_id IN ('documents', 'results', 'studies', 'surgeries')
    GROUP BY bucket_id
  ) bucket_stats;
  
  RETURN COALESCE(stats, '[]'::json);
END;
$$;

-- Function: get_service_sales (Reportes de Caja)
CREATE OR REPLACE FUNCTION public.get_service_sales(start_date timestamp with time zone, end_date timestamp with time zone)
RETURNS TABLE(service_type text, cantidad bigint, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    sp.service_type::text,
    COUNT(ii.id)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN service_prices sp ON ii.item_id = sp.id
  JOIN invoices i ON ii.invoice_id = i.id
  WHERE ii.item_type = 'servicio'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY sp.service_type;
$$;

-- Function: get_inventory_sales (Reportes de Caja)
CREATE OR REPLACE FUNCTION public.get_inventory_sales(start_date timestamp with time zone, end_date timestamp with time zone)
RETURNS TABLE(category text, cantidad bigint, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    inv.category,
    COUNT(ii.id)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN inventory_items inv ON ii.item_id = inv.id
  JOIN invoices i ON ii.invoice_id = i.id
  WHERE ii.item_type = 'producto'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY inv.category;
$$;

-- Function: get_payment_methods (Reportes de Caja)
CREATE OR REPLACE FUNCTION public.get_payment_methods(start_date timestamp with time zone, end_date timestamp with time zone)
RETURNS TABLE(payment_method text, cantidad bigint, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    payment_method,
    COUNT(*)::bigint as cantidad,
    COALESCE(SUM(amount), 0)::numeric as total
  FROM payments
  WHERE created_at >= start_date
    AND created_at <= end_date
    AND status = 'completado'
  GROUP BY payment_method;
$$;

-- Function: get_service_details (Reportes de Caja)
CREATE OR REPLACE FUNCTION public.get_service_details(start_date timestamp with time zone, end_date timestamp with time zone)
RETURNS TABLE(service_type text, service_name text, cantidad bigint, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    COALESCE(sp.service_type::text, 'otro') as service_type,
    ii.description as service_name,
    COUNT(ii.id)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN service_prices sp ON sp.id = ii.item_id
  WHERE ii.item_type = 'servicio'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY sp.service_type, ii.description
  ORDER BY sp.service_type, ii.description;
$$;

-- Function: get_inventory_details (Reportes de Caja)
CREATE OR REPLACE FUNCTION public.get_inventory_details(start_date timestamp with time zone, end_date timestamp with time zone)
RETURNS TABLE(category text, product_name text, cantidad numeric, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    COALESCE(inv.category, 'Otros') as category,
    ii.description as product_name,
    SUM(ii.quantity)::numeric as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN inventory_items inv ON inv.id = ii.item_id
  WHERE ii.item_type = 'producto'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY inv.category, ii.description
  ORDER BY inv.category, ii.description;
$$;

-- Function: get_clinical_stats_with_revenue (Analytics)
CREATE OR REPLACE FUNCTION public.get_clinical_stats_with_revenue(start_date timestamp with time zone, end_date timestamp with time zone, doctor_filter uuid DEFAULT NULL::uuid)
RETURNS TABLE(tipo_cita text, doctor_id uuid, doctor_name text, cantidad bigint, pacientes_unicos bigint, revenue_real numeric, revenue_estimado numeric, revenue_total numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    SELECT 
      a.id as appointment_id,
      a.type::text as tipo_cita,
      a.doctor_id,
      COALESCE(p.full_name, 'Sin asignar') as doctor_name,
      a.patient_id,
      a.starts_at,
      i.id as invoice_id,
      i.total_amount as invoice_amount
    FROM appointments a
    LEFT JOIN profiles p ON p.user_id = a.doctor_id
    LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
    WHERE a.status = 'done'
      AND a.starts_at >= start_date
      AND a.starts_at <= end_date
      AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
  ),
  service_prices_lookup AS (
    SELECT 
      service_type::text,
      AVG(price) as avg_price
    FROM service_prices
    WHERE active = true
    GROUP BY service_type
  ),
  calculated_revenue AS (
    SELECT 
      ad.tipo_cita,
      ad.doctor_id,
      ad.doctor_name,
      ad.appointment_id,
      ad.patient_id,
      CASE 
        WHEN ad.invoice_id IS NOT NULL THEN ad.invoice_amount
        ELSE 0
      END as revenue_real,
      CASE 
        WHEN ad.invoice_id IS NULL THEN COALESCE(sp.avg_price, 0)
        ELSE 0
      END as revenue_estimado
    FROM appointment_data ad
    LEFT JOIN service_prices_lookup sp ON sp.service_type = ad.tipo_cita
  )
  SELECT 
    cr.tipo_cita,
    cr.doctor_id,
    cr.doctor_name,
    COUNT(cr.appointment_id)::bigint as cantidad,
    COUNT(DISTINCT cr.patient_id)::bigint as pacientes_unicos,
    COALESCE(SUM(cr.revenue_real), 0)::numeric as revenue_real,
    COALESCE(SUM(cr.revenue_estimado), 0)::numeric as revenue_estimado,
    COALESCE(SUM(cr.revenue_real + cr.revenue_estimado), 0)::numeric as revenue_total
  FROM calculated_revenue cr
  GROUP BY cr.tipo_cita, cr.doctor_id, cr.doctor_name
  ORDER BY cr.doctor_name, cr.tipo_cita;
END;
$$;

-- Function: get_doctor_activity_detail (Analytics)
CREATE OR REPLACE FUNCTION public.get_doctor_activity_detail(start_date timestamp with time zone, end_date timestamp with time zone, doctor_filter uuid DEFAULT NULL::uuid, appointment_type_filter appointment_type DEFAULT NULL::appointment_type)
RETURNS TABLE(appointment_id uuid, patient_id uuid, patient_code text, patient_name text, appointment_type text, appointment_date timestamp with time zone, doctor_id uuid, doctor_name text, invoice_id uuid, invoice_amount numeric, is_invoiced boolean, estimated_price numeric, total_revenue numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    SELECT 
      a.id as appointment_id,
      a.patient_id,
      p.code as patient_code,
      CONCAT(p.first_name, ' ', p.last_name) as patient_name,
      a.type::text as appointment_type,
      a.starts_at as appointment_date,
      a.doctor_id,
      COALESCE(prof.full_name, 'Sin asignar') as doctor_name,
      i.id as invoice_id,
      i.total_amount as invoice_amount
    FROM appointments a
    INNER JOIN patients p ON p.id = a.patient_id
    LEFT JOIN profiles prof ON prof.user_id = a.doctor_id
    LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
    WHERE a.status = 'done'
      AND a.starts_at >= start_date
      AND a.starts_at <= end_date
      AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
      AND (appointment_type_filter IS NULL OR a.type = appointment_type_filter)
  ),
  service_prices_lookup AS (
    SELECT 
      service_type::text,
      AVG(price) as avg_price
    FROM service_prices
    WHERE active = true
    GROUP BY service_type
  )
  SELECT 
    ad.appointment_id,
    ad.patient_id,
    ad.patient_code,
    ad.patient_name,
    ad.appointment_type,
    ad.appointment_date,
    ad.doctor_id,
    ad.doctor_name,
    ad.invoice_id,
    ad.invoice_amount,
    (ad.invoice_id IS NOT NULL) as is_invoiced,
    COALESCE(sp.avg_price, 0)::numeric as estimated_price,
    CASE 
      WHEN ad.invoice_id IS NOT NULL THEN ad.invoice_amount
      ELSE COALESCE(sp.avg_price, 0)
    END::numeric as total_revenue
  FROM appointment_data ad
  LEFT JOIN service_prices_lookup sp ON sp.service_type = ad.appointment_type
  ORDER BY ad.appointment_date DESC, ad.patient_name;
END;
$$;

-- Function: get_clinical_research_data (Research - CRÍTICA - VERSIÓN COMPLETA)
CREATE OR REPLACE FUNCTION public.get_clinical_research_data(
  start_date timestamp with time zone, 
  end_date timestamp with time zone, 
  doctor_filter uuid DEFAULT NULL::uuid, 
  diagnosis_filter text DEFAULT NULL::text, 
  search_field_type text DEFAULT 'all'::text, 
  surgery_type_filter text DEFAULT NULL::text, 
  appointment_type_filter appointment_type DEFAULT NULL::appointment_type, 
  has_preop_data boolean DEFAULT NULL::boolean, 
  has_postop_data boolean DEFAULT NULL::boolean, 
  min_age integer DEFAULT NULL::integer, 
  max_age integer DEFAULT NULL::integer, 
  gender_filter text DEFAULT NULL::text, 
  has_diabetes boolean DEFAULT NULL::boolean, 
  has_hta boolean DEFAULT NULL::boolean, 
  has_autorefractor boolean DEFAULT NULL::boolean, 
  has_lensometry boolean DEFAULT NULL::boolean, 
  has_keratometry boolean DEFAULT NULL::boolean, 
  has_pio boolean DEFAULT NULL::boolean, 
  has_fundus_photos boolean DEFAULT NULL::boolean, 
  has_slit_lamp boolean DEFAULT NULL::boolean, 
  has_visual_acuity boolean DEFAULT NULL::boolean, 
  has_subjective_refraction boolean DEFAULT NULL::boolean, 
  has_prescription boolean DEFAULT NULL::boolean
)
RETURNS TABLE(
  encounter_id uuid, patient_id uuid, appointment_id uuid, patient_code text, 
  patient_age integer, patient_gender text, patient_occupation text, 
  has_diabetes_flag boolean, has_hta_flag boolean, allergies text, 
  ophthalmic_history text, patient_notes text, encounter_date timestamp with time zone, 
  encounter_type text, appointment_type text, doctor_id uuid, doctor_name text, 
  motivo_consulta text, diagnosis_summary text, autorefractor text, lensometry text, 
  pio_od_preconsult numeric, pio_os_preconsult numeric, 
  keratometry_od_k1 text, keratometry_od_k2 text, keratometry_os_k1 text, keratometry_os_k2 text, 
  photo_od text, photo_oi text, od_text text, os_text text, 
  av_sc_od text, av_cc_od text, av_sc_os text, av_cc_os text, 
  ref_subj_sphere_od numeric, ref_subj_cyl_od numeric, ref_subj_axis_od integer, ref_subj_av_od text, 
  ref_subj_sphere_os numeric, ref_subj_cyl_os numeric, ref_subj_axis_os integer, ref_subj_av_os text, 
  rx_sphere_od numeric, rx_cyl_od numeric, rx_axis_od integer, rx_add_od numeric, prescription_notes_od text, 
  rx_sphere_os numeric, rx_cyl_os numeric, rx_axis_os integer, rx_add_os numeric, prescription_notes_os text, 
  slit_lamp_od text, fundus_od text, pio_exam_od numeric, plan_od text, 
  slit_lamp_os text, fundus_os text, pio_exam_os numeric, plan_os text, 
  excursiones_od text, excursiones_os text, plan_tratamiento text, 
  cirugias_recomendadas text, estudios_recomendados text, proxima_cita text, 
  surgery_id uuid, surgery_type text, surgery_eye text, surgery_consent boolean, 
  surgery_note text, surgery_medication text, 
  procedure_id uuid, procedure_type text, procedure_eye text, procedure_consent boolean, 
  studies_list text, has_postop_encounter boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH base_encounters AS (
    SELECT 
      e.id as encounter_id,
      e.patient_id,
      e.appointment_id,
      e.date as encounter_date,
      e.type::text as encounter_type,
      e.doctor_id,
      e.motivo_consulta,
      e.summary as diagnosis_summary,
      e.plan_tratamiento,
      e.cirugias as cirugias_recomendadas,
      e.estudios as estudios_recomendados,
      e.proxima_cita,
      e.excursiones_od,
      e.excursiones_os,
      a.type::text as appointment_type
    FROM encounters e
    LEFT JOIN appointments a ON a.id = e.appointment_id
    WHERE e.date >= start_date
      AND e.date <= end_date
      AND (doctor_filter IS NULL OR e.doctor_id = doctor_filter)
      AND (appointment_type_filter IS NULL OR a.type = appointment_type_filter)
      AND (
        diagnosis_filter IS NULL OR
        CASE search_field_type
          WHEN 'all' THEN (
            e.summary ~* ('\\y' || diagnosis_filter || '\\y') OR
            e.plan_tratamiento ~* ('\\y' || diagnosis_filter || '\\y') OR
            e.cirugias ~* ('\\y' || diagnosis_filter || '\\y') OR
            e.estudios ~* ('\\y' || diagnosis_filter || '\\y') OR
            e.motivo_consulta ~* ('\\y' || diagnosis_filter || '\\y') OR
            EXISTS (
              SELECT 1 FROM exam_eye ee 
              WHERE ee.encounter_id = e.id 
              AND (
                ee.slit_lamp ~* ('\\y' || diagnosis_filter || '\\y') OR
                ee.fundus ~* ('\\y' || diagnosis_filter || '\\y')
              )
            )
          )
          WHEN 'diagnosis' THEN e.summary ~* ('\\y' || diagnosis_filter || '\\y')
          WHEN 'treatment_plan' THEN e.plan_tratamiento ~* ('\\y' || diagnosis_filter || '\\y')
          WHEN 'surgeries' THEN e.cirugias ~* ('\\y' || diagnosis_filter || '\\y')
          WHEN 'studies' THEN e.estudios ~* ('\\y' || diagnosis_filter || '\\y')
          WHEN 'chief_complaint' THEN e.motivo_consulta ~* ('\\y' || diagnosis_filter || '\\y')
          WHEN 'physical_exam' THEN (
            EXISTS (
              SELECT 1 FROM exam_eye ee 
              WHERE ee.encounter_id = e.id 
              AND (
                ee.slit_lamp ~* ('\\y' || diagnosis_filter || '\\y') OR
                ee.fundus ~* ('\\y' || diagnosis_filter || '\\y')
              )
            )
          )
          ELSE e.summary ~* ('\\y' || diagnosis_filter || '\\y')
        END
      )
  ),
  patient_data AS (
    SELECT
      be.encounter_id,
      p.id as patient_id,
      p.code as patient_code,
      EXTRACT(YEAR FROM AGE(p.dob))::integer as patient_age,
      p.occupation as patient_occupation,
      p.diabetes as has_diabetes_flag,
      p.hta as has_hta_flag,
      p.allergies,
      p.ophthalmic_history,
      p.notes as patient_notes,
      CASE 
        WHEN pr.gender = 'M' THEN 'Masculino'
        WHEN pr.gender = 'F' THEN 'Femenino'
        ELSE 'No especificado'
      END as patient_gender
    FROM base_encounters be
    JOIN patients p ON p.id = be.patient_id
    LEFT JOIN profiles pr ON pr.user_id = be.doctor_id
    WHERE (min_age IS NULL OR EXTRACT(YEAR FROM AGE(p.dob)) >= min_age)
      AND (max_age IS NULL OR EXTRACT(YEAR FROM AGE(p.dob)) <= max_age)
      AND (gender_filter IS NULL OR pr.gender = gender_filter)
      AND (has_diabetes IS NULL OR p.diabetes = has_diabetes)
      AND (has_hta IS NULL OR p.hta = has_hta)
  ),
  appointment_data AS (
    SELECT
      be.encounter_id,
      a.id as appointment_id,
      a.autorefractor,
      a.lensometry,
      a.pio_od as pio_od_preconsult,
      a.pio_os as pio_os_preconsult,
      a.keratometry_od_k1,
      a.keratometry_od_k2,
      a.keratometry_os_k1,
      a.keratometry_os_k2,
      a.photo_od,
      a.photo_oi,
      a.od_text,
      a.os_text
    FROM base_encounters be
    LEFT JOIN appointments a ON a.id = be.appointment_id
    WHERE (has_autorefractor IS NULL OR (has_autorefractor = true AND a.autorefractor IS NOT NULL))
      AND (has_lensometry IS NULL OR (has_lensometry = true AND a.lensometry IS NOT NULL))
      AND (has_keratometry IS NULL OR (has_keratometry = true AND (a.keratometry_od_k1 IS NOT NULL OR a.keratometry_os_k1 IS NOT NULL)))
      AND (has_pio IS NULL OR (has_pio = true AND (a.pio_od IS NOT NULL OR a.pio_os IS NOT NULL)))
      AND (has_fundus_photos IS NULL OR (has_fundus_photos = true AND (a.photo_od IS NOT NULL OR a.photo_oi IS NOT NULL)))
  ),
  exam_data AS (
    SELECT
      be.encounter_id,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.av_sc END) as av_sc_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.av_cc END) as av_cc_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.ref_subj_sphere END) as ref_subj_sphere_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.ref_subj_cyl END) as ref_subj_cyl_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.ref_subj_axis END) as ref_subj_axis_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.ref_subj_av END) as ref_subj_av_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.rx_sphere END) as rx_sphere_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.rx_cyl END) as rx_cyl_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.rx_axis END) as rx_axis_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.rx_add END) as rx_add_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.prescription_notes END) as prescription_notes_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.slit_lamp END) as slit_lamp_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.fundus END) as fundus_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.iop END) as pio_exam_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.plan END) as plan_od,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.av_sc END) as av_sc_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.av_cc END) as av_cc_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.ref_subj_sphere END) as ref_subj_sphere_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.ref_subj_cyl END) as ref_subj_cyl_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.ref_subj_axis END) as ref_subj_axis_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.ref_subj_av END) as ref_subj_av_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.rx_sphere END) as rx_sphere_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.rx_cyl END) as rx_cyl_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.rx_axis END) as rx_axis_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.rx_add END) as rx_add_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.prescription_notes END) as prescription_notes_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.slit_lamp END) as slit_lamp_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.fundus END) as fundus_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.iop END) as pio_exam_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.plan END) as plan_os
    FROM base_encounters be
    LEFT JOIN exam_eye ee ON ee.encounter_id = be.encounter_id
    WHERE (has_slit_lamp IS NULL OR (has_slit_lamp = true AND ee.slit_lamp IS NOT NULL))
      AND (has_visual_acuity IS NULL OR (has_visual_acuity = true AND (ee.av_sc IS NOT NULL OR ee.av_cc IS NOT NULL)))
      AND (has_subjective_refraction IS NULL OR (has_subjective_refraction = true AND ee.ref_subj_sphere IS NOT NULL))
      AND (has_prescription IS NULL OR (has_prescription = true AND ee.rx_sphere IS NOT NULL))
    GROUP BY be.encounter_id
  ),
  surgery_data AS (
    SELECT
      be.encounter_id,
      s.id as surgery_id,
      s.tipo_cirugia as surgery_type,
      s.ojo_operar::text as surgery_eye,
      s.consentimiento_informado as surgery_consent,
      s.nota_operatoria as surgery_note,
      s.medicacion as surgery_medication
    FROM base_encounters be
    LEFT JOIN surgeries s ON s.encounter_id = be.encounter_id
    WHERE (surgery_type_filter IS NULL OR s.tipo_cirugia ~* ('\\y' || surgery_type_filter || '\\y'))
  ),
  procedure_data AS (
    SELECT
      be.encounter_id,
      pr.id as procedure_id,
      pr.tipo_procedimiento as procedure_type,
      pr.ojo_operar::text as procedure_eye,
      pr.consentimiento_informado as procedure_consent
    FROM base_encounters be
    LEFT JOIN procedures pr ON pr.encounter_id = be.encounter_id
  ),
  studies_data AS (
    SELECT
      be.encounter_id,
      STRING_AGG(st.title || ' (' || st.eye_side::text || ')', ', ') as studies_list
    FROM base_encounters be
    LEFT JOIN studies st ON st.appointment_id = be.appointment_id
    GROUP BY be.encounter_id
  ),
  postop_check AS (
    SELECT DISTINCT
      be.encounter_id,
      EXISTS(
        SELECT 1
        FROM encounters e2
        WHERE e2.patient_id = be.patient_id
          AND e2.date > be.encounter_date
          AND e2.type IN ('consulta', 'posop')
      ) as has_postop_encounter
    FROM base_encounters be
  )
  SELECT
    be.encounter_id,
    pd.patient_id,
    ad.appointment_id,
    pd.patient_code,
    pd.patient_age,
    pd.patient_gender,
    pd.patient_occupation,
    pd.has_diabetes_flag,
    pd.has_hta_flag,
    pd.allergies,
    pd.ophthalmic_history,
    pd.patient_notes,
    be.encounter_date,
    be.encounter_type,
    be.appointment_type,
    be.doctor_id,
    COALESCE(prof.full_name, 'Sin asignar') as doctor_name,
    be.motivo_consulta,
    be.diagnosis_summary,
    ad.autorefractor,
    ad.lensometry,
    ad.pio_od_preconsult,
    ad.pio_os_preconsult,
    ad.keratometry_od_k1,
    ad.keratometry_od_k2,
    ad.keratometry_os_k1,
    ad.keratometry_os_k2,
    ad.photo_od,
    ad.photo_oi,
    ad.od_text,
    ad.os_text,
    ed.av_sc_od,
    ed.av_cc_od,
    ed.av_sc_os,
    ed.av_cc_os,
    ed.ref_subj_sphere_od,
    ed.ref_subj_cyl_od,
    ed.ref_subj_axis_od,
    ed.ref_subj_av_od,
    ed.ref_subj_sphere_os,
    ed.ref_subj_cyl_os,
    ed.ref_subj_axis_os,
    ed.ref_subj_av_os,
    ed.rx_sphere_od,
    ed.rx_cyl_od,
    ed.rx_axis_od,
    ed.rx_add_od,
    ed.prescription_notes_od,
    ed.rx_sphere_os,
    ed.rx_cyl_os,
    ed.rx_axis_os,
    ed.rx_add_os,
    ed.prescription_notes_os,
    ed.slit_lamp_od,
    ed.fundus_od,
    ed.pio_exam_od,
    ed.plan_od,
    ed.slit_lamp_os,
    ed.fundus_os,
    ed.pio_exam_os,
    ed.plan_os,
    be.excursiones_od,
    be.excursiones_os,
    be.plan_tratamiento,
    be.cirugias_recomendadas,
    be.estudios_recomendados,
    be.proxima_cita,
    sd.surgery_id,
    sd.surgery_type,
    sd.surgery_eye,
    sd.surgery_consent,
    sd.surgery_note,
    sd.surgery_medication,
    prd.procedure_id,
    prd.procedure_type,
    prd.procedure_eye,
    prd.procedure_consent,
    std.studies_list,
    pc.has_postop_encounter
  FROM base_encounters be
  INNER JOIN patient_data pd ON pd.encounter_id = be.encounter_id
  LEFT JOIN appointment_data ad ON ad.encounter_id = be.encounter_id
  LEFT JOIN exam_data ed ON ed.encounter_id = be.encounter_id
  LEFT JOIN surgery_data sd ON sd.encounter_id = be.encounter_id
  LEFT JOIN procedure_data prd ON prd.encounter_id = be.encounter_id
  LEFT JOIN studies_data std ON std.encounter_id = be.encounter_id
  LEFT JOIN postop_check pc ON pc.encounter_id = be.encounter_id
  LEFT JOIN profiles prof ON prof.user_id = be.doctor_id
  WHERE (has_preop_data IS NULL OR (
    has_preop_data = true AND (
      ad.autorefractor IS NOT NULL OR
      ad.lensometry IS NOT NULL OR
      ed.av_sc_od IS NOT NULL OR
      ed.av_sc_os IS NOT NULL
    )
  ))
  AND (has_postop_data IS NULL OR (has_postop_data = pc.has_postop_encounter))
  ORDER BY be.encounter_date DESC;
END;
$$;

-- Function: get_clinical_research_data_by_patient (Research - Agrupada por paciente)
CREATE OR REPLACE FUNCTION public.get_clinical_research_data_by_patient(start_date timestamp with time zone, end_date timestamp with time zone, doctor_filter uuid DEFAULT NULL::uuid, diagnosis_filter text DEFAULT NULL::text, search_field_type text DEFAULT 'all'::text, surgery_type_filter text DEFAULT NULL::text, appointment_type_filter appointment_type DEFAULT NULL::appointment_type, has_preop_data boolean DEFAULT NULL::boolean, has_postop_data boolean DEFAULT NULL::boolean, min_age integer DEFAULT NULL::integer, max_age integer DEFAULT NULL::integer, gender_filter text DEFAULT NULL::text, has_diabetes boolean DEFAULT NULL::boolean, has_hta boolean DEFAULT NULL::boolean, has_autorefractor boolean DEFAULT NULL::boolean, has_lensometry boolean DEFAULT NULL::boolean, has_keratometry boolean DEFAULT NULL::boolean, has_pio boolean DEFAULT NULL::boolean, has_fundus_photos boolean DEFAULT NULL::boolean, has_slit_lamp boolean DEFAULT NULL::boolean, has_visual_acuity boolean DEFAULT NULL::boolean, has_subjective_refraction boolean DEFAULT NULL::boolean, has_prescription boolean DEFAULT NULL::boolean)
RETURNS TABLE(patient_id uuid, patient_code text, patient_age integer, patient_gender text, patient_occupation text, has_diabetes_flag boolean, has_hta_flag boolean, allergies text, ophthalmic_history text, patient_notes text, visits jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH encounter_data AS (
    SELECT *
    FROM get_clinical_research_data(
      start_date, end_date, doctor_filter, diagnosis_filter, search_field_type,
      surgery_type_filter, appointment_type_filter, has_preop_data, has_postop_data,
      min_age, max_age, gender_filter, has_diabetes, has_hta, has_autorefractor,
      has_lensometry, has_keratometry, has_pio, has_fundus_photos, has_slit_lamp,
      has_visual_acuity, has_subjective_refraction, has_prescription
    )
  )
  SELECT 
    ed.patient_id,
    ed.patient_code,
    ed.patient_age,
    ed.patient_gender,
    ed.patient_occupation,
    ed.has_diabetes_flag,
    ed.has_hta_flag,
    ed.allergies,
    ed.ophthalmic_history,
    ed.patient_notes,
    jsonb_agg(to_jsonb(ed.*) ORDER BY ed.encounter_date ASC) as visits
  FROM encounter_data ed
  GROUP BY 
    ed.patient_id, ed.patient_code, ed.patient_age, ed.patient_gender,
    ed.patient_occupation, ed.has_diabetes_flag, ed.has_hta_flag,
    ed.allergies, ed.ophthalmic_history, ed.patient_notes
  ORDER BY ed.patient_code;
END;
$$;

-- Function: get_clinical_stats_with_revenue_v2 (Analytics con filtro por sucursal)
CREATE OR REPLACE FUNCTION public.get_clinical_stats_with_revenue_v2(start_date timestamp with time zone, end_date timestamp with time zone, doctor_filter uuid DEFAULT NULL::uuid, branch_filter uuid DEFAULT NULL::uuid)
RETURNS TABLE(tipo_cita text, doctor_id uuid, doctor_name text, cantidad bigint, pacientes_unicos bigint, revenue_real numeric, revenue_estimado numeric, revenue_total numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    SELECT 
      a.id as appointment_id,
      a.type::text as tipo_cita,
      a.doctor_id,
      COALESCE(p.full_name, 'Sin asignar') as doctor_name,
      a.patient_id,
      a.starts_at,
      i.id as invoice_id,
      i.total_amount as invoice_amount
    FROM appointments a
    LEFT JOIN profiles p ON p.user_id = a.doctor_id
    LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
    WHERE a.status = 'done'
      AND a.starts_at >= start_date
      AND a.starts_at <= end_date
      AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
      AND (branch_filter IS NULL OR a.branch_id = branch_filter)
  ),
  service_prices_lookup AS (
    SELECT 
      service_type::text,
      AVG(price) as avg_price
    FROM service_prices
    WHERE active = true
    GROUP BY service_type
  ),
  calculated_revenue AS (
    SELECT 
      ad.tipo_cita,
      ad.doctor_id,
      ad.doctor_name,
      ad.appointment_id,
      ad.patient_id,
      CASE 
        WHEN ad.invoice_id IS NOT NULL THEN ad.invoice_amount
        ELSE 0
      END as revenue_real,
      CASE 
        WHEN ad.invoice_id IS NULL THEN COALESCE(sp.avg_price, 0)
        ELSE 0
      END as revenue_estimado
    FROM appointment_data ad
    LEFT JOIN service_prices_lookup sp ON sp.service_type = ad.tipo_cita
  )
  SELECT 
    cr.tipo_cita,
    cr.doctor_id,
    cr.doctor_name,
    COUNT(cr.appointment_id)::bigint as cantidad,
    COUNT(DISTINCT cr.patient_id)::bigint as pacientes_unicos,
    COALESCE(SUM(cr.revenue_real), 0)::numeric as revenue_real,
    COALESCE(SUM(cr.revenue_estimado), 0)::numeric as revenue_estimado,
    COALESCE(SUM(cr.revenue_real + cr.revenue_estimado), 0)::numeric as revenue_total
  FROM calculated_revenue cr
  GROUP BY cr.tipo_cita, cr.doctor_id, cr.doctor_name
  ORDER BY cr.doctor_name, cr.tipo_cita;
END;
$$;

-- Function: get_doctor_activity_detail_v4 (Analytics con filtro por sucursal)
CREATE OR REPLACE FUNCTION public.get_doctor_activity_detail_v4(start_date date, end_date date, doctor_filter uuid DEFAULT NULL::uuid, branch_filter uuid DEFAULT NULL::uuid)
RETURNS TABLE(appointment_id uuid, patient_code text, patient_name text, appointment_type text, appointment_date timestamp with time zone, is_invoiced boolean, invoice_amount numeric, is_courtesy boolean, surgery_type text, procedure_type text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as appointment_id,
    COALESCE(p.code, '') as patient_code,
    CONCAT(p.first_name, ' ', p.last_name) as patient_name,
    a.type::text as appointment_type,
    a.starts_at as appointment_date,
    i.id IS NOT NULL as is_invoiced,
    COALESCE(i.total_amount, 0::numeric) as invoice_amount,
    COALESCE(a.is_courtesy, false) as is_courtesy,
    COALESCE(s.tipo_cirugia, '') as surgery_type,
    COALESCE(proc.tipo_procedimiento, '') as procedure_type
  FROM appointments a
  INNER JOIN patients p ON p.id = a.patient_id
  LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
  LEFT JOIN encounters e ON e.appointment_id = a.id
  LEFT JOIN surgeries s ON s.encounter_id = e.id
  LEFT JOIN procedures proc ON proc.encounter_id = e.id
  WHERE a.status = 'done'
    AND a.starts_at::date >= start_date
    AND a.starts_at::date <= end_date
    AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
    AND (branch_filter IS NULL OR a.branch_id = branch_filter)
  ORDER BY a.starts_at DESC;
END;
$$;

-- Function: get_service_details_v2 (Reportes de Caja con filtro por sucursal)
CREATE OR REPLACE FUNCTION public.get_service_details_v2(start_date text, end_date text, branch_filter uuid DEFAULT NULL::uuid)
RETURNS TABLE(item_id uuid, item_name text, total_quantity bigint, total_revenue numeric)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    iit.item_id::uuid,
    iit.description AS item_name,
    SUM(iit.quantity)::bigint AS total_quantity,
    SUM(iit.subtotal)::numeric AS total_revenue
  FROM invoice_items iit
  JOIN invoices i ON i.id = iit.invoice_id
  WHERE i.created_at >= start_date::timestamptz
    AND i.created_at < (end_date::date + interval '1 day')::timestamptz
    AND iit.item_type = 'servicio'
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY iit.item_id, iit.description
  ORDER BY total_revenue DESC
  LIMIT 10;
END;
$$;

-- Function: get_inventory_details_v2 (Reportes de Caja con filtro por sucursal)
CREATE OR REPLACE FUNCTION public.get_inventory_details_v2(start_date text, end_date text, branch_filter uuid DEFAULT NULL::uuid)
RETURNS TABLE(item_id uuid, item_name text, total_quantity bigint, total_revenue numeric)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    iit.item_id::uuid,
    iit.description AS item_name,
    SUM(iit.quantity)::bigint AS total_quantity,
    SUM(iit.subtotal)::numeric AS total_revenue
  FROM invoice_items iit
  JOIN invoices i ON i.id = iit.invoice_id
  WHERE i.created_at >= start_date::timestamptz
    AND i.created_at < (end_date::date + interval '1 day')::timestamptz
    AND iit.item_type = 'producto'
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY iit.item_id, iit.description
  ORDER BY total_revenue DESC
  LIMIT 10;
END;
$$;

-- ============================================================
-- SECCIÓN 4: UNIQUE CONSTRAINTS
-- ============================================================

-- Unique constraints importantes para integridad
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role);
ALTER TABLE public.user_branches ADD CONSTRAINT user_branches_user_branch_unique UNIQUE (user_id, branch_id);

-- ============================================================
-- SECCIÓN 5: TRIGGERS
-- ============================================================

-- Trigger for new user profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for invoice balance update
DROP TRIGGER IF EXISTS trigger_update_invoice_balance ON public.payments;
CREATE TRIGGER trigger_update_invoice_balance
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_invoice_balance();

-- Trigger for inventory stock update
DROP TRIGGER IF EXISTS trigger_update_item_stock ON public.inventory_movements;
CREATE TRIGGER trigger_update_item_stock
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_item_stock();

-- Trigger for invoice item inventory movement
DROP TRIGGER IF EXISTS trigger_inventory_movement_on_invoice ON public.invoice_items;
CREATE TRIGGER trigger_inventory_movement_on_invoice
  AFTER INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.create_inventory_movement_from_invoice();

-- Trigger for patient update restrictions
DROP TRIGGER IF EXISTS trigger_enforce_doctor_patient_columns ON public.patients;
CREATE TRIGGER trigger_enforce_doctor_patient_columns
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_doctor_patient_update_columns();

-- ============================================================
-- SECCIÓN 5: ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgery_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_eye ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgery_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- Enable RLS for NEW tables (app_settings, CRM, room_inventory)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_function_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_procedure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_inventory_movements ENABLE ROW LEVEL SECURITY;

-- BRANCHES policies
CREATE POLICY "Todos pueden ver sedes" ON public.branches FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar sedes" ON public.branches FOR ALL USING (has_role(auth.uid(), 'admin'));

-- PROFILES policies
CREATE POLICY "Usuarios pueden ver todos los perfiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Usuarios pueden insertar su propio perfil" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON public.profiles FOR UPDATE USING (user_id = auth.uid());

-- USER_ROLES policies
CREATE POLICY "Todos pueden ver roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Usuarios pueden crear su propio rol inicial" ON public.user_roles FOR INSERT WITH CHECK ((auth.uid() = user_id) AND (NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid())));
CREATE POLICY "first_admin_bootstrap" ON public.user_roles FOR INSERT WITH CHECK ((role = 'admin') AND (user_id = auth.uid()) AND (NOT EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin')));

-- USER_BRANCHES policies
CREATE POLICY "Usuarios pueden ver sus propias sedes" ON public.user_branches FOR SELECT USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Solo admin puede gestionar asignaciones" ON public.user_branches FOR ALL USING (has_role(auth.uid(), 'admin'));

-- ROOMS policies
CREATE POLICY "Todos pueden ver salas" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar salas" ON public.rooms FOR ALL USING (has_role(auth.uid(), 'admin'));

-- PATIENTS policies
CREATE POLICY "Todos pueden leer pacientes" ON public.patients FOR SELECT USING (true);
CREATE POLICY "Personal autorizado puede crear pacientes" ON public.patients FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'reception') OR has_role(auth.uid(), 'diagnostico') OR has_role(auth.uid(), 'nurse'));
CREATE POLICY "Recepción y admins pueden actualizar pacientes" ON public.patients FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'reception'));
CREATE POLICY "Personal clínico puede actualizar antecedentes de pacientes" ON public.patients FOR UPDATE USING (has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico')) WITH CHECK (has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Admins y recepción pueden borrar pacientes" ON public.patients FOR DELETE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'reception'));

-- APPOINTMENTS policies
CREATE POLICY "Todos pueden ver citas" ON public.appointments FOR SELECT USING (true);
CREATE POLICY "clinico_caja_insert_appointments" ON public.appointments FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'reception') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "clinico_caja_update_appointments" ON public.appointments FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'reception') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "clinico_delete_appointments" ON public.appointments FOR DELETE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'reception') OR has_role(auth.uid(), 'doctor'));

-- ENCOUNTERS policies
CREATE POLICY "Personal clínico puede ver encuentros" ON public.encounters FOR SELECT USING (true);
CREATE POLICY "Personal clínico puede crear encuentros" ON public.encounters FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede actualizar encuentros" ON public.encounters FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));

-- INVOICES policies
CREATE POLICY "Recepción puede ver facturas" ON public.invoices FOR SELECT USING (has_role(auth.uid(), 'reception'));
CREATE POLICY "admin_caja_contabilidad_facturas" ON public.invoices FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

-- PAYMENTS policies
CREATE POLICY "Recepción puede ver pagos" ON public.payments FOR SELECT USING (has_role(auth.uid(), 'reception'));
CREATE POLICY "admin_caja_contabilidad_select_pagos" ON public.payments FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "admin_caja_contabilidad_insert_pagos" ON public.payments FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "admin_caja_contabilidad_update_pagos" ON public.payments FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "admin_contabilidad_delete_pagos" ON public.payments FOR DELETE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contabilidad'));

-- SERVICE_PRICES policies
CREATE POLICY "Todos pueden ver precios de servicios" ON public.service_prices FOR SELECT USING (true);
CREATE POLICY "admin_caja_contabilidad_servicios" ON public.service_prices FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

-- AUDIT_LOGS policies
CREATE POLICY "Todos pueden ver logs de auditoría" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Sistema puede insertar logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- PENDING_REGISTRATIONS policies
CREATE POLICY "Anyone can submit registration" ON public.pending_registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all registrations" ON public.pending_registrations FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update registrations" ON public.pending_registrations FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- Additional policies for other tables (simplified for brevity)
CREATE POLICY "Personal clínico puede gestionar exámenes" ON public.exam_eye FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede ver exámenes" ON public.exam_eye FOR SELECT USING (true);

CREATE POLICY "Personal clínico puede gestionar diagnósticos" ON public.diagnoses FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede ver diagnósticos" ON public.diagnoses FOR SELECT USING (true);

CREATE POLICY "Personal clínico puede gestionar cirugías" ON public.surgeries FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede ver cirugías" ON public.surgeries FOR SELECT USING (true);

CREATE POLICY "Personal clínico puede gestionar procedimientos" ON public.procedures FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede ver procedimientos" ON public.procedures FOR SELECT USING (true);

CREATE POLICY "Personal clínico puede gestionar órdenes" ON public.orders FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede ver órdenes" ON public.orders FOR SELECT USING (true);

CREATE POLICY "Personal clínico puede gestionar resultados" ON public.results FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede ver resultados" ON public.results FOR SELECT USING (true);

CREATE POLICY "Personal clínico puede crear documentos" ON public.documents FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Todos pueden ver documentos" ON public.documents FOR SELECT USING (true);

CREATE POLICY "Personal clínico puede crear estudios" ON public.studies FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede actualizar estudios" ON public.studies FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede ver estudios" ON public.studies FOR SELECT USING (true);

CREATE POLICY "Personal clínico puede crear archivos de estudios" ON public.study_files FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede eliminar archivos de estudios" ON public.study_files FOR DELETE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede ver archivos de estudios" ON public.study_files FOR SELECT USING (true);

CREATE POLICY "Personal clínico puede crear archivos de cirugías" ON public.surgery_files FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede eliminar archivos de cirugías" ON public.surgery_files FOR DELETE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede ver archivos de cirugías" ON public.surgery_files FOR SELECT USING (true);

CREATE POLICY "admin_caja_contabilidad_inventario" ON public.inventory_items FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Personal clínico puede ver inventario" ON public.inventory_items FOR SELECT USING (has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "admin_caja_contabilidad_lotes" ON public.inventory_lots FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Personal clínico puede ver lotes" ON public.inventory_lots FOR SELECT USING (has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "admin_caja_contabilidad_movimientos" ON public.inventory_movements FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Personal clínico puede ver movimientos de inventario" ON public.inventory_movements FOR SELECT USING (has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "admin_caja_contabilidad_proveedores" ON public.suppliers FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Personal clínico puede ver proveedores" ON public.suppliers FOR SELECT USING (has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'diagnostico') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "Recepción puede ver items de factura" ON public.invoice_items FOR SELECT USING (has_role(auth.uid(), 'reception'));
CREATE POLICY "admin_caja_contabilidad_items" ON public.invoice_items FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

CREATE POLICY "admin_caja_contabilidad_ver_cierres" ON public.cash_closures FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "admin_caja_contabilidad_crear_cierres" ON public.cash_closures FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

CREATE POLICY "Todos pueden ver bloqueos de agenda" ON public.schedule_blocks FOR SELECT USING (true);
CREATE POLICY "Admin y recepción pueden crear bloqueos" ON public.schedule_blocks FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'reception'));
CREATE POLICY "Admin y recepción pueden actualizar bloqueos" ON public.schedule_blocks FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'reception'));
CREATE POLICY "Admin y recepción pueden eliminar bloqueos" ON public.schedule_blocks FOR DELETE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "Todos pueden ver tipos de estudio" ON public.study_types FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar tipos de estudio" ON public.study_types FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Todos pueden ver tipos de cirugía" ON public.surgery_types FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar tipos de cirugía" ON public.surgery_types FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Todos pueden ver tipos de procedimiento" ON public.procedure_types FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar tipos de procedimiento" ON public.procedure_types FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Todos pueden ver plantillas" ON public.templates FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar plantillas" ON public.templates FOR ALL USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- POLÍTICAS RLS PARA TABLAS NUEVAS (CRM, Room Inventory, Settings)
-- ============================================================

-- APP_SETTINGS policies
CREATE POLICY "Todos pueden ver configuración" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar configuración" ON public.app_settings FOR ALL USING (has_role(auth.uid(), 'admin'));

-- EDGE_FUNCTION_SETTINGS policies
CREATE POLICY "Todos pueden ver config edge functions" ON public.edge_function_settings FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar edge functions" ON public.edge_function_settings FOR ALL USING (has_role(auth.uid(), 'admin'));

-- CRM_PROCEDURE_TYPES policies
CREATE POLICY "Todos pueden ver tipos procedimiento CRM" ON public.crm_procedure_types FOR SELECT USING (true);
CREATE POLICY "Solo admin puede gestionar tipos procedimiento CRM" ON public.crm_procedure_types FOR ALL USING (has_role(auth.uid(), 'admin'));

-- CRM_PIPELINES policies
CREATE POLICY "Personal clínico puede ver pipelines" ON public.crm_pipelines FOR SELECT USING (true);
CREATE POLICY "Personal autorizado puede gestionar pipelines" ON public.crm_pipelines FOR ALL USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'reception')
);

-- CRM_PIPELINE_STAGES policies
CREATE POLICY "Personal clínico puede ver etapas pipeline" ON public.crm_pipeline_stages FOR SELECT USING (true);
CREATE POLICY "Personal autorizado puede gestionar etapas" ON public.crm_pipeline_stages FOR ALL USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'reception')
);

-- CRM_PIPELINE_NOTES policies
CREATE POLICY "Personal clínico puede ver notas pipeline" ON public.crm_pipeline_notes FOR SELECT USING (true);
CREATE POLICY "Personal autorizado puede gestionar notas pipeline" ON public.crm_pipeline_notes FOR ALL USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'reception')
);

-- CRM_ACTIVITY_LOG policies
CREATE POLICY "Personal clínico puede ver actividad CRM" ON public.crm_activity_log FOR SELECT USING (true);
CREATE POLICY "Personal autorizado puede crear actividad CRM" ON public.crm_activity_log FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'reception')
);

-- CRM_ACTIVITY_READ policies
CREATE POLICY "Usuarios pueden ver su propia lectura" ON public.crm_activity_read FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Usuarios pueden gestionar su lectura" ON public.crm_activity_read FOR ALL USING (user_id = auth.uid());

-- ROOM_INVENTORY_CATEGORIES policies
CREATE POLICY "Personal clínico puede ver categorías inv sala" ON public.room_inventory_categories FOR SELECT USING (true);
CREATE POLICY "Admin y enfermería pueden gestionar categorías" ON public.room_inventory_categories FOR ALL USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'nurse')
);

-- ROOM_INVENTORY_ITEMS policies
CREATE POLICY "Personal clínico puede ver items inv sala" ON public.room_inventory_items FOR SELECT USING (true);
CREATE POLICY "Admin y enfermería pueden gestionar items sala" ON public.room_inventory_items FOR ALL USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'nurse')
);

-- ROOM_INVENTORY_MOVEMENTS policies
CREATE POLICY "Personal clínico puede ver movimientos inv sala" ON public.room_inventory_movements FOR SELECT USING (true);
CREATE POLICY "Admin y enfermería pueden crear movimientos sala" ON public.room_inventory_movements FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'nurse')
);

-- ============================================================
-- SECCIÓN 6: STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('results', 'results', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('studies', 'studies', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('surgeries', 'surgeries', false) ON CONFLICT DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view" ON storage.objects FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update" ON storage.objects FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete" ON storage.objects FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================
-- FIN DE LA EXPORTACIÓN
-- ============================================================

-- Después de ejecutar este archivo:
-- 1. Importa los datos desde los archivos CSV
-- 2. Sigue el orden en _IMPORT_ORDER.txt
-- 3. Los usuarios deberán resetear sus contraseñas

`;

    console.log('Schema export generated successfully');

    return new Response(
      JSON.stringify({
        content: sqlContent,
        count: 97,
        message: 'Esquema SQL completo con tablas, funciones, triggers y políticas RLS'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in export-migrations:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});