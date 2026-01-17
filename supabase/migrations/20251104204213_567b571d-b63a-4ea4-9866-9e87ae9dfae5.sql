-- Crear función RPC para obtener datos de investigación agrupados por paciente
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
      jsonb_build_object(
        'encounter_id', ed.encounter_id,
        'appointment_id', ed.appointment_id,
        'encounter_date', ed.encounter_date,
        'encounter_type', ed.encounter_type,
        'appointment_type', ed.appointment_type,
        'doctor_id', ed.doctor_id,
        'doctor_name', ed.doctor_name,
        'motivo_consulta', ed.motivo_consulta,
        'diagnosis_summary', ed.diagnosis_summary,
        'autorefractor', ed.autorefractor,
        'lensometry', ed.lensometry,
        'pio_od_preconsult', ed.pio_od_preconsult,
        'pio_os_preconsult', ed.pio_os_preconsult,
        'keratometry_od_k1', ed.keratometry_od_k1,
        'keratometry_od_k2', ed.keratometry_od_k2,
        'keratometry_os_k1', ed.keratometry_os_k1,
        'keratometry_os_k2', ed.keratometry_os_k2,
        'photo_od', ed.photo_od,
        'photo_oi', ed.photo_oi,
        'od_text', ed.od_text,
        'os_text', ed.os_text,
        'av_sc_od', ed.av_sc_od,
        'av_cc_od', ed.av_cc_od,
        'av_sc_os', ed.av_sc_os,
        'av_cc_os', ed.av_cc_os,
        'ref_subj_sphere_od', ed.ref_subj_sphere_od,
        'ref_subj_cyl_od', ed.ref_subj_cyl_od,
        'ref_subj_axis_od', ed.ref_subj_axis_od,
        'ref_subj_av_od', ed.ref_subj_av_od,
        'ref_subj_sphere_os', ed.ref_subj_sphere_os,
        'ref_subj_cyl_os', ed.ref_subj_cyl_os,
        'ref_subj_axis_os', ed.ref_subj_axis_os,
        'ref_subj_av_os', ed.ref_subj_av_os,
        'rx_sphere_od', ed.rx_sphere_od,
        'rx_cyl_od', ed.rx_cyl_od,
        'rx_axis_od', ed.rx_axis_od,
        'rx_add_od', ed.rx_add_od,
        'prescription_notes_od', ed.prescription_notes_od,
        'rx_sphere_os', ed.rx_sphere_os,
        'rx_cyl_os', ed.rx_cyl_os,
        'rx_axis_os', ed.rx_axis_os,
        'rx_add_os', ed.rx_add_os,
        'prescription_notes_os', ed.prescription_notes_os,
        'slit_lamp_od', ed.slit_lamp_od,
        'fundus_od', ed.fundus_od,
        'pio_exam_od', ed.pio_exam_od,
        'plan_od', ed.plan_od,
        'slit_lamp_os', ed.slit_lamp_os,
        'fundus_os', ed.fundus_os,
        'pio_exam_os', ed.pio_exam_os,
        'plan_os', ed.plan_os,
        'excursiones_od', ed.excursiones_od,
        'excursiones_os', ed.excursiones_os,
        'plan_tratamiento', ed.plan_tratamiento,
        'cirugias_recomendadas', ed.cirugias_recomendadas,
        'estudios_recomendados', ed.estudios_recomendados,
        'proxima_cita', ed.proxima_cita,
        'surgery_id', ed.surgery_id,
        'surgery_type', ed.surgery_type,
        'surgery_eye', ed.surgery_eye,
        'surgery_consent', ed.surgery_consent,
        'surgery_note', ed.surgery_note,
        'surgery_medication', ed.surgery_medication,
        'procedure_id', ed.procedure_id,
        'procedure_type', ed.procedure_type,
        'procedure_eye', ed.procedure_eye,
        'procedure_consent', ed.procedure_consent,
        'studies_list', ed.studies_list,
        'has_postop_encounter', ed.has_postop_encounter
      )
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