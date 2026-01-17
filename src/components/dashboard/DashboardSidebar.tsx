import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { Calendar } from '@/components/ui/calendar';
import { Shield, DollarSign, ChevronDown, Users, Package } from 'lucide-react';
import centrovisionLogo from '@/assets/centrovision-logo.png';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Appointment } from '@/types/database';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { useNavigate } from 'react-router-dom';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { BranchSelector } from '@/components/BranchSelector';
import { useTheme } from 'next-themes';
import { useCRMNotifications } from '@/hooks/useCRMNotifications';
import { useAppSettings } from '@/hooks/useAppSettings';
interface DashboardSidebarProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  selectedDoctorIds?: string[];
  onDoctorsChange?: (ids: string[]) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  view: 'day' | 'week';
  showDiagnosticoRoom?: boolean;
  onDiagnosticoRoomChange?: (show: boolean) => void;
  showQuirofanoRoom?: boolean;
  onQuirofanoRoomChange?: (show: boolean) => void;
}
export function DashboardSidebar({
  currentDate,
  onDateChange,
  selectedDoctorIds = [],
  onDoctorsChange,
  view,
  showDiagnosticoRoom = false,
  onDiagnosticoRoomChange,
  showQuirofanoRoom = false,
  onQuirofanoRoomChange
}: DashboardSidebarProps) {
  const {
    hasRole,
    roles,
    user
  } = useAuth();
  const { currentBranch } = useBranch();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [diagnosticoOpen, setDiagnosticoOpen] = useState(true);
  const [quirofanoOpen, setQuirofanoOpen] = useState(true);
  const [clickTimeout, setClickTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  
  // CRM notifications
  const { unreadCount } = useCRMNotifications();
  
  // App settings for CRM visibility
  const { isCRMVisibleForAll } = useAppSettings();

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (clickTimeout) clearTimeout(clickTimeout);
    };
  }, [clickTimeout]);

  const handleLogoClick = () => {
    if (clickTimeout) {
      // Ya hay un click pendiente = es doble click
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      // Doble click - acceso a research (solo admin)
      if (hasRole('admin')) {
        navigate('/research');
      }
    } else {
      // Primer click - esperar para ver si es doble
      const timeout = setTimeout(() => {
        // No hubo segundo click - toggle tema
        setTheme(theme === 'dark' ? 'light' : 'dark');
        setClickTimeout(null);
      }, 300);
      setClickTimeout(timeout);
    }
  };
  const {
    data: doctors = []
  } = useQuery({
    queryKey: ['sidebar-doctors'],
    queryFn: async () => {
      const {
        data: roles
      } = await supabase.from('user_roles').select('user_id').eq('role', 'doctor');
      if (!roles || roles.length === 0) return [] as {
        user_id: string;
        full_name: string;
      }[];
      const {
        data: profiles
      } = await supabase.from('profiles').select('user_id, full_name').in('user_id', roles.map(r => r.user_id)).eq('is_visible_in_dashboard', true);
      return (profiles || []) as {
        user_id: string;
        full_name: string;
      }[];
    }
  });
  const {
    data: diagnosticoRoom
  } = useQuery({
    queryKey: ['diagnostico-room', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return null;
      const {
        data
      } = await supabase.from('rooms').select('*').eq('kind', 'diagnostico').eq('branch_id', currentBranch.id).eq('active', true).maybeSingle();
      return data;
    },
    enabled: !!currentBranch?.id
  });
  const {
    data: quirofanoRoom
  } = useQuery({
    queryKey: ['quirofano-room', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return null;
      const {
        data
      } = await supabase.from('rooms').select('*').eq('kind', 'quirofano').eq('branch_id', currentBranch.id).eq('active', true).maybeSingle();
      return data;
    },
    enabled: !!currentBranch?.id
  });
  const toggleDoctor = (id: string) => {
    if (!onDoctorsChange) return;

    // Prevenir que el médico desmarque su propia agenda
    if (hasRole('doctor') && id === user?.id) {
      return;
    }
    const exists = selectedDoctorIds.includes(id);

    // En vista semanal, solo permitir un médico a la vez
    if (view === 'week') {
      onDoctorsChange(exists ? [] : [id]);
    } else {
      // En vista diaria, permitir múltiples médicos
      const next = exists ? selectedDoctorIds.filter(d => d !== id) : [...selectedDoctorIds, id];
      onDoctorsChange(next);
    }
  };
  return <Sidebar className="border-r">
      <SidebarHeader className="border-b p-3">
        <div className="flex gap-3 w-full">
          {/* Columna izquierda: Logo + Centrovisión + Central */}
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center gap-2">
              <div 
                className="bg-white border border-border p-1.5 rounded-lg cursor-pointer hover:bg-accent transition-colors" 
                onClick={handleLogoClick}
                title={hasRole('admin') ? 'Doble click para acceso especial' : ''}
              >
                <img 
                  src={centrovisionLogo} 
                  alt="Centrovisión Logo" 
                  className="h-5 w-5 object-contain"
                />
              </div>
              <h2 className="font-semibold text-base">Centrovisión</h2>
            </div>
            
            {/* Selector de Sede */}
            <div className="w-[156px]">
              <BranchSelector />
            </div>
          </div>
          
          {/* Columna derecha: Iconos centrados verticalmente */}
          <TooltipProvider>
            <div className="flex flex-col items-center justify-center gap-1">
              {hasRole('admin') && <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/admin')}>
                      <Shield className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Panel de Admin</p>
                  </TooltipContent>
                </Tooltip>}
              
              {(roles.includes('admin') || roles.includes('caja') || roles.includes('contabilidad')) && <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/caja')}>
                      <DollarSign className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Caja</p>
                  </TooltipContent>
                </Tooltip>}
            </div>
          </TooltipProvider>
        </div>
        
        {/* Botón CRM - visible para admin siempre, o para otros roles (excepto doctor) si está habilitado */}
        {(hasRole('admin') || (isCRMVisibleForAll && !hasRole('doctor'))) && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full gap-2 justify-start mt-2 relative"
            onClick={() => navigate('/crm')}
          >
            <Users className="h-4 w-4" />
            CRM Pacientes
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        )}
        
        {/* Botón Inventario Sala - solo admin y enfermería */}
        {(roles.includes('admin') || roles.includes('nurse')) && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full gap-2 justify-start mt-2"
            onClick={() => navigate('/inventario-sala')}
          >
            <Package className="h-4 w-4" />
            Inventario Sala
          </Button>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Calendario</SidebarGroupLabel>
          <SidebarGroupContent>
            <Calendar mode="single" selected={currentDate} onSelect={date => date && onDateChange(date)} className="rounded-md border w-full overflow-hidden" />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>
            Médicos
            <Badge variant="secondary" className="ml-2">
              {doctors.length}
            </Badge>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ScrollArea className="h-[360px] pr-2">
              <SidebarMenu>
                {doctors.map(doc => <SidebarMenuItem key={doc.user_id} className="flex items-center gap-2 py-2">
                    <Checkbox id={`doc-${doc.user_id}`} checked={selectedDoctorIds.includes(doc.user_id)} onCheckedChange={() => toggleDoctor(doc.user_id)} disabled={hasRole('doctor') && doc.user_id === user?.id} />
                    <label htmlFor={`doc-${doc.user_id}`} className="text-sm truncate cursor-pointer">
                      {doc.full_name}
                    </label>
                  </SidebarMenuItem>)}
                {doctors.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No hay médicos registrados</div>}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>

        {diagnosticoRoom && <Collapsible open={diagnosticoOpen} onOpenChange={setDiagnosticoOpen} className="border-b">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors">
              <span>Diagnóstico</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", diagnosticoOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-3">
              <div className="flex items-center gap-2 py-2">
                <Checkbox id="diagnostico-room" checked={showDiagnosticoRoom} onCheckedChange={checked => onDiagnosticoRoomChange?.(!!checked)} />
                <label htmlFor="diagnostico-room" className="text-sm truncate cursor-pointer">
                  Diagnóstico/Estudios
                </label>
              </div>
            </CollapsibleContent>
          </Collapsible>}

        {quirofanoRoom && <Collapsible open={quirofanoOpen} onOpenChange={setQuirofanoOpen} className="border-b">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors">
              <span>Alquiler de Sala</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", quirofanoOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-3">
              <div className="flex items-center gap-2 py-2">
                <Checkbox id="quirofano-room" checked={showQuirofanoRoom} onCheckedChange={checked => onQuirofanoRoomChange?.(!!checked)} />
                <label htmlFor="quirofano-room" className="text-sm truncate cursor-pointer">
                  Alquiler de Sala
                </label>
              </div>
            </CollapsibleContent>
          </Collapsible>}
      </SidebarContent>
    </Sidebar>;
}