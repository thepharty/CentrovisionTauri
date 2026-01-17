-- Add foreign key constraints to enable PostgREST joins with profiles table
-- These constraints allow querying doctor/creator information from profiles

-- Add foreign key from crm_pipelines.doctor_id to profiles.user_id
ALTER TABLE public.crm_pipelines
ADD CONSTRAINT crm_pipelines_doctor_id_fkey
FOREIGN KEY (doctor_id)
REFERENCES public.profiles(user_id)
ON DELETE SET NULL;

-- Add foreign key from crm_activity_log.created_by to profiles.user_id
ALTER TABLE public.crm_activity_log
ADD CONSTRAINT crm_activity_log_created_by_fkey
FOREIGN KEY (created_by)
REFERENCES public.profiles(user_id)
ON DELETE SET NULL;

-- Add comment explaining these foreign keys
COMMENT ON CONSTRAINT crm_pipelines_doctor_id_fkey ON public.crm_pipelines IS
'Links pipeline doctor to their profile for displaying doctor information';

COMMENT ON CONSTRAINT crm_activity_log_created_by_fkey ON public.crm_activity_log IS
'Links activity creator to their profile for displaying who made changes';
