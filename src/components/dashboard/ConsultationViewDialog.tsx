import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { ConsultationView } from './views/ConsultationView';
import { ReconsultaView } from './views/ReconsultaView';
import { SurgeryView } from './views/SurgeryView';
import { ProcedureView } from './views/ProcedureView';
import { StudyView } from './views/StudyView';
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { invoke } from "@tauri-apps/api/core";

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
  patient?: {
    first_name: string;
    last_name: string;
  };
}

interface AppointmentLocal {
  id: string;
  type: string;
  patient_id: string;
  doctor_id: string | null;
  starts_at: string;
  patient?: {
    first_name: string;
    last_name: string;
  };
}

interface InvoiceBasic {
  id: string;
}
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ConsultationViewDialogProps {
  encounterId: string | null;
  appointmentId?: string | null;
  open: boolean;
  onClose: () => void;
}

export function ConsultationViewDialog({
  encounterId,
  appointmentId,
  open,
  onClose,
}: ConsultationViewDialogProps) {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { connectionMode } = useNetworkStatus();
  const isAdmin = hasRole('admin');
  const [isDeleting, setIsDeleting] = useState(false);

  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  // Si no hay encounterId pero sí appointmentId, buscar encounter por appointment
  const { data: foundEncounter } = useQuery({
    queryKey: ['find-encounter-by-appointment', appointmentId, connectionMode],
    queryFn: async () => {
      if (!appointmentId) return null;

      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[ConsultationViewDialog] Getting encounter by appointment from PostgreSQL local');
        const data = await invoke<EncounterLocal | null>('get_encounter_by_appointment', {
          appointmentId: appointmentId,
        });
        return data ? { id: data.id } : null;
      }

      // Modo Supabase
      const { data } = await supabase
        .from('encounters')
        .select('id')
        .eq('appointment_id', appointmentId)
        .maybeSingle();

      return data;
    },
    enabled: !encounterId && !!appointmentId && open,
  });

  const effectiveEncounterId = encounterId || foundEncounter?.id || null;

  const { data: appointmentData, isLoading } = useQuery({
    queryKey: ['consultation-appointment-type', effectiveEncounterId, appointmentId, connectionMode],
    queryFn: async () => {
      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[ConsultationViewDialog] Getting appointment data from PostgreSQL local');

        // Si tenemos encounterId, usarlo directamente
        if (effectiveEncounterId) {
          const encounter = await invoke<EncounterLocal | null>('get_encounter_by_id', {
            encounterId: effectiveEncounterId,
          });

          if (!encounter) throw new Error('Encounter not found');

          if (encounter.appointment_id) {
            // Buscar el appointment desde appointments cacheados
            const appointments = await invoke<AppointmentLocal[]>('get_appointments', {
              startDate: null,
              endDate: null,
              branchId: null,
            });
            const appointment = appointments.find(a => a.id === encounter.appointment_id);

            return {
              type: appointment?.type || 'consulta',
              patient: encounter.patient,
              appointmentId: encounter.appointment_id
            };
          }

          return {
            type: 'consulta',
            patient: encounter.patient,
            appointmentId: encounter.appointment_id
          };
        }

        // Si solo tenemos appointmentId (sin encounter), obtener info básica
        if (appointmentId) {
          const appointments = await invoke<AppointmentLocal[]>('get_appointments', {
            startDate: null,
            endDate: null,
            branchId: null,
          });
          const appointment = appointments.find(a => a.id === appointmentId);

          if (!appointment) throw new Error('Appointment not found');

          // Get patient data
          const patient = await invoke<{ first_name: string; last_name: string } | null>('get_patient_by_id', {
            patientId: appointment.patient_id,
          });

          return {
            type: appointment.type,
            patient: patient,
            appointmentId: appointmentId,
            patientId: appointment.patient_id,
            doctorId: appointment.doctor_id,
            startsAt: appointment.starts_at
          };
        }

        return null;
      }

      // Modo Supabase
      // Si tenemos encounterId, usarlo directamente
      if (effectiveEncounterId) {
        const { data: encounter, error: encError } = await supabase
          .from('encounters')
          .select('appointment_id, patient:patients(first_name, last_name)')
          .eq('id', effectiveEncounterId)
          .single();

        if (encError) throw encError;

        if (encounter.appointment_id) {
          const { data: appointment } = await supabase
            .from('appointments')
            .select('type')
            .eq('id', encounter.appointment_id)
            .maybeSingle();

          return {
            type: appointment?.type || 'consulta',
            patient: encounter.patient,
            appointmentId: encounter.appointment_id
          };
        }

        return {
          type: 'consulta',
          patient: encounter.patient,
          appointmentId: encounter.appointment_id
        };
      }

      // Si solo tenemos appointmentId (sin encounter), obtener info básica
      if (appointmentId) {
        const { data: appointment, error: aptError } = await supabase
          .from('appointments')
          .select('type, patient_id, doctor_id, starts_at, patients(first_name, last_name)')
          .eq('id', appointmentId)
          .single();

        if (aptError) throw aptError;

        return {
          type: appointment.type,
          patient: appointment.patients,
          appointmentId: appointmentId,
          patientId: appointment.patient_id,
          doctorId: appointment.doctor_id,
          startsAt: appointment.starts_at
        };
      }

      return null;
    },
    enabled: (!!effectiveEncounterId || !!appointmentId) && open,
  });

  const handleCreateEncounter = async () => {
    if (!appointmentId || !appointmentData) return;

    const encounterTypeMap: Record<string, string> = {
      'nueva_consulta': 'consulta',
      'consulta': 'consulta',
      'reconsulta_menos_3m': 'consulta',
      'reconsulta_mas_3m': 'consulta',
      'post_operado': 'posop',
      'cirugia': 'quirurgico',
      'procedimiento': 'consulta',
      'estudio': 'consulta',
      'lectura_resultados': 'consulta'
    };

    const encounterType = encounterTypeMap[appointmentData.type] || 'consulta';

    try {
      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[ConsultationViewDialog] Creating encounter via PostgreSQL local');
        const newEncounter = await invoke<EncounterLocal>('create_encounter', {
          encounter: {
            patient_id: appointmentData.patientId,
            type: encounterType,
            doctor_id: appointmentData.doctorId || null,
            appointment_id: appointmentId,
          }
        });

        if (newEncounter) {
          const route = getEditRoute(appointmentData.type, newEncounter.id, appointmentId);
          onClose();
          navigate(route);
        }
        return;
      }

      // Modo Supabase
      const { data: newEncounter, error } = await supabase
        .from('encounters')
        .insert([{
          patient_id: appointmentData.patientId,
          type: encounterType as 'consulta' | 'posop' | 'quirurgico' | 'urgencia',
          doctor_id: appointmentData.doctorId,
          appointment_id: appointmentId,
          date: appointmentData.startsAt,
        }])
        .select()
        .single();

      if (!error && newEncounter) {
        const route = getEditRoute(appointmentData.type, newEncounter.id, appointmentId);
        onClose();
        navigate(route);
      }
    } catch (error: any) {
      console.error('Error creating encounter:', error);
      toast.error('Error al crear registro clínico: ' + (error.message || 'Error desconocido'));
    }
  };

  const getAppointmentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      nueva_consulta: 'Nueva consulta',
      consulta: 'Consulta',
      reconsulta_menos_3m: 'Reconsulta - 3m',
      reconsulta_mas_3m: 'Reconsulta + 3m',
      post_operado: 'Post operado',
      lectura_resultados: 'Lectura resultados',
      estudio: 'Estudio',
      cirugia: 'Cirugía',
      procedimiento: 'Procedimiento',
    };
    return labels[type] || type;
  };

  const getAppointmentTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      nueva_consulta: 'bg-consulta text-foreground',
      consulta: 'bg-consulta text-foreground',
      reconsulta_menos_3m: 'bg-reconsulta-corta text-foreground',
      reconsulta_mas_3m: 'bg-reconsulta-larga text-foreground',
      post_operado: 'bg-post-operado text-foreground',
      lectura_resultados: 'bg-lectura text-foreground',
      estudio: 'bg-primary/20 text-primary-foreground',
      cirugia: 'bg-cirugia text-foreground',
      procedimiento: 'bg-procedimiento text-foreground',
    };
    return colors[type] || 'bg-primary text-primary-foreground';
  };

  // Normalize appointment type to view component type
  const normalizeType = (type: string): string => {
    if (type === 'nueva_consulta' || type === 'consulta') return 'consulta';
    if (type === 'reconsulta_menos_3m' || type === 'reconsulta_mas_3m') return 'reconsulta';
    if (type === 'cirugia') return 'cirugia';
    if (type === 'procedimiento') return 'procedimiento';
    if (type === 'lectura_resultados' || type === 'estudio') return 'estudio';
    return 'consulta'; // default
  };

  const getEditRoute = (type: string, encounterId: string, appointmentId?: string | null): string => {
    // Estudios usa appointmentId en lugar de encounterId
    if (type === 'estudio' || type === 'lectura_resultados') {
      return `/estudios/${appointmentId}`;
    }
    
    switch (type) {
      case 'nueva_consulta':
      case 'post_operado':
        return `/consultation/${encounterId}`;
      case 'reconsulta_menos_3m':
      case 'reconsulta_mas_3m':
        return `/reconsulta/${encounterId}`;
      case 'cirugia':
        return `/surgery/${encounterId}`;
      case 'procedimiento':
        return `/procedimiento/${encounterId}`;
      default:
        return `/consultation/${encounterId}`;
    }
  };

  const handleEdit = () => {
    if (!appointmentData || !encounterId) return;
    
    const route = getEditRoute(appointmentData.type, encounterId, appointmentData.appointmentId);
    onClose();
    navigate(route);
  };

  const handleDelete = async () => {
    const aptId = appointmentData?.appointmentId || appointmentId;
    if (!aptId) return;

    setIsDeleting(true);
    try {
      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[ConsultationViewDialog] Deleting appointment via PostgreSQL local');

        // 1. Verificar si hay factura asociada
        const invoice = await invoke<InvoiceBasic | null>('get_invoice_by_appointment', {
          appointmentId: aptId,
        });

        if (invoice) {
          toast.error('No se puede eliminar: esta cita tiene una factura asociada');
          setIsDeleting(false);
          return;
        }

        // 2. Eliminar la cita (el backend eliminará el encounter en cascada o lo manejará)
        await invoke('delete_appointment', {
          appointmentId: aptId,
        });

        // 3. Invalidar cache para refrescar lista
        queryClient.invalidateQueries({ queryKey: ['patient-appointments'] });
        queryClient.invalidateQueries({ queryKey: ['appointments'] });

        toast.success('Cita y registro clínico eliminados correctamente');
        onClose();
        return;
      }

      // Modo Supabase
      // 1. Verificar si hay factura asociada
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('appointment_id', aptId)
        .maybeSingle();

      if (invoice) {
        toast.error('No se puede eliminar: esta cita tiene una factura asociada');
        setIsDeleting(false);
        return;
      }

      // 2. Eliminar encounter si existe
      if (effectiveEncounterId) {
        const { error: encError } = await supabase
          .from('encounters')
          .delete()
          .eq('id', effectiveEncounterId);

        if (encError) {
          console.error('Error eliminando encounter:', encError);
          toast.error('Error al eliminar el registro clínico: ' + encError.message);
          setIsDeleting(false);
          return;
        }
      }

      // 3. Eliminar la cita
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', aptId);

      if (error) throw error;

      // 4. Invalidar cache para refrescar lista
      queryClient.invalidateQueries({ queryKey: ['patient-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });

      toast.success('Cita y registro clínico eliminados correctamente');
      onClose();
    } catch (error: any) {
      console.error('Error al eliminar:', error);
      toast.error('Error al eliminar: ' + (error.message || 'Error desconocido'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              {appointmentData?.patient && (
                <>
                  <span>
                    {appointmentData.patient.first_name}{' '}
                    {appointmentData.patient.last_name}
                  </span>
                  {appointmentData.type && (
                    <Badge className={getAppointmentTypeColor(appointmentData.type)}>
                      {getAppointmentTypeLabel(appointmentData.type)}
                    </Badge>
                  )}
                </>
              )}
            </div>
            
            {isAdmin && appointmentData && (
              <div className="flex items-center gap-2">
                {encounterId && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleEdit}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                )}
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar esta cita?</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p>Esta acción eliminará permanentemente:</p>
                        <ul className="list-disc list-inside text-sm">
                          <li>La cita del historial del paciente</li>
                          <li>El registro clínico (si existe)</li>
                          <li>Datos de examen, diagnósticos, documentos asociados</li>
                        </ul>
                        <p className="font-medium text-destructive">
                          Si la cita tiene una factura asociada, no podrá eliminarse.
                        </p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !appointmentData ? (
          <div className="text-center py-8 text-muted-foreground">
            No se encontraron datos de la consulta
          </div>
        ) : !effectiveEncounterId && (appointmentData.type === 'estudio' || appointmentData.type === 'lectura_resultados') ? (
          <ScrollArea className="max-h-[calc(90vh-10rem)] pr-4">
            <div className="pb-4">
              <StudyView appointmentId={appointmentData.appointmentId} />
            </div>
          </ScrollArea>
        ) : !effectiveEncounterId ? (
          <div className="p-6 text-center space-y-4">
            <p className="text-muted-foreground">
              Esta cita fue marcada como atendida pero no tiene datos clínicos registrados.
            </p>
            {(isAdmin || hasRole('doctor')) && (
              <Button onClick={handleCreateEncounter}>
                Crear registro clínico
              </Button>
            )}
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(90vh-10rem)] pr-4">
            <div className="pb-4">
              {normalizeType(appointmentData.type) === 'consulta' && <ConsultationView encounterId={effectiveEncounterId!} />}
              {normalizeType(appointmentData.type) === 'reconsulta' && <ReconsultaView encounterId={effectiveEncounterId!} />}
              {normalizeType(appointmentData.type) === 'cirugia' && <SurgeryView encounterId={effectiveEncounterId!} />}
              {normalizeType(appointmentData.type) === 'procedimiento' && <ProcedureView encounterId={effectiveEncounterId!} />}
              {normalizeType(appointmentData.type) === 'estudio' && <StudyView appointmentId={appointmentData.appointmentId} />}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
