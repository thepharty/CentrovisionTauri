import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area 
} from 'recharts';
import { TrendingUp, Activity, Eye, Users, Stethoscope, Calendar, BarChart3 } from 'lucide-react';

type ChartsPanelProps = {
  data: any[];
  viewMode?: 'encounters' | 'patients';
};

// Paleta de colores médica profesional
const COLORS = {
  primary: 'hsl(221, 83%, 53%)',      // Azul principal
  secondary: 'hsl(262, 83%, 58%)',    // Púrpura
  success: 'hsl(142, 71%, 45%)',      // Verde
  warning: 'hsl(38, 92%, 50%)',       // Naranja
  danger: 'hsl(0, 84%, 60%)',         // Rojo
  info: 'hsl(199, 89%, 48%)',         // Cyan
  muted: 'hsl(215, 16%, 47%)',        // Gris
};

const PIE_COLORS = [
  COLORS.primary, 
  COLORS.secondary, 
  COLORS.success, 
  COLORS.warning, 
  COLORS.danger, 
  COLORS.info
];

const PIO_COLORS = {
  normal: COLORS.success,
  sospecha: COLORS.warning,
  elevada: '#f97316',
  alta: COLORS.danger,
};

const AGE_COLORS = {
  'Pediátrico': 'hsl(199, 89%, 48%)',
  'Adulto Joven': 'hsl(142, 71%, 45%)',
  'Adulto': 'hsl(221, 83%, 53%)',
  'Adulto Mayor': 'hsl(262, 83%, 58%)',
};

// Helper para denormalizar datos de pacientes a encuentros
const denormalizePatientData = (patientData: any[]) => {
  return patientData.flatMap((patient: any) => {
    if (!patient.visits) return [];
    return patient.visits.map((visit: any, idx: number) => ({
      ...visit,
      patient_id: patient.patient_id,
      patient_code: patient.patient_code,
      patient_age: patient.patient_age,
      has_diabetes_flag: patient.has_diabetes_flag,
      has_hta_flag: patient.has_hta_flag,
      visit_number: idx + 1,
    }));
  });
};

// Métricas disponibles para tendencia temporal
const TREND_METRICS = [
  { value: 'pio', label: 'PIO (Presión Intraocular)', unit: 'mmHg' },
  { value: 'av_sc', label: 'Agudeza Visual SC', unit: '' },
  { value: 'av_cc', label: 'Agudeza Visual CC', unit: '' },
  { value: 'ref_sphere', label: 'Esfera (Refracción Subjetiva)', unit: 'D' },
  { value: 'ref_cyl', label: 'Cilindro (Refracción Subjetiva)', unit: 'D' },
  { value: 'keratometry_k1', label: 'Keratometría K1', unit: 'D' },
  { value: 'keratometry_k2', label: 'Keratometría K2', unit: 'D' },
];

// Componente de estado vacío
const EmptyState = ({ message, icon: Icon }: { message: string; icon: React.ElementType }) => (
  <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
    <Icon className="w-12 h-12 mb-3 opacity-30" />
    <p className="text-sm">{message}</p>
  </div>
);

