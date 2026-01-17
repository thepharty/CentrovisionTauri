-- Crear tabla procedures para procedimientos
CREATE TABLE public.procedures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  tipo_procedimiento TEXT NOT NULL,
  ojo_operar public.eye_side NOT NULL DEFAULT 'OU'::eye_side,
  consentimiento_informado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;

-- Create policies for procedures (same as surgeries)
CREATE POLICY "Médicos pueden gestionar procedimientos" 
ON public.procedures 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'doctor'::app_role));

CREATE POLICY "Personal clínico puede ver procedimientos" 
ON public.procedures 
FOR SELECT 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_procedures_updated_at
BEFORE UPDATE ON public.procedures
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();