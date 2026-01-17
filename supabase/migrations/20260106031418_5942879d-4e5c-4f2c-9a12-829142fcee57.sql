-- Create v4 of get_doctor_activity_detail with branch_filter parameter
-- v3 remains untouched for comparison
CREATE OR REPLACE FUNCTION public.get_doctor_activity_detail_v4(
  start_date date,
  end_date date,
  doctor_filter uuid DEFAULT NULL,
  branch_filter uuid DEFAULT NULL
)
RETURNS TABLE(
  appointment_id uuid,
  patient_code text,
  patient_name text,
  appointment_type text,
  appointment_date timestamp with time zone,
  is_invoiced boolean,
  invoice_amount numeric,
  is_courtesy boolean,
  surgery_type text,
  procedure_type text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    SELECT 
      a.id as app_id,
      p.code as p_code,
      p.name as p_name,
      a.type::text as app_type,
      a.starts_at as app_date,
      i.id IS NOT NULL as has_invoice,
      COALESCE(i.total_amount, 0) as inv_amount,
      COALESCE(a.is_courtesy, false) as app_is_courtesy,
      s.surgery_type as surg_type,
      pr.procedure_type as proc_type
    FROM appointments a
    INNER JOIN patients p ON p.id = a.patient_id
    LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
    LEFT JOIN surgeries s ON s.appointment_id = a.id
    LEFT JOIN procedures pr ON pr.appointment_id = a.id
    WHERE a.status = 'done'
      AND a.date >= start_date
      AND a.date <= end_date
      AND (doctor_filter IS NULL OR a.doctor_id = doctor_filter)
      AND (branch_filter IS NULL OR a.branch_id = branch_filter)
    ORDER BY a.starts_at DESC
  )
  SELECT 
    ad.app_id,
    ad.p_code,
    ad.p_name,
    ad.app_type,
    ad.app_date,
    ad.has_invoice,
    ad.inv_amount,
    ad.app_is_courtesy,
    ad.surg_type,
    ad.proc_type
  FROM appointment_data ad;
END;
$function$;