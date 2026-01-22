-- ============================================================
-- ESQUEMA COMPLETO - BDCentrovision
-- ============================================================
-- 
-- Exportado directamente de la base de datos de producción
-- Fecha de exportación: 2026-01-21
-- Proyecto: BDCentrovision (onforxrehgvwzyubbaye)
-- Región: West US (Oregon)
-- 
-- Este archivo contiene TODO lo necesario para recrear la BD:
-- 1. Tipos ENUM personalizados (11)
-- 2. Funciones de base de datos (27+)
-- 3. Definiciones de tablas (47 tablas)
-- 4. Constraints y Foreign Keys
-- 5. Triggers (28)
-- 6. Índices
-- 7. Row Level Security habilitado
-- 8. Políticas RLS (50+)
-- 
-- INSTRUCCIONES DE USO:
-- 1. Crea un nuevo proyecto en Supabase
-- 2. Ve a SQL Editor
-- 3. Ejecuta este archivo COMPLETO
-- 4. Configura los Storage Buckets manualmente
-- 5. Luego importa los datos desde los CSVs
--
-- TABLAS INCLUIDAS (47):
-- app_settings, appointments, audit_logs, branches, cash_closures,
-- consent_signatures, crm_activity_log, crm_activity_read,
-- crm_pipeline_notes, crm_pipeline_stages, crm_pipelines,
-- crm_procedure_types, diagnoses, documents, edge_function_settings,
-- encounters, exam_eye, inventory_items, inventory_lots,
-- inventory_movements, invoice_items, invoices, orders, patients,
-- payments, pending_registrations, procedure_types, procedures,
-- profiles, referring_doctors, results, room_inventory_categories,
-- room_inventory_items, room_inventory_movements, rooms,
-- schedule_blocks, service_prices, studies, study_files,
-- study_types, suppliers, surgeries, surgery_files, surgery_types,
-- templates, user_branches, user_roles
-- ============================================================


CREATE OR REPLACE FUNCTION "public"."create_inventory_movement_from_invoice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  item_branch_id uuid;
BEGIN
  IF NEW.item_type = 'producto' AND NEW.item_id IS NOT NULL THEN
    SELECT branch_id INTO item_branch_id
    FROM public.inventory_items
    WHERE id = NEW.item_id;
    
    IF item_branch_id IS NULL THEN
      RAISE WARNING 'No se pudo obtener branch_id para inventory_item %', NEW.item_id;
      RETURN NEW;
    END IF;
    
    INSERT INTO public.inventory_movements (
      item_id,
      branch_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      NEW.item_id,
      item_branch_id,
      'salida',
      NEW.quantity,
      'venta',
      NEW.invoice_id,
      'Venta automática - Factura',
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_inventory_movement_from_invoice"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_doctor_patient_update_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  is_doctor boolean;
BEGIN
  is_doctor := public.has_role(auth.uid(), 'doctor');

  IF is_doctor THEN
    IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
       OR (NEW.last_name IS DISTINCT FROM OLD.last_name)
       OR (NEW.phone IS DISTINCT FROM OLD.phone)
       OR (NEW.email IS DISTINCT FROM OLD.email)
       OR (NEW.address IS DISTINCT FROM OLD.address)
       OR (NEW.dob IS DISTINCT FROM OLD.dob)
       OR (NEW.code IS DISTINCT FROM OLD.code) THEN
      RAISE EXCEPTION 'Los médicos solo pueden actualizar antecedentes y alertas médicas del paciente.';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_doctor_patient_update_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  next_number INTEGER;
  new_invoice_number TEXT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(invoice_number FROM 6) AS INTEGER)), 
    0
  ) + 1 INTO next_number
  FROM public.invoices
  WHERE invoice_number ~ '^FACT-[0-9]+$';
  
  new_invoice_number := 'FACT-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN new_invoice_number;
END;
$_$;


ALTER FUNCTION "public"."generate_invoice_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_number_for_branch"("p_branch_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  branch_code TEXT;
  prefix TEXT;
  next_number INTEGER;
  new_invoice_number TEXT;
BEGIN
  -- Obtener código de sucursal
  SELECT code INTO branch_code
  FROM branches
  WHERE id = p_branch_id;
  
  -- Definir prefijo según sucursal
  CASE branch_code
    WHEN 'central' THEN prefix := 'CV';
    WHEN 'santa_lucia' THEN prefix := 'SL';
    ELSE prefix := 'XX';
  END CASE;
  
  -- Obtener siguiente número para esta sucursal (buscando facturas con el nuevo formato)
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(invoice_number FROM 4) AS INTEGER)), 0
  ) + 1 INTO next_number
  FROM invoices
  WHERE branch_id = p_branch_id
  AND invoice_number ~ ('^' || prefix || '-[0-9]+$');
  
  -- Generar número con formato PREFIX-0001
  new_invoice_number := prefix || '-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN new_invoice_number;
END;
$_$;


