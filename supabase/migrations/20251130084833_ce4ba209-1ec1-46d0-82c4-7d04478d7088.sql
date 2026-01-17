-- Add keratometry axis fields to appointments table
ALTER TABLE appointments 
ADD COLUMN keratometry_od_axis text NULL,
ADD COLUMN keratometry_os_axis text NULL;

COMMENT ON COLUMN appointments.keratometry_od_axis IS 'Eje de la queratometría del ojo derecho';
COMMENT ON COLUMN appointments.keratometry_os_axis IS 'Eje de la queratometría del ojo izquierdo';