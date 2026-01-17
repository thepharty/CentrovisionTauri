-- Add cancellation_reason to crm_pipelines
ALTER TABLE crm_pipelines 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Add reason to crm_activity_log for storing cancellation/other reasons
ALTER TABLE crm_activity_log 
ADD COLUMN IF NOT EXISTS reason TEXT;

-- Update the trigger function to include reason when logging cancellation
CREATE OR REPLACE FUNCTION log_crm_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO crm_activity_log (pipeline_id, branch_id, activity_type, created_by)
    VALUES (NEW.id, NEW.branch_id, 'pipeline_created', NEW.created_by);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log stage changes
    IF OLD.current_stage IS DISTINCT FROM NEW.current_stage THEN
      INSERT INTO crm_activity_log (pipeline_id, branch_id, activity_type, from_stage, to_stage, created_by)
      VALUES (NEW.id, NEW.branch_id, 'stage_changed', OLD.current_stage, NEW.current_stage, auth.uid());
    END IF;
    
    -- Log status changes with cancellation reason
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'cancelado' THEN
        INSERT INTO crm_activity_log (pipeline_id, branch_id, activity_type, reason, created_by)
        VALUES (NEW.id, NEW.branch_id, 'pipeline_cancelled', NEW.cancellation_reason, auth.uid());
      ELSIF NEW.status = 'completado' THEN
        INSERT INTO crm_activity_log (pipeline_id, branch_id, activity_type, created_by)
        VALUES (NEW.id, NEW.branch_id, 'pipeline_completed', auth.uid());
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;