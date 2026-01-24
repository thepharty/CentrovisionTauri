import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, Search } from 'lucide-react';
import { format, addDays, subDays, addWeeks, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useState } from 'react';
import { AppointmentDialog } from './AppointmentDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SyncIndicator } from '@/components/SyncIndicator';
import { invoke } from '@tauri-apps/api/core';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
}

interface DashboardHeaderProps {
  currentDate: Date;
  view: 'day' | 'week';
  onViewChange: (view: 'day' | 'week') => void;
  onDateChange: (date: Date) => void;
  onNewAppointment?: () => void;
  onSearchPatients?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  doctor: 'Doctor',
  nurse: 'Enfermería',
  reception: 'Recepción',
  diagnostico: 'Diagnóstico',
};

export function DashboardHeader({ currentDate, view, onViewChange, onDateChange, onNewAppointment, onSearchPatients }: DashboardHeaderProps) {
  const { signOut, user, role, hasRole, isLoggingOut } = useAuth();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['user-profile', user?.id, isLocalMode],
    queryFn: async () => {
      if (!user?.id) return null;
      if (isLocalMode) {
        const profiles = await invoke<Profile[]>('get_doctors');
        const userProfile = profiles.find(p => p.user_id === user.id);
        return userProfile ? { full_name: userProfile.full_name } : null;
      }
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const handlePrevious = () => {
    onDateChange(view === 'day' ? subDays(currentDate, 1) : subWeeks(currentDate, 1));
  };

  const handleNext = () => {
    onDateChange(view === 'day' ? addDays(currentDate, 1) : addWeeks(currentDate, 1));
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  return (
    <>
      <header className="sticky top-0 z-[5] border-b bg-card">
        <div className="flex flex-wrap items-center justify-between p-4 gap-2 md:gap-4 w-full">
          <div className="flex items-center gap-2 md:gap-4 flex-wrap min-w-0">
            <SidebarTrigger />
            
            {(hasRole('reception') || hasRole('nurse') || hasRole('diagnostico') || hasRole('admin')) && (
              <Button 
                onClick={() => setShowAppointmentDialog(true)}
                size="sm"
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Nueva Cita
              </Button>
            )}

            <Button 
              onClick={onSearchPatients}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              Buscar
            </Button>

            <Button variant="outline" size="sm" onClick={handleToday}>
              <CalendarIcon className="h-4 w-4 mr-2" />
              Hoy
            </Button>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-sm md:text-lg font-semibold whitespace-nowrap">
              {format(currentDate, "d 'de' MMMM, yyyy", { locale: es })}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 flex-wrap flex-shrink-0 min-w-0">
            <SyncIndicator />

            <Tabs value={view} onValueChange={(v) => onViewChange(v as 'day' | 'week')}>
              <TabsList>
                <TabsTrigger value="day">Día</TabsTrigger>
                <TabsTrigger value="week">Semana</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <div className="text-sm hidden sm:block">
                <p className="font-medium">{profile?.full_name || user?.email}</p>
                {role && (
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[role] || role}</p>
                )}
              </div>
            <Button
              variant="outline" 
              size="sm" 
              onClick={signOut}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? 'Cerrando...' : 'Cerrar Sesión'}
            </Button>
            </div>
          </div>
        </div>
      </header>

      <AppointmentDialog
        open={showAppointmentDialog}
        onClose={() => setShowAppointmentDialog(false)}
        initialDate={currentDate}
        initialTime="09:00"
      />
    </>
  );
}
