import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Check, ChevronDown, Loader2, FileImage, Package } from 'lucide-react';
import { MobileSidebarSheet } from '@/components/MobileSidebarSheet';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import React from 'react';
import { usePrintPDF } from '@/hooks/usePrintPDF';
import { PrintPreviewDialog } from '@/components/dashboard/PrintPreviewDialog';
import { StockPanel } from '@/components/dashboard/StockPanel';
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
  interpretacion_resultados: string | null;
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
  ref_sphere: number | null;
  ref_cyl: number | null;
  ref_axis: number | null;
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

interface StudyLocal {
  id: string;
  appointment_id: string | null;
  patient_id: string;
  study_type: string;
  study_date: string;
  status: string;
  results: string | null;
  notes: string | null;
}

interface SurgeryLocal {
  id: string;
  encounter_id: string | null;
  appointment_id: string | null;
  patient_id: string;
  surgery_type: string;
  ojo_operar: string | null;
  surgery_date: string | null;
  status: string;
  notes: string | null;
}

interface ProcedureLocal {
  id: string;
  encounter_id: string;
  appointment_id: string | null;
  patient_id: string;
  tipo_procedimiento: string | null;
  ojo_operar: string | null;
}

export default function Reconsulta() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { generatePDF, isGenerating, htmlContent, clearContent } = usePrintPDF();
  const { user } = useAuth();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const { isVoiceDictationEnabled } = useAppSettings();
  const { currentBranch } = useBranch();

  // Ref y estado para medir altura del header dinámicamente
  const headerRef = React.useRef<HTMLElement | null>(null);
  const [stickyTop, setStickyTop] = React.useState(120); // 120px inicial (estimado)

  // Estados para agudeza visual
  const [avSinCorreccionOD, setAvSinCorreccionOD] = React.useState('');
  const [avSinCorreccionOS, setAvSinCorreccionOS] = React.useState('');
  const [avConCorreccionOD, setAvConCorreccionOD] = React.useState('');
  const [avConCorreccionOS, setAvConCorreccionOS] = React.useState('');
  
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
  const [antecedentesGenerales, setAntecedentesGenerales] = React.useState('');
  const [antecedentesOftalmologicos, setAntecedentesOftalmologicos] = React.useState('');
  const [datosSubjetivos, setDatosSubjetivos] = React.useState('');
  const [antecedentesOpen, setAntecedentesOpen] = React.useState(false);
  
  // State for viewing previous encounter
  const [selectedEncounterId, setSelectedEncounterId] = React.useState<string | null>(null);
  const [isViewingEncounter, setIsViewingEncounter] = React.useState(false);
  const [previewTitle, setPreviewTitle] = React.useState('Preview de Documento');
  
  // Estado para panel de stock
  const [showStockPanel, setShowStockPanel] = React.useState(false);
  
  // State for collapsible sections
  const [citasPreviasOpen, setCitasPreviasOpen] = React.useState(true);
  const [cirugiasOpen, setCirugiasOpen] = React.useState(true);
  const [estudiosOpen, setEstudiosOpen] = React.useState(true);
  
  // useLayoutEffect para actualizar la posición sticky del sidebar según altura del header
  React.useLayoutEffect(() => {
    const updateStickyTop = () => {
      if (headerRef.current) {
        const headerHeight = headerRef.current.getBoundingClientRect().height;
        setStickyTop(headerHeight + 20); // 20px de separación del header
      }
    };
    
    updateStickyTop();
    window.addEventListener('resize', updateStickyTop);
    
    const resizeObserver = new ResizeObserver(updateStickyTop);
    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', updateStickyTop);
      resizeObserver.disconnect();
    };
  }, []);

  // Estados para preconsulta
  const [autorefODEsfera, setAutorefODEsfera] = React.useState('');
  const [autorefODCilindro, setAutorefODCilindro] = React.useState('');
  const [autorefODEje, setAutorefODEje] = React.useState('');
  const [autorefOSEsfera, setAutorefOSEsfera] = React.useState('');
  const [autorefOSCilindro, setAutorefOSCilindro] = React.useState('');
  const [autorefOSEje, setAutorefOSEje] = React.useState('');
  
  const [lensODEsfera, setLensODEsfera] = React.useState('');
  const [lensODCilindro, setLensODCilindro] = React.useState('');
  const [lensODEje, setLensODEje] = React.useState('');
  const [lensOSEsfera, setLensOSEsfera] = React.useState('');
  const [lensOSCilindro, setLensOSCilindro] = React.useState('');
  const [lensOSEje, setLensOSEje] = React.useState('');
  
  const [queratoODK1, setQueratoODK1] = React.useState('');
  const [queratoODK2, setQueratoODK2] = React.useState('');
  const [queratoODEje, setQueratoODEje] = React.useState('');
  const [queratoOSK1, setQueratoOSK1] = React.useState('');
  const [queratoOSK2, setQueratoOSK2] = React.useState('');
  const [queratoOSEje, setQueratoOSEje] = React.useState('');
  
  const [preconsultaPIOOD, setPreconsultaPIOOD] = React.useState('');
  const [preconsultaPIOOS, setPreconsultaPIOOS] = React.useState('');
  
  const [photosDialogOpen, setPhotosDialogOpen] = React.useState(false);
  const [photoODUrl, setPhotoODUrl] = React.useState<string | null>(null);
  const [photoOIUrl, setPhotoOIUrl] = React.useState<string | null>(null);

  // Estado para interpretación de resultados
  const [interpretacionResultados, setInterpretacionResultados] = React.useState('');

  // Estado para preview dialog
  const [previewOpen, setPreviewOpen] = React.useState(false);

  // Estados de carga para proteger autoguardado
  const [isEncounterLoaded, setIsEncounterLoaded] = React.useState(false);
  const [isExamDataLoaded, setIsExamDataLoaded] = React.useState(false);
  const [isPatientDataLoaded, setIsPatientDataLoaded] = React.useState(false);
  const [isAppointmentDataLoaded, setIsAppointmentDataLoaded] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

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


  // Bandera global de carga completa
  const isFullyLoaded = isEncounterLoaded && isExamDataLoaded && 
                        isPatientDataLoaded && isAppointmentDataLoaded;

  // CRÍTICO: Reset completo de estados cuando cambia el encounterId
  React.useEffect(() => {
    if (!encounterId) return;
    
    console.log('[Reconsulta] 🔄 Reseteando estados para nueva consulta:', encounterId);
    
    // Reset flags de carga
    setIsEncounterLoaded(false);
    setIsExamDataLoaded(false);
    setIsPatientDataLoaded(false);
    setIsAppointmentDataLoaded(false);
    setLastSavedAt(null);
    setIsSaving(false);
    
    // Reset datos de encounter
    setDiagnostico('');
    setPlanTratamiento('');
    setCirugias('');
    setEstudios('');
    setProximaCita('');
    setExcOD('');
    setExcOS('');
    setDatosSubjetivos('');
    
    // Reset agudeza visual
    setAvSinCorreccionOD('');
    setAvSinCorreccionOS('');
    setAvConCorreccionOD('');
    setAvConCorreccionOS('');
    
    // Reset refracción subjetiva
    setSubjetivaOD({ esfera: '', cilindro: '', eje: '', av: '' });
    setSubjetivaOS({ esfera: '', cilindro: '', eje: '', av: '' });
    
    // Reset receta
    setRecetaOD({ esfera: '', cilindro: '', eje: '', add: '' });
    setRecetaOS({ esfera: '', cilindro: '', eje: '', add: '' });
    
    // Reset material/color/tipo
    setMaterialVidrio(false);
    setMaterialCR39(false);
    setMaterialPolicarbonato(false);
    setColorBlanco(false);
    setColorTransitions(false);
    setColorAntireflejo(false);
    setColorFiltroAzul(false);
    setColorOtros(false);
    setColorOtrosText('');
    setTipoLejos(false);
    setTipoCerca(false);
    setTipoProgresivo(false);
    setTipoBifocal(false);
    setDp('');
    setNotaRefraccion('');
    
    // Reset examen físico
    setLhOkOD(false);
    setLhOkOS(false);
    setLamparaOD('');
    setLamparaOS('');
    setPioOD('');
    setPioOS('');
    
    // Reset preconsulta
    setAutorefODEsfera('');
    setAutorefODCilindro('');
    setAutorefODEje('');
    setAutorefOSEsfera('');
    setAutorefOSCilindro('');
    setAutorefOSEje('');
    setLensODEsfera('');
    setLensODCilindro('');
    setLensODEje('');
    setLensOSEsfera('');
    setLensOSCilindro('');
    setLensOSEje('');
    setQueratoODK1('');
    setQueratoODK2('');
    setQueratoODEje('');
    setQueratoOSK1('');
    setQueratoOSK2('');
    setQueratoOSEje('');
    setPreconsultaPIOOD('');
    setPreconsultaPIOOS('');
    setPhotoODUrl(null);
    setPhotoOIUrl(null);
    setInterpretacionResultados('');
    
    // NOTA: NO reseteamos los antecedentes del paciente (diabetes, HTA, alergias, etc.)
    // porque esos son datos del PACIENTE que deben persistir entre consultas
    
    console.log('[Reconsulta] ✅ Estados reseteados, iniciando carga de datos...');
  }, [encounterId]);

  const { data: encounter, isLoading } = useQuery({
    queryKey: ['encounter', encounterId],
    queryFn: async () => {
      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[Reconsulta] Getting encounter from PostgreSQL local');
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
        console.log('[Reconsulta] Getting current doctor profile from PostgreSQL local');
        const profile = await invoke<ProfileLocal | null>('get_profile_by_user_id', {
          userId: user.id,
        });
        return profile ? { full_name: profile.full_name, specialty: profile.specialty, gender: profile.gender || null, professional_title: profile.professional_title || null } : null;
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, specialty, gender, professional_title')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const patient = encounter?.patient;

  // Query para obtener el diagnóstico de la consulta previa
  const { data: previousDiagnosis } = useQuery({
    queryKey: ['previous-diagnosis', patient?.id, encounter?.date, connectionMode],
    queryFn: async () => {
      if (!patient?.id || !encounter?.date) return null;

      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[Reconsulta] Getting previous diagnosis from PostgreSQL local');
        const encounters = await invoke<EncounterLocal[]>('get_encounters_by_patient', {
          patientId: patient.id,
        });
        // Filtrar encounters anteriores a la fecha actual y ordenar por fecha descendente
        const previousEnc = encounters
          .filter(e => e.date < encounter.date)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        return previousEnc?.summary || null;
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('encounters')
        .select('summary')
        .eq('patient_id', patient.id)
        .lt('date', encounter.date)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.summary || null;
    },
    enabled: !!patient?.id && !!encounter?.date,
  });

  // SOLO cargar datos del encounter si ya tienen contenido (fueron editados previamente)
  React.useEffect(() => {
    if (encounter) {
      console.log('[Reconsulta] Cargando encounter...');
      // SOLO cargar si hay datos guardados (esto permite editar una consulta existente)
      // Pero NO carga datos de consultas anteriores diferentes
      if (encounter.summary) setDiagnostico(encounter.summary);
      if (encounter.plan_tratamiento) setPlanTratamiento(encounter.plan_tratamiento);
      if (encounter.cirugias) setCirugias(encounter.cirugias);
      if (encounter.estudios) setEstudios(encounter.estudios);
      if (encounter.proxima_cita) setProximaCita(encounter.proxima_cita);
      if (encounter.excursiones_od) setExcOD(encounter.excursiones_od);
      if (encounter.excursiones_os) setExcOS(encounter.excursiones_os);
      if (encounter.motivo_consulta) setDatosSubjetivos(encounter.motivo_consulta);
      if ((encounter as any).interpretacion_resultados) setInterpretacionResultados((encounter as any).interpretacion_resultados);
      
      console.log('[Reconsulta] ✓ Encounter cargado (9 campos)');
      setIsEncounterLoaded(true);
    }
  }, [encounter]);

  // SOLO cargar datos de exam_eye si ya existen (consulta previamente editada)
  React.useEffect(() => {
    const loadExamData = async () => {
      if (!encounterId) return;

      console.log('[Reconsulta] Cargando exam_eye...');

      let examOD: ExamEyeLocal | null = null;
      let examOS: ExamEyeLocal | null = null;

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[Reconsulta] Loading exam_eye from PostgreSQL local');
        const examEyes = await invoke<ExamEyeLocal[]>('get_exam_eyes_by_encounter', {
          encounterId: encounterId,
        });
        examOD = examEyes.find(e => e.side === 'OD') || null;
        examOS = examEyes.find(e => e.side === 'OI') || null;
      } else {
        // Modo Supabase - Cargar datos de OD
        const { data: odData } = await supabase
          .from('exam_eye')
          .select('*')
          .eq('encounter_id', encounterId)
          .eq('side', 'OD')
          .maybeSingle();
        examOD = odData as ExamEyeLocal | null;

        // Cargar datos de OS
        const { data: osData } = await supabase
          .from('exam_eye')
          .select('*')
          .eq('encounter_id', encounterId)
          .eq('side', 'OI')
          .maybeSingle();
        examOS = osData as ExamEyeLocal | null;
      }

      if (examOD) {
        // SOLO cargar campos que tengan valor
        if (examOD.av_sc) setAvSinCorreccionOD(examOD.av_sc);
        if (examOD.av_cc) setAvConCorreccionOD(examOD.av_cc);

        // Refracción subjetiva
        if (examOD.ref_subj_sphere || examOD.ref_subj_cyl || examOD.ref_subj_axis || examOD.ref_subj_av) {
          setSubjetivaOD({
            esfera: formatLensForDisplay(examOD.ref_subj_sphere),
            cilindro: formatLensForDisplay(examOD.ref_subj_cyl),
            eje: examOD.ref_subj_axis?.toString() || '',
            av: examOD.ref_subj_av || ''
          });
        }

        // Receta
        if (examOD.rx_sphere || examOD.rx_cyl || examOD.rx_axis || examOD.rx_add) {
          setRecetaOD({
            esfera: formatLensForDisplay(examOD.rx_sphere),
            cilindro: formatLensForDisplay(examOD.rx_cyl),
            eje: examOD.rx_axis?.toString() || '',
            add: examOD.rx_add?.toString() || ''
          });
        }

        if (examOD.iop) setPioOD(examOD.iop.toString());
        if (examOD.slit_lamp) setLamparaOD(examOD.slit_lamp);
        if (examOD.prescription_notes) setNotaRefraccion(examOD.prescription_notes);

        // Cargar plan solo si existe
        if (examOD.plan) {
          try {
            const planData = typeof examOD.plan === 'string' ? JSON.parse(examOD.plan) : examOD.plan;

            if (planData.material) {
              setMaterialVidrio(planData.material.includes('Vidrio'));
              setMaterialCR39(planData.material.includes('CR39'));
              setMaterialPolicarbonato(planData.material.includes('Policarbonato'));
            }

            if (planData.color) {
              setColorBlanco(planData.color.includes('Blanco'));
              setColorTransitions(planData.color.includes('Transitions'));
              setColorAntireflejo(planData.color.includes('Antireflejo'));
              setColorFiltroAzul(planData.color.includes('Filtro Azul'));
              const otrosMatch = planData.color.match(/(?:^|, )(?!Blanco|Transitions|Antireflejo|Filtro Azul)(.+?)(?:,|$)/);
              if (otrosMatch) {
                setColorOtros(true);
                setColorOtrosText(otrosMatch[1].trim());
              }
            }

            if (planData.tipo) {
              setTipoLejos(planData.tipo.includes('Lejos'));
              setTipoCerca(planData.tipo.includes('Cerca'));
              setTipoProgresivo(planData.tipo.includes('Progresivo'));
              setTipoBifocal(planData.tipo.includes('Bifocal'));
            }

            if (planData.dp) setDp(planData.dp);
            if (typeof planData.lh_ok_od !== 'undefined') setLhOkOD(!!planData.lh_ok_od);
          } catch (e) {
            console.error('Error parsing plan data:', e);
          }
        }
      }

      if (examOS) {
        if (examOS.av_sc) setAvSinCorreccionOS(examOS.av_sc);
        if (examOS.av_cc) setAvConCorreccionOS(examOS.av_cc);

        if (examOS.ref_subj_sphere || examOS.ref_subj_cyl || examOS.ref_subj_axis || examOS.ref_subj_av) {
          setSubjetivaOS({
            esfera: formatLensForDisplay(examOS.ref_subj_sphere),
            cilindro: formatLensForDisplay(examOS.ref_subj_cyl),
            eje: examOS.ref_subj_axis?.toString() || '',
            av: examOS.ref_subj_av || ''
          });
        }

        if (examOS.rx_sphere || examOS.rx_cyl || examOS.rx_axis || examOS.rx_add) {
          setRecetaOS({
            esfera: formatLensForDisplay(examOS.rx_sphere),
            cilindro: formatLensForDisplay(examOS.rx_cyl),
            eje: examOS.rx_axis?.toString() || '',
            add: examOS.rx_add?.toString() || ''
          });
        }

        if (examOS.iop) setPioOS(examOS.iop.toString());
        if (examOS.slit_lamp) setLamparaOS(examOS.slit_lamp);

        if (examOS.plan) {
          try {
            const planOS = typeof examOS.plan === 'string' ? JSON.parse(examOS.plan) : examOS.plan;
            if (typeof planOS.lh_ok_os !== 'undefined') {
              setLhOkOS(!!planOS.lh_ok_os);
            }
          } catch (e) {
            console.error('Error parsing OS plan data:', e);
          }
        }
      }

      console.log('[Reconsulta] ✓ Exam eye OD/OS verificados');
      setIsExamDataLoaded(true);
    };

    loadExamData();
  }, [encounterId, isLocalMode]);

  // Cargar antecedentes del paciente
  React.useEffect(() => {
    if (patient) {
      console.log('[Reconsulta] Cargando antecedentes del paciente...');
      setDiabetes(patient.diabetes || false);
      setHta(patient.hta || false);
      setAlergia(!!patient.allergies);
      setAlergiaText(patient.allergies || '');
      setAntecedentesGenerales(patient.notes || '');
      setAntecedentesOftalmologicos(patient.ophthalmic_history || '');
      
      console.log('[Reconsulta] ✓ Antecedentes del paciente cargados (6 campos)');
      setIsPatientDataLoaded(true);
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

  const handleUsePreviousDiagnosis = () => {
    if (previousDiagnosis) {
      setDiagnostico(previousDiagnosis);
      toast.success('Diagnóstico anterior copiado');
    } else {
      toast.info('No hay diagnóstico previo disponible');
    }
  };

  // Mutation para guardar consulta
  const saveConsultationMutation = useMutation({
    mutationFn: async (markAsCompleted: boolean = false) => {
      console.log('[Reconsulta] Guardando consulta...', { encounterId, markAsCompleted });

      // Datos del encounter
      const consultationData = {
        summary: diagnostico,
        plan_tratamiento: planTratamiento,
        motivo_consulta: datosSubjetivos,
        cirugias,
        estudios,
        proxima_cita: proximaCita,
        excursiones_od: excOD,
        excursiones_os: excOS,
        interpretacion_resultados: interpretacionResultados || null,
      };

      // Datos del examen ocular OD
      const examODPlan = JSON.stringify({
        material: [
          materialVidrio && 'Vidrio',
          materialCR39 && 'CR39',
          materialPolicarbonato && 'Policarbonato'
        ].filter(Boolean).join(', '),
        color: [
          colorBlanco && 'Blanco',
          colorTransitions && 'Transitions',
          colorAntireflejo && 'Antireflejo',
          colorFiltroAzul && 'Filtro Azul',
          colorOtros && colorOtrosText
        ].filter(Boolean).join(', '),
        tipo: [
          tipoLejos && 'Lejos',
          tipoCerca && 'Cerca',
          tipoProgresivo && 'Progresivo',
          tipoBifocal && 'Bifocal'
        ].filter(Boolean).join(', '),
        dp: dp,
        lh_ok_od: !!lhOkOD
      });

      // Datos del examen ocular OS
      const examOSPlan = JSON.stringify({ lh_ok_os: !!lhOkOS });

      // Construir strings de autorefractor y lensometría
      let autorefString = null;
      if (autorefODEsfera || autorefODCilindro || autorefODEje || autorefOSEsfera || autorefOSCilindro || autorefOSEje) {
        autorefString = `OD: ${autorefODEsfera} ${autorefODCilindro} x ${autorefODEje} | OS: ${autorefOSEsfera} ${autorefOSCilindro} x ${autorefOSEje}`;
      }
      let lensString = null;
      if (lensODEsfera || lensODCilindro || lensODEje || lensOSEsfera || lensOSCilindro || lensOSEje) {
        lensString = `OD: ${lensODEsfera} ${lensODCilindro} x ${lensODEje} | OS: ${lensOSEsfera} ${lensOSCilindro} x ${lensOSEje}`;
      }

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[Reconsulta] Saving via PostgreSQL local');

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
          encounterId: encounterId,
          side: 'OD',
          avSc: avSinCorreccionOD || null,
          avCc: avConCorreccionOD || null,
          refSphere: null,
          refCyl: null,
          refAxis: null,
          refSubjSphere: parseLensNumber(subjetivaOD.esfera),
          refSubjCyl: parseLensNumber(subjetivaOD.cilindro),
          refSubjAxis: Number(subjetivaOD.eje) || null,
          refSubjAv: subjetivaOD.av || null,
          rxSphere: parseLensNumber(recetaOD.esfera),
          rxCyl: parseLensNumber(recetaOD.cilindro),
          rxAxis: Number(recetaOD.eje) || null,
          rxAdd: Number(recetaOD.add) || null,
          iop: Number(pioOD) || null,
          slitLamp: lamparaOD || null,
          prescriptionNotes: notaRefraccion || null,
          plan: examODPlan,
        });

        // 3. Upsert exam_eye OS
        await invoke('upsert_exam_eye', {
          encounterId: encounterId,
          side: 'OI',
          avSc: avSinCorreccionOS || null,
          avCc: avConCorreccionOS || null,
          refSphere: null,
          refCyl: null,
          refAxis: null,
          refSubjSphere: parseLensNumber(subjetivaOS.esfera),
          refSubjCyl: parseLensNumber(subjetivaOS.cilindro),
          refSubjAxis: Number(subjetivaOS.eje) || null,
          refSubjAv: subjetivaOS.av || null,
          rxSphere: parseLensNumber(recetaOS.esfera),
          rxCyl: parseLensNumber(recetaOS.cilindro),
          rxAxis: Number(recetaOS.eje) || null,
          rxAdd: Number(recetaOS.add) || null,
          iop: Number(pioOS) || null,
          slitLamp: lamparaOS || null,
          prescriptionNotes: null,
          plan: examOSPlan,
        });

        // 4. Update patient
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

        // 5. Update appointment
        if (appointment?.id) {
          await invoke('update_appointment', {
            appointmentId: appointment.id,
            patientId: appointment.patient_id || null,
            roomId: appointment.room_id || null,
            doctorId: appointment.doctor_id || null,
            branchId: appointment.branch_id,
            startsAt: appointment.starts_at,
            endsAt: appointment.ends_at,
            reason: appointment.reason || null,
            appointmentType: appointment.type,
            status: markAsCompleted ? 'done' : appointment.status,
            autorefractor: autorefString,
            lensometry: lensString,
            keratometryOdK1: queratoODK1 || null,
            keratometryOdK2: queratoODK2 || null,
            keratometryOdAxis: queratoODEje || null,
            keratometryOsK1: queratoOSK1 || null,
            keratometryOsK2: queratoOSK2 || null,
            keratometryOsAxis: queratoOSEje || null,
            pioOd: Number(preconsultaPIOOD) || null,
            pioOs: Number(preconsultaPIOOS) || null,
          });
        }

        return markAsCompleted;
      }

      // Modo Supabase
      const { error } = await supabase
        .from('encounters')
        .update({
          ...consultationData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', encounterId);

      if (error) {
        console.error('[Reconsulta] Error al guardar encounter:', error);
        throw error;
      }

      console.log('[Reconsulta] Encounter guardado exitosamente');

      // Guardar o actualizar datos del examen ocular para OD
      const examODData = {
        encounter_id: encounterId,
        side: 'OD' as const,
        av_sc: avSinCorreccionOD,
        av_cc: avConCorreccionOD,
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
        plan: examODPlan,
        prescription_notes: notaRefraccion,
      };

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

      // Guardar o actualizar datos del examen ocular para OS
      const examOSData = {
        encounter_id: encounterId,
        side: 'OI' as const,
        av_sc: avSinCorreccionOS,
        av_cc: avConCorreccionOS,
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
        plan: examOSPlan,
      };

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

      // Guardar datos de preconsulta en appointment y vincular con encounter
      if (appointment?.id) {
        const { error: appointmentError } = await supabase
          .from('appointments')
          .update({
            autorefractor: autorefString,
            lensometry: lensString,
            keratometry_od_k1: queratoODK1 || null,
            keratometry_od_k2: queratoODK2 || null,
            keratometry_od_axis: queratoODEje || null,
            keratometry_os_k1: queratoOSK1 || null,
            keratometry_os_k2: queratoOSK2 || null,
            keratometry_os_axis: queratoOSEje || null,
            pio_od: Number(preconsultaPIOOD) || null,
            pio_os: Number(preconsultaPIOOS) || null,
          })
          .eq('id', appointment.id);

        if (appointmentError) throw appointmentError;

        // CRÍTICO: Vincular el encounter con el appointment si no está vinculado
        if (!encounter?.appointment_id) {
          console.log('[Reconsulta] Vinculando encounter con appointment:', appointment.id);
          const { error: linkError } = await supabase
            .from('encounters')
            .update({ appointment_id: appointment.id })
            .eq('id', encounterId);

          if (linkError) {
            console.error('[Reconsulta] Error vinculando encounter con appointment:', linkError);
          } else {
            console.log('[Reconsulta] Encounter vinculado exitosamente');
          }
        }
      }

      // Si se marca como completada, actualizar el appointment
      if (markAsCompleted && appointment?.id) {
        const { error: appointmentError } = await supabase
          .from('appointments')
          .update({ status: 'done' })
          .eq('id', appointment.id);

        if (appointmentError) throw appointmentError;
      }

      return markAsCompleted;
    },
    onSuccess: (markAsCompleted) => {
      setIsSaving(false);
      setLastSavedAt(new Date());
      
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[Reconsulta] ✅ Guardado exitoso a las ${timestamp}`);
      
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
      setIsSaving(false);
      toast.error('Error al guardar la consulta');
    },
  });

  // Monitoreo de carga completa
  React.useEffect(() => {
    if (isFullyLoaded) {
      console.log('[Reconsulta] ✅ TODOS LOS DATOS CARGADOS - Autoguardado ACTIVADO');
    } else {
      console.log('[Reconsulta] Esperando carga completa...', {
        isEncounterLoaded,
        isExamDataLoaded,
        isPatientDataLoaded,
        isAppointmentDataLoaded
      });
    }
  }, [isFullyLoaded, isEncounterLoaded, isExamDataLoaded, isPatientDataLoaded, isAppointmentDataLoaded]);

  // Autoguardado cada 60 segundos - PROTEGIDO
  React.useEffect(() => {
    if (!encounterId || !isFullyLoaded) {
      console.log('[Reconsulta] Autoguardado NO iniciado:', { 
        encounterId: !!encounterId, 
        isFullyLoaded 
      });
      return;
    }
    
    console.log('[Reconsulta] ✅ Autoguardado ACTIVADO (cada 60 segundos)');
    
    const interval = setInterval(() => {
      console.log('[Reconsulta] 💾 Ejecutando autoguardado programado...');
      setIsSaving(true);
      saveConsultationMutation.mutate(false);
    }, 60000); // 60 segundos

    return () => {
      console.log('[Reconsulta] Limpiando intervalo de autoguardado');
      clearInterval(interval);
    };
  }, [isFullyLoaded, encounterId, diagnostico, planTratamiento, datosSubjetivos, cirugias, estudios, proximaCita, 
      diabetes, hta, alergia, alergiaText, antecedentesGenerales, antecedentesOftalmologicos,
      autorefODEsfera, autorefODCilindro, autorefODEje, autorefOSEsfera, autorefOSCilindro, autorefOSEje,
      lensODEsfera, lensODCilindro, lensODEje, lensOSEsfera, lensOSCilindro, lensOSEje,
      queratoODK1, queratoODK2, queratoODEje, queratoOSK1, queratoOSK2, queratoOSEje, preconsultaPIOOD, preconsultaPIOOS,
      avSinCorreccionOD, avSinCorreccionOS, avConCorreccionOD, avConCorreccionOS,
      subjetivaOD, subjetivaOS, recetaOD, recetaOS, pioOD, pioOS, lamparaOD, lamparaOS, excOD, excOS,
      materialVidrio, materialCR39, materialPolicarbonato,
      colorBlanco, colorTransitions, colorAntireflejo, colorFiltroAzul, colorOtros, colorOtrosText,
      tipoLejos, tipoCerca, tipoProgresivo, tipoBifocal, dp, notaRefraccion, interpretacionResultados]); // Dependencies para que guarde cuando cambian

  // Efecto para abrir el dialog cuando se genera el contenido HTML
  React.useEffect(() => {
    if (htmlContent) {
      setPreviewOpen(true);
    }
  }, [htmlContent]);

  const handleClosePreview = () => {
    setPreviewOpen(false);
    clearContent();
  };

  const handleSaveAndExit = async () => {
    try {
      setIsSaving(true);
      await saveConsultationMutation.mutateAsync(false);
    } finally {
      navigate('/dashboard');
    }
  };

  const handleFinishConsultation = async () => {
    setIsSaving(true);
    await saveConsultationMutation.mutateAsync(true);
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
          professionalTitle: (currentDoctor as any)?.professional_title || (encounter.doctor as any)?.professional_title || undefined,
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
          professionalTitle: (currentDoctor as any)?.professional_title || (encounter.doctor as any)?.professional_title || undefined,
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
          professionalTitle: (currentDoctor as any)?.professional_title || (encounter.doctor as any)?.professional_title || undefined,
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
          professionalTitle: (currentDoctor as any)?.professional_title || (encounter.doctor as any)?.professional_title || undefined,
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


  // Get the appointment associated with this encounter - DIRECT LINK
  const { data: appointment } = useQuery({
    queryKey: ['encounter-appointment', encounterId, encounter?.appointment_id, connectionMode],
    queryFn: async () => {
      if (!encounter) return null;

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[Reconsulta] Getting appointment from PostgreSQL local');

        if (encounter.appointment_id) {
          const appointments = await invoke<AppointmentLocal[]>('get_appointments', {
            branchId: null,
            startDate: null,
            endDate: null,
          });
          return appointments.find(a => a.id === encounter.appointment_id) || null;
        }

        // Fallback: buscar por fecha
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

      // Modo Supabase
      if (!encounter.appointment_id) {
        console.log('[Reconsulta] No appointment_id en encounter, buscando por fecha como fallback');

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
      }

      // Buscar directamente por appointment_id
      console.log('[Reconsulta] Cargando appointment por ID:', encounter.appointment_id);
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', encounter.appointment_id)
        .maybeSingle();

      if (error) {
        console.error('[Reconsulta] Error cargando appointment:', error);
        return null;
      }

      console.log('[Reconsulta] Appointment cargado:', data?.id);
      return data;
    },
    enabled: !!encounter,
  });

  // Cargar URLs firmadas de las fotos
  React.useEffect(() => {
    const loadPhotoUrls = async () => {
      // En modo local, usar storage local via SMB
      if (isLocalMode) {
        console.log('[Reconsulta] Loading photos from local storage');
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

  // Cargar datos de preconsulta desde appointment
  React.useEffect(() => {
    if (appointment) {
      console.log('[Reconsulta] Cargando datos de preconsulta desde appointment:', {
        autorefractor: appointment.autorefractor,
        lensometry: appointment.lensometry,
        keratometry_od_k1: appointment.keratometry_od_k1,
        pio_od: appointment.pio_od
      });
      
      // Parsear autorefractor - SOLO si hay datos válidos
      if (appointment.autorefractor) {
        console.log('[Reconsulta] Parseando autorefractor:', appointment.autorefractor);
        const autorefData = parseEyeData(appointment.autorefractor);
        console.log('[Reconsulta] Autorefractor parseado:', autorefData);
        if (autorefData.od.esfera) setAutorefODEsfera(autorefData.od.esfera);
        if (autorefData.od.cilindro) setAutorefODCilindro(autorefData.od.cilindro);
        if (autorefData.od.eje) setAutorefODEje(autorefData.od.eje);
        if (autorefData.os.esfera) setAutorefOSEsfera(autorefData.os.esfera);
        if (autorefData.os.cilindro) setAutorefOSCilindro(autorefData.os.cilindro);
        if (autorefData.os.eje) setAutorefOSEje(autorefData.os.eje);
      } else {
        console.log('[Reconsulta] No hay datos de autorefractor');
      }
      
      // Parsear lensometría - SOLO si hay datos válidos
      if (appointment.lensometry) {
        console.log('[Reconsulta] Parseando lensometría:', appointment.lensometry);
        const lensData = parseEyeData(appointment.lensometry);
        console.log('[Reconsulta] Lensometría parseada:', lensData);
        if (lensData.od.esfera) setLensODEsfera(lensData.od.esfera);
        if (lensData.od.cilindro) setLensODCilindro(lensData.od.cilindro);
        if (lensData.od.eje) setLensODEje(lensData.od.eje);
        if (lensData.os.esfera) setLensOSEsfera(lensData.os.esfera);
        if (lensData.os.cilindro) setLensOSCilindro(lensData.os.cilindro);
        if (lensData.os.eje) setLensOSEje(lensData.os.eje);
      } else {
        console.log('[Reconsulta] No hay datos de lensometría');
      }
      
      // Queratometrías
      if (appointment.keratometry_od_k1) setQueratoODK1(appointment.keratometry_od_k1);
      if (appointment.keratometry_od_k2) setQueratoODK2(appointment.keratometry_od_k2);
      if (appointment.keratometry_od_axis) setQueratoODEje(appointment.keratometry_od_axis);
      if (appointment.keratometry_os_k1) setQueratoOSK1(appointment.keratometry_os_k1);
      if (appointment.keratometry_os_k2) setQueratoOSK2(appointment.keratometry_os_k2);
      if (appointment.keratometry_os_axis) setQueratoOSEje(appointment.keratometry_os_axis);
      
      // PIO
      if (appointment.pio_od) setPreconsultaPIOOD(appointment.pio_od.toString());
      if (appointment.pio_os) setPreconsultaPIOOS(appointment.pio_os.toString());
      
      console.log('[Reconsulta] ✓ Datos de preconsulta cargados');
      setIsAppointmentDataLoaded(true);
    }
  }, [appointment]);

  // Check if this is the first consultation
  const { data: isFirstConsultation } = useQuery({
    queryKey: ['first-consultation', encounter?.patient_id, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id) return true;

      // En modo local, usar Tauri command
      if (isLocalMode) {
        const encounters = await invoke<EncounterLocal[]>('get_encounters_by_patient', {
          patientId: encounter.patient_id,
        });
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

  // Get previous encounter diagnosis and treatment (immediate previous one)
  const { data: previousEncounter } = useQuery({
    queryKey: ['previous-encounter', encounter?.patient_id, encounterId, encounter?.date, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id || !encounter?.date) return null;

      // En modo local, usar Tauri command
      if (isLocalMode) {
        const encounters = await invoke<EncounterLocal[]>('get_encounters_by_patient', {
          patientId: encounter.patient_id,
        });
        const previous = encounters
          .filter(e => e.id !== encounterId && e.date < encounter.date)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        return previous ? { summary: previous.summary, plan_tratamiento: previous.plan_tratamiento } : null;
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('encounters')
        .select('summary, plan_tratamiento')
        .eq('patient_id', encounter.patient_id)
        .neq('id', encounterId)
        .lt('date', encounter.date)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      console.log('[Reconsulta] Consulta previa cargada:', data);
      return data;
    },
    enabled: !!encounter?.patient_id && !!encounter?.date,
  });

  // Count total encounters for this patient
  const { data: encounterCount } = useQuery({
    queryKey: ['encounter-count', encounter?.patient_id, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id) return 0;

      // En modo local, usar Tauri command
      if (isLocalMode) {
        const encounters = await invoke<EncounterLocal[]>('get_encounters_by_patient', {
          patientId: encounter.patient_id,
        });
        return encounters.length;
      }

      // Modo Supabase
      const { count, error } = await supabase
        .from('encounters')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', encounter.patient_id);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!encounter?.patient_id,
  });

  // Get all previous encounters for sidebar (excluding surgeries)
  const { data: previousEncounters } = useQuery({
    queryKey: ['previous-encounters-list', encounter?.patient_id, encounterId, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id) return [];

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        const encounters = await invoke<EncounterLocal[]>('get_encounters_by_patient', {
          patientId: encounter.patient_id,
        });

        // Filtrar y ordenar
        const filtered = encounters
          .filter(e => e.id !== encounterId)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 10);

        // Obtener appointments para filtrar
        const appointments = await invoke<AppointmentLocal[]>('get_appointments', {
          branchId: null,
          startDate: null,
          endDate: null,
        });

        const result = filtered.map(enc => {
          const appt = appointments.find(a => a.id === enc.appointment_id);
          return {
            ...enc,
            appointments: appt ? [{ type: appt.type }] : [],
            studyTitle: null,
            studyEyeSide: null
          };
        });

        // Filtrar cirugías, procedimientos y estudios
        return result.filter(enc => {
          const appointmentType = enc.appointments?.[0]?.type;
          return appointmentType !== 'cirugia'
              && appointmentType !== 'procedimiento'
              && appointmentType !== 'estudio';
        });
      }

      // Modo Supabase
      const { data: encounters, error } = await supabase
        .from('encounters')
        .select('id, date, type, summary, appointment_id')
        .eq('patient_id', encounter.patient_id)
        .neq('id', encounterId)
        .order('date', { ascending: false })
        .limit(10);

      if (error) throw error;

      // For each encounter, fetch the related appointment and filter out surgeries
      if (encounters) {
        const encountersWithAppointments = await Promise.all(
          encounters.map(async (enc) => {
            // Use appointment_id directly instead of searching by date
            if (enc.appointment_id) {
              const { data: appointment } = await supabase
                .from('appointments')
                .select('type')
                .eq('id', enc.appointment_id)
                .maybeSingle();

              // Si es un estudio, buscar título y ojo
              let studyData = null;
              if (appointment?.type === 'estudio') {
                const { data: study } = await supabase
                  .from('studies')
                  .select('title, eye_side')
                  .eq('appointment_id', enc.appointment_id)
                  .maybeSingle();

                studyData = study;
              }

              return {
                ...enc,
                appointments: appointment ? [appointment] : [],
                studyTitle: studyData?.title || null,
                studyEyeSide: studyData?.eye_side || null
              };
            }

            return {
              ...enc,
              appointments: []
            };
          })
        );

        // Filter out surgeries, procedures AND estudios
        return encountersWithAppointments.filter(enc => {
          const appointmentType = enc.appointments?.[0]?.type;
          return appointmentType !== 'cirugia'
              && appointmentType !== 'procedimiento'
              && appointmentType !== 'estudio';
        });
      }

      return [];
    },
    enabled: !!encounter?.patient_id,
  });

  // Get surgeries and procedures (appointments of type cirugia or procedimiento)
  const { data: surgeries } = useQuery({
    queryKey: ['surgeries-list', encounter?.patient_id, encounterId, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id) return [];

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        const appointments = await invoke<AppointmentLocal[]>('get_appointments', {
          branchId: null,
          startDate: null,
          endDate: null,
        });

        // Filtrar appointments quirúrgicos del paciente
        const surgicalAppointments = appointments
          .filter(a => a.patient_id === encounter.patient_id &&
                      (a.type === 'cirugia' || a.type === 'procedimiento'))
          .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

        if (surgicalAppointments.length === 0) return [];

        // Obtener encounters del paciente
        const patientEncounters = await invoke<EncounterLocal[]>('get_encounters_by_patient', {
          patientId: encounter.patient_id,
        });

        // Filtrar encounters vinculados a appointments quirúrgicos
        const appointmentIds = surgicalAppointments.map(a => a.id);
        const filteredEncounters = patientEncounters
          .filter(e => e.id !== encounterId && e.appointment_id && appointmentIds.includes(e.appointment_id))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Obtener cirugías y procedimientos
        const surgeryList = await invoke<SurgeryLocal[]>('get_surgeries_by_patient', {
          patientId: encounter.patient_id,
        });
        const procedureList = await invoke<ProcedureLocal[]>('get_procedures_by_patient', {
          patientId: encounter.patient_id,
        });

        return filteredEncounters.map(enc => {
          const relatedAppointment = surgicalAppointments.find(a => a.id === enc.appointment_id);
          const surgeryData = surgeryList.find(s => s.encounter_id === enc.id);
          const procedureData = procedureList.find(p => p.encounter_id === enc.id);

          return {
            ...enc,
            appointments: relatedAppointment ? [{ type: relatedAppointment.type }] : [],
            surgery: surgeryData ? { tipo_cirugia: surgeryData.surgery_type, ojo_operar: surgeryData.ojo_operar } : null,
            procedure: procedureData ? { tipo_procedimiento: procedureData.tipo_procedimiento, ojo_operar: procedureData.ojo_operar } : null
          };
        });
      }

      // Modo Supabase
      // 1. Buscar appointments de tipo cirugia o procedimiento
      const { data: surgicalAppointments, error: apptError } = await supabase
        .from('appointments')
        .select('id, type, starts_at')
        .eq('patient_id', encounter.patient_id)
        .in('type', ['cirugia', 'procedimiento'])
        .order('starts_at', { ascending: false });

      if (apptError) throw apptError;
      if (!surgicalAppointments || surgicalAppointments.length === 0) return [];

      // 2. Buscar encounters vinculados a esos appointments
      const appointmentIds = surgicalAppointments.map(a => a.id);
      const { data: encounters, error: encError } = await supabase
        .from('encounters')
        .select('id, date, type, summary, appointment_id')
        .in('appointment_id', appointmentIds)
        .neq('id', encounterId)
        .order('date', { ascending: false });

      if (encError) throw encError;

      // 3. Buscar datos de cirugía y procedimiento para cada encounter
      if (encounters) {
        const encountersWithSurgeryData = await Promise.all(
          encounters.map(async (enc) => {
            const relatedAppointment = surgicalAppointments.find(
              a => a.id === enc.appointment_id
            );

            // Fetch surgery data from surgeries table
            const { data: surgeryData } = await supabase
              .from('surgeries')
              .select('tipo_cirugia, ojo_operar')
              .eq('encounter_id', enc.id)
              .maybeSingle();

            // Fetch procedure data from procedures table
            const { data: procedureData } = await supabase
              .from('procedures')
              .select('tipo_procedimiento, ojo_operar')
              .eq('encounter_id', enc.id)
              .maybeSingle();

            return {
              ...enc,
              appointments: relatedAppointment ? [{ type: relatedAppointment.type }] : [],
              surgery: surgeryData,
              procedure: procedureData
            };
          })
        );
        return encountersWithSurgeryData;
      }

      return [];
    },
    enabled: !!encounter?.patient_id,
  });

  // Get studies for sidebar
  const { data: patientStudies } = useQuery({
    queryKey: ['patient-studies-list', encounter?.patient_id, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id) return [];

      // En modo local, usar Tauri command
      if (isLocalMode) {
        const studies = await invoke<StudyLocal[]>('get_studies_by_patient', {
          patientId: encounter.patient_id,
        });
        return studies
          .sort((a, b) => new Date(b.study_date).getTime() - new Date(a.study_date).getTime())
          .slice(0, 10)
          .map(s => ({
            id: s.id,
            title: s.study_type,
            eye_side: null,
            created_at: s.study_date,
            comments: s.notes,
            appointment_id: s.appointment_id
          }));
      }

      // Modo Supabase
      const { data: studies, error } = await supabase
        .from('studies')
        .select('id, title, eye_side, created_at, comments, appointment_id')
        .eq('patient_id', encounter.patient_id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return studies || [];
    },
    enabled: !!encounter?.patient_id,
  });

  // Get selected encounter details
  const { data: selectedEncounter } = useQuery({
    queryKey: ['selected-encounter', selectedEncounterId, connectionMode],
    queryFn: async () => {
      if (!selectedEncounterId) return null;

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        const encounterData = await invoke<EncounterLocal | null>('get_encounter_by_id', {
          encounterId: selectedEncounterId,
        });
        if (!encounterData) return null;

        const patientData = await invoke<PatientLocal | null>('get_patient_by_id', {
          patientId: encounterData.patient_id,
        });

        const examEyes = await invoke<ExamEyeLocal[]>('get_exam_eyes_by_encounter', {
          encounterId: selectedEncounterId,
        });

        // Buscar appointment relacionado
        const encounterDate = new Date(encounterData.date);
        const startOfDay = clinicStartOfDay(encounterDate);
        const endOfDay = clinicEndOfDay(encounterDate);

        const appointments = await invoke<AppointmentLocal[]>('get_appointments', {
          branchId: null,
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        });
        const appointment = appointments.find(a => a.patient_id === encounterData.patient_id) || null;

        // Buscar cirugía y procedimiento
        const surgeries = await invoke<SurgeryLocal[]>('get_surgeries_by_patient', {
          patientId: encounterData.patient_id,
        });
        const surgery = surgeries.find(s => s.encounter_id === selectedEncounterId) || null;

        const procedures = await invoke<ProcedureLocal[]>('get_procedures_by_patient', {
          patientId: encounterData.patient_id,
        });
        const procedure = procedures.find(p => p.encounter_id === selectedEncounterId) || null;

        // Buscar doctor
        let doctor = null;
        if (encounterData.doctor_id) {
          const doctorData = await invoke<ProfileLocal | null>('get_profile_by_user_id', {
            userId: encounterData.doctor_id,
          });
          doctor = doctorData ? { full_name: doctorData.full_name, specialty: doctorData.specialty } : null;
        }

        return {
          ...encounterData,
          patient: patientData,
          exam_eye: examEyes,
          diagnoses: [],
          appointment,
          surgery,
          procedure,
          doctor
        };
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('encounters')
        .select(`
          *,
          patient:patients(*),
          exam_eye(*),
          diagnoses(*)
        `)
        .eq('id', selectedEncounterId)
        .maybeSingle();

      if (error) throw error;

      // Fetch appointment and surgery data
      if (data) {
        const encounterDate = new Date(data.date);
        const startOfDay = clinicStartOfDay(encounterDate);
        const endOfDay = clinicEndOfDay(encounterDate);

        const { data: appointment } = await supabase
          .from('appointments')
          .select('*')
          .eq('patient_id', data.patient_id)
          .gte('starts_at', startOfDay.toISOString())
          .lte('starts_at', endOfDay.toISOString())
          .limit(1)
          .maybeSingle();

        // Fetch surgery data if exists
        const { data: surgery } = await supabase
          .from('surgeries')
          .select('*')
          .eq('encounter_id', selectedEncounterId)
          .maybeSingle();

        // Fetch procedure data if exists
        const { data: procedure } = await supabase
          .from('procedures')
          .select('*')
          .eq('encounter_id', selectedEncounterId)
          .maybeSingle();

        // Fetch doctor info if exists
        let doctor = null;
        if (data.doctor_id) {
          const { data: doctorData } = await supabase
            .from('profiles')
            .select('full_name, specialty')
            .eq('user_id', data.doctor_id)
            .single();
          doctor = doctorData;
        }

        return { ...data, appointment, surgery, procedure, doctor };
      }

      return data;
    },
    enabled: !!selectedEncounterId,
  });

  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    return differenceInYears(new Date(), new Date(dob));
  };

  // Parse autorefractor and lensometry data (tolerant to partial inputs)
  const parseEyeData = (data: string | null) => {
    if (!data) return { od: { esfera: '', cilindro: '', eje: '' }, os: { esfera: '', cilindro: '', eje: '' } };

    const result = {
      od: { esfera: '', cilindro: '', eje: '' },
      os: { esfera: '', cilindro: '', eje: '' }
    };

    // Expected loose format like: "OD: -1 -0.5 x 180 | OS: -1 -0.5 x 180"
    // But supports missing fields: "OD: 3  x  | OS: 3  x "
    const parts = data.split('|').map(p => p.trim());

    const parseValues = (valuesRaw: string) => {
      const out = { esfera: '', cilindro: '', eje: '' } as { esfera: string; cilindro: string; eje: string };
      // Normalize commas and multiply sign
      const values = valuesRaw.replace(/,/g, '.').replace(/×/g, 'x').trim();

      // Separate axis with 'x' if present
      const [left, right] = values.split(/x/i).map(s => s.trim());
      if (right) {
        const axisMatch = right.match(/([-+]?\d+(?:\.\d+)?)/);
        if (axisMatch) out.eje = axisMatch[1];
      }

      // Left part should contain sphere and optional cylinder
      const tokens = (left || '').split(/\s+/).filter(Boolean);
      if (tokens[0]) out.esfera = tokens[0];
      if (tokens[1]) out.cilindro = tokens[1];

      return out;
    };

    parts.forEach(part => {
      if (part.startsWith('OD:')) {
        const values = part.replace('OD:', '').trim();
        result.od = parseValues(values);
      } else if (part.startsWith('OS:') || part.startsWith('OI:')) {
        const values = part.replace('OS:', '').replace('OI:', '').trim();
        result.os = parseValues(values);
      }
    });

    return result;
  };

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
    <>
    <div className="min-h-screen bg-background">
      
      <header ref={headerRef} className="border-b bg-card sticky top-0 z-10 shadow-sm">
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
              <p className="text-sm text-muted-foreground">
                No. {encounterCount || 0} {encounterCount === 1 ? 'consulta' : 'consultas'}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Botón flotante para sidebar en móvil - FUERA del main para visibilidad */}
      <MobileSidebarSheet>
            {/* Botón Estudios arriba del sidebar */}
            {encounter?.patient_id && (
              <Button
                onClick={() => navigate(`/ver-estudios/${encounter.patient_id}?returnTo=reconsulta&encounterId=${encounterId}`)}
                className="shadow-lg w-full mb-4"
                size="sm"
              >
                <FileImage className="h-4 w-4 mr-2" />
                Estudios
              </Button>
            )}
            <div className="bg-card rounded-lg border">
              {/* Citas Previas */}
              <Collapsible open={citasPreviasOpen} onOpenChange={setCitasPreviasOpen}>
                <div className="p-4 border-b">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between hover:opacity-80 transition-opacity">
                      <h3 className="text-lg font-semibold">
                        Citas Previas {!citasPreviasOpen && previousEncounters && previousEncounters.length > 0 && `(${previousEncounters.length})`}
                      </h3>
                      <ChevronDown className={`h-5 w-5 transition-transform ${citasPreviasOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {previousEncounters && previousEncounters.length > 0 ? (
                      <ScrollArea className="h-[300px] mt-4">
                        <div className="space-y-3 pr-4">
                          {previousEncounters.map((enc: any) => {
                            const appointmentType = enc.appointments?.[0]?.type || 'consulta';
                            return (
                              <div 
                                key={enc.id}
                                className="p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                                onClick={() => {
                                  setSelectedEncounterId(enc.id);
                                  setIsViewingEncounter(true);
                                }}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium">
                                    {new Date(enc.date).toLocaleDateString('es-GT', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </span>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs border-0 ${getAppointmentTypeColor(appointmentType)}`}
                                  >
                                    {getAppointmentTypeLabel(appointmentType)}
                                  </Badge>
                                </div>
                                {appointmentType === 'estudio' && enc.studyTitle ? (
                                  <p className="text-xs text-muted-foreground font-medium">
                                    {enc.studyTitle} - {enc.studyEyeSide || 'OU'}
                                  </p>
                                ) : enc.summary ? (
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {enc.summary}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-4">No hay citas previas</p>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {/* Cirugías */}
              <Collapsible open={cirugiasOpen} onOpenChange={setCirugiasOpen}>
                <div className="p-4 border-b">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between hover:opacity-80 transition-opacity">
                      <h3 className="text-lg font-semibold">
                        Cirugías {!cirugiasOpen && surgeries && surgeries.length > 0 && `(${surgeries.length})`}
                      </h3>
                      <ChevronDown className={`h-5 w-5 transition-transform ${cirugiasOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {surgeries && surgeries.length > 0 ? (
                      <ScrollArea className="h-[300px] mt-4">
                        <div className="space-y-3 pr-4">
                          {surgeries.map((surgery: any) => {
                            const appointmentType = surgery.appointments?.[0]?.type || 'cirugia';
                            return (
                              <div 
                                key={surgery.id}
                                className="p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                                onClick={() => {
                                  setSelectedEncounterId(surgery.id);
                                  setIsViewingEncounter(true);
                                }}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium">
                                    {new Date(surgery.date).toLocaleDateString('es-GT', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </span>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs border-0 ${getAppointmentTypeColor(appointmentType)}`}
                                  >
                                    {getAppointmentTypeLabel(appointmentType)}
                                  </Badge>
                                </div>
                                {surgery.surgery && (
                                  <p className="text-xs text-muted-foreground">
                                    {surgery.surgery.tipo_cirugia} - {surgery.surgery.ojo_operar}
                                  </p>
                                )}
                                {surgery.procedure && (
                                  <p className="text-xs text-muted-foreground">
                                    {surgery.procedure.tipo_procedimiento} - {surgery.procedure.ojo_operar}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-4">No hay cirugías registradas</p>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {/* Estudios */}
              <Collapsible open={estudiosOpen} onOpenChange={setEstudiosOpen}>
                <div className="p-4">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between hover:opacity-80 transition-opacity">
                      <h3 className="text-lg font-semibold">
                        Estudios {!estudiosOpen && patientStudies && patientStudies.length > 0 && `(${patientStudies.length})`}
                      </h3>
                      <ChevronDown className={`h-5 w-5 transition-transform ${estudiosOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {patientStudies && patientStudies.length > 0 ? (
                      <ScrollArea className="h-[200px] mt-4">
                        <div className="space-y-3 pr-4">
                          {patientStudies.map((study: any) => (
                            <div 
                              key={study.id}
                              className="p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                              onClick={() => navigate(`/ver-estudios/${encounter?.patient_id}?returnTo=reconsulta&encounterId=${encounterId}`)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">
                                  {new Date(study.created_at).toLocaleDateString('es-GT', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </span>
                                <Badge variant="outline" className="text-xs border-0 bg-indigo-100 text-indigo-700">
                                  {study.eye_side || 'OU'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground font-medium">
                                {study.title}
                              </p>
                              {study.comments && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                                  {study.comments}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-4">No hay estudios registrados</p>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
      </MobileSidebarSheet>

      <main className="container mx-auto px-4 py-8" style={{ paddingTop: '76px' }}>
        <div className="flex gap-6">
          {/* Sidebar de Citas Previas y Cirugías */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky" style={{ top: `${stickyTop}px` }}>
              {/* Botón Estudios arriba del sidebar */}
              {encounter?.patient_id && (
                <Button
                  onClick={() => navigate(`/ver-estudios/${encounter.patient_id}?returnTo=reconsulta&encounterId=${encounterId}`)}
                  className="shadow-lg w-full mb-4"
                  size="sm"
                >
                  <FileImage className="h-4 w-4 mr-2" />
                  Estudios
                </Button>
              )}
              <div className="bg-card rounded-lg border">
                {/* Citas Previas */}
                <Collapsible open={citasPreviasOpen} onOpenChange={setCitasPreviasOpen}>
                  <div className="p-4 border-b">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between hover:opacity-80 transition-opacity">
                        <h3 className="text-lg font-semibold">
                          Citas Previas {!citasPreviasOpen && previousEncounters && previousEncounters.length > 0 && `(${previousEncounters.length})`}
                        </h3>
                        <ChevronDown className={`h-5 w-5 transition-transform ${citasPreviasOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {previousEncounters && previousEncounters.length > 0 ? (
                        <ScrollArea className="h-[300px] mt-4">
                          <div className="space-y-3 pr-4">
                            {previousEncounters.map((enc: any) => {
                              const appointmentType = enc.appointments?.[0]?.type || 'consulta';
                              return (
                                <div 
                                  key={enc.id}
                                  className="p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                                  onClick={() => {
                                    setSelectedEncounterId(enc.id);
                                    setIsViewingEncounter(true);
                                  }}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">
                                      {new Date(enc.date).toLocaleDateString('es-GT', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric'
                                      })}
                                    </span>
                                    <Badge 
                                      variant="outline" 
                                      className={`text-xs border-0 ${getAppointmentTypeColor(appointmentType)}`}
                                    >
                                      {getAppointmentTypeLabel(appointmentType)}
                                    </Badge>
                                  </div>
                                  {/* Mostrar título y ojo del estudio en una sola línea, o summary normal */}
                                  {appointmentType === 'estudio' && enc.studyTitle ? (
                                    <p className="text-xs text-muted-foreground font-medium">
                                      {enc.studyTitle} - {enc.studyEyeSide || 'OU'}
                                    </p>
                                  ) : enc.summary ? (
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {enc.summary}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-4">No hay citas previas</p>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                {/* Cirugías */}
                <Collapsible open={cirugiasOpen} onOpenChange={setCirugiasOpen}>
                  <div className="p-4 border-b">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between hover:opacity-80 transition-opacity">
                        <h3 className="text-lg font-semibold">
                          Cirugías {!cirugiasOpen && surgeries && surgeries.length > 0 && `(${surgeries.length})`}
                        </h3>
                        <ChevronDown className={`h-5 w-5 transition-transform ${cirugiasOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {surgeries && surgeries.length > 0 ? (
                        <ScrollArea className="h-[300px] mt-4">
                          <div className="space-y-3 pr-4">
                            {surgeries.map((surgery: any) => {
                              const appointmentType = surgery.appointments?.[0]?.type || 'cirugia';
                              return (
                                <div 
                                  key={surgery.id}
                                  className="p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                                  onClick={() => {
                                    setSelectedEncounterId(surgery.id);
                                    setIsViewingEncounter(true);
                                  }}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">
                                      {new Date(surgery.date).toLocaleDateString('es-GT', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric'
                                      })}
                                    </span>
                                    <Badge 
                                      variant="outline" 
                                      className={`text-xs border-0 ${getAppointmentTypeColor(appointmentType)}`}
                                    >
                                      {getAppointmentTypeLabel(appointmentType)}
                                    </Badge>
                                  </div>
                                  {surgery.surgery && (
                                    <p className="text-xs text-muted-foreground">
                                      {surgery.surgery.tipo_cirugia} - {surgery.surgery.ojo_operar}
                                    </p>
                                  )}
                                  {surgery.procedure && (
                                    <p className="text-xs text-muted-foreground">
                                      {surgery.procedure.tipo_procedimiento} - {surgery.procedure.ojo_operar}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-4">No hay cirugías registradas</p>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                {/* Estudios */}
                <Collapsible open={estudiosOpen} onOpenChange={setEstudiosOpen}>
                  <div className="p-4">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between hover:opacity-80 transition-opacity">
                        <h3 className="text-lg font-semibold">
                          Estudios {!estudiosOpen && patientStudies && patientStudies.length > 0 && `(${patientStudies.length})`}
                        </h3>
                        <ChevronDown className={`h-5 w-5 transition-transform ${estudiosOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {patientStudies && patientStudies.length > 0 ? (
                        <ScrollArea className="h-[200px] mt-4">
                          <div className="space-y-3 pr-4">
                            {patientStudies.map((study: any) => (
                              <div 
                                key={study.id}
                                className="p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                                onClick={() => navigate(`/ver-estudios/${encounter?.patient_id}?returnTo=reconsulta&encounterId=${encounterId}`)}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium">
                                    {new Date(study.created_at).toLocaleDateString('es-GT', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </span>
                                  <Badge variant="outline" className="text-xs border-0 bg-indigo-100 text-indigo-700">
                                    {study.eye_side || 'OU'}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground font-medium">
                                  {study.title}
                                </p>
                                {study.comments && (
                                  <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                                    {study.comments}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-4">No hay estudios registrados</p>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
                </div>
              </div>
            </aside>

          <div className="flex-1 space-y-6">
          {/* Diagnóstico y Tratamiento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-3">Diagnóstico</h2>
              <Textarea 
                value={previousEncounter?.summary || ''}
                placeholder="Diagnóstico de la consulta previa..."
                className="min-h-[100px]"
                readOnly
              />
            </div>
            
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-3">Tratamiento</h2>
              <Textarea 
                value={previousEncounter?.plan_tratamiento || ''}
                placeholder="Plan de tratamiento de la consulta previa..."
                className="min-h-[100px]"
                readOnly
              />
            </div>
          </div>

          {/* Datos Subjetivos */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-3">Datos subjetivos</h2>
            <Textarea 
              value={datosSubjetivos}
              onChange={(e) => setDatosSubjetivos(e.target.value)}
              placeholder="Ingrese los datos subjetivos..."
              className="min-h-[80px]"
            />
          </div>

          {/* Antecedentes - Colapsable */}
          <Collapsible open={antecedentesOpen} onOpenChange={setAntecedentesOpen}>
            <div className="bg-card rounded-lg border">
              <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <h2 className="text-lg font-semibold">Antecedentes</h2>
                <ChevronDown className={`h-5 w-5 transition-transform ${antecedentesOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="px-6 pb-6 space-y-6">
                  {/* Antecedentes personales */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-base font-medium">Antecedentes personales</h3>
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
                      value={antecedentesGenerales}
                      onChange={(e) => setAntecedentesGenerales(e.target.value)}
                      placeholder="Antecedentes médicos generales..."
                      className="min-h-[100px]"
                    />
                  </div>

                  {/* Antecedentes oftalmológicos */}
                  <div>
                    <h3 className="text-base font-medium mb-3">Antecedentes oftalmológicos</h3>
                    <Textarea 
                      value={antecedentesOftalmologicos}
                      onChange={(e) => setAntecedentesOftalmologicos(e.target.value)}
                      placeholder="Antecedentes oftalmológicos..."
                      className="min-h-[100px]"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

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
                         <Input placeholder="Esfera" value={autorefODEsfera} onChange={(e) => setAutorefODEsfera(e.target.value)} />
                         <Input placeholder="Cilindro" value={autorefODCilindro} onChange={(e) => setAutorefODCilindro(e.target.value)} />
                         <Input placeholder="Eje (0-180)" value={autorefODEje} onChange={(e) => validateAxisInput(e.target.value, 'Autorefractómetro OD', setAutorefODEje)} />
                       </div>
                     </div>
                     {/* OS */}
                     <div>
                       <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                       <div className="grid grid-cols-3 gap-3">
                         <Input placeholder="Esfera" value={autorefOSEsfera} onChange={(e) => setAutorefOSEsfera(e.target.value)} />
                         <Input placeholder="Cilindro" value={autorefOSCilindro} onChange={(e) => setAutorefOSCilindro(e.target.value)} />
                         <Input placeholder="Eje (0-180)" value={autorefOSEje} onChange={(e) => validateAxisInput(e.target.value, 'Autorefractómetro OS', setAutorefOSEje)} />
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
                         <Input placeholder="Esfera" value={lensODEsfera} onChange={(e) => setLensODEsfera(e.target.value)} />
                         <Input placeholder="Cilindro" value={lensODCilindro} onChange={(e) => setLensODCilindro(e.target.value)} />
                         <Input placeholder="Eje (0-180)" value={lensODEje} onChange={(e) => validateAxisInput(e.target.value, 'Lensometría OD', setLensODEje)} />
                       </div>
                     </div>
                     {/* OS */}
                     <div>
                       <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                       <div className="grid grid-cols-3 gap-3">
                         <Input placeholder="Esfera" value={lensOSEsfera} onChange={(e) => setLensOSEsfera(e.target.value)} />
                         <Input placeholder="Cilindro" value={lensOSCilindro} onChange={(e) => setLensOSCilindro(e.target.value)} />
                         <Input placeholder="Eje (0-180)" value={lensOSEje} onChange={(e) => validateAxisInput(e.target.value, 'Lensometría OS', setLensOSEje)} />
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
                       <div className="grid grid-cols-3 gap-3">
                         <Input placeholder="K1" value={queratoODK1} onChange={(e) => setQueratoODK1(e.target.value)} />
                         <Input placeholder="K2" value={queratoODK2} onChange={(e) => setQueratoODK2(e.target.value)} />
                         <Input placeholder="Eje (0-180)" value={queratoODEje} onChange={(e) => validateAxisInput(e.target.value, 'Queratometría OD', setQueratoODEje)} />
                       </div>
                     </div>
                     {/* OS */}
                     <div>
                       <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                       <div className="grid grid-cols-3 gap-3">
                         <Input placeholder="K1" value={queratoOSK1} onChange={(e) => setQueratoOSK1(e.target.value)} />
                         <Input placeholder="K2" value={queratoOSK2} onChange={(e) => setQueratoOSK2(e.target.value)} />
                         <Input placeholder="Eje (0-180)" value={queratoOSEje} onChange={(e) => validateAxisInput(e.target.value, 'Queratometría OS', setQueratoOSEje)} />
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
                       <Input placeholder="mmHg" type="number" step="0.1" value={preconsultaPIOOD} onChange={(e) => setPreconsultaPIOOD(e.target.value)} />
                     </div>
                     <div>
                       <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                       <Input placeholder="mmHg" type="number" step="0.1" value={preconsultaPIOOS} onChange={(e) => setPreconsultaPIOOS(e.target.value)} />
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
              <Button size="sm" onClick={handlePrintReceta} disabled={isGeneratingPrescription}>
                {isGeneratingPrescription ? (
                  <>
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    Generando...
                  </>
                ) : (
                  'Imprimir'
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

          {/* Interpretación de Resultados - Solo para tipo lectura_resultados */}
          {appointmentType === 'lectura_resultados' && (
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Interpretación de Resultados</h2>
              <Textarea 
                placeholder="Escriba la interpretación de los resultados..."
                className="min-h-[200px]"
                value={interpretacionResultados}
                onChange={(e) => setInterpretacionResultados(e.target.value)}
              />
            </div>
          )}

          {/* Diagnóstico y Tratamiento */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-6">Diagnóstico y Tratamiento</h2>
            
            <div className="space-y-6">
              {/* Diagnóstico */}
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <Label htmlFor="diagnostico" className="text-sm font-medium">Diagnóstico</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleUsePreviousDiagnosis}
                    disabled={!previousDiagnosis}
                  >
                    Usar Anterior
                  </Button>
                </div>
                <Textarea 
                  id="diagnostico"
                  placeholder="Descripción del diagnóstico..."
                  className="min-h-[100px]"
                  value={diagnostico}
                  onChange={(e) => { console.log('[Reconsulta] change Diagnostico:', e.target.value); setDiagnostico(e.target.value); }}
                  onBlur={() => saveConsultationMutation.mutate(false)}
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
                  <Button size="sm" onClick={handlePrintTreatment} disabled={isGeneratingTreatment || !planTratamiento.trim()}>
                    {isGeneratingTreatment ? (
                      <>
                        <Loader2 className="animate-spin mr-2 h-4 w-4" />
                        Generando...
                      </>
                    ) : (
                      'Imprimir'
                    )}
                  </Button>
                </div>
                <Textarea 
                  id="planTratamiento"
                  placeholder="Descripción del plan de tratamiento..."
                  className="min-h-[100px]"
                  value={planTratamiento}
                  onChange={(e) => setPlanTratamiento(e.target.value)}
                  onBlur={() => saveConsultationMutation.mutate(false)}
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
                    <Button size="sm" onClick={handlePrintSurgeries} disabled={isGeneratingSurgeries || !cirugias.trim()}>
                      {isGeneratingSurgeries ? (
                        <>
                          <Loader2 className="animate-spin mr-2 h-4 w-4" />
                          Generando...
                        </>
                      ) : (
                        'Imprimir'
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
                    <Button size="sm" onClick={handlePrintStudies} disabled={isGeneratingStudies || !estudios.trim()}>
                      {isGeneratingStudies ? (
                        <>
                          <Loader2 className="animate-spin mr-2 h-4 w-4" />
                          Generando...
                        </>
                      ) : (
                        'Imprimir'
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
        </div>
      </main>
      </div>

      {/* Dialog for viewing previous encounter */}
      <Dialog open={isViewingEncounter} onOpenChange={setIsViewingEncounter}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span>Consulta Previa - {selectedEncounter?.patient?.first_name} {selectedEncounter?.patient?.last_name}</span>
                {selectedEncounter && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-normal text-muted-foreground">
                      {new Date(selectedEncounter.date).toLocaleDateString('es-GT', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                    {selectedEncounter.type && (
                      <Badge 
                        variant="outline" 
                        className={`${getAppointmentTypeColor(selectedEncounter.type)}`}
                      >
                        {selectedEncounter.type === 'consulta' ? 'Consulta' : 
                         selectedEncounter.type === 'posop' ? 'Post-Op' :
                         selectedEncounter.type === 'urgencia' ? 'Urgencia' : 
                         'Quirúrgico'}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {(selectedEncounter as any)?.doctor?.full_name && (
                <span className="text-sm font-normal text-muted-foreground">
                  Atendido por: Dr. {(selectedEncounter as any).doctor.full_name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedEncounter && (() => {
            // Check if this is a surgery or procedure encounter
            const isSurgery = !!(selectedEncounter as any)?.surgery;
            const isProcedure = !!(selectedEncounter as any)?.procedure;
            
            if (isSurgery) {
              // Show only surgery information
              const surgery = (selectedEncounter as any).surgery;
              
              return (
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-6 pb-6 px-2">
                    {/* Información de la Cirugía */}
                    <div className="bg-card rounded-lg border p-6">
                      <h2 className="text-xl font-semibold mb-4">Información de la Cirugía</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="tipoCirugia">Tipo de Cirugía</Label>
                          <div className="px-3 py-2 rounded-md border bg-muted text-sm mt-2">
                            {surgery.tipo_cirugia || '-'}
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="ojoOperar">Ojo Operado</Label>
                          <div className="px-3 py-2 rounded-md border bg-muted text-sm mt-2">
                            {surgery.ojo_operar || '-'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Nota operatoria */}
                    {surgery.nota_operatoria && (
                      <div className="bg-card rounded-lg border p-6">
                        <h2 className="text-xl font-semibold mb-4">Nota operatoria</h2>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
                          {surgery.nota_operatoria}
                        </div>
                      </div>
                    )}

                    {/* Medicación */}
                    {surgery.medicacion && (
                      <div className="bg-card rounded-lg border p-6">
                        <h2 className="text-xl font-semibold mb-4">Medicación</h2>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
                          {surgery.medicacion}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            
            if (isProcedure) {
              // Show only procedure information
              const procedure = (selectedEncounter as any).procedure;
              
              return (
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-6 pb-6 px-2">
                    {/* Información del Procedimiento */}
                    <div className="bg-card rounded-lg border p-6">
                      <h2 className="text-xl font-semibold mb-4">Información del Procedimiento</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="tipoProcedimiento">Tipo de Procedimiento</Label>
                          <div className="px-3 py-2 rounded-md border bg-muted text-sm mt-2">
                            {procedure.tipo_procedimiento || '-'}
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="ojoOperar">Ojo Operado</Label>
                          <div className="px-3 py-2 rounded-md border bg-muted text-sm mt-2">
                            {procedure.ojo_operar || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            
            // For non-surgery encounters, show full consultation details
            const examOD = selectedEncounter.exam_eye?.find((e: any) => e.side === 'OD');
            const examOS = selectedEncounter.exam_eye?.find((e: any) => e.side === 'OI' || e.side === 'OS');
            const appointment = (selectedEncounter as any).appointment;
            const appointmentType = appointment?.type || 'consulta';
            const autoData = parseEyeData(appointment?.autorefractor || null);
            const lensData = parseEyeData(appointment?.lensometry || null);
            
            // Determine if this is a first consultation (nueva_consulta)
            const isFirstConsultation = appointmentType === 'nueva_consulta';
            
            // Parse plan data
            let planData: any = {};
            if (examOD?.plan) {
              try {
                planData = typeof examOD.plan === 'string' ? JSON.parse(examOD.plan) : examOD.plan;
              } catch (e) {
                planData = {};
              }
            }

            return (
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-6 pb-6 px-2">
                  {/* Para Reconsultas - mostrar Diagnóstico y Tratamiento Previo */}
                  {!isFirstConsultation && selectedEncounter.summary && (
                    <div className="bg-card rounded-lg border p-6">
                      <h2 className="text-xl font-semibold mb-6">Diagnóstico y Tratamiento Previo</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label className="text-base font-medium mb-3 block">Diagnóstico</Label>
                          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[100px]">
                            {selectedEncounter.summary || '-'}
                          </div>
                        </div>
                        <div>
                          <Label className="text-base font-medium mb-3 block">Plan de Tratamiento</Label>
                          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[100px]">
                            {selectedEncounter.plan_tratamiento || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Datos subjetivos (para reconsultas) / Motivo de consulta (si aplica) */}
                  {selectedEncounter.motivo_consulta && (
                    <div className="bg-card rounded-lg border p-6">
                      <h2 className="text-lg font-semibold mb-3">Datos subjetivos</h2>
                      <p className="text-sm whitespace-pre-wrap">{selectedEncounter.motivo_consulta}</p>
                    </div>
                  )}

                  {/* Antecedentes - mostrar siempre */}
                  <div className="bg-card rounded-lg border p-6">
                    <h2 className="text-xl font-semibold mb-6">Antecedentes</h2>
                    
                    <div className="space-y-6">
                      {/* Alertas médicas */}
                      <div>
                        <Label className="text-base font-medium mb-3 block">Alertas Médicas</Label>
                        <div className="flex flex-wrap gap-2">
                          {selectedEncounter.patient?.diabetes && (
                            <Badge variant="destructive">Diabetes</Badge>
                          )}
                          {selectedEncounter.patient?.hta && (
                            <Badge variant="destructive">HTA</Badge>
                          )}
                          {selectedEncounter.patient?.allergies && (
                            <Badge variant="destructive">Alergia: {selectedEncounter.patient.allergies}</Badge>
                          )}
                          {!selectedEncounter.patient?.diabetes && !selectedEncounter.patient?.hta && !selectedEncounter.patient?.allergies && (
                            <span className="text-sm text-muted-foreground">Sin alertas médicas</span>
                          )}
                        </div>
                      </div>

                      {/* Antecedentes generales */}
                      <div>
                        <Label className="text-base font-medium mb-3 block">Antecedentes Generales</Label>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[80px]">
                          {selectedEncounter.patient?.notes || '-'}
                        </div>
                      </div>

                      {/* Antecedentes oftalmológicos */}
                      <div>
                        <Label className="text-base font-medium mb-3 block">Antecedentes Oftalmológicos</Label>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[80px]">
                          {selectedEncounter.patient?.ophthalmic_history || '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preconsulta - mostrar siempre que haya datos */}
                  {appointment && (
                    <div className="bg-card rounded-lg border p-6">
                      <h2 className="text-xl font-semibold mb-6">Preconsulta</h2>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Columna izquierda */}
                        <div className="space-y-6">
                          {/* Autorrefractómetro */}
                          <div>
                            <h3 className="text-base font-semibold mb-4">Autorrefractómetro</h3>
                            <div className="space-y-4">
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{autoData.od.esfera || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{autoData.od.cilindro || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{autoData.od.eje || '-'}</div>
                                </div>
                              </div>
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{autoData.os.esfera || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{autoData.os.cilindro || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{autoData.os.eje || '-'}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Lensometría */}
                          <div>
                            <h3 className="text-base font-semibold mb-4">Lensometría</h3>
                            <div className="space-y-4">
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{lensData.od.esfera || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{lensData.od.cilindro || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{lensData.od.eje || '-'}</div>
                                </div>
                              </div>
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{lensData.os.esfera || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{lensData.os.cilindro || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{lensData.os.eje || '-'}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Columna derecha */}
                        <div className="space-y-6">
                          {/* Queratometrías */}
                          <div>
                            <h3 className="text-base font-semibold mb-4">Queratometrías</h3>
                            <div className="space-y-4">
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{appointment.keratometry_od_k1 || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{appointment.keratometry_od_k2 || '-'}</div>
                                </div>
                              </div>
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{appointment.keratometry_os_k1 || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{appointment.keratometry_os_k2 || '-'}</div>
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
                                <div className="px-3 py-2 rounded-md border bg-muted text-sm">{appointment.pio_od || '-'} mmHg</div>
                              </div>
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                                <div className="px-3 py-2 rounded-md border bg-muted text-sm">{appointment.pio_os || '-'} mmHg</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Agudeza Visual y Refracción - mostrar siempre */}
                  <div className="bg-card rounded-lg border p-6">
                    <h2 className="text-xl font-semibold mb-6">Agudeza Visual y Refracción</h2>
                    
                    <div className="grid grid-cols-[160px_auto_160px_auto_1fr] gap-4 items-start">
                      {/* Sin corrección */}
                      <div>
                        <h3 className="text-base font-semibold mb-4">Sin corrección</h3>
                        <div className="space-y-4">
                          <div>
                            <Label className="text-sm mb-2 block">OD</Label>
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm">{examOD?.av_sc || '-'}</div>
                          </div>
                          <div>
                            <Label className="text-sm mb-2 block">OS</Label>
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm">{examOS?.av_sc || '-'}</div>
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
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm">{examOD?.av_cc || '-'}</div>
                          </div>
                          <div>
                            <Label className="text-sm mb-2 block">OS</Label>
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm">{examOS?.av_cc || '-'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Separador */}
                      <Separator orientation="vertical" className="h-full" />

                      {/* Refracción subjetiva */}
                      <div>
                        <h3 className="text-base font-semibold mb-4">Refracción subjetiva</h3>
                        <div className="space-y-4">
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                            <div className="grid grid-cols-4 gap-2">
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOD?.ref_subj_sphere ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOD?.ref_subj_cyl ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOD?.ref_subj_axis ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{(examOD as any)?.ref_subj_av || '-'}</div>
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                            <div className="grid grid-cols-4 gap-2">
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOS?.ref_subj_sphere ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOS?.ref_subj_cyl ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOS?.ref_subj_axis ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{(examOS as any)?.ref_subj_av || '-'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Nota de refracción */}
                    {(examOD?.prescription_notes || examOS?.prescription_notes) && (
                      <div className="mt-6">
                        <Label className="text-sm font-medium text-muted-foreground mb-2 block">Nota</Label>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[80px]">
                          {examOD?.prescription_notes || examOS?.prescription_notes}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Receta a imprimir */}
                  {(examOD || examOS) && (
                    <div className="bg-card rounded-lg border p-6">
                      <h2 className="text-xl font-semibold mb-6">Receta a imprimir</h2>
                      
                      <div className="grid grid-cols-[auto_auto_auto_auto_auto] gap-6 items-start">
                        {/* Campos de refracción */}
                        <div className="space-y-4">
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground mb-2 block">OD</Label>
                            <div className="grid grid-cols-4 gap-3">
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOD?.rx_sphere ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOD?.rx_cyl ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOD?.rx_axis ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOD?.rx_add ?? '-'}</div>
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                            <div className="grid grid-cols-4 gap-3">
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOS?.rx_sphere ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOS?.rx_cyl ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOS?.rx_axis ?? '-'}</div>
                              <div className="px-2 py-1 rounded-md border bg-muted text-xs">{examOS?.rx_add ?? '-'}</div>
                            </div>
                          </div>
                        </div>

                        <Separator orientation="vertical" className="h-full" />

                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground mb-4">Material</h3>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded border ${planData.material?.vidrio ? 'bg-primary' : 'bg-muted'}`} />
                              <span className="text-sm">Vidrio</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded border ${planData.material?.cr39 ? 'bg-primary' : 'bg-muted'}`} />
                              <span className="text-sm">CR39</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded border ${planData.material?.policarbonato ? 'bg-primary' : 'bg-muted'}`} />
                              <span className="text-sm">Policarbonato</span>
                            </div>
                          </div>
                        </div>

                        <Separator orientation="vertical" className="h-full" />

                        <div className="space-y-6">
                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-4">Color</h3>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border ${planData.color?.blanco ? 'bg-primary' : 'bg-muted'}`} />
                                <span className="text-sm">Blanco</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border ${planData.color?.transitions ? 'bg-primary' : 'bg-muted'}`} />
                                <span className="text-sm">Transitions</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border ${planData.color?.antireflejo ? 'bg-primary' : 'bg-muted'}`} />
                                <span className="text-sm">Antireflejo</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border ${planData.color?.filtroAzul ? 'bg-primary' : 'bg-muted'}`} />
                                <span className="text-sm">Filtro Azul</span>
                              </div>
                              {planData.color?.otros && (
                                <div className="text-sm">Otros: {planData.color?.otrosText || ''}</div>
                              )}
                            </div>
                          </div>

                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-4">Tipo</h3>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border ${planData.tipo?.lejos ? 'bg-primary' : 'bg-muted'}`} />
                                <span className="text-sm">Lejos</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border ${planData.tipo?.cerca ? 'bg-primary' : 'bg-muted'}`} />
                                <span className="text-sm">Cerca</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border ${planData.tipo?.progresivo ? 'bg-primary' : 'bg-muted'}`} />
                                <span className="text-sm">Progresivo</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border ${planData.tipo?.bifocal ? 'bg-primary' : 'bg-muted'}`} />
                                <span className="text-sm">Bifocal</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {planData.dp && (
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground mb-2 block">DP</Label>
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm">{planData.dp}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Examen físico */}
                  <div className="bg-card rounded-lg border p-6">
                    <h2 className="text-xl font-semibold mb-6">Examen físico</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Label className="text-base font-medium">Lámpara de Hendidura OD</Label>
                        </div>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[100px]">
                          {examOD?.slit_lamp || '-'}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Label className="text-base font-medium">Lámpara de Hendidura OS</Label>
                        </div>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[100px]">
                          {examOS?.slit_lamp || '-'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <Label className="text-sm font-medium mb-3 block">PIO</Label>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium w-10">OD:</span>
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm flex-1">
                              {examOD?.iop || '-'} mmHg
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium w-10">OS:</span>
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm flex-1">
                              {examOS?.iop || '-'} mmHg
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-3 block">Excursiones</Label>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium w-10">OD:</span>
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm flex-1">
                              {selectedEncounter.excursiones_od || '-'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium w-10">OS:</span>
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm flex-1">
                              {selectedEncounter.excursiones_os || '-'}
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
                      <div>
                        <Label className="text-base font-medium mb-3 block">Diagnóstico</Label>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[100px]">
                          {selectedEncounter.summary || '-'}
                        </div>
                      </div>

                      <div>
                        <Label className="text-base font-medium mb-3 block">Plan de Tratamiento</Label>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[100px]">
                          {selectedEncounter.plan_tratamiento || '-'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <Label className="text-base font-medium mb-3 block">Cirugía</Label>
                          <div className="px-3 py-2 rounded-md border bg-muted text-sm min-h-[100px]">
                            {(selectedEncounter as any)?.surgery ? (
                              <div className="space-y-2">
                                <div><strong>Tipo:</strong> {(selectedEncounter as any).surgery.tipo_cirugia}</div>
                                <div><strong>Ojo:</strong> {(selectedEncounter as any).surgery.ojo_operar}</div>
                                {(selectedEncounter as any).surgery.nota_operatoria && (
                                  <div>
                                    <strong>Nota operatoria:</strong>
                                    <div className="mt-1 whitespace-pre-wrap">{(selectedEncounter as any).surgery.nota_operatoria}</div>
                                  </div>
                                )}
                                {(selectedEncounter as any).surgery.medicacion && (
                                  <div>
                                    <strong>Medicación:</strong>
                                    <div className="mt-1 whitespace-pre-wrap">{(selectedEncounter as any).surgery.medicacion}</div>
                                  </div>
                                )}
                                <div>
                                  <strong>Consentimiento:</strong> {(selectedEncounter as any).surgery.consentimiento_informado ? 'Sí' : 'No'}
                                </div>
                              </div>
                            ) : (selectedEncounter.cirugias || '-')}
                          </div>
                        </div>
                        <div>
                          <Label className="text-base font-medium mb-3 block">Estudios</Label>
                          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap min-h-[100px]">
                            {selectedEncounter.estudios || '-'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <Label className="text-sm font-medium whitespace-nowrap">Próxima cita:</Label>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm flex-1">
                          {selectedEncounter.proxima_cita || '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
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
        availableFields={['diagnostico', 'planTratamiento', 'datosSubjetivos', 'lamparaOD', 'lamparaOS', 'antecedentesGenerales', 'antecedentesOftalmologicos']}
        onApplyDictation={(field: DictationField, content: string) => {
          switch (field) {
            case 'diagnostico':
              setDiagnostico(prev => prev ? `${prev}\n${content}` : content);
              break;
            case 'planTratamiento':
              setPlanTratamiento(prev => prev ? `${prev}\n${content}` : content);
              break;
            case 'datosSubjetivos':
              setDatosSubjetivos(prev => prev ? `${prev}\n${content}` : content);
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
    </>
  );
}
