-- Agregar el nuevo rol 'estudios' al enum app_role
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'estudios';