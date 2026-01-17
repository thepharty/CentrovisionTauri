-- Agregar columna para interpretación de resultados en encounters
ALTER TABLE encounters 
ADD COLUMN interpretacion_resultados text NULL;