// Tooltip personalizado
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function ChartsPanel({ data, viewMode = 'encounters' }: ChartsPanelProps) {
  const [selectedMetric, setSelectedMetric] = useState('pio');
  const [selectedEye, setSelectedEye] = useState<'od' | 'os' | 'both'>('both');

  // Denormalizar si es modo pacientes
  const encounterData = useMemo(() => 
    viewMode === 'patients' ? denormalizePatientData(data) : data,
  [data, viewMode]);

  // ============================================
  // 1. TENDENCIA TEMPORAL POR PACIENTE (Line Chart)
  // ============================================
  const trendData = useMemo(() => {
    if (viewMode !== 'patients' || !data.length) return [];
    
    const metric = TREND_METRICS.find(m => m.value === selectedMetric);
    const patientLines: { [key: string]: any[] } = {};
    
    data.forEach((patient: any) => {
      if (!patient.visits || patient.visits.length < 2) return;
      
      const patientCode = patient.patient_code || patient.patient_id?.slice(0, 8);
      patientLines[patientCode] = [];
      
      patient.visits.forEach((visit: any, idx: number) => {
        let valueOD: number | null = null;
        let valueOS: number | null = null;
        
        // Extraer valores según la métrica seleccionada
        switch (selectedMetric) {
          case 'pio':
            valueOD = visit.pio_exam_od ?? visit.pio_od_preconsult;
            valueOS = visit.pio_exam_os ?? visit.pio_os_preconsult;
            break;
          case 'av_sc':
            valueOD = parseAV(visit.av_sc_od);
            valueOS = parseAV(visit.av_sc_os);
            break;
          case 'av_cc':
            valueOD = parseAV(visit.av_cc_od);
            valueOS = parseAV(visit.av_cc_os);
            break;
          case 'ref_sphere':
            valueOD = visit.ref_subj_sphere_od;
            valueOS = visit.ref_subj_sphere_os;
            break;
          case 'ref_cyl':
            valueOD = visit.ref_subj_cyl_od;
            valueOS = visit.ref_subj_cyl_os;
            break;
          case 'keratometry_k1':
            valueOD = parseFloat(visit.keratometry_od_k1) || null;
            valueOS = parseFloat(visit.keratometry_os_k1) || null;
            break;
          case 'keratometry_k2':
            valueOD = parseFloat(visit.keratometry_od_k2) || null;
            valueOS = parseFloat(visit.keratometry_os_k2) || null;
            break;
        }
        
        const date = visit.encounter_date ? new Date(visit.encounter_date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }) : `Visita ${idx + 1}`;
        
        patientLines[patientCode].push({
          visit: idx + 1,
          date,
          OD: valueOD,
          OS: valueOS,
        });
      });
    });
    
    // Convertir a formato para Recharts (por visita)
    const maxVisits = Math.max(...Object.values(patientLines).map(v => v.length), 0);
    const result: any[] = [];
    
    for (let i = 0; i < maxVisits; i++) {
      const point: any = { visit: `Visita ${i + 1}` };
      Object.entries(patientLines).forEach(([code, visits]) => {
        if (visits[i]) {
          if (selectedEye === 'od' || selectedEye === 'both') {
            point[`${code} OD`] = visits[i].OD;
          }
          if (selectedEye === 'os' || selectedEye === 'both') {
            point[`${code} OS`] = visits[i].OS;
          }
        }
      });
      result.push(point);
    }
    
    return result;
  }, [data, viewMode, selectedMetric, selectedEye]);

  // Obtener las líneas (pacientes) para el gráfico de tendencia
  const trendLines = useMemo(() => {
    if (!trendData.length) return [];
    const keys = Object.keys(trendData[0]).filter(k => k !== 'visit');
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
    return keys.map((key, idx) => ({
      dataKey: key,
      stroke: colors[idx % colors.length],
      name: key,
    }));
  }, [trendData]);

  // ============================================
  // 2. DISTRIBUCIÓN DE PIO (Bar Chart con rangos)
  // ============================================
  const pioDistribution = useMemo(() => {
    const ranges = { 'Normal (<21)': 0, 'Sospecha (21-24)': 0, 'Elevada (25-30)': 0, 'Alta (>30)': 0 };
    
    encounterData.forEach((d: any) => {
      const pioOD = d.pio_exam_od ?? d.pio_od_preconsult;
      const pioOS = d.pio_exam_os ?? d.pio_os_preconsult;
      
      [pioOD, pioOS].forEach(pio => {
        if (pio === null || pio === undefined) return;
        if (pio < 21) ranges['Normal (<21)']++;
        else if (pio <= 24) ranges['Sospecha (21-24)']++;
        else if (pio <= 30) ranges['Elevada (25-30)']++;
        else ranges['Alta (>30)']++;
      });
    });
    
    return Object.entries(ranges).map(([name, value]) => ({ 
      name, 
      value,
      fill: name.includes('Normal') ? PIO_COLORS.normal : 
            name.includes('Sospecha') ? PIO_COLORS.sospecha :
            name.includes('Elevada') ? PIO_COLORS.elevada : PIO_COLORS.alta
    }));
  }, [encounterData]);

  // ============================================
  // 3. DISTRIBUCIÓN DE AGUDEZA VISUAL (Bar Chart)
  // ============================================
  const avDistribution = useMemo(() => {
    const ranges = { 
      '20/20-20/25': 0, 
      '20/30-20/50': 0, 
      '20/60-20/100': 0, 
      '20/200+': 0,
      'CD/MM/PL': 0
    };
    
    encounterData.forEach((d: any) => {
      ['av_cc_od', 'av_cc_os', 'av_sc_od', 'av_sc_os'].forEach(field => {
        const av = d[field];
        if (!av) return;
        
        const avLower = av.toLowerCase();
        if (avLower.includes('cd') || avLower.includes('mm') || avLower.includes('pl') || avLower.includes('npm')) {
          ranges['CD/MM/PL']++;
        } else {
          const decimal = parseAV(av);
          if (decimal === null) return;
          if (decimal >= 0.8) ranges['20/20-20/25']++;
          else if (decimal >= 0.4) ranges['20/30-20/50']++;
          else if (decimal >= 0.2) ranges['20/60-20/100']++;
          else ranges['20/200+']++;
        }
      });
    });
    
    return Object.entries(ranges)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [encounterData]);

  // ============================================
  // 4. TOP DIAGNÓSTICOS (Horizontal Bar Chart)
  // ============================================
  const topDiagnoses = useMemo(() => {
    const diagCounts: Record<string, number> = {};
    
    encounterData.forEach((d: any) => {
      if (!d.diagnosis_summary) return;
      // Separar por comas o puntos y limpiar
      const diagnoses = d.diagnosis_summary
        .split(/[,;.]/)
        .map((s: string) => s.trim().toLowerCase())
        .filter((s: string) => s.length > 3);
      
      diagnoses.forEach((diag: string) => {
        // Normalizar diagnósticos comunes
        let normalized = diag;
        if (diag.includes('catarata')) normalized = 'Catarata';
        else if (diag.includes('glaucoma')) normalized = 'Glaucoma';
        else if (diag.includes('pterig')) normalized = 'Pterigión';
        else if (diag.includes('retinop')) normalized = 'Retinopatía';
        else if (diag.includes('dmae') || diag.includes('macular')) normalized = 'DMAE';
        else if (diag.includes('conjuntiv')) normalized = 'Conjuntivitis';
        else if (diag.includes('querato')) normalized = 'Queratopatía';
        else if (diag.includes('ojo seco') || diag.includes('dry eye')) normalized = 'Ojo Seco';
        else if (diag.includes('miop')) normalized = 'Miopía';
        else if (diag.includes('astigmat')) normalized = 'Astigmatismo';
        else if (diag.includes('hipermetrop')) normalized = 'Hipermetropía';
        else if (diag.includes('presbicia') || diag.includes('presbio')) normalized = 'Presbicia';
        else normalized = diag.charAt(0).toUpperCase() + diag.slice(1);
        
        diagCounts[normalized] = (diagCounts[normalized] || 0) + 1;
      });
    });
    
    return Object.entries(diagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [encounterData]);

  // ============================================
  // 5. DISTRIBUCIÓN POR EDAD MEJORADA
  // ============================================
  const ageDistribution = useMemo(() => {
    const ranges: Record<string, number> = {
      'Pediátrico (0-17)': 0,
      'Adulto Joven (18-40)': 0,
      'Adulto (41-60)': 0,
      'Adulto Mayor (61+)': 0,
    };
    
    // Usar IDs de paciente únicos para evitar contar múltiples veces
    const counted = new Set<string>();
    
    encounterData.forEach((d: any) => {
      const id = d.patient_id;
      if (counted.has(id)) return;
      counted.add(id);
      
      const age = d.patient_age || 0;
      if (age < 18) ranges['Pediátrico (0-17)']++;
      else if (age <= 40) ranges['Adulto Joven (18-40)']++;
      else if (age <= 60) ranges['Adulto (41-60)']++;
      else ranges['Adulto Mayor (61+)']++;
    });
    
    return Object.entries(ranges).map(([name, value]) => {
      const key = name.split(' ')[0] as keyof typeof AGE_COLORS;
      return { name, value, fill: AGE_COLORS[key] || COLORS.primary };
    });
  }, [encounterData]);

  // ============================================
  // 6. TIPOS DE CIRUGÍA (Horizontal Bar)
  // ============================================
  const surgeryTypes = useMemo(() => {
    const types: Record<string, number> = {};
    
    encounterData.forEach((d: any) => {
      if (d.surgery_type) {
        types[d.surgery_type] = (types[d.surgery_type] || 0) + 1;
      }
    });
    
    return Object.entries(types)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [encounterData]);

  // ============================================
  // 7. COMORBILIDADES MEJORADAS (Pie Chart)
  // ============================================
  const comorbidities = useMemo(() => {
    const counted = new Set<string>();
    let diabetes = 0, hta = 0, both = 0, none = 0;
    
    encounterData.forEach((d: any) => {
      const id = d.patient_id;
      if (counted.has(id)) return;
      counted.add(id);
      
      const hasDiabetes = d.has_diabetes_flag;
      const hasHTA = d.has_hta_flag;
      
      if (hasDiabetes && hasHTA) both++;
      else if (hasDiabetes) diabetes++;
      else if (hasHTA) hta++;
      else none++;
    });
    
    return [
      { name: 'Sin comorbilidades', value: none, fill: COLORS.muted },
      { name: 'Solo Diabetes', value: diabetes, fill: COLORS.warning },
      { name: 'Solo HTA', value: hta, fill: COLORS.danger },
      { name: 'Diabetes + HTA', value: both, fill: COLORS.secondary },
    ].filter(d => d.value > 0);
  }, [encounterData]);

  // ============================================
  // 8. TENDENCIA DE CONSULTAS POR MES (Area Chart)
  // ============================================
  const monthlyTrend = useMemo(() => {
    const months: Record<string, number> = {};
    
    encounterData.forEach((d: any) => {
      if (!d.encounter_date) return;
      const date = new Date(d.encounter_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months[key] = (months[key] || 0) + 1;
    });
    
    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12) // Últimos 12 meses
      .map(([month, value]) => {
        const [year, m] = month.split('-');
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return { 
          name: `${monthNames[parseInt(m) - 1]} ${year.slice(2)}`, 
          Consultas: value 
        };
      });
  }, [encounterData]);

  // ============================================
  // 9. ACTIVIDAD POR DOCTOR (Bar Chart)
  // ============================================
  const doctorActivity = useMemo(() => {
    const doctors: Record<string, number> = {};
    
    encounterData.forEach((d: any) => {
      const name = d.doctor_name || 'Sin asignar';
      doctors[name] = (doctors[name] || 0) + 1;
    });
    
    return Object.entries(doctors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ 
        name: name.length > 15 ? name.slice(0, 15) + '...' : name, 
        value 
      }));
  }, [encounterData]);

  const metricInfo = TREND_METRICS.find(m => m.value === selectedMetric);

  return (
    <div className="space-y-6">
      {/* ============================================ */}
      {/* SECCIÓN 1: TENDENCIA TEMPORAL (Solo en modo pacientes) */}
      {/* ============================================ */}
      {viewMode === 'patients' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Tendencia Temporal por Paciente</h3>
            </div>
            <div className="flex gap-2">
              <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Seleccionar métrica" />
                </SelectTrigger>
                <SelectContent>
                  {TREND_METRICS.map(metric => (
                    <SelectItem key={metric.value} value={metric.value}>
                      {metric.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedEye} onValueChange={(v) => setSelectedEye(v as any)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Ambos ojos</SelectItem>
                  <SelectItem value="od">Solo OD</SelectItem>
                  <SelectItem value="os">Solo OS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {trendData.length > 0 && trendLines.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="visit" className="text-xs" />
                <YAxis 
                  label={{ 
                    value: metricInfo?.unit || '', 
                    angle: -90, 
                    position: 'insideLeft',
                    className: 'fill-muted-foreground'
                  }} 
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {trendLines.map(line => (
                  <Line 
                    key={line.dataKey}
                    type="monotone" 
                    dataKey={line.dataKey} 
                    stroke={line.stroke}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState 
              message="Selecciona pacientes con múltiples visitas para ver tendencias" 
              icon={TrendingUp} 
            />
          )}
        </Card>
      )}

      {/* ============================================ */}
      {/* SECCIÓN 2: DISTRIBUCIONES CLÍNICAS */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución de PIO */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Distribución de PIO</h3>
          </div>
          {pioDistribution.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={pioDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} className="text-xs" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Ojos">
                  {pioDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos de PIO disponibles" icon={Activity} />
          )}
        </Card>

        {/* Distribución de Agudeza Visual */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Distribución de Agudeza Visual</h3>
          </div>
          {avDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={avDistribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Ojos" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos de agudeza visual disponibles" icon={Eye} />
          )}
        </Card>
      </div>

      {/* ============================================ */}
      {/* SECCIÓN 3: DIAGNÓSTICOS Y EDAD */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Diagnósticos */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Top 10 Diagnósticos</h3>
          </div>
          {topDiagnoses.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topDiagnoses} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} className="text-xs" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Casos" fill={COLORS.secondary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos de diagnósticos disponibles" icon={Stethoscope} />
          )}
        </Card>

        {/* Distribución por Edad */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Distribución por Edad</h3>
          </div>
          {ageDistribution.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={ageDistribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" angle={-15} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Pacientes" radius={[4, 4, 0, 0]}>
                  {ageDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos de edad disponibles" icon={Users} />
          )}
        </Card>
      </div>

      {/* ============================================ */}
      {/* SECCIÓN 4: CIRUGÍAS Y COMORBILIDADES */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tipos de Cirugía */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Tipos de Cirugía</h3>
          </div>
          {surgeryTypes.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={surgeryTypes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={140} className="text-xs" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Cirugías" fill={COLORS.info} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos de cirugías disponibles" icon={BarChart3} />
          )}
        </Card>

        {/* Comorbilidades */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Comorbilidades</h3>
          </div>
          {comorbidities.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={comorbidities}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                >
                  {comorbidities.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, 'Pacientes']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos de comorbilidades disponibles" icon={Activity} />
          )}
        </Card>
      </div>

      {/* ============================================ */}
      {/* SECCIÓN 5: TENDENCIA Y ACTIVIDAD */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tendencia Mensual */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Tendencia de Consultas</h3>
          </div>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthlyTrend}>
                <defs>
                  <linearGradient id="colorConsultas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="Consultas" 
                  stroke={COLORS.primary} 
                  fillOpacity={1} 
                  fill="url(#colorConsultas)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos de tendencia disponibles" icon={Calendar} />
          )}
        </Card>

        {/* Actividad por Doctor */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Actividad por Doctor</h3>
          </div>
          {doctorActivity.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={doctorActivity}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Consultas" fill={COLORS.success} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos de doctores disponibles" icon={Users} />
          )}
        </Card>
      </div>
    </div>
  );
}

// Helper para parsear agudeza visual a decimal
function parseAV(av: string | null | undefined): number | null {
  if (!av) return null;
  
  // Formato Snellen (20/XX)
  const snellenMatch = av.match(/20\/(\d+)/);
  if (snellenMatch) {
    return 20 / parseInt(snellenMatch[1]);
  }
  
  // Formato decimal
  const decimal = parseFloat(av);
  if (!isNaN(decimal) && decimal > 0 && decimal <= 2) {
    return decimal;
  }
  
  return null;
}
