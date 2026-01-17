-- Crear función RPC para estadísticas clínicas con revenue híbrido
CREATE OR REPLACE FUNCTION public.get_clinical_stats_with_revenue(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  doctor_filter uuid DEFAULT NULL
)
RETURNS TABLE(
  tipo_cita text,
  doctor_id uuid,
  doctor_name text,
  cantidad bigint,
  pacientes_unicos bigint,
  revenue_real numeric,
  revenue_estimado numeric,
  revenue_total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH appointment_data AS (
    -- Obtener todas las citas completadas con su información
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
    -- Obtener precios promedio por tipo de servicio
    SELECT 
      service_type::text,
      AVG(price) as avg_price
    FROM service_prices
    WHERE active = true
    GROUP BY service_type
  ),
  calculated_revenue AS (
    -- Calcular revenue real y estimado
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