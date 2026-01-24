import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Timetable } from '@/components/dashboard/Timetable';
import { AppointmentDrawer } from '@/components/dashboard/AppointmentDrawer';
import { AppointmentDialog } from '@/components/dashboard/AppointmentDialog';
import { PatientsListDialog } from '@/components/dashboard/PatientsListDialog';
import { QuickNoteDialog } from '@/components/dashboard/QuickNoteDialog';
import { BlockManagementDialog } from '@/components/dashboard/BlockManagementDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';
import { Appointment } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
}

interface Encounter {
  id: string;
  patient_id: string;
  type: string;
  doctor_id?: string;
  appointment_id?: string;
  date: string;
}

export default function Dashboard() {
  const { user, role, roles } = useAuth();
  const { currentBranch } = useBranch();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentDialogData, setAppointmentDialogData] = useState<{
    open: boolean;
    appointment?: Appointment;
    initialDate?: Date;
    initialTime?: string;
    initialRoomId?: string;
    initialDoctorId?: string;
  }>({ open: false });
  const [patientsListOpen, setPatientsListOpen] = useState(false);
  const [noteDialogAppointment, setNoteDialogAppointment] = useState<Appointment | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week'>('day');
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard-selected-doctors');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showDiagnosticoRoom, setShowDiagnosticoRoom] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard-show-diagnostico');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });
  const [showQuirofanoRoom, setShowQuirofanoRoom] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard-show-quirofano');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // Query optimizada con staleTime más largo (doctores cambian raramente)
  const { data: activeDoctors = [], isLoading: isLoadingDoctors } = useQuery({
    queryKey: ['active-doctors', isLocalMode],
    staleTime: 5 * 60 * 1000, // 5 minutos - Los médicos activos no cambian frecuentemente
    queryFn: async () => {
      if (isLocalMode) {
        const userRoles = await invoke<UserRole[]>('get_user_roles');
        return userRoles
          .filter(r => r.role === 'doctor')
          .map(r => r.user_id);
      }
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'doctor');

      if (!rolesData || rolesData.length === 0) return [] as string[];
      return rolesData.map((r) => r.user_id);
    },
  });

  // Efecto 1: Inicialización y restauración (SIN selectedDoctorIds en dependencias)
  useEffect(() => {
    if (!activeDoctors.length) return;

    if (user && roles.includes('doctor')) {
      const savedSelection = localStorage.getItem('dashboard-selected-doctors');
      
      if (savedSelection) {
        try {
          const savedDoctors = JSON.parse(savedSelection);
          const validDoctors = savedDoctors.filter((id: string) => activeDoctors.includes(id));
          
          if (!validDoctors.includes(user.id)) {
            validDoctors.push(user.id);
          }
          
          setSelectedDoctorIds(validDoctors);
        } catch {
          setSelectedDoctorIds([user.id]);
        }
      } else {
        setSelectedDoctorIds([user.id]);
      }
    } 
    else if (roles.includes('reception') || roles.includes('nurse')) {
      const savedSelection = localStorage.getItem('dashboard-selected-doctors');
      
      if (savedSelection) {
        try {
          const savedDoctors = JSON.parse(savedSelection);
          const validDoctors = savedDoctors.filter((id: string) => activeDoctors.includes(id));
          setSelectedDoctorIds(validDoctors);
        } catch {
          setSelectedDoctorIds([]);
        }
      } else {
        setSelectedDoctorIds([]);
      }
    }
    else if (roles.includes('diagnostico')) {
      if (!showDiagnosticoRoom) {
        setShowDiagnosticoRoom(true);
      }
    }
  }, [user, role, activeDoctors]);

  // Efecto 2: Persistencia en localStorage (SOLO lectura y guardado)
  useEffect(() => {
    if (roles.some(r => ['reception', 'admin', 'doctor', 'nurse', 'diagnostico'].includes(r)) && selectedDoctorIds.length > 0) {
      localStorage.setItem('dashboard-selected-doctors', JSON.stringify(selectedDoctorIds));
    }
    
    localStorage.setItem('dashboard-show-diagnostico', JSON.stringify(showDiagnosticoRoom));
    localStorage.setItem('dashboard-show-quirofano', JSON.stringify(showQuirofanoRoom));
  }, [selectedDoctorIds, showDiagnosticoRoom, showQuirofanoRoom, role]);

  // Handle patients list dialog via query params
  useEffect(() => {
    const shouldShowPatients = searchParams.get('patients') === 'open';
    setPatientsListOpen(shouldShowPatients);
  }, [searchParams]);

  const handleAppointmentClick = (data: Appointment | { initialDate: Date; initialTime: string; initialRoomId?: string; initialDoctorId?: string }) => {
    if ('id' in data) {
      // Es una cita existente, mostrar en drawer
      setSelectedAppointment(data);
    } else {
      // Es crear nueva cita, solo permitir si no es médico
      if (!roles.includes('doctor')) {
        setAppointmentDialogData({
          open: true,
          initialDate: data.initialDate,
          initialTime: data.initialTime,
          initialRoomId: data.initialRoomId,
          initialDoctorId: data.initialDoctorId,
        });
      }
    }
  };

  const handleAppointmentDoubleClick = async (appointment: Appointment) => {
    // Si es estudio, ir directamente a la página de estudios
    if (appointment.type === 'estudio') {
      if (roles.includes('diagnostico')) {
        navigate(`/estudios/${appointment.id}`);
      } else {
        navigate(`/ver-estudios/${appointment.id}`);
      }
      return;
    }

    // Check if there's an encounter for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let encounters: { id: string }[] | null = null;

    if (isLocalMode) {
      const allEncounters = await invoke<Encounter[]>('get_encounters_by_patient', {
        patientId: appointment.patient_id
      });
      encounters = allEncounters
        .filter(e => {
          const encDate = new Date(e.date);
          return encDate >= today && encDate < tomorrow;
        })
        .slice(0, 1)
        .map(e => ({ id: e.id }));
    } else {
      const { data } = await supabase
        .from('encounters')
        .select('id')
        .eq('patient_id', appointment.patient_id)
        .gte('date', today.toISOString())
        .lt('date', tomorrow.toISOString())
        .limit(1);
      encounters = data;
    }

    // Determine which route to use based on appointment type
    const isReconsulta = ['reconsulta_menos_3m', 'reconsulta_mas_3m', 'post_operado', 'lectura_resultados'].includes(appointment.type);
    const route = isReconsulta ? 'reconsulta' : 'consultation';

    // Map appointment type to encounter type
    let encounterType: 'consulta' | 'posop' | 'quirurgico' | 'urgencia' = 'consulta';
    if (appointment.type === 'post_operado') {
      encounterType = 'posop';
    } else if (appointment.type === 'cirugia') {
      encounterType = 'quirurgico';
    }

    if (encounters && encounters.length > 0) {
      navigate(`/${route}/${encounters[0].id}`);
    } else {
      // Create new encounter
      if (isLocalMode) {
        const newEncounter = await invoke<Encounter>('create_encounter', {
          encounter: {
            patient_id: appointment.patient_id,
            type: encounterType,
            doctor_id: appointment.doctor_id,
            appointment_id: appointment.id,
          }
        });
        if (newEncounter) {
          navigate(`/${route}/${newEncounter.id}`);
        }
      } else {
        const { data: newEncounter, error } = await supabase
          .from('encounters')
          .insert([{
            patient_id: appointment.patient_id,
            type: encounterType,
            doctor_id: appointment.doctor_id,
            appointment_id: appointment.id,
          }])
          .select()
          .single();

        if (!error && newEncounter) {
          navigate(`/${route}/${newEncounter.id}`);
        }
      }
    }
  };

  const handleNoteClick = (appointment: Appointment) => {
    setNoteDialogAppointment(appointment);
  };

  const handleBlockClick = (block: any) => {
    setSelectedBlock(block);
    setShowBlockDialog(true);
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background overflow-hidden">
        <DashboardSidebar 
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          selectedDoctorIds={selectedDoctorIds}
          onDoctorsChange={setSelectedDoctorIds}
          onAppointmentClick={setSelectedAppointment}
          view={view}
          showDiagnosticoRoom={showDiagnosticoRoom}
          onDiagnosticoRoomChange={setShowDiagnosticoRoom}
          showQuirofanoRoom={showQuirofanoRoom}
          onQuirofanoRoomChange={setShowQuirofanoRoom}
        />
        
        <div className="flex-1 flex flex-col">
          <DashboardHeader 
            currentDate={currentDate}
            view={view}
            onViewChange={setView}
            onDateChange={setCurrentDate}
            onSearchPatients={() => setSearchParams({ patients: 'open' })}
          />
          
          <main className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden">
            {isLoadingDoctors ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-[600px] w-full" />
              </div>
            ) : (
              <Timetable 
                currentDate={currentDate}
                view={view}
                selectedDoctorIds={selectedDoctorIds}
                onAppointmentClick={handleAppointmentClick}
                onAppointmentDoubleClick={handleAppointmentDoubleClick}
                onAppointmentNoteClick={handleNoteClick}
                onBlockClick={handleBlockClick}
                showDiagnosticoRoom={showDiagnosticoRoom}
                showQuirofanoRoom={showQuirofanoRoom}
              />
            )}
          </main>
        </div>

        <AppointmentDrawer 
          appointment={selectedAppointment}
          open={!!selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />

        <AppointmentDialog
          open={appointmentDialogData.open}
          onClose={() => setAppointmentDialogData({ open: false })}
          appointment={appointmentDialogData.appointment}
          initialDate={appointmentDialogData.initialDate}
          initialTime={appointmentDialogData.initialTime}
          initialRoomId={appointmentDialogData.initialRoomId}
          initialDoctorId={appointmentDialogData.initialDoctorId}
        />

        <PatientsListDialog
          open={patientsListOpen}
          onClose={() => setSearchParams({})}
          onSelectAppointment={(appointment) => {
            setSelectedAppointment(appointment);
          }}
        />

        <QuickNoteDialog
          appointment={noteDialogAppointment}
          open={!!noteDialogAppointment}
          onClose={() => setNoteDialogAppointment(null)}
        />

        <BlockManagementDialog
          block={selectedBlock}
          open={showBlockDialog}
          onClose={() => {
            setShowBlockDialog(false);
            setSelectedBlock(null);
          }}
        />
      </div>
    </SidebarProvider>
  );
}
