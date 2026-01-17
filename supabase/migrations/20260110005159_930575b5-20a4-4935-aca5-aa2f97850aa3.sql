-- Eliminar función con CASCADE (elimina políticas dependientes)
DROP FUNCTION IF EXISTS public.has_crm_access(uuid) CASCADE;

-- Recrear función con roles correctos incluyendo diagnostico
CREATE FUNCTION public.has_crm_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = _user_id
    AND role IN ('admin', 'reception', 'caja', 'contabilidad', 'nurse', 'diagnostico')
  )
$$;

-- Recrear políticas RLS para crm_pipelines
CREATE POLICY "Usuarios CRM pueden ver pipelines"
  ON public.crm_pipelines FOR SELECT
  TO authenticated
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Usuarios CRM pueden gestionar pipelines"
  ON public.crm_pipelines FOR ALL
  TO authenticated
  USING (public.has_crm_access(auth.uid()))
  WITH CHECK (public.has_crm_access(auth.uid()));

-- Recrear políticas RLS para crm_pipeline_stages
CREATE POLICY "Usuarios CRM pueden ver etapas"
  ON public.crm_pipeline_stages FOR SELECT
  TO authenticated
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Usuarios CRM pueden gestionar etapas"
  ON public.crm_pipeline_stages FOR ALL
  TO authenticated
  USING (public.has_crm_access(auth.uid()))
  WITH CHECK (public.has_crm_access(auth.uid()));

-- Recrear políticas RLS para crm_pipeline_notes
CREATE POLICY "Usuarios CRM pueden ver notas"
  ON public.crm_pipeline_notes FOR SELECT
  TO authenticated
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Usuarios CRM pueden gestionar notas"
  ON public.crm_pipeline_notes FOR ALL
  TO authenticated
  USING (public.has_crm_access(auth.uid()))
  WITH CHECK (public.has_crm_access(auth.uid()));

-- Recrear políticas RLS para crm_activity_log
CREATE POLICY "Usuarios CRM pueden ver actividades"
  ON public.crm_activity_log FOR SELECT
  TO authenticated
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Usuarios CRM pueden registrar actividades"
  ON public.crm_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_crm_access(auth.uid()));