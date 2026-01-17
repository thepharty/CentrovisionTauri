-- Add updated_by column to track who updates each stage
ALTER TABLE crm_pipeline_stages 
ADD COLUMN updated_by UUID REFERENCES auth.users(id);

-- Update default_stages for refractive surgeries (no supplies needed)
UPDATE crm_procedure_types 
SET default_stages = '["info", "examenes", "confirmada", "cirugia"]'::jsonb
WHERE name IN ('CLEAR', 'TransPRK', 'FemtoLasik', 'Catarata');

-- Update default_stages for surgeries with supplies, changing en_camino to ya_clinica
UPDATE crm_procedure_types 
SET default_stages = '["info", "anticipo", "pedido", "ya_clinica", "cirugia"]'::jsonb
WHERE name NOT IN ('CLEAR', 'TransPRK', 'FemtoLasik', 'Catarata');