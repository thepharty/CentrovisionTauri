import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, TrendingUp, DollarSign, Receipt, Ticket, Download, CalendarIcon, FileText } from 'lucide-react';
import { format, subDays, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { clinicNow, clinicStartOfDay, clinicEndOfDay } from '@/lib/timezone';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { DoctorDetailDialog } from '@/components/analytics/DoctorDetailDialog';
import { useBranch } from '@/hooks/useBranch';

type PeriodType = 'today' | 'week' | 'month' | 'custom';
type ViewMode = 'financial' | 'clinical';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Analytics() {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;
  
  const [period, setPeriod] = useState<PeriodType>('today');
  const [viewMode, setViewMode] = useState<ViewMode>('financial');
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedDoctorForDetail, setSelectedDoctorForDetail] = useState<{ id: string; name: string } | null>(null);

  // Calcular rango de fechas según período
  const getDateRange = () => {
    const now = clinicNow();
    
    if (period === 'custom' && dateRange.from && dateRange.to) {
      return {
        from: clinicStartOfDay(dateRange.from),
        to: clinicEndOfDay(dateRange.to),
      };
    }
    
    switch (period) {
      case 'today':
        return {
          from: clinicStartOfDay(now),
          to: clinicEndOfDay(now),
        };
      case 'week':
        return {
          from: startOfWeek(now, { locale: es }),
          to: endOfWeek(now, { locale: es }),
        };
      case 'month':
        return {
          from: startOfMonth(now),
          to: endOfMonth(now),
        };
      default:
        return {
          from: clinicStartOfDay(now),
          to: clinicEndOfDay(now),
        };
    }
  };

  const { from, to } = getDateRange();

  // Query: Métricas principales
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['analytics-metrics', from?.toISOString(), to?.toISOString(), branchId],
    queryFn: async () => {
      let invoicesQuery = supabase
        .from('invoices')
        .select('total_amount, created_at, status')
        .gte('created_at', from!.toISOString())
        .lte('created_at', to!.toISOString())
        .neq('status', 'cancelada');
      
      if (branchId) {
        invoicesQuery = invoicesQuery.eq('branch_id', branchId);
      }
      
      const { data: invoices } = await invoicesQuery;

      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .gte('created_at', from!.toISOString())
        .lte('created_at', to!.toISOString())
        .eq('status', 'completado');

      const totalRevenue = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;
      const transactionCount = invoices?.length || 0;
      const avgTicket = transactionCount > 0 ? totalRevenue / transactionCount : 0;

      // Calcular días en el período
      const days = Math.max(1, Math.ceil((to!.getTime() - from!.getTime()) / (1000 * 60 * 60 * 24)));
      const avgDaily = totalRevenue / days;

      return {
        totalRevenue,
        avgDaily,
        transactionCount,
        avgTicket,
      };
    },
    enabled: !!from && !!to && !!branchId,
  });

  // Query: Ingresos diarios
  const { data: dailyRevenue } = useQuery({
    queryKey: ['analytics-daily', from?.toISOString(), to?.toISOString(), branchId],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('total_amount, created_at')
        .gte('created_at', from!.toISOString())
        .lte('created_at', to!.toISOString())
        .neq('status', 'cancelada')
        .order('created_at');
      
      if (branchId) {
        query = query.eq('branch_id', branchId);
      }
      
      const { data } = await query;

      const dailyMap = new Map<string, number>();
      data?.forEach((invoice) => {
        const day = format(new Date(invoice.created_at), 'dd/MM');
        dailyMap.set(day, (dailyMap.get(day) || 0) + Number(invoice.total_amount));
      });

      return Array.from(dailyMap.entries()).map(([day, amount]) => ({
        day,
        monto: Number(amount.toFixed(2)),
      }));
    },
    enabled: !!from && !!to && !!branchId,
  });

  // Query: Ventas por tipo de servicio
  const { data: servicesSales } = useQuery({
    queryKey: ['analytics-services', from?.toISOString(), to?.toISOString(), branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_service_sales', {
        start_date: from!.toISOString(),
        end_date: to!.toISOString(),
        branch_filter: branchId || null,
      });

      if (error) throw error;
      
      return data?.map((item: any) => ({
        tipo: item.service_type || 'Otro',
        cantidad: Number(item.cantidad),
        total: Number(item.total),
      })) || [];
    },
    enabled: !!from && !!to && !!branchId,
  });

  // Query: Métodos de pago
  const { data: paymentMethods } = useQuery({
    queryKey: ['analytics-payments', from?.toISOString(), to?.toISOString(), branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_payment_methods', {
        start_date: from!.toISOString(),
        end_date: to!.toISOString(),
        branch_filter: branchId || null,
      });

      if (error) throw error;

      return data?.map((item: any) => ({
        metodo: item.payment_method || 'Otro',
        cantidad: Number(item.cantidad),
        total: Number(item.total),
      })) || [];
    },
    enabled: !!from && !!to && !!branchId,
  });

  // Query: Historial de cierres
  const { data: closures } = useQuery({
    queryKey: ['analytics-closures', from?.toISOString(), to?.toISOString(), branchId],
    queryFn: async () => {
      let query = supabase
        .from('cash_closures')
        .select('*')
        .gte('closure_date', from!.toISOString())
        .lte('closure_date', to!.toISOString())
        .order('closure_date', { ascending: false });
      
      if (branchId) {
        query = query.eq('branch_id', branchId);
      }
      
      const { data: closuresData } = await query;

      if (!closuresData) return [];

      // Obtener los perfiles de los usuarios que cerraron
      const userIds = [...new Set(closuresData.map(c => c.closed_by).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const profilesMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      return closuresData.map(closure => ({
        ...closure,
        userName: closure.closed_by ? profilesMap.get(closure.closed_by) || 'N/A' : 'N/A',
      }));
    },
    enabled: !!from && !!to && !!branchId,
  });

  // Query: Productos más vendidos (usando v2 con filtro correcto por item_type='producto')
  const { data: topProducts } = useQuery({
    queryKey: ['analytics-top-products', from?.toISOString(), to?.toISOString(), branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_inventory_details_v2', {
        start_date: from!.toISOString(),
        end_date: to!.toISOString(),
        branch_filter: branchId || null,
      });

      if (error) throw error;

      return data
        ?.slice(0, 10)
        .map((item: any) => ({
          producto: item.item_name,
          cantidad: Number(item.total_quantity),
          total: Number(item.total_revenue),
        })) || [];
    },
    enabled: !!from && !!to && !!branchId,
  });

  // Query: Servicios más solicitados (usando v2 con filtro correcto por item_type='servicio')
  const { data: topServices } = useQuery({
    queryKey: ['analytics-top-services', from?.toISOString(), to?.toISOString(), branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_service_details_v2', {
        start_date: from!.toISOString(),
        end_date: to!.toISOString(),
        branch_filter: branchId || null,
      });

      if (error) throw error;

      return data
        ?.slice(0, 10)
        .map((item: any) => ({
          servicio: item.item_name,
          cantidad: Number(item.total_quantity),
          total: Number(item.total_revenue),
        })) || [];
    },
    enabled: !!from && !!to && !!branchId,
  });

  // Query: Análisis de descuentos
  const { data: discounts } = useQuery({
    queryKey: ['analytics-discounts', from?.toISOString(), to?.toISOString(), branchId],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('discount_value, discount_type, created_at')
        .gte('created_at', from!.toISOString())
        .lte('created_at', to!.toISOString())
        .neq('status', 'cancelada')
        .gt('discount_value', 0);
      
      if (branchId) {
        query = query.eq('branch_id', branchId);
      }
      
      const { data } = await query;

      const totalDiscounts = data?.reduce((sum, inv) => sum + Number(inv.discount_value || 0), 0) || 0;
      const avgDiscount = data && data.length > 0 ? totalDiscounts / data.length : 0;

      return {
        totalDiscounts,
        avgDiscount,
        count: data?.length || 0,
      };
    },
    enabled: !!from && !!to && !!branchId,
  });

  // Query: Lista de doctores (solo usuarios con rol doctor)
  const { data: doctors } = useQuery({
    queryKey: ['doctors-list'],
    queryFn: async () => {
      // Primero obtener IDs de usuarios con rol doctor
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'doctor');
      
      if (!roles || roles.length === 0) return [];
      
      // Luego obtener perfiles de esos usuarios
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', roles.map(r => r.user_id))
        .order('full_name');
      
      return profiles || [];
    },
  });

  // Query: Estadísticas clínicas con revenue (v2 con filtro por sucursal)
  const { data: clinicalStats, isLoading: clinicalStatsLoading } = useQuery({
    queryKey: ['analytics-clinical-revenue', from?.toISOString(), to?.toISOString(), selectedDoctor, branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_clinical_stats_with_revenue_v2', {
        start_date: from!.toISOString(),
        end_date: to!.toISOString(),
        doctor_filter: selectedDoctor || null,
        branch_filter: branchId || null,
      });

      if (error) {
        console.error('Error fetching clinical stats:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!from && !!to && viewMode === 'clinical',
  });

  // Query: Tendencia diaria de citas
  const { data: dailyAppointments } = useQuery({
    queryKey: ['analytics-daily-appointments', from?.toISOString(), to?.toISOString(), selectedDoctor, branchId],
    queryFn: async () => {
      let query = supabase
        .from('appointments')
        .select('starts_at, type')
        .gte('starts_at', from!.toISOString())
        .lte('starts_at', to!.toISOString())
        .eq('status', 'done')
        .order('starts_at');

      if (selectedDoctor) {
        query = query.eq('doctor_id', selectedDoctor);
      }
      
      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data } = await query;

      const dailyMap = new Map<string, number>();
      data?.forEach((appt) => {
        const day = format(new Date(appt.starts_at), 'dd/MM');
        dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
      });

      return Array.from(dailyMap.entries()).map(([day, count]) => ({
        day,
        citas: count,
      }));
    },
    enabled: !!from && !!to && viewMode === 'clinical' && !!branchId,
  });

  // Procesar datos clínicos
  const activityByType = clinicalStats?.reduce((acc, stat) => {
    const existing = acc.find(item => item.tipo === stat.tipo_cita);
    if (existing) {
      existing.cantidad += Number(stat.cantidad);
      existing.revenue += Number(stat.revenue_total);
    } else {
      acc.push({
        tipo: stat.tipo_cita,
        cantidad: Number(stat.cantidad),
        revenue: Number(stat.revenue_total),
      });
    }
    return acc;
  }, [] as any[]);

  const activityByDoctor = clinicalStats?.reduce((acc, stat) => {
    const doctorKey = stat.doctor_name;
    if (!acc[doctorKey]) {
      acc[doctorKey] = {
        doctor: doctorKey,
        consultas: 0,
        procedimientos: 0,
        cirugias: 0,
        estudios: 0,
        reconsultas: 0,
        total: 0,
        revenue_real: 0,
        revenue_estimado: 0,
        revenue_total: 0,
      };
    }
    
    const cantidad = Number(stat.cantidad);
    const revReal = Number(stat.revenue_real);
    const revEst = Number(stat.revenue_estimado);
    const revTotal = Number(stat.revenue_total);
    
    acc[doctorKey].total += cantidad;
    acc[doctorKey].revenue_real += revReal;
    acc[doctorKey].revenue_estimado += revEst;
    acc[doctorKey].revenue_total += revTotal;
    
    const tipo = stat.tipo_cita.toLowerCase();
    if (tipo.includes('consulta') && !tipo.includes('reconsulta')) {
      acc[doctorKey].consultas += cantidad;
    } else if (tipo.includes('reconsulta')) {
      acc[doctorKey].reconsultas += cantidad;
    } else if (tipo === 'procedimiento') {
      acc[doctorKey].procedimientos += cantidad;
    } else if (tipo === 'cirugia') {
      acc[doctorKey].cirugias += cantidad;
    } else if (tipo === 'estudio') {
      acc[doctorKey].estudios += cantidad;
    }
    
    return acc;
  }, {} as any);

  const doctorStats = Object.values(activityByDoctor || {}).sort((a: any, b: any) => b.revenue_total - a.revenue_total);

  const clinicalMetrics = {
    totalCitas: clinicalStats?.reduce((sum, s) => sum + Number(s.cantidad), 0) || 0,
    pacientesUnicos: clinicalStats?.reduce((sum, s) => sum + Number(s.pacientes_unicos), 0) || 0,
    totalConsultas: activityByType?.find(a => a.tipo.toLowerCase().includes('consulta'))?.cantidad || 0,
    totalCirugias: activityByType?.find(a => a.tipo === 'cirugia')?.cantidad || 0,
    revenueTotal: clinicalStats?.reduce((sum, s) => sum + Number(s.revenue_total), 0) || 0,
    revenueReal: clinicalStats?.reduce((sum, s) => sum + Number(s.revenue_real), 0) || 0,
    revenueEstimado: clinicalStats?.reduce((sum, s) => sum + Number(s.revenue_estimado), 0) || 0,
  };

  // Función para exportar a Excel
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    if (viewMode === 'financial') {
      // Métricas financieras
      const metricsData = [
        ['Métrica', 'Valor'],
        ['Total Ingresos', `GTQ ${metrics?.totalRevenue.toFixed(2)}`],
        ['Promedio Diario', `GTQ ${metrics?.avgDaily.toFixed(2)}`],
        ['Transacciones', metrics?.transactionCount],
        ['Ticket Promedio', `GTQ ${metrics?.avgTicket.toFixed(2)}`],
      ];
      const wsMetrics = XLSX.utils.aoa_to_sheet(metricsData);
      XLSX.utils.book_append_sheet(wb, wsMetrics, 'Métricas');

      // Servicios
      if (topServices && topServices.length > 0) {
        const wsServices = XLSX.utils.json_to_sheet(topServices);
        XLSX.utils.book_append_sheet(wb, wsServices, 'Top Servicios');
      }

      // Productos
      if (topProducts && topProducts.length > 0) {
        const wsProducts = XLSX.utils.json_to_sheet(topProducts);
        XLSX.utils.book_append_sheet(wb, wsProducts, 'Top Productos');
      }
    } else {
      // Métricas clínicas
      const clinicalMetricsData = [
        ['Métrica', 'Valor'],
        ['Total Citas Atendidas', clinicalMetrics.totalCitas],
        ['Pacientes Únicos', clinicalMetrics.pacientesUnicos],
        ['Total Consultas', clinicalMetrics.totalConsultas],
        ['Total Cirugías', clinicalMetrics.totalCirugias],
        ['Ingresos Facturados', `GTQ ${clinicalMetrics.revenueReal.toFixed(2)}`],
      ];
      const wsMetrics = XLSX.utils.aoa_to_sheet(clinicalMetricsData);
      XLSX.utils.book_append_sheet(wb, wsMetrics, 'Métricas Clínicas');

      // Productividad por doctor
      if (doctorStats && doctorStats.length > 0) {
        const wsDoctors = XLSX.utils.json_to_sheet(
          doctorStats.map((d: any) => ({
            Doctor: d.doctor,
            Consultas: d.consultas,
            Reconsultas: d.reconsultas,
            Procedimientos: d.procedimientos,
            Cirugías: d.cirugias,
            Estudios: d.estudios,
            'Total Citas': d.total,
            'Ingresos Facturados': `GTQ ${Number(d.revenue_real).toFixed(2)}`,
          }))
        );
        XLSX.utils.book_append_sheet(wb, wsDoctors, 'Productividad Médicos');
      }

      // Actividad por tipo
      if (activityByType && activityByType.length > 0) {
        const wsActivity = XLSX.utils.json_to_sheet(
          activityByType.map((a: any) => ({
            'Tipo de Cita': a.tipo,
            Cantidad: a.cantidad,
            Revenue: `GTQ ${Number(a.revenue).toFixed(2)}`,
          }))
        );
        XLSX.utils.book_append_sheet(wb, wsActivity, 'Actividad por Tipo');
      }
    }

    const fileName = viewMode === 'financial' 
      ? `analytics-financiero-${format(new Date(), 'yyyy-MM-dd')}.xlsx`
      : `analytics-clinico-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/caja')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="bg-primary p-2 rounded-lg">
                <TrendingUp className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Analíticas de Caja</h1>
                <p className="text-sm text-muted-foreground">Reportes y estadísticas financieras</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Vista" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial">Vista Financiera</SelectItem>
                  <SelectItem value="clinical">Vista Clínica</SelectItem>
                </SelectContent>
              </Select>

              {viewMode === 'clinical' && (
                <Select value={selectedDoctor || 'all'} onValueChange={(v) => setSelectedDoctor(v === 'all' ? null : v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todos los doctores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los doctores</SelectItem>
                    {doctors?.map((doc) => (
                      <SelectItem key={doc.user_id} value={doc.user_id}>
                        {doc.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodType)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Seleccionar período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoy</SelectItem>
                  <SelectItem value="week">Esta Semana</SelectItem>
                  <SelectItem value="month">Este Mes</SelectItem>
                  <SelectItem value="custom">Rango Personalizado</SelectItem>
                </SelectContent>
              </Select>

              {period === 'custom' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-[240px] justify-start text-left font-normal')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, 'dd/MM/yy')} - {format(dateRange.to, 'dd/MM/yy')}
                          </>
                        ) : (
                          format(dateRange.from, 'dd/MM/yy')
                        )
                      ) : (
                        'Seleccionar fechas'
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={2}
                      locale={es}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              )}

              <Button onClick={exportToExcel} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Métricas Principales */}
        {viewMode === 'clinical' ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Citas Atendidas</CardDescription>
                <CardTitle className="text-2xl text-blue-600">
                  {clinicalMetrics.totalCitas}
                </CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pacientes Únicos</CardDescription>
                <CardTitle className="text-2xl text-green-600">
                  {clinicalMetrics.pacientesUnicos}
                </CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Consultas</CardDescription>
                <CardTitle className="text-2xl text-purple-600">
                  {clinicalMetrics.totalConsultas}
                </CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Cirugías</CardDescription>
                <CardTitle className="text-2xl text-red-600">
                  {clinicalMetrics.totalCirugias}
                </CardTitle>
              </CardHeader>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
              <CardHeader className="pb-2">
                <CardDescription>Ingresos Facturados</CardDescription>
                <CardTitle className="text-2xl text-green-700 dark:text-green-400">
                  GTQ {clinicalMetrics.revenueReal.toFixed(2)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Ingresos</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                GTQ {metrics?.totalRevenue.toFixed(2) || '0.00'}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Promedio Diario</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                GTQ {metrics?.avgDaily.toFixed(2) || '0.00'}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Transacciones</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Receipt className="h-5 w-5 text-orange-600" />
                {metrics?.transactionCount || 0}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ticket Promedio</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Ticket className="h-5 w-5 text-purple-600" />
                GTQ {metrics?.avgTicket.toFixed(2) || '0.00'}
              </CardTitle>
            </CardHeader>
          </Card>
          </div>
        )}

        {/* Gráficas */}
        {viewMode === 'clinical' ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gráfica: Actividad por Tipo */}
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-blue-600" />
                    Actividad Clínica por Tipo
                  </CardTitle>
                  <CardDescription>Distribución de citas atendidas</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={activityByType || []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="tipo" 
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                        angle={-15}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        yAxisId="left"
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        stroke="#10b981"
                        style={{ fontSize: '12px' }}
                        tickFormatter={(value) => `Q${value}`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="cantidad" fill="#3b82f6" name="Cantidad" />
                      <Bar yAxisId="right" dataKey="revenue" fill="#10b981" name="Revenue (GTQ)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Gráfica: Tendencia Diaria */}
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Tendencia de Citas Atendidas
                  </CardTitle>
                  <CardDescription>Citas completadas por día</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={dailyAppointments || []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="day" 
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis 
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="citas" 
                        stroke="#10b981" 
                        strokeWidth={3}
                        dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, fill: '#059669' }}
                        name="Citas Atendidas"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Tabla de Productividad por Doctor */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  Productividad por Médico
                </CardTitle>
                <CardDescription>
                  Desglose de actividad y revenue por doctor
                  {selectedDoctor && ` - Mostrando solo: ${doctors?.find(d => d.user_id === selectedDoctor)?.full_name}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Doctor</TableHead>
                        <TableHead className="text-right">Consultas</TableHead>
                        <TableHead className="text-right">Reconsultas</TableHead>
                        <TableHead className="text-right">Procedimientos</TableHead>
                        <TableHead className="text-right">Cirugías</TableHead>
                        <TableHead className="text-right">Estudios</TableHead>
                        <TableHead className="text-right">Total Citas</TableHead>
                        <TableHead className="text-right bg-green-50 dark:bg-green-950/20">Ingresos Facturados</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {doctorStats && doctorStats.length > 0 ? (
                        <>
                          {doctorStats.map((doctor: any, index: number) => {
                            // Buscar el doctor_id del primer registro de stats para este doctor
                            const doctorRecord = clinicalStats?.find(s => s.doctor_name === doctor.doctor);
                            const doctorId = doctorRecord?.doctor_id;
                            
                            return (
                              <TableRow key={index} className="hover:bg-muted/50">
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <span>{doctor.doctor}</span>
                                    {doctorId && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0"
                                        onClick={() => {
                                          setSelectedDoctorForDetail({ id: doctorId, name: doctor.doctor });
                                          setDetailDialogOpen(true);
                                        }}
                                      >
                                        <FileText className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{doctor.consultas}</TableCell>
                                <TableCell className="text-right">{doctor.reconsultas}</TableCell>
                                <TableCell className="text-right">{doctor.procedimientos}</TableCell>
                                <TableCell className="text-right text-red-600 font-semibold">{doctor.cirugias}</TableCell>
                                <TableCell className="text-right">{doctor.estudios}</TableCell>
                                <TableCell className="text-right font-bold">{doctor.total}</TableCell>
                                <TableCell className="text-right bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400">
                                  GTQ {Number(doctor.revenue_real).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted font-bold border-t-2">
                            <TableCell>TOTALES</TableCell>
                            <TableCell className="text-right">
                              {(doctorStats as any[]).reduce((sum: number, d: any) => sum + (Number(d.consultas) || 0), 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              {(doctorStats as any[]).reduce((sum: number, d: any) => sum + (Number(d.reconsultas) || 0), 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              {(doctorStats as any[]).reduce((sum: number, d: any) => sum + (Number(d.procedimientos) || 0), 0)}
                            </TableCell>
                            <TableCell className="text-right text-red-600">
                              {(doctorStats as any[]).reduce((sum: number, d: any) => sum + (Number(d.cirugias) || 0), 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              {(doctorStats as any[]).reduce((sum: number, d: any) => sum + (Number(d.estudios) || 0), 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              {(doctorStats as any[]).reduce((sum: number, d: any) => sum + (Number(d.total) || 0), 0)}
                            </TableCell>
                            <TableCell className="text-right bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                              GTQ {((doctorStats as any[]).reduce((sum: number, d: any) => sum + (Number(d.revenue_real) || 0), 0)).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        </>
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            {clinicalStatsLoading ? 'Cargando datos...' : 'No hay datos de productividad'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ingresos por Día */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Ingresos por Día
              </CardTitle>
              <CardDescription>Tendencia de ingresos diarios</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={dailyRevenue || []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="colorMonto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="day" 
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                    tickFormatter={(value) => `Q${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value) => [`GTQ ${Number(value).toFixed(2)}`, 'Ingresos']}
                    labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '10px' }}
                    iconType="circle"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="monto" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#059669' }}
                    name="Ingresos Diarios"
                    fill="url(#colorMonto)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Ventas por Tipo de Servicio */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                Ventas por Tipo de Servicio
              </CardTitle>
              <CardDescription>Distribución de servicios vendidos</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={servicesSales || []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.9}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.6}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="tipo" 
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                    tickFormatter={(value) => `Q${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value) => [`GTQ ${Number(value).toFixed(2)}`, 'Total Vendido']}
                    labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '10px' }}
                    iconType="circle"
                  />
                  <Bar 
                    dataKey="total" 
                    fill="url(#colorBar)" 
                    name="Total Vendido"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Métodos de Pago */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-purple-600" />
                Métodos de Pago
              </CardTitle>
              <CardDescription>Distribución porcentual de pagos</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <defs>
                    {COLORS.map((color, index) => (
                      <linearGradient key={`gradient-${index}`} id={`pieGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={1}/>
                        <stop offset="100%" stopColor={color} stopOpacity={0.8}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={paymentMethods || []}
                    dataKey="total"
                    nameKey="metodo"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={5}
                    label={(entry) => {
                      const percent = ((entry.total / (paymentMethods?.reduce((sum, p) => sum + p.total, 0) || 1)) * 100).toFixed(1);
                      return `${entry.metodo}: ${percent}%`;
                    }}
                    labelLine={{ stroke: '#6b7280', strokeWidth: 1 }}
                  >
                    {paymentMethods?.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={`url(#pieGradient${index % COLORS.length})`}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value, name) => [
                      `GTQ ${Number(value).toFixed(2)}`,
                      name
                    ]}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36}
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Análisis de Descuentos */}
          <Card className="shadow-lg bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <Ticket className="h-5 w-5" />
                Análisis de Descuentos
              </CardTitle>
              <CardDescription>Resumen de descuentos otorgados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-red-100 dark:border-red-900">
                <span className="text-sm font-medium text-muted-foreground">Total en Descuentos</span>
                <span className="text-xl font-bold text-red-600 dark:text-red-400">
                  GTQ {discounts?.totalDiscounts.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-orange-100 dark:border-orange-900">
                <span className="text-sm font-medium text-muted-foreground">Promedio por Factura</span>
                <span className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                  GTQ {discounts?.avgDiscount.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-yellow-100 dark:border-yellow-900">
                <span className="text-sm font-medium text-muted-foreground">Facturas con Descuento</span>
                <span className="text-lg font-semibold text-yellow-700 dark:text-yellow-400">
                  {discounts?.count || 0}
                </span>
              </div>
            </CardContent>
          </Card>
          </div>
        )}

        {/* Historial de Cierres y Top 10 Tablas (Solo Vista Financiera) */}
        {viewMode === 'financial' && (
          <>
            <Card>
          <CardHeader>
            <CardTitle>Historial de Cierres de Caja</CardTitle>
            <CardDescription>Registro de cierres realizados en el período</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Total Facturado</TableHead>
                    <TableHead className="text-right">Total Cobrado</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closures && closures.length > 0 ? (
                    closures.map((closure) => (
                      <TableRow key={closure.id}>
                        <TableCell>{format(new Date(closure.closure_date), 'dd/MM/yyyy HH:mm', { locale: es })}</TableCell>
                        <TableCell>{closure.userName}</TableCell>
                        <TableCell className="text-right">GTQ {Number(closure.total_invoiced).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-green-600">
                          GTQ {Number(closure.total_collected).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          GTQ {Number(closure.total_pending).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No hay cierres en este período
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Top 10 Tablas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Productos Más Vendidos */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Productos Más Vendidos</CardTitle>
              <CardDescription>Productos con mayor volumen de ventas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts && topProducts.length > 0 ? (
                      topProducts.map((product, index) => (
                        <TableRow key={index}>
                          <TableCell>{product.producto}</TableCell>
                          <TableCell className="text-right">{product.cantidad}</TableCell>
                          <TableCell className="text-right">GTQ {product.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No hay datos de productos
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Servicios Más Solicitados */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Servicios Más Solicitados</CardTitle>
              <CardDescription>Servicios con mayor demanda</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Servicio</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topServices && topServices.length > 0 ? (
                      topServices.map((service, index) => (
                        <TableRow key={index}>
                          <TableCell>{service.servicio}</TableCell>
                          <TableCell className="text-right">{service.cantidad}</TableCell>
                          <TableCell className="text-right">GTQ {service.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No hay datos de servicios
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>

      {/* Dialog de desglose detallado */}
      {selectedDoctorForDetail && from && to && (
        <DoctorDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          doctorId={selectedDoctorForDetail.id}
          doctorName={selectedDoctorForDetail.name}
          startDate={from}
          endDate={to}
          branchId={branchId}
        />
      )}
    </div>
  );
}
