import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

export interface CRMProcedureType {
  id: string;
  name: string;
  color: string;
  default_stages: string[];
  display_order: number;
  active: boolean;
  created_at: string;
}

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export const useCRMProcedureTypes = () => {
  const { connectionMode } = useNetworkStatus();

  return useQuery({
    queryKey: ['crm-procedure-types', connectionMode],
    queryFn: async () => {
      // En modo local, usar Tauri command
      if ((connectionMode === 'local' || connectionMode === 'offline') && isTauri()) {
        console.log('[useCRMProcedureTypes] Loading from PostgreSQL local');
        const data = await invoke<CRMProcedureType[]>('get_crm_procedure_types');
        return data;
      }

      // En modo Supabase
      const { data, error } = await supabase
        .from('crm_procedure_types')
        .select('*')
        .eq('active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data as CRMProcedureType[];
    },
  });
};
