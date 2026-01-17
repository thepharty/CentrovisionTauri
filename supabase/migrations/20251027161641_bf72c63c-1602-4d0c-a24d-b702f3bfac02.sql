-- Agregar columna gender a la tabla profiles para diferenciar Dr./Dra.
ALTER TABLE public.profiles 
ADD COLUMN gender text CHECK (gender IN ('M', 'F')) DEFAULT 'M';

-- Comentario descriptivo
COMMENT ON COLUMN public.profiles.gender IS 'Género del profesional: M (Masculino/Dr.) o F (Femenino/Dra.)';
