-- Add is_courtesy column to appointments table
ALTER TABLE appointments ADD COLUMN is_courtesy BOOLEAN DEFAULT FALSE;