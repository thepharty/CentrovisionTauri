import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/hooks/useBranch';
import { Appointment, AppointmentType } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Upload, Pencil } from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { fromClinicTime } from '@/lib/timezone';
import { PatientSearch } from './PatientSearch';
import { DuplicatePatientDialog } from './DuplicatePatientDialog';
import { compressImage } from '@/lib/imageCompression';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { validateAxisInput } from '@/lib/axisValidation';
import {
  isTauri,
  createPatient as createPatientTauri,
  updatePatient as updatePatientTauri,
  createAppointment as createAppointmentTauri,
  updateAppointment as updateAppointmentTauri,
} from '@/lib/dataSource';

interface AppointmentDialogProps {
  open: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
  initialDate?: Date;
  initialTime?: string;
  initialRoomId?: string;
  initialDoctorId?: string;
}

interface FormData {
  patient_code: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_dob: string;
  patient_address: string;
  patient_occupation: string;
  patient_phone: string;
  patient_email: string;
  reason: string;
  type: AppointmentType;
  post_op_type: string;
  is_courtesy: boolean;
  autorefractor_od_esfera: string;
  autorefractor_od_cilindro: string;
  autorefractor_od_eje: string;
  autorefractor_os_esfera: string;
  autorefractor_os_cilindro: string;
  autorefractor_os_eje: string;
  lensometry_od_esfera: string;
  lensometry_od_cilindro: string;
  lensometry_od_eje: string;
  lensometry_os_esfera: string;
  lensometry_os_cilindro: string;
  lensometry_os_eje: string;
  keratometry_od_k1: string;
  keratometry_od_k2: string;
  keratometry_od_axis: string;
  keratometry_os_k1: string;
  keratometry_os_k2: string;
  keratometry_os_axis: string;
  pio_od: string;
  pio_os: string;
  doctor_id: string;
  room_id: string;
  external_doctor_name: string;
  date: Date;
  time: string;
  end_time?: string;
  end_date?: Date;
}

const APPOINTMENT_TYPES = [
  { value: 'nueva_consulta', label: 'Nueva consulta' },
  { value: 'reconsulta_menos_3m', label: 'Reconsulta - 3 meses' },
  { value: 'reconsulta_mas_3m', label: 'Reconsulta + 3 meses' },
  { value: 'post_operado', label: 'Post operado' },
  { value: 'lectura_resultados', label: 'Lectura de resultados' },
  { value: 'procedimiento', label: 'Procedimiento' },
  { value: 'cirugia', label: 'Cirugía' },
  { value: 'estudio', label: 'Estudio' },
];

const TIME_SLOTS = Array.from({ length: 14 * 4 }, (_, i) => {
  const hour = Math.floor(i / 4) + 7;
  const minute = (i % 4) * 15;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
});