ALTER FUNCTION "public"."generate_invoice_number_for_branch"("p_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_clinical_research_data"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid" DEFAULT NULL::"uuid", "diagnosis_filter" "text" DEFAULT NULL::"text", "search_field_type" "text" DEFAULT 'all'::"text", "surgery_type_filter" "text" DEFAULT NULL::"text", "appointment_type_filter" "public"."appointment_type" DEFAULT NULL::"public"."appointment_type", "has_preop_data" boolean DEFAULT NULL::boolean, "has_postop_data" boolean DEFAULT NULL::boolean, "min_age" integer DEFAULT NULL::integer, "max_age" integer DEFAULT NULL::integer, "gender_filter" "text" DEFAULT NULL::"text", "has_diabetes" boolean DEFAULT NULL::boolean, "has_hta" boolean DEFAULT NULL::boolean, "has_autorefractor" boolean DEFAULT NULL::boolean, "has_lensometry" boolean DEFAULT NULL::boolean, "has_keratometry" boolean DEFAULT NULL::boolean, "has_pio" boolean DEFAULT NULL::boolean, "has_fundus_photos" boolean DEFAULT NULL::boolean, "has_slit_lamp" boolean DEFAULT NULL::boolean, "has_visual_acuity" boolean DEFAULT NULL::boolean, "has_subjective_refraction" boolean DEFAULT NULL::boolean, "has_prescription" boolean DEFAULT NULL::boolean) RETURNS TABLE("encounter_id" "uuid", "patient_id" "uuid", "appointment_id" "uuid", "patient_code" "text", "patient_age" integer, "patient_gender" "text", "patient_occupation" "text", "has_diabetes_flag" boolean, "has_hta_flag" boolean, "allergies" "text", "ophthalmic_history" "text", "patient_notes" "text", "encounter_date" timestamp with time zone, "encounter_type" "text", "appointment_type" "text", "doctor_id" "uuid", "doctor_name" "text", "motivo_consulta" "text", "diagnosis_summary" "text", "autorefractor" "text", "lensometry" "text", "pio_od_preconsult" numeric, "pio_os_preconsult" numeric, "keratometry_od_k1" "text", "keratometry_od_k2" "text", "keratometry_os_k1" "text", "keratometry_os_k2" "text", "photo_od" "text", "photo_oi" "text", "od_text" "text", "os_text" "text", "av_sc_od" "text", "av_cc_od" "text", "av_sc_os" "text", "av_cc_os" "text", "ref_subj_sphere_od" numeric, "ref_subj_cyl_od" numeric, "ref_subj_axis_od" integer, "ref_subj_av_od" "text", "ref_subj_sphere_os" numeric, "ref_subj_cyl_os" numeric, "ref_subj_axis_os" integer, "ref_subj_av_os" "text", "rx_sphere_od" numeric, "rx_cyl_od" numeric, "rx_axis_od" integer, "rx_add_od" numeric, "prescription_notes_od" "text", "rx_sphere_os" numeric, "rx_cyl_os" numeric, "rx_axis_os" integer, "rx_add_os" numeric, "prescription_notes_os" "text", "slit_lamp_od" "text", "fundus_od" "text", "pio_exam_od" numeric, "plan_od" "text", "slit_lamp_os" "text", "fundus_os" "text", "pio_exam_os" numeric, "plan_os" "text", "excursiones_od" "text", "excursiones_os" "text", "plan_tratamiento" "text", "cirugias_recomendadas" "text", "estudios_recomendados" "text", "proxima_cita" "text", "surgery_id" "uuid", "surgery_type" "text", "surgery_eye" "text", "surgery_consent" boolean, "surgery_note" "text", "surgery_medication" "text", "procedure_id" "uuid", "procedure_type" "text", "procedure_eye" "text", "procedure_consent" boolean, "studies_list" "text", "has_postop_encounter" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
          WHEN 'all' THEN (
            e.summary ~* ('\y' || diagnosis_filter || '\y') OR
            e.plan_tratamiento ~* ('\y' || diagnosis_filter || '\y') OR
            e.cirugias ~* ('\y' || diagnosis_filter || '\y') OR
            e.estudios ~* ('\y' || diagnosis_filter || '\y') OR
            e.motivo_consulta ~* ('\y' || diagnosis_filter || '\y') OR
            EXISTS (
              SELECT 1 FROM exam_eye ee 
              WHERE ee.encounter_id = e.id 
              AND (
                ee.slit_lamp ~* ('\y' || diagnosis_filter || '\y') OR
                ee.fundus ~* ('\y' || diagnosis_filter || '\y')
              )
            )
          )
          WHEN 'diagnosis' THEN e.summary ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'treatment_plan' THEN e.plan_tratamiento ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'surgeries' THEN e.cirugias ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'studies' THEN e.estudios ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'chief_complaint' THEN e.motivo_consulta ~* ('\y' || diagnosis_filter || '\y')
          WHEN 'physical_exam' THEN (
            EXISTS (
              SELECT 1 FROM exam_eye ee 
              WHERE ee.encounter_id = e.id 
              AND (
                ee.slit_lamp ~* ('\y' || diagnosis_filter || '\y') OR
                ee.fundus ~* ('\y' || diagnosis_filter || '\y')
              )
            )
          )
          ELSE e.summary ~* ('\y' || diagnosis_filter || '\y')
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
    WHERE (surgery_type_filter IS NULL OR s.tipo_cirugia ~* ('\y' || surgery_type_filter || '\y'))
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
$$;


ALTER FUNCTION "public"."get_clinical_research_data"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "diagnosis_filter" "text", "search_field_type" "text", "surgery_type_filter" "text", "appointment_type_filter" "public"."appointment_type", "has_preop_data" boolean, "has_postop_data" boolean, "min_age" integer, "max_age" integer, "gender_filter" "text", "has_diabetes" boolean, "has_hta" boolean, "has_autorefractor" boolean, "has_lensometry" boolean, "has_keratometry" boolean, "has_pio" boolean, "has_fundus_photos" boolean, "has_slit_lamp" boolean, "has_visual_acuity" boolean, "has_subjective_refraction" boolean, "has_prescription" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_clinical_research_data_by_patient"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid" DEFAULT NULL::"uuid", "diagnosis_filter" "text" DEFAULT NULL::"text", "search_field_type" "text" DEFAULT 'all'::"text", "surgery_type_filter" "text" DEFAULT NULL::"text", "appointment_type_filter" "public"."appointment_type" DEFAULT NULL::"public"."appointment_type", "has_preop_data" boolean DEFAULT NULL::boolean, "has_postop_data" boolean DEFAULT NULL::boolean, "min_age" integer DEFAULT NULL::integer, "max_age" integer DEFAULT NULL::integer, "gender_filter" "text" DEFAULT NULL::"text", "has_diabetes" boolean DEFAULT NULL::boolean, "has_hta" boolean DEFAULT NULL::boolean, "has_autorefractor" boolean DEFAULT NULL::boolean, "has_lensometry" boolean DEFAULT NULL::boolean, "has_keratometry" boolean DEFAULT NULL::boolean, "has_pio" boolean DEFAULT NULL::boolean, "has_fundus_photos" boolean DEFAULT NULL::boolean, "has_slit_lamp" boolean DEFAULT NULL::boolean, "has_visual_acuity" boolean DEFAULT NULL::boolean, "has_subjective_refraction" boolean DEFAULT NULL::boolean, "has_prescription" boolean DEFAULT NULL::boolean) RETURNS TABLE("patient_id" "uuid", "patient_code" "text", "patient_age" integer, "patient_gender" "text", "patient_occupation" "text", "has_diabetes_flag" boolean, "has_hta_flag" boolean, "allergies" "text", "ophthalmic_history" "text", "patient_notes" "text", "visits" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH encounter_data AS (
    SELECT *
    FROM get_clinical_research_data(
      start_date, end_date, doctor_filter, diagnosis_filter, search_field_type,
      surgery_type_filter, appointment_type_filter, has_preop_data, has_postop_data,
      min_age, max_age, gender_filter, has_diabetes, has_hta, has_autorefractor,
      has_lensometry, has_keratometry, has_pio, has_fundus_photos, has_slit_lamp,
      has_visual_acuity, has_subjective_refraction, has_prescription
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
    jsonb_agg(to_jsonb(ed.*) ORDER BY ed.encounter_date ASC) as visits
  FROM encounter_data ed
  GROUP BY 
    ed.patient_id, ed.patient_code, ed.patient_age, ed.patient_gender,
    ed.patient_occupation, ed.has_diabetes_flag, ed.has_hta_flag,
    ed.allergies, ed.ophthalmic_history, ed.patient_notes
  ORDER BY ed.patient_code;
END;
$$;


ALTER FUNCTION "public"."get_clinical_research_data_by_patient"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "diagnosis_filter" "text", "search_field_type" "text", "surgery_type_filter" "text", "appointment_type_filter" "public"."appointment_type", "has_preop_data" boolean, "has_postop_data" boolean, "min_age" integer, "max_age" integer, "gender_filter" "text", "has_diabetes" boolean, "has_hta" boolean, "has_autorefractor" boolean, "has_lensometry" boolean, "has_keratometry" boolean, "has_pio" boolean, "has_fundus_photos" boolean, "has_slit_lamp" boolean, "has_visual_acuity" boolean, "has_subjective_refraction" boolean, "has_prescription" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_clinical_stats_with_revenue"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("tipo_cita" "text", "doctor_id" "uuid", "doctor_name" "text", "cantidad" bigint, "pacientes_unicos" bigint, "revenue_real" numeric, "revenue_estimado" numeric, "revenue_total" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    SELECT 
      a.id as appointment_id,
      a.type::text as tipo_cita,
      a.doctor_id,
      COALESCE(p.full_name, 'Sin asignar') as doctor_name,
      a.patient_id,
      a.starts_at,
      i.id as invoice_id,
      i.total_amount as invoice_amount
    FROM appointments a
    LEFT JOIN profiles p ON p.user_id = a.doctor_id
    LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
    WHERE a.status = 'done'
      AND a.starts_at >= start_date
      AND a.starts_at <= end_date
      AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
  ),
  service_prices_lookup AS (
    SELECT 
      service_type::text,
      AVG(price) as avg_price
    FROM service_prices
    WHERE active = true
    GROUP BY service_type
  ),
  calculated_revenue AS (
    SELECT 
      ad.tipo_cita,
      ad.doctor_id,
      ad.doctor_name,
      ad.appointment_id,
      ad.patient_id,
      CASE 
        WHEN ad.invoice_id IS NOT NULL THEN ad.invoice_amount
        ELSE 0
      END as revenue_real,
      CASE 
        WHEN ad.invoice_id IS NULL THEN COALESCE(sp.avg_price, 0)
        ELSE 0
      END as revenue_estimado
    FROM appointment_data ad
    LEFT JOIN service_prices_lookup sp ON sp.service_type = ad.tipo_cita
  )
  SELECT 
    cr.tipo_cita,
    cr.doctor_id,
    cr.doctor_name,
    COUNT(cr.appointment_id)::bigint as cantidad,
    COUNT(DISTINCT cr.patient_id)::bigint as pacientes_unicos,
    COALESCE(SUM(cr.revenue_real), 0)::numeric as revenue_real,
    COALESCE(SUM(cr.revenue_estimado), 0)::numeric as revenue_estimado,
    COALESCE(SUM(cr.revenue_real + cr.revenue_estimado), 0)::numeric as revenue_total
  FROM calculated_revenue cr
  GROUP BY cr.tipo_cita, cr.doctor_id, cr.doctor_name
  ORDER BY cr.doctor_name, cr.tipo_cita;
END;
$$;


ALTER FUNCTION "public"."get_clinical_stats_with_revenue"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_clinical_stats_with_revenue_v2"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid" DEFAULT NULL::"uuid", "branch_filter" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("tipo_cita" "text", "doctor_id" "uuid", "doctor_name" "text", "cantidad" bigint, "pacientes_unicos" bigint, "revenue_real" numeric, "revenue_estimado" numeric, "revenue_total" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    SELECT 
      a.id as appointment_id,
      a.type::text as tipo_cita,
      a.doctor_id,
      COALESCE(p.full_name, 'Sin asignar') as doctor_name,
      a.patient_id,
      a.starts_at,
      i.id as invoice_id,
      i.total_amount as invoice_amount
    FROM appointments a
    LEFT JOIN profiles p ON p.user_id = a.doctor_id
    LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
    WHERE a.status = 'done'
      AND a.starts_at >= start_date
      AND a.starts_at <= end_date
      AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
      AND (branch_filter IS NULL OR a.branch_id = branch_filter)
  ),
  service_prices_lookup AS (
    SELECT 
      service_type::text,
      AVG(price) as avg_price
    FROM service_prices
    WHERE active = true
    GROUP BY service_type
  ),
  calculated_revenue AS (
    SELECT 
      ad.tipo_cita,
      ad.doctor_id,
      ad.doctor_name,
      ad.appointment_id,
      ad.patient_id,
      CASE 
        WHEN ad.invoice_id IS NOT NULL THEN ad.invoice_amount
        ELSE 0
      END as revenue_real,
      CASE 
        WHEN ad.invoice_id IS NULL THEN COALESCE(sp.avg_price, 0)
        ELSE 0
      END as revenue_estimado
    FROM appointment_data ad
    LEFT JOIN service_prices_lookup sp ON sp.service_type = ad.tipo_cita
  )
  SELECT 
    cr.tipo_cita,
    cr.doctor_id,
    cr.doctor_name,
    COUNT(cr.appointment_id)::bigint as cantidad,
    COUNT(DISTINCT cr.patient_id)::bigint as pacientes_unicos,
    COALESCE(SUM(cr.revenue_real), 0)::numeric as revenue_real,
    COALESCE(SUM(cr.revenue_estimado), 0)::numeric as revenue_estimado,
    COALESCE(SUM(cr.revenue_real + cr.revenue_estimado), 0)::numeric as revenue_total
  FROM calculated_revenue cr
  GROUP BY cr.tipo_cita, cr.doctor_id, cr.doctor_name
  ORDER BY cr.doctor_name, cr.tipo_cita;
END;
$$;


ALTER FUNCTION "public"."get_clinical_stats_with_revenue_v2"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "branch_filter" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_doctor_activity_detail"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid" DEFAULT NULL::"uuid", "appointment_type_filter" "public"."appointment_type" DEFAULT NULL::"public"."appointment_type") RETURNS TABLE("appointment_id" "uuid", "patient_id" "uuid", "patient_code" "text", "patient_name" "text", "appointment_type" "text", "appointment_date" timestamp with time zone, "doctor_id" "uuid", "doctor_name" "text", "invoice_id" "uuid", "invoice_amount" numeric, "is_invoiced" boolean, "estimated_price" numeric, "total_revenue" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    SELECT 
      a.id as appointment_id,
      a.patient_id,
      p.code as patient_code,
      CONCAT(p.first_name, ' ', p.last_name) as patient_name,
      a.type::text as appointment_type,
      a.starts_at as appointment_date,
      a.doctor_id,
      COALESCE(prof.full_name, 'Sin asignar') as doctor_name,
      i.id as invoice_id,
      i.total_amount as invoice_amount
    FROM appointments a
    INNER JOIN patients p ON p.id = a.patient_id
    LEFT JOIN profiles prof ON prof.user_id = a.doctor_id
    LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
    WHERE a.status = 'done'
      AND a.starts_at >= start_date
      AND a.starts_at <= end_date
      AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
      AND (appointment_type_filter IS NULL OR a.type = appointment_type_filter)
  ),
  service_prices_lookup AS (
    SELECT 
      service_type::text,
      AVG(price) as avg_price
    FROM service_prices
    WHERE active = true
    GROUP BY service_type
  )
  SELECT 
    ad.appointment_id,
    ad.patient_id,
    ad.patient_code,
    ad.patient_name,
    ad.appointment_type,
    ad.appointment_date,
    ad.doctor_id,
    ad.doctor_name,
    ad.invoice_id,
    ad.invoice_amount,
    (ad.invoice_id IS NOT NULL) as is_invoiced,
    COALESCE(sp.avg_price, 0)::numeric as estimated_price,
    CASE 
      WHEN ad.invoice_id IS NOT NULL THEN ad.invoice_amount
      ELSE COALESCE(sp.avg_price, 0)
    END::numeric as total_revenue
  FROM appointment_data ad
  LEFT JOIN service_prices_lookup sp ON sp.service_type = ad.appointment_type
  ORDER BY ad.appointment_date DESC, ad.patient_name;
END;
$$;


ALTER FUNCTION "public"."get_doctor_activity_detail"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "appointment_type_filter" "public"."appointment_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_doctor_activity_detail_v4"("start_date" "date", "end_date" "date", "doctor_filter" "uuid" DEFAULT NULL::"uuid", "branch_filter" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("appointment_id" "uuid", "patient_code" "text", "patient_name" "text", "appointment_type" "text", "appointment_date" timestamp with time zone, "is_invoiced" boolean, "invoice_amount" numeric, "is_courtesy" boolean, "surgery_type" "text", "procedure_type" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as appointment_id,
    COALESCE(p.code, '') as patient_code,
    CONCAT(p.first_name, ' ', p.last_name) as patient_name,
    a.type::text as appointment_type,
    a.starts_at as appointment_date,
    i.id IS NOT NULL as is_invoiced,
    COALESCE(i.total_amount, 0::numeric) as invoice_amount,
    COALESCE(a.is_courtesy, false) as is_courtesy,
    COALESCE(s.tipo_cirugia, '') as surgery_type,
    COALESCE(proc.tipo_procedimiento, '') as procedure_type
  FROM appointments a
  INNER JOIN patients p ON p.id = a.patient_id
  LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
  LEFT JOIN encounters e ON e.appointment_id = a.id
  LEFT JOIN surgeries s ON s.encounter_id = e.id
  LEFT JOIN procedures proc ON proc.encounter_id = e.id
  WHERE a.status = 'done'
    AND a.starts_at::date >= start_date
    AND a.starts_at::date <= end_date
    AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
    AND (branch_filter IS NULL OR a.branch_id = branch_filter)
  ORDER BY a.starts_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_doctor_activity_detail_v4"("start_date" "date", "end_date" "date", "doctor_filter" "uuid", "branch_filter" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) RETURNS TABLE("category" "text", "product_name" "text", "cantidad" numeric, "total" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    COALESCE(inv.category, 'Otros') as category,
    ii.description as product_name,
    SUM(ii.quantity)::numeric as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN inventory_items inv ON inv.id = ii.item_id
  WHERE ii.item_type = 'producto'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY inv.category, ii.description
  ORDER BY inv.category, ii.description;
$$;


ALTER FUNCTION "public"."get_inventory_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("item_id" "uuid", "item_name" "text", "total_quantity" bigint, "total_revenue" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    iit.item_id::uuid,
    iit.description AS item_name,
    SUM(iit.quantity)::bigint AS total_quantity,
    SUM(iit.subtotal)::numeric AS total_revenue
  FROM invoice_items iit
  JOIN invoices i ON i.id = iit.invoice_id
  WHERE i.created_at >= start_date::timestamptz
    AND i.created_at < (end_date::date + interval '1 day')::timestamptz
    AND iit.item_type = 'producto'
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY iit.item_id, iit.description
  ORDER BY total_revenue DESC
  LIMIT 10;
END;
$$;


ALTER FUNCTION "public"."get_inventory_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) RETURNS TABLE("category" "text", "cantidad" bigint, "total" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    inv.category,
    COUNT(ii.id)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN inventory_items inv ON ii.item_id = inv.id
  JOIN invoices i ON ii.invoice_id = i.id
  WHERE ii.item_type = 'producto'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY inv.category;
$$;


ALTER FUNCTION "public"."get_inventory_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payment_methods"("start_date" timestamp with time zone, "end_date" timestamp with time zone) RETURNS TABLE("payment_method" "text", "cantidad" bigint, "total" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    payment_method,
    COUNT(*)::bigint as cantidad,
    COALESCE(SUM(amount), 0)::numeric as total
  FROM payments
  WHERE created_at >= start_date
    AND created_at <= end_date
    AND status = 'completado'
  GROUP BY payment_method;
$$;


ALTER FUNCTION "public"."get_payment_methods"("start_date" timestamp with time zone, "end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) RETURNS TABLE("service_type" "text", "service_name" "text", "cantidad" bigint, "total" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    COALESCE(sp.service_type::text, 'otro') as service_type,
    ii.description as service_name,
    COUNT(ii.id)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN service_prices sp ON sp.id = ii.item_id
  WHERE ii.item_type = 'servicio'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY sp.service_type, ii.description
  ORDER BY sp.service_type, ii.description;
$$;


ALTER FUNCTION "public"."get_service_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("item_id" "uuid", "item_name" "text", "total_quantity" bigint, "total_revenue" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    iit.item_id::uuid,
    iit.description AS item_name,
    SUM(iit.quantity)::bigint AS total_quantity,
    SUM(iit.subtotal)::numeric AS total_revenue
  FROM invoice_items iit
  JOIN invoices i ON i.id = iit.invoice_id
  WHERE i.created_at >= start_date::timestamptz
    AND i.created_at < (end_date::date + interval '1 day')::timestamptz
    AND iit.item_type = 'servicio'
    AND (branch_filter IS NULL OR i.branch_id = branch_filter)
  GROUP BY iit.item_id, iit.description
  ORDER BY total_revenue DESC
  LIMIT 10;
END;
$$;


ALTER FUNCTION "public"."get_service_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) RETURNS TABLE("service_type" "text", "cantidad" bigint, "total" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    sp.service_type::text,
    COUNT(ii.id)::bigint as cantidad,
    COALESCE(SUM(ii.subtotal), 0)::numeric as total
  FROM invoice_items ii
  JOIN service_prices sp ON ii.item_id = sp.id
  JOIN invoices i ON ii.invoice_id = i.id
  WHERE ii.item_type = 'servicio'
    AND i.created_at >= start_date
    AND i.created_at <= end_date
    AND i.status != 'cancelada'
  GROUP BY sp.service_type;
$$;


ALTER FUNCTION "public"."get_service_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_storage_stats"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
  stats json;
BEGIN
  SELECT json_agg(bucket_stats)
  INTO stats
  FROM (
    SELECT 
      bucket_id,
      COUNT(*)::int as total_files,
      COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint as total_bytes
    FROM storage.objects
    WHERE bucket_id IN ('documents', 'results', 'studies', 'surgeries')
    GROUP BY bucket_id
  ) bucket_stats;
  
  RETURN COALESCE(stats, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."get_storage_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("_user_id" "uuid") RETURNS "public"."app_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;


ALTER FUNCTION "public"."get_user_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_crm_access"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = _user_id
    AND role IN ('admin', 'reception', 'caja', 'contabilidad', 'nurse', 'diagnostico')
  )
$$;


ALTER FUNCTION "public"."has_crm_access"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_crm_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  activity_type TEXT;
  from_stage TEXT;
  to_stage TEXT;
  reason_text TEXT;
BEGIN
  -- Determinar el tipo de actividad
  IF TG_OP = 'INSERT' THEN
    activity_type := 'pipeline_created';
    from_stage := NULL;
    to_stage := NEW.current_stage;
    reason_text := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Verificar si cambió el estado a completado
    IF NEW.status = 'completado' AND OLD.status != 'completado' THEN
      activity_type := 'pipeline_completed';
      from_stage := OLD.current_stage;
      to_stage := NEW.current_stage;
      reason_text := NULL;
    -- Verificar si cambió el estado a cancelado
    ELSIF NEW.status = 'cancelado' AND OLD.status != 'cancelado' THEN
      activity_type := 'pipeline_cancelled';
      from_stage := OLD.current_stage;
      to_stage := NULL;
      reason_text := NEW.cancellation_reason;
    -- Verificar si cambió la etapa
    ELSIF NEW.current_stage != OLD.current_stage THEN
      activity_type := 'stage_changed';
      from_stage := OLD.current_stage;
      to_stage := NEW.current_stage;
      reason_text := NULL;
    ELSE
      -- No registrar otros tipos de actualizaciones
      RETURN NEW;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  -- Insertar el registro de actividad
  INSERT INTO crm_activity_log (
    pipeline_id,
    activity_type,
    from_stage,
    to_stage,
    reason,
    created_by,
    branch_id
  ) VALUES (
    NEW.id,
    activity_type,
    from_stage,
    to_stage,
    reason_text,
    auth.uid(),
    NEW.branch_id
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_crm_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_invoice_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  total_paid DECIMAL(10,2);
  invoice_total DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id AND status = 'completado';
  
  SELECT total_amount INTO invoice_total
  FROM public.invoices
  WHERE id = NEW.invoice_id;
  
  UPDATE public.invoices
  SET 
    balance_due = invoice_total - total_paid,
    status = CASE 
      WHEN (invoice_total - total_paid) <= 0 THEN 'pagada'
      ELSE 'pendiente'
    END,
    updated_at = now()
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_invoice_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_item_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.movement_type = 'entrada' THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock + ABS(NEW.quantity),
        updated_at = now()
    WHERE id = NEW.item_id;
    
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
      SET quantity = quantity + ABS(NEW.quantity)
      WHERE id = NEW.lot_id;
    END IF;
    
  ELSIF NEW.movement_type IN ('salida', 'cortesia') THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock - ABS(NEW.quantity),
        updated_at = now()
    WHERE id = NEW.item_id;
    
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
      SET quantity = quantity - ABS(NEW.quantity)
      WHERE id = NEW.lot_id;
    END IF;
    
  ELSIF NEW.movement_type = 'ajuste' THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock + NEW.quantity,
        updated_at = now()
    WHERE id = NEW.item_id;
    
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.inventory_lots
      SET quantity = quantity + NEW.quantity
      WHERE id = NEW.lot_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_item_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "room_id" "uuid",
    "doctor_id" "uuid",
    "external_doctor_name" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "type" "public"."appointment_type" DEFAULT 'consulta'::"public"."appointment_type" NOT NULL,
    "status" "public"."appointment_status" DEFAULT 'scheduled'::"public"."appointment_status" NOT NULL,
    "reason" "text",
    "reception_notes" "text",
    "is_courtesy" boolean DEFAULT false,
    "autorefractor" "text",
    "lensometry" "text",
    "pio_od" numeric,
    "pio_os" numeric,
    "keratometry_od_k1" "text",
    "keratometry_od_k2" "text",
    "keratometry_od_axis" "text",
    "keratometry_os_k1" "text",
    "keratometry_os_k2" "text",
    "keratometry_os_axis" "text",
    "photo_od" "text",
    "photo_oi" "text",
    "od_text" "text",
    "os_text" "text",
    "post_op_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "target_table" "text",
    "target_id" "text",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "public"."branch_code",
    "address" "text",
    "phone" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "theme_primary_hsl" "text" DEFAULT '221 74% 54%'::"text",
    "pdf_header_url" "text"
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_closures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "closure_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "total_invoiced" numeric DEFAULT 0 NOT NULL,
    "total_collected" numeric DEFAULT 0 NOT NULL,
    "total_pending" numeric DEFAULT 0 NOT NULL,
    "total_discounts" numeric DEFAULT 0,
    "consultas_total" numeric DEFAULT 0,
    "consultas_count" integer DEFAULT 0,
    "cirugias_total" numeric DEFAULT 0,
    "cirugias_count" integer DEFAULT 0,
    "procedimientos_total" numeric DEFAULT 0,
    "procedimientos_count" integer DEFAULT 0,
    "estudios_total" numeric DEFAULT 0,
    "estudios_count" integer DEFAULT 0,
    "inventory_total" numeric DEFAULT 0,
    "inventory_count" integer DEFAULT 0,
    "efectivo_total" numeric DEFAULT 0,
    "tarjeta_total" numeric DEFAULT 0,
    "transferencia_total" numeric DEFAULT 0,
    "cheque_total" numeric DEFAULT 0,
    "otro_total" numeric DEFAULT 0,
    "detailed_data" "jsonb",
    "closed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cash_closures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consent_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "surgery_id" "uuid",
    "procedure_id" "uuid",
    "patient_id" "uuid" NOT NULL,
    "patient_signature" "text" NOT NULL,
    "patient_name" "text" NOT NULL,
    "witness_signature" "text" NOT NULL,
    "witness_name" "text" NOT NULL,
    "consent_text" "text" NOT NULL,
    "pdf_url" "text",
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "signed_by" "uuid",
    "branch_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."consent_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "activity_type" "text" NOT NULL,
    "from_stage" "text",
    "to_stage" "text",
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_activity_read" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_activity_read" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_pipeline_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_pipeline_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_pipeline_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "stage_name" "text" NOT NULL,
    "stage_order" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "amount" numeric,
    "notes" "text",
    "completed_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_pipeline_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_pipelines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "procedure_type_id" "uuid" NOT NULL,
    "doctor_id" "uuid",
    "eye_side" "public"."eye_side" DEFAULT 'OU'::"public"."eye_side" NOT NULL,
    "current_stage" "text" DEFAULT 'lead'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "notes" "text",
    "cancellation_reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_pipelines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_procedure_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#3B82F6'::"text" NOT NULL,
    "default_stages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "display_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_procedure_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diagnoses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "encounter_id" "uuid" NOT NULL,
    "code" "text",
    "label" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."diagnoses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "encounter_id" "uuid" NOT NULL,
    "kind" "public"."document_kind" NOT NULL,
    "file_path" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."edge_function_settings" (
    "function_name" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "disabled_by" "uuid",
    "disabled_at" timestamp with time zone,
    "disabled_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."edge_function_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."encounters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "doctor_id" "uuid",
    "date" timestamp with time zone DEFAULT "now"(),
    "type" "public"."encounter_type" DEFAULT 'consulta'::"public"."encounter_type" NOT NULL,
    "motivo_consulta" "text",
    "summary" "text" DEFAULT ''::"text",
    "plan_tratamiento" "text",
    "cirugias" "text",
    "estudios" "text",
    "proxima_cita" "text",
    "excursiones_od" "text",
    "excursiones_os" "text",
    "interpretacion_resultados" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."encounters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exam_eye" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "encounter_id" "uuid" NOT NULL,
    "side" "public"."eye_side" NOT NULL,
    "av_sc" "text",
    "av_cc" "text",
    "ref_sphere" numeric,
    "ref_cyl" numeric,
    "ref_axis" integer,
    "ref_subj_sphere" numeric,
    "ref_subj_cyl" numeric,
    "ref_subj_axis" integer,
    "ref_subj_av" "text",
    "rx_sphere" numeric,
    "rx_cyl" numeric,
    "rx_axis" integer,
    "rx_add" numeric,
    "prescription_notes" "text",
    "iop" numeric,
    "slit_lamp" "text",
    "fundus" "text",
    "plan" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."exam_eye" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "code" "text",
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "unit_price" numeric NOT NULL,
    "cost_price" numeric DEFAULT 0,
    "current_stock" numeric DEFAULT 0 NOT NULL,
    "min_stock" numeric DEFAULT 0,
    "requires_lot" boolean DEFAULT false NOT NULL,
    "supplier_id" "uuid",
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_lots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "lot_number" "text" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "expiry_date" "date",
    "cost_price" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_lots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "lot_id" "uuid",
    "movement_type" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "item_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit_price" numeric NOT NULL,
    "subtotal" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "branch_id" "uuid" NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "balance_due" numeric DEFAULT 0 NOT NULL,
    "discount_type" "text",
    "discount_value" numeric DEFAULT 0,
    "discount_reason" "text",
    "notes" "text",
    "status" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "encounter_id" "uuid" NOT NULL,
    "kind" "public"."order_kind" NOT NULL,
    "priority" "public"."order_priority" DEFAULT 'normal'::"public"."order_priority" NOT NULL,
    "side" "public"."eye_side" DEFAULT 'OU'::"public"."eye_side",
    "status" "public"."order_status" DEFAULT 'ordered'::"public"."order_status" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "dob" "date",
    "phone" "text",
    "email" "text",
    "address" "text",
    "occupation" "text",
    "diabetes" boolean DEFAULT false,
    "hta" boolean DEFAULT false,
    "allergies" "text" DEFAULT ''::"text",
    "ophthalmic_history" "text" DEFAULT ''::"text",
    "notes" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "payment_method" "text" NOT NULL,
    "reference" "text",
    "notes" "text",
    "status" "text" DEFAULT 'completado'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "specialty" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pending_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."procedure_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."procedure_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."procedures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "encounter_id" "uuid" NOT NULL,
    "tipo_procedimiento" "text" NOT NULL,
    "ojo_operar" "public"."eye_side" DEFAULT 'OU'::"public"."eye_side" NOT NULL,
    "consentimiento_informado" boolean DEFAULT false NOT NULL,
    "medicacion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "consent_signature_id" "uuid"
);


ALTER TABLE "public"."procedures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "specialty" "text",
    "gender" "text" DEFAULT 'M'::"text",
    "is_visible_in_dashboard" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referring_doctors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_internal" boolean DEFAULT false,
    "internal_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "active" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referring_doctors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "mime_type" "text",
    "side" "public"."eye_side" DEFAULT 'OU'::"public"."eye_side",
    "extracted_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_inventory_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "parent_id" "uuid",
    "display_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."room_inventory_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "brand" "text",
    "specification" "text",
    "unit" "text",
    "current_stock" numeric DEFAULT 0 NOT NULL,
    "min_stock" numeric DEFAULT 0,
    "notes" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."room_inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "notes" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."room_inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "public"."room_kind" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "room_id" "uuid",
    "doctor_id" "uuid",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."schedule_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_name" "text" NOT NULL,
    "service_type" "public"."appointment_type" NOT NULL,
    "price" numeric NOT NULL,
    "requires_deposit" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."service_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "title" "text" NOT NULL,
    "eye_side" "public"."eye_side" DEFAULT 'OU'::"public"."eye_side" NOT NULL,
    "comments" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "referring_doctor_id" "uuid"
);


ALTER TABLE "public"."studies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "study_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "mime_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."study_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."study_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surgeries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "encounter_id" "uuid" NOT NULL,
    "tipo_cirugia" "text" NOT NULL,
    "ojo_operar" "public"."eye_side" DEFAULT 'OU'::"public"."eye_side" NOT NULL,
    "consentimiento_informado" boolean DEFAULT false NOT NULL,
    "nota_operatoria" "text",
    "medicacion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "consent_signature_id" "uuid"
);


ALTER TABLE "public"."surgeries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surgery_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "surgery_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "mime_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."surgery_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surgery_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "display_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."surgery_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "kind" "public"."document_kind" NOT NULL,
    "body" "jsonb" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_closures"
    ADD CONSTRAINT "cash_closures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consent_signatures"
    ADD CONSTRAINT "consent_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_activity_log"
    ADD CONSTRAINT "crm_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_activity_read"
    ADD CONSTRAINT "crm_activity_read_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_activity_read"
    ADD CONSTRAINT "crm_activity_read_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."crm_pipeline_notes"
    ADD CONSTRAINT "crm_pipeline_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_pipeline_stages"
    ADD CONSTRAINT "crm_pipeline_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_pipelines"
    ADD CONSTRAINT "crm_pipelines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_procedure_types"
    ADD CONSTRAINT "crm_procedure_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diagnoses"
    ADD CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."edge_function_settings"
    ADD CONSTRAINT "edge_function_settings_pkey" PRIMARY KEY ("function_name");



ALTER TABLE ONLY "public"."encounters"
    ADD CONSTRAINT "encounters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exam_eye"
    ADD CONSTRAINT "exam_eye_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_lots"
    ADD CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_registrations"
    ADD CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."procedure_types"
    ADD CONSTRAINT "procedure_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."referring_doctors"
    ADD CONSTRAINT "referring_doctors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_inventory_categories"
    ADD CONSTRAINT "room_inventory_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_inventory_items"
    ADD CONSTRAINT "room_inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_inventory_movements"
    ADD CONSTRAINT "room_inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_prices"
    ADD CONSTRAINT "service_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studies"
    ADD CONSTRAINT "studies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_files"
    ADD CONSTRAINT "study_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_types"
    ADD CONSTRAINT "study_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surgeries"
    ADD CONSTRAINT "surgeries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surgery_files"
    ADD CONSTRAINT "surgery_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surgery_types"
    ADD CONSTRAINT "surgery_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_branches"
    ADD CONSTRAINT "user_branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_branches"
    ADD CONSTRAINT "user_branches_user_branch_unique" UNIQUE ("user_id", "branch_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_role_unique" UNIQUE ("user_id", "role");



CREATE OR REPLACE TRIGGER "crm_pipeline_activity_trigger" AFTER INSERT OR UPDATE ON "public"."crm_pipelines" FOR EACH ROW EXECUTE FUNCTION "public"."log_crm_activity"();



CREATE OR REPLACE TRIGGER "trigger_enforce_doctor_patient_columns" BEFORE UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_doctor_patient_update_columns"();



CREATE OR REPLACE TRIGGER "trigger_inventory_movement_on_invoice" AFTER INSERT ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."create_inventory_movement_from_invoice"();



CREATE OR REPLACE TRIGGER "trigger_update_invoice_balance" AFTER INSERT OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_invoice_balance"();



CREATE OR REPLACE TRIGGER "trigger_update_item_stock" AFTER INSERT ON "public"."inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."update_item_stock"();



CREATE OR REPLACE TRIGGER "update_cash_closures_updated_at" BEFORE UPDATE ON "public"."cash_closures" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_consent_signatures_updated_at" BEFORE UPDATE ON "public"."consent_signatures" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_crm_activity_log_updated_at" BEFORE UPDATE ON "public"."crm_activity_log" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_crm_pipeline_notes_updated_at" BEFORE UPDATE ON "public"."crm_pipeline_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_crm_pipeline_stages_updated_at" BEFORE UPDATE ON "public"."crm_pipeline_stages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_crm_procedure_types_updated_at" BEFORE UPDATE ON "public"."crm_procedure_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_diagnoses_updated_at" BEFORE UPDATE ON "public"."diagnoses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_documents_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_inventory_lots_updated_at" BEFORE UPDATE ON "public"."inventory_lots" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_inventory_movements_updated_at" BEFORE UPDATE ON "public"."inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invoice_items_updated_at" BEFORE UPDATE ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_procedure_types_updated_at" BEFORE UPDATE ON "public"."procedure_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_referring_doctors_updated_at" BEFORE UPDATE ON "public"."referring_doctors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_results_updated_at" BEFORE UPDATE ON "public"."results" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_room_inventory_movements_updated_at" BEFORE UPDATE ON "public"."room_inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_schedule_blocks_updated_at" BEFORE UPDATE ON "public"."schedule_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_study_files_updated_at" BEFORE UPDATE ON "public"."study_files" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_study_types_updated_at" BEFORE UPDATE ON "public"."study_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_surgery_files_updated_at" BEFORE UPDATE ON "public"."surgery_files" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_surgery_types_updated_at" BEFORE UPDATE ON "public"."surgery_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_branches_updated_at" BEFORE UPDATE ON "public"."user_branches" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_roles_updated_at" BEFORE UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id");



ALTER TABLE ONLY "public"."cash_closures"
    ADD CONSTRAINT "cash_closures_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."consent_signatures"
    ADD CONSTRAINT "consent_signatures_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."consent_signatures"
    ADD CONSTRAINT "consent_signatures_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consent_signatures"
    ADD CONSTRAINT "consent_signatures_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consent_signatures"
    ADD CONSTRAINT "consent_signatures_signed_by_fkey" FOREIGN KEY ("signed_by") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."consent_signatures"
    ADD CONSTRAINT "consent_signatures_surgery_id_fkey" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_activity_log"
    ADD CONSTRAINT "crm_activity_log_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."crm_activity_log"
    ADD CONSTRAINT "crm_activity_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "crm_activity_log_created_by_fkey" ON "public"."crm_activity_log" IS 'Links activity creator to their profile for displaying who made changes';



ALTER TABLE ONLY "public"."crm_activity_log"
    ADD CONSTRAINT "crm_activity_log_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_pipeline_notes"
    ADD CONSTRAINT "crm_pipeline_notes_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_pipeline_stages"
    ADD CONSTRAINT "crm_pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_pipelines"
    ADD CONSTRAINT "crm_pipelines_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."crm_pipelines"
    ADD CONSTRAINT "crm_pipelines_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."profiles"("user_id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "crm_pipelines_doctor_id_fkey" ON "public"."crm_pipelines" IS 'Links pipeline doctor to their profile for displaying doctor information';



ALTER TABLE ONLY "public"."crm_pipelines"
    ADD CONSTRAINT "crm_pipelines_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."crm_pipelines"
    ADD CONSTRAINT "crm_pipelines_procedure_type_id_fkey" FOREIGN KEY ("procedure_type_id") REFERENCES "public"."crm_procedure_types"("id");



ALTER TABLE ONLY "public"."diagnoses"
    ADD CONSTRAINT "diagnoses_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id");



ALTER TABLE ONLY "public"."encounters"
    ADD CONSTRAINT "encounters_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id");



ALTER TABLE ONLY "public"."encounters"
    ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."exam_eye"
    ADD CONSTRAINT "exam_eye_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."inventory_lots"
    ADD CONSTRAINT "inventory_lots_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_consent_signature_fk" FOREIGN KEY ("consent_signature_id") REFERENCES "public"."consent_signatures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id");



ALTER TABLE ONLY "public"."referring_doctors"
    ADD CONSTRAINT "referring_doctors_internal_profile_id_fkey" FOREIGN KEY ("internal_profile_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."room_inventory_categories"
    ADD CONSTRAINT "room_inventory_categories_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."room_inventory_categories"
    ADD CONSTRAINT "room_inventory_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."room_inventory_categories"("id");



ALTER TABLE ONLY "public"."room_inventory_items"
    ADD CONSTRAINT "room_inventory_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."room_inventory_items"
    ADD CONSTRAINT "room_inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."room_inventory_categories"("id");



ALTER TABLE ONLY "public"."room_inventory_movements"
    ADD CONSTRAINT "room_inventory_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."room_inventory_movements"
    ADD CONSTRAINT "room_inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."room_inventory_items"("id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id");



ALTER TABLE ONLY "public"."studies"
    ADD CONSTRAINT "studies_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id");



ALTER TABLE ONLY "public"."studies"
    ADD CONSTRAINT "studies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."studies"
    ADD CONSTRAINT "studies_referring_doctor_id_fkey" FOREIGN KEY ("referring_doctor_id") REFERENCES "public"."referring_doctors"("id");



ALTER TABLE ONLY "public"."study_files"
    ADD CONSTRAINT "study_files_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id");



