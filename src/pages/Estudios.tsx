import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Upload, X, FileImage, Video, Loader2, FileText, MapPin, CheckCircle2, Search, Plus, UserRound } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { differenceInYears } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { compressImages } from '@/lib/imageCompression';
import { PdfThumbnail } from '@/components/pdf/PdfThumbnail';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';

type SavedFile = {
  id: string;
  file_path: string;
  mime_type: string | null;
  signedUrl?: string;
};

export default function Estudios() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [eyeSide, setEyeSide] = useState<'OD' | 'OI' | 'OU'>('OU');
  const [comments, setComments] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [savedFiles, setSavedFiles] = useState<SavedFile[]>([]);
  const [existingStudyId, setExistingStudyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadingFile, setCurrentUploadingFile] = useState<string>('');
  const [fileToDelete, setFileToDelete] = useState<{ id: string; path: string } | null>(null);

  // Médico referidor
  const [referringDoctorId, setReferringDoctorId] = useState<string | null>(null);
  const [referringDoctorSearch, setReferringDoctorSearch] = useState('');
  const [referringDoctorOpen, setReferringDoctorOpen] = useState(false);

  // Cargar estudio existente
  const { data: existingStudy, isLoading } = useQuery({
    queryKey: ['study', appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('studies')
        .select('*, study_files(*)')
        .eq('appointment_id', appointmentId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  // Cargar información de la cita y el paciente
  const { data: appointment } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patient:patients(*)')
        .eq('id', appointmentId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!appointmentId,
  });

  // Cargar médicos referidores (externos + doctores internos del sistema)
  const { data: referringDoctors = [] } = useQuery({
    queryKey: ['referring_doctors_combined'],
    queryFn: async () => {
      // 1. Obtener médicos externos de referring_doctors
      const { data: externalDoctors, error: extError } = await supabase
        .from('referring_doctors')
        .select('*')
        .eq('active', true)
        .order('name');

      if (extError) throw extError;

      // 2. Obtener doctores internos del sistema (profiles con rol doctor)
      const { data: doctorRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'doctor');

      if (rolesError) throw rolesError;

      // Obtener los profiles de los doctores
      const doctorUserIds = (doctorRoles || []).map(r => r.user_id);
      let internalDoctors: any[] = [];

      if (doctorUserIds.length > 0) {
        const { data: profiles, error: profError } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', doctorUserIds);

        if (profError) throw profError;
        internalDoctors = profiles || [];
      }

      // 3. Combinar ambas listas
      const externals = (externalDoctors || []).map(d => ({
        id: d.id,
        name: d.name,
        is_internal: d.is_internal || false,
        internal_profile_id: d.internal_profile_id,
      }));

      // Mapear doctores internos al formato de referring_doctors
      const internals = (internalDoctors || []).map((d: any) => ({
        id: `internal_${d.user_id}`, // Prefijo para diferenciar
        name: d.full_name,
        is_internal: true,
        internal_profile_id: d.user_id,
      }));

      // Filtrar internos que ya están en referring_doctors para evitar duplicados
      const existingInternalIds = externals
        .filter(e => e.is_internal && e.internal_profile_id)
        .map(e => e.internal_profile_id);

      const uniqueInternals = internals.filter(
        (i: any) => !existingInternalIds.includes(i.internal_profile_id)
      );

      // Combinar: primero internos, luego externos
      return [...uniqueInternals, ...externals].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    },
  });

  // Filtrar médicos por búsqueda
  const filteredDoctors = useMemo(() => {
    if (!referringDoctorSearch.trim()) return referringDoctors;
    const search = referringDoctorSearch.toLowerCase();
    return referringDoctors.filter(d => d.name.toLowerCase().includes(search));
  }, [referringDoctors, referringDoctorSearch]);

  // Obtener el nombre del médico seleccionado
  const selectedDoctorName = useMemo(() => {
    if (!referringDoctorId) return null;
    const doctor = referringDoctors.find(d => d.id === referringDoctorId);
    return doctor?.name || null;
  }, [referringDoctorId, referringDoctors]);

  // Mutation para crear nuevo médico referidor externo
  const createReferringDoctorMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('referring_doctors')
        .insert({ name, is_internal: false })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['referring_doctors_combined'] });
      setReferringDoctorId(data.id);
      setReferringDoctorOpen(false);
      setReferringDoctorSearch('');
      toast.success(`Médico "${data.name}" agregado`);
    },
    onError: (error: any) => {
      toast.error('Error al agregar médico: ' + error.message);
    },
  });

  // Función para seleccionar un doctor (maneja internos y externos)
  const handleSelectDoctor = async (doctor: any) => {
    // Si es un doctor interno (con prefijo internal_), crear registro en referring_doctors
    if (doctor.id.startsWith('internal_')) {
      // Verificar si ya existe en referring_doctors
      const { data: existing } = await supabase
        .from('referring_doctors')
        .select('id')
        .eq('internal_profile_id', doctor.internal_profile_id)
        .single();

      if (existing) {
        setReferringDoctorId(existing.id);
      } else {
        // Crear nuevo registro para el doctor interno
        const { data: newDoc, error } = await supabase
          .from('referring_doctors')
          .insert({
            name: doctor.name,
            is_internal: true,
            internal_profile_id: doctor.internal_profile_id,
          })
          .select()
          .single();

        if (error) {
          toast.error('Error al registrar médico interno');
          return;
        }
        setReferringDoctorId(newDoc.id);
        queryClient.invalidateQueries({ queryKey: ['referring_doctors_combined'] });
      }
    } else {
      // Es un médico externo, usar directamente el ID
      setReferringDoctorId(doctor.id);
    }
    setReferringDoctorOpen(false);
    setReferringDoctorSearch('');
  };

  const patient = appointment?.patient;

  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    return differenceInYears(new Date(), new Date(dob));
  };

  const getAppointmentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      consulta: 'Consulta',
      reconsulta: 'Reconsulta',
      cirugia: 'Cirugía',
      procedimiento: 'Procedimiento',
      nueva_consulta: 'Primera Vez',
      estudio: 'Estudio',
    };
    return labels[type] || type;
  };

  const getAppointmentTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      consulta: 'bg-consulta text-foreground',
      reconsulta: 'bg-reconsulta-corta text-foreground',
      cirugia: 'bg-cirugia text-foreground',
      procedimiento: 'bg-procedimiento text-foreground',
      nueva_consulta: 'bg-consulta text-foreground',
      estudio: 'bg-estudio text-foreground',
    };
    return colors[type] || 'bg-primary text-primary-foreground';
  };

  // Cargar datos del estudio existente y generar URLs firmadas
  useEffect(() => {
    const loadStudyData = async () => {
      if (existingStudy) {
        setTitle(existingStudy.title);
        setEyeSide(existingStudy.eye_side as 'OD' | 'OI' | 'OU');
        setComments(existingStudy.comments || '');
        setExistingStudyId(existingStudy.id);
        setReferringDoctorId(existingStudy.referring_doctor_id || null);

        // Generar URLs firmadas para cada archivo
        const filesWithUrls = await Promise.all(
          (existingStudy.study_files || []).map(async (file: any) => {
            const signedUrl = await getFileUrl(file.file_path);
            return { ...file, signedUrl };
          })
        );
        setSavedFiles(filesWithUrls);
      }
    };

    loadStudyData();
  }, [existingStudy]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    
    if (selectedFiles.length > 0) {
      // Mostrar toast de procesamiento
      const imageFiles = selectedFiles.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        toast.info('Comprimiendo imágenes...', { duration: 2000 });
      }

      try {
        // Comprimir las imágenes
        const processedFiles = await compressImages(selectedFiles);
        
        setFiles((prev) => [...prev, ...processedFiles]);
        
        // Calcular ahorro de espacio
        const originalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
        const compressedSize = processedFiles.reduce((sum, f) => sum + f.size, 0);
        const savedMB = ((originalSize - compressedSize) / (1024 * 1024)).toFixed(2);
        
        if (imageFiles.length > 0 && originalSize > compressedSize) {
          toast.success(
            `${selectedFiles.length} archivo${selectedFiles.length > 1 ? 's' : ''} listo${selectedFiles.length > 1 ? 's' : ''} (Ahorrados: ${savedMB}MB)`
          );
        } else {
          toast.success(
            `${selectedFiles.length} archivo${selectedFiles.length > 1 ? 's' : ''} seleccionado${selectedFiles.length > 1 ? 's' : ''}`
          );
        }
        
        // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
        event.target.value = '';
      } catch (error) {
        console.error('Error al procesar archivos:', error);
        toast.error('Error al procesar algunos archivos');
      }
    } else {
      toast.error('No se seleccionaron archivos');
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (studyId: string) => {
    const uploadedFiles = [];
    const totalFiles = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentUploadingFile(file.name);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${studyId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${studyId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('studies')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      uploadedFiles.push({
        file_path: filePath,
        mime_type: file.type,
      });

      // Actualizar progreso
      const progress = Math.round(((i + 1) / totalFiles) * 100);
      setUploadProgress(progress);
    }

    return uploadedFiles;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      setUploadProgress(0);
      setCurrentUploadingFile('');

      let studyId = existingStudyId;

      if (existingStudyId) {
        // Actualizar estudio existente
        const { error: updateError } = await supabase
          .from('studies')
          .update({
            title,
            eye_side: eyeSide as any,
            comments: comments || null,
            referring_doctor_id: referringDoctorId,
          })
          .eq('id', existingStudyId);

        if (updateError) throw updateError;
      } else {
        // Crear nuevo estudio
        const { data: appointment, error: aptError } = await supabase
          .from('appointments')
          .select('patient_id')
          .eq('id', appointmentId)
          .single();

        if (aptError) throw aptError;
        if (!appointment) throw new Error('Cita no encontrada');

        const { data: study, error: studyError } = await supabase
          .from('studies')
          .insert({
            appointment_id: appointmentId,
            patient_id: appointment.patient_id,
            title,
            eye_side: eyeSide as any,
            comments: comments || null,
            referring_doctor_id: referringDoctorId,
          } as any)
          .select()
          .single();

        if (studyError) throw studyError;
        if (!study) throw new Error('Error al crear estudio');
        studyId = study.id;
      }

      // Subir nuevos archivos
      if (files.length > 0 && studyId) {
        const uploadedFiles = await uploadFiles(studyId);

        // Guardar referencias de archivos
        const { error: filesError } = await supabase
          .from('study_files')
          .insert(
            uploadedFiles.map((file) => ({
              study_id: studyId,
              ...file,
            }))
          );

        if (filesError) throw filesError;
      }

      // Marcar la cita como completada
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({ status: 'done' as any })
        .eq('id', appointmentId);

      if (appointmentError) {
        console.error('Error al actualizar estado de cita:', appointmentError);
        // No lanzamos error aquí para no bloquear el guardado del estudio
      }

      return studyId;
    },
    onSuccess: () => {
      toast.success('Estudio guardado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['studies'] });
      queryClient.invalidateQueries({ queryKey: ['study', appointmentId] });
      navigate('/dashboard');
    },
    onError: (error: any) => {
      console.error('Error al guardar estudio:', error);
      toast.error(error.message || 'Error al guardar el estudio');
    },
    onSettled: () => {
      setUploading(false);
      setUploadProgress(0);
      setCurrentUploadingFile('');
    },
  });

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('El título del estudio es requerido');
      return;
    }
    saveMutation.mutate();
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('video/')) {
      return <Video className="h-8 w-8 text-primary" />;
    }
    if (file.type === 'application/pdf') {
      return <FileText className="h-8 w-8 text-primary" />;
    }
    return <FileImage className="h-8 w-8 text-primary" />;
  };

  const getFileUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('studies')
      .createSignedUrl(filePath, 3600); // URL válida por 1 hora
    
    if (error) {
      console.error('Error getting signed URL:', error);
      return '';
    }
    return data.signedUrl;
  };

  const removeSavedFile = async (fileId: string, filePath: string) => {
    try {
      // Eliminar de la base de datos
      const { error: dbError } = await supabase
        .from('study_files')
        .delete()
        .eq('id', fileId);

      if (dbError) throw dbError;

      // Eliminar del storage
      const { error: storageError } = await supabase.storage
        .from('studies')
        .remove([filePath]);

      if (storageError) throw storageError;

      // Actualizar estado local
      setSavedFiles((prev) => prev.filter((f) => f.id !== fileId));
      
      // Invalidar el query para recargar la data
      queryClient.invalidateQueries({ queryKey: ['study', appointmentId] });
      
      toast.success('Archivo eliminado permanentemente');
    } catch (error: any) {
      console.error('Error al eliminar archivo:', error);
      toast.error('Error al eliminar archivo: ' + (error.message || 'Error desconocido'));
    }
  };

  const confirmDelete = () => {
    if (fileToDelete) {
      removeSavedFile(fileToDelete.id, fileToDelete.path);
      setFileToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const patientAge = calculateAge(patient?.dob || null);
  const appointmentType = appointment?.type;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="mt-1"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-semibold">
                      {patient?.first_name} {patient?.last_name}
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
                  </div>
                  {patient?.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{patient.address}</span>
                    </div>
                  )}
                  {appointment?.starts_at && (
                    <p className="text-sm text-muted-foreground">
                      Fecha de cita: {new Date(appointment.starts_at).toLocaleDateString('es-ES', { 
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
              onClick={handleSave}
              disabled={uploading}
              className="gap-2 mt-1"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Guardar
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Indicador de progreso de subida */}
      {uploading && files.length > 0 && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Subiendo archivos...
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progreso</span>
                  <span className="font-semibold">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
              
              {currentUploadingFile && (
                <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
                  <Upload className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Subiendo:</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {currentUploadingFile}
                    </p>
                  </div>
                </div>
              )}

              {uploadProgress === 100 && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Archivos subidos correctamente
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content */}
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Información del Estudio */}
        <Card>
          <CardHeader>
            <CardTitle>Información del Estudio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Título de estudio *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Tomografía de coherencia óptica"
              />
            </div>

            <div>
              <Label htmlFor="eyeSide">Ojo</Label>
              <Select
                value={eyeSide}
                onValueChange={(value: 'OD' | 'OI' | 'OU') => setEyeSide(value)}
              >
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

            {/* Médico que Refiere */}
            <div>
              <Label>Médico que Refiere</Label>
              <Popover open={referringDoctorOpen} onOpenChange={setReferringDoctorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={referringDoctorOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedDoctorName ? (
                      <span className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        {selectedDoctorName}
                        {referringDoctors.find(d => d.id === referringDoctorId)?.is_internal && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">interno</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        Buscar o agregar médico...
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar médico..."
                      value={referringDoctorSearch}
                      onValueChange={setReferringDoctorSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {referringDoctorSearch.trim() ? (
                          <div className="py-2 px-2">
                            <p className="text-sm text-muted-foreground mb-2">No se encontró "{referringDoctorSearch}"</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full gap-2"
                              onClick={() => createReferringDoctorMutation.mutate(referringDoctorSearch.trim())}
                              disabled={createReferringDoctorMutation.isPending}
                            >
                              <Plus className="h-4 w-4" />
                              Agregar "{referringDoctorSearch.trim()}"
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Escribe para buscar</p>
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredDoctors.map((doctor) => (
                          <CommandItem
                            key={doctor.id}
                            value={doctor.id}
                            onSelect={() => handleSelectDoctor(doctor)}
                          >
                            <UserRound className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>{doctor.name}</span>
                            {doctor.is_internal && (
                              <span className="ml-auto text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">interno</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {referringDoctorSearch.trim() && filteredDoctors.length > 0 && (
                        <>
                          <CommandSeparator />
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => createReferringDoctorMutation.mutate(referringDoctorSearch.trim())}
                              disabled={createReferringDoctorMutation.isPending}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Agregar "{referringDoctorSearch.trim()}" como nuevo
                            </CommandItem>
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {referringDoctorId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setReferringDoctorId(null)}
                >
                  <X className="h-3 w-3 mr-1" />
                  Quitar médico
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Imágenes y Videos */}
        <Card>
          <CardHeader>
            <CardTitle>Imágenes y Videos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label
                htmlFor="file-upload"
                className="flex items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click para seleccionar archivos
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Imágenes, videos y PDFs (múltiples archivos)
                  </span>
                </div>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  accept="image/*,video/*,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </Label>
            </div>

            {/* Archivos guardados previamente */}
            {savedFiles.length > 0 && (
              <div>
                <Label className="mb-3 block">Archivos guardados</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {savedFiles.map((savedFile) => (
                    <div
                      key={savedFile.id}
                      className="relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow group"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 hover:bg-destructive"
                        onClick={() => setFileToDelete({ id: savedFile.id, path: savedFile.file_path })}
                      >
                        <X className="h-4 w-4 text-white" />
                      </Button>
                      {savedFile.mime_type?.startsWith('image/') ? (
                        <img
                          src={savedFile.signedUrl || ''}
                          alt="Estudio"
                          className="w-full h-32 object-cover"
                        />
                      ) : savedFile.mime_type?.startsWith('video/') ? (
                        <div className="relative w-full h-32 bg-muted flex items-center justify-center">
                          <Video className="h-12 w-12 text-muted-foreground" />
                          <video
                            src={savedFile.signedUrl || ''}
                            className="absolute inset-0 w-full h-full object-cover opacity-50"
                          />
                        </div>
                      ) : savedFile.mime_type === 'application/pdf' ? (
                        <PdfThumbnail
                          src={savedFile.signedUrl || ''}
                          className="w-full h-32"
                        />
                      ) : (
                        <div className="w-full h-32 bg-muted flex items-center justify-center">
                          <FileImage className="h-12 w-12 text-muted-foreground" />
                        </div>
                      )}
                      <div className="p-2 bg-card">
                        <span className="text-xs text-center truncate block">
                          {savedFile.file_path.split('/').pop()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Archivos nuevos seleccionados */}
            {files.length > 0 && (
              <div>
                <Label className="mb-3 block">Nuevos archivos a subir</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="relative border rounded-lg p-3 flex flex-col items-center gap-2 hover:bg-accent/50 transition-colors"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      {getFileIcon(file)}
                      <span className="text-xs text-center truncate w-full">
                        {file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comentarios */}
        <Card>
          <CardHeader>
            <CardTitle>Comentarios</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Observaciones, hallazgos, recomendaciones..."
              rows={6}
            />
          </CardContent>
        </Card>

        {/* Botón de Guardar abajo */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            disabled={uploading}
            size="lg"
            className="gap-2"
          >
            <Save className="h-5 w-5" />
            {uploading ? 'Guardando...' : 'Guardar Estudio'}
          </Button>
        </div>
      </div>

      {/* Diálogo de confirmación para eliminar archivo */}
      <AlertDialog open={fileToDelete !== null} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar archivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El archivo será eliminado permanentemente de la base de datos y del almacenamiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
