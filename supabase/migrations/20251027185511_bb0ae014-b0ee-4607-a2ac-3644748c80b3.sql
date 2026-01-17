-- Agregar el nuevo rol 'contabilidad' al enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'contabilidad';