ALTER TABLE ONLY "public"."surgeries"
    ADD CONSTRAINT "surgeries_consent_signature_fk" FOREIGN KEY ("consent_signature_id") REFERENCES "public"."consent_signatures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."surgeries"
    ADD CONSTRAINT "surgeries_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id");



ALTER TABLE ONLY "public"."surgery_files"
    ADD CONSTRAINT "surgery_files_surgery_id_fkey" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id");



ALTER TABLE ONLY "public"."user_branches"
    ADD CONSTRAINT "user_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



CREATE POLICY "Admin puede actualizar firmas" ON "public"."consent_signatures" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin puede eliminar firmas" ON "public"."consent_signatures" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin y enfermería pueden crear movimientos sala" ON "public"."room_inventory_movements" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role")));



CREATE POLICY "Admin y enfermería pueden gestionar categorías" ON "public"."room_inventory_categories" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role")));



CREATE POLICY "Admin y enfermería pueden gestionar items sala" ON "public"."room_inventory_items" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role")));



CREATE POLICY "Admin y recepción pueden actualizar bloqueos" ON "public"."schedule_blocks" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Admin y recepción pueden crear bloqueos" ON "public"."schedule_blocks" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Admin y recepción pueden eliminar bloqueos" ON "public"."schedule_blocks" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Admins can update registrations" ON "public"."pending_registrations" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all registrations" ON "public"."pending_registrations" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins y recepción pueden borrar pacientes" ON "public"."patients" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Allow anonymous inserts on consent_signatures" ON "public"."consent_signatures" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow anonymous reads on consent_signatures" ON "public"."consent_signatures" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can submit registration" ON "public"."pending_registrations" FOR INSERT WITH CHECK (true);



