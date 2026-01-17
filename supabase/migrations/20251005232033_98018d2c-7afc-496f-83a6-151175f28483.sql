-- Crear tabla de cirugías
CREATE TABLE public.surgeries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  tipo_cirugia TEXT NOT NULL,
  ojo_operar eye_side NOT NULL DEFAULT 'OU',
  nota_operatoria TEXT,
  medicacion TEXT,
  consentimiento_informado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.surgeries ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso
CREATE POLICY "Médicos pueden gestionar cirugías"
ON public.surgeries
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'doctor'::app_role));

CREATE POLICY "Personal clínico puede ver cirugías"
ON public.surgeries
FOR SELECT
TO authenticated
USING (true);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_surgeries_updated_at
BEFORE UPDATE ON public.surgeries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índice para búsquedas por encounter
CREATE INDEX idx_surgeries_encounter_id ON public.surgeries(encounter_id);