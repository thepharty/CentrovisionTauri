-- Crear tabla para bloqueos de agenda
CREATE TABLE public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (ends_at > starts_at)
);

-- Habilitar RLS
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

-- Política: Todos pueden ver los bloqueos
CREATE POLICY "Todos pueden ver bloqueos de agenda"
ON public.schedule_blocks
FOR SELECT
TO authenticated
USING (true);

-- Política: Solo admin y recepción pueden crear bloqueos
CREATE POLICY "Admin y recepción pueden crear bloqueos"
ON public.schedule_blocks
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role)
);

-- Política: Solo admin y recepción pueden actualizar bloqueos
CREATE POLICY "Admin y recepción pueden actualizar bloqueos"
ON public.schedule_blocks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role)
);

-- Política: Solo admin y recepción pueden eliminar bloqueos
CREATE POLICY "Admin y recepción pueden eliminar bloqueos"
ON public.schedule_blocks
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role)
);

-- Índices para mejorar el rendimiento de consultas
CREATE INDEX idx_schedule_blocks_doctor_starts ON public.schedule_blocks(doctor_id, starts_at);
CREATE INDEX idx_schedule_blocks_room_starts ON public.schedule_blocks(room_id, starts_at);
CREATE INDEX idx_schedule_blocks_branch ON public.schedule_blocks(branch_id);
CREATE INDEX idx_schedule_blocks_time_range ON public.schedule_blocks(starts_at, ends_at);