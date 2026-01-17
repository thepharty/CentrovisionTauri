-- Crear función helper para verificar acceso CRM (con roles correctos)
CREATE OR REPLACE FUNCTION public.has_crm_access(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = $1
    AND role IN ('admin', 'reception', 'caja', 'contabilidad', 'nurse', 'estudios')
  )
$$;

-- Nuevas políticas para crm_pipelines
CREATE POLICY "Usuarios CRM pueden ver pipelines"
  ON public.crm_pipelines FOR SELECT
  TO authenticated
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Usuarios CRM pueden gestionar pipelines"
  ON public.crm_pipelines FOR ALL
  TO authenticated
  USING (public.has_crm_access(auth.uid()))
  WITH CHECK (public.has_crm_access(auth.uid()));

-- Nuevas políticas para crm_pipeline_stages
CREATE POLICY "Usuarios CRM pueden ver etapas"
  ON public.crm_pipeline_stages FOR SELECT
  TO authenticated
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Usuarios CRM pueden gestionar etapas"
  ON public.crm_pipeline_stages FOR ALL
  TO authenticated
  USING (public.has_crm_access(auth.uid()))
  WITH CHECK (public.has_crm_access(auth.uid()));

-- Nuevas políticas para crm_pipeline_notes
CREATE POLICY "Usuarios CRM pueden ver notas"
  ON public.crm_pipeline_notes FOR SELECT
  TO authenticated
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Usuarios CRM pueden gestionar notas"
  ON public.crm_pipeline_notes FOR ALL
  TO authenticated
  USING (public.has_crm_access(auth.uid()))
  WITH CHECK (public.has_crm_access(auth.uid()));