-- Eliminar política restrictiva existente
DROP POLICY IF EXISTS "Admin puede ver actividad CRM" ON public.crm_activity_log;

-- Nueva política: todos los roles CRM pueden ver actividades/notificaciones
CREATE POLICY "Usuarios CRM pueden ver actividades"
  ON public.crm_activity_log FOR SELECT
  TO authenticated
  USING (public.has_crm_access(auth.uid()));

-- También permitir insertar actividades a roles CRM
CREATE POLICY "Usuarios CRM pueden registrar actividades"
  ON public.crm_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_crm_access(auth.uid()));