import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Check, FileImage, Loader2, Printer, Package } from 'lucide-react';
import { usePrintPDF } from '@/hooks/usePrintPDF';
import { PrintPreviewDialog } from '@/components/dashboard/PrintPreviewDialog';
import { StockPanel } from '@/components/dashboard/StockPanel';
import { Encounter } from '@/types/database';
import { differenceInYears } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { parseLensNumber, formatLensForDisplay } from '@/lib/lensUtils';
import { clinicStartOfDay, clinicEndOfDay } from '@/lib/timezone';
import { useClinicalOptions } from '@/hooks/useClinicalOptions';
import { validateAxisInput } from '@/lib/axisValidation';
import { cn } from '@/lib/utils';
import { VoiceDictationFAB } from '@/components/VoiceDictationFAB';
import { DictationField } from '@/hooks/useVoiceDictation';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useBranch } from '@/hooks/useBranch';
import { invoke } from '@tauri-apps/api/core';
import { readFileAsDataUrl } from '@/lib/localStorageHelper';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Types for Tauri commands
interface EncounterLocal {
  id: string;
  patient_id: string;
  type: string;
  doctor_id: string | null;
  appointment_id: string | null;
  date: string;
  summary: string | null;
  plan_tratamiento: string | null;
  cirugias: string | null;
  estudios: string | null;
  proxima_cita: string | null;
  excursiones_od: string | null;
  excursiones_os: string | null;
  motivo_consulta: string | null;
}

interface PatientLocal {
  id: string;
  code: string | null;
  first_name: string;
  last_name: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  diabetes: boolean;
  hta: boolean;
  allergies: string | null;
  notes: string | null;
  ophthalmic_history: string | null;
}

interface ProfileLocal {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  specialty: string | null;
  is_visible_in_dashboard: boolean;
}

interface ExamEyeLocal {
  id: string;
  encounter_id: string;
  side: string;
  av_sc: string | null;
  av_cc: string | null;
  ref_subj_sphere: number | null;
  ref_subj_cyl: number | null;
  ref_subj_axis: number | null;
  ref_subj_av: string | null;
  rx_sphere: number | null;
  rx_cyl: number | null;
  rx_axis: number | null;
  rx_add: number | null;
  slit_lamp: string | null;
  iop: number | null;
  plan: string | null;
  prescription_notes: string | null;
}

interface AppointmentLocal {
  id: string;
  patient_id: string | null;
  room_id: string | null;
  doctor_id: string | null;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  type: string;
  status: string;
  autorefractor: string | null;
  lensometry: string | null;
  keratometry_od_k1: string | null;
  keratometry_od_k2: string | null;
  keratometry_od_axis: string | null;
  keratometry_os_k1: string | null;
  keratometry_os_k2: string | null;
  keratometry_os_axis: string | null;
  pio_od: number | null;
  pio_os: number | null;
  photo_od: string | null;
  photo_oi: string | null;
}

