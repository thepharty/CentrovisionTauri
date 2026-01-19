import { Appointment } from '@/types/database';
import { differenceInMinutes, addMinutes } from 'date-fns';
import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserCheck, Gift, Armchair, StickyNote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DraggableAppointmentBlockProps {
  appointment: Appointment;
  onClick: (appointment: Appointment) => void;
  onDoubleClick?: (appointment: Appointment) => void;
  onNoteClick?: (appointment: Appointment) => void;
}

const TYPE_COLORS: Record<string, string> = {
  nueva_consulta: 'border-l-consulta bg-consulta/10',
  reconsulta_menos_3m: 'border-l-reconsulta-corta bg-reconsulta-corta/10',
  reconsulta_mas_3m: 'border-l-reconsulta-larga bg-reconsulta-larga/10',
  post_operado: 'border-l-post-operado bg-post-operado/10',
  lectura_resultados: 'border-l-lectura bg-lectura/10',
  procedimiento: 'border-l-procedimiento bg-procedimiento/10',
  cirugia: 'border-l-cirugia bg-cirugia/10',
  consulta: 'border-l-consulta bg-consulta/10',
  estudio: 'border-l-estudio bg-estudio/10',
};

const TYPE_LABELS: Record<string, string> = {
  nueva_consulta: 'Nueva consulta',
  reconsulta_menos_3m: 'Reconsulta - 3 meses',
  reconsulta_mas_3m: 'Reconsulta + 3 meses',
  post_operado: 'Post operado',
  lectura_resultados: 'Lectura de resultados',
  procedimiento: 'Procedimiento',
  cirugia: 'Cirugía',
  consulta: 'Consulta',
  estudio: 'Estudio',
};