export function AppointmentDialog({ open, onClose, appointment, initialDate, initialTime, initialRoomId, initialDoctorId }: AppointmentDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const { isOnline } = useNetworkStatus();
  const [photoOD, setPhotoOD] = useState<File | null>(null);
  const [photoOI, setPhotoOI] = useState<File | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate || new Date());
  const [selectedEndDate, setSelectedEndDate] = useState<Date | undefined>(initialDate || new Date());
  const [uploading, setUploading] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>(appointment?.patient_id);
  const [showPatientForm, setShowPatientForm] = useState(!appointment?.patient_id);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicatePatients, setDuplicatePatients] = useState<any[]>([]);
  const [pendingPatientData, setPendingPatientData] = useState<FormData | null>(null);
  const [isExternalDoctor, setIsExternalDoctor] = useState(false);

  const { register, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    defaultValues: {
      date: initialDate || new Date(),
      time: initialTime || '09:00',
      room_id: initialRoomId || '',
      doctor_id: initialDoctorId || '',
      type: 'nueva_consulta',
      is_courtesy: false,
      end_date: initialDate || new Date(),
      autorefractor_od_esfera: '',
      autorefractor_od_cilindro: '',
      autorefractor_od_eje: '',
      autorefractor_os_esfera: '',
      autorefractor_os_cilindro: '',
      autorefractor_os_eje: '',
      lensometry_od_esfera: '',
      lensometry_od_cilindro: '',
      lensometry_od_eje: '',
      lensometry_os_esfera: '',
      lensometry_os_cilindro: '',
      lensometry_os_eje: '',
      keratometry_od_k1: '',
      keratometry_od_k2: '',
      keratometry_od_axis: '',
      keratometry_os_k1: '',
      keratometry_os_k2: '',
      keratometry_os_axis: '',
      pio_od: '',
      pio_os: '',
    }
  });

  const watchFirstName = watch('patient_first_name');
  const watchLastName = watch('patient_last_name');

  // Detectar si está en "modo bloqueo"
  const isBlockMode = 
    watchFirstName?.toLowerCase().trim() === 'bloqueo' && 
    watchLastName?.toLowerCase().trim() === 'bloqueo';

  const selectedType = watch('type');

  const { data: doctors = [] } = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      // Use Supabase when online, SQLite only when offline
      if (isTauri() && !navigator.onLine) {
        const { getDoctors } = await import('@/lib/dataSource');
        return getDoctors();
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'doctor');

      if (!roles || roles.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', roles.map(r => r.user_id));

      return profiles || [];
    },
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', currentBranch?.id],
    queryFn: async () => {
      // Use Supabase when online, SQLite only when offline
      if (isTauri() && !navigator.onLine && currentBranch?.id) {
        const { getRooms } = await import('@/lib/dataSource');
        return getRooms(currentBranch.id);
      }

      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('active', true)
        .order('name');
      return data || [];
    },
  });

  useEffect(() => {
    if (appointment?.patient) {
      setSelectedPatientId(appointment.patient_id);
      setShowPatientForm(false);
      setValue('patient_code', appointment.patient.code || '');
      setValue('patient_first_name', appointment.patient.first_name);
      setValue('patient_last_name', appointment.patient.last_name);
      setValue('patient_dob', appointment.patient.dob || '');
      setValue('patient_address', appointment.patient.address || '');
      setValue('patient_occupation', appointment.patient.occupation || '');
      setValue('patient_phone', appointment.patient.phone || '');
      setValue('patient_email', appointment.patient.email || '');
      setValue('reason', appointment.reason || '');
      setValue('type', appointment.type);
      setValue('post_op_type', appointment.post_op_type || '');
      setValue('is_courtesy', appointment.is_courtesy || false);
      setValue('doctor_id', appointment.doctor_id || '');
      setValue('room_id', appointment.room_id || '');
      
      // Parse autorefractor values
      if (appointment.autorefractor) {
        const autoMatch = appointment.autorefractor.match(/OD:\s*([^\s]*)\s*([^\s]*)\s*x\s*([^\s|]*)/);
        const autoMatchOS = appointment.autorefractor.match(/OS:\s*([^\s]*)\s*([^\s]*)\s*x\s*([^\s]*)/);
        if (autoMatch) {
          setValue('autorefractor_od_esfera', autoMatch[1] || '');
          setValue('autorefractor_od_cilindro', autoMatch[2] || '');
          setValue('autorefractor_od_eje', autoMatch[3] || '');
        }
        if (autoMatchOS) {
          setValue('autorefractor_os_esfera', autoMatchOS[1] || '');
          setValue('autorefractor_os_cilindro', autoMatchOS[2] || '');
          setValue('autorefractor_os_eje', autoMatchOS[3] || '');
        }
      }

      // Parse lensometry values
      if (appointment.lensometry) {
        const lensMatch = appointment.lensometry.match(/OD:\s*([^\s]*)\s*([^\s]*)\s*x\s*([^\s|]*)/);
        const lensMatchOS = appointment.lensometry.match(/OS:\s*([^\s]*)\s*([^\s]*)\s*x\s*([^\s]*)/);
        if (lensMatch) {
          setValue('lensometry_od_esfera', lensMatch[1] || '');
          setValue('lensometry_od_cilindro', lensMatch[2] || '');
          setValue('lensometry_od_eje', lensMatch[3] || '');
        }
        if (lensMatchOS) {
          setValue('lensometry_os_esfera', lensMatchOS[1] || '');
          setValue('lensometry_os_cilindro', lensMatchOS[2] || '');
          setValue('lensometry_os_eje', lensMatchOS[3] || '');
        }
      }

      // Load keratometry values
      setValue('keratometry_od_k1', (appointment as any).keratometry_od_k1 || '');
      setValue('keratometry_od_k2', (appointment as any).keratometry_od_k2 || '');
      setValue('keratometry_od_axis', (appointment as any).keratometry_od_axis || '');
      setValue('keratometry_os_k1', (appointment as any).keratometry_os_k1 || '');
      setValue('keratometry_os_k2', (appointment as any).keratometry_os_k2 || '');
      setValue('keratometry_os_axis', (appointment as any).keratometry_os_axis || '');
      
      // Load PIO values
      setValue('pio_od', appointment.pio_od?.toString() || '');
      setValue('pio_os', appointment.pio_os?.toString() || '');
      
      const aptDate = new Date(appointment.starts_at);
      setSelectedDate(aptDate);
      setValue('date', aptDate);
      setValue('time', format(aptDate, 'HH:mm'));
    } else {
      // Reset form when no appointment (creating new)
      setSelectedPatientId(undefined);
      setShowPatientForm(true);
      
      // Update date and time from props when creating new appointment
      if (initialDate) {
        setSelectedDate(initialDate);
        setValue('date', initialDate);
      }
      if (initialTime) {
        setValue('time', initialTime);
      }
      if (initialRoomId) {
        setValue('room_id', initialRoomId);
      }
      if (initialDoctorId) {
        setValue('doctor_id', initialDoctorId);
      }
    }
  }, [appointment, initialDate, initialTime, initialRoomId, initialDoctorId, setValue]);

  const uploadPhoto = async (file: File, side: 'OD' | 'OI', patientId: string): Promise<string> => {
    // Comprimir la imagen antes de subir
    const compressedFile = await compressImage(file);
    
    const fileExt = compressedFile.name.split('.').pop();
    const fileName = `${patientId}_${side}_${Date.now()}.${fileExt}`;
    const filePath = `${patientId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('results')
      .upload(filePath, compressedFile);

    if (uploadError) throw uploadError;

    return filePath;
  };

  const createScheduleBlock = async (data: FormData) => {
    try {
      if (!currentBranch?.id) {
        toast.error('No hay sede seleccionada');
        return;
      }

      if (!data.end_time) {
        toast.error('Debe especificar hora de fin para el bloqueo');
        return;
      }

      const endDateToUse = data.end_date || selectedDate;

      // Crear fecha/hora de inicio en timezone de clínica
      const [startHours, startMinutes] = data.time.split(':');
      const blockStartDate = new Date(selectedDate);
      blockStartDate.setHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
      const blockStartUTC = fromClinicTime(blockStartDate);

      // Crear fecha/hora de fin en timezone de clínica (puede ser diferente día)
      const [endHours, endMinutes] = data.end_time.split(':');
      const blockEndDate = new Date(endDateToUse);
      blockEndDate.setHours(parseInt(endHours), parseInt(endMinutes), 0, 0);
      const blockEndUTC = fromClinicTime(blockEndDate);

      // Validar que hora fin > hora inicio
      if (blockEndUTC <= blockStartUTC) {
        toast.error('La fecha/hora de fin debe ser posterior a la de inicio');
        return;
      }

      const { error } = await supabase
        .from('schedule_blocks')
        .insert({
          doctor_id: data.doctor_id || null,
          room_id: data.room_id || null,
          branch_id: currentBranch.id,
          starts_at: blockStartUTC.toISOString(),
          ends_at: blockEndUTC.toISOString(),
          reason: data.reason || 'Horario bloqueado',
          created_by: user?.id
        });

      if (error) throw error;

      const daysDiff = Math.ceil((blockEndUTC.getTime() - blockStartUTC.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 1) {
        toast.success(`Horario bloqueado exitosamente por ${daysDiff} días`);
      } else {
        toast.success('Horario bloqueado exitosamente');
      }

      queryClient.invalidateQueries({ queryKey: ['schedule_blocks'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      reset();
      setSelectedEndDate(initialDate || new Date());
      onClose();
    } catch (error: any) {
      console.error('Error al crear bloqueo:', error);
      toast.error(error.message || 'Error al crear bloqueo');
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      setUploading(true);

      // Si es modo bloqueo, crear schedule_block y salir
      if (isBlockMode) {
        await createScheduleBlock(data);
        return;
      }

      // Usar paciente existente o crear/actualizar uno nuevo
      let patientId = selectedPatientId || appointment?.patient_id;
      
      // Si no hay paciente seleccionado, buscar duplicados antes de crear
      if (!selectedPatientId && !patientId) {
        // Buscar pacientes con nombre similar
        let similarPatients: any[] = [];

        // Use Supabase when online, SQLite only when offline
        if (isTauri() && !navigator.onLine) {
          // Offline mode: usar búsqueda local
          const { getPatients } = await import('@/lib/dataSource');
          const searchResults = await getPatients(data.patient_first_name, 50);
          const searchResults2 = await getPatients(data.patient_last_name, 50);

          // Combinar y deduplicar resultados
          const combined = [...searchResults, ...searchResults2];
          const uniqueIds = new Set<string>();
          similarPatients = combined.filter(p => {
            if (uniqueIds.has(p.id)) return false;
            uniqueIds.add(p.id);
            return true;
          });
        } else {
          const { data: supabasePatients } = await supabase
            .from('patients')
            .select('*')
            .or(`first_name.ilike.${data.patient_first_name},last_name.ilike.${data.patient_last_name}`);
          similarPatients = supabasePatients || [];
        }

        if (similarPatients && similarPatients.length > 0) {
          // Encontramos duplicados potenciales
          setDuplicatePatients(similarPatients);
          setPendingPatientData(data);
          setDuplicateDialogOpen(true);
          setUploading(false);
          return; // Detener el proceso hasta que el usuario decida
        }
      }

      // Proceder con la creación/actualización
      await createOrUpdateAppointment(data, patientId);
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al guardar la cita');
      setUploading(false);
    }
  };

  const createOrUpdateAppointment = async (data: FormData, existingPatientId?: string) => {
    try {
      setUploading(true);
      let patientId = existingPatientId || appointment?.patient_id;

      // Si el usuario activó "Editar datos del paciente", actualizar el paciente
      if (showPatientForm) {
        if (patientId) {
          // Actualizar paciente existente
          if (isTauri()) {
            await updatePatientTauri(patientId, {
              first_name: data.patient_first_name,
              last_name: data.patient_last_name,
              dob: data.patient_dob || undefined,
              address: data.patient_address || undefined,
              occupation: data.patient_occupation || undefined,
              phone: data.patient_phone || undefined,
              email: data.patient_email || undefined,
            });
          } else {
            const { error: updateError } = await supabase
              .from('patients')
              .update({
                code: data.patient_code || null,
                first_name: data.patient_first_name,
                last_name: data.patient_last_name,
                dob: data.patient_dob || null,
                address: data.patient_address || null,
                occupation: data.patient_occupation || null,
                phone: data.patient_phone || null,
                email: data.patient_email || null,
              })
              .eq('id', patientId);

            if (updateError) throw updateError;
          }
        } else {
          // Crear nuevo paciente
          // Use Supabase when online, SQLite only when offline
          if (isTauri() && !navigator.onLine) {
            const newPatient = await createPatientTauri({
              first_name: data.patient_first_name,
              last_name: data.patient_last_name,
              dob: data.patient_dob || undefined,
              address: data.patient_address || undefined,
              occupation: data.patient_occupation || undefined,
              phone: data.patient_phone || undefined,
              email: data.patient_email || undefined,
            });
            patientId = newPatient.id;
          } else {
            const { data: newPatient, error: patientError } = await supabase
              .from('patients')
              .insert({
                code: data.patient_code || null,
                first_name: data.patient_first_name,
                last_name: data.patient_last_name,
                dob: data.patient_dob || null,
                address: data.patient_address || null,
                occupation: data.patient_occupation || null,
                phone: data.patient_phone || null,
                email: data.patient_email || null,
              })
              .select()
              .single();

            if (patientError) throw patientError;
            patientId = newPatient.id;
          }
        }
      }

      // Subir fotos si existen
      let photoODPath = appointment?.photo_od || null;
      let photoOIPath = appointment?.photo_oi || null;

      if (photoOD) {
        photoODPath = await uploadPhoto(photoOD, 'OD', patientId);
      }
      if (photoOI) {
        photoOIPath = await uploadPhoto(photoOI, 'OI', patientId);
      }

      // Crear datetime de la cita en timezone de la clínica y convertir a UTC
      const [hours, minutes] = data.time.split(':');
      const appointmentDate = new Date(selectedDate);
      appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // Convertir a UTC para guardar en DB
      const appointmentDateUTC = fromClinicTime(appointmentDate);
      const endsAt = addMinutes(appointmentDateUTC, 15);

      // Buscar quirófano si es doctor externo
      let externalDoctorRoomId = null;
      if (isExternalDoctor && (data.type === 'cirugia' || data.type === 'procedimiento')) {
        // Use Supabase when online, SQLite only when offline
        if (isTauri() && !navigator.onLine && currentBranch?.id) {
          const { getRooms } = await import('@/lib/dataSource');
          const branchRooms = await getRooms(currentBranch.id);
          const quirofano = branchRooms.find(r => r.kind === 'quirofano');
          externalDoctorRoomId = quirofano?.id || null;
        } else {
          const { data: quirofano } = await supabase
            .from('rooms')
            .select('id')
            .eq('branch_id', currentBranch?.id)
            .eq('kind', 'quirofano')
            .eq('active', true)
            .limit(1)
            .single();
          externalDoctorRoomId = quirofano?.id || null;
        }
      }

      const appointmentData = {
        patient_id: patientId,
        doctor_id: isExternalDoctor ? null : (data.type === 'estudio' ? null : (data.doctor_id || null)),
        room_id: isExternalDoctor ? externalDoctorRoomId : (data.room_id || null),
        external_doctor_name: isExternalDoctor ? data.external_doctor_name : null,
        starts_at: appointmentDateUTC.toISOString(),
        ends_at: endsAt.toISOString(),
        reason: data.reason || null,
        type: data.type,
        post_op_type: data.type === 'post_operado' ? data.post_op_type : null,
        is_courtesy: data.is_courtesy || false,
        autorefractor: `OD: ${data.autorefractor_od_esfera || ''} ${data.autorefractor_od_cilindro || ''} x ${data.autorefractor_od_eje || ''} | OS: ${data.autorefractor_os_esfera || ''} ${data.autorefractor_os_cilindro || ''} x ${data.autorefractor_os_eje || ''}`,
        lensometry: `OD: ${data.lensometry_od_esfera || ''} ${data.lensometry_od_cilindro || ''} x ${data.lensometry_od_eje || ''} | OS: ${data.lensometry_os_esfera || ''} ${data.lensometry_os_cilindro || ''} x ${data.lensometry_os_eje || ''}`,
        keratometry_od_k1: data.keratometry_od_k1 || null,
        keratometry_od_k2: data.keratometry_od_k2 || null,
        keratometry_od_axis: data.keratometry_od_axis || null,
        keratometry_os_k1: data.keratometry_os_k1 || null,
        keratometry_os_k2: data.keratometry_os_k2 || null,
        keratometry_os_axis: data.keratometry_os_axis || null,
        pio_od: data.pio_od ? parseFloat(data.pio_od) : null,
        pio_os: data.pio_os ? parseFloat(data.pio_os) : null,
        photo_od: photoODPath,
        photo_oi: photoOIPath,
        status: 'scheduled' as const,
      };

      if (!currentBranch?.id) {
        throw new Error('No hay sede seleccionada');
      }

      const appointmentDataWithBranch = {
        ...appointmentData,
        branch_id: currentBranch.id,
      };

      // Use Supabase when online, SQLite only when offline
      // Usamos isOnline del contexto (checkNetworkStatus de Tauri) en lugar de navigator.onLine
      const useLocalDB = isTauri() && !isOnline;

      // Validar máximo 2 citas en el mismo slot (solo para creación o si cambia el horario)
      const isNewAppointment = !appointment;
      const isTimeChanged = appointment && (
        appointmentDateUTC.toISOString() !== appointment.starts_at ||
        appointmentData.doctor_id !== appointment.doctor_id
      );

      if (isNewAppointment || isTimeChanged) {
        // Calcular inicio y fin del slot de 15 minutos
        const slotStart = appointmentDateUTC.toISOString();
        const slotEnd = addMinutes(appointmentDateUTC, 15).toISOString();

        // Buscar citas existentes en el mismo slot y doctor
        const { data: existingAppointments, error: checkError } = await supabase
          .from('appointments')
          .select('id')
          .eq('doctor_id', appointmentData.doctor_id)
          .gte('starts_at', slotStart)
          .lt('starts_at', slotEnd)
          .neq('id', appointment?.id || '00000000-0000-0000-0000-000000000000');

        if (checkError) {
          console.error('Error checking slot availability:', checkError);
        } else if (existingAppointments && existingAppointments.length >= 2) {
          toast.error('Este horario ya tiene 2 citas. Seleccione otro horario.');
          setUploading(false);
          return;
        }
      }

      if (appointment) {
        // Update existing appointment
        if (useLocalDB) {
          await updateAppointmentTauri(appointment.id, {
            patient_id: patientId,
            doctor_id: isExternalDoctor ? undefined : (data.type === 'estudio' ? undefined : (data.doctor_id || undefined)),
            room_id: isExternalDoctor ? externalDoctorRoomId || undefined : (data.room_id || undefined),
            starts_at: appointmentDateUTC.toISOString(),
            ends_at: endsAt.toISOString(),
            reason: data.reason || undefined,
            type: data.type,
            status: 'scheduled',
          });
        } else {
          const { error } = await supabase
            .from('appointments')
            .update(appointmentDataWithBranch)
            .eq('id', appointment.id);

          if (error) throw error;
        }
        toast.success('Cita actualizada exitosamente');
      } else {
        // Create new appointment
        if (useLocalDB) {
          await createAppointmentTauri({
            patient_id: patientId,
            doctor_id: isExternalDoctor ? undefined : (data.type === 'estudio' ? undefined : (data.doctor_id || undefined)),
            room_id: isExternalDoctor ? externalDoctorRoomId || undefined : (data.room_id || undefined),
            branch_id: currentBranch.id,
            starts_at: appointmentDateUTC.toISOString(),
            ends_at: endsAt.toISOString(),
            reason: data.reason || undefined,
            type: data.type,
            status: 'scheduled',
          });
        } else {
          const { error } = await supabase
            .from('appointments')
            .insert(appointmentDataWithBranch);

          if (error) throw error;
        }
        toast.success('Cita creada exitosamente');
      }

      // Forzar refetch inmediato (no solo invalidar) para que aparezca la cita
      // Esto es especialmente importante en modo offline donde SQLite ya tiene el dato
      await queryClient.refetchQueries({ queryKey: ['appointments'] });
      reset();
      onClose();
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al guardar la cita');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isBlockMode 
              ? '🚫 Bloquear Horario' 
              : (appointment ? 'Editar Cita' : 'Nueva Cita')
            }
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Patient Search */}
          {!isBlockMode && (
            <div>
              <Label>Buscar Paciente Existente</Label>
              <PatientSearch
              selectedPatientId={selectedPatientId}
              onSelectPatient={(patient) => {
                if (patient) {
                  setSelectedPatientId(patient.id);
                  setShowPatientForm(false);
                  setValue('patient_code', patient.code || '');
                  setValue('patient_first_name', patient.first_name);
                  setValue('patient_last_name', patient.last_name);
                  setValue('patient_dob', patient.dob || '');
                  setValue('patient_address', patient.address || '');
                  setValue('patient_occupation', patient.occupation || '');
                  setValue('patient_phone', patient.phone || '');
                  setValue('patient_email', patient.email || '');
                }
              }}
              onClearSelection={() => {
                setSelectedPatientId(undefined);
                setShowPatientForm(true);
                reset();
              }}
            />
          {!selectedPatientId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setShowPatientForm(true)}
            >
              + Nuevo Paciente
            </Button>
          )}
          {selectedPatientId && !showPatientForm && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setShowPatientForm(true)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar datos del paciente
            </Button>
          )}
        </div>
          )}

        {/* Patient Form - Only show if creating new or no patient selected */}
        {!isBlockMode && ((showPatientForm && selectedPatientId) || !selectedPatientId) && (
          <>
            {selectedPatientId && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                <p className="text-sm text-blue-700 font-medium">
                  ✏️ Editando datos del paciente: {watch('patient_first_name')} {watch('patient_last_name')}
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="patient_code">ID / Identificación del Paciente</Label>
              <Input id="patient_code" {...register('patient_code')} placeholder="Ej: 12345678" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="patient_first_name">Nombre(s) *</Label>
                  <Input 
                    id="patient_first_name" 
                    {...register('patient_first_name', { required: true })} 
                    readOnly={isBlockMode}
                    className={isBlockMode ? 'bg-muted' : ''}
                  />
                </div>
                <div>
                  <Label htmlFor="patient_last_name">Apellido(s) *</Label>
                  <Input 
                    id="patient_last_name" 
                    {...register('patient_last_name', { required: true })} 
                    readOnly={isBlockMode}
                    className={isBlockMode ? 'bg-muted' : ''}
                  />
                </div>
              </div>

              {!isBlockMode && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="patient_dob">Fecha de nacimiento</Label>
                      <Input id="patient_dob" type="date" {...register('patient_dob')} />
                    </div>
                    <div>
                      <Label htmlFor="patient_phone">Teléfono</Label>
                      <Input id="patient_phone" {...register('patient_phone')} />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="patient_address">Dirección</Label>
                    <Input id="patient_address" {...register('patient_address')} />
                  </div>

                  <div>
                    <Label htmlFor="patient_occupation">Ocupación</Label>
                    <Input id="patient_occupation" {...register('patient_occupation')} placeholder="Ej: Ingeniero, Docente, Estudiante" />
                  </div>

                  <div>
                  <Label htmlFor="patient_email">Email</Label>
                    <Input id="patient_email" type="email" {...register('patient_email')} />
                  </div>
                </>
              )}
            </>
          )}

          {/* Detalles de la cita - Se muestran SIEMPRE (con o sin paciente seleccionado) */}
          {!isBlockMode && (
            <div className="flex items-end gap-4">
              <div className="w-1/2">
                <Label htmlFor="type">Tipo de consulta *</Label>
                <Select value={watch('type')} onValueChange={(value) => setValue('type', value as AppointmentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPOINTMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2 pb-2">
                <Checkbox 
                  id="is_courtesy" 
                  checked={watch('is_courtesy')}
                  onCheckedChange={(checked) => setValue('is_courtesy', checked as boolean)}
                />
                <Label htmlFor="is_courtesy" className="cursor-pointer">Cortesía</Label>
              </div>
            </div>
          )}

          {selectedType === 'post_operado' && (
            <div>
              <Label htmlFor="post_op_type">Tipo de post operado</Label>
              <Input id="post_op_type" {...register('post_op_type')} placeholder="Ej: Catarata, LASIK, etc." />
            </div>
          )}

          {isBlockMode ? (
            // Layout especial para modo bloqueo: grid 2x2
            <div className="grid grid-cols-2 gap-4">
              {/* Fila 1, Col 1: Fecha inicio */}
              <div>
                <Label>Fecha inicio *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedDate, 'PPP', { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(date);
                          setValue('date', date);
                          // Si no hay fecha fin, establecerla igual a inicio
                          if (!selectedEndDate) {
                            setSelectedEndDate(date);
                            setValue('end_date', date);
                          }
                        }
                      }}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Fila 1, Col 2: Hora inicio */}
              <div>
                <Label htmlFor="time">Hora inicio *</Label>
                <Select value={watch('time')} onValueChange={(value) => setValue('time', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_SLOTS.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fila 2, Col 1: Fecha fin */}
              <div>
                <Label>Fecha fin *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedEndDate ? format(selectedEndDate, 'PPP', { locale: es }) : 'Seleccionar fecha fin'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedEndDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedEndDate(date);
                          setValue('end_date', date);
                        }
                      }}
                      disabled={(date) => date < selectedDate}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Fila 2, Col 2: Hora fin */}
              <div>
                <Label htmlFor="end_time">Hora fin *</Label>
                <Select value={watch('end_time') || ''} onValueChange={(value) => setValue('end_time', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar hora de fin" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_SLOTS.filter(slot => {
                      const selectedStartTime = watch('time');
                      if (!selectedStartTime) return true;
                      
                      const [startHour, startMin] = selectedStartTime.split(':').map(Number);
                      const [slotHour, slotMin] = slot.split(':').map(Number);
                      
                      const startMinutes = startHour * 60 + startMin;
                      const slotMinutes = slotHour * 60 + slotMin;
                      
                      return slotMinutes > startMinutes;
                    }).map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            // Layout normal para citas (sin cambios)
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedDate, 'PPP', { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(date);
                          setValue('date', date);
                        }
                      }}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="time">Hora *</Label>
                <Select value={watch('time')} onValueChange={(value) => setValue('time', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_SLOTS.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!isBlockMode && selectedType !== 'estudio' && (
            <div className="space-y-2">
              <Label htmlFor="doctor_id">Doctor *</Label>
              {(selectedType === 'cirugia' || selectedType === 'procedimiento') ? (
                <>
                  <Select 
                    value={isExternalDoctor ? 'external' : watch('doctor_id')} 
                    onValueChange={(value) => {
                      if (value === 'external') {
                        setIsExternalDoctor(true);
                        setValue('doctor_id', '');
                      } else {
                        setIsExternalDoctor(false);
                        setValue('doctor_id', value);
                        setValue('external_doctor_name', '');
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar doctor" />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map((doctor) => (
                        <SelectItem key={doctor.user_id} value={doctor.user_id}>
                          {doctor.full_name}
                        </SelectItem>
                      ))}
                      <SelectItem value="external" className="border-t mt-1 pt-1 text-orange-600">
                        🏥 Doctor Externo (Alquiler de Sala)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {isExternalDoctor && (
                    <div>
                      <Label htmlFor="external_doctor_name">Nombre del Doctor Externo *</Label>
                      <Input 
                        {...register('external_doctor_name')} 
                        placeholder="Ej: Dr. Juan Pérez" 
                        className="mt-1"
                      />
                    </div>
                  )}
                </>
              ) : (
                <Select value={watch('doctor_id')} onValueChange={(value) => setValue('doctor_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((doctor) => (
                      <SelectItem key={doctor.user_id} value={doctor.user_id}>
                        {doctor.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {isBlockMode && (
            <div>
              <Label htmlFor="doctor_id">Doctor *</Label>
              <Select value={watch('doctor_id')} onValueChange={(value) => setValue('doctor_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((doctor) => (
                    <SelectItem key={doctor.user_id} value={doctor.user_id}>
                      {doctor.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isBlockMode && selectedType !== 'estudio' && (
            <div>
              <Label htmlFor="reason">{selectedType === 'cirugia' ? 'Tipo de cirugía' : selectedType === 'procedimiento' ? 'Tipo de procedimiento' : 'Motivo de consulta'}</Label>
              <Textarea id="reason" {...register('reason')} rows={2} placeholder={selectedType === 'cirugia' ? 'Ej: Catarata' : selectedType === 'procedimiento' ? 'Ej: Inyección intravítrea' : ''} />
            </div>
          )}

          {isBlockMode && (
            <div>
              <Label htmlFor="reason">Razón del bloqueo</Label>
              <Textarea id="reason" {...register('reason')} rows={2} placeholder="Ej: Reunión administrativa, Almuerzo, etc." />
            </div>
          )}

          {!isBlockMode && selectedType === 'estudio' && (
            <div>
              <Label htmlFor="reason">Tipo de estudio</Label>
              <Textarea id="reason" {...register('reason')} rows={2} placeholder="Ej: Tomografía de coherencia óptica" />
            </div>
          )}

          {/* OCULTO: Selector de sala - No se utiliza actualmente
          {!isBlockMode && (
            <div>
              <Label htmlFor="room_id">Sala</Label>
              <Select value={watch('room_id')} onValueChange={(value) => setValue('room_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sala" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          */}

          {/* Campos de preconsulta - Solo mostrar si NO es cirugía, procedimiento o estudio Y NO es block mode */}
          {!isBlockMode && selectedType !== 'cirugia' && selectedType !== 'procedimiento' && selectedType !== 'estudio' && (
          <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <Label className="font-semibold">Autorefractómetro</Label>
              
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">OD</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input 
                    {...register('autorefractor_od_esfera')} 
                    placeholder="Esfera"
                    className="text-sm"
                  />
                  <Input 
                    {...register('autorefractor_od_cilindro')} 
                    placeholder="Cilindro"
                    className="text-sm"
                  />
                  <Input 
                    value={watch('autorefractor_od_eje') || ''}
                    onChange={(e) => validateAxisInput(
                      e.target.value,
                      'Autorefractómetro OD',
                      (val) => setValue('autorefractor_od_eje', val)
                    )}
                    placeholder="Eje (0-180)"
                    className="text-sm"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">OS</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input 
                    {...register('autorefractor_os_esfera')} 
                    placeholder="Esfera"
                    className="text-sm"
                  />
                  <Input 
                    {...register('autorefractor_os_cilindro')} 
                    placeholder="Cilindro"
                    className="text-sm"
                  />
                  <Input 
                    value={watch('autorefractor_os_eje') || ''}
                    onChange={(e) => validateAxisInput(
                      e.target.value,
                      'Autorefractómetro OS',
                      (val) => setValue('autorefractor_os_eje', val)
                    )}
                    placeholder="Eje (0-180)"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="font-semibold">Lensometría</Label>
              
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">OD</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input 
                    {...register('lensometry_od_esfera')} 
                    placeholder="Esfera"
                    className="text-sm"
                  />
                  <Input 
                    {...register('lensometry_od_cilindro')} 
                    placeholder="Cilindro"
                    className="text-sm"
                  />
                  <Input 
                    value={watch('lensometry_od_eje') || ''}
                    onChange={(e) => validateAxisInput(
                      e.target.value,
                      'Lensometría OD',
                      (val) => setValue('lensometry_od_eje', val)
                    )}
                    placeholder="Eje (0-180)"
                    className="text-sm"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">OS</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input 
                    {...register('lensometry_os_esfera')} 
                    placeholder="Esfera"
                    className="text-sm"
                  />
                  <Input 
                    {...register('lensometry_os_cilindro')} 
                    placeholder="Cilindro"
                    className="text-sm"
                  />
                  <Input 
                    value={watch('lensometry_os_eje') || ''}
                    onChange={(e) => validateAxisInput(
                      e.target.value,
                      'Lensometría OS',
                      (val) => setValue('lensometry_os_eje', val)
                    )}
                    placeholder="Eje (0-180)"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <Label className="font-semibold">Queratometrías</Label>
              
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">OD</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input 
                    {...register('keratometry_od_k1')} 
                    placeholder="K1"
                    className="text-sm"
                  />
                  <Input 
                    {...register('keratometry_od_k2')} 
                    placeholder="K2"
                    className="text-sm"
                  />
                  <Input 
                    value={watch('keratometry_od_axis') || ''}
                    onChange={(e) => validateAxisInput(
                      e.target.value,
                      'Queratometría OD',
                      (val) => setValue('keratometry_od_axis', val)
                    )}
                    placeholder="Eje (0-180)"
                    className="text-sm"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">OS</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input 
                    {...register('keratometry_os_k1')} 
                    placeholder="K1"
                    className="text-sm"
                  />
                  <Input 
                    {...register('keratometry_os_k2')} 
                    placeholder="K2"
                    className="text-sm"
                  />
                  <Input 
                    value={watch('keratometry_os_axis') || ''}
                    onChange={(e) => validateAxisInput(
                      e.target.value,
                      'Queratometría OS',
                      (val) => setValue('keratometry_os_axis', val)
                    )}
                    placeholder="Eje (0-180)"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="font-semibold">PIO (Presión Intraocular)</Label>
              
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">OD</Label>
                <Input 
                  {...register('pio_od')} 
                  placeholder="mmHg"
                  type="number"
                  step="0.1"
                  className="text-sm"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">OS</Label>
                <Input 
                  {...register('pio_os')} 
                  placeholder="mmHg"
                  type="number"
                  step="0.1"
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="photo_od">Foto Ojo Derecho (OD)</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('photo_od')?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  {photoOD ? photoOD.name : 'Subir'}
                </Button>
                <input
                  id="photo_od"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setPhotoOD(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="photo_oi">Foto Ojo Izquierdo (OI)</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('photo_oi')?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  {photoOI ? photoOI.name : 'Subir'}
                </Button>
                <input
                  id="photo_oi"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setPhotoOI(e.target.files?.[0] || null)}
                />
              </div>
            </div>
          </div>
          </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? 'Guardando...' : appointment ? 'Actualizar' : 'Crear Cita'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <DuplicatePatientDialog
        open={duplicateDialogOpen}
        onClose={() => {
          setDuplicateDialogOpen(false);
          setDuplicatePatients([]);
          setPendingPatientData(null);
          setUploading(false);
        }}
        duplicates={duplicatePatients}
        newPatientData={{
          first_name: pendingPatientData?.patient_first_name || '',
          last_name: pendingPatientData?.patient_last_name || '',
          dob: pendingPatientData?.patient_dob,
          phone: pendingPatientData?.patient_phone,
        }}
        onSelectExisting={(patient) => {
          setDuplicateDialogOpen(false);
          setSelectedPatientId(patient.id);
          setValue('patient_code', patient.code || '');
          setValue('patient_first_name', patient.first_name);
          setValue('patient_last_name', patient.last_name);
          setValue('patient_dob', patient.dob || '');
          setValue('patient_address', patient.address || '');
          setValue('patient_phone', patient.phone || '');
          setValue('patient_email', patient.email || '');
          setShowPatientForm(false);
          
          // Continuar con la creación de la cita usando el paciente existente
          if (pendingPatientData) {
            createOrUpdateAppointment(pendingPatientData, patient.id);
          }
          
          setDuplicatePatients([]);
          setPendingPatientData(null);
        }}
        onCreateNew={() => {
          setDuplicateDialogOpen(false);
          
          // Crear el nuevo paciente de todas formas
          if (pendingPatientData) {
            createOrUpdateAppointment(pendingPatientData);
          }
          
          setDuplicatePatients([]);
          setPendingPatientData(null);
        }}
      />
    </Dialog>
  );
}
