-- Hacer el campo code nullable para permitir nuevas sedes sin código ENUM
ALTER TABLE branches ALTER COLUMN code DROP NOT NULL;