export default function Consultation() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const { isVoiceDictationEnabled } = useAppSettings();
  const { currentBranch } = useBranch();

  // Estados para agudeza visual
  const [avSinCorreccionOD, setAvSinCorreccionOD] = React.useState('');
  const [avSinCorreccionOS, setAvSinCorreccionOS] = React.useState('');
  const [avConCorreccionOD, setAvConCorreccionOD] = React.useState('');
  const [avConCorreccionOS, setAvConCorreccionOS] = React.useState('');
  
  // Estados para autorefractómetro
  const [autoOD, setAutoOD] = React.useState({ esfera: '', cilindro: '', eje: '' });
  const [autoOS, setAutoOS] = React.useState({ esfera: '', cilindro: '', eje: '' });
  
  // Estados para lensometría
  const [lensOD, setLensOD] = React.useState({ esfera: '', cilindro: '', eje: '' });
  const [lensOS, setLensOS] = React.useState({ esfera: '', cilindro: '', eje: '' });
  
  // Estados para PIO de preconsulta
  const [pioPreconsultaOD, setPioPreconsultaOD] = React.useState('');
  const [pioPreconsultaOS, setPioPreconsultaOS] = React.useState('');
  
  // Estados para queratometrías
  const [keratODK1, setKeratODK1] = React.useState('');
  const [keratODK2, setKeratODK2] = React.useState('');
  const [keratODAxis, setKeratODAxis] = React.useState('');
  const [keratOSK1, setKeratOSK1] = React.useState('');
  const [keratOSK2, setKeratOSK2] = React.useState('');
  const [keratOSAxis, setKeratOSAxis] = React.useState('');
  
  // Estados para motivo y antecedentes
  const [motivoConsulta, setMotivoConsulta] = React.useState('');
  const [antecedentesGenerales, setAntecedentesGenerales] = React.useState('');
  const [antecedentesOftalmologicos, setAntecedentesOftalmologicos] = React.useState('');
  
  // State para refracción subjetiva y receta
  const [subjetivaOD, setSubjetivaOD] = React.useState({ esfera: '', cilindro: '', eje: '', av: '' });
  const [subjetivaOS, setSubjetivaOS] = React.useState({ esfera: '', cilindro: '', eje: '', av: '' });
  const [recetaOD, setRecetaOD] = React.useState({ esfera: '', cilindro: '', eje: '', add: '' });
  const [recetaOS, setRecetaOS] = React.useState({ esfera: '', cilindro: '', eje: '', add: '' });
  const [materialVidrio, setMaterialVidrio] = React.useState(false);
  const [materialCR39, setMaterialCR39] = React.useState(false);
  const [materialPolicarbonato, setMaterialPolicarbonato] = React.useState(false);
  const [colorBlanco, setColorBlanco] = React.useState(false);
  const [colorTransitions, setColorTransitions] = React.useState(false);
  const [colorAntireflejo, setColorAntireflejo] = React.useState(false);
  const [colorFiltroAzul, setColorFiltroAzul] = React.useState(false);
  const [colorOtros, setColorOtros] = React.useState(false);
  const [colorOtrosText, setColorOtrosText] = React.useState('');
  const [tipoLejos, setTipoLejos] = React.useState(false);
  const [tipoCerca, setTipoCerca] = React.useState(false);
  const [tipoProgresivo, setTipoProgresivo] = React.useState(false);
  const [tipoBifocal, setTipoBifocal] = React.useState(false);
  const [dp, setDp] = React.useState('');
  const [notaRefraccion, setNotaRefraccion] = React.useState('');
  const [lhOkOD, setLhOkOD] = React.useState(false);
  const [lhOkOS, setLhOkOS] = React.useState(false);
  const [fondoOkOD, setFondoOkOD] = React.useState(false);
  const [fondoOkOS, setFondoOkOS] = React.useState(false);
  const [lamparaOD, setLamparaOD] = React.useState('');
  const [lamparaOS, setLamparaOS] = React.useState('');
  const [pioOD, setPioOD] = React.useState('');
  const [pioOS, setPioOS] = React.useState('');
  const [excOD, setExcOD] = React.useState('');
  const [excOS, setExcOS] = React.useState('');
  const [diagnostico, setDiagnostico] = React.useState('');
  const [planTratamiento, setPlanTratamiento] = React.useState('');
  const [cirugias, setCirugias] = React.useState('');
  const [estudios, setEstudios] = React.useState('');
  const [cirugiasDialogOpen, setCirugiasDialogOpen] = React.useState(false);
  const [estudiosDialogOpen, setEstudiosDialogOpen] = React.useState(false);
  const [selectedOjoCirugia, setSelectedOjoCirugia] = React.useState<'OD' | 'OI' | 'OU'>('OU');
  const [selectedOjoEstudio, setSelectedOjoEstudio] = React.useState<'OD' | 'OI' | 'OU'>('OU');
  const [tempCirugias, setTempCirugias] = React.useState<string[]>([]);
  const [tempEstudios, setTempEstudios] = React.useState<string[]>([]);
  const [tempProcedimientos, setTempProcedimientos] = React.useState<string[]>([]);
  const [proximaCita, setProximaCita] = React.useState('');
  const [diabetes, setDiabetes] = React.useState(false);
  const [hta, setHta] = React.useState(false);
  const [alergia, setAlergia] = React.useState(false);
  const [alergiaText, setAlergiaText] = React.useState('');
  const [photosDialogOpen, setPhotosDialogOpen] = React.useState(false);
  const [photoODUrl, setPhotoODUrl] = React.useState<string | null>(null);
  const [photoOIUrl, setPhotoOIUrl] = React.useState<string | null>(null);

  // Estados para print preview
  const [previewTitle, setPreviewTitle] = React.useState('Preview de Documento');
  const [previewOpen, setPreviewOpen] = React.useState(false);
  
  // Estado para panel de stock
  const [showStockPanel, setShowStockPanel] = React.useState(false);

  // Hook de impresión
  const { generatePDF, isGenerating, htmlContent, clearContent } = usePrintPDF();

  // Estados de carga independientes para cada botón de imprimir
  const [isGeneratingPrescription, setIsGeneratingPrescription] = React.useState(false);
  const [isGeneratingTreatment, setIsGeneratingTreatment] = React.useState(false);
  const [isGeneratingSurgeries, setIsGeneratingSurgeries] = React.useState(false);
  const [isGeneratingStudies, setIsGeneratingStudies] = React.useState(false);

  // Helper function para construir el texto acumulativo de lampara
  const buildLamparaText = (saOk: boolean, fondoOk: boolean) => {
    const parts = [];
    if (saOk) parts.push('Segmento anterior dentro de límites normales');
    if (fondoOk) parts.push('Fondo de ojo dentro de límites normales');
    return parts.join('. ');
  };

  // Handler para agregar gotas al plan de tratamiento
  const handleAddDropToTreatment = (dropName: string) => {
    setPlanTratamiento(prev => {
      const separator = prev.trim() ? '\n' : '';
      return prev + separator + dropName;
    });
    toast.success(`${dropName} agregada al plan de tratamiento`);
  };


  // Efecto para abrir el dialog cuando se genera el contenido HTML
  React.useEffect(() => {
    if (htmlContent) {
      setPreviewOpen(true);
    }
  }, [htmlContent]);

  const handleClosePreview = () => {
    setPreviewOpen(false);
    clearContent();
    setIsGeneratingPrescription(false);
    setIsGeneratingTreatment(false);
    setIsGeneratingSurgeries(false);
    setIsGeneratingStudies(false);
  };

  const handlePrintReceta = async () => {
    if (!patient || !encounter) {
      toast.error('Faltan datos del paciente o consulta');
      return;
    }

    setIsGeneratingPrescription(true);
    try {
      // Construir strings de material, color y tipo
      const materialArray = [];
      if (materialVidrio) materialArray.push('Vidrio');
      if (materialCR39) materialArray.push('CR-39');
      if (materialPolicarbonato) materialArray.push('Policarbonato');
      const materialStr = materialArray.join(', ');

      const colorArray = [];
      if (colorBlanco) colorArray.push('Blanco');
      if (colorTransitions) colorArray.push('Transitions');
      if (colorAntireflejo) colorArray.push('Antireflejo');
      if (colorFiltroAzul) colorArray.push('Filtro Azul');
      if (colorOtros && colorOtrosText) colorArray.push(colorOtrosText);
      const colorStr = colorArray.join(', ');

      const tipoArray = [];
      if (tipoLejos) tipoArray.push('Lejos');
      if (tipoCerca) tipoArray.push('Cerca');
      if (tipoProgresivo) tipoArray.push('Progresivo');
      if (tipoBifocal) tipoArray.push('Bifocal');
      const tipoStr = tipoArray.join(', ');

      // Calcular edad del paciente
      const edad = patient.dob ? differenceInYears(new Date(), new Date(patient.dob)) : 0;

      // Preparar datos para el PDF
      const pdfData = {
        type: 'prescription' as const,
        patientData: {
          name: `${patient.first_name} ${patient.last_name}`,
          age: edad,
          code: patient.code || '',
        },
        doctorData: {
          name: currentDoctor?.full_name || encounter.doctor?.full_name || 'Doctor',
          specialty: currentDoctor?.specialty || encounter.doctor?.specialty || 'Oftalmología',
          gender: ((currentDoctor as any)?.gender || (encounter.doctor as any)?.gender || 'M') as 'M' | 'F',
        },
        date: new Date().toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        content: {
          od: {
            esfera: recetaOD.esfera,
            cilindro: recetaOD.cilindro,
            eje: recetaOD.eje,
            add: recetaOD.add,
          },
          os: {
            esfera: recetaOS.esfera,
            cilindro: recetaOS.cilindro,
            eje: recetaOS.eje,
            add: recetaOS.add,
          },
          material: materialStr,
          color: colorStr,
          type: tipoStr,
          dp: dp,
          notes: notaRefraccion,
        },
        headerImageUrl: currentBranch?.pdf_header_url || undefined,
        themeColor: currentBranch?.theme_primary_hsl || undefined,
      };

      setPreviewTitle('Preview de Receta');
      await generatePDF(pdfData);
    } finally {
      setIsGeneratingPrescription(false);
    }
  };

  const handlePrintTreatment = async () => {
    if (!patient || !encounter || !planTratamiento.trim()) {
      toast.error('No hay datos suficientes para imprimir');
      return;
    }

    setIsGeneratingTreatment(true);
    try {
      const edad = patient.dob ? differenceInYears(new Date(), new Date(patient.dob)) : 0;

      const pdfData = {
        type: 'treatment' as const,
        patientData: {
          name: `${patient.first_name} ${patient.last_name}`,
          age: edad,
          code: patient.code || '',
        },
        doctorData: {
          name: currentDoctor?.full_name || encounter.doctor?.full_name || 'Doctor',
          specialty: currentDoctor?.specialty || encounter.doctor?.specialty || 'Oftalmología',
          gender: ((currentDoctor as any)?.gender || (encounter.doctor as any)?.gender || 'M') as 'M' | 'F',
        },
        date: new Date().toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        content: {
          treatment: planTratamiento,
        },
        headerImageUrl: currentBranch?.pdf_header_url || undefined,
        themeColor: currentBranch?.theme_primary_hsl || undefined,
      };

      setPreviewTitle('Preview de Plan de Tratamiento');
      await generatePDF(pdfData);
    } finally {
      setIsGeneratingTreatment(false);
    }
  };

  const handlePrintSurgeries = async () => {
    if (!patient || !encounter || !cirugias.trim()) {
      toast.error('No hay datos suficientes para imprimir');
      return;
    }

    setIsGeneratingSurgeries(true);
    try {
      const edad = patient.dob ? differenceInYears(new Date(), new Date(patient.dob)) : 0;

      // Parse surgeries string into array of objects
      // Split by both commas and newlines to handle different formats
      const surgeriesArray = cirugias
        .split(/[\n,]+/)
        .filter(s => s.trim())
        .map(line => {
          const trimmed = line.trim();
          // Match pattern: "Surgery Name OD/OS/OU"
          const match = trimmed.match(/^(.+)\s+(OD|OI|OU)$/);
          if (match) {
            const eyeMap: { [key: string]: string } = {
              'OD': 'Derecho',
              'OI': 'Izquierdo',
              'OU': 'Ambos'
            };
            return {
              name: match[1].trim(),
              eye: eyeMap[match[2]] || match[2]
            };
          }
          // Fallback without eye specified
          return {
            name: trimmed,
            eye: '—'
          };
        });

      const pdfData = {
        type: 'surgeries' as const,
        patientData: {
          name: `${patient.first_name} ${patient.last_name}`,
          age: edad,
          code: patient.code || '',
        },
        doctorData: {
          name: currentDoctor?.full_name || encounter.doctor?.full_name || 'Doctor',
          specialty: currentDoctor?.specialty || encounter.doctor?.specialty || 'Oftalmología',
          gender: ((currentDoctor as any)?.gender || (encounter.doctor as any)?.gender || 'M') as 'M' | 'F',
        },
        date: new Date().toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        content: {
          surgeries: surgeriesArray,
        },
        headerImageUrl: currentBranch?.pdf_header_url || undefined,
        themeColor: currentBranch?.theme_primary_hsl || undefined,
      };

      setPreviewTitle('Preview de Orden de Cirugía');
      await generatePDF(pdfData);
    } finally {
      setIsGeneratingSurgeries(false);
    }
  };

  const handlePrintStudies = async () => {
    if (!patient || !encounter || !estudios.trim()) {
      toast.error('No hay datos suficientes para imprimir');
      return;
    }

    setIsGeneratingStudies(true);
    try {
      const edad = patient.dob ? differenceInYears(new Date(), new Date(patient.dob)) : 0;

      // Parse studies string into array of objects
      // Split by both newlines and commas to handle different formats
      const studiesArray = estudios
        .split(/[\n,]+/)
        .filter(s => s.trim())
        .map(s => {
          const trimmed = s.trim();
          // Match pattern: "Study Name OD/OS/OU"
          const match = trimmed.match(/^(.+)\s+(OD|OI|OU)$/);
          if (match) {
            const eyeMap: { [key: string]: string } = {
              'OD': 'Derecho',
              'OI': 'Izquierdo', 
              'OU': 'Ambos'
            };
            return {
              name: match[1].trim(),
              eye: eyeMap[match[2]] || match[2]
            };
          }
          // Fallback if no eye specified
          return {
            name: trimmed,
            eye: '—'
          };
        });

      const pdfData = {
        type: 'studies' as const,
        patientData: {
          name: `${patient.first_name} ${patient.last_name}`,
          age: edad,
          code: patient.code || '',
        },
        doctorData: {
          name: currentDoctor?.full_name || encounter.doctor?.full_name || 'Doctor',
          specialty: currentDoctor?.specialty || encounter.doctor?.specialty || 'Oftalmología',
          gender: ((currentDoctor as any)?.gender || (encounter.doctor as any)?.gender || 'M') as 'M' | 'F',
        },
        date: new Date().toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        content: {
          studies: studiesArray,
        },
        headerImageUrl: currentBranch?.pdf_header_url || undefined,
        themeColor: currentBranch?.theme_primary_hsl || undefined,
      };

      setPreviewTitle('Preview de Orden de Estudios');
      await generatePDF(pdfData);
    } finally {
      setIsGeneratingStudies(false);
    }
  };

  const { data: encounter, isLoading } = useQuery({
    queryKey: ['encounter', encounterId],
    queryFn: async () => {
      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[Consultation] Getting encounter from PostgreSQL local');
        const encounterData = await invoke<EncounterLocal | null>('get_encounter_by_id', {
          encounterId: encounterId,
        });
        if (!encounterData) throw new Error('Encounter not found');

        // Get patient data
        const patientData = await invoke<PatientLocal | null>('get_patient_by_id', {
          patientId: encounterData.patient_id,
        });

        // Get doctor data if exists
        let doctorData = null;
        if (encounterData.doctor_id) {
          doctorData = await invoke<ProfileLocal | null>('get_profile_by_user_id', {
            userId: encounterData.doctor_id,
          });
        }

        return {
          ...encounterData,
          patient: patientData,
          doctor: doctorData,
        } as Encounter;
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('encounters')
        .select(`
          *,
          patient:patients(*)
        `)
        .eq('id', encounterId)
        .single();

      if (error) throw error;

      // Fetch doctor info separately if exists
      if (data.doctor_id) {
        const { data: doctor } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', data.doctor_id)
          .single();

        return { ...data, doctor } as Encounter;
      }

      return data as Encounter;
    },
    enabled: !!encounterId,
  });

  // Obtener el perfil del doctor actual de la sesión
  const { data: currentDoctor } = useQuery({
    queryKey: ['current-doctor-profile', user?.id, connectionMode],
    queryFn: async () => {
      if (!user?.id) return null;

      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[Consultation] Getting current doctor profile from PostgreSQL local');
        const profile = await invoke<ProfileLocal | null>('get_profile_by_user_id', {
          userId: user.id,
        });
        return profile ? { full_name: profile.full_name, specialty: profile.specialty, gender: null } : null;
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, specialty, gender')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const patient = encounter?.patient;

  // Cargar datos guardados del encounter
  React.useEffect(() => {
    if (encounter) {
      setDiagnostico(encounter.summary || '');
      setPlanTratamiento(encounter.plan_tratamiento || '');
      setCirugias(encounter.cirugias || '');
      setEstudios(encounter.estudios || '');
      setProximaCita(encounter.proxima_cita || '');
      setExcOD(encounter.excursiones_od || '');
      setExcOS(encounter.excursiones_os || '');
      setMotivoConsulta(encounter.motivo_consulta || '');
    }
  }, [encounter]);

  // Cargar datos de exam_eye
  React.useEffect(() => {
    const loadExamData = async () => {
      if (!encounterId) return;

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[Consultation] Loading exam_eye data from PostgreSQL local');
        const examEyes = await invoke<ExamEyeLocal[]>('get_exam_eyes_by_encounter', {
          encounterId: encounterId,
        });

        const examOD = examEyes.find(e => e.side === 'OD');
        const examOS = examEyes.find(e => e.side === 'OI');

        if (examOD) {
          setAvSinCorreccionOD(examOD.av_sc || '');
          setAvConCorreccionOD(examOD.av_cc || '');
          setSubjetivaOD({
            esfera: formatLensForDisplay(examOD.ref_subj_sphere),
            cilindro: formatLensForDisplay(examOD.ref_subj_cyl),
            eje: examOD.ref_subj_axis?.toString() || '',
            av: examOD.ref_subj_av || ''
          });
          setRecetaOD({
            esfera: formatLensForDisplay(examOD.rx_sphere),
            cilindro: formatLensForDisplay(examOD.rx_cyl),
            eje: examOD.rx_axis?.toString() || '',
            add: examOD.rx_add?.toString() || ''
          });
          setPioOD(examOD.iop?.toString() || '');
          setLamparaOD(examOD.slit_lamp || '');
          setNotaRefraccion(examOD.prescription_notes || '');

          if (examOD.plan) {
            try {
              const planData = JSON.parse(examOD.plan as string);
              setMaterialVidrio(planData.material?.vidrio || false);
              setMaterialCR39(planData.material?.cr39 || false);
              setMaterialPolicarbonato(planData.material?.policarbonato || false);
              setColorBlanco(planData.color?.blanco || false);
              setColorTransitions(planData.color?.transitions || false);
              setColorAntireflejo(planData.color?.antireflejo || false);
              setColorFiltroAzul(planData.color?.filtroAzul || false);
              setColorOtros(planData.color?.otros || false);
              setColorOtrosText(planData.color?.otrosText || '');
              setTipoLejos(planData.tipo?.lejos || false);
              setTipoCerca(planData.tipo?.cerca || false);
              setTipoProgresivo(planData.tipo?.progresivo || false);
              setTipoBifocal(planData.tipo?.bifocal || false);
              setDp(planData.dp || '');
            } catch (e) {
              console.error('Error parsing plan data:', e);
            }
          }
        }

        if (examOS) {
          setAvSinCorreccionOS(examOS.av_sc || '');
          setAvConCorreccionOS(examOS.av_cc || '');
          setSubjetivaOS({
            esfera: formatLensForDisplay(examOS.ref_subj_sphere),
            cilindro: formatLensForDisplay(examOS.ref_subj_cyl),
            eje: examOS.ref_subj_axis?.toString() || '',
            av: examOS.ref_subj_av || ''
          });
          setRecetaOS({
            esfera: formatLensForDisplay(examOS.rx_sphere),
            cilindro: formatLensForDisplay(examOS.rx_cyl),
            eje: examOS.rx_axis?.toString() || '',
            add: examOS.rx_add?.toString() || ''
          });
          setPioOS(examOS.iop?.toString() || '');
          setLamparaOS(examOS.slit_lamp || '');
        }
        return;
      }

      // Modo Supabase - Cargar datos de OD
      const { data: examOD } = await supabase
        .from('exam_eye')
        .select('*')
        .eq('encounter_id', encounterId)
        .eq('side', 'OD')
        .maybeSingle();

      if (examOD) {
        setAvSinCorreccionOD(examOD.av_sc || '');
        setAvConCorreccionOD(examOD.av_cc || '');
        setSubjetivaOD({
          esfera: formatLensForDisplay(examOD.ref_subj_sphere),
          cilindro: formatLensForDisplay(examOD.ref_subj_cyl),
          eje: examOD.ref_subj_axis?.toString() || '',
          av: (examOD as any).ref_subj_av || ''
        });
        setRecetaOD({
          esfera: formatLensForDisplay(examOD.rx_sphere),
          cilindro: formatLensForDisplay(examOD.rx_cyl),
          eje: examOD.rx_axis?.toString() || '',
          add: examOD.rx_add?.toString() || ''
        });
        setPioOD(examOD.iop?.toString() || '');
        setLamparaOD(examOD.slit_lamp || '');
        setNotaRefraccion((examOD as any).prescription_notes || '');

        // Cargar datos del plan (material, color, tipo, DP)
        if (examOD.plan) {
          try {
            const planData = JSON.parse(examOD.plan as string);
            setMaterialVidrio(planData.material?.vidrio || false);
            setMaterialCR39(planData.material?.cr39 || false);
            setMaterialPolicarbonato(planData.material?.policarbonato || false);
            setColorBlanco(planData.color?.blanco || false);
            setColorTransitions(planData.color?.transitions || false);
            setColorAntireflejo(planData.color?.antireflejo || false);
            setColorFiltroAzul(planData.color?.filtroAzul || false);
            setColorOtros(planData.color?.otros || false);
            setColorOtrosText(planData.color?.otrosText || '');
            setTipoLejos(planData.tipo?.lejos || false);
            setTipoCerca(planData.tipo?.cerca || false);
            setTipoProgresivo(planData.tipo?.progresivo || false);
            setTipoBifocal(planData.tipo?.bifocal || false);
            setDp(planData.dp || '');
          } catch (e) {
            console.error('Error parsing plan data:', e);
          }
        }
      }

      // Cargar datos de OS
      const { data: examOS } = await supabase
        .from('exam_eye')
        .select('*')
        .eq('encounter_id', encounterId)
        .eq('side', 'OI')
        .maybeSingle();

      if (examOS) {
        setAvSinCorreccionOS(examOS.av_sc || '');
        setAvConCorreccionOS(examOS.av_cc || '');
        setSubjetivaOS({
          esfera: formatLensForDisplay(examOS.ref_subj_sphere),
          cilindro: formatLensForDisplay(examOS.ref_subj_cyl),
          eje: examOS.ref_subj_axis?.toString() || '',
          av: (examOS as any).ref_subj_av || ''
        });
        setRecetaOS({
          esfera: formatLensForDisplay(examOS.rx_sphere),
          cilindro: formatLensForDisplay(examOS.rx_cyl),
          eje: examOS.rx_axis?.toString() || '',
          add: examOS.rx_add?.toString() || ''
        });
        setPioOS(examOS.iop?.toString() || '');
        setLamparaOS(examOS.slit_lamp || '');
      }
    };

    loadExamData();
  }, [encounterId, isLocalMode]);

  // Cargar antecedentes del paciente
  React.useEffect(() => {
    if (patient) {
      setDiabetes(patient.diabetes || false);
      setHta(patient.hta || false);
      setAlergia(!!patient.allergies);
      setAlergiaText(patient.allergies || '');
      // No sobrescribir si el usuario ya escribió algo localmente
      setAntecedentesGenerales((prev) => (prev && prev.trim().length > 0) ? prev : (patient.notes || ''));
      setAntecedentesOftalmologicos((prev) => (prev && prev.trim().length > 0) ? prev : ((patient as any).ophthalmic_history || ''));
    }
  }, [patient]);

  const { cirugiasDisponibles, estudiosDisponibles, procedimientosDisponibles } = useClinicalOptions();
  
  const expandirEstudio = (estudio: string) => {
    if (estudio === 'Paquete Glaucoma') {
      return ['OCT nervio optico', 'Campos visuales', 'Paquimetria', 'Foto de nervio optico'];
    }
    if (estudio === 'Paquete de retina') {
      return ['OCT macula', 'Foto Campo Amplio', 'AGF'];
    }
    return [estudio];
  };

  const handleCirugiasOk = () => {
    const cirugiasList = tempCirugias.map(c => `${c} ${selectedOjoCirugia}`).join(', ');
    setCirugias(prev => prev ? `${prev}, ${cirugiasList}` : cirugiasList);
    setTempCirugias([]);
    setCirugiasDialogOpen(false);
  };

  const handleEstudiosOk = () => {
    // Expandir paquetes en la lista de estudios
    const expandedEstudios = tempEstudios.flatMap(expandirEstudio);
    const estudiosList = expandedEstudios.map(e => `${e} ${selectedOjoEstudio}`).join(', ');
    const procedimientosList = tempProcedimientos.map(p => `${p} ${selectedOjoEstudio}`).join(', ');
    const combinedList = [estudiosList, procedimientosList].filter(Boolean).join(', ');
    setEstudios(prev => prev ? `${prev}, ${combinedList}` : combinedList);
    setTempEstudios([]);
    setTempProcedimientos([]);
    setEstudiosDialogOpen(false);
  };

  // Mutation para guardar consulta
  const saveConsultationMutation = useMutation({
    mutationFn: async (markAsCompleted: boolean = false) => {
      // Guardar datos completos del encounter
      const consultationData = {
        summary: diagnostico,
        plan_tratamiento: planTratamiento,
        cirugias,
        estudios,
        proxima_cita: proximaCita,
        excursiones_od: excOD,
        excursiones_os: excOS,
        motivo_consulta: motivoConsulta,
        updated_at: new Date().toISOString(),
      };

      // Datos del examen ocular para OD
      const examODData = {
        encounter_id: encounterId,
        side: 'OD' as const,
        av_sc: avSinCorreccionOD,
        av_cc: avConCorreccionOD,
        ref_sphere: Number(autoOD.esfera) || null,
        ref_cyl: Number(autoOD.cilindro) || null,
        ref_axis: Number(autoOD.eje) || null,
        ref_subj_sphere: parseLensNumber(subjetivaOD.esfera),
        ref_subj_cyl: parseLensNumber(subjetivaOD.cilindro),
        ref_subj_axis: Number(subjetivaOD.eje) || null,
        ref_subj_av: subjetivaOD.av || null,
        rx_sphere: parseLensNumber(recetaOD.esfera),
        rx_cyl: parseLensNumber(recetaOD.cilindro),
        rx_axis: Number(recetaOD.eje) || null,
        rx_add: Number(recetaOD.add) || null,
        iop: Number(pioOD) || null,
        slit_lamp: lamparaOD,
        prescription_notes: notaRefraccion || null,
        plan: JSON.stringify({
          material: { vidrio: materialVidrio, cr39: materialCR39, policarbonato: materialPolicarbonato },
          color: { blanco: colorBlanco, transitions: colorTransitions, antireflejo: colorAntireflejo, filtroAzul: colorFiltroAzul, otros: colorOtros, otrosText: colorOtrosText },
          tipo: { lejos: tipoLejos, cerca: tipoCerca, progresivo: tipoProgresivo, bifocal: tipoBifocal },
          dp: dp,
        })
      };

      // Datos del examen ocular para OS
      const examOSData = {
        encounter_id: encounterId,
        side: 'OI' as const,
        av_sc: avSinCorreccionOS,
        av_cc: avConCorreccionOS,
        ref_sphere: Number(autoOS.esfera) || null,
        ref_cyl: Number(autoOS.cilindro) || null,
        ref_axis: Number(autoOS.eje) || null,
        ref_subj_sphere: parseLensNumber(subjetivaOS.esfera),
        ref_subj_cyl: parseLensNumber(subjetivaOS.cilindro),
        ref_subj_axis: Number(subjetivaOS.eje) || null,
        ref_subj_av: subjetivaOS.av || null,
        rx_sphere: parseLensNumber(recetaOS.esfera),
        rx_cyl: parseLensNumber(recetaOS.cilindro),
        rx_axis: Number(recetaOS.eje) || null,
        rx_add: Number(recetaOS.add) || null,
        iop: Number(pioOS) || null,
        slit_lamp: lamparaOS,
        prescription_notes: notaRefraccion || null,
        plan: JSON.stringify({
          material: { vidrio: materialVidrio, cr39: materialCR39, policarbonato: materialPolicarbonato },
          color: { blanco: colorBlanco, transitions: colorTransitions, antireflejo: colorAntireflejo, filtroAzul: colorFiltroAzul, otros: colorOtros, otrosText: colorOtrosText },
          tipo: { lejos: tipoLejos, cerca: tipoCerca, progresivo: tipoProgresivo, bifocal: tipoBifocal },
          dp: dp,
        })
      };

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[Consultation] Saving consultation via PostgreSQL local');

        // 1. Update encounter
        await invoke('update_encounter', {
          encounterId: encounterId,
          summary: consultationData.summary || null,
          planTratamiento: consultationData.plan_tratamiento || null,
          cirugias: consultationData.cirugias || null,
          estudios: consultationData.estudios || null,
          proximaCita: consultationData.proxima_cita || null,
          excursionesOd: consultationData.excursiones_od || null,
          excursionesOs: consultationData.excursiones_os || null,
          motivoConsulta: consultationData.motivo_consulta || null,
        });

        // 2. Upsert exam_eye OD
        await invoke('upsert_exam_eye', {
          encounterId: examODData.encounter_id,
          side: examODData.side,
          avSc: examODData.av_sc || null,
          avCc: examODData.av_cc || null,
          refSphere: examODData.ref_sphere,
          refCyl: examODData.ref_cyl,
          refAxis: examODData.ref_axis,
          refSubjSphere: examODData.ref_subj_sphere,
          refSubjCyl: examODData.ref_subj_cyl,
          refSubjAxis: examODData.ref_subj_axis,
          refSubjAv: examODData.ref_subj_av,
          rxSphere: examODData.rx_sphere,
          rxCyl: examODData.rx_cyl,
          rxAxis: examODData.rx_axis,
          rxAdd: examODData.rx_add,
          iop: examODData.iop,
          slitLamp: examODData.slit_lamp || null,
          prescriptionNotes: examODData.prescription_notes,
          plan: examODData.plan || null,
        });

        // 3. Upsert exam_eye OS
        await invoke('upsert_exam_eye', {
          encounterId: examOSData.encounter_id,
          side: examOSData.side,
          avSc: examOSData.av_sc || null,
          avCc: examOSData.av_cc || null,
          refSphere: examOSData.ref_sphere,
          refCyl: examOSData.ref_cyl,
          refAxis: examOSData.ref_axis,
          refSubjSphere: examOSData.ref_subj_sphere,
          refSubjCyl: examOSData.ref_subj_cyl,
          refSubjAxis: examOSData.ref_subj_axis,
          refSubjAv: examOSData.ref_subj_av,
          rxSphere: examOSData.rx_sphere,
          rxCyl: examOSData.rx_cyl,
          rxAxis: examOSData.rx_axis,
          rxAdd: examOSData.rx_add,
          iop: examOSData.iop,
          slitLamp: examOSData.slit_lamp || null,
          prescriptionNotes: examOSData.prescription_notes,
          plan: examOSData.plan || null,
        });

        // 4. Update patient antecedentes
        if (patient?.id) {
          await invoke('update_patient', {
            patientId: patient.id,
            firstName: patient.first_name,
            lastName: patient.last_name,
            dob: patient.dob || null,
            phone: patient.phone || null,
            email: patient.email || null,
            address: patient.address || null,
            occupation: patient.occupation || null,
            diabetes,
            hta,
            allergies: alergia ? alergiaText : '',
            notes: antecedentesGenerales,
            ophthalmicHistory: antecedentesOftalmologicos,
          });
        }

        // 5. Si se marca como completada, actualizar appointment
        if (markAsCompleted && appointment?.id) {
          await invoke('update_appointment', {
            appointmentId: appointment.id,
            patientId: appointment.patient?.id || null,
            roomId: appointment.room_id || null,
            doctorId: appointment.doctor_id || null,
            branchId: appointment.branch_id,
            startsAt: appointment.starts_at,
            endsAt: appointment.ends_at,
            reason: appointment.reason || null,
            appointmentType: appointment.type,
            status: 'done',
            autorefractor: `OD: ${autoOD.esfera} ${autoOD.cilindro} x ${autoOD.eje} | OS: ${autoOS.esfera} ${autoOS.cilindro} x ${autoOS.eje}`,
            lensometry: `OD: ${lensOD.esfera} ${lensOD.cilindro} x ${lensOD.eje} | OS: ${lensOS.esfera} ${lensOS.cilindro} x ${lensOS.eje}`,
            keratometryOdK1: keratODK1 || null,
            keratometryOdK2: keratODK2 || null,
            keratometryOdAxis: keratODAxis || null,
            keratometryOsK1: keratOSK1 || null,
            keratometryOsK2: keratOSK2 || null,
            keratometryOsAxis: keratOSAxis || null,
            pioOd: Number(pioPreconsultaOD) || null,
            pioOs: Number(pioPreconsultaOS) || null,
          });
        }

        return markAsCompleted;
      }

      // Modo Supabase
      const { error } = await supabase
        .from('encounters')
        .update(consultationData)
        .eq('id', encounterId);

      if (error) throw error;

      // Verificar si ya existe un registro OD
      const { data: existingOD } = await supabase
        .from('exam_eye')
        .select('id')
        .eq('encounter_id', encounterId)
        .eq('side', 'OD')
        .maybeSingle();

      if (existingOD) {
        const { error: examODError } = await supabase
          .from('exam_eye')
          .update(examODData)
          .eq('id', existingOD.id);
        if (examODError) throw examODError;
      } else {
        const { error: examODError } = await supabase
          .from('exam_eye')
          .insert(examODData);
        if (examODError) throw examODError;
      }

      // Verificar si ya existe un registro OS
      const { data: existingOS } = await supabase
        .from('exam_eye')
        .select('id')
        .eq('encounter_id', encounterId)
        .eq('side', 'OI')
        .maybeSingle();

      if (existingOS) {
        const { error: examOSError } = await supabase
          .from('exam_eye')
          .update(examOSData)
          .eq('id', existingOS.id);
        if (examOSError) throw examOSError;
      } else {
        const { error: examOSError } = await supabase
          .from('exam_eye')
          .insert(examOSData);
        if (examOSError) throw examOSError;
      }

      // Actualizar antecedentes del paciente
      if (patient?.id) {
        const { error: patientError } = await supabase
          .from('patients')
          .update({
            diabetes,
            hta,
            allergies: alergia ? alergiaText : '',
            notes: antecedentesGenerales,
            ophthalmic_history: antecedentesOftalmologicos
          })
          .eq('id', patient.id);

        if (patientError) throw patientError;
      }

      // Si se marca como completada, actualizar el appointment con datos finales
      if (markAsCompleted && appointment?.id) {
        const { error: appointmentError } = await supabase
          .from('appointments')
          .update({
            status: 'done',
            autorefractor: `OD: ${autoOD.esfera} ${autoOD.cilindro} x ${autoOD.eje} | OS: ${autoOS.esfera} ${autoOS.cilindro} x ${autoOS.eje}`,
            lensometry: `OD: ${lensOD.esfera} ${lensOD.cilindro} x ${lensOD.eje} | OS: ${lensOS.esfera} ${lensOS.cilindro} x ${lensOS.eje}`,
            keratometry_od_k1: keratODK1 || null,
            keratometry_od_k2: keratODK2 || null,
            keratometry_od_axis: keratODAxis || null,
            keratometry_os_k1: keratOSK1 || null,
            keratometry_os_k2: keratOSK2 || null,
            keratometry_os_axis: keratOSAxis || null,
            pio_od: Number(pioPreconsultaOD) || null,
            pio_os: Number(pioPreconsultaOS) || null,
          })
          .eq('id', appointment.id);

        if (appointmentError) throw appointmentError;
      }

      return markAsCompleted;
    },
    onSuccess: (markAsCompleted) => {
      if (markAsCompleted) {
        toast.success('Consulta finalizada y guardada correctamente');
        queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
        queryClient.invalidateQueries({ queryKey: ['encounter-appointment'] });
        navigate('/dashboard');
      } else {
        toast.success('Borrador guardado');
      }
    },
    onError: () => {
      toast.error('Error al guardar la consulta');
    },
  });

  // Autoguardado cada 60 segundos
  React.useEffect(() => {
    const interval = setInterval(() => {
      saveConsultationMutation.mutate(false);
    }, 60000); // 60 segundos

    return () => clearInterval(interval);
  }, [diagnostico, planTratamiento, cirugias, estudios, proximaCita, diabetes, hta, alergia, alergiaText, 
      avSinCorreccionOD, avSinCorreccionOS, avConCorreccionOD, avConCorreccionOS,
      subjetivaOD, subjetivaOS, recetaOD, recetaOS, pioOD, pioOS, lamparaOD, lamparaOS, excOD, excOS,
      autoOD, autoOS, lensOD, lensOS, pioPreconsultaOD, pioPreconsultaOS, keratODK1, keratODK2, keratOSK1, keratOSK2,
      materialVidrio, materialCR39, materialPolicarbonato, colorBlanco, colorTransitions, colorAntireflejo, 
      colorFiltroAzul, colorOtros, colorOtrosText, tipoLejos, tipoCerca, tipoProgresivo, tipoBifocal, dp, notaRefraccion,
      motivoConsulta, antecedentesGenerales, antecedentesOftalmologicos]);

  const handleSaveAndExit = async () => {
    saveConsultationMutation.mutate(false);
    
    // Prefetch crítico de datos del Dashboard para navegación instantánea
    try {
      await queryClient.prefetchQuery({
        queryKey: ['active-doctors'],
        staleTime: 5 * 60 * 1000,
      });
      await queryClient.prefetchQuery({
        queryKey: ['rooms'],
        staleTime: 5 * 60 * 1000,
      });
    } catch {
      // Si falla el prefetch, seguir con la navegación
    }
    
    navigate('/dashboard');
  };

  const handleFinishConsultation = () => {
    saveConsultationMutation.mutate(true);
  };

  const copySubjetivaToReceta = () => {
    setRecetaOD({
      esfera: subjetivaOD.esfera,
      cilindro: subjetivaOD.cilindro,
      eje: subjetivaOD.eje,
      add: recetaOD.add, // Mantener el ADD
    });
    setRecetaOS({
      esfera: subjetivaOS.esfera,
      cilindro: subjetivaOS.cilindro,
      eje: subjetivaOS.eje,
      add: recetaOS.add, // Mantener el ADD
    });
    toast.success('Datos copiados de refracción subjetiva');
  };


  // Get the appointment associated with this encounter
  const { data: appointment } = useQuery({
    queryKey: ['encounter-appointment', encounter?.appointment_id, encounter?.patient_id, encounter?.date, connectionMode],
    queryFn: async () => {
      if (!encounter) return null;

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[Consultation] Getting appointment from PostgreSQL local');

        // Usar directamente el appointment_id si está disponible
        if (encounter.appointment_id) {
          const appointments = await invoke<AppointmentLocal[]>('get_appointments', {
            branchId: null,
            startDate: null,
            endDate: null,
          });
          const found = appointments.find(a => a.id === encounter.appointment_id);
          return found || null;
        }

        // Fallback: buscar por paciente y fecha
        const encounterDate = new Date(encounter.date);
        const startOfDay = clinicStartOfDay(encounterDate);
        const endOfDay = clinicEndOfDay(encounterDate);

        const appointments = await invoke<AppointmentLocal[]>('get_appointments', {
          branchId: null,
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        });

        return appointments.find(a => a.patient_id === encounter.patient_id) || null;
      }

      // Modo Supabase - Usar directamente el appointment_id si está disponible (más preciso)
      if (encounter.appointment_id) {
        const { data, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('id', encounter.appointment_id)
          .maybeSingle();

        if (error) return null;
        return data;
      }

      // Fallback: buscar por paciente y fecha (para encounters antiguos sin appointment_id)
      const encounterDate = new Date(encounter.date);
      const startOfDay = clinicStartOfDay(encounterDate);
      const endOfDay = clinicEndOfDay(encounterDate);

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', encounter.patient_id)
        .gte('starts_at', startOfDay.toISOString())
        .lte('starts_at', endOfDay.toISOString())
        .limit(1)
        .maybeSingle();

      if (error) return null;
      return data;
    },
    enabled: !!encounter,
  });

  // Cargar URLs firmadas de las fotos
  React.useEffect(() => {
    const loadPhotoUrls = async () => {
      // En modo local, usar storage local via SMB
      if (isLocalMode) {
        console.log('[Consultation] Loading photos from local storage');
        if (appointment?.photo_od) {
          const dataUrl = await readFileAsDataUrl('results', appointment.photo_od);
          if (dataUrl) setPhotoODUrl(dataUrl);
        }
        if (appointment?.photo_oi) {
          const dataUrl = await readFileAsDataUrl('results', appointment.photo_oi);
          if (dataUrl) setPhotoOIUrl(dataUrl);
        }
        return;
      }

      // Modo Supabase
      if (appointment?.photo_od) {
        const { data } = await supabase.storage
          .from('results')
          .createSignedUrl(appointment.photo_od, 3600); // 1 hora de validez
        if (data) setPhotoODUrl(data.signedUrl);
      }
      if (appointment?.photo_oi) {
        const { data } = await supabase.storage
          .from('results')
          .createSignedUrl(appointment.photo_oi, 3600);
        if (data) setPhotoOIUrl(data.signedUrl);
      }
    };

    if (appointment) {
      loadPhotoUrls();
    }
  }, [appointment, isLocalMode]);

  // Check if this is the first consultation
  const { data: isFirstConsultation } = useQuery({
    queryKey: ['first-consultation', encounter?.patient_id, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id) return true;

      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[Consultation] Checking first consultation from PostgreSQL local');
        const encounters = await invoke<EncounterLocal[]>('get_encounters_by_patient', {
          patientId: encounter.patient_id,
        });
        // Filtrar el encounter actual
        const otherEncounters = encounters.filter(e => e.id !== encounterId);
        return otherEncounters.length === 0;
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('encounters')
        .select('id')
        .eq('patient_id', encounter.patient_id)
        .neq('id', encounterId)
        .limit(1);

      if (error) throw error;
      return !data || data.length === 0;
    },
    enabled: !!encounter?.patient_id,
  });

  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    return differenceInYears(new Date(), new Date(dob));
  };

  // Parse autorrefractómetro y lensometría de forma tolerante
  const parseEyeData = (data: string | null) => {
    if (!data) return { od: { esfera: '', cilindro: '', eje: '' }, os: { esfera: '', cilindro: '', eje: '' } };

    const result = {
      od: { esfera: '', cilindro: '', eje: '' },
      os: { esfera: '', cilindro: '', eje: '' }
    };

    // Normalizar texto (quitar símbolos, usar punto decimal)
    const normalize = (s: string) => s
      .replace(/[°º]/g, '')
      .replace(/,/g, '.')
      .replace(/\s+/g, ' ')
      .trim();

    const parts = data.split('|').map(p => p.trim());

    parts.forEach(part => {
      if (part.toUpperCase().startsWith('OD:')) {
        const values = normalize(part.replace(/OD:/i, ''));
        const nums = values.match(/[-+]?\d*\.?\d+/g) || [];
        result.od.esfera = nums[0] || '';
        result.od.cilindro = nums[1] || '';
        result.od.eje = nums[2] || '';
      } else if (part.toUpperCase().startsWith('OS:')) {
        const values = normalize(part.replace(/OS:/i, ''));
        const nums = values.match(/[-+]?\d*\.?\d+/g) || [];
        result.os.esfera = nums[0] || '';
        result.os.cilindro = nums[1] || '';
        result.os.eje = nums[2] || '';
      }
    });

    return result;
  };

  // Cargar datos de autorefractor y lensometría desde appointment
  React.useEffect(() => {
    if (appointment) {
      const autoData = parseEyeData(appointment.autorefractor || null);
      const lensData = parseEyeData(appointment.lensometry || null);
      
      setAutoOD(autoData.od);
      setAutoOS(autoData.os);
      setLensOD(lensData.od);
      setLensOS(lensData.os);
      setPioPreconsultaOD(appointment.pio_od?.toString() || '');
      setPioPreconsultaOS(appointment.pio_os?.toString() || '');
      setKeratODK1((appointment as any).keratometry_od_k1 || '');
      setKeratODK2((appointment as any).keratometry_od_k2 || '');
      setKeratODAxis((appointment as any).keratometry_od_axis || '');
      setKeratOSK1((appointment as any).keratometry_os_k1 || '');
      setKeratOSK2((appointment as any).keratometry_os_k2 || '');
      setKeratOSAxis((appointment as any).keratometry_os_axis || '');
    }
  }, [appointment]);

  const getAppointmentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      nueva_consulta: 'Nueva consulta',
      reconsulta_menos_3m: 'Reconsulta - 3m',
      reconsulta_mas_3m: 'Reconsulta + 3m',
      post_operado: 'Post operado',
      lectura_resultados: 'Lectura resultados',
      cortesia: 'Cortesía',
      cirugia: 'Cirugía',
      procedimiento: 'Procedimiento',
      consulta: 'Consulta',
      diagnostico: 'Diagnóstico',
      control: 'Control',
    };
    return labels[type] || type;
  };

  const getAppointmentTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      nueva_consulta: 'bg-consulta text-foreground',
      reconsulta_menos_3m: 'bg-reconsulta-corta text-foreground',
      reconsulta_mas_3m: 'bg-reconsulta-larga text-foreground',
      post_operado: 'bg-post-operado text-foreground',
      lectura_resultados: 'bg-lectura text-foreground',
      cortesia: 'bg-post-operado text-foreground',
      cirugia: 'bg-cirugia text-foreground',
      procedimiento: 'bg-procedimiento text-foreground',
      consulta: 'bg-consulta text-foreground',
      diagnostico: 'bg-lectura text-foreground',
      control: 'bg-post-operado text-foreground',
    };
    return colors[type] || 'bg-primary text-primary-foreground';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando consulta...</p>
        </div>
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No se encontró la consulta</p>
          <Button onClick={() => navigate('/dashboard')}>
            Volver al Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const patientAge = calculateAge(encounter.patient?.dob || null);
  const appointmentType = appointment?.type;
  const isFirstTime = appointmentType === 'nueva_consulta' || isFirstConsultation;

  return (
    <div className="min-h-screen bg-background">
      {/* Botón Estudios - Flotante a la izquierda */}
      {encounter?.patient_id && (
        <Button
          onClick={() => navigate(`/ver-estudios/${encounter.patient_id}?returnTo=consultation&encounterId=${encounterId}`)}
          className="fixed left-4 top-44 z-40 shadow-lg"
          size="sm"
        >
          <FileImage className="h-4 w-4 mr-2" />
          Estudios
        </Button>
      )}
      
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSaveAndExit}
                className="mt-1"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <p className="text-2xl font-semibold">
                    {encounter.patient?.first_name} {encounter.patient?.last_name}
                  </p>
                  {patientAge !== null && (
                    <span className="text-lg text-muted-foreground">
                      {patientAge} años
                    </span>
                  )}
                  {appointmentType && (
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${getAppointmentTypeColor(appointmentType)}`}>
                      {getAppointmentTypeLabel(appointmentType)}
                    </span>
                  )}
                  {(diabetes || hta || alergia) && (
                    <div className="flex items-center gap-2">
                      {diabetes && <Badge variant="destructive">Diabetes</Badge>}
                      {hta && <Badge variant="destructive">HTA</Badge>}
                      {alergia && <Badge variant="destructive">Alergia: {alergiaText}</Badge>}
                    </div>
                  )}
                </div>
                {encounter.patient?.address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{encounter.patient.address}</span>
                  </div>
                )}
                {encounter.patient?.occupation && (
                  <p className="text-sm text-muted-foreground">
                    Ocupación: {encounter.patient.occupation}
                  </p>
                )}
              </div>
            </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-4">
                {appointment?.starts_at && (
                  <p className="text-sm text-muted-foreground">
                    {new Date(appointment.starts_at).toLocaleDateString('es-ES', {
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
                <Button 
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleFinishConsultation}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Terminar Consulta
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Dr. {encounter.doctor?.full_name}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Motivo de consulta */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-3">Motivo de consulta</h2>
            <Textarea 
              placeholder="Describa el motivo de la consulta..."
              className="min-h-[100px]"
              value={motivoConsulta}
              onChange={(e) => setMotivoConsulta(e.target.value)}
            />
          </div>

          {/* Antecedentes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border p-6">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-semibold">Antecedentes personales</h2>
                <Badge 
                  variant={diabetes ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setDiabetes(!diabetes)}
                >
                  Diabetes
                </Badge>
                <Badge 
                  variant={hta ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setHta(!hta)}
                >
                  HTA
                </Badge>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={alergia ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setAlergia(!alergia)}
                  >
                    Alergia:
                  </Badge>
                  {alergia && (
                    <Input 
                      placeholder="Especifique..."
                      value={alergiaText}
                      onChange={(e) => setAlergiaText(e.target.value)}
                      className="w-32 h-7"
                    />
                  )}
                </div>
              </div>
              <Textarea 
                placeholder="Antecedentes médicos generales..."
                className="min-h-[100px]"
                value={antecedentesGenerales}
                onChange={(e) => setAntecedentesGenerales(e.target.value)}
              />
            </div>

            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-3">Antecedentes oftalmológicos</h2>
              <Textarea 
                placeholder="Antecedentes oftalmológicos..."
                className="min-h-[100px]"
                value={antecedentesOftalmologicos}
                onChange={(e) => setAntecedentesOftalmologicos(e.target.value)}
              />
            </div>
          </div>

          {/* Preconsulta */}
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-semibold">Preconsulta</h2>
              <Dialog open={photosDialogOpen} onOpenChange={setPhotosDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    variant={(appointment?.photo_od || appointment?.photo_oi) ? "default" : "outline"}
                    size="sm"
                    disabled={!appointment?.photo_od && !appointment?.photo_oi}
                    className={(appointment?.photo_od || appointment?.photo_oi) ? "bg-green-600 hover:bg-green-700" : "border-green-600 text-green-600"}
                  >
                    Fotos
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>Fotos de Preconsulta</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-6 py-4">
                    {/* OD */}
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-center">OD</h3>
                      {photoODUrl ? (
                        <img 
                          src={photoODUrl}
                          alt="Foto OD"
                          className="w-full h-auto rounded-lg border"
                        />
                      ) : (
                        <div className="w-full h-64 flex items-center justify-center bg-muted rounded-lg border">
                          <p className="text-muted-foreground">No hay foto</p>
                        </div>
                      )}
                    </div>
                    {/* OS */}
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-center">OS</h3>
                      {photoOIUrl ? (
                        <img 
                          src={photoOIUrl}
                          alt="Foto OS"
                          className="w-full h-auto rounded-lg border"
                        />
                      ) : (
                        <div className="w-full h-64 flex items-center justify-center bg-muted rounded-lg border">
                          <p className="text-muted-foreground">No hay foto</p>
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Columna izquierda: Autorrefractómetro y Lensometría */}
              <div className="space-y-6">
                {/* Autorrefractómetro */}
                <div>
                  <h3 className="text-base font-semibold mb-4">Autorrefractómetro</h3>
                  <div className="space-y-4">
                    {/* OD */}
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                      <div className="grid grid-cols-3 gap-3">
                        <Input 
                          placeholder="Esfera" 
                          value={autoOD.esfera} 
                          onChange={(e) => setAutoOD({ ...autoOD, esfera: e.target.value })}
                        />
                        <Input 
                          placeholder="Cilindro" 
                          value={autoOD.cilindro} 
                          onChange={(e) => setAutoOD({ ...autoOD, cilindro: e.target.value })}
                        />
                        <Input 
                          placeholder="Eje (0-180)" 
                          value={autoOD.eje} 
                          onChange={(e) => validateAxisInput(
                            e.target.value,
                            'Autorefractómetro OD',
                            (val) => setAutoOD({ ...autoOD, eje: val })
                          )}
                        />
                      </div>
                    </div>
                    {/* OS */}
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                      <div className="grid grid-cols-3 gap-3">
                        <Input 
                          placeholder="Esfera" 
                          value={autoOS.esfera} 
                          onChange={(e) => setAutoOS({ ...autoOS, esfera: e.target.value })}
                        />
                        <Input 
                          placeholder="Cilindro" 
                          value={autoOS.cilindro} 
                          onChange={(e) => setAutoOS({ ...autoOS, cilindro: e.target.value })}
                        />
                        <Input 
                          placeholder="Eje (0-180)" 
                          value={autoOS.eje} 
                          onChange={(e) => validateAxisInput(
                            e.target.value,
                            'Autorefractómetro OS',
                            (val) => setAutoOS({ ...autoOS, eje: val })
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lensometría */}
                <div>
                  <h3 className="text-base font-semibold mb-4">Lensometría</h3>
                  <div className="space-y-4">
                    {/* OD */}
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                      <div className="grid grid-cols-3 gap-3">
                        <Input 
                          placeholder="Esfera" 
                          value={lensOD.esfera} 
                          onChange={(e) => setLensOD({ ...lensOD, esfera: e.target.value })}
                        />
                        <Input 
                          placeholder="Cilindro" 
                          value={lensOD.cilindro} 
                          onChange={(e) => setLensOD({ ...lensOD, cilindro: e.target.value })}
                        />
                        <Input 
                          placeholder="Eje (0-180)" 
                          value={lensOD.eje} 
                          onChange={(e) => validateAxisInput(
                            e.target.value,
                            'Lensometría OD',
                            (val) => setLensOD({ ...lensOD, eje: val })
                          )}
                        />
                      </div>
                    </div>
                    {/* OS */}
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                      <div className="grid grid-cols-3 gap-3">
                        <Input 
                          placeholder="Esfera" 
                          value={lensOS.esfera} 
                          onChange={(e) => setLensOS({ ...lensOS, esfera: e.target.value })}
                        />
                        <Input 
                          placeholder="Cilindro" 
                          value={lensOS.cilindro} 
                          onChange={(e) => setLensOS({ ...lensOS, cilindro: e.target.value })}
                        />
                        <Input 
                          placeholder="Eje (0-180)" 
                          value={lensOS.eje} 
                          onChange={(e) => validateAxisInput(
                            e.target.value,
                            'Lensometría OS',
                            (val) => setLensOS({ ...lensOS, eje: val })
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Columna derecha: Queratometrías y PIO */}
              <div className="space-y-6">
                {/* Queratometrías */}
                <div>
                  <h3 className="text-base font-semibold mb-4">Queratometrías</h3>
                  <div className="space-y-4">
                    {/* OD */}
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Input 
                          placeholder="K1" 
                          value={keratODK1}
                          onChange={(e) => setKeratODK1(e.target.value)}
                        />
                        <Input 
                          placeholder="K2" 
                          value={keratODK2}
                          onChange={(e) => setKeratODK2(e.target.value)}
                        />
                      </div>
                    </div>
                    {/* OS */}
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Input 
                          placeholder="K1" 
                          value={keratOSK1}
                          onChange={(e) => setKeratOSK1(e.target.value)}
                        />
                        <Input 
                          placeholder="K2" 
                          value={keratOSK2}
                          onChange={(e) => setKeratOSK2(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* PIO */}
                <div>
                  <h3 className="text-base font-semibold mb-4">PIO (Presión Intraocular)</h3>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                      <Input 
                        placeholder="mmHg" 
                        value={pioPreconsultaOD}
                        onChange={(e) => setPioPreconsultaOD(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                      <Input 
                        placeholder="mmHg" 
                        value={pioPreconsultaOS}
                        onChange={(e) => setPioPreconsultaOS(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Agudeza Visual y Refracción */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-6">Agudeza Visual y Refracción</h2>
            
            <div className="grid grid-cols-[160px_auto_160px_auto_1fr] gap-4 items-start">
              {/* Sin corrección */}
              <div>
                <h3 className="text-base font-semibold mb-4">Sin corrección</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm mb-2 block">OD</Label>
                    <Select value={avSinCorreccionOD} onValueChange={setAvSinCorreccionOD}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20/20">20/20</SelectItem>
                        <SelectItem value="20/25">20/25</SelectItem>
                        <SelectItem value="20/30">20/30</SelectItem>
                        <SelectItem value="20/40">20/40</SelectItem>
                        <SelectItem value="20/50">20/50</SelectItem>
                        <SelectItem value="20/60">20/60</SelectItem>
                        <SelectItem value="20/70">20/70</SelectItem>
                        <SelectItem value="20/80">20/80</SelectItem>
                      <SelectItem value="20/100">20/100</SelectItem>
                      <SelectItem value="20/150">20/150</SelectItem>
                      <SelectItem value="20/200">20/200</SelectItem>
                        <SelectItem value="20/400">20/400</SelectItem>
                        <SelectItem value="CD">CD</SelectItem>
                        <SelectItem value="MM">MM</SelectItem>
                        <SelectItem value="PL">PL</SelectItem>
                        <SelectItem value="NPL">NPL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm mb-2 block">OS</Label>
                    <Select value={avSinCorreccionOS} onValueChange={setAvSinCorreccionOS}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20/20">20/20</SelectItem>
                        <SelectItem value="20/25">20/25</SelectItem>
                        <SelectItem value="20/30">20/30</SelectItem>
                        <SelectItem value="20/40">20/40</SelectItem>
                        <SelectItem value="20/50">20/50</SelectItem>
                        <SelectItem value="20/60">20/60</SelectItem>
                        <SelectItem value="20/70">20/70</SelectItem>
                        <SelectItem value="20/80">20/80</SelectItem>
                      <SelectItem value="20/100">20/100</SelectItem>
                      <SelectItem value="20/150">20/150</SelectItem>
                      <SelectItem value="20/200">20/200</SelectItem>
                        <SelectItem value="20/400">20/400</SelectItem>
                        <SelectItem value="CD">CD</SelectItem>
                        <SelectItem value="MM">MM</SelectItem>
                        <SelectItem value="PL">PL</SelectItem>
                        <SelectItem value="NPL">NPL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Separador */}
              <Separator orientation="vertical" className="h-full" />

              {/* Con corrección */}
              <div>
                <h3 className="text-base font-semibold mb-4">Con corrección</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm mb-2 block">OD</Label>
                    <Select value={avConCorreccionOD} onValueChange={setAvConCorreccionOD}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20/20">20/20</SelectItem>
                        <SelectItem value="20/25">20/25</SelectItem>
                        <SelectItem value="20/30">20/30</SelectItem>
                        <SelectItem value="20/40">20/40</SelectItem>
                        <SelectItem value="20/50">20/50</SelectItem>
                        <SelectItem value="20/60">20/60</SelectItem>
                        <SelectItem value="20/70">20/70</SelectItem>
                        <SelectItem value="20/80">20/80</SelectItem>
                      <SelectItem value="20/100">20/100</SelectItem>
                      <SelectItem value="20/150">20/150</SelectItem>
                      <SelectItem value="20/200">20/200</SelectItem>
                        <SelectItem value="20/400">20/400</SelectItem>
                        <SelectItem value="CD">CD</SelectItem>
                        <SelectItem value="MM">MM</SelectItem>
                        <SelectItem value="PL">PL</SelectItem>
                        <SelectItem value="NPL">NPL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm mb-2 block">OS</Label>
                    <Select value={avConCorreccionOS} onValueChange={setAvConCorreccionOS}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20/20">20/20</SelectItem>
                        <SelectItem value="20/25">20/25</SelectItem>
                        <SelectItem value="20/30">20/30</SelectItem>
                        <SelectItem value="20/40">20/40</SelectItem>
                        <SelectItem value="20/50">20/50</SelectItem>
                        <SelectItem value="20/60">20/60</SelectItem>
                        <SelectItem value="20/70">20/70</SelectItem>
                        <SelectItem value="20/80">20/80</SelectItem>
                      <SelectItem value="20/100">20/100</SelectItem>
                      <SelectItem value="20/150">20/150</SelectItem>
                      <SelectItem value="20/200">20/200</SelectItem>
                        <SelectItem value="20/400">20/400</SelectItem>
                        <SelectItem value="CD">CD</SelectItem>
                        <SelectItem value="MM">MM</SelectItem>
                        <SelectItem value="PL">PL</SelectItem>
                        <SelectItem value="NPL">NPL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Separador */}
              <Separator orientation="vertical" className="h-full" />

              {/* Refracción subjetiva */}
              <div>
                <h3 className="text-base font-semibold mb-4">Refracción subjetiva</h3>
                <div className="space-y-4">
                  {/* OD */}
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                    <div className="grid grid-cols-4 gap-2">
                      <Input 
                        placeholder="Esfera" 
                        className="text-sm" 
                        value={subjetivaOD.esfera}
                        onChange={(e) => setSubjetivaOD({ ...subjetivaOD, esfera: e.target.value })}
                      />
                      <Input 
                        placeholder="Cilindro" 
                        className="text-sm" 
                        value={subjetivaOD.cilindro}
                        onChange={(e) => setSubjetivaOD({ ...subjetivaOD, cilindro: e.target.value })}
                      />
                      <Input 
                        placeholder="Eje (0-180)" 
                        className="text-sm" 
                        value={subjetivaOD.eje}
                        onChange={(e) => validateAxisInput(
                          e.target.value,
                          'Refracción Subjetiva OD',
                          (val) => setSubjetivaOD({ ...subjetivaOD, eje: val })
                        )}
                      />
                      <Select 
                        value={subjetivaOD.av}
                        onValueChange={(value) => setSubjetivaOD({ ...subjetivaOD, av: value })}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="AV" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20/20">20/20</SelectItem>
                          <SelectItem value="20/25">20/25</SelectItem>
                          <SelectItem value="20/30">20/30</SelectItem>
                          <SelectItem value="20/40">20/40</SelectItem>
                          <SelectItem value="20/50">20/50</SelectItem>
                          <SelectItem value="20/60">20/60</SelectItem>
                          <SelectItem value="20/70">20/70</SelectItem>
                          <SelectItem value="20/80">20/80</SelectItem>
                      <SelectItem value="20/100">20/100</SelectItem>
                      <SelectItem value="20/150">20/150</SelectItem>
                      <SelectItem value="20/200">20/200</SelectItem>
                          <SelectItem value="20/400">20/400</SelectItem>
                          <SelectItem value="CD">CD</SelectItem>
                          <SelectItem value="MM">MM</SelectItem>
                          <SelectItem value="PL">PL</SelectItem>
                          <SelectItem value="NPL">NPL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* OS */}
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                    <div className="grid grid-cols-4 gap-2">
                      <Input 
                        placeholder="Esfera" 
                        className="text-sm" 
                        value={subjetivaOS.esfera}
                        onChange={(e) => setSubjetivaOS({ ...subjetivaOS, esfera: e.target.value })}
                      />
                      <Input 
                        placeholder="Cilindro" 
                        className="text-sm" 
                        value={subjetivaOS.cilindro}
                        onChange={(e) => setSubjetivaOS({ ...subjetivaOS, cilindro: e.target.value })}
                      />
                      <Input 
                        placeholder="Eje (0-180)" 
                        className="text-sm" 
                        value={subjetivaOS.eje}
                        onChange={(e) => validateAxisInput(
                          e.target.value,
                          'Refracción Subjetiva OS',
                          (val) => setSubjetivaOS({ ...subjetivaOS, eje: val })
                        )}
                      />
                      <Select 
                        value={subjetivaOS.av}
                        onValueChange={(value) => setSubjetivaOS({ ...subjetivaOS, av: value })}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="AV" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20/20">20/20</SelectItem>
                          <SelectItem value="20/25">20/25</SelectItem>
                          <SelectItem value="20/30">20/30</SelectItem>
                          <SelectItem value="20/40">20/40</SelectItem>
                          <SelectItem value="20/50">20/50</SelectItem>
                          <SelectItem value="20/60">20/60</SelectItem>
                          <SelectItem value="20/70">20/70</SelectItem>
                          <SelectItem value="20/80">20/80</SelectItem>
                      <SelectItem value="20/100">20/100</SelectItem>
                      <SelectItem value="20/150">20/150</SelectItem>
                      <SelectItem value="20/200">20/200</SelectItem>
                          <SelectItem value="20/400">20/400</SelectItem>
                          <SelectItem value="CD">CD</SelectItem>
                          <SelectItem value="MM">MM</SelectItem>
                          <SelectItem value="PL">PL</SelectItem>
                          <SelectItem value="NPL">NPL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Nota de refracción */}
            <div className="mt-6">
              <Label htmlFor="notaRefraccion" className="text-sm font-medium text-muted-foreground mb-2 block">Nota</Label>
              <Textarea 
                id="notaRefraccion"
                placeholder="Agregar nota adicional..."
                className="min-h-[80px]"
                value={notaRefraccion}
                onChange={(e) => setNotaRefraccion(e.target.value)}
              />
            </div>
          </div>

          {/* Receta a imprimir */}
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-xl font-semibold">Receta a imprimir</h2>
              <Button variant="outline" size="sm" onClick={copySubjetivaToReceta}>
                Usar subjetiva
              </Button>
              <Button size="sm" onClick={handlePrintReceta} disabled={isGeneratingPrescription || isGenerating}>
                {isGeneratingPrescription ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir
                  </>
                )}
              </Button>
            </div>
            
            <div className="grid grid-cols-[auto_auto_auto_auto_auto] gap-6 items-start">
              {/* Campos de refracción */}
              <div className="space-y-4">
                {/* OD */}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                  <div className="grid grid-cols-4 gap-3">
                    <Input 
                      placeholder="Esfera" 
                      className="text-sm" 
                      value={recetaOD.esfera}
                      onChange={(e) => setRecetaOD({ ...recetaOD, esfera: e.target.value })}
                    />
                    <Input 
                      placeholder="Cilindro" 
                      className="text-sm" 
                      value={recetaOD.cilindro}
                      onChange={(e) => setRecetaOD({ ...recetaOD, cilindro: e.target.value })}
                    />
                    <Input 
                      placeholder="Eje (0-180)" 
                      className="text-sm" 
                      value={recetaOD.eje}
                      onChange={(e) => validateAxisInput(
                        e.target.value,
                        'Receta OD',
                        (val) => setRecetaOD({ ...recetaOD, eje: val })
                      )}
                    />
                    <Input 
                      placeholder="ADD" 
                      className="text-sm" 
                      value={recetaOD.add}
                      onChange={(e) => setRecetaOD({ ...recetaOD, add: e.target.value })}
                    />
                  </div>
                </div>
                {/* OS */}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                  <div className="grid grid-cols-4 gap-3">
                    <Input 
                      placeholder="Esfera" 
                      className="text-sm" 
                      value={recetaOS.esfera}
                      onChange={(e) => setRecetaOS({ ...recetaOS, esfera: e.target.value })}
                    />
                    <Input 
                      placeholder="Cilindro" 
                      className="text-sm" 
                      value={recetaOS.cilindro}
                      onChange={(e) => setRecetaOS({ ...recetaOS, cilindro: e.target.value })}
                    />
                    <Input 
                      placeholder="Eje (0-180)" 
                      className="text-sm" 
                      value={recetaOS.eje}
                      onChange={(e) => validateAxisInput(
                        e.target.value,
                        'Receta OS',
                        (val) => setRecetaOS({ ...recetaOS, eje: val })
                      )}
                    />
                    <Input 
                      placeholder="ADD" 
                      className="text-sm" 
                      value={recetaOS.add}
                      onChange={(e) => setRecetaOS({ ...recetaOS, add: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Separador */}
              <Separator orientation="vertical" className="h-full" />

              {/* Material */}
              <div>
                <Label className="text-sm font-medium text-muted-foreground mb-4 block">Material</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="vidrio" 
                      checked={materialVidrio}
                      onCheckedChange={(checked) => setMaterialVidrio(checked as boolean)}
                    />
                    <label
                      htmlFor="vidrio"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Vidrio
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="cr39" 
                      checked={materialCR39}
                      onCheckedChange={(checked) => setMaterialCR39(checked as boolean)}
                    />
                    <label
                      htmlFor="cr39"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      CR-39
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="policarbonato" 
                      checked={materialPolicarbonato}
                      onCheckedChange={(checked) => setMaterialPolicarbonato(checked as boolean)}
                    />
                    <label
                      htmlFor="policarbonato"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Policarbonato
                    </label>
                  </div>
                </div>
              </div>

              {/* Separador */}
              <Separator orientation="vertical" className="h-full" />

              {/* Color */}
              <div>
                <Label className="text-sm font-medium text-muted-foreground mb-4 block">Color</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="blanco" 
                      checked={colorBlanco}
                      onCheckedChange={(checked) => setColorBlanco(checked as boolean)}
                    />
                    <label
                      htmlFor="blanco"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Blanco
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="transitions" 
                      checked={colorTransitions}
                      onCheckedChange={(checked) => setColorTransitions(checked as boolean)}
                    />
                    <label
                      htmlFor="transitions"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Transitions
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="antireflejo" 
                      checked={colorAntireflejo}
                      onCheckedChange={(checked) => setColorAntireflejo(checked as boolean)}
                    />
                    <label
                      htmlFor="antireflejo"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Antireflejo
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="filtroAzul" 
                      checked={colorFiltroAzul}
                      onCheckedChange={(checked) => setColorFiltroAzul(checked as boolean)}
                    />
                    <label
                      htmlFor="filtroAzul"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Filtro Azul
                    </label>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="otros" 
                        checked={colorOtros}
                        onCheckedChange={(checked) => setColorOtros(checked as boolean)}
                      />
                      <label
                        htmlFor="otros"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Otros:
                      </label>
                    </div>
                    {colorOtros && (
                      <Input 
                        placeholder="Especificar..."
                        className="text-sm ml-6"
                        value={colorOtrosText}
                        onChange={(e) => setColorOtrosText(e.target.value)}
                      />
                    )}
                </div>
              </div>
            </div>
          </div>
            
            {/* Tipo de material y DP */}
            <div className="mt-6">
              <div className="flex items-center gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="lejos" 
                    checked={tipoLejos}
                    onCheckedChange={(checked) => setTipoLejos(checked as boolean)}
                  />
                  <label
                    htmlFor="lejos"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Lejos
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="cerca" 
                    checked={tipoCerca}
                    onCheckedChange={(checked) => setTipoCerca(checked as boolean)}
                  />
                  <label
                    htmlFor="cerca"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Cerca
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="progresivo" 
                    checked={tipoProgresivo}
                    onCheckedChange={(checked) => setTipoProgresivo(checked as boolean)}
                  />
                  <label
                    htmlFor="progresivo"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Progresivo
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="bifocal" 
                    checked={tipoBifocal}
                    onCheckedChange={(checked) => setTipoBifocal(checked as boolean)}
                  />
                  <label
                    htmlFor="bifocal"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Bifocal
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="dp" className="text-sm font-medium text-muted-foreground">DP</Label>
                  <Input 
                    id="dp"
                    placeholder="Distancia pupilar"
                    className="text-sm w-40"
                    value={dp}
                    onChange={(e) => setDp(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Examen físico */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-6">Examen físico</h2>
            
            <div className="grid grid-cols-[1fr_auto_1fr] gap-6">
              {/* OD */}
              <div>
                <h3 className="text-base font-semibold mb-4">OD</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Lampara de Hendidura y Retina</Label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <label
                          htmlFor="lh-ok-od"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          SA OK
                        </label>
                        <Checkbox 
                          id="lh-ok-od" 
                          checked={lhOkOD}
                          onCheckedChange={(checked) => {
                            const newValue = checked as boolean;
                            setLhOkOD(newValue);
                            setLamparaOD(buildLamparaText(newValue, fondoOkOD));
                          }}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <label
                          htmlFor="fondo-ok-od"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Fondo de Ojo OK
                        </label>
                        <Checkbox 
                          id="fondo-ok-od" 
                          checked={fondoOkOD}
                          onCheckedChange={(checked) => {
                            const newValue = checked as boolean;
                            setFondoOkOD(newValue);
                            setLamparaOD(buildLamparaText(lhOkOD, newValue));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Textarea 
                      placeholder="Lampara de hendidura..."
                      className="min-h-[120px]"
                      value={lamparaOD}
                      onChange={(e) => setLamparaOD(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="pio-od" className="text-sm font-medium">PIO</Label>
                      <Input 
                        id="pio-od"
                        placeholder=""
                        className="text-sm w-24"
                        value={pioOD}
                        onChange={(e) => setPioOD(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="exc-od" className="text-sm font-medium">Exc</Label>
                      <Input 
                        id="exc-od"
                        placeholder=""
                        className="text-sm w-24"
                        value={excOD}
                        onChange={(e) => setExcOD(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Separador */}
              <Separator orientation="vertical" className="h-full" />

              {/* OS */}
              <div>
                <h3 className="text-base font-semibold mb-4">OS</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Lampara de Hendidura y Retina</Label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <label
                          htmlFor="lh-ok-os"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          SA OK
                        </label>
                        <Checkbox 
                          id="lh-ok-os" 
                          checked={lhOkOS}
                          onCheckedChange={(checked) => {
                            const newValue = checked as boolean;
                            setLhOkOS(newValue);
                            setLamparaOS(buildLamparaText(newValue, fondoOkOS));
                          }}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <label
                          htmlFor="fondo-ok-os"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Fondo de Ojo OK
                        </label>
                        <Checkbox 
                          id="fondo-ok-os" 
                          checked={fondoOkOS}
                          onCheckedChange={(checked) => {
                            const newValue = checked as boolean;
                            setFondoOkOS(newValue);
                            setLamparaOS(buildLamparaText(lhOkOS, newValue));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Textarea 
                      placeholder="Lampara de hendidura..."
                      className="min-h-[120px]"
                      value={lamparaOS}
                      onChange={(e) => setLamparaOS(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="pio-os" className="text-sm font-medium">PIO</Label>
                      <Input 
                        id="pio-os"
                        placeholder=""
                        className="text-sm w-24"
                        value={pioOS}
                        onChange={(e) => setPioOS(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="exc-os" className="text-sm font-medium">Exc</Label>
                      <Input 
                        id="exc-os"
                        placeholder=""
                        className="text-sm w-24"
                        value={excOS}
                        onChange={(e) => setExcOS(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Diagnóstico y Tratamiento */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-6">Diagnóstico y Tratamiento</h2>
            
            <div className="space-y-6">
              {/* Diagnóstico */}
              <div>
                <Label htmlFor="diagnostico" className="text-sm font-medium mb-2 block">Diagnóstico</Label>
                <Textarea 
                  id="diagnostico"
                  placeholder="Descripción del diagnóstico..."
                  className="min-h-[100px]"
                  value={diagnostico}
                  onChange={(e) => setDiagnostico(e.target.value)}
                />
              </div>

              {/* Plan de Tratamiento */}
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <Label htmlFor="planTratamiento" className="text-sm font-medium">Plan de Tratamiento</Label>
                  <Button size="sm" variant="outline" onClick={() => setShowStockPanel(!showStockPanel)}>
                    <Package className="mr-2 h-4 w-4" />
                    {showStockPanel ? 'Cerrar Stock' : 'Ver Stock'}
                  </Button>
                  <Button size="sm" onClick={handlePrintTreatment} disabled={isGeneratingTreatment || isGenerating}>
                    {isGeneratingTreatment ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir
                      </>
                    )}
                  </Button>
                </div>
                <Textarea 
                  id="planTratamiento"
                  placeholder="Descripción del plan de tratamiento..."
                  className="min-h-[100px]"
                  value={planTratamiento}
                  onChange={(e) => setPlanTratamiento(e.target.value)}
                />
              </div>

              {/* Cirugías y Estudios en Grid */}
              <div className="grid grid-cols-2 gap-6">
                {/* Cirugías */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-4">
                      <Label className="text-sm font-medium">Cirugías</Label>
                      <Dialog open={cirugiasDialogOpen} onOpenChange={setCirugiasDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            Agregar
                          </Button>
                        </DialogTrigger>
                      <DialogContent className="max-w-3xl">
                        <DialogHeader>
                          <DialogTitle className="text-xl">Seleccionar Cirugías</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                          <div>
                            <Label className="text-base font-medium mb-3 block">Ojo</Label>
                            <div className="flex gap-3">
                              <Button
                                variant={selectedOjoCirugia === 'OD' ? 'default' : 'outline'}
                                size="lg"
                                onClick={() => setSelectedOjoCirugia('OD')}
                                className="text-base px-8"
                              >
                                OD
                              </Button>
                              <Button
                                variant={selectedOjoCirugia === 'OI' ? 'default' : 'outline'}
                                size="lg"
                                onClick={() => setSelectedOjoCirugia('OI')}
                                className="text-base px-8"
                              >
                                OI
                              </Button>
                              <Button
                                variant={selectedOjoCirugia === 'OU' ? 'default' : 'outline'}
                                size="lg"
                                onClick={() => setSelectedOjoCirugia('OU')}
                                className="text-base px-8"
                              >
                                OU
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2">
                            {Object.entries(cirugiasDisponibles).map(([category, surgeries]) => (
                              <div key={category}>
                                <Label className="text-base font-semibold mb-3 block text-primary">{category}</Label>
                                <div className="flex flex-wrap gap-3">
                                  {surgeries.map((cirugia) => (
                                    <Badge
                                      key={cirugia}
                                      variant={tempCirugias.includes(cirugia) ? "default" : "outline"}
                                      className="cursor-pointer text-sm px-4 py-2 hover:scale-105 transition-transform"
                                      onClick={() => {
                                        setTempCirugias(prev => 
                                          prev.includes(cirugia) 
                                            ? prev.filter(c => c !== cirugia)
                                            : [...prev, cirugia]
                                        );
                                      }}
                                    >
                                      {cirugia}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-start gap-3 pt-4">
                            <Button onClick={handleCirugiasOk} size="lg" className="text-base">
                              OK
                            </Button>
                            <Button variant="outline" size="lg" className="text-base" onClick={() => {
                              setTempCirugias([]);
                              setCirugiasDialogOpen(false);
                            }}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    </div>
                    <Button size="sm" onClick={handlePrintSurgeries} disabled={isGeneratingSurgeries || isGenerating}>
                      {isGeneratingSurgeries ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Printer className="mr-2 h-4 w-4" />
                          Imprimir
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea 
                    placeholder="Cirugías seleccionadas..."
                    className="min-h-[100px]"
                    value={cirugias}
                    onChange={(e) => setCirugias(e.target.value)}
                  />
                </div>

                {/* Estudios */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-4">
                      <Label className="text-sm font-medium">Estudios y procedimientos</Label>
                      <Dialog open={estudiosDialogOpen} onOpenChange={setEstudiosDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            Agregar
                          </Button>
                        </DialogTrigger>
                      <DialogContent className="max-w-3xl">
                        <DialogHeader>
                          <DialogTitle className="text-xl">Seleccionar Estudios</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                          <div>
                            <Label className="text-base font-medium mb-3 block">Ojo</Label>
                            <div className="flex gap-3">
                              <Button
                                variant={selectedOjoEstudio === 'OD' ? 'default' : 'outline'}
                                size="lg"
                                onClick={() => setSelectedOjoEstudio('OD')}
                                className="text-base px-8"
                              >
                                OD
                              </Button>
                              <Button
                                variant={selectedOjoEstudio === 'OI' ? 'default' : 'outline'}
                                size="lg"
                                onClick={() => setSelectedOjoEstudio('OI')}
                                className="text-base px-8"
                              >
                                OI
                              </Button>
                              <Button
                                variant={selectedOjoEstudio === 'OU' ? 'default' : 'outline'}
                                size="lg"
                                onClick={() => setSelectedOjoEstudio('OU')}
                                className="text-base px-8"
                              >
                                OU
                              </Button>
                            </div>
                          </div>
                          <div className="max-h-[500px] overflow-y-auto pr-2 space-y-5">
                            <div>
                              <Label className="text-base font-semibold mb-3 block text-foreground">Estudios</Label>
                              <div className="flex flex-wrap gap-3">
                                {estudiosDisponibles.map((estudio) => (
                                  <Badge
                                    key={estudio}
                                    variant={tempEstudios.includes(estudio) ? "default" : "outline"}
                                    className="cursor-pointer text-sm px-4 py-2 hover:scale-105 transition-transform"
                                    onClick={() => {
                                      setTempEstudios(prev => 
                                        prev.includes(estudio) 
                                          ? prev.filter(e => e !== estudio)
                                          : [...prev, estudio]
                                      );
                                    }}
                                  >
                                    {estudio}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            
                            <div>
                              <Label className="text-base font-semibold mb-3 block text-foreground">Procedimientos</Label>
                              <div className="flex flex-wrap gap-3">
                                {procedimientosDisponibles.map((procedimiento) => (
                                  <Badge
                                    key={procedimiento}
                                    variant={tempProcedimientos.includes(procedimiento) ? "default" : "outline"}
                                    className="cursor-pointer text-sm px-4 py-2 hover:scale-105 transition-transform"
                                    onClick={() => {
                                      setTempProcedimientos(prev => 
                                        prev.includes(procedimiento) 
                                          ? prev.filter(p => p !== procedimiento)
                                          : [...prev, procedimiento]
                                      );
                                    }}
                                  >
                                    {procedimiento}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-start gap-3 pt-4">
                            <Button onClick={handleEstudiosOk} size="lg" className="text-base">
                              OK
                            </Button>
                            <Button variant="outline" size="lg" className="text-base" onClick={() => {
                              setTempEstudios([]);
                              setTempProcedimientos([]);
                              setEstudiosDialogOpen(false);
                            }}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    </div>
                    <Button size="sm" onClick={handlePrintStudies} disabled={isGeneratingStudies || isGenerating}>
                      {isGeneratingStudies ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Printer className="mr-2 h-4 w-4" />
                          Imprimir
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea 
                    placeholder="Estudios seleccionados..."
                    className="min-h-[100px]"
                    value={estudios}
                    onChange={(e) => setEstudios(e.target.value)}
                  />
                </div>
              </div>

              {/* Próxima cita */}
              <div className="flex items-center gap-4 max-w-md">
                <Label htmlFor="proximaCita" className="text-sm font-medium whitespace-nowrap">Próxima cita</Label>
                <Input 
                  id="proximaCita"
                  placeholder="Fecha o descripción..."
                  className="text-sm"
                  value={proximaCita}
                  onChange={(e) => setProximaCita(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Botón Terminar Consulta */}
          <div className="flex justify-center py-8">
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg"
              onClick={handleFinishConsultation}
              size="lg"
            >
              <Check className="h-5 w-5 mr-2" />
              Terminar Consulta
            </Button>
          </div>
        </div>
      </main>

      {/* Print Preview Dialog */}
      <PrintPreviewDialog
        isOpen={previewOpen}
        onClose={handleClosePreview}
        htmlContent={htmlContent}
        title={previewTitle}
      />
      
      {/* Stock Panel */}
      {showStockPanel && (
        <StockPanel
          onClose={() => setShowStockPanel(false)}
          onSelectItem={handleAddDropToTreatment}
        />
      )}

      {/* Voice Dictation FAB */}
      {isVoiceDictationEnabled && <VoiceDictationFAB
        availableFields={['diagnostico', 'planTratamiento', 'motivoConsulta', 'lamparaOD', 'lamparaOS', 'antecedentesGenerales', 'antecedentesOftalmologicos']}
        onApplyDictation={(field: DictationField, content: string) => {
          switch (field) {
            case 'diagnostico':
              setDiagnostico(prev => prev ? `${prev}\n${content}` : content);
              break;
            case 'planTratamiento':
              setPlanTratamiento(prev => prev ? `${prev}\n${content}` : content);
              break;
            case 'motivoConsulta':
              setMotivoConsulta(prev => prev ? `${prev}\n${content}` : content);
              break;
            case 'lamparaOD':
              setLamparaOD(prev => prev ? `${prev}. ${content}` : content);
              break;
            case 'lamparaOS':
              setLamparaOS(prev => prev ? `${prev}. ${content}` : content);
              break;
            case 'antecedentesGenerales':
              setAntecedentesGenerales(prev => prev ? `${prev}\n${content}` : content);
              break;
            case 'antecedentesOftalmologicos':
              setAntecedentesOftalmologicos(prev => prev ? `${prev}\n${content}` : content);
              break;
          }
        }}
      />}
    </div>
  );
}
