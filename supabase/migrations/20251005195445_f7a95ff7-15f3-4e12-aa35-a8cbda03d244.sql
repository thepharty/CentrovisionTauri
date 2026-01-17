-- Add appointment_id to link encounters to a specific appointment
ALTER TABLE public.encounters
ADD COLUMN IF NOT EXISTS appointment_id UUID NULL;

-- Create an index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_encounters_appointment_id ON public.encounters(appointment_id);

-- Add foreign key constraint to appointments table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'encounters_appointment_id_fkey'
  ) THEN
    ALTER TABLE public.encounters
    ADD CONSTRAINT encounters_appointment_id_fkey
    FOREIGN KEY (appointment_id)
    REFERENCES public.appointments(id)
    ON DELETE SET NULL;
  END IF;
END $$;