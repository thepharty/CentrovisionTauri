import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Search, RotateCcw, ChevronDown, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ResearchFilters } from '@/pages/Research';
import { cn } from '@/lib/utils';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Type for Tauri Research filters
interface TauriResearchFilters {
  start_date: string;
  end_date: string;
  doctor_filter: string | null;
  diagnosis_filter: string | null;
  search_field_type: string | null;
  surgery_type_filter: string | null;
  appointment_type_filter: string | null;
  has_preop_data: boolean | null;
  has_postop_data: boolean | null;
  min_age: number | null;
  max_age: number | null;
  gender_filter: string | null;
  has_diabetes: boolean | null;
  has_hta: boolean | null;
  has_autorefractor: boolean | null;
  has_lensometry: boolean | null;
  has_keratometry: boolean | null;
  has_pio: boolean | null;
  has_fundus_photos: boolean | null;
  has_slit_lamp: boolean | null;
  has_visual_acuity: boolean | null;
  has_subjective_refraction: boolean | null;
  has_prescription: boolean | null;
}

const getPlaceholderText = (fieldType?: string) => {
  switch(fieldType) {
    case 'all': return 'Buscar en todos los campos...';
    case 'treatment_plan': return 'Buscar en plan de tratamiento...';
    case 'surgeries': return 'Buscar en cirugías...';
    case 'studies': return 'Buscar en estudios...';
    case 'chief_complaint': return 'Buscar en motivo de consulta...';
    case 'physical_exam': return 'Buscar en examen físico...';
    default: return 'Buscar en diagnóstico...';
  }
};

type SearchPanelProps = {
  filters: ResearchFilters;
  onFiltersChange: (filters: ResearchFilters) => void;
  onSearch: (results: any[]) => void;
  onLoadingChange: (loading: boolean) => void;
  viewMode: 'encounters' | 'patients';
  onViewModeChange: (mode: 'encounters' | 'patients') => void;
};

