-- FASE 2: Cambiar ON DELETE CASCADE a ON DELETE SET NULL
-- Esto previene la pérdida de datos en cascada

-- 1. Hacer columnas nullable (requerido para SET NULL)
ALTER TABLE exam_eye ALTER COLUMN encounter_id DROP NOT NULL;
ALTER TABLE diagnoses ALTER COLUMN encounter_id DROP NOT NULL;
ALTER TABLE encounters ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE appointments ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE invoice_items ALTER COLUMN invoice_id DROP NOT NULL;

-- 2. Cambiar exam_eye: CASCADE → SET NULL
ALTER TABLE exam_eye DROP CONSTRAINT exam_eye_encounter_id_fkey;
ALTER TABLE exam_eye ADD CONSTRAINT exam_eye_encounter_id_fkey 
  FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL;

-- 3. Cambiar diagnoses: CASCADE → SET NULL
ALTER TABLE diagnoses DROP CONSTRAINT diagnoses_encounter_id_fkey;
ALTER TABLE diagnoses ADD CONSTRAINT diagnoses_encounter_id_fkey 
  FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL;

-- 4. Cambiar encounters: CASCADE → SET NULL
ALTER TABLE encounters DROP CONSTRAINT encounters_patient_id_fkey;
ALTER TABLE encounters ADD CONSTRAINT encounters_patient_id_fkey 
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

-- 5. Cambiar appointments: CASCADE → SET NULL
ALTER TABLE appointments DROP CONSTRAINT appointments_patient_id_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_patient_id_fkey 
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

-- 6. Cambiar invoices: CASCADE → SET NULL
ALTER TABLE invoices DROP CONSTRAINT invoices_patient_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_patient_id_fkey 
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

-- 7. Cambiar invoice_items: CASCADE → SET NULL
ALTER TABLE invoice_items DROP CONSTRAINT invoice_items_invoice_id_fkey;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey 
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- FASE 3: Crear tabla backup_snapshots
CREATE TABLE backup_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(user_id) ON DELETE SET NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('manual', 'auto_export', 'scheduled')),
  table_counts JSONB NOT NULL,
  notes TEXT
);

ALTER TABLE backup_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin puede gestionar snapshots" ON backup_snapshots
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- FASE 4: Agregar columnas deleted_at para soft delete
ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE exam_eye ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Índices para consultas eficientes de registros activos
CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_encounters_active ON encounters(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_exam_eye_active ON exam_eye(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_active ON appointments(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_active ON invoices(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_diagnoses_active ON diagnoses(id) WHERE deleted_at IS NULL;