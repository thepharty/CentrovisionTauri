import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Search, Receipt, XCircle, CalendarIcon, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Types for Tauri commands
interface DoctorActivityDetail {
  appointment_id: string;
  patient_code: string | null;
  patient_name: string;
  appointment_type: string;
  appointment_date: string;
  is_invoiced: boolean;
  is_courtesy: boolean;
  invoice_amount: number;
  surgery_type: string | null;
  procedure_type: string | null;
}

interface ReferredStudy {
  id: string;
  title: string | null;
  eye_side: string | null;
  created_at: string;
  patient_code: string | null;
  patient_first_name: string;
  patient_last_name: string;
  files_count: number;
}

interface DoctorDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
  startDate: Date;
  endDate: Date;
  branchId?: string;
}

export function DoctorDetailDialog({
  open,
  onOpenChange,
  doctorId,
  doctorName,
  startDate,
  endDate,
  branchId,
}: DoctorDetailDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [localStartDate, setLocalStartDate] = useState<Date>(startDate);
  const [localEndDate, setLocalEndDate] = useState<Date>(endDate);
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  // Query para obtener el desglose completo (usando v4 con filtro por sucursal)
  const { data: activityDetail, isLoading } = useQuery({
    queryKey: ['doctor-activity-detail-v4', doctorId, localStartDate.toISOString(), localEndDate.toISOString(), branchId, isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        const data = await invoke<DoctorActivityDetail[]>('get_doctor_activity_detail', {
          startDate: localStartDate.toISOString().split('T')[0],
          endDate: localEndDate.toISOString().split('T')[0],
          doctorFilter: doctorId,
          branchFilter: branchId || null,
        });
        return data || [];
      }

      const { data, error } = await supabase.rpc('get_doctor_activity_detail_v4', {
        start_date: localStartDate.toISOString().split('T')[0],
        end_date: localEndDate.toISOString().split('T')[0],
        doctor_filter: doctorId,
        branch_filter: branchId || null,
      });

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!doctorId,
  });

  // Query para obtener estudios referidos por este doctor
  const { data: referredStudies } = useQuery({
    queryKey: ['referred-studies', doctorId, localStartDate.toISOString(), localEndDate.toISOString(), isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        const studies = await invoke<ReferredStudy[]>('get_referred_studies_by_doctor', {
          doctorId,
          startDate: localStartDate.toISOString().split('T')[0],
          endDate: localEndDate.toISOString().split('T')[0],
        });
        // Transform to match expected format
        return (studies || []).map((study) => ({
          id: study.id,
          title: study.title,
          eye_side: study.eye_side,
          created_at: study.created_at,
          patient: {
            first_name: study.patient_first_name,
            last_name: study.patient_last_name,
            patient_code: study.patient_code,
          },
          study_files: Array(study.files_count).fill({ id: 'dummy' }),
        }));
      }

      // Primero buscar el referring_doctor_id asociado a este doctor interno
      const { data: refDoc } = await supabase
        .from('referring_doctors')
        .select('id')
        .eq('internal_profile_id', doctorId)
        .single();

      if (!refDoc) return [];

      // Luego buscar los estudios referidos por este doctor en el rango de fechas
      const { data: studies, error } = await supabase
        .from('studies')
        .select(`
          id,
          title,
          eye_side,
          comments,
          created_at,
          patient:patients(id, first_name, last_name, patient_code),
          study_files(id)
        `)
        .eq('referring_doctor_id', refDoc.id)
        .gte('created_at', localStartDate.toISOString().split('T')[0])
        .lte('created_at', localEndDate.toISOString().split('T')[0] + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return studies || [];
    },
    enabled: open && !!doctorId,
  });

  // Transformar estudios referidos al mismo formato que las citas
  const transformedStudies = (referredStudies || []).map((study: any) => ({
    appointment_id: `study-${study.id}`,
    patient_code: study.patient?.patient_code || '-',
    patient_name: study.patient
      ? `${study.patient.first_name} ${study.patient.last_name}`.toUpperCase()
      : '-',
    appointment_type: 'estudio_referido',
    appointment_date: study.created_at,
    is_invoiced: false,
    is_courtesy: false,
    invoice_amount: 0,
    surgery_type: null,
    procedure_type: null,
    study_title: study.title,
    study_eye_side: study.eye_side,
    study_files_count: study.study_files?.length || 0,
  }));

  // Combinar citas con estudios referidos
  const allData = [...(activityDetail || []), ...transformedStudies];

  // Agrupar datos por tipo de cita
  const groupedData = allData.reduce((acc: any, item: any) => {
    const type = item.appointment_type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(item);
    return acc;
  }, {});

  // Filtrar datos por búsqueda
  const filterData = (data: any[]) => {
    if (!searchTerm) return data;
    return data.filter((item: any) =>
      item.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.patient_code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // Obtener datos según tab activo
  const getFilteredData = () => {
    if (!allData || allData.length === 0) return [];
    if (activeTab === 'all') return filterData(allData);
    return filterData(groupedData?.[activeTab] || []);
  };

  const filteredData = getFilteredData();

  // Calcular totales (solo revenue real de facturas)
  const totals = {
    count: filteredData.length,
    invoiced: filteredData.filter((item: any) => item.is_invoiced).length,
    notInvoiced: filteredData.filter((item: any) => !item.is_invoiced).length,
    courtesy: filteredData.filter((item: any) => item.is_courtesy).length,
    totalRevenue: filteredData.reduce((sum: number, item: any) => 
      sum + (item.is_invoiced ? Number(item.invoice_amount || 0) : 0), 0),
  };

  // Mapeo de tipos de citas
  const appointmentTypeLabels: Record<string, string> = {
    'nueva_consulta': 'Nueva Consulta',
    'reconsulta_menos_3m': 'Reconsulta <3m',
    'reconsulta_mas_3m': 'Reconsulta >3m',
    'post_operado': 'Post Operado',
    'procedimiento': 'Procedimiento',
    'cirugia': 'Cirugía',
    'estudio': 'Estudio',
    'estudio_referido': 'Estudio Referido',
  };

  // Obtener tabs dinámicamente
  const availableTabs = groupedData ? Object.keys(groupedData).sort() : [];

  // Función para exportar a Excel
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Hoja de resumen
    const summaryData = [
      ['Desglose de Actividad - ' + doctorName],
      ['Período', `${format(localStartDate, 'dd/MM/yyyy', { locale: es })} - ${format(localEndDate, 'dd/MM/yyyy', { locale: es })}`],
      [''],
      ['Tipo de Cita', activeTab === 'all' ? 'Todas' : appointmentTypeLabels[activeTab]],
      [''],
      ['Total de Citas', totals.count],
      ['Citas Facturadas', totals.invoiced],
      ['Citas No Facturadas', totals.notInvoiced],
      [''],
      ['Revenue Total (Facturado)', `GTQ ${totals.totalRevenue.toFixed(2)}`],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    // Hoja de detalle
    const detailData = filteredData.map((item: any) => ({
      'Código Paciente': item.patient_code,
      'Nombre Paciente': item.patient_name,
      'Tipo de Cita': appointmentTypeLabels[item.appointment_type] || item.appointment_type,
      'Detalles': item.surgery_type || item.procedure_type || '',
      'Fecha': format(new Date(item.appointment_date), 'dd/MM/yyyy', { locale: es }),
      'Estado': item.is_invoiced ? 'Facturado' : 'No Facturado',
      'Cortesía': item.is_courtesy ? 'Sí' : 'No',
      'Revenue': item.is_invoiced ? `GTQ ${Number(item.invoice_amount).toFixed(2)}` : 'GTQ 0.00',
    }));
    const wsDetalle = XLSX.utils.json_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle Completo');

    // Exportar por tipo si es "todas"
    if (activeTab === 'all' && groupedData) {
      availableTabs.forEach(type => {
        const typeData = groupedData[type].map((item: any) => ({
          'Código Paciente': item.patient_code,
          'Nombre Paciente': item.patient_name,
          'Detalles': item.surgery_type || item.procedure_type || '',
          'Fecha': format(new Date(item.appointment_date), 'dd/MM/yyyy', { locale: es }),
          'Estado': item.is_invoiced ? 'Facturado' : 'No Facturado',
          'Cortesía': item.is_courtesy ? 'Sí' : 'No',
          'Revenue': item.is_invoiced ? `GTQ ${Number(item.invoice_amount).toFixed(2)}` : 'GTQ 0.00',
        }));
        const wsType = XLSX.utils.json_to_sheet(typeData);
        const sheetName = (appointmentTypeLabels[type] || type).substring(0, 31);
        XLSX.utils.book_append_sheet(wb, wsType, sheetName);
      });
    }

    const fileName = `desglose-${doctorName.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Desglose Detallado - {doctorName}
          </DialogTitle>
          <DialogDescription className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <span className="text-sm font-medium">Período:</span>
              
              {/* Selector de Fecha Inicio */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "justify-start text-left font-normal gap-2",
                      !localStartDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {localStartDate ? format(localStartDate, 'dd/MM/yyyy', { locale: es }) : 'Fecha inicio'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={localStartDate}
                    onSelect={(date) => date && setLocalStartDate(date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <span className="text-sm">hasta</span>

              {/* Selector de Fecha Fin */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "justify-start text-left font-normal gap-2",
                      !localEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {localEndDate ? format(localEndDate, 'dd/MM/yyyy', { locale: es }) : 'Fecha fin'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={localEndDate}
                    onSelect={(date) => date && setLocalEndDate(date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Estadísticas rápidas */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-4 border-y">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{totals.count}</div>
            <div className="text-xs text-muted-foreground">Total Citas</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{totals.invoiced}</div>
            <div className="text-xs text-muted-foreground">Facturadas</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-muted-foreground">{totals.notInvoiced}</div>
            <div className="text-xs text-muted-foreground">No Facturadas</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{totals.courtesy}</div>
            <div className="text-xs text-muted-foreground">Cortesías</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">GTQ {totals.totalRevenue.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Revenue Total</div>
          </div>
        </div>

        {/* Barra de búsqueda y exportar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o código de paciente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>

        {/* Tabs por tipo de cita */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 gap-1">
            <TabsTrigger value="all">Todas</TabsTrigger>
            {availableTabs.map(type => (
              <TabsTrigger key={type} value={type} className="text-xs">
                {appointmentTypeLabels[type] || type}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {groupedData[type]?.length || 0}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Cargando datos...</div>
            ) : filteredData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <XCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                No hay datos para mostrar
              </div>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Tipo Cita</TableHead>
                      <TableHead>Detalles</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((item: any) => (
                      <TableRow key={item.appointment_id}>
                        <TableCell className="font-mono text-sm">{item.patient_code}</TableCell>
                        <TableCell className="font-medium">{item.patient_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {appointmentTypeLabels[item.appointment_type] || item.appointment_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.appointment_type === 'cirugia' && item.surgery_type
                            ? item.surgery_type
                            : item.appointment_type === 'procedimiento' && item.procedure_type
                              ? item.procedure_type
                              : item.appointment_type === 'estudio_referido' && item.study_title
                                ? `${item.study_title} (${item.study_eye_side === 'OD' ? 'OD' : item.study_eye_side === 'OI' ? 'OI' : 'AO'})`
                                : ''}
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(item.appointment_date), 'dd/MM/yyyy HH:mm', { locale: es })}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {item.is_invoiced ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                <Receipt className="h-3 w-3 mr-1" />
                                Facturado
                              </Badge>
                            ) : (
                              <Badge variant="secondary">No Facturado</Badge>
                            )}
                            {item.is_courtesy && (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-300">
                                <Gift className="h-3 w-3 mr-1" />
                                Cortesía
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className={item.is_invoiced ? 'text-green-700' : 'text-muted-foreground'}>
                            GTQ {item.is_invoiced ? Number(item.invoice_amount).toFixed(2) : '0.00'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
