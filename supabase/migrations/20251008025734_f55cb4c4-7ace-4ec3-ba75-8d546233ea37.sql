-- Migración 1: Solo agregar el valor al enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'caja';