export default function SearchPanel({
  filters,
  onFiltersChange,
  onSearch,
  onLoadingChange,
  viewMode,
  onViewModeChange,
}: SearchPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  const { data: doctors } = useQuery({
    queryKey: ['doctors', isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        // Use analytics doctors command which returns doctor list
        const data = await invoke<{ user_id: string; full_name: string }[]>('get_analytics_doctors');
        return data || [];
      }
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .order('full_name');
      return data || [];
    },
  });

  const handleSearch = async () => {
    onLoadingChange(true);
    try {
      let normalizedData: any[] = [];

      if (isLocalMode) {
        // Build filters object for Tauri command
        const tauriFilters: TauriResearchFilters = {
          start_date: filters.startDate.toISOString(),
          end_date: filters.endDate.toISOString(),
          doctor_filter: filters.doctorId || null,
          diagnosis_filter: filters.diagnosisFilter || null,
          search_field_type: filters.searchFieldType || 'diagnosis',
          surgery_type_filter: filters.surgeryTypeFilter || null,
          appointment_type_filter: filters.appointmentTypeFilter || null,
          has_preop_data: filters.hasPreopData ?? null,
          has_postop_data: filters.hasPostopData ?? null,
          min_age: filters.minAge ?? null,
          max_age: filters.maxAge ?? null,
          gender_filter: filters.genderFilter || null,
          has_diabetes: filters.hasDiabetes ?? null,
          has_hta: filters.hasHta ?? null,
          has_autorefractor: filters.hasAutorefractor ?? null,
          has_lensometry: filters.hasLensometry ?? null,
          has_keratometry: filters.hasKeratometry ?? null,
          has_pio: filters.hasPio ?? null,
          has_fundus_photos: filters.hasFundusPhotos ?? null,
          has_slit_lamp: filters.hasSlitLamp ?? null,
          has_visual_acuity: filters.hasVisualAcuity ?? null,
          has_subjective_refraction: filters.hasSubjectiveRefraction ?? null,
          has_prescription: filters.hasPrescription ?? null,
        };

        const commandName = viewMode === 'patients'
          ? 'get_clinical_research_data_by_patient'
          : 'get_clinical_research_data';

        const data = await invoke<any[]>(commandName, { filters: tauriFilters });
        normalizedData = data || [];
      } else {
        const rpcFunction = viewMode === 'patients'
          ? 'get_clinical_research_data_by_patient'
          : 'get_clinical_research_data';

        const { data, error } = await supabase.rpc(rpcFunction, {
          start_date: filters.startDate.toISOString(),
          end_date: filters.endDate.toISOString(),
          doctor_filter: filters.doctorId || null,
          diagnosis_filter: filters.diagnosisFilter || null,
          search_field_type: filters.searchFieldType || 'diagnosis',
          surgery_type_filter: filters.surgeryTypeFilter || null,
          appointment_type_filter: filters.appointmentTypeFilter || null,
          has_preop_data: filters.hasPreopData ?? null,
          has_postop_data: filters.hasPostopData ?? null,
          min_age: filters.minAge ?? null,
          max_age: filters.maxAge ?? null,
          gender_filter: filters.genderFilter || null,
          has_diabetes: filters.hasDiabetes ?? null,
          has_hta: filters.hasHta ?? null,
          has_autorefractor: filters.hasAutorefractor ?? null,
          has_lensometry: filters.hasLensometry ?? null,
          has_keratometry: filters.hasKeratometry ?? null,
          has_pio: filters.hasPio ?? null,
          has_fundus_photos: filters.hasFundusPhotos ?? null,
          has_slit_lamp: filters.hasSlitLamp ?? null,
          has_visual_acuity: filters.hasVisualAcuity ?? null,
          has_subjective_refraction: filters.hasSubjectiveRefraction ?? null,
          has_prescription: filters.hasPrescription ?? null,
        });

        if (error) throw error;
        normalizedData = data || [];
      }

      // Normalizar datos para modo pacientes
      if (viewMode === 'patients' && normalizedData.length > 0) {
        normalizedData = normalizedData.map((patient: any) => ({
          ...patient,
          visits: Array.isArray(patient.visits) ? patient.visits : []
        }));

        const firstPatient = normalizedData[0] as any;
        console.log('✅ Normalized patient data:', firstPatient);
        console.log('✅ Total visits for first patient:', firstPatient?.visits?.length);
      }

      onSearch(normalizedData);
      toast.success(`${normalizedData?.length || 0} ${viewMode === 'patients' ? 'pacientes' : 'casos'} encontrados`);
    } catch (error: any) {
      toast.error('Error al buscar datos: ' + error.message);
      onSearch([]);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleReset = () => {
    onFiltersChange({
      startDate: new Date(new Date().getFullYear(), 0, 1),
      endDate: new Date(),
    });
    onSearch([]);
  };

  return (
    <Card className="p-6 space-y-6">
      {/* Header con selector de vista */}
      <div className="flex items-center justify-between pb-4 border-b">
        <h2 className="text-lg font-semibold">Filtros de Búsqueda</h2>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Vista:</Label>
          <Button
            variant={viewMode === 'encounters' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('encounters')}
          >
            Por Consultas
          </Button>
          <Button
            variant={viewMode === 'patients' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('patients')}
          >
            Por Pacientes
          </Button>
        </div>
      </div>
      
      {/* Filtros Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>Búsqueda de texto</Label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={filters.searchFieldType || 'all'}
              onValueChange={(value) => 
                onFiltersChange({ 
                  ...filters, 
                  searchFieldType: value as typeof filters.searchFieldType 
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Campo a buscar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los campos</SelectItem>
                <SelectItem value="diagnosis">Diagnóstico</SelectItem>
                <SelectItem value="treatment_plan">Plan de tratamiento</SelectItem>
                <SelectItem value="surgeries">Cirugías recomendadas</SelectItem>
                <SelectItem value="studies">Estudios recomendados</SelectItem>
                <SelectItem value="chief_complaint">Motivo de consulta</SelectItem>
                <SelectItem value="physical_exam">Examen físico</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              placeholder={getPlaceholderText(filters.searchFieldType)}
              value={filters.diagnosisFilter || ''}
              onChange={(e) => onFiltersChange({ ...filters, diagnosisFilter: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Tipo de consulta</Label>
          <Select
            value={filters.appointmentTypeFilter || 'all'}
            onValueChange={(value) => {
              onFiltersChange({
                ...filters,
                appointmentTypeFilter: value === 'all' ? undefined : value as typeof filters.appointmentTypeFilter,
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="nueva_consulta">Nueva Consulta</SelectItem>
              <SelectItem value="reconsulta_menos_3m">Reconsulta - de 3 meses</SelectItem>
              <SelectItem value="reconsulta_mas_3m">Reconsulta + de 3 meses</SelectItem>
              <SelectItem value="post_operado">Post Operado</SelectItem>
              <SelectItem value="consulta">Consulta</SelectItem>
              <SelectItem value="control">Control</SelectItem>
              <SelectItem value="diagnostico">Diagnóstico</SelectItem>
              <SelectItem value="cirugia">Cirugía</SelectItem>
              <SelectItem value="procedimiento">Procedimiento</SelectItem>
              <SelectItem value="estudio">Estudio</SelectItem>
              <SelectItem value="lectura_resultados">Lectura de Resultados</SelectItem>
              <SelectItem value="cortesia">Cortesía</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Fecha inicio</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left">
                {format(filters.startDate, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={filters.startDate}
                onSelect={(date) => date && onFiltersChange({ ...filters, startDate: date })}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Fecha fin</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left">
                {format(filters.endDate, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={filters.endDate}
                onSelect={(date) => date && onFiltersChange({ ...filters, endDate: date })}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Doctor</Label>
          <Select
            value={filters.doctorId || 'all'}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, doctorId: value === 'all' ? undefined : value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {doctors?.map((doc) => (
                <SelectItem key={doc.user_id} value={doc.user_id}>
                  {doc.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* OCULTO: Tipo de cirugía
        <div className="space-y-2">
          <Label>Tipo de cirugía</Label>
          <Input
            placeholder="ej: catarata"
            value={filters.surgeryTypeFilter || ''}
            onChange={(e) => onFiltersChange({ ...filters, surgeryTypeFilter: e.target.value })}
          />
        </div>
        */}

        {/* OCULTO: Con datos pre-op
        <div className="flex items-end gap-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="preop"
              checked={filters.hasPreopData || false}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, hasPreopData: checked as boolean })
              }
            />
            <Label htmlFor="preop" className="cursor-pointer">
              Con datos pre-op
            </Label>
          </div>
        </div>
        */}

        {/* OCULTO: Con seguimiento post-op
        <div className="flex items-end gap-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="postop"
              checked={filters.hasPostopData || false}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, hasPostopData: checked as boolean })
              }
            />
            <Label htmlFor="postop" className="cursor-pointer">
              Con seguimiento post-op
            </Label>
          </div>
        </div>
        */}
      </div>

      {/* Filtros Avanzados */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros Avanzados
            </span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', showAdvanced && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Edad mínima</Label>
              <Input
                type="number"
                placeholder="0"
                value={filters.minAge || ''}
                onChange={(e) =>
                  onFiltersChange({ ...filters, minAge: e.target.value ? parseInt(e.target.value) : undefined })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Edad máxima</Label>
              <Input
                type="number"
                placeholder="120"
                value={filters.maxAge || ''}
                onChange={(e) =>
                  onFiltersChange({ ...filters, maxAge: e.target.value ? parseInt(e.target.value) : undefined })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Género</Label>
              <Select
                value={filters.genderFilter || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, genderFilter: value === 'all' ? undefined : value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="diabetes"
                  checked={filters.hasDiabetes || false}
                  onCheckedChange={(checked) =>
                    onFiltersChange({ ...filters, hasDiabetes: checked as boolean })
                  }
                />
                <Label htmlFor="diabetes" className="cursor-pointer">
                  Con Diabetes
                </Label>
              </div>
            </div>

            <div className="flex items-end">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hta"
                  checked={filters.hasHta || false}
                  onCheckedChange={(checked) =>
                    onFiltersChange({ ...filters, hasHta: checked as boolean })
                  }
                />
                <Label htmlFor="hta" className="cursor-pointer">
                  Con HTA
                </Label>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <Label className="mb-3 block">Disponibilidad de datos:</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { id: 'autorefractor', label: 'Autorefractómetro', key: 'hasAutorefractor' },
                { id: 'lensometry', label: 'Lensometría', key: 'hasLensometry' },
                { id: 'keratometry', label: 'Keratometría', key: 'hasKeratometry' },
                { id: 'pio', label: 'PIO', key: 'hasPio' },
                { id: 'fundus', label: 'Fotos de fondo', key: 'hasFundusPhotos' },
                { id: 'slitlamp', label: 'Lámpara hendidura', key: 'hasSlitLamp' },
                { id: 'va', label: 'Agudeza visual', key: 'hasVisualAcuity' },
                { id: 'refraction', label: 'Refracción subjetiva', key: 'hasSubjectiveRefraction' },
                { id: 'prescription', label: 'Receta', key: 'hasPrescription' },
              ].map((item) => (
                <div key={item.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={item.id}
                    checked={(filters as any)[item.key] || false}
                    onCheckedChange={(checked) =>
                      onFiltersChange({ ...filters, [item.key]: checked as boolean })
                    }
                  />
                  <Label htmlFor={item.id} className="cursor-pointer text-sm">
                    {item.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Botones de Acción */}
      <div className="flex gap-3">
        <Button onClick={handleSearch} className="flex-1">
          <Search className="h-4 w-4 mr-2" />
          Buscar
        </Button>
        <Button onClick={handleReset} variant="outline">
          <RotateCcw className="h-4 w-4 mr-2" />
          Limpiar
        </Button>
      </div>
    </Card>
  );
}