import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Check, Printer, FileImage, Loader2, X, Download, Upload, ImageIcon, FileText, ChevronDown } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import React from 'react';
import { usePrintPDF } from '@/hooks/usePrintPDF';
import { PrintPreviewDialog } from '@/components/dashboard/PrintPreviewDialog';
import { compressImages } from '@/lib/imageCompression';
import jsPDF from 'jspdf';

// Helper para formatear fechas de forma segura
const formatConsentDate = (dateString: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
  if (!dateString) return 'Fecha no disponible';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleDateString('es-GT', options || {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function Surgery() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Estados principales - simplificados según estructura de DB
  const [tipoCirugia, setTipoCirugia] = React.useState('');
  const [ojoOperar, setOjoOperar] = React.useState<'OD' | 'OI' | 'OU'>('OU');
  const [notaOperatoria, setNotaOperatoria] = React.useState('');
  const [medicacion, setMedicacion] = React.useState('');
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
  const [cirugiasOpen, setCirugiasOpen] = React.useState(true);
  const [estudiosOpen, setEstudiosOpen] = React.useState(true);

  // Estados para print preview
  const [previewTitle, setPreviewTitle] = React.useState('Preview de Documento');
  const [isGeneratingMedication, setIsGeneratingMedication] = React.useState(false);

  // Estados para manejo de archivos
  const [files, setFiles] = React.useState<File[]>([]);
  const [savedFiles, setSavedFiles] = React.useState<Array<{ id: string; path: string; url: string; mime_type: string }>>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [currentUploadingFile, setCurrentUploadingFile] = React.useState('');
  const [fileToDelete, setFileToDelete] = React.useState<{ id: string; path: string } | null>(null);

  // Estado para modal de firma de consentimiento
  const [isViewingSignature, setIsViewingSignature] = React.useState(false);

  // Hook de impresión
  const { generatePDF, isGenerating, htmlContent, clearContent } = usePrintPDF();

  const { data: encounter, isLoading } = useQuery({
    queryKey: ['encounter', encounterId],
    queryFn: async () => {
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

  const patient = encounter?.patient;

  // Buscar el appointment asociado para obtener el tipo de cirugía
  const { data: appointment } = useQuery({
    queryKey: ['appointment', encounter?.appointment_id],
    queryFn: async () => {
      if (!encounter?.appointment_id) return null;
      
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', encounter.appointment_id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!encounter?.appointment_id,
  });

  // Get all previous encounters for sidebar (excluding surgeries)
  const { data: previousEncounters } = useQuery({
    queryKey: ['previous-encounters-list', encounter?.patient_id, encounterId],
    queryFn: async () => {
      if (!encounter?.patient_id) return [];
      
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

  // Get studies for sidebar
  const { data: patientStudies } = useQuery({
    queryKey: ['patient-studies-list', encounter?.patient_id],
    queryFn: async () => {
      if (!encounter?.patient_id) return [];
      
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
    queryKey: ['surgeries-list', encounter?.patient_id, encounterId],
    queryFn: async () => {
      if (!encounter?.patient_id) return [];
      
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

  // Cargar datos del encounter
  React.useEffect(() => {
    if (encounter) {
      setDiagnosticoPreoperatorio(encounter.summary || '');
      setPlanQuirurgico(encounter.plan_tratamiento || '');
      setProximaCita(encounter.proxima_cita || '');
    }
  }, [encounter]);

  // Cargar datos de la cirugía desde la tabla surgeries con archivos
  const { data: surgery } = useQuery({
    queryKey: ['surgery', encounterId],
    queryFn: async () => {
      if (!encounterId) return null;
      
      const { data, error } = await supabase
        .from('surgeries')
        .select('*, surgery_files(*)')
        .eq('encounter_id', encounterId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!encounterId,
  });

  // Query para obtener la firma del consentimiento
  const { data: consentSignature } = useQuery({
    queryKey: ['consent-signature', surgery?.id],
    queryFn: async () => {
      if (!surgery?.id) return null;

      const { data, error } = await (supabase as any)
        .from('consent_signatures')
        .select('*')
        .eq('surgery_id', surgery.id)
        .maybeSingle();

      if (error) throw error;
      return data as {
        id: string;
        patient_name: string;
        witness_name: string;
        patient_signature: string;
        witness_signature: string;
        consent_text: string;
        created_at: string;
      } | null;
    },
    enabled: !!surgery?.id,
  });

  // Cargar datos de la cirugía cuando estén disponibles
  React.useEffect(() => {
    if (surgery) {
      setTipoCirugia(surgery.tipo_cirugia || '');
      setOjoOperar(surgery.ojo_operar || 'OU');
      setNotaOperatoria(surgery.nota_operatoria || '');
      setMedicacion(surgery.medicacion || '');
      setConsentimientoInformado(surgery.consentimiento_informado || false);
      
      // Cargar archivos existentes
      if (surgery.surgery_files && surgery.surgery_files.length > 0) {
        const loadFiles = async () => {
          const filesWithUrls = await Promise.all(
            surgery.surgery_files.map(async (file: any) => {
              const { data } = await supabase.storage
                .from('surgeries')
                .createSignedUrl(file.file_path, 3600);
              return {
                id: file.id,
                path: file.file_path,
                url: data?.signedUrl || '',
                mime_type: file.mime_type || ''
              };
            })
          );
          setSavedFiles(filesWithUrls);
        };
        loadFiles();
      }
    }
  }, [surgery]);

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

  // Cargar tipo de cirugía del appointment
  React.useEffect(() => {
    if (appointment?.reason) {
      setTipoCirugia(appointment.reason);
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
    queryKey: ['selected-encounter', selectedEncounterId],
    queryFn: async () => {
      if (!selectedEncounterId) return null;
      
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
      cirugia: 'Cirugía',
      consulta: 'Consulta',
    };
    return labels[type] || type;
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
        type: 'treatment' as const,  // Reutilizamos el template de treatment
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
          treatment: medicacion,  // El campo de medicación
        },
      };

      setPreviewTitle('Preview de Medicación Post-Quirúrgica');
      await generatePDF(pdfData);
    } finally {
      setIsGeneratingMedication(false);
    }
  };

  // Funciones de manejo de archivos
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('📁 Selección de archivos iniciada');
    
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) {
      console.log('⚠️ No se seleccionaron archivos');
      return;
    }

    console.log(`📂 ${selectedFiles.length} archivo(s) detectado(s):`, selectedFiles.map(f => `${f.name} (${f.type})`));

    // Validar tipos de archivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf'];
    const invalidFiles = selectedFiles.filter(f => !validTypes.includes(f.type));
    
    if (invalidFiles.length > 0) {
      console.error('❌ Archivos con tipo inválido:', invalidFiles.map(f => `${f.name} (${f.type})`));
      toast.error(`Tipo de archivo no permitido: ${invalidFiles[0].name}`);
      event.target.value = ''; // Reset input
      return;
    }

    setFiles(prev => {
      const updated = [...prev, ...selectedFiles];
      console.log(`✅ Total archivos en estado: ${updated.length}`);
      return updated;
    });
    
    toast.success(`${selectedFiles.length} archivo(s) agregado(s) - Se subirán al guardar`);
    
    // Reset input para permitir seleccionar los mismos archivos de nuevo
    event.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeSavedFile = async (fileId: string, filePath: string) => {
    try {
      // Eliminar de la base de datos
      const { error: dbError } = await supabase
        .from('surgery_files')
        .delete()
        .eq('id', fileId);

      if (dbError) throw dbError;

      // Eliminar del storage
      const { error: storageError } = await supabase.storage
        .from('surgeries')
        .remove([filePath]);

      if (storageError) throw storageError;

      setSavedFiles(prev => prev.filter(f => f.id !== fileId));
      queryClient.invalidateQueries({ queryKey: ['surgery', encounterId] });
      toast.success('Archivo eliminado correctamente');
      setFileToDelete(null);
    } catch (error: any) {
      console.error('Error al eliminar archivo:', error);
      toast.error('Error al eliminar el archivo');
    }
  };

  const uploadFiles = async (surgeryId: string) => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Separar imágenes de otros archivos
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      const otherFiles = files.filter(f => !f.type.startsWith('image/'));

      // Comprimir solo las imágenes
      let filesToUpload = [...otherFiles];
      if (imageFiles.length > 0) {
        setCurrentUploadingFile('Comprimiendo imágenes...');
        const compressedImages = await compressImages(imageFiles);
        filesToUpload = [...filesToUpload, ...compressedImages];
      }

      const totalFiles = filesToUpload.length;

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setCurrentUploadingFile(file.name);
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));

        const timestamp = Date.now();
        const fileName = `${timestamp}_${file.name}`;
        const filePath = `surgeries/${encounterId}/${fileName}`;

        // Subir archivo al storage
        const { error: uploadError } = await supabase.storage
          .from('surgeries')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Guardar referencia en la base de datos
        const { error: dbError } = await supabase
          .from('surgery_files')
          .insert({
            surgery_id: surgeryId,
            file_path: filePath,
            mime_type: file.type
          });

        if (dbError) throw dbError;
      }

      // Limpiar archivos seleccionados
      setFiles([]);
      queryClient.invalidateQueries({ queryKey: ['surgery', encounterId] });
      toast.success(`${totalFiles} archivo(s) subido(s) correctamente`);
    } catch (error: any) {
      console.error('Error al subir archivos:', error);
      toast.error('Error al subir archivos: ' + error.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setCurrentUploadingFile('');
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!encounterId) return;

      // 1. Actualizar encounter con diagnóstico, plan y próxima cita
      const { error: encounterError } = await supabase
        .from('encounters')
        .update({
          summary: diagnosticoPreoperatorio,
          plan_tratamiento: planQuirurgico,
          proxima_cita: proximaCita,
          motivo_consulta: `Cirugía: ${tipoCirugia}`,
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

      // 3. Guardar/actualizar en tabla surgeries
      const surgeryData = {
        encounter_id: encounterId,
        tipo_cirugia: tipoCirugia,
        ojo_operar: ojoOperar,
        nota_operatoria: notaOperatoria,
        medicacion: medicacion,
        consentimiento_informado: consentimientoInformado,
      };

      // Verificar si ya existe un registro
      const { data: existingSurgery } = await supabase
        .from('surgeries')
        .select('id')
        .eq('encounter_id', encounterId)
        .maybeSingle();

      let surgeryId: string;

      if (existingSurgery) {
        const { error: updateError } = await supabase
          .from('surgeries')
          .update(surgeryData)
          .eq('id', existingSurgery.id);

        if (updateError) throw updateError;
        surgeryId = existingSurgery.id;
      } else {
        const { data: newSurgery, error: insertError } = await supabase
          .from('surgeries')
          .insert(surgeryData)
          .select('id')
          .single();

        if (insertError) throw insertError;
        surgeryId = newSurgery.id;
      }

      // Subir archivos si hay
      if (files.length > 0) {
        await uploadFiles(surgeryId);
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
      queryClient.invalidateQueries({ queryKey: ['surgery', encounterId] });
      queryClient.invalidateQueries({ queryKey: ['previous-encounters-list'] });
    },
    onError: (error: any) => {
      console.error('Error al guardar:', error);
      toast.error('Error al guardar: ' + error.message);
    },
  });

  const handleSaveAndExit = async () => {
    await saveMutation.mutateAsync();
    
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

  const handleFinishSurgery = async () => {
    await saveMutation.mutateAsync();
    
    // Marcar la cita como completada
    if (appointment?.id) {
      await supabase
        .from('appointments')
        .update({ status: 'done' })
        .eq('id', appointment.id);
    }

    toast.success('Cirugía finalizada exitosamente');
    navigate('/dashboard');
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
                      Fecha de cirugía: {new Date(appointment.starts_at).toLocaleDateString('es-ES', { 
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
              Finalizar Cirugía
            </Button>
          </div>
        </div>
      </header>

      {/* Botón flotante para sidebar en móvil - FUERA del main para visibilidad */}
      <MobileSidebarSheet>
            {/* Botón Estudios arriba del sidebar */}
            {encounter?.patient_id && (
              <Button
                onClick={() => navigate(`/ver-estudios/${encounter.patient_id}?returnTo=surgery&encounterId=${encounterId}`)}
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
                              onClick={() => navigate(`/ver-estudios/${encounter?.patient_id}?returnTo=surgery&encounterId=${encounterId}`)}
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
          {/* Sidebar de Citas Previas y Cirugías */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky" style={{ top: '100px' }}>
              {/* Botón Estudios arriba del sidebar */}
              {encounter?.patient_id && (
                <Button
                  onClick={() => navigate(`/ver-estudios/${encounter.patient_id}?returnTo=surgery&encounterId=${encounterId}`)}
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
                                onClick={() => navigate(`/ver-estudios/${encounter?.patient_id}?returnTo=surgery&encounterId=${encounterId}`)}
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
          {/* Tipo de Cirugía y Ojo */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-4">Información de la Cirugía</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tipoCirugia">Tipo de Cirugía</Label>
                <Input 
                  id="tipoCirugia"
                  value={tipoCirugia}
                  onChange={(e) => setTipoCirugia(e.target.value)}
                  placeholder="Ej: Catarata, LASIK, etc."
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

          {/* Nota operatoria */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-4">Nota operatoria</h2>
            <Textarea 
              value={notaOperatoria}
              onChange={(e) => setNotaOperatoria(e.target.value)}
              placeholder="Descripción de la cirugía, observaciones, hallazgos, incidencias y complicaciones..."
              className="min-h-[200px]"
            />
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
              placeholder="Medicación preoperatoria y postoperatoria..."
              className="min-h-[150px]"
            />
          </div>

          {/* Consentimiento Informado */}
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Consentimiento Informado
              </h2>
              {consentSignature ? (
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100 px-3 py-1">
                    <Check className="h-4 w-4 mr-1" />
                    Firmado
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsViewingSignature(true)}
                  >
                    Ver Firma
                  </Button>
                </div>
              ) : (
                <Badge variant="secondary" className="px-3 py-1">
                  Pendiente de firma
                </Badge>
              )}
            </div>
            {consentSignature && (
              <div className="mt-4 text-sm text-muted-foreground">
                <p>Firmado por: <span className="font-medium text-foreground">{consentSignature.patient_name}</span></p>
                <p>Testigo: <span className="font-medium text-foreground">{consentSignature.witness_name}</span></p>
                <p>Fecha: <span className="font-medium text-foreground">
                  {formatConsentDate(consentSignature.created_at)}
                </span></p>
              </div>
            )}
          </div>

          {/* Imágenes y Documentos */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <ImageIcon className="h-6 w-6" />
              Imágenes y Documentos de Cirugía
            </h2>
            <div className="space-y-6">
              {/* Input para seleccionar archivos */}
              <div className="space-y-2">
                <Label htmlFor="surgery-files" className="text-base font-medium">Agregar archivos</Label>
                <div className="flex items-center gap-3">
                <input
                  id="surgery-files"
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => document.getElementById('surgery-files')?.click()}
                    disabled={uploading}
                    className="w-full sm:w-auto"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Seleccionar archivos
                  </Button>
                  {files.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-md">
                      <span className="text-sm font-medium">{files.length}</span>
                      <span className="text-xs">listo(s) para subir</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Formatos: JPG, PNG, WEBP, GIF, MP4, MOV, PDF • Las imágenes se comprimirán automáticamente
                </p>
              </div>

              {/* Preview de archivos seleccionados (no subidos) */}
              {files.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Archivos seleccionados</Label>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {files.length} archivo(s)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {files.map((file, index) => (
                      <Card key={index} className="relative group overflow-hidden border-2 border-dashed hover:border-primary transition-colors">
                        <CardContent className="p-0">
                          {file.type.startsWith('image/') ? (
                            <div className="relative">
                              <img
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                className="w-full h-40 object-cover"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-white text-sm font-medium">Vista previa</span>
                              </div>
                            </div>
                          ) : file.type.startsWith('video/') ? (
                            <div className="w-full h-40 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 flex items-center justify-center">
                              <FileImage className="h-16 w-16 text-blue-500" />
                            </div>
                          ) : (
                            <div className="w-full h-40 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 flex items-center justify-center">
                              <FileText className="h-16 w-16 text-red-500" />
                            </div>
                          )}
                          <div className="p-3 bg-background">
                            <p className="text-xs truncate font-medium">{file.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {(file.size / 1024).toFixed(0)} KB
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            onClick={() => handleRemoveFile(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <p className="text-xs text-center text-muted-foreground bg-muted/50 rounded p-2">
                    ℹ️ Los archivos se subirán automáticamente al guardar la cirugía
                  </p>
                </div>
              )}

              {/* Archivos ya guardados */}
              {savedFiles.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Archivos guardados</Label>
                    <span className="text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded">
                      {savedFiles.length} archivo(s)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {savedFiles.map((file) => (
                      <Card key={file.id} className="relative group overflow-hidden">
                        <CardContent className="p-0">
                          {file.mime_type?.startsWith('image/') ? (
                            <div className="relative">
                              <img
                                src={file.url}
                                alt="Archivo de cirugía"
                                className="w-full h-40 object-cover cursor-pointer"
                                onClick={() => window.open(file.url, '_blank')}
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                   onClick={() => window.open(file.url, '_blank')}>
                                <span className="text-white text-sm font-medium">Abrir</span>
                              </div>
                            </div>
                          ) : file.mime_type?.startsWith('video/') ? (
                            <div
                              className="w-full h-40 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => window.open(file.url, '_blank')}
                            >
                              <FileImage className="h-16 w-16 text-blue-500" />
                            </div>
                          ) : (
                            <div 
                              className="w-full h-40 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => window.open(file.url, '_blank')}
                            >
                              <FileText className="h-16 w-16 text-red-500" />
                            </div>
                          )}
                          <div className="p-3 bg-background">
                            <p className="text-xs truncate font-medium">
                              {file.path.split('/').pop()}
                            </p>
                          </div>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              className="h-7 w-7 shadow-lg"
                              onClick={() => window.open(file.url, '_blank')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-7 w-7 shadow-lg"
                              onClick={() => setFileToDelete({ id: file.id, path: file.path })}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                files.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
                    <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      No hay archivos guardados aún
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Selecciona archivos arriba para agregar imágenes o documentos
                    </p>
                  </div>
                )
              )}

              {/* Barra de progreso durante subida */}
              {uploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-sm text-muted-foreground">
                    {currentUploadingFile}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Botón de Finalizar */}
          <div className="flex justify-end">
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleFinishSurgery}
              disabled={saveMutation.isPending}
            >
              <Check className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Guardando...' : 'Finalizar Cirugía'}
            </Button>
           </div>
         </div>
        </div>
      </main>

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

      {/* Print Preview Dialog */}
      <PrintPreviewDialog
        isOpen={!!htmlContent}
        onClose={clearContent}
        htmlContent={htmlContent}
        title={previewTitle}
      />

      {/* Diálogo de confirmación para eliminar archivo */}
      <AlertDialog open={!!fileToDelete} onOpenChange={() => setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar archivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El archivo será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (fileToDelete) {
                  removeSavedFile(fileToDelete.id, fileToDelete.path);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal para ver firma de consentimiento */}
      <Dialog open={isViewingSignature} onOpenChange={setIsViewingSignature}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Consentimiento Informado Firmado
            </DialogTitle>
            {consentSignature && (
              <Button
                size="sm"
                onClick={() => {
                  try {
                    const doc = new jsPDF();
                    const pageWidth = doc.internal.pageSize.getWidth();
                    let y = 20;

                    doc.setFontSize(18);
                    doc.setFont('helvetica', 'bold');
                    doc.text('CONSENTIMIENTO INFORMADO', pageWidth / 2, y, { align: 'center' });
                    y += 15;

                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100);
                    doc.text('Paciente:', 20, y);
                    doc.setTextColor(0);
                    doc.setFont('helvetica', 'bold');
                    doc.text(consentSignature.patient_name, 50, y);

                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100);
                    doc.text('Testigo:', 110, y);
                    doc.setTextColor(0);
                    doc.setFont('helvetica', 'bold');
                    doc.text(consentSignature.witness_name, 135, y);
                    y += 8;

                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100);
                    doc.text('Fecha de firma:', 20, y);
                    doc.setTextColor(0);
                    doc.text(formatConsentDate(consentSignature.created_at, {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }), 55, y);
                    y += 15;

                    doc.setDrawColor(200);
                    doc.line(20, y, pageWidth - 20, y);
                    y += 10;

                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Documento firmado:', 20, y);
                    y += 8;

                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    const consentLines = doc.splitTextToSize(consentSignature.consent_text, pageWidth - 40);

                    for (const line of consentLines) {
                      if (y > 250) {
                        doc.addPage();
                        y = 20;
                      }
                      doc.text(line, 20, y);
                      y += 5;
                    }
                    y += 10;

                    if (y > 200) {
                      doc.addPage();
                      y = 20;
                    }

                    doc.setDrawColor(200);
                    doc.line(20, y, pageWidth - 20, y);
                    y += 10;

                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Firma del Paciente', 55, y, { align: 'center' });
                    doc.text('Firma del Testigo', 155, y, { align: 'center' });
                    y += 5;

                    if (consentSignature.patient_signature) {
                      try {
                        doc.addImage(consentSignature.patient_signature, 'PNG', 20, y, 70, 35);
                      } catch (e) {
                        console.error('Error agregando firma paciente:', e);
                      }
                    }
                    if (consentSignature.witness_signature) {
                      try {
                        doc.addImage(consentSignature.witness_signature, 'PNG', 120, y, 70, 35);
                      } catch (e) {
                        console.error('Error agregando firma testigo:', e);
                      }
                    }
                    y += 40;

                    doc.setDrawColor(0);
                    doc.line(20, y, 90, y);
                    doc.line(120, y, 190, y);
                    y += 5;

                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.text(consentSignature.patient_name, 55, y, { align: 'center' });
                    doc.text(consentSignature.witness_name, 155, y, { align: 'center' });

                    doc.save(`Consentimiento_${consentSignature.patient_name.replace(/\s+/g, '_')}.pdf`);
                    toast.success('PDF descargado exitosamente');
                  } catch (error) {
                    console.error('Error generando PDF:', error);
                    toast.error('Error al generar el PDF');
                  }
                }}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Descargar PDF
              </Button>
            )}
          </DialogHeader>

          {consentSignature && (
            <div className="space-y-6">
              {/* Información de la firma */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Paciente</p>
                  <p className="font-medium">{consentSignature.patient_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Testigo</p>
                  <p className="font-medium">{consentSignature.witness_name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Fecha de firma</p>
                  <p className="font-medium">
                    {formatConsentDate(consentSignature.created_at, {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              {/* Texto del consentimiento */}
              <div>
                <h3 className="font-semibold mb-2">Documento firmado</h3>
                <ScrollArea className="h-48 rounded-lg border p-4 bg-gray-50">
                  <pre className="text-sm whitespace-pre-wrap font-sans text-gray-700">
                    {consentSignature.consent_text}
                  </pre>
                </ScrollArea>
              </div>

              {/* Firmas */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2 text-center">Firma del Paciente</h3>
                  <div className="border rounded-lg p-2 bg-white">
                    <img
                      src={consentSignature.patient_signature}
                      alt="Firma del paciente"
                      className="w-full h-32 object-contain"
                    />
                  </div>
                  <p className="text-center text-sm text-muted-foreground mt-1">
                    {consentSignature.patient_name}
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-center">Firma del Testigo</h3>
                  <div className="border rounded-lg p-2 bg-white">
                    <img
                      src={consentSignature.witness_signature}
                      alt="Firma del testigo"
                      className="w-full h-32 object-contain"
                    />
                  </div>
                  <p className="text-center text-sm text-muted-foreground mt-1">
                    {consentSignature.witness_name}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}