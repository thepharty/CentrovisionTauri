-- Add foreign key constraint from crm_activity_log.created_by to profiles.user_id
ALTER TABLE crm_activity_log 
ADD CONSTRAINT crm_activity_log_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES profiles(user_id);