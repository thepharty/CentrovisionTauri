-- Actualizar función get_clinical_research_data para agregar parámetro search_field_type
CREATE OR REPLACE FUNCTION public.get_clinical_research_data(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  doctor_filter uuid DEFAULT NULL,
  diagnosis_filter text DEFAULT NULL,
  search_field_type text DEFAULT 'diagnosis',
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
  encounter_id uuid, patient_id uuid, appointment_id uuid, patient_code text, patient_age integer, 
  patient_gender text, patient_occupation text, has_diabetes_flag boolean, has_hta_flag boolean,
  allergies text, ophthalmic_history text, patient_notes text, encounter_date timestamp with time zone,
  encounter_type text, appointment_type text, doctor_id uuid, doctor_name text, motivo_consulta text,
  diagnosis_summary text, autorefractor text, lensometry text, pio_od_preconsult numeric, 
  pio_os_preconsult numeric, keratometry_od_k1 text, keratometry_od_k2 text, keratometry_os_k1 text,
  keratometry_os_k2 text, photo_od text, photo_oi text, od_text text, os_text text, av_sc_od text,
  av_cc_od text, av_sc_os text, av_cc_os text, ref_subj_sphere_od numeric, ref_subj_cyl_od numeric,
  ref_subj_axis_od integer, ref_subj_av_od text, ref_subj_sphere_os numeric, ref_subj_cyl_os numeric,
  ref_subj_axis_os integer, ref_subj_av_os text, rx_sphere_od numeric, rx_cyl_od numeric,
  rx_axis_od integer, rx_add_od numeric, prescription_notes_od text, rx_sphere_os numeric,
  rx_cyl_os numeric, rx_axis_os integer, rx_add_os numeric, prescription_notes_os text,
  slit_lamp_od text, fundus_od text, pio_exam_od numeric, plan_od text, slit_lamp_os text,
  fundus_os text, pio_exam_os numeric, plan_os text, excursiones_od text, excursiones_os text,
  plan_tratamiento text, cirugias_recomendadas text, estudios_recomendados text, proxima_cita text,
  surgery_id uuid, surgery_type text, surgery_eye text, surgery_consent boolean, surgery_note text,
  surgery_medication text, procedure_id uuid, procedure_type text, procedure_eye text,
  procedure_consent boolean, studies_list text, has_postop_encounter boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base_encounters AS (
    SELECT 
      e.id as encounter_id,
      e.patient_id,
      e.appointment_id,
      e.date as encounter_date,
      e.type::text as encounter_type,
      e.doctor_id,
      e.motivo_consulta,
      e.summary as diagnosis_summary,
      e.plan_tratamiento,
      e.cirugias as cirugias_recomendadas,
      e.estudios as estudios_recomendados,
      e.proxima_cita,
      e.excursiones_od,
      e.excursiones_os,
      a.type::text as appointment_type
    FROM encounters e
    LEFT JOIN appointments a ON a.id = e.appointment_id
    WHERE e.date >= start_date
      AND e.date <= end_date
      AND (doctor_filter IS NULL OR e.doctor_id = doctor_filter)
      AND (appointment_type_filter IS NULL OR a.type = appointment_type_filter)
      AND (
        diagnosis_filter IS NULL OR
        CASE search_field_type
          WHEN 'diagnosis' THEN e.summary ILIKE '%' || diagnosis_filter || '%'
          WHEN 'treatment_plan' THEN e.plan_tratamiento ILIKE '%' || diagnosis_filter || '%'
          WHEN 'surgeries' THEN e.cirugias ILIKE '%' || diagnosis_filter || '%'
          WHEN 'studies' THEN e.estudios ILIKE '%' || diagnosis_filter || '%'
          WHEN 'chief_complaint' THEN e.motivo_consulta ILIKE '%' || diagnosis_filter || '%'
          WHEN 'physical_exam' THEN (
            EXISTS (
              SELECT 1 FROM exam_eye ee 
              WHERE ee.encounter_id = e.id 
              AND (
                ee.slit_lamp ILIKE '%' || diagnosis_filter || '%' OR
                ee.fundus ILIKE '%' || diagnosis_filter || '%'
              )
            )
          )
          ELSE e.summary ILIKE '%' || diagnosis_filter || '%'
        END
      )
  ),
  patient_data AS (
    SELECT
      be.encounter_id,
      p.id as patient_id,
      p.code as patient_code,
      EXTRACT(YEAR FROM AGE(p.dob))::integer as patient_age,
      p.occupation as patient_occupation,
      p.diabetes as has_diabetes_flag,
      p.hta as has_hta_flag,
      p.allergies,
      p.ophthalmic_history,
      p.notes as patient_notes,
      CASE 
        WHEN pr.gender = 'M' THEN 'Masculino'
        WHEN pr.gender = 'F' THEN 'Femenino'
        ELSE 'No especificado'
      END as patient_gender
    FROM base_encounters be
    JOIN patients p ON p.id = be.patient_id
    LEFT JOIN profiles pr ON pr.user_id = be.doctor_id
    WHERE (min_age IS NULL OR EXTRACT(YEAR FROM AGE(p.dob)) >= min_age)
      AND (max_age IS NULL OR EXTRACT(YEAR FROM AGE(p.dob)) <= max_age)
      AND (gender_filter IS NULL OR pr.gender = gender_filter)
      AND (has_diabetes IS NULL OR p.diabetes = has_diabetes)
      AND (has_hta IS NULL OR p.hta = has_hta)
  ),
  appointment_data AS (
    SELECT
      be.encounter_id,
      a.id as appointment_id,
      a.autorefractor,
      a.lensometry,
      a.pio_od as pio_od_preconsult,
      a.pio_os as pio_os_preconsult,
      a.keratometry_od_k1,
      a.keratometry_od_k2,
      a.keratometry_os_k1,
      a.keratometry_os_k2,
      a.photo_od,
      a.photo_oi,
      a.od_text,
      a.os_text
    FROM base_encounters be
    LEFT JOIN appointments a ON a.id = be.appointment_id
    WHERE (has_autorefractor IS NULL OR (has_autorefractor = true AND a.autorefractor IS NOT NULL))
      AND (has_lensometry IS NULL OR (has_lensometry = true AND a.lensometry IS NOT NULL))
      AND (has_keratometry IS NULL OR (has_keratometry = true AND (a.keratometry_od_k1 IS NOT NULL OR a.keratometry_os_k1 IS NOT NULL)))
      AND (has_pio IS NULL OR (has_pio = true AND (a.pio_od IS NOT NULL OR a.pio_os IS NOT NULL)))
      AND (has_fundus_photos IS NULL OR (has_fundus_photos = true AND (a.photo_od IS NOT NULL OR a.photo_oi IS NOT NULL)))
  ),
  exam_data AS (
    SELECT
      be.encounter_id,
      -- OD
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.av_sc END) as av_sc_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.av_cc END) as av_cc_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.ref_subj_sphere END) as ref_subj_sphere_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.ref_subj_cyl END) as ref_subj_cyl_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.ref_subj_axis END) as ref_subj_axis_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.ref_subj_av END) as ref_subj_av_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.rx_sphere END) as rx_sphere_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.rx_cyl END) as rx_cyl_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.rx_axis END) as rx_axis_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.rx_add END) as rx_add_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.prescription_notes END) as prescription_notes_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.slit_lamp END) as slit_lamp_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.fundus END) as fundus_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.iop END) as pio_exam_od,
      MAX(CASE WHEN ee.side::text = 'OD' THEN ee.plan END) as plan_od,
      -- OI (ojo izquierdo)
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.av_sc END) as av_sc_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.av_cc END) as av_cc_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.ref_subj_sphere END) as ref_subj_sphere_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.ref_subj_cyl END) as ref_subj_cyl_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.ref_subj_axis END) as ref_subj_axis_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.ref_subj_av END) as ref_subj_av_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.rx_sphere END) as rx_sphere_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.rx_cyl END) as rx_cyl_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.rx_axis END) as rx_axis_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.rx_add END) as rx_add_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.prescription_notes END) as prescription_notes_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.slit_lamp END) as slit_lamp_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.fundus END) as fundus_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.iop END) as pio_exam_os,
      MAX(CASE WHEN ee.side::text = 'OI' THEN ee.plan END) as plan_os
    FROM base_encounters be
    LEFT JOIN exam_eye ee ON ee.encounter_id = be.encounter_id
    WHERE (has_slit_lamp IS NULL OR (has_slit_lamp = true AND ee.slit_lamp IS NOT NULL))
      AND (has_visual_acuity IS NULL OR (has_visual_acuity = true AND (ee.av_sc IS NOT NULL OR ee.av_cc IS NOT NULL)))
      AND (has_subjective_refraction IS NULL OR (has_subjective_refraction = true AND ee.ref_subj_sphere IS NOT NULL))
      AND (has_prescription IS NULL OR (has_prescription = true AND ee.rx_sphere IS NOT NULL))
    GROUP BY be.encounter_id
  ),
  surgery_data AS (
    SELECT
      be.encounter_id,
      s.id as surgery_id,
      s.tipo_cirugia as surgery_type,
      s.ojo_operar::text as surgery_eye,
      s.consentimiento_informado as surgery_consent,
      s.nota_operatoria as surgery_note,
      s.medicacion as surgery_medication
    FROM base_encounters be
    LEFT JOIN surgeries s ON s.encounter_id = be.encounter_id
    WHERE (surgery_type_filter IS NULL OR s.tipo_cirugia ILIKE '%' || surgery_type_filter || '%')
  ),
  procedure_data AS (
    SELECT
      be.encounter_id,
      pr.id as procedure_id,
      pr.tipo_procedimiento as procedure_type,
      pr.ojo_operar::text as procedure_eye,
      pr.consentimiento_informado as procedure_consent
    FROM base_encounters be
    LEFT JOIN procedures pr ON pr.encounter_id = be.encounter_id
  ),
  studies_data AS (
    SELECT
      be.encounter_id,
      STRING_AGG(st.title || ' (' || st.eye_side::text || ')', ', ') as studies_list
    FROM base_encounters be
    LEFT JOIN studies st ON st.appointment_id = be.appointment_id
    GROUP BY be.encounter_id
  ),
  postop_check AS (
    SELECT DISTINCT
      be.encounter_id,
      EXISTS(
        SELECT 1
        FROM encounters e2
        WHERE e2.patient_id = be.patient_id
          AND e2.date > be.encounter_date
          AND e2.type IN ('consulta', 'posop')
      ) as has_postop_encounter
    FROM base_encounters be
  )
  SELECT
    be.encounter_id,
    pd.patient_id,
    ad.appointment_id,
    pd.patient_code,
    pd.patient_age,
    pd.patient_gender,
    pd.patient_occupation,
    pd.has_diabetes_flag,
    pd.has_hta_flag,
    pd.allergies,
    pd.ophthalmic_history,
    pd.patient_notes,
    be.encounter_date,
    be.encounter_type,
    be.appointment_type,
    be.doctor_id,
    COALESCE(prof.full_name, 'Sin asignar') as doctor_name,
    be.motivo_consulta,
    be.diagnosis_summary,
    ad.autorefractor,
    ad.lensometry,
    ad.pio_od_preconsult,
    ad.pio_os_preconsult,
    ad.keratometry_od_k1,
    ad.keratometry_od_k2,
    ad.keratometry_os_k1,
    ad.keratometry_os_k2,
    ad.photo_od,
    ad.photo_oi,
    ad.od_text,
    ad.os_text,
    ed.av_sc_od,
    ed.av_cc_od,
    ed.av_sc_os,
    ed.av_cc_os,
    ed.ref_subj_sphere_od,
    ed.ref_subj_cyl_od,
    ed.ref_subj_axis_od,
    ed.ref_subj_av_od,
    ed.ref_subj_sphere_os,
    ed.ref_subj_cyl_os,
    ed.ref_subj_axis_os,
    ed.ref_subj_av_os,
    ed.rx_sphere_od,
    ed.rx_cyl_od,
    ed.rx_axis_od,
    ed.rx_add_od,
    ed.prescription_notes_od,
    ed.rx_sphere_os,
    ed.rx_cyl_os,
    ed.rx_axis_os,
    ed.rx_add_os,
    ed.prescription_notes_os,
    ed.slit_lamp_od,
    ed.fundus_od,
    ed.pio_exam_od,
    ed.plan_od,
    ed.slit_lamp_os,
    ed.fundus_os,
    ed.pio_exam_os,
    ed.plan_os,
    be.excursiones_od,
    be.excursiones_os,
    be.plan_tratamiento,
    be.cirugias_recomendadas,
    be.estudios_recomendados,
    be.proxima_cita,
    sd.surgery_id,
    sd.surgery_type,
    sd.surgery_eye,
    sd.surgery_consent,
    sd.surgery_note,
    sd.surgery_medication,
    prd.procedure_id,
    prd.procedure_type,
    prd.procedure_eye,
    prd.procedure_consent,
    std.studies_list,
    pc.has_postop_encounter
  FROM base_encounters be
  INNER JOIN patient_data pd ON pd.encounter_id = be.encounter_id
  LEFT JOIN appointment_data ad ON ad.encounter_id = be.encounter_id
  LEFT JOIN exam_data ed ON ed.encounter_id = be.encounter_id
  LEFT JOIN surgery_data sd ON sd.encounter_id = be.encounter_id
  LEFT JOIN procedure_data prd ON prd.encounter_id = be.encounter_id
  LEFT JOIN studies_data std ON std.encounter_id = be.encounter_id
  LEFT JOIN postop_check pc ON pc.encounter_id = be.encounter_id
  LEFT JOIN profiles prof ON prof.user_id = be.doctor_id
  WHERE (has_preop_data IS NULL OR (
    has_preop_data = true AND (
      ad.autorefractor IS NOT NULL OR
      ad.lensometry IS NOT NULL OR
      ed.av_sc_od IS NOT NULL OR
      ed.av_sc_os IS NOT NULL
    )
  ))
  AND (has_postop_data IS NULL OR (has_postop_data = pc.has_postop_encounter))
  ORDER BY be.encounter_date DESC;
END;
$function$;

-- Actualizar función get_clinical_research_data_by_patient para agregar parámetro search_field_type
CREATE OR REPLACE FUNCTION public.get_clinical_research_data_by_patient(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  doctor_filter uuid DEFAULT NULL,
  diagnosis_filter text DEFAULT NULL,
  search_field_type text DEFAULT 'diagnosis',
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
  patient_id uuid, patient_code text, patient_age integer, patient_gender text, 
  patient_occupation text, has_diabetes_flag boolean, has_hta_flag boolean,
  allergies text, ophthalmic_history text, patient_notes text, visits jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH encounter_data AS (
    SELECT *
    FROM get_clinical_research_data(
      start_date,
      end_date,
      doctor_filter,
      diagnosis_filter,
      search_field_type,
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