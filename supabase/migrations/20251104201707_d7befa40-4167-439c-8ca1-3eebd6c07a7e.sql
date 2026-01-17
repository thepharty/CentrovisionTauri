-- Crear función para obtener desglose detallado de actividad por doctor
CREATE OR REPLACE FUNCTION public.get_doctor_activity_detail(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  doctor_filter uuid DEFAULT NULL,
  appointment_type_filter appointment_type DEFAULT NULL
)
RETURNS TABLE(
  appointment_id uuid,
  patient_id uuid,
  patient_code text,
  patient_name text,
  appointment_type text,
  appointment_date timestamp with time zone,
  doctor_id uuid,
  doctor_name text,
  invoice_id uuid,
  invoice_amount numeric,
  is_invoiced boolean,
  estimated_price numeric,
  total_revenue numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
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
$function$;