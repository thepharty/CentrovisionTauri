import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Appointment } from '@/types/database';
import { format, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { clinicNow, clinicStartOfWeek, clinicEndOfWeek, fromClinicTime, toClinicTime } from '@/lib/timezone';
import { DraggableAppointmentBlock } from './DraggableAppointmentBlock';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBranch, isValidBranchId } from '@/hooks/useBranch';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { isTauri, saveAppointmentsToSqlite, getAppointmentsFromSqlite, AppointmentCache } from '@/lib/dataSource';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';

interface TimetableProps {
  currentDate: Date;
  view: 'day' | 'week';
  selectedDoctorIds?: string[];
  onAppointmentClick: (appointment: Appointment | { initialDate: Date; initialTime: string; initialRoomId?: string; initialDoctorId?: string }) => void;
  onAppointmentDoubleClick?: (appointment: Appointment) => void;
  onAppointmentNoteClick?: (appointment: Appointment) => void;
  onBlockClick?: (block: any) => void;
  showDiagnosticoRoom?: boolean;
  showQuirofanoRoom?: boolean;
}

// Generate 15-minute slots from 7 AM to 8 PM
const TIME_SLOTS = Array.from({ length: 14 * 4 }, (_, i) => {
  const hour = Math.floor(i / 4) + 7;
  const minutes = (i % 4) * 15;
  return { hour, minutes };
});

// Droppable slot component for @dnd-kit
interface DroppableSlotProps {
  id: string;
  children: React.ReactNode;
  onDoubleClick: () => void;
}

function DroppableSlot({ id, children, onDoubleClick }: DroppableSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`relative border-r h-full p-1 transition-colors cursor-pointer overflow-visible flex-1 ${
        isOver ? 'bg-primary/20' : 'hover:bg-accent/5'
      }`}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </div>
  );
}

