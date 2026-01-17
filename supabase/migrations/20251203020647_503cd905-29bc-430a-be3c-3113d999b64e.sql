-- Tabla para tipos de cirugía
CREATE TABLE public.surgery_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Tabla para tipos de estudio
CREATE TABLE public.study_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Tabla para tipos de procedimiento
CREATE TABLE public.procedure_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.surgery_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_types ENABLE ROW LEVEL SECURITY;

-- Políticas: Todos pueden ver
CREATE POLICY "Todos pueden ver tipos de cirugía" ON public.surgery_types FOR SELECT USING (true);
CREATE POLICY "Todos pueden ver tipos de estudio" ON public.study_types FOR SELECT USING (true);
CREATE POLICY "Todos pueden ver tipos de procedimiento" ON public.procedure_types FOR SELECT USING (true);

-- Políticas: Solo admin puede gestionar
CREATE POLICY "Solo admin puede gestionar tipos de cirugía" ON public.surgery_types FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Solo admin puede gestionar tipos de estudio" ON public.study_types FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Solo admin puede gestionar tipos de procedimiento" ON public.procedure_types FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Insertar datos iniciales de cirugías
INSERT INTO public.surgery_types (name, category, display_order) VALUES
  ('Catarata', 'Segmento Anterior', 1),
  ('Catarata con laser Femtosegundo', 'Segmento Anterior', 2),
  ('Anillos Corneales', 'Segmento Anterior', 3),
  ('KPP', 'Segmento Anterior', 4),
  ('Transplante endotelial', 'Segmento Anterior', 5),
  ('DALK', 'Segmento Anterior', 6),
  ('TransPRK', 'Segmento Anterior', 7),
  ('FemtoLASIK', 'Segmento Anterior', 8),
  ('CLEAR', 'Segmento Anterior', 9),
  ('ICL', 'Segmento Anterior', 10),
  ('Artisan', 'Segmento Anterior', 11),
  ('Pterigion', 'Segmento Anterior', 12),
  ('Vitrectomia', 'Retina', 1),
  ('Retinopexia', 'Retina', 2),
  ('Cirugia macular', 'Retina', 3),
  ('Endolaser', 'Retina', 4),
  ('Trabeculectomia', 'Glaucoma', 1),
  ('FacoTrabeculectomia', 'Glaucoma', 2),
  ('Valvula', 'Glaucoma', 3),
  ('Laser SLT', 'Glaucoma', 4),
  ('Laser Termociclo', 'Glaucoma', 5),
  ('Laser Subciclo', 'Glaucoma', 6),
  ('Crio', 'Glaucoma', 7),
  ('Blefaroplastia superior', 'Oculoplastica', 1),
  ('Blefaroplastia Inferior', 'Oculoplastica', 2),
  ('Dacrio', 'Oculoplastica', 3),
  ('Ptosis', 'Oculoplastica', 4),
  ('Entropion', 'Oculoplastica', 5),
  ('Ectropion', 'Oculoplastica', 6),
  ('Estrabismo', 'Otras', 1);

-- Insertar datos iniciales de estudios
INSERT INTO public.study_types (name, display_order) VALUES
  ('Pentacam', 1),
  ('Biometria Optica', 2),
  ('Biometria de contacto', 3),
  ('Recuento endotelial', 4),
  ('Topografia Corneal', 5),
  ('OPD Aberrometria', 6),
  ('Perimetria 30', 7),
  ('Perimetria 60', 8),
  ('OCT nervio Optico', 9),
  ('OCT Macula', 10),
  ('AGF', 11),
  ('Fotos Campo Amplio', 12),
  ('Ultrasonido Ocular A-B', 13),
  ('Anterion', 14),
  ('Sirius +', 15),
  ('Mapa Epitelial', 16),
  ('Paquete Glaucoma', 17),
  ('Paquete de retina', 18);

-- Insertar datos iniciales de procedimientos
INSERT INTO public.procedure_types (name, display_order) VALUES
  ('Panfotocoagulacion', 1),
  ('Laser Arcadas', 2),
  ('Laser Focal', 3),
  ('Iridectomia Periferica', 4),
  ('Capsulotomia Yag Laser', 5),
  ('Cross Linking Corneal', 6),
  ('Avastin', 7),
  ('Laser SLT', 8);