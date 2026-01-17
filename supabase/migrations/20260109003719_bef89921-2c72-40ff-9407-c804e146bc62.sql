-- Create CRM activity log table
CREATE TABLE public.crm_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  activity_type text NOT NULL, -- 'pipeline_created', 'stage_changed', 'pipeline_completed', 'pipeline_cancelled'
  from_stage text,
  to_stage text,
  created_by uuid,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create CRM activity read tracking table
CREATE TABLE public.crm_activity_read (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.crm_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity_read ENABLE ROW LEVEL SECURITY;

-- RLS policies for crm_activity_log
CREATE POLICY "Admin puede ver actividad CRM"
ON public.crm_activity_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sistema puede insertar actividad"
ON public.crm_activity_log
FOR INSERT
WITH CHECK (true);

-- RLS policies for crm_activity_read
CREATE POLICY "Usuarios pueden ver su propio registro de lectura"
ON public.crm_activity_read
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Usuarios pueden insertar su registro de lectura"
ON public.crm_activity_read
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuarios pueden actualizar su registro de lectura"
ON public.crm_activity_read
FOR UPDATE
USING (user_id = auth.uid());

-- Function to log CRM activity
CREATE OR REPLACE FUNCTION public.log_crm_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO crm_activity_log (pipeline_id, activity_type, to_stage, created_by, branch_id)
    VALUES (NEW.id, 'pipeline_created', NEW.current_stage, NEW.created_by, NEW.branch_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if stage changed
    IF OLD.current_stage IS DISTINCT FROM NEW.current_stage THEN
      INSERT INTO crm_activity_log (pipeline_id, activity_type, from_stage, to_stage, created_by, branch_id)
      VALUES (NEW.id, 'stage_changed', OLD.current_stage, NEW.current_stage, auth.uid(), NEW.branch_id);
    END IF;
    
    -- Check if status changed to completed
    IF OLD.status != 'completado' AND NEW.status = 'completado' THEN
      INSERT INTO crm_activity_log (pipeline_id, activity_type, from_stage, to_stage, created_by, branch_id)
      VALUES (NEW.id, 'pipeline_completed', OLD.current_stage, NEW.current_stage, auth.uid(), NEW.branch_id);
    END IF;
    
    -- Check if status changed to cancelled
    IF OLD.status != 'cancelado' AND NEW.status = 'cancelado' THEN
      INSERT INTO crm_activity_log (pipeline_id, activity_type, from_stage, to_stage, created_by, branch_id)
      VALUES (NEW.id, 'pipeline_cancelled', OLD.current_stage, NEW.current_stage, auth.uid(), NEW.branch_id);
    END IF;
    
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Create triggers
CREATE TRIGGER crm_pipeline_activity_insert
AFTER INSERT ON public.crm_pipelines
FOR EACH ROW
EXECUTE FUNCTION public.log_crm_activity();

CREATE TRIGGER crm_pipeline_activity_update
AFTER UPDATE ON public.crm_pipelines
FOR EACH ROW
EXECUTE FUNCTION public.log_crm_activity();

-- Create index for performance
CREATE INDEX idx_crm_activity_log_branch_created ON public.crm_activity_log(branch_id, created_at DESC);
CREATE INDEX idx_crm_activity_log_pipeline ON public.crm_activity_log(pipeline_id);