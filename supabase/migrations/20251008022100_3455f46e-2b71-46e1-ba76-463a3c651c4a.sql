-- Fase 1: Optimización de Performance - Índices de Base de Datos

-- Índice compuesto para queries de appointments por fecha y doctor
-- Mejora significativamente las búsquedas de citas por médico en un rango de fechas
CREATE INDEX IF NOT EXISTS idx_appointments_starts_doctor 
  ON appointments(starts_at, doctor_id);

-- Índice compuesto para queries de appointments por fecha y sala
-- Optimiza las búsquedas de citas por sala en un rango de fechas
CREATE INDEX IF NOT EXISTS idx_appointments_starts_room 
  ON appointments(starts_at, room_id);

-- Índice para estudios en sala de diagnóstico
-- Acelera el filtrado de citas tipo 'estudio' en salas de diagnóstico
CREATE INDEX IF NOT EXISTS idx_appointments_type_room 
  ON appointments(type, room_id) 
  WHERE type = 'estudio';

-- Índice para búsquedas por paciente
CREATE INDEX IF NOT EXISTS idx_appointments_patient_date
  ON appointments(patient_id, starts_at);

-- Comentarios explicativos
COMMENT ON INDEX idx_appointments_starts_doctor IS 'Optimiza queries de citas por médico y fecha';
COMMENT ON INDEX idx_appointments_starts_room IS 'Optimiza queries de citas por sala y fecha';
COMMENT ON INDEX idx_appointments_type_room IS 'Optimiza queries de estudios en sala de diagnóstico';
COMMENT ON INDEX idx_appointments_patient_date IS 'Optimiza búsquedas de citas por paciente';