CREATE POLICY "Personal CRM puede crear actividad" ON "public"."crm_activity_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal CRM puede gestionar pipelines" ON "public"."crm_pipelines" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal CRM puede ver pipelines" ON "public"."crm_pipelines" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal autorizado puede crear pacientes" ON "public"."patients" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role")));



CREATE POLICY "Personal autorizado puede gestionar etapas" ON "public"."crm_pipeline_stages" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Personal autorizado puede gestionar notas pipeline" ON "public"."crm_pipeline_notes" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Personal clínico puede actualizar antecedentes de pacientes" ON "public"."patients" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede actualizar encuentros" ON "public"."encounters" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede actualizar estudios" ON "public"."studies" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede crear archivos de cirugías" ON "public"."surgery_files" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede crear archivos de estudios" ON "public"."study_files" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede crear documentos" ON "public"."documents" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede crear encuentros" ON "public"."encounters" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede crear estudios" ON "public"."studies" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede eliminar archivos de cirugías" ON "public"."surgery_files" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede eliminar archivos de estudios" ON "public"."study_files" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede gestionar cirugías" ON "public"."surgeries" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede gestionar diagnósticos" ON "public"."diagnoses" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede gestionar exámenes" ON "public"."exam_eye" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede gestionar procedimientos" ON "public"."procedures" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede gestionar resultados" ON "public"."results" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede gestionar órdenes" ON "public"."orders" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role")));



