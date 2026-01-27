import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Check, Printer, FileImage, ChevronDown, Loader2 } from 'lucide-react';
import { MobileSidebarSheet } from '@/components/MobileSidebarSheet';
import { Encounter } from '@/types/database';
import { differenceInYears } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import React from 'react';
import { usePrintPDF } from '@/hooks/usePrintPDF';
import { PrintPreviewDialog } from '@/components/dashboard/PrintPreviewDialog';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

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
  proxima_cita: string | null;
  motivo_consulta: string | null;
}

interface PatientLocal {
  id: string;
  code: string | null;
  first_name: string;
  last_name: string;
  dob: string | null;
  diabetes: boolean | null;
  hta: boolean | null;
  allergies: string | null;
  notes: string | null;
  ophthalmic_history: string | null;
}

interface ProfileLocal {
  user_id: string;
  full_name: string | null;
  specialty: string | null;
  gender?: string;
}

interface AppointmentLocal {
  id: string;
  patient_id: string;
  type: string;
  reason: string | null;
  starts_at: string;
  status: string;
}

interface StudyLocal {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  title: string;
  eye_side: string;
  comments: string | null;
  created_at: string;
}

interface SurgeryLocal {
  id: string;
  encounter_id: string;
  tipo_cirugia: string | null;
  ojo_operar: string | null;
}

interface ProcedureLocal {
  id: string;
  encounter_id: string;
  tipo_procedimiento: string | null;
  ojo_operar: string | null;
  medicacion: string | null;
  consentimiento_informado: boolean | null;
}

interface DiagnosisLocal {
  id: string;
  encounter_id: string;
  label: string;
  code: string | null;
}

