import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { CheckCircle2, AlertCircle } from 'lucide-react';

type ResultsTableProps = {
  data: any[];
  selectedColumns: Set<string>;
  isLoading: boolean;
};

const columnLabels: Record<string, string> = {
  patient_code: 'Código',
  patient_age: 'Edad',
  patient_gender: 'Género',
  patient_occupation: 'Ocupación',
  has_diabetes_flag: 'Diabetes',
  has_hta_flag: 'HTA',
  allergies: 'Alergias',
  ophthalmic_history: 'Antec. Oftalm.',
  encounter_date: 'Fecha',
  encounter_type: 'Tipo',
  doctor_name: 'Doctor',
  motivo_consulta: 'Motivo',
  diagnosis_summary: 'Diagnóstico',
  autorefractor: 'Autorefractómetro',
  lensometry: 'Lensometría',
  pio_od_preconsult: 'PIO OD (Pre)',
  pio_os_preconsult: 'PIO OS (Pre)',
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
  rx_sphere_od: 'RX Esf OD',
  rx_cyl_od: 'RX Cil OD',
  rx_axis_od: 'RX Eje OD',
  rx_add_od: 'RX Add OD',
  rx_sphere_os: 'RX Esf OS',
  rx_cyl_os: 'RX Cil OS',
  rx_axis_os: 'RX Eje OS',
  rx_add_os: 'RX Add OS',
  prescription_notes_od: 'Notas RX OD',
  prescription_notes_os: 'Notas RX OS',
  slit_lamp_od: 'Lámpara OD',
  fundus_od: 'Fondo OD',
  pio_exam_od: 'PIO OD (Ex)',
  slit_lamp_os: 'Lámpara OS',
  fundus_os: 'Fondo OS',
  pio_exam_os: 'PIO OS (Ex)',
  surgery_type: 'Cirugía',
  surgery_eye: 'Ojo',
  surgery_consent: 'Consent.',
  surgery_note: 'Nota Op.',
  surgery_medication: 'Medicación',
  has_postop_encounter: 'Post-Op',
};

const formatCellValue = (key: string, value: any) => {
  if (value === null || value === undefined) return '-';

  if (key === 'encounter_date') {
    return format(new Date(value), 'dd/MM/yyyy');
  }

  if (key === 'has_diabetes_flag' || key === 'has_hta_flag' || key === 'surgery_consent') {
    return value ? '✓' : '✗';
  }

  if (key === 'has_postop_encounter') {
    return value ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : (
      <AlertCircle className="h-4 w-4 text-yellow-600" />
    );
  }

  if (key === 'encounter_type') {
    const typeColors: Record<string, string> = {
      consulta: 'bg-blue-100 text-blue-800',
      reconsulta: 'bg-purple-100 text-purple-800',
      cirugia: 'bg-red-100 text-red-800',
      procedimiento: 'bg-orange-100 text-orange-800',
      estudios: 'bg-green-100 text-green-800',
    };
    return (
      <Badge variant="outline" className={typeColors[value] || ''}>
        {value}
      </Badge>
    );
  }

  if (typeof value === 'string' && value.length > 50) {
    return (
      <span className="text-sm" title={value}>
        {value.substring(0, 50)}...
      </span>
    );
  }

  return value;
};

export default function ResultsTable({ data, selectedColumns, isLoading }: ResultsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay resultados. Ajusta los filtros y haz clic en Buscar.
      </div>
    );
  }

  const columnsArray = Array.from(selectedColumns);

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columnsArray.map((col) => (
              <TableHead key={col} className="whitespace-nowrap">
                {columnLabels[col] || col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow
              key={i}
              className={
                row.encounter_type === 'cirugia' && !row.has_postop_encounter
                  ? 'bg-yellow-50 hover:bg-yellow-100'
                  : ''
              }
            >
              {columnsArray.map((col) => (
                <TableCell key={col} className="whitespace-nowrap">
                  {formatCellValue(col, row[col])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