CREATE POLICY "Personal clínico puede ver actividad CRM" ON "public"."crm_activity_log" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver archivos de cirugías" ON "public"."surgery_files" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver archivos de estudios" ON "public"."study_files" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver categorías inv sala" ON "public"."room_inventory_categories" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver cirugías" ON "public"."surgeries" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver diagnósticos" ON "public"."diagnoses" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver encuentros" ON "public"."encounters" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver estudios" ON "public"."studies" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver etapas pipeline" ON "public"."crm_pipeline_stages" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver exámenes" ON "public"."exam_eye" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver inventario" ON "public"."inventory_items" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Personal clínico puede ver items inv sala" ON "public"."room_inventory_items" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver lotes" ON "public"."inventory_lots" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Personal clínico puede ver movimientos de inventario" ON "public"."inventory_movements" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Personal clínico puede ver movimientos inv sala" ON "public"."room_inventory_movements" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver notas pipeline" ON "public"."crm_pipeline_notes" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver procedimientos" ON "public"."procedures" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver proveedores" ON "public"."suppliers" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Personal clínico puede ver resultados" ON "public"."results" FOR SELECT USING (true);



CREATE POLICY "Personal clínico puede ver órdenes" ON "public"."orders" FOR SELECT USING (true);



