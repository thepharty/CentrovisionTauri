-- ============================================================
-- MIGRACION v1.1.2 - Inventory Restoration & CRM Stage Tracking
-- ============================================================
-- Fecha: 2026-01-28
--
-- Esta migración incluye:
-- 1. Trigger para restaurar inventario al eliminar facturas
-- 2. Campo stage_changed_at para rastrear días en etapa del CRM
-- ============================================================


-- ============================================================
-- 1. RESTAURAR INVENTARIO AL ELIMINAR FACTURAS
-- ============================================================
-- Cuando se elimina una factura, automáticamente crea un movimiento
-- de 'entrada' para restaurar el stock que fue descontado.
-- ============================================================

CREATE OR REPLACE FUNCTION restore_inventory_on_invoice_delete()
RETURNS trigger AS $$
DECLARE
  item_branch_id uuid;
BEGIN
  -- Solo procesar si es un producto con item_id válido
  IF OLD.item_type = 'producto' AND OLD.item_id IS NOT NULL THEN
    -- Obtener el branch_id del item de inventario
    SELECT branch_id INTO item_branch_id
    FROM public.inventory_items
    WHERE id = OLD.item_id;

    -- Si encontramos el item, crear movimiento de devolución
    IF item_branch_id IS NOT NULL THEN
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
        OLD.item_id,
        item_branch_id,
        'entrada',
        OLD.quantity,
        'devolucion',
        OLD.invoice_id,
        'Devolución automática - Factura eliminada',
        auth.uid()
      );
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Crear trigger BEFORE DELETE para restaurar stock antes de eliminar el item
CREATE TRIGGER trigger_restore_inventory_on_invoice_delete
BEFORE DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION restore_inventory_on_invoice_delete();


-- ============================================================
-- 2. CAMPO STAGE_CHANGED_AT PARA CRM PIPELINES
-- ============================================================
-- Este campo permite rastrear cuánto tiempo lleva un pipeline
-- en su etapa actual, separado del tiempo total desde creación.
-- ============================================================

-- Agregar columna para rastrear cuándo cambió la etapa
ALTER TABLE crm_pipelines
ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz DEFAULT now();

-- Inicializar con updated_at para los registros existentes
UPDATE crm_pipelines
SET stage_changed_at = updated_at
WHERE stage_changed_at IS NULL;

-- Agregar comentario descriptivo
COMMENT ON COLUMN crm_pipelines.stage_changed_at IS
  'Fecha y hora del último cambio de etapa. Se actualiza cada vez que current_stage cambia.';
