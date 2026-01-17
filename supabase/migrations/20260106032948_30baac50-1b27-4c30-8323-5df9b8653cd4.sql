-- Fix get_doctor_activity_detail_v4 with correct column names
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
$function$;