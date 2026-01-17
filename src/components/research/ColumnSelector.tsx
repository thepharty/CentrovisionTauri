import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Columns, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type ColumnSelectorProps = {
  selectedColumns: Set<string>;
  onColumnsChange: (columns: Set<string>) => void;
};

const columnCategories = {
  paciente: {
    label: 'Datos del Paciente',
    columns: [
      { id: 'patient_code', label: 'Código' },
      { id: 'patient_age', label: 'Edad' },
      { id: 'patient_gender', label: 'Género' },
    ],
  },
  demografia: {
    label: 'Demografía y Contexto',
    columns: [
      { id: 'patient_occupation', label: 'Ocupación' },
      { id: 'encounter_date', label: 'Fecha' },
      { id: 'encounter_type', label: 'Tipo Encuentro' },
      { id: 'appointment_type', label: 'Tipo Cita' },
      { id: 'doctor_name', label: 'Doctor' },
    ],
  },
  historia: {
    label: 'Historia Clínica',
    columns: [
      { id: 'has_diabetes_flag', label: 'Diabetes' },
      { id: 'has_hta_flag', label: 'HTA' },
      { id: 'allergies', label: 'Alergias' },
      { id: 'ophthalmic_history', label: 'Antecedentes oftálmicos' },
    ],
  },
  consulta: {
    label: 'Consulta',
    columns: [
      { id: 'motivo_consulta', label: 'Motivo' },
      { id: 'diagnosis_summary', label: 'Diagnóstico' },
    ],
  },
  preconsulta: {
    label: 'Pre-Consulta',
    columns: [
      { id: 'autorefractor', label: 'Autorefractómetro' },
      { id: 'lensometry', label: 'Lensometría' },
      { id: 'pio_od_preconsult', label: 'PIO OD' },
      { id: 'pio_os_preconsult', label: 'PIO OS' },
      { id: 'keratometry_od_k1', label: 'Keratometría OD K1' },
      { id: 'keratometry_od_k2', label: 'Keratometría OD K2' },
      { id: 'keratometry_os_k1', label: 'Keratometría OS K1' },
      { id: 'keratometry_os_k2', label: 'Keratometría OS K2' },
    ],
  },
  agudeza_visual: {
    label: 'Agudeza Visual',
    columns: [
      { id: 'av_sc_od', label: 'AV SC OD' },
      { id: 'av_cc_od', label: 'AV CC OD' },
      { id: 'av_sc_os', label: 'AV SC OS' },
      { id: 'av_cc_os', label: 'AV CC OS' },
    ],
  },
  refraccion: {
    label: 'Refracción Subjetiva',
    columns: [
      { id: 'ref_subj_sphere_od', label: 'Esfera OD' },
      { id: 'ref_subj_cyl_od', label: 'Cilindro OD' },
      { id: 'ref_subj_axis_od', label: 'Eje OD' },
      { id: 'ref_subj_av_od', label: 'AV lograda OD' },
      { id: 'ref_subj_sphere_os', label: 'Esfera OS' },
      { id: 'ref_subj_cyl_os', label: 'Cilindro OS' },
      { id: 'ref_subj_axis_os', label: 'Eje OS' },
      { id: 'ref_subj_av_os', label: 'AV lograda OS' },
    ],
  },
  receta: {
    label: 'Receta',
    columns: [
      { id: 'rx_sphere_od', label: 'RX Esfera OD' },
      { id: 'rx_cyl_od', label: 'RX Cilindro OD' },
      { id: 'rx_axis_od', label: 'RX Eje OD' },
      { id: 'rx_add_od', label: 'RX Add OD' },
      { id: 'rx_sphere_os', label: 'RX Esfera OS' },
      { id: 'rx_cyl_os', label: 'RX Cilindro OS' },
      { id: 'rx_axis_os', label: 'RX Eje OS' },
      { id: 'rx_add_os', label: 'RX Add OS' },
      { id: 'prescription_notes_od', label: 'Notas OD' },
      { id: 'prescription_notes_os', label: 'Notas OS' },
    ],
  },
  examen_fisico: {
    label: 'Examen Físico',
    columns: [
      { id: 'slit_lamp_od', label: 'Lámpara hendidura OD' },
      { id: 'fundus_od', label: 'Fondo de ojo OD' },
      { id: 'pio_exam_od', label: 'PIO examen OD' },
      { id: 'slit_lamp_os', label: 'Lámpara hendidura OS' },
      { id: 'fundus_os', label: 'Fondo de ojo OS' },
      { id: 'pio_exam_os', label: 'PIO examen OS' },
    ],
  },
  cirugia: {
    label: 'Cirugía',
    columns: [
      { id: 'surgery_type', label: 'Tipo' },
      { id: 'surgery_eye', label: 'Ojo' },
      { id: 'surgery_consent', label: 'Consentimiento' },
      { id: 'surgery_note', label: 'Nota operatoria' },
      { id: 'surgery_medication', label: 'Medicación' },
    ],
  },
};

const presets = {
  cataratas: {
    label: 'Estudio de Cataratas',
    columns: ['patient_code', 'patient_age', 'diagnosis_summary', 'av_cc_od', 'av_cc_os', 'surgery_type', 'has_postop_encounter'],
  },
  refraccion: {
    label: 'Estudio de Refracción',
    columns: ['patient_code', 'patient_age', 'ref_subj_sphere_od', 'ref_subj_cyl_od', 'rx_sphere_od', 'rx_cyl_od', 'av_cc_od'],
  },
  pio: {
    label: 'Estudio de PIO',
    columns: ['patient_code', 'diagnosis_summary', 'pio_od_preconsult', 'pio_os_preconsult', 'pio_exam_od', 'pio_exam_os'],
  },
};

export default function ColumnSelector({ selectedColumns, onColumnsChange }: ColumnSelectorProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['paciente', 'demografia', 'consulta']));

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleColumn = (columnId: string) => {
    const newColumns = new Set(selectedColumns);
    if (newColumns.has(columnId)) {
      newColumns.delete(columnId);
    } else {
      newColumns.add(columnId);
    }
    onColumnsChange(newColumns);
  };

  const applyPreset = (preset: keyof typeof presets) => {
    onColumnsChange(new Set(presets[preset].columns));
  };

  const selectAll = () => {
    const allColumns = Object.values(columnCategories).flatMap((cat) => cat.columns.map((col) => col.id));
    onColumnsChange(new Set(allColumns));
  };

  const clearAll = () => {
    onColumnsChange(new Set());
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Columns className="h-4 w-4 mr-2" />
          Columnas ({selectedColumns.size})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[600px] overflow-y-auto" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Seleccionar columnas</h4>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Todas
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Ninguna
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Presets rápidos:</Label>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(presets).map(([key, preset]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(key as keyof typeof presets)}
                  className="justify-start"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            {Object.entries(columnCategories).map(([key, category]) => (
              <Collapsible
                key={key}
                open={expandedCategories.has(key)}
                onOpenChange={() => toggleCategory(key)}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 p-2 rounded-md">
                  <span className="font-medium text-sm">{category.label}</span>
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 transition-transform',
                      expandedCategories.has(key) && 'rotate-90'
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4 pt-2 space-y-2">
                  {category.columns.map((column) => (
                    <div key={column.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={column.id}
                        checked={selectedColumns.has(column.id)}
                        onCheckedChange={() => toggleColumn(column.id)}
                      />
                      <Label htmlFor={column.id} className="text-sm cursor-pointer">
                        {column.label}
                      </Label>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
