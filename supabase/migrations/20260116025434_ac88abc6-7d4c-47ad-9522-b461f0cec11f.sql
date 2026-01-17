-- ═══════════════════════════════════════════════════════════
-- CORREGIR TODAS LAS FOREIGN KEYS SIN ON DELETE
-- Cambiar de NO ACTION a ON DELETE SET NULL
-- ═══════════════════════════════════════════════════════════

-- 1. appointments.branch_id
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_branch_id_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 2. cash_closures.branch_id  
ALTER TABLE cash_closures DROP CONSTRAINT IF EXISTS cash_closures_branch_id_fkey;
ALTER TABLE cash_closures ADD CONSTRAINT cash_closures_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 3. cash_closures.closed_by
ALTER TABLE cash_closures DROP CONSTRAINT IF EXISTS cash_closures_closed_by_fkey;
ALTER TABLE cash_closures ADD CONSTRAINT cash_closures_closed_by_fkey 
  FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. crm_activity_log.created_by
ALTER TABLE crm_activity_log DROP CONSTRAINT IF EXISTS crm_activity_log_created_by_fkey;
ALTER TABLE crm_activity_log ADD CONSTRAINT crm_activity_log_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

-- 5. crm_activity_log.branch_id
ALTER TABLE crm_activity_log DROP CONSTRAINT IF EXISTS crm_activity_log_branch_id_fkey;
ALTER TABLE crm_activity_log ADD CONSTRAINT crm_activity_log_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 6. crm_pipeline_stages.updated_by
ALTER TABLE crm_pipeline_stages DROP CONSTRAINT IF EXISTS crm_pipeline_stages_updated_by_fkey;
ALTER TABLE crm_pipeline_stages ADD CONSTRAINT crm_pipeline_stages_updated_by_fkey 
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 7. crm_pipelines.doctor_id
ALTER TABLE crm_pipelines DROP CONSTRAINT IF EXISTS crm_pipelines_doctor_id_fkey;
ALTER TABLE crm_pipelines ADD CONSTRAINT crm_pipelines_doctor_id_fkey 
  FOREIGN KEY (doctor_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

-- 8. crm_pipelines.branch_id
ALTER TABLE crm_pipelines DROP CONSTRAINT IF EXISTS crm_pipelines_branch_id_fkey;
ALTER TABLE crm_pipelines ADD CONSTRAINT crm_pipelines_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 9. edge_function_settings.disabled_by
ALTER TABLE edge_function_settings DROP CONSTRAINT IF EXISTS edge_function_settings_disabled_by_fkey;
ALTER TABLE edge_function_settings ADD CONSTRAINT edge_function_settings_disabled_by_fkey 
  FOREIGN KEY (disabled_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

-- 10. inventory_items.branch_id
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_branch_id_fkey;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 11. inventory_items.supplier_id
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_supplier_id_fkey;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_supplier_id_fkey 
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- 12. inventory_movements.branch_id
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_branch_id_fkey;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 13. invoices.branch_id
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_branch_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 14. pending_registrations.reviewed_by
ALTER TABLE pending_registrations DROP CONSTRAINT IF EXISTS pending_registrations_reviewed_by_fkey;
ALTER TABLE pending_registrations ADD CONSTRAINT pending_registrations_reviewed_by_fkey 
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 15. room_inventory_categories.branch_id
ALTER TABLE room_inventory_categories DROP CONSTRAINT IF EXISTS room_inventory_categories_branch_id_fkey;
ALTER TABLE room_inventory_categories ADD CONSTRAINT room_inventory_categories_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 16. room_inventory_items.branch_id
ALTER TABLE room_inventory_items DROP CONSTRAINT IF EXISTS room_inventory_items_branch_id_fkey;
ALTER TABLE room_inventory_items ADD CONSTRAINT room_inventory_items_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- 17. room_inventory_movements.branch_id
ALTER TABLE room_inventory_movements DROP CONSTRAINT IF EXISTS room_inventory_movements_branch_id_fkey;
ALTER TABLE room_inventory_movements ADD CONSTRAINT room_inventory_movements_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;