-- ============================================================
-- MIGRACIÓN: Agregar updated_at a tablas para sincronización
-- ============================================================
--
-- Este script agrega la columna updated_at a todas las tablas
-- que la necesitan para el servicio de sincronización.
--
-- Ejecutar en: Supabase SQL Editor
-- Fecha: 2026-01-20
-- ============================================================

-- Asegurar que existe la función de trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. CATÁLOGOS
-- ============================================================

-- study_types
ALTER TABLE public.study_types
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.study_types SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_study_types_updated_at ON public.study_types;
CREATE TRIGGER update_study_types_updated_at
  BEFORE UPDATE ON public.study_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- surgery_types
ALTER TABLE public.surgery_types
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.surgery_types SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_surgery_types_updated_at ON public.surgery_types;
CREATE TRIGGER update_surgery_types_updated_at
  BEFORE UPDATE ON public.surgery_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- procedure_types
ALTER TABLE public.procedure_types
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.procedure_types SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_procedure_types_updated_at ON public.procedure_types;
CREATE TRIGGER update_procedure_types_updated_at
  BEFORE UPDATE ON public.procedure_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- crm_procedure_types
ALTER TABLE public.crm_procedure_types
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.crm_procedure_types SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_crm_procedure_types_updated_at ON public.crm_procedure_types;
CREATE TRIGGER update_crm_procedure_types_updated_at
  BEFORE UPDATE ON public.crm_procedure_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. USUARIOS Y ROLES
-- ============================================================

-- user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.user_roles SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- user_branches
ALTER TABLE public.user_branches
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.user_branches SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_user_branches_updated_at ON public.user_branches;
CREATE TRIGGER update_user_branches_updated_at
  BEFORE UPDATE ON public.user_branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. AGENDA
-- ============================================================

-- schedule_blocks
ALTER TABLE public.schedule_blocks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.schedule_blocks SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_schedule_blocks_updated_at ON public.schedule_blocks;
CREATE TRIGGER update_schedule_blocks_updated_at
  BEFORE UPDATE ON public.schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. EXPEDIENTE CLÍNICO
-- ============================================================

-- diagnoses
ALTER TABLE public.diagnoses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.diagnoses SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_diagnoses_updated_at ON public.diagnoses;
CREATE TRIGGER update_diagnoses_updated_at
  BEFORE UPDATE ON public.diagnoses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- surgery_files
ALTER TABLE public.surgery_files
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.surgery_files SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_surgery_files_updated_at ON public.surgery_files;
CREATE TRIGGER update_surgery_files_updated_at
  BEFORE UPDATE ON public.surgery_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- study_files
ALTER TABLE public.study_files
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.study_files SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_study_files_updated_at ON public.study_files;
CREATE TRIGGER update_study_files_updated_at
  BEFORE UPDATE ON public.study_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- results
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.results SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_results_updated_at ON public.results;
CREATE TRIGGER update_results_updated_at
  BEFORE UPDATE ON public.results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.documents SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. FACTURACIÓN
-- ============================================================

-- invoice_items
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.invoice_items SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_invoice_items_updated_at ON public.invoice_items;
CREATE TRIGGER update_invoice_items_updated_at
  BEFORE UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.payments SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- cash_closures
ALTER TABLE public.cash_closures
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.cash_closures SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_cash_closures_updated_at ON public.cash_closures;
CREATE TRIGGER update_cash_closures_updated_at
  BEFORE UPDATE ON public.cash_closures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 6. INVENTARIO
-- ============================================================

-- inventory_lots
ALTER TABLE public.inventory_lots
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.inventory_lots SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_inventory_lots_updated_at ON public.inventory_lots;
CREATE TRIGGER update_inventory_lots_updated_at
  BEFORE UPDATE ON public.inventory_lots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- inventory_movements
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.inventory_movements SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_inventory_movements_updated_at ON public.inventory_movements;
CREATE TRIGGER update_inventory_movements_updated_at
  BEFORE UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- room_inventory_movements
ALTER TABLE public.room_inventory_movements
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.room_inventory_movements SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_room_inventory_movements_updated_at ON public.room_inventory_movements;
CREATE TRIGGER update_room_inventory_movements_updated_at
  BEFORE UPDATE ON public.room_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. CRM
-- ============================================================

-- crm_pipeline_stages
ALTER TABLE public.crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.crm_pipeline_stages SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_crm_pipeline_stages_updated_at ON public.crm_pipeline_stages;
CREATE TRIGGER update_crm_pipeline_stages_updated_at
  BEFORE UPDATE ON public.crm_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- crm_pipeline_notes
ALTER TABLE public.crm_pipeline_notes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.crm_pipeline_notes SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_crm_pipeline_notes_updated_at ON public.crm_pipeline_notes;
CREATE TRIGGER update_crm_pipeline_notes_updated_at
  BEFORE UPDATE ON public.crm_pipeline_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- crm_activity_log
ALTER TABLE public.crm_activity_log
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.crm_activity_log SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_crm_activity_log_updated_at ON public.crm_activity_log;
CREATE TRIGGER update_crm_activity_log_updated_at
  BEFORE UPDATE ON public.crm_activity_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 8. NUEVAS TABLAS (Features recientes)
-- ============================================================

-- consent_signatures
ALTER TABLE public.consent_signatures
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.consent_signatures SET updated_at = signed_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_consent_signatures_updated_at ON public.consent_signatures;
CREATE TRIGGER update_consent_signatures_updated_at
  BEFORE UPDATE ON public.consent_signatures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- referring_doctors
ALTER TABLE public.referring_doctors
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE public.referring_doctors SET updated_at = created_at WHERE updated_at IS NULL;
DROP TRIGGER IF EXISTS update_referring_doctors_updated_at ON public.referring_doctors;
CREATE TRIGGER update_referring_doctors_updated_at
  BEFORE UPDATE ON public.referring_doctors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- Ejecutar esta consulta para verificar que todas las tablas tienen updated_at:
/*
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'updated_at'
ORDER BY table_name;
*/

-- ============================================================
-- FIN DE MIGRACIÓN
-- ============================================================
