import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Types for Tauri commands
interface ProcedureLocal {
  id: string;
  encounter_id: string;
  tipo_procedimiento: string | null;
  ojo_operar: string | null;
}

interface ProcedureViewProps {
  encounterId: string;
}

export function ProcedureView({ encounterId }: ProcedureViewProps) {
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  const { data: procedure, isLoading } = useQuery({
    queryKey: ['procedure-view', encounterId, connectionMode],
    queryFn: async () => {
      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[ProcedureView] Getting procedure from PostgreSQL local');
        const procedures = await invoke<ProcedureLocal[]>('get_procedures_by_appointment', {
          appointmentId: null,
        });
        return procedures.find(p => p.encounter_id === encounterId) || null;
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('procedures')
        .select('*')
        .eq('encounter_id', encounterId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!procedure) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No hay datos de procedimiento disponibles.
      </div>
    );
  }

  const getEyeColor = (eye: string) => {
    const colors: Record<string, string> = {
      'OD': 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
      'OI': 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
      'OU': 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
    };
    return colors[eye] || 'bg-muted';
  };

  return (
    <div className="space-y-6">
      {/* Información del Procedimiento */}
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4">Información del Procedimiento</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Tipo de Procedimiento</Label>
            <div className="px-3 py-2 rounded-md border bg-muted text-sm mt-2">
              {procedure.tipo_procedimiento || 'No especificado'}
            </div>
          </div>
          <div>
            <Label>Ojo Operado</Label>
            <div className="px-3 py-2 rounded-md border bg-muted text-sm mt-2">
              {procedure.ojo_operar || '-'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
