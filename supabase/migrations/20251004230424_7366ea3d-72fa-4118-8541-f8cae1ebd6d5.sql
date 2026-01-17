-- Add keratometry and PIO fields to appointments table
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS keratometry_od_k1 text,
ADD COLUMN IF NOT EXISTS keratometry_od_k2 text,
ADD COLUMN IF NOT EXISTS keratometry_os_k1 text,
ADD COLUMN IF NOT EXISTS keratometry_os_k2 text,
ADD COLUMN IF NOT EXISTS pio_od numeric(4,1),
ADD COLUMN IF NOT EXISTS pio_os numeric(4,1);