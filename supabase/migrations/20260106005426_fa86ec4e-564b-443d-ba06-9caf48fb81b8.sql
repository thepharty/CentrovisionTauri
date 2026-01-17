-- Create function get_doctor_activity_detail_v3 with is_courtesy field
CREATE OR REPLACE FUNCTION public.get_doctor_activity_detail_v3(
  p_doctor_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  appointment_id uuid,
  patient_code text,
  patient_name text,
  appointment_type text,
  appointment_date date,
  appointment_time time,
  appointment_status text,
  is_invoiced boolean,
  invoice_amount numeric,
  is_courtesy boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    SELECT 
      a.id AS app_id,
      p.code AS pat_code,
      CONCAT(p.first_name, ' ', p.last_name) AS pat_name,
      a.appointment_type AS app_type,
      a.date AS app_date,
      a.time AS app_time,
      a.status AS app_status,
      COALESCE(a.is_courtesy, false) AS is_courtesy_val,
      a.branch_id
    FROM appointments a
    INNER JOIN patients p ON a.patient_id = p.id
    WHERE a.doctor_id = p_doctor_id
      AND a.date >= p_start_date
      AND a.date <= p_end_date
      AND a.status NOT IN ('cancelled', 'no_show')
  ),
  invoice_data AS (
    SELECT 
      ii.appointment_id AS inv_app_id,
      SUM(ii.subtotal) AS total_amount
    FROM invoice_items ii
    INNER JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.status != 'cancelled'
    GROUP BY ii.appointment_id
  )
  SELECT 
    ad.app_id AS appointment_id,
    ad.pat_code AS patient_code,
    ad.pat_name AS patient_name,
    ad.app_type AS appointment_type,
    ad.app_date AS appointment_date,
    ad.app_time AS appointment_time,
    ad.app_status AS appointment_status,
    (id.inv_app_id IS NOT NULL) AS is_invoiced,
    COALESCE(id.total_amount, 0) AS invoice_amount,
    ad.is_courtesy_val AS is_courtesy
  FROM appointment_data ad
  LEFT JOIN invoice_data id ON ad.app_id = id.inv_app_id
  ORDER BY ad.app_date DESC, ad.app_time DESC;
END;
$$;