CREATE OR REPLACE FUNCTION public.get_doctor_activity_detail_v3(start_date text, end_date text, doctor_filter uuid DEFAULT NULL::uuid, appointment_type_filter appointment_type DEFAULT NULL::appointment_type)
 RETURNS TABLE(appointment_id uuid, appointment_date text, appointment_type text, doctor_id uuid, doctor_name text, patient_id uuid, patient_name text, patient_code text, surgery_type text, procedure_type text, is_invoiced boolean, invoice_id uuid, invoice_amount numeric, total_revenue numeric, estimated_price numeric, is_courtesy boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    SELECT 
      a.id AS apt_id,
      a.starts_at::date::text AS apt_date,
      a.type::text AS apt_type,
      a.doctor_id AS doc_id,
      p.id AS pat_id,
      COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '') AS pat_name,
      COALESCE(p.code, '') AS pat_code,
      COALESCE(s.tipo_cirugia, '') AS surgery_type_val,
      COALESCE(proc.tipo_procedimiento, '') AS procedure_type_val,
      COALESCE(a.is_courtesy, false) AS is_courtesy_val
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.id
    LEFT JOIN encounters e ON a.id = e.appointment_id
    LEFT JOIN surgeries s ON e.id = s.encounter_id
    LEFT JOIN procedures proc ON e.id = proc.encounter_id
    WHERE a.starts_at::date BETWEEN start_date::date AND end_date::date
      AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
      AND (appointment_type_filter IS NULL OR a.type = appointment_type_filter)
      AND a.status = 'done'
  ),
  doctor_names AS (
    SELECT 
      pr.user_id,
      COALESCE(pr.full_name, '') AS full_name
    FROM profiles pr
  ),
  invoice_data AS (
    SELECT 
      inv.appointment_id AS inv_apt_id,
      inv.id AS inv_id,
      COALESCE(inv.total_amount, 0) AS inv_total,
      COALESCE(SUM(pay.amount), 0) AS total_paid
    FROM invoices inv
    LEFT JOIN payments pay ON inv.id = pay.invoice_id
    WHERE inv.status != 'cancelada'
    GROUP BY inv.id, inv.appointment_id, inv.total_amount
  ),
  avg_prices AS (
    SELECT 
      sp.service_type::text AS avg_type,
      AVG(sp.price) AS avg_price
    FROM service_prices sp
    WHERE sp.active = true
    GROUP BY sp.service_type
  )
  SELECT 
    ad.apt_id AS appointment_id,
    ad.apt_date AS appointment_date,
    ad.apt_type AS appointment_type,
    ad.doc_id AS doctor_id,
    COALESCE(dn.full_name, '') AS doctor_name,
    ad.pat_id AS patient_id,
    ad.pat_name AS patient_name,
    ad.pat_code AS patient_code,
    ad.surgery_type_val AS surgery_type,
    ad.procedure_type_val AS procedure_type,
    (invd.inv_id IS NOT NULL) AS is_invoiced,
    invd.inv_id AS invoice_id,
    COALESCE(invd.inv_total, 0) AS invoice_amount,
    CASE 
      WHEN invd.inv_id IS NOT NULL THEN COALESCE(invd.inv_total, 0)
      ELSE COALESCE(ap.avg_price, 0)
    END AS total_revenue,
    COALESCE(ap.avg_price, 0)::numeric AS estimated_price,
    ad.is_courtesy_val AS is_courtesy
  FROM appointment_data ad
  LEFT JOIN doctor_names dn ON ad.doc_id = dn.user_id
  LEFT JOIN invoice_data invd ON ad.apt_id = invd.inv_apt_id
  LEFT JOIN avg_prices ap ON ap.avg_type = ad.apt_type
  ORDER BY ad.apt_date DESC, ad.pat_name;
END;
$function$;