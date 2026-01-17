import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SearchPanel from '@/components/research/SearchPanel';
import ColumnSelector from '@/components/research/ColumnSelector';
import ResultsTable from '@/components/research/ResultsTable';
import PatientGroupedResultsTable from '@/components/research/PatientGroupedResultsTable';
import StatisticsPanel from '@/components/research/StatisticsPanel';
import ChartsPanel from '@/components/research/ChartsPanel';
import ExportMenu from '@/components/research/ExportMenu';
import { FlaskConical, ArrowLeft } from 'lucide-react';

export type ResearchFilters = {
  startDate: Date;
  endDate: Date;
  doctorId?: string;
  diagnosisFilter?: string;
  searchFieldType?: 'all' | 'diagnosis' | 'treatment_plan' | 'surgeries' | 'studies' | 'chief_complaint' | 'physical_exam';
  surgeryTypeFilter?: string;
  appointmentTypeFilter?: 'consulta' | 'diagnostico' | 'cirugia' | 'control' | 'nueva_consulta' | 'reconsulta_menos_3m' | 'reconsulta_mas_3m' | 'post_operado' | 'lectura_resultados' | 'cortesia' | 'procedimiento' | 'estudio';
  hasPreopData?: boolean;
  hasPostopData?: boolean;
  minAge?: number;
  maxAge?: number;
  genderFilter?: string;
  hasDiabetes?: boolean;
  hasHta?: boolean;
  hasAutorefractor?: boolean;
  hasLensometry?: boolean;
  hasKeratometry?: boolean;
  hasPio?: boolean;
  hasFundusPhotos?: boolean;
  hasSlitLamp?: boolean;
  hasVisualAcuity?: boolean;
  hasSubjectiveRefraction?: boolean;
  hasPrescription?: boolean;
};

export type ColumnCategory = 
  | 'demografia'
  | 'historia'
  | 'consulta'
  | 'preconsulta'
  | 'agudeza_visual'
  | 'refraccion'
  | 'receta'
  | 'examen_fisico'
  | 'excursiones'
  | 'plan'
  | 'cirugia'
  | 'procedimiento'
  | 'estudios';

export default function Research() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'encounters' | 'patients'>('encounters');
  const [filters, setFilters] = useState<ResearchFilters>({
    startDate: new Date(new Date().getFullYear(), 0, 1),
    endDate: new Date(),
  });
  
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set([
    'patient_code',
    'patient_age',
    'encounter_date',
    'encounter_type',
    'diagnosis_summary',
  ]));
  
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleViewModeChange = (mode: 'encounters' | 'patients') => {
    setViewMode(mode);
    
    // Si cambia a modo pacientes, asegurar que hay columnas de visita seleccionadas
    if (mode === 'patients') {
      const currentColumns = Array.from(selectedColumns);
      const patientOnlyColumns = ['patient_code', 'patient_age', 'patient_gender', 'patient_occupation',
       'has_diabetes_flag', 'has_hta_flag', 'allergies', 'ophthalmic_history', 'patient_notes'];
      
      const hasVisitColumns = currentColumns.some(col => !patientOnlyColumns.includes(col));
      
      // Si no hay columnas de visita, agregar algunas por defecto
      if (!hasVisitColumns) {
        setSelectedColumns(new Set([
          ...currentColumns,
          'encounter_date',
          'encounter_type',
          'diagnosis_summary',
        ]));
        console.log('✅ Added default visit columns for patient view');
      }
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Panel de Investigación Clínica
              </h1>
              <p className="text-sm text-muted-foreground">
                Sistema avanzado de extracción y análisis de datos clínicos
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al Dashboard
          </Button>
        </div>

        {/* Search Panel */}
        <SearchPanel
          filters={filters}
          onFiltersChange={setFilters}
          onSearch={(results) => {
            setData(results);
            setIsLoading(false);
          }}
          onLoadingChange={setIsLoading}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />

        {/* Main Content */}
        <Tabs defaultValue="results" className="space-y-4">
          <TabsList>
            <TabsTrigger value="results">
              Resultados ({data.length})
            </TabsTrigger>
            <TabsTrigger value="statistics" disabled={data.length === 0}>
              Estadísticas
            </TabsTrigger>
            <TabsTrigger value="charts" disabled={data.length === 0}>
              Gráficos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <ColumnSelector
                  selectedColumns={selectedColumns}
                  onColumnsChange={setSelectedColumns}
                />
                <ExportMenu
                  data={data}
                  selectedColumns={selectedColumns}
                  disabled={data.length === 0}
                  viewMode={viewMode}
                />
              </div>

              {viewMode === 'encounters' ? (
                <ResultsTable
                  data={data}
                  selectedColumns={selectedColumns}
                  isLoading={isLoading}
                />
              ) : (
                <PatientGroupedResultsTable
                  data={data}
                  selectedColumns={selectedColumns}
                  isLoading={isLoading}
                />
              )}
            </Card>
          </TabsContent>

          <TabsContent value="statistics">
            <StatisticsPanel data={data} viewMode={viewMode} />
          </TabsContent>

          <TabsContent value="charts">
            <ChartsPanel data={data} viewMode={viewMode} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
