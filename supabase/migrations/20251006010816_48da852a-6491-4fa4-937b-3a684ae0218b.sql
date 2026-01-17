-- Actualizar políticas RLS para dar a diagnostico los mismos permisos que enfermería

-- 1. Appointments - permitir a diagnostico gestionar citas
DROP POLICY IF EXISTS "Personal clínico puede gestionar citas" ON public.appointments;
CREATE POLICY "Personal clínico puede gestionar citas" ON public.appointments
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- 2. Encounters - permitir a diagnostico actualizar y crear encuentros
DROP POLICY IF EXISTS "Personal clínico puede actualizar encuentros" ON public.encounters;
CREATE POLICY "Personal clínico puede actualizar encuentros" ON public.encounters
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

DROP POLICY IF EXISTS "Médicos y enfermería pueden crear encuentros" ON public.encounters;
DROP POLICY IF EXISTS "Personal clínico puede crear encuentros" ON public.encounters;
CREATE POLICY "Personal clínico puede crear encuentros" ON public.encounters
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- 3. Exam_eye - permitir a diagnostico gestionar exámenes
DROP POLICY IF EXISTS "Personal clínico puede gestionar exámenes" ON public.exam_eye;
CREATE POLICY "Personal clínico puede gestionar exámenes" ON public.exam_eye
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- 4. Diagnoses - permitir a diagnostico gestionar diagnósticos
DROP POLICY IF EXISTS "Personal clínico puede gestionar diagnósticos" ON public.diagnoses;
CREATE POLICY "Personal clínico puede gestionar diagnósticos" ON public.diagnoses
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- 5. Surgeries - permitir a diagnostico gestionar cirugías
DROP POLICY IF EXISTS "Personal clínico puede gestionar cirugías" ON public.surgeries;
CREATE POLICY "Personal clínico puede gestionar cirugías" ON public.surgeries
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- 6. Procedures - permitir a diagnostico gestionar procedimientos
DROP POLICY IF EXISTS "Personal clínico puede gestionar procedimientos" ON public.procedures;
CREATE POLICY "Personal clínico puede gestionar procedimientos" ON public.procedures
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- 7. Documents - permitir a diagnostico crear documentos
DROP POLICY IF EXISTS "Personal clínico puede crear documentos" ON public.documents;
CREATE POLICY "Personal clínico puede crear documentos" ON public.documents
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- 8. Patients - permitir a diagnostico actualizar antecedentes de pacientes
DROP POLICY IF EXISTS "Personal clínico puede actualizar antecedentes de pacientes" ON public.patients;
CREATE POLICY "Personal clínico puede actualizar antecedentes de pacientes" ON public.patients
FOR UPDATE
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- 9. Orders - permitir a diagnostico gestionar órdenes
DROP POLICY IF EXISTS "Médicos y enfermería pueden gestionar órdenes" ON public.orders;
DROP POLICY IF EXISTS "Personal clínico puede gestionar órdenes" ON public.orders;
CREATE POLICY "Personal clínico puede gestionar órdenes" ON public.orders
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);

-- 10. Results - permitir a diagnostico gestionar resultados
DROP POLICY IF EXISTS "Enfermería y médicos pueden gestionar resultados" ON public.results;
DROP POLICY IF EXISTS "Personal clínico puede gestionar resultados" ON public.results;
CREATE POLICY "Personal clínico puede gestionar resultados" ON public.results
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'diagnostico'::app_role)
);