CREATE POLICY "Personal puede crear firmas" ON "public"."consent_signatures" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Recepción puede ver facturas" ON "public"."invoices" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role"));



CREATE POLICY "Recepción puede ver items de factura" ON "public"."invoice_items" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role"));



CREATE POLICY "Recepción puede ver pagos" ON "public"."payments" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role"));



CREATE POLICY "Recepción y admins pueden actualizar pacientes" ON "public"."patients" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role")));



CREATE POLICY "Sistema puede insertar logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Solo admin puede gestionar asignaciones" ON "public"."user_branches" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar configuración" ON "public"."app_settings" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar edge functions" ON "public"."edge_function_settings" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar plantillas" ON "public"."templates" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar roles" ON "public"."user_roles" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar salas" ON "public"."rooms" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar sedes" ON "public"."branches" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar tipos de cirugía" ON "public"."surgery_types" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar tipos de estudio" ON "public"."study_types" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar tipos de procedimiento" ON "public"."procedure_types" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Solo admin puede gestionar tipos procedimiento CRM" ON "public"."crm_procedure_types" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Todos pueden leer pacientes" ON "public"."patients" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver bloqueos de agenda" ON "public"."schedule_blocks" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver citas" ON "public"."appointments" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver config edge functions" ON "public"."edge_function_settings" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver configuración" ON "public"."app_settings" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver documentos" ON "public"."documents" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver firmas de consentimientos" ON "public"."consent_signatures" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Todos pueden ver logs de auditoría" ON "public"."audit_logs" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver plantillas" ON "public"."templates" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver precios de servicios" ON "public"."service_prices" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver roles" ON "public"."user_roles" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver salas" ON "public"."rooms" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver sedes" ON "public"."branches" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver tipos de cirugía" ON "public"."surgery_types" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver tipos de estudio" ON "public"."study_types" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver tipos de procedimiento" ON "public"."procedure_types" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver tipos procedimiento CRM" ON "public"."crm_procedure_types" FOR SELECT USING (true);



