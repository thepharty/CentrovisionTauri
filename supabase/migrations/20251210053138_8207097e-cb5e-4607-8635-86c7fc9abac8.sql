-- Add medicacion column to procedures table
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS medicacion TEXT;