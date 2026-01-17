-- Tabla de tipos de procedimiento para CRM
CREATE TABLE public.crm_procedure_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  default_stages JSONB NOT NULL DEFAULT '["info", "anticipo", "pedido", "en_camino", "cirugia"]'::jsonb,
  display_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla principal de pipelines CRM
CREATE TABLE public.crm_pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  procedure_type_id UUID NOT NULL REFERENCES public.crm_procedure_types(id) ON DELETE RESTRICT,
  doctor_id UUID REFERENCES public.profiles(user_id),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  current_stage TEXT NOT NULL DEFAULT 'info',
  eye_side public.eye_side NOT NULL DEFAULT 'OU',
  status TEXT NOT NULL DEFAULT 'activo',
  priority TEXT NOT NULL DEFAULT 'normal',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla de historial de etapas del pipeline
CREATE TABLE public.crm_pipeline_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  amount NUMERIC,
  stage_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla de notas del pipeline
CREATE TABLE public.crm_pipeline_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS en todas las tablas
ALTER TABLE public.crm_procedure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_notes ENABLE ROW LEVEL SECURITY;

-- Políticas para crm_procedure_types
CREATE POLICY "Todos pueden ver tipos de procedimiento CRM"
  ON public.crm_procedure_types FOR SELECT
  USING (true);

CREATE POLICY "Solo admin puede gestionar tipos de procedimiento CRM"
  ON public.crm_procedure_types FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Políticas para crm_pipelines
CREATE POLICY "Admin puede ver todos los pipelines"
  ON public.crm_pipelines FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin puede gestionar pipelines"
  ON public.crm_pipelines FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Políticas para crm_pipeline_stages
CREATE POLICY "Admin puede ver etapas de pipeline"
  ON public.crm_pipeline_stages FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin puede gestionar etapas de pipeline"
  ON public.crm_pipeline_stages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Políticas para crm_pipeline_notes
CREATE POLICY "Admin puede ver notas de pipeline"
  ON public.crm_pipeline_notes FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin puede gestionar notas de pipeline"
  ON public.crm_pipeline_notes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger para actualizar updated_at en pipelines
CREATE TRIGGER update_crm_pipelines_updated_at
  BEFORE UPDATE ON public.crm_pipelines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insertar los 9 tipos de procedimiento
INSERT INTO public.crm_procedure_types (name, color, display_order) VALUES
  ('ICL', 'blue', 1),
  ('Anillos', 'amber', 2),
  ('Lente Tórico', 'indigo', 3),
  ('Lente Multifocal', 'pink', 4),
  ('CLEAR', 'purple', 5),
  ('TransPRK', 'green', 6),
  ('FemtoLasik', 'cyan', 7),
  ('Catarata', 'teal', 8),
  ('Lente Escleral', 'orange', 9);