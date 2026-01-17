import { Card } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, Activity, TrendingUp } from 'lucide-react';

type StatisticsPanelProps = {
  data: any[];
  viewMode?: 'encounters' | 'patients';
};

// Helper para denormalizar datos de pacientes a encuentros
const denormalizePatientData = (patientData: any[]) => {
  return patientData.flatMap((patient: any) => {
    if (!patient.visits) return [];
    return patient.visits.map((visit: any) => ({
      ...visit,
      patient_code: patient.patient_code,
      patient_age: patient.patient_age,
      patient_gender: patient.patient_gender,
      patient_occupation: patient.patient_occupation,
      has_diabetes_flag: patient.has_diabetes_flag,
      has_hta_flag: patient.has_hta_flag,
      allergies: patient.allergies,
      ophthalmic_history: patient.ophthalmic_history,
      patient_notes: patient.patient_notes,
    }));
  });
};

export default function StatisticsPanel({ data, viewMode = 'encounters' }: StatisticsPanelProps) {
  // Si estamos en modo pacientes, denormalizamos los datos
  const encounterData = viewMode === 'patients' ? denormalizePatientData(data) : data;
  
  const totalCases = encounterData.length;
  const uniquePatients = viewMode === 'patients' ? data.length : new Set(encounterData.map(d => d.patient_id)).size;
  const surgeries = encounterData.filter((d) => d.encounter_type === 'cirugia');
  const casesWithPreop = encounterData.filter(
    (d) => d.av_sc_od || d.av_sc_os || d.autorefractor || d.lensometry
  ).length;
  const casesWithPostop = encounterData.filter((d) => d.has_postop_encounter).length;
  const incompleteCases = surgeries.filter((d) => !d.has_postop_encounter).length;
  const followupRate = surgeries.length > 0 
    ? ((surgeries.filter((d) => d.has_postop_encounter).length / surgeries.length) * 100).toFixed(1)
    : '0';

  const stats = [
    {
      label: viewMode === 'patients' ? 'Total de pacientes' : 'Total de casos',
      value: viewMode === 'patients' ? uniquePatients : totalCases,
      icon: Activity,
      color: 'text-blue-600',
    },
    {
      label: 'Casos con datos pre-op',
      value: casesWithPreop,
      icon: CheckCircle2,
      color: 'text-green-600',
    },
    {
      label: 'Casos con seguimiento post-op',
      value: casesWithPostop,
      icon: TrendingUp,
      color: 'text-purple-600',
    },
    {
      label: 'Casos incompletos',
      value: incompleteCases,
      icon: AlertTriangle,
      color: 'text-yellow-600',
    },
  ];

  const avPreOd = encounterData.filter((d) => d.av_cc_od).map((d) => d.av_cc_od);
  const avPreOs = encounterData.filter((d) => d.av_cc_os).map((d) => d.av_cc_os);

  const diabetesCount = encounterData.filter((d) => d.has_diabetes_flag).length;
  const htaCount = encounterData.filter((d) => d.has_hta_flag).length;
  const avgAge = encounterData.length > 0
    ? (encounterData.reduce((sum, d) => sum + (d.patient_age || 0), 0) / encounterData.length).toFixed(1)
    : '0';

  const encounterTypes = encounterData.reduce((acc, d) => {
    acc[d.encounter_type] = (acc[d.encounter_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Métricas Generales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg bg-accent`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Demografía */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Demografía</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Edad promedio</p>
            <p className="text-2xl font-bold">{avgAge} años</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Con Diabetes</p>
            <p className="text-2xl font-bold">
              {diabetesCount} ({((diabetesCount / totalCases) * 100).toFixed(1)}%)
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Con HTA</p>
            <p className="text-2xl font-bold">
              {htaCount} ({((htaCount / totalCases) * 100).toFixed(1)}%)
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Tasa de seguimiento</p>
            <p className="text-2xl font-bold">{followupRate}%</p>
          </div>
        </div>
      </Card>

      {/* Distribución por Tipo de Consulta */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Distribución por Tipo de Consulta</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {Object.entries(encounterTypes).map(([type, count]) => {
            const countNum = count as number;
            return (
              <div key={type} className="text-center p-4 bg-accent rounded-lg">
                <p className="text-sm text-muted-foreground capitalize">{type}</p>
                <p className="text-2xl font-bold">{countNum}</p>
                <p className="text-xs text-muted-foreground">
                  ({((countNum / totalCases) * 100).toFixed(1)}%)
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Análisis de Agudeza Visual */}
      {(avPreOd.length > 0 || avPreOs.length > 0) && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Análisis de Agudeza Visual</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-2">OD - Casos con AV registrada</p>
              <p className="text-2xl font-bold">{avPreOd.length}</p>
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Valores únicos: {String(new Set(avPreOd).size)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">OS - Casos con AV registrada</p>
              <p className="text-2xl font-bold">{avPreOs.length}</p>
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Valores únicos: {String(new Set(avPreOs).size)}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
