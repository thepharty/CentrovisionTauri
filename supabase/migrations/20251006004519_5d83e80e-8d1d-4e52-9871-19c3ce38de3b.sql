-- Actualizar políticas RLS para dar a enfermería los mismos permisos que médicos

-- 1. Appointments - permitir a enfermería gestionar citas
DROP POLICY IF EXISTS "Recepción puede gestionar citas" ON public.appointments;
CREATE POLICY "Personal clínico puede gestionar citas" ON public.appointments
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role)
);

-- 2. Encounters - permitir a enfermería actualizar encuentros
DROP POLICY IF EXISTS "Médicos pueden actualizar encuentros" ON public.encounters;
CREATE POLICY "Personal clínico puede actualizar encuentros" ON public.encounters
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role)
);

-- 3. Exam_eye - permitir a enfermería gestionar exámenes
DROP POLICY IF EXISTS "Médicos pueden gestionar exámenes" ON public.exam_eye;
CREATE POLICY "Personal clínico puede gestionar exámenes" ON public.exam_eye
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role)
);

-- 4. Diagnoses - permitir a enfermería gestionar diagnósticos
DROP POLICY IF EXISTS "Médicos pueden gestionar diagnósticos" ON public.diagnoses;
CREATE POLICY "Personal clínico puede gestionar diagnósticos" ON public.diagnoses
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role)
);

-- 5. Surgeries - permitir a enfermería gestionar cirugías
DROP POLICY IF EXISTS "Médicos pueden gestionar cirugías" ON public.surgeries;
CREATE POLICY "Personal clínico puede gestionar cirugías" ON public.surgeries
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role)
);

-- 6. Procedures - permitir a enfermería gestionar procedimientos
DROP POLICY IF EXISTS "Médicos pueden gestionar procedimientos" ON public.procedures;
CREATE POLICY "Personal clínico puede gestionar procedimientos" ON public.procedures
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role)
);

-- 7. Documents - permitir a enfermería crear documentos
DROP POLICY IF EXISTS "Médicos pueden crear documentos" ON public.documents;
CREATE POLICY "Personal clínico puede crear documentos" ON public.documents
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role)
);

-- 8. Patients - permitir a enfermería actualizar antecedentes de pacientes
DROP POLICY IF EXISTS "Médicos pueden actualizar antecedentes de pacientes" ON public.patients;
CREATE POLICY "Personal clínico puede actualizar antecedentes de pacientes" ON public.patients
FOR UPDATE
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role)
);