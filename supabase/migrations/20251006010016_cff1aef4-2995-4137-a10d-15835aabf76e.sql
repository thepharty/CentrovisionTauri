-- Agregar el nuevo rol 'diagnostico' al enum app_role
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'diagnostico';