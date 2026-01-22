-- ============================================================
-- FIX FOREIGN KEYS - CentroVision EHR
-- ============================================================
--
-- Este script corrige los foreign keys para permitir eliminar
-- citas (appointments) sin bloquear por referencias.
--
-- Problema: El constraint encounters_appointment_id_fkey no
-- tenía ON DELETE SET NULL, lo que impedía eliminar citas
-- que tenían encounters vinculados.
--
-- Ejecutar en: Supabase Y PostgreSQL local
-- ============================================================

-- ============================================================
-- FIX: encounters_appointment_id_fkey
-- ============================================================
-- Cambia el comportamiento de RESTRICT (bloquea) a SET NULL
-- Cuando se elimina una cita, el encounter NO se borra,
-- solo su appointment_id se pone en NULL.

ALTER TABLE encounters DROP CONSTRAINT IF EXISTS encounters_appointment_id_fkey;

ALTER TABLE encounters
ADD CONSTRAINT encounters_appointment_id_fkey
FOREIGN KEY (appointment_id)
REFERENCES appointments(id)
ON DELETE SET NULL;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- Ejecutar esta consulta para verificar que el constraint existe:
/*
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'encounters'
  AND kcu.column_name = 'appointment_id';
*/

-- Resultado esperado:
-- constraint_name                 | delete_rule
-- encounters_appointment_id_fkey  | SET NULL

-- ============================================================
-- FIN
-- ============================================================
