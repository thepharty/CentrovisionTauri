-- Crear enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'doctor', 'nurse', 'reception');

-- Crear enum para tipo de sala
CREATE TYPE public.room_kind AS ENUM ('consultorio', 'diagnostico', 'quirofano');

-- Crear enum para tipo de cita
CREATE TYPE public.appointment_type AS ENUM ('consulta', 'diagnostico', 'cirugia', 'control');

-- Crear enum para estado de cita
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'checked_in', 'done', 'cancelled', 'no_show');

-- Crear enum para tipo de encuentro
CREATE TYPE public.encounter_type AS ENUM ('consulta', 'posop', 'urgencia', 'quirurgico');

-- Crear enum para lado del ojo
CREATE TYPE public.eye_side AS ENUM ('OD', 'OI', 'OU');

-- Crear enum para tipo de orden
CREATE TYPE public.order_kind AS ENUM ('topografia', 'OCT', 'campovisual', 'biometria', 'otro');

-- Crear enum para prioridad de orden
CREATE TYPE public.order_priority AS ENUM ('normal', 'alta', 'urgente');

-- Crear enum para estado de orden
CREATE TYPE public.order_status AS ENUM ('ordered', 'done', 'reported', 'cancelled');

-- Crear enum para tipo de documento
CREATE TYPE public.document_kind AS ENUM ('receta', 'receta_lentes', 'orden_estudio');

-- 1. Tabla de pacientes
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de perfiles de usuario
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de roles de usuario
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- 4. Tabla de salas
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind room_kind NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabla de citas
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  type appointment_type NOT NULL DEFAULT 'consulta',
  status appointment_status NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabla de encuentros clínicos
CREATE TABLE public.encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  date TIMESTAMPTZ DEFAULT now(),
  type encounter_type NOT NULL DEFAULT 'consulta',
  doctor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Tabla de exámenes por ojo
CREATE TABLE public.exam_eye (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE CASCADE NOT NULL,
  side eye_side NOT NULL,
  av_sc TEXT,
  av_cc TEXT,
  ref_sphere NUMERIC(5,2),
  ref_cyl NUMERIC(5,2),
  ref_axis INTEGER CHECK (ref_axis >= 0 AND ref_axis <= 180),
  iop NUMERIC(5,2),
  slit_lamp TEXT,
  fundus TEXT,
  plan TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(encounter_id, side)
);

-- 8. Tabla de diagnósticos
CREATE TABLE public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE CASCADE NOT NULL,
  code TEXT,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Tabla de órdenes
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE CASCADE NOT NULL,
  kind order_kind NOT NULL,
  priority order_priority NOT NULL DEFAULT 'normal',
  side eye_side DEFAULT 'OU',
  status order_status NOT NULL DEFAULT 'ordered',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Tabla de resultados
CREATE TABLE public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  side eye_side DEFAULT 'OU',
  extracted_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Tabla de documentos
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE CASCADE NOT NULL,
  kind document_kind NOT NULL,
  file_path TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Tabla de plantillas
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind document_kind NOT NULL,
  name TEXT NOT NULL,
  body JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 13. Tabla de auditoría
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Crear buckets de Storage
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('documents', 'documents', false),
  ('results', 'results', false);

-- RLS: Habilitar Row Level Security
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_eye ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Función para verificar rol
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
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
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS Policies para patients
CREATE POLICY "Todos pueden leer pacientes"
  ON public.patients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Recepción y admins pueden crear pacientes"
  ON public.patients FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'reception')
  );

CREATE POLICY "Recepción y admins pueden actualizar pacientes"
  ON public.patients FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'reception')
  );

-- RLS Policies para profiles
CREATE POLICY "Usuarios pueden ver todos los perfiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios pueden actualizar su propio perfil"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Usuarios pueden insertar su propio perfil"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- RLS Policies para user_roles
CREATE POLICY "Todos pueden ver roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Solo admin puede gestionar roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies para rooms
CREATE POLICY "Todos pueden ver salas"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Solo admin puede gestionar salas"
  ON public.rooms FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies para appointments
CREATE POLICY "Todos pueden ver citas"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Recepción puede gestionar citas"
  ON public.appointments FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'reception') OR
    public.has_role(auth.uid(), 'doctor')
  );

-- RLS Policies para encounters
CREATE POLICY "Personal clínico puede ver encuentros"
  ON public.encounters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Médicos y enfermería pueden crear encuentros"
  ON public.encounters FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'doctor') OR
    public.has_role(auth.uid(), 'nurse')
  );

CREATE POLICY "Médicos pueden actualizar encuentros"
  ON public.encounters FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'doctor')
  );

-- RLS Policies para exam_eye
CREATE POLICY "Personal clínico puede ver exámenes"
  ON public.exam_eye FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Médicos pueden gestionar exámenes"
  ON public.exam_eye FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'doctor')
  );

-- RLS Policies para diagnoses
CREATE POLICY "Personal clínico puede ver diagnósticos"
  ON public.diagnoses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Médicos pueden gestionar diagnósticos"
  ON public.diagnoses FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'doctor')
  );

-- RLS Policies para orders
CREATE POLICY "Personal clínico puede ver órdenes"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Médicos y enfermería pueden gestionar órdenes"
  ON public.orders FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'doctor') OR
    public.has_role(auth.uid(), 'nurse')
  );

-- RLS Policies para results
CREATE POLICY "Personal clínico puede ver resultados"
  ON public.results FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enfermería y médicos pueden gestionar resultados"
  ON public.results FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'doctor') OR
    public.has_role(auth.uid(), 'nurse')
  );

-- RLS Policies para documents
CREATE POLICY "Todos pueden ver documentos"
  ON public.documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Médicos pueden crear documentos"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'doctor')
  );

-- RLS Policies para templates
CREATE POLICY "Todos pueden ver plantillas"
  ON public.templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Solo admin puede gestionar plantillas"
  ON public.templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies para audit_logs
CREATE POLICY "Todos pueden ver logs de auditoría"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Sistema puede insertar logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Storage policies para documents
CREATE POLICY "Usuarios autenticados pueden ver documentos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "Médicos pueden subir documentos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor'))
  );

-- Storage policies para results
CREATE POLICY "Personal clínico puede ver resultados"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'results');

CREATE POLICY "Personal clínico puede subir resultados"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'results' AND
    (public.has_role(auth.uid(), 'admin') OR 
     public.has_role(auth.uid(), 'doctor') OR 
     public.has_role(auth.uid(), 'nurse'))
  );

-- Trigger para crear perfil automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_encounters_updated_at
  BEFORE UPDATE ON public.encounters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exam_eye_updated_at
  BEFORE UPDATE ON public.exam_eye
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insertar salas demo
INSERT INTO public.rooms (name, kind) VALUES
  ('Consultorio 1', 'consultorio'),
  ('Consultorio 2', 'consultorio'),
  ('Sala OCT', 'diagnostico'),
  ('Quirófano 1', 'quirofano');

-- Insertar plantillas base
INSERT INTO public.templates (kind, name, body) VALUES
  ('receta', 'Receta Médica Estándar', '{"header": "RECETA MÉDICA", "fields": ["medications"]}'::jsonb),
  ('receta_lentes', 'Receta de Lentes Estándar', '{"header": "RECETA DE LENTES", "fields": ["rx_od", "rx_oi", "add", "dnp"]}'::jsonb),
  ('orden_estudio', 'Orden de Estudio Estándar', '{"header": "ORDEN DE ESTUDIO", "fields": ["studies", "priority", "instructions"]}'::jsonb);