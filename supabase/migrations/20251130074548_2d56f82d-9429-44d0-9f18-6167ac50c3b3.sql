-- Drop and recreate get_clinical_research_data_by_patient with fixed aliases
DROP FUNCTION IF EXISTS public.get_clinical_research_data_by_patient(timestamp with time zone, timestamp with time zone, uuid, text, text, text, appointment_type, boolean, boolean, integer, integer, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.get_clinical_research_data_by_patient(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  doctor_filter uuid DEFAULT NULL::uuid,
  diagnosis_filter text DEFAULT NULL::text,
  search_field_type text DEFAULT 'all'::text,
  surgery_type_filter text DEFAULT NULL::text,
  appointment_type_filter appointment_type DEFAULT NULL::appointment_type,
  has_preop_data boolean DEFAULT NULL::boolean,
  has_postop_data boolean DEFAULT NULL::boolean,
  min_age integer DEFAULT NULL::integer,
  max_age integer DEFAULT NULL::integer,
  gender_filter text DEFAULT NULL::text,
  has_diabetes boolean DEFAULT NULL::boolean,
  has_hta boolean DEFAULT NULL::boolean,
  has_autorefractor boolean DEFAULT NULL::boolean,
  has_lensometry boolean DEFAULT NULL::boolean,
  has_keratometry boolean DEFAULT NULL::boolean,
  has_pio boolean DEFAULT NULL::boolean,
  has_fundus_photos boolean DEFAULT NULL::boolean,
  has_slit_lamp boolean DEFAULT NULL::boolean,
  has_visual_acuity boolean DEFAULT NULL::boolean,
  has_subjective_refraction boolean DEFAULT NULL::boolean,
  has_prescription boolean DEFAULT NULL::boolean
)
RETURNS TABLE(
  patient_id uuid,
  patient_code text,
  patient_age integer,
  patient_gender text,
  patient_occupation text,
  has_diabetes_flag boolean,
  has_hta_flag boolean,
  allergies text,
  ophthalmic_history text,
  patient_notes text,
  visits jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH matching_patients AS (
    -- Primero identificar qué pacientes tienen al menos un encuentro que coincide con la búsqueda
    SELECT DISTINCT
      e.patient_id
    FROM encounters e
    LEFT JOIN appointments a ON a.id = e.appointment_id
    LEFT JOIN exam_eye ee ON ee.encounter_id = e.id
    WHERE e.date >= start_date
      AND e.date <= end_date
      AND (doctor_filter IS NULL OR e.doctor_id = doctor_filter)
      AND (appointment_type_filter IS NULL OR a.type = appointment_type_filter)
      AND (
        diagnosis_filter IS NULL OR
        CASE search_field_type
          WHEN 'all' THEN (
            e.summary ~* ('\y' || diagnosis_filter || '\y') OR
            e.plan_tratamiento ~* ('\y' || diagnosis_filter || '\y') OR
            e.cirugias ~* ('\y' || diagnosis_filter || '\y') OR
            e.estudios ~* ('\y' || diagnosis_filter || '\y') OR
            e.motivo_consulta ~* ('\y' || diagnosis_filter || '\y') OR
            ee.slit_lamp ~* ('\y' || diagnosis_filter || '\y') OR
            ee.fundus ~* ('\y' || diagnosis_filter || '\y')
          )
          WHEN 'diagnosis' THEN e.summary ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'treatment_plan' THEN e.plan_tratamiento ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'surgeries' THEN e.cirugias ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'studies' THEN e.estudios ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'chief_complaint' THEN e.motivo_consulta ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'physical_exam' THEN (
            ee.slit_lamp ~* ('\y' || diagnosis_filter || '\y') OR
            ee.fundus ~* ('\y' || diagnosis_filter || '\y')
          )
          ELSE e.summary ~* ('\y' || diagnosis_filter || '\y')
        END
      )
  ),
  all_patient_encounters AS (
    -- Ahora obtener TODOS los encuentros de esos pacientes (sin filtro de búsqueda)
    SELECT research_data.*
    FROM get_clinical_research_data(
      start_date,
      end_date,
      doctor_filter,
      NULL, -- Sin filtro de diagnóstico aquí para traer todo
      'all',
      surgery_type_filter,
      appointment_type_filter,
      has_preop_data,
      has_postop_data,
      min_age,
      max_age,
      gender_filter,
      has_diabetes,
      has_hta,
      has_autorefractor,
      has_lensometry,
      has_keratometry,
      has_pio,
      has_fundus_photos,
      has_slit_lamp,
      has_visual_acuity,
      has_subjective_refraction,
      has_prescription
    ) AS research_data
    WHERE research_data.patient_id IN (SELECT mp.patient_id FROM matching_patients mp)
  )
  SELECT 
    ed.patient_id,
    ed.patient_code,
    ed.patient_age,
    ed.patient_gender,
    ed.patient_occupation,
    ed.has_diabetes_flag,
    ed.has_hta_flag,
    ed.allergies,
    ed.ophthalmic_history,
    ed.patient_notes,
    jsonb_agg(
      to_jsonb(ed.*) 
      ORDER BY ed.encounter_date ASC
    ) as visits
  FROM all_patient_encounters ed
  GROUP BY 
    ed.patient_id,
    ed.patient_code,
    ed.patient_age,
    ed.patient_gender,
    ed.patient_occupation,
    ed.has_diabetes_flag,
    ed.has_hta_flag,
    ed.allergies,
    ed.ophthalmic_history,
    ed.patient_notes
  ORDER BY ed.patient_code;
END;
$function$;