-- Refactorizar función RPC para evitar el límite de 100 argumentos
-- Usar to_jsonb() en lugar de jsonb_build_object
CREATE OR REPLACE FUNCTION public.get_clinical_research_data_by_patient(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  doctor_filter uuid DEFAULT NULL,
  diagnosis_filter text DEFAULT NULL,
  surgery_type_filter text DEFAULT NULL,
  appointment_type_filter appointment_type DEFAULT NULL,
  has_preop_data boolean DEFAULT NULL,
  has_postop_data boolean DEFAULT NULL,
  min_age integer DEFAULT NULL,
  max_age integer DEFAULT NULL,
  gender_filter text DEFAULT NULL,
  has_diabetes boolean DEFAULT NULL,
  has_hta boolean DEFAULT NULL,
  has_autorefractor boolean DEFAULT NULL,
  has_lensometry boolean DEFAULT NULL,
  has_keratometry boolean DEFAULT NULL,
  has_pio boolean DEFAULT NULL,
  has_fundus_photos boolean DEFAULT NULL,
  has_slit_lamp boolean DEFAULT NULL,
  has_visual_acuity boolean DEFAULT NULL,
  has_subjective_refraction boolean DEFAULT NULL,
  has_prescription boolean DEFAULT NULL
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
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH encounter_data AS (
    -- Obtener todos los datos usando la función existente
    SELECT *
    FROM get_clinical_research_data(
      start_date,
      end_date,
      doctor_filter,
      diagnosis_filter,
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
    )
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
  FROM encounter_data ed
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