CREATE POLICY "Users can insert referring_doctors" ON "public"."referring_doctors" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can update referring_doctors" ON "public"."referring_doctors" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Users can view referring_doctors" ON "public"."referring_doctors" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON "public"."profiles" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Usuarios pueden crear su propio rol inicial" ON "public"."user_roles" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."user_roles" "user_roles_1"
  WHERE ("user_roles_1"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Usuarios pueden gestionar su lectura" ON "public"."crm_activity_read" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Usuarios pueden insertar su propio perfil" ON "public"."profiles" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Usuarios pueden ver su propia lectura" ON "public"."crm_activity_read" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Usuarios pueden ver sus propias sedes" ON "public"."user_branches" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Usuarios pueden ver todos los perfiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "admin_caja_contabilidad_crear_cierres" ON "public"."cash_closures" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_facturas" ON "public"."invoices" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_insert_pagos" ON "public"."payments" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_inventario" ON "public"."inventory_items" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_items" ON "public"."invoice_items" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_lotes" ON "public"."inventory_lots" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_movimientos" ON "public"."inventory_movements" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_proveedores" ON "public"."suppliers" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_select_pagos" ON "public"."payments" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_servicios" ON "public"."service_prices" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_update_pagos" ON "public"."payments" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_caja_contabilidad_ver_cierres" ON "public"."cash_closures" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



CREATE POLICY "admin_contabilidad_delete_pagos" ON "public"."payments" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'contabilidad'::"public"."app_role")));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_closures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinico_caja_insert_appointments" ON "public"."appointments" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role")));



CREATE POLICY "clinico_caja_update_appointments" ON "public"."appointments" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'nurse'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'diagnostico'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'caja'::"public"."app_role")));



CREATE POLICY "clinico_delete_appointments" ON "public"."appointments" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'reception'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'doctor'::"public"."app_role")));