export default function Surgery() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  // Estados principales - simplificados según estructura de DB
  const [tipoProcedimiento, setTipoProcedimiento] = React.useState('');
  const [ojoOperar, setOjoOperar] = React.useState<'OD' | 'OI' | 'OU'>('OU');
  const [consentimientoInformado, setConsentimientoInformado] = React.useState(false);
  
  // Campos del encounter (diagnóstico y plan)
  const [diagnosticoPreoperatorio, setDiagnosticoPreoperatorio] = React.useState('');
  const [planQuirurgico, setPlanQuirurgico] = React.useState('');
  const [proximaCita, setProximaCita] = React.useState('');
  
  // Antecedentes del paciente
  const [diabetes, setDiabetes] = React.useState(false);
  const [hta, setHta] = React.useState(false);
  const [alergia, setAlergia] = React.useState(false);
  const [alergiaText, setAlergiaText] = React.useState('');
  const [antecedentesGenerales, setAntecedentesGenerales] = React.useState('');
  const [antecedentesOftalmologicos, setAntecedentesOftalmologicos] = React.useState('');

  // State for viewing previous encounter
  const [selectedEncounterId, setSelectedEncounterId] = React.useState<string | null>(null);
  const [isViewingEncounter, setIsViewingEncounter] = React.useState(false);
  
  // State for collapsible sections
  const [citasPreviasOpen, setCitasPreviasOpen] = React.useState(true);
  const [procedimientosOpen, setProcedimientosOpen] = React.useState(true);
  const [estudiosOpen, setEstudiosOpen] = React.useState(true);

  // Medicación state
  const [medicacion, setMedicacion] = React.useState('');
  const [previewTitle, setPreviewTitle] = React.useState('Preview de Documento');
  const [isGeneratingMedication, setIsGeneratingMedication] = React.useState(false);

  // Print PDF hook
  const { generatePDF, htmlContent, clearContent } = usePrintPDF();

  const { data: encounter, isLoading } = useQuery({
    queryKey: ['encounter', encounterId],
    queryFn: async () => {
      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[Procedimiento] Getting encounter from PostgreSQL local');
        const enc = await invoke<EncounterLocal | null>('get_encounter_by_id', { encounterId });
        if (!enc) return null;

        const patient = await invoke<PatientLocal | null>('get_patient_by_id', { patientId: enc.patient_id });
        let doctor = null;
        if (enc.doctor_id) {
          doctor = await invoke<ProfileLocal | null>('get_profile_by_user_id', { userId: enc.doctor_id });
        }
        return { ...enc, patient, doctor } as Encounter;
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

  const patient = encounter?.patient;

  // Buscar el appointment asociado para obtener el tipo de procedimiento
  const { data: appointment } = useQuery({
    queryKey: ['appointment', encounter?.appointment_id, connectionMode],
    queryFn: async () => {
      if (!encounter?.appointment_id) return null;

      if (isLocalMode) {
        console.log('[Procedimiento] Getting appointment from PostgreSQL local');
        const appointments = await invoke<AppointmentLocal[]>('get_appointments', {
          startDate: null, endDate: null, branchId: null,
        });
        return appointments.find(a => a.id === encounter.appointment_id) || null;
      }

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', encounter.appointment_id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!encounter?.appointment_id,
  });

  // Get all previous encounters for sidebar (excluding surgeries)
  const { data: previousEncounters } = useQuery({
    queryKey: ['previous-encounters-list', encounter?.patient_id, encounterId, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id) return [];

      if (isLocalMode) {
        console.log('[Procedimiento] Getting previous encounters from PostgreSQL local');
        const encounters = await invoke<EncounterLocal[]>('get_encounters_by_patient', {
          patientId: encounter.patient_id,
        });
        const filtered = encounters.filter(e => e.id !== encounterId)
          .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10);

        const allAppointments = await invoke<AppointmentLocal[]>('get_appointments', {
          startDate: null, endDate: null, branchId: null,
        });

        const encountersWithTypes = await Promise.all(
          filtered.map(async (enc) => {
            const appt = allAppointments.find(a => a.id === enc.appointment_id);
            let studyData = null;
            if (appt?.type === 'estudio' && enc.appointment_id) {
              const studies = await invoke<StudyLocal[]>('get_studies_by_appointment', { appointmentId: enc.appointment_id });
              studyData = studies[0];
            }
            return { ...enc, appointments: appt ? [{ type: appt.type }] : [], studyTitle: studyData?.title || null, studyEyeSide: studyData?.eye_side || null };
          })
        );
        return encountersWithTypes.filter(enc => {
          const t = enc.appointments?.[0]?.type;
          return t !== 'cirugia' && t !== 'procedimiento' && t !== 'estudio';
        });
      }

      const { data: encounters, error } = await supabase
        .from('encounters')
        .select('id, date, type, summary, appointment_id')
        .eq('patient_id', encounter.patient_id)
        .neq('id', encounterId)
        .order('date', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (encounters) {
        const encountersWithAppointments = await Promise.all(
          encounters.map(async (enc) => {
            if (enc.appointment_id) {
              const { data: appointment } = await supabase
                .from('appointments')
                .select('type')
                .eq('id', enc.appointment_id)
                .maybeSingle();

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
            return { ...enc, appointments: [] };
          })
        );

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

  // Get studies for sidebar
  const { data: patientStudies } = useQuery({
    queryKey: ['patient-studies-list', encounter?.patient_id, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id) return [];

      if (isLocalMode) {
        console.log('[Procedimiento] Getting patient studies from PostgreSQL local');
        const studies = await invoke<StudyLocal[]>('get_studies_by_patient', { patientId: encounter.patient_id });
        return studies.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 10);
      }

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

  // Get surgeries and procedures (appointments of type cirugia or procedimiento)
  const { data: surgeries } = useQuery({
    queryKey: ['surgeries-list', encounter?.patient_id, encounterId, connectionMode],
    queryFn: async () => {
      if (!encounter?.patient_id) return [];

      if (isLocalMode) {
        console.log('[Procedimiento] Getting surgeries list from PostgreSQL local');
        const allAppointments = await invoke<AppointmentLocal[]>('get_appointments', {
          startDate: null, endDate: null, branchId: null,
        });
        const surgicalAppointments = allAppointments
          .filter(a => a.patient_id === encounter.patient_id && ['cirugia', 'procedimiento'].includes(a.type))
          .sort((a, b) => (b.starts_at || '').localeCompare(a.starts_at || ''));

        if (surgicalAppointments.length === 0) return [];

        const allEncounters = await invoke<EncounterLocal[]>('get_encounters_by_patient', { patientId: encounter.patient_id });
        const appointmentIds = surgicalAppointments.map(a => a.id);
        const surgicalEncounters = allEncounters
          .filter(e => e.appointment_id && appointmentIds.includes(e.appointment_id) && e.id !== encounterId)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const surgeriesData = await invoke<SurgeryLocal[]>('get_surgeries_by_patient', { patientId: encounter.patient_id });
        const proceduresData = await invoke<ProcedureLocal[]>('get_procedures_by_patient', { patientId: encounter.patient_id });

        return surgicalEncounters.map(enc => {
          const relatedAppointment = surgicalAppointments.find(a => a.id === enc.appointment_id);
          const surgeryData = surgeriesData.find(s => s.encounter_id === enc.id);
          const procedureData = proceduresData.find(p => p.encounter_id === enc.id);
          return {
            ...enc,
            appointments: relatedAppointment ? [{ type: relatedAppointment.type }] : [],
            surgery: surgeryData ? { tipo_cirugia: surgeryData.tipo_cirugia, ojo_operar: surgeryData.ojo_operar } : null,
            procedure: procedureData ? { tipo_procedimiento: procedureData.tipo_procedimiento, ojo_operar: procedureData.ojo_operar } : null,
          };
        });
      }

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
            const relatedAppointment = surgicalAppointments.find(a => a.id === enc.appointment_id);
            const { data: surgeryData } = await supabase
              .from('surgeries')
              .select('tipo_cirugia, ojo_operar')
              .eq('encounter_id', enc.id)
              .maybeSingle();
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

  // Cargar datos del encounter
  React.useEffect(() => {
    if (encounter) {
      setDiagnosticoPreoperatorio(encounter.summary || '');
      setPlanQuirurgico(encounter.plan_tratamiento || '');
      setProximaCita(encounter.proxima_cita || '');
    }
  }, [encounter]);

  // Cargar datos del procedimiento desde la tabla procedures
  const { data: procedure } = useQuery({
    queryKey: ['procedure', encounterId, connectionMode],
    queryFn: async () => {
      if (!encounterId) return null;

      if (isLocalMode) {
        console.log('[Procedimiento] Getting procedure data from PostgreSQL local');
        if (!encounter?.patient_id) return null;
        const procedures = await invoke<ProcedureLocal[]>('get_procedures_by_patient', { patientId: encounter.patient_id });
        return procedures.find(p => p.encounter_id === encounterId) || null;
      }

      const { data, error } = await supabase
        .from('procedures')
        .select('*')
        .eq('encounter_id', encounterId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!encounterId,
  });

  // Cargar datos del procedimiento cuando estén disponibles
  React.useEffect(() => {
    if (procedure) {
      setTipoProcedimiento(procedure.tipo_procedimiento || '');
      setOjoOperar(procedure.ojo_operar || 'OU');
      setConsentimientoInformado(procedure.consentimiento_informado || false);
      setMedicacion((procedure as any).medicacion || '');
    }
  }, [procedure]);

  // Cargar antecedentes del paciente
  React.useEffect(() => {
    if (patient) {
      setDiabetes(patient.diabetes || false);
      setHta(patient.hta || false);
      setAlergia(!!patient.allergies);
      setAlergiaText(patient.allergies || '');
      setAntecedentesGenerales(patient.notes || '');
      setAntecedentesOftalmologicos(patient.ophthalmic_history || '');
    }
  }, [patient]);

  // Cargar tipo de procedimiento del appointment
  React.useEffect(() => {
    if (appointment?.reason) {
      setTipoProcedimiento(appointment.reason);
    }
  }, [appointment]);

  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    return differenceInYears(new Date(), new Date(dob));
  };

  const patientAge = calculateAge(encounter?.patient?.dob || null);
  const appointmentType = appointment?.type;

  const getAppointmentTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      nueva_consulta: 'bg-consulta text-foreground',
      reconsulta_menos_3m: 'bg-reconsulta-corta text-foreground',
      reconsulta_mas_3m: 'bg-reconsulta-larga text-foreground',
      post_operado: 'bg-post-operado text-foreground',
      lectura_resultados: 'bg-lectura text-foreground',
      procedimiento: 'bg-procedimiento text-foreground',
      cirugia: 'bg-cirugia text-foreground',
      consulta: 'bg-consulta text-foreground',
    };
    return colors[type] || 'bg-primary text-primary-foreground';
  };

  // Get selected encounter details
  const { data: selectedEncounter } = useQuery({
    queryKey: ['selected-encounter', selectedEncounterId, connectionMode],
    queryFn: async () => {
      if (!selectedEncounterId) return null;

      if (isLocalMode) {
        console.log('[Procedimiento] Getting selected encounter from PostgreSQL local');
        const enc = await invoke<EncounterLocal | null>('get_encounter_by_id', { encounterId: selectedEncounterId });
        if (!enc) return null;

        const patient = await invoke<PatientLocal | null>('get_patient_by_id', { patientId: enc.patient_id });
        const examEyes = await invoke<any[]>('get_exam_eyes_by_encounter', { encounterId: selectedEncounterId });
        const diagnoses = await invoke<DiagnosisLocal[]>('get_diagnoses_by_encounter', { encounterId: selectedEncounterId });

        let appointment = null;
        if (enc.appointment_id) {
          const allAppointments = await invoke<AppointmentLocal[]>('get_appointments', { startDate: null, endDate: null, branchId: null });
          appointment = allAppointments.find(a => a.id === enc.appointment_id) || null;
        }

        const surgeries = enc.patient_id ? await invoke<SurgeryLocal[]>('get_surgeries_by_patient', { patientId: enc.patient_id }) : [];
        const surgery = surgeries.find(s => s.encounter_id === selectedEncounterId) || null;

        const procedures = enc.patient_id ? await invoke<ProcedureLocal[]>('get_procedures_by_patient', { patientId: enc.patient_id }) : [];
        const procedure = procedures.find(p => p.encounter_id === selectedEncounterId) || null;

        let doctor = null;
        if (enc.doctor_id) {
          doctor = await invoke<ProfileLocal | null>('get_profile_by_user_id', { userId: enc.doctor_id });
        }

        return { ...enc, patient, exam_eye: examEyes, diagnoses, appointment, surgery, procedure, doctor };
      }

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

      if (data) {
        const encounterDate = new Date(data.date);
        const startOfDay = new Date(encounterDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(encounterDate);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: appointment } = await supabase
          .from('appointments')
          .select('*')
          .eq('patient_id', data.patient_id)
          .gte('starts_at', startOfDay.toISOString())
          .lte('starts_at', endOfDay.toISOString())
          .limit(1)
          .maybeSingle();

        const { data: surgery } = await supabase
          .from('surgeries')
          .select('*')
          .eq('encounter_id', selectedEncounterId)
          .maybeSingle();

        const { data: procedure } = await supabase
          .from('procedures')
          .select('*')
          .eq('encounter_id', selectedEncounterId)
          .maybeSingle();

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

  // Parse autorefractor and lensometry data
  const parseEyeData = (data: string | null) => {
    if (!data) return { od: { esfera: '', cilindro: '', eje: '' }, os: { esfera: '', cilindro: '', eje: '' } };

    const result = {
      od: { esfera: '', cilindro: '', eje: '' },
      os: { esfera: '', cilindro: '', eje: '' }
    };

    const parts = data.split('|').map(p => p.trim());

    const parseValues = (valuesRaw: string) => {
      const out = { esfera: '', cilindro: '', eje: '' };
      const values = valuesRaw.replace(/,/g, '.').replace(/×/g, 'x').trim();

      const [left, right] = values.split(/x/i).map(s => s.trim());
      if (right) {
        const axisMatch = right.match(/([-+]?\d+(?:\.\d+)?)/);
        if (axisMatch) out.eje = axisMatch[1];
      }

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
      procedimiento: 'Procedimiento',
      cirugia: 'Procedimiento',
      consulta: 'Consulta',
    };
    return labels[type] || type;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!encounterId) return;

      if (isLocalMode) {
        console.log('[Procedimiento] Saving procedure data with PostgreSQL local');

        // 1. Actualizar encounter
        await invoke('update_encounter', {
          id: encounterId,
          updates: {
            summary: diagnosticoPreoperatorio,
            plan_tratamiento: planQuirurgico,
            proxima_cita: proximaCita,
            motivo_consulta: `Procedimiento: ${tipoProcedimiento}`,
          },
        });

        // 2. Actualizar antecedentes del paciente
        if (patient?.id) {
          await invoke('update_patient', {
            id: patient.id,
            updates: {
              diabetes,
              hta,
              allergies: alergia ? alergiaText : null,
              notes: antecedentesGenerales,
              ophthalmic_history: antecedentesOftalmologicos,
            },
          });
        }

        // 3. Guardar/actualizar en tabla procedures
        const existingProcedures = patient?.id
          ? await invoke<ProcedureLocal[]>('get_procedures_by_patient', { patientId: patient.id })
          : [];
        const existingProcedure = existingProcedures.find(p => p.encounter_id === encounterId);

        if (existingProcedure) {
          await invoke('update_procedure', {
            id: existingProcedure.id,
            updates: {
              tipo_procedimiento: tipoProcedimiento,
              ojo_operar: ojoOperar,
              consentimiento_informado: consentimientoInformado,
              medicacion: medicacion,
            },
          });
        } else {
          await invoke('create_procedure', {
            procedure: {
              encounter_id: encounterId,
              tipo_procedimiento: tipoProcedimiento,
              ojo_operar: ojoOperar,
              consentimiento_informado: consentimientoInformado,
              medicacion: medicacion,
            },
          });
        }

        // 4. Guardar diagnóstico si no existe
        if (diagnosticoPreoperatorio.trim()) {
          const existingDiagnoses = await invoke<DiagnosisLocal[]>('get_diagnoses_by_encounter', { encounterId });
          if (existingDiagnoses.length === 0) {
            await invoke('create_diagnosis', {
              diagnosis: {
                encounter_id: encounterId,
                label: diagnosticoPreoperatorio,
                code: null,
              },
            });
          }
        }

        return;
      }

      // Modo Supabase
      // 1. Actualizar encounter con diagnóstico, plan y próxima cita
      const { error: encounterError } = await supabase
        .from('encounters')
        .update({
          summary: diagnosticoPreoperatorio,
          plan_tratamiento: planQuirurgico,
          proxima_cita: proximaCita,
          motivo_consulta: `Procedimiento: ${tipoProcedimiento}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', encounterId);

      if (encounterError) throw encounterError;

      // 2. Actualizar antecedentes del paciente
      if (patient?.id) {
        const { error: patientError } = await supabase
          .from('patients')
          .update({
            diabetes,
            hta,
            allergies: alergia ? alergiaText : null,
            notes: antecedentesGenerales,
            ophthalmic_history: antecedentesOftalmologicos,
          })
          .eq('id', patient.id);

        if (patientError) throw patientError;
      }

      // 3. Guardar/actualizar en tabla procedures
      const procedureData = {
        encounter_id: encounterId,
        tipo_procedimiento: tipoProcedimiento,
        ojo_operar: ojoOperar,
        consentimiento_informado: consentimientoInformado,
        medicacion: medicacion,
      };

      // Verificar si ya existe un registro
      const { data: existingProcedure } = await supabase
        .from('procedures')
        .select('id')
        .eq('encounter_id', encounterId)
        .maybeSingle();

      if (existingProcedure) {
        const { error: updateError } = await supabase
          .from('procedures')
          .update(procedureData)
          .eq('id', existingProcedure.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('procedures')
          .insert(procedureData);

        if (insertError) throw insertError;
      }

      // 4. Guardar diagnóstico preoperatorio
      if (diagnosticoPreoperatorio.trim()) {
        const { data: existingDiagnosis } = await supabase
          .from('diagnoses')
          .select('id')
          .eq('encounter_id', encounterId)
          .maybeSingle();

        if (!existingDiagnosis) {
          const { error: diagnosisError } = await supabase
            .from('diagnoses')
            .insert({
              encounter_id: encounterId,
              label: diagnosticoPreoperatorio,
              code: null,
            });

          if (diagnosisError && diagnosisError.code !== '23505') {
            console.error('Error al guardar diagnóstico:', diagnosisError);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success('Datos guardados correctamente');
      queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      queryClient.invalidateQueries({ queryKey: ['procedure', encounterId] });
      queryClient.invalidateQueries({ queryKey: ['previous-encounters-list'] });
    },
    onError: (error: any) => {
      console.error('Error al guardar:', error);
      toast.error('Error al guardar: ' + error.message);
    },
  });

  const handleSaveAndExit = async () => {
    await saveMutation.mutateAsync();
    navigate('/dashboard');
  };

  const handleFinishSurgery = async () => {
    await saveMutation.mutateAsync();

    // Marcar la cita como completada - usar appointment_id del encounter como fallback
    const appointmentIdToUpdate = appointment?.id || encounter?.appointment_id;

    if (appointmentIdToUpdate) {
      if (isLocalMode) {
        await invoke('update_appointment', {
          id: appointmentIdToUpdate,
          updates: { status: 'done' },
        });
      } else {
        const { error } = await supabase
          .from('appointments')
          .update({ status: 'done' })
          .eq('id', appointmentIdToUpdate);

        if (error) {
          console.error('Error al marcar cita como atendida:', error);
          toast.warning('Procedimiento guardado, pero hubo un error al marcar la cita como atendida');
          navigate('/dashboard');
          return;
        }
      }
    } else {
      console.warn('No se encontró appointment_id para marcar como atendida');
    }

    // Invalidar cache para que el dashboard refleje el cambio
    queryClient.invalidateQueries({ queryKey: ['appointments'] });

    toast.success('Procedimiento finalizado exitosamente');
    navigate('/dashboard');
  };

  const handlePrintMedication = async () => {
    if (!patient || !encounter || !medicacion.trim()) {
      toast.error('No hay datos suficientes para imprimir');
      return;
    }

    setIsGeneratingMedication(true);
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
          name: encounter.doctor?.full_name || 'Doctor',
          specialty: encounter.doctor?.specialty || 'Oftalmología',
          gender: ((encounter.doctor as any)?.gender || 'M') as 'M' | 'F',
        },
        date: new Date().toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        content: {
          treatment: medicacion,
        },
      };

      setPreviewTitle('Preview de Medicación Post-Procedimiento');
      await generatePDF(pdfData);
    } finally {
      setIsGeneratingMedication(false);
    }
  };

  if (isLoading || !encounter) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      
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
                      <span className="text-sm text-muted-foreground">
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
                  <p className="text-sm text-muted-foreground">
                    Dr. {encounter.doctor?.full_name}
                  </p>
                  {appointment?.starts_at && (
                    <p className="text-sm text-muted-foreground">
                      Fecha de procedimiento: {new Date(appointment.starts_at).toLocaleDateString('es-ES', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white mt-1"
              onClick={handleFinishSurgery}
            >
              <Check className="h-4 w-4 mr-2" />
              Finalizar Procedimiento
            </Button>
          </div>
        </div>
      </header>

      {/* Botón flotante para sidebar en móvil - FUERA del main para visibilidad */}
      <MobileSidebarSheet>
            {/* Botón Estudios arriba del sidebar */}
            {encounter?.patient_id && (
              <Button
                onClick={() => navigate(`/ver-estudios/${encounter.patient_id}?returnTo=procedimiento&encounterId=${encounterId}`)}
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

              {/* Procedimientos */}
              <Collapsible open={procedimientosOpen} onOpenChange={setProcedimientosOpen}>
                <div className="p-4 border-b">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between hover:opacity-80 transition-opacity">
                      <h3 className="text-lg font-semibold">
                        Procedimientos {!procedimientosOpen && surgeries && surgeries.length > 0 && `(${surgeries.length})`}
                      </h3>
                      <ChevronDown className={`h-5 w-5 transition-transform ${procedimientosOpen ? 'rotate-180' : ''}`} />
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
                      <p className="text-sm text-muted-foreground mt-4">No hay procedimientos registrados</p>
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
                              onClick={() => navigate(`/ver-estudios/${encounter?.patient_id}?returnTo=procedimiento&encounterId=${encounterId}`)}
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

      <main className="container mx-auto px-4 py-8">
        <div className="flex gap-6">
          {/* Sidebar de Citas Previas y Procedimientos */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky" style={{ top: '100px' }}>
              {/* Botón Estudios arriba del sidebar */}
              {encounter?.patient_id && (
                <Button
                  onClick={() => navigate(`/ver-estudios/${encounter.patient_id}?returnTo=procedimiento&encounterId=${encounterId}`)}
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

                {/* Procedimientos */}
                <Collapsible open={procedimientosOpen} onOpenChange={setProcedimientosOpen}>
                  <div className="p-4 border-b">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between hover:opacity-80 transition-opacity">
                        <h3 className="text-lg font-semibold">
                          Procedimientos {!procedimientosOpen && surgeries && surgeries.length > 0 && `(${surgeries.length})`}
                        </h3>
                        <ChevronDown className={`h-5 w-5 transition-transform ${procedimientosOpen ? 'rotate-180' : ''}`} />
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
                        <p className="text-sm text-muted-foreground mt-4">No hay procedimientos registrados</p>
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
                                onClick={() => navigate(`/ver-estudios/${encounter?.patient_id}?returnTo=procedimiento&encounterId=${encounterId}`)}
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
          {/* Tipo de Procedimiento y Ojo */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-4">Información del Procedimiento</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tipoProcedimiento">Tipo de Procedimiento</Label>
                <Input 
                  id="tipoProcedimiento"
                  value={tipoProcedimiento}
                  onChange={(e) => setTipoProcedimiento(e.target.value)}
                  placeholder="Ej: Inyección intravítrea, YAG láser, etc."
                />
              </div>
              <div>
                <Label htmlFor="ojoOperar">Ojo a Operar</Label>
                <Select value={ojoOperar} onValueChange={(value: 'OD' | 'OI' | 'OU') => setOjoOperar(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OD">OD (Ojo Derecho)</SelectItem>
                    <SelectItem value="OI">OI (Ojo Izquierdo)</SelectItem>
                    <SelectItem value="OU">OU (Ambos Ojos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Medicación */}
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Medicación</h2>
              <Button 
                variant="default"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={handlePrintMedication}
                disabled={isGeneratingMedication || !medicacion.trim()}
              >
                {isGeneratingMedication ? (
                  <>
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir
                  </>
                )}
              </Button>
            </div>
            <Textarea 
              value={medicacion}
              onChange={(e) => setMedicacion(e.target.value)}
              placeholder="Medicación post-procedimiento..."
              className="min-h-[150px]"
            />
          </div>

          {/* Botón de Finalizar */}
          <div className="flex justify-end">
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleFinishSurgery}
              disabled={saveMutation.isPending}
            >
              <Check className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Guardando...' : 'Finalizar Procedimiento'}
            </Button>
           </div>
         </div>
        </div>
      </main>

      {/* Print Preview Dialog */}
      <PrintPreviewDialog
        isOpen={!!htmlContent}
        onClose={clearContent}
        htmlContent={htmlContent}
        title={previewTitle}
      />

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
            
            const isFirstConsultation = appointmentType === 'nueva_consulta';
            
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
                  {/* Diagnóstico y Tratamiento Previo (para reconsultas) */}
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

                  {/* Datos subjetivos */}
                  {selectedEncounter.motivo_consulta && (
                    <div className="bg-card rounded-lg border p-6">
                      <h2 className="text-lg font-semibold mb-3">Datos subjetivos</h2>
                      <p className="text-sm whitespace-pre-wrap">{selectedEncounter.motivo_consulta}</p>
                    </div>
                  )}

                  {/* Antecedentes */}
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

                  {/* Preconsulta */}
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
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{(appointment as any).keratometry_od_k1 || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{(appointment as any).keratometry_od_k2 || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{(appointment as any).keratometry_od_axis || '-'}</div>
                                </div>
                              </div>
                              <div>
                                <Label className="text-sm font-medium text-muted-foreground mb-2 block">OS</Label>
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{(appointment as any).keratometry_os_k1 || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{(appointment as any).keratometry_os_k2 || '-'}</div>
                                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">{(appointment as any).keratometry_os_axis || '-'}</div>
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
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm">{examOD?.av_sc || '-'}</div>
                          </div>
                          <div>
                            <Label className="text-sm mb-2 block">OS</Label>
                            <div className="px-3 py-2 rounded-md border bg-muted text-sm">{examOS?.av_sc || '-'}</div>
                          </div>
                        </div>
                      </div>

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
                          <Label className="text-base font-medium mb-3 block">Procedimiento</Label>
                          <div className="px-3 py-2 rounded-md border bg-muted text-sm min-h-[100px]">
                            {(selectedEncounter as any)?.surgery ? (
                              <div className="space-y-2">
                                <div><strong>Tipo:</strong> {(selectedEncounter as any).surgery.tipo_cirugia}</div>
                                <div><strong>Ojo:</strong> {(selectedEncounter as any).surgery.ojo_operar}</div>
                                <div>
                                  <strong>Consentimiento:</strong> {(selectedEncounter as any).surgery.consentimiento_informado ? 'Sí' : 'No'}
                                </div>
                              </div>
                            ) : (selectedEncounter as any)?.procedure ? (
                              <div className="space-y-2">
                                <div><strong>Tipo:</strong> {(selectedEncounter as any).procedure.tipo_procedimiento}</div>
                                <div><strong>Ojo:</strong> {(selectedEncounter as any).procedure.ojo_operar}</div>
                                <div>
                                  <strong>Consentimiento:</strong> {(selectedEncounter as any).procedure.consentimiento_informado ? 'Sí' : 'No'}
                                </div>
                              </div>
                            ) : '-'}
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
    </div>
  );
}