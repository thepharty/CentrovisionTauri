import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';

type PatientData = {
  patient_id: string;
  patient_code: string;
  patient_age: number;
  patient_gender: string;
  patient_occupation?: string;
  has_diabetes_flag: boolean;
  has_hta_flag: boolean;
  allergies?: string;
  ophthalmic_history?: string;
  patient_notes?: string;
  visits: any[];
};

type PatientGroupedResultsTableProps = {
  data: PatientData[];
  selectedColumns: Set<string>;
  isLoading: boolean;
};

const columnLabels: Record<string, string> = {
  patient_code: 'Código Paciente',
  patient_age: 'Edad',
  patient_gender: 'Género',
  patient_occupation: 'Ocupación',
  has_diabetes_flag: 'Diabetes',
  has_hta_flag: 'HTA',
  allergies: 'Alergias',
  ophthalmic_history: 'Historia Oftálmica',
  patient_notes: 'Notas',
  encounter_type: 'Tipo Encuentro',
  appointment_type: 'Tipo Cita',
  doctor_name: 'Doctor',
  motivo_consulta: 'Motivo',
  diagnosis_summary: 'Diagnóstico',
  autorefractor: 'Autorefractor',
  lensometry: 'Lensometría',
  pio_od_preconsult: 'PIO OD Pre',
  pio_os_preconsult: 'PIO OS Pre',
  keratometry_od_k1: 'K1 OD',
  keratometry_od_k2: 'K2 OD',
  keratometry_os_k1: 'K1 OS',
  keratometry_os_k2: 'K2 OS',
  av_sc_od: 'AV SC OD',
  av_cc_od: 'AV CC OD',
  av_sc_os: 'AV SC OS',
  av_cc_os: 'AV CC OS',
  ref_subj_sphere_od: 'Esf OD',
  ref_subj_cyl_od: 'Cil OD',
  ref_subj_axis_od: 'Eje OD',
  ref_subj_av_od: 'AV OD',
  ref_subj_sphere_os: 'Esf OS',
  ref_subj_cyl_os: 'Cil OS',
  ref_subj_axis_os: 'Eje OS',
  ref_subj_av_os: 'AV OS',
  rx_sphere_od: 'Rx Esf OD',
  rx_cyl_od: 'Rx Cil OD',
  rx_axis_od: 'Rx Eje OD',
  rx_add_od: 'Rx Add OD',
  rx_sphere_os: 'Rx Esf OS',
  rx_cyl_os: 'Rx Cil OS',
  rx_axis_os: 'Rx Eje OS',
  rx_add_os: 'Rx Add OS',
  slit_lamp_od: 'Lámpara OD',
  fundus_od: 'Fondo OD',
  pio_exam_od: 'PIO OD',
  plan_od: 'Plan OD',
  slit_lamp_os: 'Lámpara OS',
  fundus_os: 'Fondo OS',
  pio_exam_os: 'PIO OS',
  plan_os: 'Plan OS',
  plan_tratamiento: 'Plan',
  cirugias_recomendadas: 'Cirugías',
  estudios_recomendados: 'Estudios',
  surgery_type: 'Tipo Cirugía',
  surgery_eye: 'Ojo Cirugía',
  procedure_type: 'Tipo Procedimiento',
  studies_list: 'Estudios',
};

const patientColumns = ['patient_code', 'patient_age', 'patient_gender'];

const formatCellValue = (key: string, value: any) => {
  if (value === null || value === undefined) return '-';
  
  if (key.includes('date') && value) {
    return format(new Date(value), 'dd/MM/yyyy', { locale: es });
  }
  
  if (typeof value === 'boolean') {
    return value ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />;
  }
  
  if (key === 'encounter_type' || key === 'appointment_type') {
    return <Badge variant="outline">{value}</Badge>;
  }
  
  if (typeof value === 'string' && value.length > 100) {
    return value.substring(0, 100) + '...';
  }
  
  return value;
};

export default function PatientGroupedResultsTable({
  data,
  selectedColumns,
  isLoading,
}: PatientGroupedResultsTableProps) {
  // Debug logging
  console.log('🔍 PatientGroupedResultsTable data:', data);
  console.log('🔍 First patient visits:', data[0]?.visits);
  console.log('🔍 Selected columns:', Array.from(selectedColumns));

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No se encontraron resultados
      </div>
    );
  }

  // Mejorar el cálculo de maxVisits y totalVisits asegurando que visits es un array
  const maxVisits = Math.max(...data.map(p => {
    const visits = Array.isArray(p.visits) ? p.visits : [];
    return visits.length;
  }), 0);
  
  const totalVisits = data.reduce((sum, p) => {
    const visits = Array.isArray(p.visits) ? p.visits : [];
    return sum + visits.length;
  }, 0);

  const visiblePatientColumns = patientColumns.filter(col => selectedColumns.has(col));
  const visitColumns = Array.from(selectedColumns).filter(col => !patientColumns.includes(col));

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Mostrando {data.length} pacientes con {totalVisits} visitas totales
      </div>
      
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {visiblePatientColumns.map(col => (
                <TableHead key={col} className="bg-muted font-semibold">
                  {columnLabels[col]}
                </TableHead>
              ))}
              {Array.from({ length: maxVisits }).map((_, visitIndex) => {
                // Obtener la fecha de la primera visita con este índice para usar como header
                const firstPatientWithVisit = data.find(p => {
                  const visits = Array.isArray(p.visits) ? p.visits : [];
                  return visits[visitIndex];
                });
                const visit = firstPatientWithVisit?.visits?.[visitIndex];
                
                return (
                  <TableHead
                    key={`visit-${visitIndex}`}
                    colSpan={visitColumns.length}
                    className="bg-primary/10 text-center font-bold border-l-2 border-primary/30"
                  >
                    {visit?.encounter_date 
                      ? `Visita ${visitIndex + 1} (${format(new Date(visit.encounter_date), 'dd/MM/yyyy', { locale: es })})`
                      : `Visita ${visitIndex + 1}`
                    }
                  </TableHead>
                );
              })}
            </TableRow>
            <TableRow>
              {visiblePatientColumns.map(col => (
                <TableHead key={`sub-${col}`} className="h-0 p-0" />
              ))}
              {Array.from({ length: maxVisits }).map((_, visitIndex) =>
                visitColumns.map(col => (
                  <TableHead
                    key={`visit-${visitIndex}-${col}`}
                    className="bg-muted/50 text-xs"
                  >
                    {columnLabels[col] || col}
                  </TableHead>
                ))
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((patient, patientIndex) => (
              <TableRow
                key={patient.patient_id}
                className={patientIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
              >
                {visiblePatientColumns.map(col => (
                  <TableCell key={`${patient.patient_id}-${col}`} className="font-medium">
                    {formatCellValue(col, patient[col as keyof PatientData])}
                  </TableCell>
                ))}
                {Array.from({ length: maxVisits }).map((_, visitIndex) => {
                  const visits = Array.isArray(patient.visits) ? patient.visits : [];
                  const visit = visits[visitIndex];
                  
                  if (!visit) {
                    return visitColumns.map(col => (
                      <TableCell
                        key={`${patient.patient_id}-visit-${visitIndex}-${col}-empty`}
                        className="text-muted-foreground text-center"
                      >
                        -
                      </TableCell>
                    ));
                  }

                  return visitColumns.map(col => (
                    <TableCell
                      key={`${patient.patient_id}-visit-${visitIndex}-${col}`}
                      className="border-l border-border/50"
                    >
                      {formatCellValue(col, visit[col])}
                    </TableCell>
                  ));
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