ALTER TABLE "public"."consent_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_activity_read" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_pipeline_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_pipeline_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_pipelines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_procedure_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diagnoses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."edge_function_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."encounters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exam_eye" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "first_admin_bootstrap" ON "public"."user_roles" FOR INSERT WITH CHECK ((("role" = 'admin'::"public"."app_role") AND ("user_id" = "auth"."uid"()) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."user_roles" "user_roles_1"
  WHERE ("user_roles_1"."role" = 'admin'::"public"."app_role"))))));



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_lots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."procedure_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."procedures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referring_doctors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_inventory_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."studies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."surgeries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."surgery_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."surgery_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_exists"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_exists"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_exists"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_inventory_movement_from_invoice"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_inventory_movement_from_invoice"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_inventory_movement_from_invoice"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_doctor_patient_update_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_doctor_patient_update_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_doctor_patient_update_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_number_for_branch"("p_branch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_number_for_branch"("p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_number_for_branch"("p_branch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_clinical_research_data"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "diagnosis_filter" "text", "search_field_type" "text", "surgery_type_filter" "text", "appointment_type_filter" "public"."appointment_type", "has_preop_data" boolean, "has_postop_data" boolean, "min_age" integer, "max_age" integer, "gender_filter" "text", "has_diabetes" boolean, "has_hta" boolean, "has_autorefractor" boolean, "has_lensometry" boolean, "has_keratometry" boolean, "has_pio" boolean, "has_fundus_photos" boolean, "has_slit_lamp" boolean, "has_visual_acuity" boolean, "has_subjective_refraction" boolean, "has_prescription" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_clinical_research_data"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "diagnosis_filter" "text", "search_field_type" "text", "surgery_type_filter" "text", "appointment_type_filter" "public"."appointment_type", "has_preop_data" boolean, "has_postop_data" boolean, "min_age" integer, "max_age" integer, "gender_filter" "text", "has_diabetes" boolean, "has_hta" boolean, "has_autorefractor" boolean, "has_lensometry" boolean, "has_keratometry" boolean, "has_pio" boolean, "has_fundus_photos" boolean, "has_slit_lamp" boolean, "has_visual_acuity" boolean, "has_subjective_refraction" boolean, "has_prescription" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_clinical_research_data"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "diagnosis_filter" "text", "search_field_type" "text", "surgery_type_filter" "text", "appointment_type_filter" "public"."appointment_type", "has_preop_data" boolean, "has_postop_data" boolean, "min_age" integer, "max_age" integer, "gender_filter" "text", "has_diabetes" boolean, "has_hta" boolean, "has_autorefractor" boolean, "has_lensometry" boolean, "has_keratometry" boolean, "has_pio" boolean, "has_fundus_photos" boolean, "has_slit_lamp" boolean, "has_visual_acuity" boolean, "has_subjective_refraction" boolean, "has_prescription" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_clinical_research_data_by_patient"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "diagnosis_filter" "text", "search_field_type" "text", "surgery_type_filter" "text", "appointment_type_filter" "public"."appointment_type", "has_preop_data" boolean, "has_postop_data" boolean, "min_age" integer, "max_age" integer, "gender_filter" "text", "has_diabetes" boolean, "has_hta" boolean, "has_autorefractor" boolean, "has_lensometry" boolean, "has_keratometry" boolean, "has_pio" boolean, "has_fundus_photos" boolean, "has_slit_lamp" boolean, "has_visual_acuity" boolean, "has_subjective_refraction" boolean, "has_prescription" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_clinical_research_data_by_patient"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "diagnosis_filter" "text", "search_field_type" "text", "surgery_type_filter" "text", "appointment_type_filter" "public"."appointment_type", "has_preop_data" boolean, "has_postop_data" boolean, "min_age" integer, "max_age" integer, "gender_filter" "text", "has_diabetes" boolean, "has_hta" boolean, "has_autorefractor" boolean, "has_lensometry" boolean, "has_keratometry" boolean, "has_pio" boolean, "has_fundus_photos" boolean, "has_slit_lamp" boolean, "has_visual_acuity" boolean, "has_subjective_refraction" boolean, "has_prescription" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_clinical_research_data_by_patient"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "diagnosis_filter" "text", "search_field_type" "text", "surgery_type_filter" "text", "appointment_type_filter" "public"."appointment_type", "has_preop_data" boolean, "has_postop_data" boolean, "min_age" integer, "max_age" integer, "gender_filter" "text", "has_diabetes" boolean, "has_hta" boolean, "has_autorefractor" boolean, "has_lensometry" boolean, "has_keratometry" boolean, "has_pio" boolean, "has_fundus_photos" boolean, "has_slit_lamp" boolean, "has_visual_acuity" boolean, "has_subjective_refraction" boolean, "has_prescription" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_clinical_stats_with_revenue"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_clinical_stats_with_revenue"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_clinical_stats_with_revenue"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_clinical_stats_with_revenue_v2"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "branch_filter" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_clinical_stats_with_revenue_v2"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "branch_filter" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_clinical_stats_with_revenue_v2"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "branch_filter" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_doctor_activity_detail"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "appointment_type_filter" "public"."appointment_type") TO "anon";
GRANT ALL ON FUNCTION "public"."get_doctor_activity_detail"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "appointment_type_filter" "public"."appointment_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_doctor_activity_detail"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "doctor_filter" "uuid", "appointment_type_filter" "public"."appointment_type") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_doctor_activity_detail_v4"("start_date" "date", "end_date" "date", "doctor_filter" "uuid", "branch_filter" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_doctor_activity_detail_v4"("start_date" "date", "end_date" "date", "doctor_filter" "uuid", "branch_filter" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_doctor_activity_detail_v4"("start_date" "date", "end_date" "date", "doctor_filter" "uuid", "branch_filter" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_payment_methods"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_payment_methods"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_methods"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_details"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_details_v2"("start_date" "text", "end_date" "text", "branch_filter" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_sales"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_storage_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_storage_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_storage_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_crm_access"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_crm_access"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_crm_access"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_crm_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_crm_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_crm_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_invoice_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_invoice_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_invoice_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_item_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_item_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_item_stock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT ALL ON TABLE "public"."cash_closures" TO "anon";
GRANT ALL ON TABLE "public"."cash_closures" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_closures" TO "service_role";



GRANT ALL ON TABLE "public"."consent_signatures" TO "anon";
GRANT ALL ON TABLE "public"."consent_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."consent_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."crm_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."crm_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."crm_activity_read" TO "anon";
GRANT ALL ON TABLE "public"."crm_activity_read" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_activity_read" TO "service_role";



GRANT ALL ON TABLE "public"."crm_pipeline_notes" TO "anon";
GRANT ALL ON TABLE "public"."crm_pipeline_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_pipeline_notes" TO "service_role";



GRANT ALL ON TABLE "public"."crm_pipeline_stages" TO "anon";
GRANT ALL ON TABLE "public"."crm_pipeline_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_pipeline_stages" TO "service_role";



GRANT ALL ON TABLE "public"."crm_pipelines" TO "anon";
GRANT ALL ON TABLE "public"."crm_pipelines" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_pipelines" TO "service_role";



GRANT ALL ON TABLE "public"."crm_procedure_types" TO "anon";
GRANT ALL ON TABLE "public"."crm_procedure_types" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_procedure_types" TO "service_role";



GRANT ALL ON TABLE "public"."diagnoses" TO "anon";
GRANT ALL ON TABLE "public"."diagnoses" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnoses" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."edge_function_settings" TO "anon";
GRANT ALL ON TABLE "public"."edge_function_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."edge_function_settings" TO "service_role";



GRANT ALL ON TABLE "public"."encounters" TO "anon";
GRANT ALL ON TABLE "public"."encounters" TO "authenticated";
GRANT ALL ON TABLE "public"."encounters" TO "service_role";



GRANT ALL ON TABLE "public"."exam_eye" TO "anon";
GRANT ALL ON TABLE "public"."exam_eye" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_eye" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_lots" TO "anon";
GRANT ALL ON TABLE "public"."inventory_lots" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_lots" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."pending_registrations" TO "anon";
GRANT ALL ON TABLE "public"."pending_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."procedure_types" TO "anon";
GRANT ALL ON TABLE "public"."procedure_types" TO "authenticated";
GRANT ALL ON TABLE "public"."procedure_types" TO "service_role";



GRANT ALL ON TABLE "public"."procedures" TO "anon";
GRANT ALL ON TABLE "public"."procedures" TO "authenticated";
GRANT ALL ON TABLE "public"."procedures" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."referring_doctors" TO "anon";
GRANT ALL ON TABLE "public"."referring_doctors" TO "authenticated";
GRANT ALL ON TABLE "public"."referring_doctors" TO "service_role";



GRANT ALL ON TABLE "public"."results" TO "anon";
GRANT ALL ON TABLE "public"."results" TO "authenticated";
GRANT ALL ON TABLE "public"."results" TO "service_role";



GRANT ALL ON TABLE "public"."room_inventory_categories" TO "anon";
GRANT ALL ON TABLE "public"."room_inventory_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."room_inventory_categories" TO "service_role";



GRANT ALL ON TABLE "public"."room_inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."room_inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."room_inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."room_inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."room_inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."room_inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "anon";
GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_blocks" TO "anon";
GRANT ALL ON TABLE "public"."schedule_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."service_prices" TO "anon";
GRANT ALL ON TABLE "public"."service_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."service_prices" TO "service_role";



GRANT ALL ON TABLE "public"."studies" TO "anon";
GRANT ALL ON TABLE "public"."studies" TO "authenticated";
GRANT ALL ON TABLE "public"."studies" TO "service_role";



GRANT ALL ON TABLE "public"."study_files" TO "anon";
GRANT ALL ON TABLE "public"."study_files" TO "authenticated";
GRANT ALL ON TABLE "public"."study_files" TO "service_role";



GRANT ALL ON TABLE "public"."study_types" TO "anon";
GRANT ALL ON TABLE "public"."study_types" TO "authenticated";
GRANT ALL ON TABLE "public"."study_types" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."surgeries" TO "anon";
GRANT ALL ON TABLE "public"."surgeries" TO "authenticated";
GRANT ALL ON TABLE "public"."surgeries" TO "service_role";



GRANT ALL ON TABLE "public"."surgery_files" TO "anon";
GRANT ALL ON TABLE "public"."surgery_files" TO "authenticated";
GRANT ALL ON TABLE "public"."surgery_files" TO "service_role";



GRANT ALL ON TABLE "public"."surgery_types" TO "anon";
GRANT ALL ON TABLE "public"."surgery_types" TO "authenticated";
GRANT ALL ON TABLE "public"."surgery_types" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "anon";
GRANT ALL ON TABLE "public"."templates" TO "authenticated";
GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON TABLE "public"."user_branches" TO "anon";
GRANT ALL ON TABLE "public"."user_branches" TO "authenticated";
GRANT ALL ON TABLE "public"."user_branches" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








-- ============================================================
-- STORAGE BUCKETS (crear manualmente en Dashboard)
-- ============================================================
-- Los siguientes buckets deben crearse manualmente:
-- 
-- 1. documents (privado) - Para documentos generados
-- 2. results (privado) - Para resultados de estudios
-- 3. studies (privado) - Para archivos de estudios
-- 4. surgeries (privado) - Para archivos de cirugías
--
-- O ejecutar en SQL Editor:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('results', 'results', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('studies', 'studies', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('surgeries', 'surgeries', false);
-- ============================================================
