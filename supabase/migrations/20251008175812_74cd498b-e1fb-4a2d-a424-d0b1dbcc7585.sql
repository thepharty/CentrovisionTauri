-- Agregar nuevo estado 'preconsulta_ready' al enum appointment_status
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'preconsulta_ready';