import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Calendar, User, Trash2, Eye, Pencil, Save, X, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ConsultationViewDialog } from './ConsultationViewDialog';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { isTauri, getPatients as getPatientsTauri } from '@/lib/dataSource';
import { invoke } from '@tauri-apps/api/core';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  code?: string;
  dob?: string;
  phone?: string;
  email?: string;
  address?: string;
  occupation?: string;
}

interface Appointment {
  id: string;
  starts_at: string;
  ends_at: string;
  type: string;
  status: string;
  reason?: string;
  is_courtesy?: boolean;
  doctor?: {
    full_name: string;
  };
  encounter_id?: string;
  invoice_amount?: number;
  invoice_status?: string;
  branch_id?: string;
  branch_name?: string;
}

interface PatientsListDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectAppointment: (appointment: any) => void;
}

export function PatientsListDialog({ open, onClose, onSelectAppointment }: PatientsListDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [deletePatientId, setDeletePatientId] = useState<string | null>(null);
  const [showFirstWarning, setShowFirstWarning] = useState(false);
  const [showSecondWarning, setShowSecondWarning] = useState(false);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [viewPatientDetailsId, setViewPatientDetailsId] = useState<string | null>(null);
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [editedPatient, setEditedPatient] = useState<Patient | null>(null);
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const { connectionMode } = useNetworkStatus();

  const { data: patients = [], isLoading: loadingPatients } = useQuery({
    queryKey: ['patients-list', searchTerm, connectionMode],
    queryFn: async () => {
      // En modo local (PostgreSQL) o offline, usar Tauri commands
      if ((connectionMode === 'local' || connectionMode === 'offline') && isTauri()) {
        console.log('[PatientsListDialog] Loading from PostgreSQL/SQLite');
        const results = await getPatientsTauri(searchTerm || undefined, 100);
        return results as Patient[];
      }

      // En modo supabase (cloud)
      let query = supabase
        .from('patients')
        .select('*');

      if (searchTerm) {
        query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }

      query = query.order('last_name', { ascending: true }).limit(5000);

      const { data, error } = await query;
      if (error) throw error;

      return data as Patient[];
    },
    enabled: open,
  });

  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  const { data: appointments = [], isLoading: loadingAppointments } = useQuery({
    queryKey: ['patient-appointments', selectedPatientId, connectionMode],
    queryFn: async () => {
      if (!selectedPatientId) return [];

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[PatientsListDialog] Loading appointments from PostgreSQL/SQLite');

        // Get appointments for patient
        const appointmentsData = await invoke<any[]>('get_appointments', {
          branchId: null,
          startDate: null,
          endDate: null
        });

        // Filter by patient
        const patientAppointments = appointmentsData
          .filter(a => a.patient_id === selectedPatientId)
          .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

        if (patientAppointments.length === 0) return [];

        // Get doctors
        const doctors = await invoke<any[]>('get_doctors', {});
        const doctorsMap: Record<string, { full_name: string }> = {};
        doctors.forEach(d => {
          doctorsMap[d.user_id] = { full_name: d.full_name };
        });

        // Get encounters for appointments
        const encountersMap: Record<string, string> = {};
        for (const apt of patientAppointments) {
          try {
            const encounter = await invoke<any>('get_encounter_by_appointment', {
              appointmentId: apt.id
            });
            if (encounter) {
              encountersMap[apt.id] = encounter.id;
            }
          } catch {
            // No encounter for this appointment
          }
        }

        // Get invoices for appointments
        const invoicesMap: Record<string, { total_amount: number; status: string }> = {};
        for (const apt of patientAppointments) {
          try {
            const invoice = await invoke<any>('get_invoice_by_appointment', {
              appointmentId: apt.id
            });
            if (invoice) {
              invoicesMap[apt.id] = {
                total_amount: invoice.total_amount,
                status: invoice.status
              };
            }
          } catch {
            // No invoice for this appointment
          }
        }

        // Get branches
        const branches = await invoke<any[]>('get_branches');
        const branchesMap: Record<string, string> = {};
        branches.forEach(b => {
          branchesMap[b.id] = b.name;
        });

        // Combine data
        return patientAppointments.map(apt => ({
          ...apt,
          doctor: apt.doctor_id ? doctorsMap[apt.doctor_id] : undefined,
          encounter_id: encountersMap[apt.id],
          invoice_amount: invoicesMap[apt.id]?.total_amount,
          invoice_status: invoicesMap[apt.id]?.status,
          branch_name: apt.branch_id ? branchesMap[apt.branch_id] : undefined
        })) as Appointment[];
      }

      // En modo supabase (cloud)
      // First get appointments
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', selectedPatientId)
        .order('starts_at', { ascending: false });

      if (appointmentsError) throw appointmentsError;
      if (!appointmentsData) return [];

      // Get unique doctor IDs
      const doctorIds = [...new Set(appointmentsData.map(a => a.doctor_id).filter(Boolean))];

      // Fetch doctor profiles
      let doctorsMap: Record<string, { full_name: string }> = {};
      if (doctorIds.length > 0) {
        const { data: doctorsData } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', doctorIds);

        if (doctorsData) {
          doctorsMap = doctorsData.reduce((acc, d) => ({
            ...acc,
            [d.user_id]: { full_name: d.full_name }
          }), {});
        }
      }

      // Get encounters for these appointments
      const appointmentIds = appointmentsData.map(a => a.id);
      let encountersMap: Record<string, string> = {};
      if (appointmentIds.length > 0) {
        const { data: encountersData } = await supabase
          .from('encounters')
          .select('id, appointment_id')
          .in('appointment_id', appointmentIds);

        if (encountersData) {
          encountersMap = encountersData.reduce((acc, e) => ({
            ...acc,
            [e.appointment_id!]: e.id
          }), {});
        }
      }

      // Get invoices for these appointments
      let invoicesMap: Record<string, { total_amount: number; status: string }> = {};
      if (appointmentIds.length > 0) {
        const { data: invoicesData } = await supabase
          .from('invoices')
          .select('appointment_id, total_amount, status')
          .in('appointment_id', appointmentIds);

        if (invoicesData) {
          invoicesMap = invoicesData.reduce((acc, inv) => ({
            ...acc,
            [inv.appointment_id!]: {
              total_amount: inv.total_amount,
              status: inv.status
            }
          }), {});
        }
      }

      // Get branches for displaying sede
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id, name');

      const branchesMap: Record<string, string> = branchesData?.reduce((acc, b) => ({
        ...acc,
        [b.id]: b.name
      }), {} as Record<string, string>) || {};

      // Combine data
      return appointmentsData.map(apt => ({
        ...apt,
        doctor: apt.doctor_id ? doctorsMap[apt.doctor_id] : undefined,
        encounter_id: encountersMap[apt.id],
        invoice_amount: invoicesMap[apt.id]?.total_amount,
        invoice_status: invoicesMap[apt.id]?.status,
        branch_name: apt.branch_id ? branchesMap[apt.branch_id] : undefined
      })) as Appointment[];
    },
    enabled: !!selectedPatientId,
  });

  const typeLabels: Record<string, string> = {
    nueva_consulta: 'Nueva consulta',
    reconsulta_menos_3m: 'Reconsulta - 3 meses',
    reconsulta_mas_3m: 'Reconsulta + 3 meses',
    post_operado: 'Post operado',
    lectura_resultados: 'Lectura de resultados',
    procedimiento: 'Procedimiento',
    cirugia: 'Cirugía',
    estudio: 'Estudio',
  };

  const typeColors: Record<string, string> = {
    nueva_consulta: 'bg-consulta text-foreground',
    reconsulta_menos_3m: 'bg-reconsulta-corta text-foreground',
    reconsulta_mas_3m: 'bg-reconsulta-larga text-foreground',
    post_operado: 'bg-post-operado text-foreground',
    lectura_resultados: 'bg-lectura text-foreground',
    procedimiento: 'bg-procedimiento text-foreground',
    cirugia: 'bg-cirugia text-foreground',
    estudio: 'bg-estudio text-foreground',
  };

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-500',
    checked_in: 'bg-yellow-500',
    in_progress: 'bg-green-500',
    done: 'bg-gray-500',
    cancelled: 'bg-red-500',
  };

  const handleDeleteClick = (patientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Only admins can delete patients
    if (!hasRole('admin')) {
      toast({
        title: 'Acceso denegado',
        description: 'Solo los administradores pueden eliminar pacientes.',
        variant: 'destructive',
      });
      return;
    }
    
    setDeletePatientId(patientId);
    setShowFirstWarning(true);
  };

  const handleFirstWarningConfirm = () => {
    setShowFirstWarning(false);
    setShowSecondWarning(true);
  };

  const handleFinalDelete = async () => {
    if (!deletePatientId) return;

    try {
      // En modo local, usar Tauri command
      if (isLocalMode) {
        // El CASCADE en PostgreSQL local eliminará registros relacionados
        // Los archivos locales se mantendrán (no se puede eliminar de SMB fácilmente)
        await invoke('delete_patient', { id: deletePatientId });

        toast({
          title: 'Paciente eliminado',
          description: 'El paciente y sus registros han sido eliminados.',
        });

        queryClient.invalidateQueries({ queryKey: ['patients-list'] });

        if (selectedPatientId === deletePatientId) {
          setSelectedPatientId(null);
        }

        setShowSecondWarning(false);
        setDeletePatientId(null);
        return;
      }

      // Modo Supabase
      // 1. Get all encounters for this patient first
      const { data: encounters } = await supabase
        .from('encounters')
        .select('id')
        .eq('patient_id', deletePatientId);

      const encounterIds = encounters?.map(e => e.id) || [];
      const filePaths: string[] = [];

      // Get documents from encounters
      if (encounterIds.length > 0) {
        const { data: documents } = await supabase
          .from('documents')
          .select('file_path')
          .in('encounter_id', encounterIds);

        if (documents) filePaths.push(...documents.map(d => d.file_path));

        // Get orders from encounters
        const { data: orders } = await supabase
          .from('orders')
          .select('id')
          .in('encounter_id', encounterIds);

        const orderIds = orders?.map(o => o.id) || [];

        // Get results files from orders
        if (orderIds.length > 0) {
          const { data: results } = await supabase
            .from('results')
            .select('file_path')
            .in('order_id', orderIds);

          if (results) filePaths.push(...results.map(r => r.file_path));
        }
      }

      // Get study files directly from patient
      const { data: studies } = await supabase
        .from('studies')
        .select('id')
        .eq('patient_id', deletePatientId);

      const studyIds = studies?.map(s => s.id) || [];

      if (studyIds.length > 0) {
        const { data: studyFiles } = await supabase
          .from('study_files')
          .select('file_path')
          .in('study_id', studyIds);

        if (studyFiles) filePaths.push(...studyFiles.map(sf => sf.file_path));
      }

      // 2. Delete all files from storage
      for (const filePath of filePaths) {
        try {
          // Extract bucket and path from the file_path
          const bucket = filePath.split('/')[0];
          const path = filePath.substring(bucket.length + 1);

          await supabase.storage
            .from(bucket)
            .remove([path]);
        } catch (storageError) {
          console.error('Error deleting file:', filePath, storageError);
        }
      }

      // 3. Delete patient (cascade will handle all related records)
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', deletePatientId);

      if (error) throw error;

      toast({
        title: 'Paciente eliminado',
        description: `Se eliminó el paciente y ${filePaths.length} archivo(s) relacionado(s).`,
      });

      // Refresh the patients list
      queryClient.invalidateQueries({ queryKey: ['patients-list'] });

      // Clear selection if deleted patient was selected
      if (selectedPatientId === deletePatientId) {
        setSelectedPatientId(null);
      }
    } catch (error) {
      console.error('Error deleting patient:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el paciente.',
        variant: 'destructive',
      });
    } finally {
      setShowSecondWarning(false);
      setDeletePatientId(null);
    }
  };

  const handleEditPatient = () => {
    const patient = patients.find(p => p.id === viewPatientDetailsId);
    if (patient) {
      setEditedPatient({ ...patient });
      setIsEditingPatient(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingPatient(false);
    setEditedPatient(null);
  };

  const handleSavePatient = async () => {
    if (!editedPatient || !viewPatientDetailsId) return;

    try {
      // En modo local, usar Tauri command
      if (isLocalMode) {
        await invoke('update_patient', {
          id: viewPatientDetailsId,
          patient: {
            first_name: editedPatient.first_name,
            last_name: editedPatient.last_name,
            code: editedPatient.code,
            dob: editedPatient.dob,
            phone: editedPatient.phone,
            email: editedPatient.email,
            address: editedPatient.address,
            occupation: editedPatient.occupation,
          }
        });

        toast({
          title: 'Paciente actualizado',
          description: 'Los datos del paciente se han guardado correctamente.',
        });

        queryClient.invalidateQueries({ queryKey: ['patients-list'] });
        queryClient.invalidateQueries({ queryKey: ['patients-search'] });

        setIsEditingPatient(false);
        setEditedPatient(null);
        return;
      }

      // Modo Supabase
      const { error } = await supabase
        .from('patients')
        .update({
          first_name: editedPatient.first_name,
          last_name: editedPatient.last_name,
          code: editedPatient.code,
          dob: editedPatient.dob,
          phone: editedPatient.phone,
          email: editedPatient.email,
          address: editedPatient.address,
          occupation: editedPatient.occupation,
        })
        .eq('id', viewPatientDetailsId);

      if (error) throw error;

      toast({
        title: 'Paciente actualizado',
        description: 'Los datos del paciente se han guardado correctamente.',
      });

      // Refresh patients list
      queryClient.invalidateQueries({ queryKey: ['patients-list'] });
      queryClient.invalidateQueries({ queryKey: ['patients-search'] });

      setIsEditingPatient(false);
      setEditedPatient(null);
    } catch (error: any) {
      console.error('Error updating patient:', error);

      // Detectar si es un error de autenticación/sesión expirada
      const isAuthError = error?.message?.includes('refresh') ||
                          error?.message?.includes('token') ||
                          error?.code === 'refresh_token_not_found' ||
                          error?.__isAuthError;

      if (isAuthError) {
        toast({
          title: 'Sesión expirada',
          description: 'Tu sesión ha expirado. Por favor, recarga la página e inicia sesión nuevamente.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error al actualizar paciente',
          description: error?.message || 'No se pudo actualizar el paciente. Intenta de nuevo.',
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Buscar Pacientes</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 h-[calc(90vh-12rem)]">
          {/* Lista de Pacientes */}
          <div className="w-1/2 flex flex-col">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, apellido o ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <ScrollArea className="flex-1 max-h-[calc(90vh-14rem)]">
              <div className="space-y-2 pr-4">
                {loadingPatients ? (
                  <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                ) : patients.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No se encontraron pacientes
                  </div>
                ) : (
                  patients.map((patient) => (
                    <Card
                      key={patient.id}
                      className={`cursor-pointer transition-colors hover:bg-accent ${
                        selectedPatientId === patient.id ? 'border-primary' : ''
                      }`}
                      onClick={() => setSelectedPatientId(patient.id)}
                    >
                      <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="font-medium">
                                {patient.first_name} {patient.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {patient.code && <>ID: {patient.code}</>}
                                {patient.code && patient.dob && ' - '}
                                {patient.dob && <span className="font-bold">{Math.floor((new Date().getTime() - new Date(patient.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} años</span>}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewPatientDetailsId(patient.id);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {hasRole('admin') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => handleDeleteClick(patient.id, e)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <Separator orientation="vertical" />

          {/* Historial de Consultas */}
          <div className="w-1/2 flex flex-col">
            {selectedPatientId ? (
              <>
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Historial de Consultas
                </h3>
                <ScrollArea className="flex-1 max-h-[calc(90vh-14rem)]">
                  <div className="space-y-3 pr-4">
                    {loadingAppointments ? (
                      <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                    ) : appointments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No hay consultas registradas
                      </div>
                    ) : (
                      appointments.map((appointment) => {
                        const hasEncounter = !!appointment.encounter_id;
                        const isDone = appointment.status === 'done';
                        const canViewEncounter = hasEncounter || isDone;
                        
                        return (
                          <Card
                            key={appointment.id}
                            className="cursor-pointer hover:bg-accent transition-colors"
                            onClick={() => {
                              if (isDone || canViewEncounter) {
                                // Para citas done o con encounter, abrir modal de consulta
                                setSelectedEncounterId(appointment.encounter_id || null);
                                setSelectedAppointmentId(appointment.id);
                              } else {
                                onSelectAppointment(appointment);
                                onClose();
                              }
                            }}
                          >
                            <CardHeader className="p-4 pb-2">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium">
                                    {format(new Date(appointment.starts_at), "d 'de' MMMM, yyyy", { locale: es })}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(appointment.starts_at), 'HH:mm', { locale: es })} -{' '}
                                    {format(new Date(appointment.ends_at), 'HH:mm', { locale: es })}
                                  </p>
                                  {appointment.branch_name && (
                                    <p className="text-xs text-primary font-medium mt-0.5">
                                      📍 {appointment.branch_name}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {canViewEncounter && (
                                    <Badge variant="outline" className="gap-1">
                                      <Eye className="h-3 w-3" />
                                      {hasEncounter ? 'Ver consulta' : 'Sin datos'}
                                    </Badge>
                                  )}
                                  <Badge
                                    className={`${statusColors[appointment.status] || 'bg-gray-500'} text-white`}
                                  >
                                    {appointment.status}
                                  </Badge>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-2">
                              <div className="flex items-start gap-2 mb-1">
                                <span className="text-sm font-medium">Tipo:</span>
                                <Badge className={typeColors[appointment.type] || 'bg-gray-600 text-white'}>
                                  {typeLabels[appointment.type] || appointment.type}
                                </Badge>
                                {appointment.is_courtesy && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 h-5 bg-purple-100 text-purple-700 border-purple-300">
                                    <Gift className="h-3 w-3 mr-0.5" />
                                    Cortesía
                                  </Badge>
                                )}
                              </div>
                              {appointment.doctor && (
                                <p className="text-sm mb-1">
                                  <span className="font-medium">Doctor:</span> {appointment.doctor.full_name}
                                </p>
                              )}
                              {/* Mostrar monto facturado */}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm font-medium">Facturado:</span>
                                {appointment.invoice_amount ? (
                                  <span className="text-sm text-green-600 font-medium">
                                    GTQ {appointment.invoice_amount.toLocaleString('es-GT', {
                                      minimumFractionDigits: 2
                                    })}
                                  </span>
                                ) : appointment.is_courtesy ? (
                                  <span className="text-sm text-purple-600">Cortesía</span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">Sin facturar</span>
                                )}
                              </div>
                              {appointment.reason && (
                                <p className="text-sm text-muted-foreground mt-2">
                                  {appointment.reason}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Selecciona un paciente para ver su historial
              </div>
            )}
          </div>
        </div>

        {/* Patient Details Dialog */}
        {viewPatientDetailsId && (
          <Dialog open={!!viewPatientDetailsId} onOpenChange={() => {
            setViewPatientDetailsId(null);
            setIsEditingPatient(false);
            setEditedPatient(null);
          }}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle>Datos del Paciente</DialogTitle>
                  {!isEditingPatient && (hasRole('admin') || hasRole('reception')) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleEditPatient}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </DialogHeader>
              {(() => {
                const patient = patients.find(p => p.id === viewPatientDetailsId);
                if (!patient) return null;
                
                const displayPatient = isEditingPatient ? editedPatient : patient;
                if (!displayPatient) return null;

                return (
                  <div className="space-y-4">
                    {/* Primera fila: ID */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">ID</label>
                      {isEditingPatient ? (
                        <Input
                          value={displayPatient.code || ''}
                          onChange={(e) => setEditedPatient({ ...displayPatient, code: e.target.value })}
                          className="mt-1"
                        />
                      ) : (
                        <p className="text-base">{displayPatient.code || '-'}</p>
                      )}
                    </div>

                    {/* Grid de 2 columnas para los demás campos */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Nombre</label>
                        {isEditingPatient ? (
                          <Input
                            value={displayPatient.first_name}
                            onChange={(e) => setEditedPatient({ ...displayPatient, first_name: e.target.value })}
                            className="mt-1"
                          />
                        ) : (
                          <p className="text-base">{displayPatient.first_name}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Apellido</label>
                        {isEditingPatient ? (
                          <Input
                            value={displayPatient.last_name}
                            onChange={(e) => setEditedPatient({ ...displayPatient, last_name: e.target.value })}
                            className="mt-1"
                          />
                        ) : (
                          <p className="text-base">{displayPatient.last_name}</p>
                        )}
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Fecha de nacimiento</label>
                        {isEditingPatient ? (
                          <Input
                            type="date"
                            value={displayPatient.dob || ''}
                            onChange={(e) => setEditedPatient({ ...displayPatient, dob: e.target.value })}
                            className="mt-1"
                          />
                        ) : (
                          <p className="text-base">
                            {displayPatient.dob 
                              ? format(new Date(displayPatient.dob), "d 'de' MMMM, yyyy", { locale: es })
                              : '-'
                            }
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Teléfono</label>
                        {isEditingPatient ? (
                          <Input
                            value={displayPatient.phone || ''}
                            onChange={(e) => setEditedPatient({ ...displayPatient, phone: e.target.value })}
                            className="mt-1"
                          />
                        ) : (
                          <p className="text-base">{displayPatient.phone || '-'}</p>
                        )}
                      </div>
                    </div>

                    {/* Campos de ancho completo */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Dirección</label>
                      {isEditingPatient ? (
                        <Input
                          value={displayPatient.address || ''}
                          onChange={(e) => setEditedPatient({ ...displayPatient, address: e.target.value })}
                          className="mt-1"
                        />
                      ) : (
                        <p className="text-base">{displayPatient.address || '-'}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Ocupación</label>
                      {isEditingPatient ? (
                        <Input
                          value={displayPatient.occupation || ''}
                          onChange={(e) => setEditedPatient({ ...displayPatient, occupation: e.target.value })}
                          className="mt-1"
                          placeholder="Ej: INGENIERO, DOCENTE, ESTUDIANTE"
                        />
                      ) : (
                        <p className="text-base">{displayPatient.occupation || '-'}</p>
                      )}
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      {isEditingPatient ? (
                        <Input
                          type="email"
                          value={displayPatient.email || ''}
                          onChange={(e) => setEditedPatient({ ...displayPatient, email: e.target.value })}
                          className="mt-1"
                        />
                      ) : (
                        <p className="text-base">{displayPatient.email || '-'}</p>
                      )}
                    </div>

                    {isEditingPatient && (
                      <div className="flex gap-2 pt-4">
                        <Button onClick={handleSavePatient} className="flex-1">
                          <Save className="h-4 w-4 mr-2" />
                          Guardar
                        </Button>
                        <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
                          <X className="h-4 w-4 mr-2" />
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>
        )}

        {/* Consultation View Modal */}
        <ConsultationViewDialog
          encounterId={selectedEncounterId}
          open={!!selectedEncounterId}
          onClose={() => setSelectedEncounterId(null)}
        />

        {/* First Warning Dialog */}
        <AlertDialog open={showFirstWarning} onOpenChange={setShowFirstWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Está seguro que desea borrar este paciente?</AlertDialogTitle>
              <AlertDialogDescription>
                Se borrará <strong>permanentemente</strong> toda la información del paciente:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Historial de citas y consultas</li>
                  <li>Estudios y archivos adjuntos</li>
                  <li>Diagnósticos y tratamientos</li>
                  <li>Facturas y pagos</li>
                  <li>Documentos y prescripciones</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleFirstWarningConfirm} className="bg-destructive hover:bg-destructive/90">
                Continuar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Second Warning Dialog */}
        <AlertDialog open={showSecondWarning} onOpenChange={setShowSecondWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>⚠️ ÚLTIMA ADVERTENCIA - Esta acción NO se puede deshacer</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p className="font-semibold text-destructive">
                  Una vez eliminado, no podrá recuperar ninguna información del paciente.
                </p>
                <p>
                  Esto incluye todos los registros médicos, archivos, y datos financieros asociados.
                </p>
                <p className="font-medium">
                  ¿Está COMPLETAMENTE seguro de que desea continuar?
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>No, cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleFinalDelete} className="bg-destructive hover:bg-destructive/90">
                Sí, borrar permanentemente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      {/* Nested Consultation View Dialog */}
      <ConsultationViewDialog
        encounterId={selectedEncounterId}
        appointmentId={selectedAppointmentId}
        open={!!selectedEncounterId || !!selectedAppointmentId}
        onClose={() => {
          setSelectedEncounterId(null);
          setSelectedAppointmentId(null);
        }}
      />
      </DialogContent>
    </Dialog>
  );
}