export function DraggableAppointmentBlock({ appointment, onClick, onDoubleClick, onNoteClick }: DraggableAppointmentBlockProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<'top' | 'bottom' | null>(null);
  const [tempHeight, setTempHeight] = useState<number | null>(null);
  const [committedHeight, setCommittedHeight] = useState<number | null>(null); // Mantiene el height después de soltar hasta que se actualice el appointment
  const resizeStartY = useRef<number>(0);
  const resizeStartTime = useRef<Date | null>(null);
  const queryClient = useQueryClient();

  // Calculate dynamic height based on appointment duration
  const duration = differenceInMinutes(
    new Date(appointment.ends_at),
    new Date(appointment.starts_at)
  );
  // Each slot = 60px per 15 minutes
  const heightInPx = (duration / 15) * 60;

  // Determinar qué height usar: tempHeight durante resize, committedHeight después de soltar, heightInPx cuando se actualiza
  const displayHeight = tempHeight !== null ? tempHeight : (committedHeight !== null ? committedHeight : heightInPx);

  // Limpiar committedHeight cuando el appointment se actualice (heightInPx cambia a coincidir)
  useEffect(() => {
    if (committedHeight !== null && Math.abs(heightInPx - committedHeight) < 1) {
      setCommittedHeight(null);
    }
  }, [heightInPx, committedHeight]);

  const updateMutation = useMutation({
    mutationFn: async ({ newStartTime, newEndTime }: { newStartTime?: Date; newEndTime?: Date }) => {
      const updates: any = {};
      
      if (newStartTime && newEndTime) {
        // Resizing from top (both times provided)
        updates.starts_at = newStartTime.toISOString();
        updates.ends_at = newEndTime.toISOString();
      } else if (newStartTime && !newEndTime) {
        // Moving the appointment (dragging)
        const duration = differenceInMinutes(
          new Date(appointment.ends_at),
          new Date(appointment.starts_at)
        );
        const calculatedEndTime = addMinutes(newStartTime, duration);
        updates.starts_at = newStartTime.toISOString();
        updates.ends_at = calculatedEndTime.toISOString();
      } else if (newEndTime && !newStartTime) {
        // Resizing from bottom
        updates.starts_at = appointment.starts_at;
        updates.ends_at = newEndTime.toISOString();
      }

      const { error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', appointment.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Usar refetch en lugar de invalidate para actualizar los datos sin desmontar el componente
      queryClient.refetchQueries({ queryKey: ['appointments'], exact: false });
      toast.success('Cita actualizada');
    },
    onError: (error: any) => {
      toast.error('Error al actualizar: ' + error.message);
    },
  });

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('appointmentId', appointment.id);
    e.dataTransfer.setData('currentTime', appointment.starts_at);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleResizeStart = (e: React.MouseEvent, direction: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeDirection(direction);
    resizeStartY.current = e.clientY;
    resizeStartTime.current = direction === 'top' 
      ? new Date(appointment.starts_at) 
      : new Date(appointment.ends_at);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeStartTime.current) return;

      const deltaY = moveEvent.clientY - resizeStartY.current;
      // 60px = 15 minutos, entonces 4px = 1 minuto
      const minutesChange = Math.round(deltaY / 4);
      const snappedMinutes = Math.round(minutesChange / 15) * 15;

      if (direction === 'bottom') {
        const newEndTime = addMinutes(resizeStartTime.current, snappedMinutes);
        const newDuration = differenceInMinutes(newEndTime, new Date(appointment.starts_at));
        
        if (newDuration >= 15 && newDuration <= 240) {
          setTempHeight((newDuration / 15) * 60);
        }
      } else {
        const newStartTime = addMinutes(resizeStartTime.current, snappedMinutes);
        const newDuration = differenceInMinutes(new Date(appointment.ends_at), newStartTime);
        
        if (newDuration >= 15 && newDuration <= 240) {
          setTempHeight((newDuration / 15) * 60);
        }
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      if (!resizeStartTime.current) return;

      const deltaY = upEvent.clientY - resizeStartY.current;
      const minutesChange = Math.round(deltaY / 4);
      const snappedMinutes = Math.round(minutesChange / 15) * 15;

      if (direction === 'bottom') {
        const newEndTime = addMinutes(resizeStartTime.current, snappedMinutes);
        const newDuration = differenceInMinutes(newEndTime, new Date(appointment.starts_at));

        if (newDuration >= 15 && newDuration <= 240) {
          // Guardar el height final antes de limpiar tempHeight
          setCommittedHeight((newDuration / 15) * 60);
          updateMutation.mutate({ newEndTime });
        } else {
          toast.error('La duración debe estar entre 15 minutos y 4 horas');
        }
      } else {
        const newStartTime = addMinutes(resizeStartTime.current, snappedMinutes);
        const newDuration = differenceInMinutes(new Date(appointment.ends_at), newStartTime);

        if (newDuration >= 15 && newDuration <= 240) {
          // Guardar el height final antes de limpiar tempHeight
          setCommittedHeight((newDuration / 15) * 60);
          updateMutation.mutate({
            newStartTime,
            newEndTime: new Date(appointment.ends_at)
          });
        } else {
          toast.error('La duración debe estar entre 15 minutos y 4 horas');
        }
      }

      setTempHeight(null);
      setIsResizing(false);
      setResizeDirection(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const colorClass = TYPE_COLORS[appointment.type] || 'border-l-gray-400 bg-gray-100';
  const baseTypeLabel = appointment.type === 'cirugia' && appointment.reason 
    ? `Cirugía - ${appointment.reason}`
    : appointment.type === 'procedimiento' && appointment.reason
    ? `Procedimiento - ${appointment.reason}`
    : appointment.type === 'estudio' && appointment.reason
    ? `Estudio - ${appointment.reason}`
    : appointment.type === 'post_operado' && appointment.post_op_type
    ? `Post operado - ${appointment.post_op_type}`
    : TYPE_LABELS[appointment.type] || appointment.type;
  const typeLabel = appointment.is_courtesy ? `${baseTypeLabel} - cortesía` : baseTypeLabel;

  const tooltipText = `${appointment.patient?.first_name} ${appointment.patient?.last_name}${appointment.reason ? ` - ${appointment.reason}` : ''}`;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div
            draggable={!isResizing}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={() => !isResizing && onClick(appointment)}
            onDoubleClick={() => !isResizing && onDoubleClick?.(appointment)}
            style={{ height: `${displayHeight}px` }}
            className={`
              absolute inset-x-1 top-0 overflow-hidden
              px-2 py-1.5 rounded border-l-4 transition-all leading-tight group
              ${colorClass}
              ${isDragging ? 'opacity-50' : 'opacity-100'}
              ${isResizing ? 'cursor-ns-resize' : 'cursor-move'}
              hover:shadow-md z-[2]
            `}
          >
            {isResizing && tempHeight && (
              <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded shadow-lg z-20 whitespace-nowrap font-medium">
                {Math.round((tempHeight / 60) * 15)} min
              </div>
            )}

            <div className="space-y-0.5">
              {/* FILA 1: Nombre del paciente + Badge cortesía + Doctor externo + Icono de nota */}
              <div className="flex items-center justify-between gap-1 leading-tight">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-base font-medium truncate">
                    {appointment.patient?.first_name} {appointment.patient?.last_name}
                  </span>
                  {(appointment as any).external_doctor_name && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-orange-100 text-orange-700 border-orange-300">
                      🏥 {(appointment as any).external_doctor_name}
                    </Badge>
                  )}
                  {appointment.is_courtesy && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-purple-100 text-purple-700 border-purple-300">
                      <Gift className="h-3 w-3 mr-0.5" />
                      Cortesía
                    </Badge>
                  )}
                </div>

                {/* Icono de nota - SIEMPRE en la fila superior a la derecha */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNoteClick?.(appointment);
                  }}
                  className="hover:scale-110 transition-transform flex-shrink-0"
                  title={appointment.reception_notes
                    ? `Nota: ${appointment.reception_notes.substring(0, 50)}${appointment.reception_notes.length > 50 ? '...' : ''}`
                    : "Agregar nota de recepción"
                  }
                >
                  <StickyNote
                    className={`h-4 w-4 ${
                      appointment.reception_notes
                        ? 'text-amber-500'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              </div>

              {/* FILA 2: Tipo de cita + Status + Iconos de estado */}
              <div className="flex items-center justify-between gap-2">
                <div className="text-muted-foreground text-sm truncate leading-tight flex-1">
                  {baseTypeLabel}
                </div>

                {/* Iconos de estado - en la fila inferior a la derecha */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {appointment.status === 'checked_in' && (
                    <div title="Paciente en sala de espera">
                      <Armchair className="h-4 w-4 text-blue-600" />
                    </div>
                  )}
                  {appointment.status === 'preconsulta_ready' && (
                    <div title="Preconsulta lista - Listo para atender">
                      <UserCheck className="h-4 w-4 text-green-600" />
                    </div>
                  )}
                  {appointment.status === 'done' && (
                    <div className="text-sm text-green-600 leading-tight">✓ Atendida</div>
                  )}
                </div>
              </div>
            </div>

            {/* Resize handle - Bottom */}
            <div
              onMouseDown={(e) => handleResizeStart(e, 'bottom')}
              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20 z-10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm font-medium">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
