import { useState, useEffect } from 'react';
import { Appointment } from '@/types/database';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, differenceInYears } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Clock, MapPin, User, FileText, UserCheck, Trash2, DollarSign, Armchair, StickyNote } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppointmentDialog } from './AppointmentDialog';

interface AppointmentDrawerProps {
  appointment: Appointment | null;
  open: boolean;
  onClose: () => void;
}

export function AppointmentDrawer({ appointment, open, onClose }: AppointmentDrawerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasRole, roles } = useAuth();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [hasEncounter, setHasEncounter] = useState(false);
  const [encounterId, setEncounterId] = useState<string | null>(null);

  // Check if appointment has invoice
  const { data: invoice } = useQuery({
    queryKey: ['appointment-invoice-detail', appointment?.id],
    queryFn: async () => {
      if (!appointment) return null;
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('appointment_id', appointment.id)
        .maybeSingle();
      return data;
    },
    enabled: !!appointment && !appointment.is_courtesy && open,
  });

  const canInvoice = roles.some(r => r === 'admin' || r === 'caja');

  useEffect(() => {
    if (appointment && open) {
      checkExistingEncounter();
    }
  }, [appointment, open]);

  const checkExistingEncounter = async () => {
    if (!appointment) return;
    
    // CRÍTICO: Buscar encounter vinculado específicamente a ESTE appointment
    const { data: encounters } = await supabase
      .from('encounters')
      .select('id')
      .eq('appointment_id', appointment.id)
      .limit(1);

    setHasEncounter(encounters && encounters.length > 0);
    setEncounterId(encounters && encounters.length > 0 ? encounters[0].id : null);
  };

  if (!appointment) return null;

  const isReception = roles.includes('reception');
  const isDoctor = roles.includes('doctor');
  const isNurse = roles.includes('nurse');
  const isDiagnostico = roles.includes('diagnostico');
  const isAdmin = hasRole('admin');

  const handleCheckIn = async () => {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'checked_in' })
      .eq('id', appointment.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo registrar el check-in',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Check-in registrado',
        description: 'El paciente está en sala de espera',
      });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
      onClose();
    }
  };

  const handlePreconsultaReady = async () => {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'preconsulta_ready' })
      .eq('id', appointment.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo marcar la preconsulta como lista',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Preconsulta lista',
        description: 'El paciente está listo para atender',
      });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
      onClose();
    }
  };

  const handleMarkDone = async () => {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'done' })
      .eq('id', appointment.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo marcar como completada',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Cita completada',
        description: 'La cita ha sido marcada como completada',
      });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
      onClose();
    }
  };

  const handleOpenEncounter = async () => {
    // Si es estudio, ir directamente a la página de estudios
    if (appointment.type === 'estudio') {
      navigate(`/estudios/${appointment.id}`);
      onClose();
      return;
    }

    // CRÍTICO: Buscar encounter vinculado específicamente a ESTE appointment
    const { data: encounters } = await supabase
      .from('encounters')
      .select('id')
      .eq('appointment_id', appointment.id)
      .limit(1);

    // Determinar la ruta según el tipo de cita
    let route = '/consultation';
    if (['reconsulta_menos_3m', 'reconsulta_mas_3m', 'post_operado', 'lectura_resultados'].includes(appointment.type)) {
      route = '/reconsulta';
    } else if (appointment.type === 'cirugia') {
      route = '/surgery';
    } else if (appointment.type === 'procedimiento') {
      route = '/procedimiento';
    }

    // Map appointment type to encounter type
    let encounterType: 'consulta' | 'posop' | 'quirurgico' | 'urgencia' = 'consulta';
    if (appointment.type === 'post_operado') {
      encounterType = 'posop';
    } else if (appointment.type === 'cirugia' || appointment.type === 'procedimiento') {
      encounterType = 'quirurgico';
    }

    if (encounters && encounters.length > 0) {
      navigate(`${route}/${encounters[0].id}`);
    } else {
      // Create new encounter VINCULADO al appointment desde el inicio
      const { data: newEncounter, error } = await supabase
        .from('encounters')
        .insert([{
          patient_id: appointment.patient_id,
          type: encounterType,
          doctor_id: appointment.doctor_id,
          appointment_id: appointment.id, // CRÍTICO: Vincular desde el inicio
          date: appointment.starts_at, // Usar la fecha del appointment
        }])
        .select()
        .single();

      if (error) {
        toast({
          title: 'Error',
          description: 'No se pudo crear el encuentro',
          variant: 'destructive',
        });
      } else {
        navigate(`${route}/${newEncounter.id}`);
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Está seguro de que desea eliminar esta cita?')) {
      return;
    }

    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', appointment.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la cita',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Cita eliminada',
        description: 'La cita ha sido eliminada exitosamente',
      });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
      onClose();
    }
  };

  const handleReviewConsultation = async () => {
    if (!appointment) return;

    // CRÍTICO: Buscar encounter vinculado específicamente a ESTE appointment
    const { data: encounters, error } = await supabase
      .from('encounters')
      .select('id')
      .eq('appointment_id', appointment.id)
      .limit(1);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo buscar la consulta',
        variant: 'destructive',
      });
      return;
    }

    // Determinar la ruta según el tipo de cita
    let route = '/consultation';
    let encounterType: 'consulta' | 'posop' | 'quirurgico' | 'urgencia' = 'consulta';
    
    if (['reconsulta_menos_3m', 'reconsulta_mas_3m', 'post_operado', 'lectura_resultados'].includes(appointment.type)) {
      route = '/reconsulta';
    } else if (appointment.type === 'cirugia') {
      route = '/surgery';
      encounterType = 'quirurgico';
    } else if (appointment.type === 'procedimiento') {
      route = '/procedimiento';
      encounterType = 'quirurgico';
    }
    
    if (appointment.type === 'post_operado') {
      encounterType = 'posop';
    }

    if (encounters && encounters.length > 0) {
      // Si existe el encounter, navegar a él
      navigate(`${route}/${encounters[0].id}`);
      onClose();
    } else {
      // Si NO existe, crearlo automáticamente
      const { data: newEncounter, error: createError } = await supabase
        .from('encounters')
        .insert([{
          patient_id: appointment.patient_id,
          type: encounterType,
          doctor_id: appointment.doctor_id,
          appointment_id: appointment.id,
          date: appointment.starts_at,
        }])
        .select()
        .single();

      if (createError) {
        toast({
          title: 'Error',
          description: 'No se pudo crear el encuentro',
          variant: 'destructive',
        });
      } else {
        navigate(`${route}/${newEncounter.id}`);
        onClose();
      }
    }
  };

  const handleCancel = async () => {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointment.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cancelar la cita',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Cita cancelada',
        description: 'La cita ha sido cancelada',
      });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
      onClose();
    }
  };

  const typeColors: Record<string, string> = {
    nueva_consulta: 'bg-consulta text-foreground',
    reconsulta_menos_3m: 'bg-reconsulta-corta text-foreground',
    reconsulta_mas_3m: 'bg-reconsulta-larga text-foreground',
    post_operado: 'bg-post-operado text-foreground',
    lectura_resultados: 'bg-lectura text-foreground',
    procedimiento: 'bg-procedimiento text-foreground',
    cirugia: 'bg-cirugia text-foreground',
    consulta: 'bg-consulta text-foreground',
    estudio: 'bg-estudio text-foreground',
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Detalles de la Cita</SheetTitle>
          <SheetDescription>
            Información y acciones para la cita seleccionada
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="mt-6 space-y-6 pb-6">
            {/* Patient Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Paciente</span>
              </div>
              <h3 className="text-lg font-semibold">
                {appointment.patient?.first_name} {appointment.patient?.last_name}
              </h3>
              {appointment.patient?.dob && (
                <p className="text-sm text-muted-foreground">
                  {format(new Date(appointment.patient.dob), 'dd/MM/yyyy')}
                  {' · '}
                  {differenceInYears(new Date(), new Date(appointment.patient.dob))} años
                </p>
              )}
              {appointment.patient?.phone && (
                <p className="text-sm text-muted-foreground">{appointment.patient.phone}</p>
              )}
            </div>

            <Separator />

            {/* Reception Notes */}
            {appointment.reception_notes && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">Notas de Recepción</h3>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                    <p className="text-sm whitespace-pre-wrap text-foreground">
                      {appointment.reception_notes}
                    </p>
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Appointment Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {format(new Date(appointment.starts_at), "d 'de' MMMM, yyyy", { locale: es })}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {format(new Date(appointment.starts_at), 'HH:mm', { locale: es })}
                  {' - '}
                  {format(new Date(appointment.ends_at), 'HH:mm', { locale: es })}
                </span>
              </div>

              {appointment.room && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{appointment.room.name}</span>
                </div>
              )}

              {appointment.doctor && (
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{appointment.doctor.full_name}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Badge className={typeColors[appointment.type]}>
                  {appointment.type === 'cirugia' && appointment.reason 
                    ? `Cirugía - ${appointment.reason}`
                    : appointment.type === 'procedimiento' && appointment.reason
                    ? `Procedimiento - ${appointment.reason}`
                    : appointment.type === 'post_operado' && appointment.post_op_type
                    ? `Post operado - ${appointment.post_op_type}`
                    : appointment.type}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {appointment.status.replace('_', ' ')}
                </Badge>
              </div>

              {appointment.reason && appointment.type !== 'cirugia' && appointment.type !== 'procedimiento' && appointment.type !== 'post_operado' && (
                <div className="flex items-start gap-2 mt-4">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">Motivo</p>
                    <p className="text-sm">{appointment.reason}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="border-t pt-4 space-y-2 mt-4">
          {/* Actions */}
            {/* Botón de facturar - si está checked_in, preconsulta_ready o done, no es cortesía, no tiene factura y tiene permisos */}
            {['done', 'preconsulta_ready', 'checked_in'].includes(appointment.status) && !appointment.is_courtesy && !invoice && canInvoice && (
              <Button 
                onClick={() => {
                  navigate('/caja', { state: { appointmentId: appointment.id, patientId: appointment.patient_id } });
                  onClose();
                }}
                className="w-full bg-orange-600 hover:bg-orange-700"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Facturar
              </Button>
            )}

            {/* Mostrar info de factura si ya existe */}
            {appointment.status === 'done' && !appointment.is_courtesy && invoice && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="flex items-center gap-2 text-sm text-green-800">
                  <DollarSign className="h-4 w-4" />
                  <span className="font-medium">Facturado: {invoice.invoice_number}</span>
                </div>
              </div>
            )}

            {/* Botón Editar Cita - para reception o admin */}
            {(isReception || isAdmin) && (
              <Button onClick={() => setEditDialogOpen(true)} className="w-full">
                Editar Cita
              </Button>
            )}

            {/* Opciones de Doctor - para doctor, enfermería, diagnóstico O admin */}
            {(isDoctor || isNurse || isDiagnostico || isAdmin) && (
              <>
                {appointment.type === 'estudio' ? (
                  // Botón especial para estudios - solo "diagnostico" puede realizar
                  <Button 
                    onClick={() => {
                      if (roles.includes('diagnostico')) {
                        navigate(`/estudios/${appointment.id}`);
                      } else {
                        navigate(`/ver-estudios/${appointment.patient_id}`);
                      }
                      onClose();
                    }} 
                    className="w-full bg-estudio hover:bg-estudio/80"
                  >
                    {hasRole('diagnostico') && appointment.status !== 'done' ? 'Realizar Estudio' : 'Ver Estudio'}
                  </Button>
                ) : appointment.status === 'done' ? (
                  <Button 
                    onClick={handleReviewConsultation} 
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    Revisar Cita
                  </Button>
                ) : hasEncounter ? (
                  <Button onClick={handleOpenEncounter} className="w-full">
                    Editar Consulta
                  </Button>
                ) : (
                  <Button onClick={handleOpenEncounter} className="w-full bg-green-600 hover:bg-green-700">
                    Atender
                  </Button>
                )}
              </>
            )}
            
            {appointment.status === 'scheduled' && isReception && (
              <Button onClick={handleCheckIn} variant="outline" className="w-full">
                <Armchair className="h-4 w-4 mr-2" />
                Check-in
              </Button>
            )}
            
            {appointment.status === 'checked_in' && isReception && (
              <Button onClick={handlePreconsultaReady} className="w-full bg-green-600 hover:bg-green-700">
                <UserCheck className="h-4 w-4 mr-2" />
                Preconsulta Lista
              </Button>
            )}
            
            {(appointment.status === 'scheduled' || appointment.status === 'checked_in' || appointment.status === 'preconsulta_ready') && (
              <Button onClick={handleMarkDone} variant="outline" className="w-full">
                Marcar como Completada
              </Button>
            )}
            
            {appointment.status !== 'cancelled' && appointment.status !== 'done' && (!isDoctor || isAdmin) && (
              <Button onClick={handleCancel} variant="outline" className="w-full">
                Cancelar Cita
              </Button>
            )}
            
            {(!isDoctor || isAdmin) && (
              <Button onClick={handleDelete} variant="destructive" className="w-full">
                Eliminar Cita
              </Button>
            )}
        </div>
      </SheetContent>
      
      <AppointmentDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          onClose();
        }}
        appointment={appointment}
      />
    </Sheet>
  );
}
