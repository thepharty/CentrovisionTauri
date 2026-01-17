import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { toast } from 'sonner';

type ExportMenuProps = {
  data: any[];
  selectedColumns: Set<string>;
  disabled?: boolean;
  viewMode?: 'encounters' | 'patients';
};

const columnLabels: Record<string, string> = {
  patient_code: 'Código',
  patient_age: 'Edad',
  patient_gender: 'Género',
  patient_occupation: 'Ocupación',
  has_diabetes_flag: 'Diabetes',
  has_hta_flag: 'HTA',
  allergies: 'Alergias',
  ophthalmic_history: 'Antec. Oftálmicos',
  encounter_date: 'Fecha',
  encounter_type: 'Tipo',
  doctor_name: 'Doctor',
  motivo_consulta: 'Motivo',
  diagnosis_summary: 'Diagnóstico',
  autorefractor: 'Autorefractómetro',
  lensometry: 'Lensometría',
  pio_od_preconsult: 'PIO OD (Pre)',
  pio_os_preconsult: 'PIO OS (Pre)',
  av_sc_od: 'AV SC OD',
  av_cc_od: 'AV CC OD',
  av_sc_os: 'AV SC OS',
  av_cc_os: 'AV CC OS',
  ref_subj_sphere_od: 'Esf Sub OD',
  ref_subj_cyl_od: 'Cil Sub OD',
  ref_subj_axis_od: 'Eje Sub OD',
  ref_subj_av_od: 'AV Sub OD',
  ref_subj_sphere_os: 'Esf Sub OS',
  ref_subj_cyl_os: 'Cil Sub OS',
  ref_subj_axis_os: 'Eje Sub OS',
  ref_subj_av_os: 'AV Sub OS',
  rx_sphere_od: 'RX Esf OD',
  rx_cyl_od: 'RX Cil OD',
  rx_axis_od: 'RX Eje OD',
  rx_add_od: 'RX Add OD',
  rx_sphere_os: 'RX Esf OS',
  rx_cyl_os: 'RX Cil OS',
  rx_axis_os: 'RX Eje OS',
  rx_add_os: 'RX Add OS',
  slit_lamp_od: 'Lámpara OD',
  fundus_od: 'Fondo OD',
  pio_exam_od: 'PIO Ex OD',
  slit_lamp_os: 'Lámpara OS',
  fundus_os: 'Fondo OS',
  pio_exam_os: 'PIO Ex OS',
  surgery_type: 'Tipo Cirugía',
  surgery_eye: 'Ojo Cirugía',
  surgery_note: 'Nota Operatoria',
  has_postop_encounter: 'Post-Op',
};

export default function ExportMenu({ data, selectedColumns, disabled = false, viewMode = 'encounters' }: ExportMenuProps) {
  const anonymizeData = (row: any) => {
    const anonymized = { ...row };
    delete anonymized.patient_code;
    delete anonymized.patient_id;
    delete anonymized.encounter_id;
    delete anonymized.appointment_id;
    delete anonymized.doctor_id;
    delete anonymized.doctor_name;
    
    // Usar ID secuencial anónimo
    const index = data.indexOf(row);
    anonymized.patient_anon_id = `PAC-${String(index + 1).padStart(3, '0')}`;
    
    return anonymized;
  };

  const prepareDataForExport = (anonymize: boolean = false) => {
    if (viewMode === 'patients') {
      // Exportación para modo pacientes agrupados
      return data.flatMap((patient: any) => {
        const baseRow: any = {};
        
        // Columnas fijas de paciente
        if (selectedColumns.has('patient_code')) {
          baseRow[columnLabels['patient_code']] = anonymize ? '***' : patient.patient_code;
        }
        if (selectedColumns.has('patient_age')) {
          baseRow[columnLabels['patient_age']] = patient.patient_age;
        }
        if (selectedColumns.has('patient_gender')) {
          baseRow[columnLabels['patient_gender']] = patient.patient_gender;
        }
        
        // Agregar cada visita como columnas separadas
        const visits = patient.visits || [];
        visits.forEach((visit: any, index: number) => {
          const visitPrefix = `V${index + 1}`;
          
          selectedColumns.forEach(column => {
            if (!['patient_code', 'patient_age', 'patient_gender'].includes(column)) {
              const label = `${visitPrefix}_${columnLabels[column] || column}`;
              let value = visit[column];
              
              if (column.includes('date') && value) {
                value = format(new Date(value), 'dd/MM/yyyy');
              }
              
              if (typeof value === 'boolean') {
                value = value ? 'Sí' : 'No';
              }
              
              baseRow[label] = value ?? '';
            }
          });
        });
        
        return [baseRow];
      });
    } else {
      // Exportación para modo consultas (existente)
      const columnsArray = Array.from(selectedColumns);
      
      return data.map((row) => {
        const processedRow = anonymize ? anonymizeData(row) : row;
        const exportRow: any = {};
        
        columnsArray.forEach((col) => {
          const label = columnLabels[col] || col;
          let value = processedRow[col];
          
          if (col === 'encounter_date' && value) {
            value = format(new Date(value), 'dd/MM/yyyy');
          } else if (
            (col === 'has_diabetes_flag' || col === 'has_hta_flag' || col === 'surgery_consent') &&
            typeof value === 'boolean'
          ) {
            value = value ? 'Sí' : 'No';
          } else if (col === 'has_postop_encounter' && typeof value === 'boolean') {
            value = value ? 'Sí' : 'No';
          }
          
          exportRow[label] = value ?? '';
        });
        
        return exportRow;
      });
    }
  };

  const exportToExcel = (anonymize: boolean = false) => {
    try {
      const exportData = prepareDataForExport(anonymize);
      
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Datos Clínicos');
      
      // Agregar hoja de estadísticas
      const stats = {
        'Total de casos': data.length,
        'Casos con pre-op': data.filter((d) => d.av_sc_od || d.autorefractor).length,
        'Casos con post-op': data.filter((d) => d.has_postop_encounter).length,
        'Edad promedio': (
          data.reduce((sum, d) => sum + (d.patient_age || 0), 0) / data.length
        ).toFixed(1),
        'Con Diabetes': data.filter((d) => d.has_diabetes_flag).length,
        'Con HTA': data.filter((d) => d.has_hta_flag).length,
      };
      
      const statsData = Object.entries(stats).map(([key, value]) => ({
        Métrica: key,
        Valor: value,
      }));
      
      const wsStats = XLSX.utils.json_to_sheet(statsData);
      XLSX.utils.book_append_sheet(wb, wsStats, 'Estadísticas');
      
      const filename = `estudio_clinico_${anonymize ? 'anonimo_' : ''}${format(
        new Date(),
        'yyyy-MM-dd_HHmm'
      )}.xlsx`;
      XLSX.writeFile(wb, filename);
      
      toast.success(`Exportado: ${filename}`);
    } catch (error) {
      toast.error('Error al exportar a Excel');
      console.error(error);
    }
  };

  const exportToCSV = () => {
    try {
      const exportData = prepareDataForExport(false);
      
      const ws = XLSX.utils.json_to_sheet(exportData);
      const csv = XLSX.utils.sheet_to_csv(ws);
      
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `estudio_clinico_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Exportado a CSV');
    } catch (error) {
      toast.error('Error al exportar a CSV');
      console.error(error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Formato de exportación</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={() => exportToExcel(false)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Excel Completo
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={exportToCSV}>
          <FileText className="h-4 w-4 mr-2" />
          CSV Simple
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={() => exportToExcel(true)}>
          <Lock className="h-4 w-4 mr-2" />
          Versión Anonimizada
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