export function Timetable({ currentDate, view, selectedDoctorIds = [], onAppointmentClick, onAppointmentDoubleClick, onAppointmentNoteClick, onBlockClick, showDiagnosticoRoom = false, showQuirofanoRoom = false }: TimetableProps) {
  const queryClient = useQueryClient();
  const doctorMode = selectedDoctorIds.length > 0;
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const { role } = useAuth();
  const { currentBranch } = useBranch();
  const { isOnline } = useNetworkStatus();

  // @dnd-kit sensors - same as KanbanBoard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  // Actualizar la hora cada minuto usando timezone de la clínica
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(clinicNow());
    };
    
    updateTime(); // Actualizar inmediatamente
    const interval = setInterval(updateTime, 60000); // Actualizar cada minuto

    return () => clearInterval(interval);
  }, []);

  // Usar timezone de la clínica para calcular rangos
  const startDate = view === 'day' ? currentDate : clinicStartOfWeek(currentDate);
  const endDate = view === 'day' ? currentDate : clinicEndOfWeek(currentDate);
  const days = view === 'day' ? [currentDate] : eachDayOfInterval({ start: startDate, end: endDate });

  // Realtime OPTIMIZADO: Actualización quirúrgica del cache con debouncing
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    
    const channel = supabase
      .channel('appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('[Timetable] Realtime update:', payload.eventType);
          
          // Debouncing: esperar 300ms antes de actualizar
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            // Solo invalidar si el cambio afecta el rango visible
            const startDateStr = format(startDate, 'yyyy-MM-dd');
            const endDateStr = format(endDate, 'yyyy-MM-dd');
            
            // Invalidar solo las queries específicas del rango actual
            queryClient.invalidateQueries({ 
              queryKey: ['appointments', startDateStr, endDateStr],
              exact: false 
            });
          }, 300);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [queryClient, startDate, endDate]);

  // Realtime para schedule_blocks
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    
    const channel = supabase
      .channel('schedule-blocks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_blocks'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('[Timetable] Schedule block update:', payload.eventType);
          
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            queryClient.invalidateQueries({ 
              queryKey: ['schedule_blocks'],
              exact: false 
            });
          }, 300);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [queryClient, startDate, endDate]);

  // Calcular la posición de la línea de tiempo actual
  const getCurrentTimePosition = () => {
    const now = currentTime;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Solo mostrar si está dentro del horario (7 AM - 8 PM)
    if (hours < 7 || hours >= 20) return null;
    
    // Calcular minutos desde las 7 AM
    const minutesSince7AM = (hours - 7) * 60 + minutes;
    // Cada slot tiene 60px de altura (h-[60px])
    const pixelsPerMinute = 60 / 15; // 60px por cada 15 minutos
    const position = (minutesSince7AM / 15) * 60;
    
    return position;
  };

  const currentTimePosition = getCurrentTimePosition();
  
  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', role, showDiagnosticoRoom, showQuirofanoRoom, currentBranch?.id],
    staleTime: 5 * 60 * 1000, // Las salas no cambian frecuentemente - 5 minutos
    enabled: isValidBranchId(currentBranch?.id),
    queryFn: async () => {
      let query = supabase
        .from('rooms')
        .select('*')
        .eq('active', true)
        .eq('branch_id', currentBranch!.id)
        .order('name');
      
      // Filtrar por tipo de sala según los flags activos
      if (showDiagnosticoRoom && showQuirofanoRoom) {
        query = query.in('kind', ['diagnostico', 'quirofano']);
      } else if (showDiagnosticoRoom) {
        query = query.eq('kind', 'diagnostico');
      } else if (showQuirofanoRoom) {
        query = query.eq('kind', 'quirofano');
      } else if (role === 'diagnostico') {
        // Si es rol diagnostico y no está el flag, mostrar sala de diagnóstico
        query = query.eq('kind', 'diagnostico');
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: doctors = [] } = useQuery({
    queryKey: ['selected-doctors', selectedDoctorIds],
    enabled: doctorMode,
    staleTime: 2 * 60 * 1000, // Perfiles de médicos estables - 2 minutos
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', selectedDoctorIds);
      return data || [];
    },
  });

  // Query optimizada con queryKey estable y específico
  // Incluye write-through cache a SQLite y fallback offline
  // NOTA: isOnline NO va en queryKey para preservar cache de React Query al cambiar estado de red
  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'), doctorMode, selectedDoctorIds, showDiagnosticoRoom, showQuirofanoRoom, currentBranch?.id],
    staleTime: 15000, // Override: 15 segundos para appointments (datos críticos)
    enabled: isValidBranchId(currentBranch?.id), // Don't run query without a valid branch
    queryFn: async () => {
      // Convertir rangos a UTC para consultar la DB
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const startUTC = fromClinicTime(start);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const endUTC = fromClinicTime(end);

      // Helper function para cargar desde SQLite
      const loadFromSqlite = async (): Promise<Appointment[]> => {
        console.log('[Timetable] Loading from SQLite cache');
        const localAppts = await getAppointmentsFromSqlite(currentBranch!.id, format(startDate, 'yyyy-MM-dd'));
        // Filtrar por el rango de fechas y doctores/salas
        return localAppts.filter(apt => {
          const aptDate = new Date(apt.starts_at);
          const inRange = aptDate >= startUTC && aptDate <= endUTC;
          if (!inRange) return false;

          // Aplicar filtros de doctor/sala
          if (doctorMode && selectedDoctorIds.length > 0) {
            if (!apt.doctor_id || !selectedDoctorIds.includes(apt.doctor_id)) return false;
          }
          if (showDiagnosticoRoom && apt.appointment_type === 'estudio') return true;
          if (showQuirofanoRoom && apt.appointment_type === 'cirugia') return true;
          if (doctorMode && apt.doctor_id && selectedDoctorIds.includes(apt.doctor_id)) return true;

          return !doctorMode && !showDiagnosticoRoom && !showQuirofanoRoom;
        }) as unknown as Appointment[];
      };

      // ===== OFFLINE DETECTION =====
      // Usamos isOnline del contexto (que usa checkNetworkStatus de Tauri, no navigator.onLine)
      // Si estamos offline, ir directo a SQLite
      if (!isOnline && isTauri() && currentBranch?.id) {
        console.log('[Timetable] Offline mode detected (isOnline=false) - loading from SQLite');
        try {
          return await loadFromSqlite();
        } catch (err) {
          console.error('[Timetable] Failed to load from SQLite:', err);
          return [];
        }
      }

      // ===== ONLINE MODE =====
      // Intentar cargar desde Supabase, con fallback a SQLite si falla
      try {
        // Si necesitamos incluir la sala de diagnóstico, primero obtenemos su ID
        let diagnosticoRoomId = null;
        if (showDiagnosticoRoom) {
          const diagRoom = rooms.find(r => r.kind === 'diagnostico');
          if (diagRoom) diagnosticoRoomId = diagRoom.id;
        }

        let query = supabase
          .from('appointments')
          .select(`
            *,
            patient:patients(*),
            room:rooms(*)
          `)
          .gte('starts_at', startUTC.toISOString())
          .lte('starts_at', endUTC.toISOString())
          .eq('branch_id', currentBranch?.id)
          .order('starts_at', { ascending: true });

        // Lógica combinada para doctores, diagnóstico y quirófano
        if (doctorMode && showDiagnosticoRoom && showQuirofanoRoom) {
          // Médicos + Diagnóstico + Quirófano
          query = query.or(`doctor_id.in.(${selectedDoctorIds.join(',')}),type.eq.estudio,type.eq.cirugia`);
        } else if (doctorMode && showDiagnosticoRoom) {
          // Médicos + Diagnóstico
          query = query.or(`doctor_id.in.(${selectedDoctorIds.join(',')}),type.eq.estudio`);
        } else if (doctorMode && showQuirofanoRoom) {
          // Médicos + Quirófano
          query = query.or(`doctor_id.in.(${selectedDoctorIds.join(',')}),type.eq.cirugia`);
        } else if (showDiagnosticoRoom && showQuirofanoRoom) {
          // Solo Diagnóstico + Quirófano
          query = query.in('type', ['estudio', 'cirugia']);
        } else if (doctorMode) {
          // Solo médicos
          query = query.in('doctor_id', selectedDoctorIds);
        } else if (showDiagnosticoRoom) {
          // Solo sala de diagnóstico: mostrar TODOS los estudios (con o sin room_id)
          query = query.eq('type', 'estudio');
        } else if (showQuirofanoRoom) {
          // Solo quirófano: mostrar TODAS las cirugías (con o sin room_id)
          query = query.eq('type', 'cirugia');
        }

        const { data, error } = await query;
        if (error) throw error;

        // Map doctor profiles (already fetched when doctorMode)
        const appointments = data || [];

        // ===== WRITE-THROUGH CACHE =====
        // Guardar en SQLite para uso offline (en background, no bloquea)
        if (isTauri() && appointments.length > 0) {
          const appointmentsToCache: AppointmentCache[] = appointments.map((apt: any) => ({
            id: apt.id,
            patient_id: apt.patient_id,
            room_id: apt.room_id,
            doctor_id: apt.doctor_id,
            branch_id: apt.branch_id,
            starts_at: apt.starts_at,
            ends_at: apt.ends_at,
            reason: apt.reason,
            type: apt.type,
            status: apt.status,
            is_courtesy: apt.is_courtesy,
            post_op_type: apt.post_op_type,
            reception_notes: apt.reception_notes,
            created_at: apt.created_at,
            updated_at: apt.updated_at,
          }));

          // No await - guardar en background
          saveAppointmentsToSqlite(appointmentsToCache).then(count => {
            if (count > 0) {
              console.log(`[Timetable] Cached ${count} appointments to SQLite`);
            }
          });
        }

        if (doctorMode) {
          const profilesMap = new Map(doctors.map((p: any) => [p.user_id, p]));
          return appointments.map((apt: any) => ({ ...apt, doctor: apt.doctor_id ? profilesMap.get(apt.doctor_id) : undefined })) as Appointment[];
        }

        // Fallback fetch for doctor profiles when not in doctorMode
        const doctorIds = appointments.map((a: any) => a.doctor_id).filter(Boolean);
        if (doctorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .in('user_id', doctorIds);
          const profilesMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
          return appointments.map((apt: any) => ({ ...apt, doctor: apt.doctor_id ? profilesMap.get(apt.doctor_id) : undefined })) as Appointment[];
        }

        return appointments as Appointment[];
      } catch (networkError) {
        // ===== FALLBACK TO SQLITE ON NETWORK ERROR =====
        // Si Supabase falla (probablemente offline), usar SQLite
        if (isTauri() && currentBranch?.id) {
          console.log('[Timetable] Supabase failed, falling back to SQLite:', networkError);
          try {
            return await loadFromSqlite();
          } catch (sqliteError) {
            console.error('[Timetable] SQLite fallback also failed:', sqliteError);
          }
        }
        throw networkError;
      }
    },
  });

  // Query para schedule_blocks
  const { data: scheduleBlocks = [] } = useQuery({
    queryKey: ['schedule_blocks', format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'), currentBranch?.id],
    queryFn: async () => {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const startUTC = fromClinicTime(start);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const endUTC = fromClinicTime(end);

    const { data, error } = await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('branch_id', currentBranch?.id)
      .lt('starts_at', endUTC.toISOString())
      .gt('ends_at', startUTC.toISOString())
      .order('starts_at');

    if (error) throw error;

    // Obtener los perfiles de los creadores
    if (data && data.length > 0) {
      const creatorIds = [...new Set(data.map(block => block.created_by).filter(Boolean))];
      
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', creatorIds);
        
        const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        
        const blocksWithProfiles = data.map(block => ({
          ...block,
          created_by_profile: block.created_by ? profilesMap.get(block.created_by) : null
        }));
        
        return blocksWithProfiles;
      }
    }

    return data || [];

      if (error) throw error;
      return data || [];
    },
    enabled: isValidBranchId(currentBranch?.id) && !!format(startDate, 'yyyy-MM-dd') && !!format(endDate, 'yyyy-MM-dd'),
    staleTime: 1000 * 30,
  });

  const updateAppointmentTimeMutation = useMutation({
    mutationFn: async ({ appointmentId, newStartTime }: { appointmentId: string; newStartTime: Date }) => {
      const { data: apt } = await supabase
        .from('appointments')
        .select('starts_at, ends_at')
        .eq('id', appointmentId)
        .single();

      if (!apt) throw new Error('Appointment not found');

      const duration = new Date(apt.ends_at).getTime() - new Date(apt.starts_at).getTime();
      const newEndTime = new Date(newStartTime.getTime() + duration);

      const { error } = await supabase
        .from('appointments')
        .update({
          starts_at: newStartTime.toISOString(),
          ends_at: newEndTime.toISOString(),
        })
        .eq('id', appointmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast.success('Cita movida exitosamente');
    },
    onError: (error: any) => {
      toast.error('Error al mover cita: ' + error.message);
    },
  });

  // @dnd-kit handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    console.log('[Timetable] DND-KIT DRAG START', event.active.id);
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) {
      console.log('[Timetable] DND-KIT DRAG END - no drop target');
      return;
    }

    console.log('[Timetable] DND-KIT DROP', { activeId: active.id, overId: over.id });

    // Parse the droppable ID: format is "slot|{date}|{colId}|{hour}|{minutes}"
    // Using | as separator because colId (UUID) contains hyphens
    const dropId = over.id as string;
    if (!dropId.startsWith('slot|')) {
      console.log('[Timetable] Invalid drop target:', dropId);
      return;
    }

    const parts = dropId.split('|');
    // slot|2024-01-15|uuid-with-dashes|7|0
    // parts: ['slot', '2024-01-15', 'colId', '7', '0']
    const dateStr = parts[1];
    const colId = parts[2];
    const hour = parseInt(parts[3], 10);
    const minutes = parseInt(parts[4], 10);

    const appointmentId = active.id as string;

    // Create date in clinic timezone, then convert to UTC for storage
    // dateStr is "YYYY-MM-DD", we need to create a Date object representing
    // that date and time in Guatemala timezone
    const [year, month, dayNum] = dateStr.split('-').map(Number);
    const clinicLocalTime = new Date(year, month - 1, dayNum, hour, minutes, 0, 0);
    const newStartTime = fromClinicTime(clinicLocalTime);

    console.log('[Timetable] Moving appointment:', { appointmentId, clinicLocalTime, newStartTime: newStartTime.toISOString(), colId });
    updateAppointmentTimeMutation.mutate({ appointmentId, newStartTime });
  }, [updateAppointmentTimeMutation]);

  // Get the active appointment for DragOverlay
  const activeAppointment = activeDragId ? appointments.find(apt => apt.id === activeDragId) : null;

  const getAppointmentsForSlot = (colId: string, day: Date, hour: number, minutes: number, isDoctor: boolean, roomKind?: string) => {
    return appointments.filter(apt => {
      const aptDate = toClinicTime(new Date(apt.starts_at));
      const aptHour = aptDate.getHours();
      const aptMinutes = aptDate.getMinutes();
      const isSameDay = format(aptDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
      if (isDoctor) {
        // Columna de doctor, filtrar por doctor_id
        return apt.doctor_id === colId && isSameDay && aptHour === hour && aptMinutes === minutes;
      }
      // Columna de sala, filtrar por room_id
      const matchesRoom = apt.room_id === colId && isSameDay && aptHour === hour && aptMinutes === minutes;
      
      // Si es sala de diagnóstico, mostrar todos los estudios (con o sin room_id)
      if (roomKind === 'diagnostico') {
        return (matchesRoom || apt.room_id === null) && apt.type === 'estudio' && isSameDay && aptHour === hour && aptMinutes === minutes;
      }
      
      // Si es sala de quirófano, mostrar todas las cirugías (con o sin room_id)
      if (roomKind === 'quirofano') {
        return (matchesRoom || apt.room_id === null) && apt.type === 'cirugia' && isSameDay && aptHour === hour && aptMinutes === minutes;
      }
      
      return matchesRoom;
    });
  };

  const getBlocksForSlot = (
    colId: string,
    day: Date,
    hour: number,
    minutes: number,
    isDoctor: boolean
  ) => {
    if (!scheduleBlocks || scheduleBlocks.length === 0) return [];

    return scheduleBlocks.filter((block: any) => {
      const blockStart = toClinicTime(new Date(block.starts_at));
      const blockEnd = toClinicTime(new Date(block.ends_at));
      
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      
      const intersectsDay = blockStart < dayEnd && blockEnd > dayStart;
      
      if (!intersectsDay) return false;

      if (isDoctor) {
        if (block.doctor_id && block.doctor_id !== colId) return false;
      } else {
        if (block.room_id && block.room_id !== colId) return false;
      }

      const slotStartMinutes = hour * 60 + minutes;
      const slotEndMinutes = slotStartMinutes + 15;
      
      let blockStartMinutes: number;
      let blockEndMinutes: number;
      
      if (format(blockStart, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')) {
        blockStartMinutes = blockStart.getHours() * 60 + blockStart.getMinutes();
      } else {
        blockStartMinutes = 0;
      }
      
      if (format(blockEnd, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')) {
        blockEndMinutes = blockEnd.getHours() * 60 + blockEnd.getMinutes();
      } else {
        blockEndMinutes = 24 * 60;
      }
      
      return blockStartMinutes < slotEndMinutes && blockEndMinutes > slotStartMinutes;
    });
  };

  // Combinar columnas: médicos + sala de diagnóstico si está seleccionada
  let columns: any[] = [];
  if (doctorMode) {
    columns = [...doctors];
  }
  if ((showDiagnosticoRoom || showQuirofanoRoom) && rooms.length > 0) {
    columns = [...columns, ...rooms];
  } else if (!doctorMode && rooms.length > 0) {
    columns = rooms;
  }

  const columnsPerDay = columns.length;

  // Si no hay médicos seleccionados ni salas, y no somos diagnóstico, mostrar mensaje
  if (selectedDoctorIds.length === 0 && !showDiagnosticoRoom && !showQuirofanoRoom && role !== 'diagnostico') {
    return (
      <div className="h-[calc(100vh-120px)] overflow-hidden border rounded-lg flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-lg text-muted-foreground">
            Seleccione médicos, sala de diagnóstico o quirófano para ver las agendas
          </p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
    <div className="h-[calc(100vh-120px)] overflow-x-hidden overflow-y-auto border rounded-lg">
      {/* Header fijo */}
      <div className="flex border-b bg-card sticky top-0 z-[5]">
        {/* Time header - sticky */}
        <div className="w-20 flex-shrink-0 border-r bg-muted/50 sticky left-0 z-[4]"></div>

        {/* Columns header - scrollable */}
        <div className="flex-1 overflow-x-hidden overflow-y-hidden">
          <div className="flex">
            {days.map((day) => (
              columns.map((col: any) => {
                // Determinar si es columna de doctor o de sala
                const isDoctor = 'user_id' in col;
                const colId = isDoctor ? col.user_id : col.id;
                const isDiag = !isDoctor && col.kind === 'diagnostico';
                const isQuir = !isDoctor && col.kind === 'quirofano';
                const label = isDiag ? 'Diagnóstico' : isQuir ? 'Quirófano 1' : (isDoctor ? col.full_name : col.name);
                return (
                  <div
                    key={`${format(day, 'yyyy-MM-dd')}-${colId}`}
                    className="border-r p-2 text-center overflow-hidden flex-1"
                  >
                    {view === 'week' && (
                      <div className="font-medium text-sm truncate">
                        {format(day, 'EEE d', { locale: es })}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground truncate font-medium">
                      {label}
                    </div>
                  </div>
                );
              })
            ))}
          </div>
        </div>
      </div>

      {/* Body con scroll sincronizado */}
      <div className="flex overflow-y-auto h-full relative">
        {/* Time column - sticky left */}
        <div className="w-20 flex-shrink-0 border-r bg-card sticky left-0 z-[4]">
          {TIME_SLOTS.map(({ hour, minutes }) => (
            <div
              key={`${hour}-${minutes}`}
              className="p-2 text-sm text-muted-foreground border-b bg-card h-[60px] flex items-center justify-center"
            >
              {format(new Date().setHours(hour, minutes), 'HH:mm')}
            </div>
          ))}
        </div>

        {/* Slots grid - sin scroll propio */}
        <div className="flex-1 relative">
          {TIME_SLOTS.map(({ hour, minutes }) => (
            <div key={`${hour}-${minutes}`} className="flex border-b h-[60px]">
              {days.map((day) => (
                columns.map((col: any) => {
                  const isDoctor = 'user_id' in col;
                  const colId = isDoctor ? col.user_id : col.id;
                  // Use | as separator because colId (UUID) contains hyphens
                  const slotId = `slot|${format(day, 'yyyy-MM-dd')}|${colId}|${hour}|${minutes}`;
                  return (
                    <DroppableSlot
                      key={slotId}
                      id={slotId}
                      onDoubleClick={() => {
                        const slotDate = new Date(day);
                        slotDate.setHours(hour, minutes, 0, 0);
                        onAppointmentClick({
                          initialDate: slotDate,
                          initialTime: format(slotDate, 'HH:mm'),
                          ...(isDoctor ? { initialDoctorId: colId } : { initialRoomId: colId }),
                        } as any);
                      }}
                    >
                      {/* Renderizar bloques primero (fondo) */}
                      {getBlocksForSlot(colId, day, hour, minutes, isDoctor).map((block: any) => {
                        const blockStart = toClinicTime(new Date(block.starts_at));
                        const blockEnd = toClinicTime(new Date(block.ends_at));
                        const blockDurationMinutes = (blockEnd.getTime() - blockStart.getTime()) / (1000 * 60);
                        const blockHeightPx = (blockDurationMinutes / 15) * 60;

                        return (
                          <div
                            key={`block-${block.id}`}
                            className="absolute inset-x-1 bg-gray-400/30 border-2 border-dashed border-gray-600 rounded-md p-1 text-xs z-[3] cursor-pointer hover:bg-gray-400/40 transition-colors"
                            style={{
                              top: 0,
                              height: `${Math.min(blockHeightPx, 60)}px`,
                              overflow: 'hidden'
                            }}
                            title={block.reason || 'Horario bloqueado'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onBlockClick?.(block);
                            }}
                          >
                            <div className="font-semibold text-gray-800 flex items-center gap-1">
                              <span>🚫</span>
                              <span className="truncate">Bloqueado</span>
                            </div>
                            {block.reason && (
                              <div className="text-gray-700 text-[10px] truncate mt-0.5">
                                {block.reason}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Renderizar appointments después (encima) */}
                      {getAppointmentsForSlot(colId, day, hour, minutes, isDoctor, !isDoctor ? col.kind : undefined).map((apt) => (
                        <DraggableAppointmentBlock
                          key={apt.id}
                          appointment={apt}
                          onClick={() => onAppointmentClick(apt)}
                          onDoubleClick={onAppointmentDoubleClick}
                          onNoteClick={onAppointmentNoteClick}
                        />
                      ))}
                    </DroppableSlot>
                  );
                })
              ))}
            </div>
          ))}

          {/* Línea de hora actual */}
          {currentTimePosition !== null && (
            <div
              className="absolute left-0 right-0 z-[3] pointer-events-none"
              style={{ top: `${currentTimePosition}px` }}
            >
              <div className="relative">
                <div className="h-0.5 bg-red-500 shadow-lg"></div>
                <div className="absolute right-0 -top-1 w-2 h-2 bg-red-500 rounded-full"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* DragOverlay for visual feedback while dragging */}
    <DragOverlay dropAnimation={null}>
      {activeAppointment && (
        <div className="p-2 rounded-lg border bg-background shadow-xl w-[200px] rotate-2 opacity-90">
          <p className="font-medium text-sm truncate">
            {activeAppointment.patient?.first_name} {activeAppointment.patient?.last_name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {activeAppointment.reason || activeAppointment.type}
          </p>
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}
