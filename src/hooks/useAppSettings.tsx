import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useNetworkStatus } from './useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Types for Tauri commands
interface AppSettingLocal {
  id: string;
  key: string;
  value: any;
  description: string | null;
}

interface AppSettings {
  crm_visibility?: {
    enabled_for_all: boolean;
  };
  voice_dictation?: {
    enabled: boolean;
  };
  [key: string]: any;
}

export function useAppSettings() {
  const queryClient = useQueryClient();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['app-settings', connectionMode],
    queryFn: async () => {
      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[useAppSettings] Getting settings from PostgreSQL local');
        const data = await invoke<AppSettingLocal[]>('get_app_settings', {});
        return data?.reduce((acc, setting) => {
          acc[setting.key] = setting.value;
          return acc;
        }, {} as AppSettings) || {};
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('app_settings')
        .select('*');

      if (error) throw error;

      return data?.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as AppSettings) || {};
    },
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[useAppSettings] Updating setting in PostgreSQL local:', key);
        await invoke('update_app_setting', { key, value });
        return;
      }

      // Modo Supabase
      const { error } = await supabase
        .from('app_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast({
        title: 'Configuración actualizada',
        description: 'Los cambios han sido guardados.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar la configuración.',
        variant: 'destructive',
      });
    },
  });

  return {
    settings,
    isLoading,
    updateSetting: updateSetting.mutate,
    isUpdating: updateSetting.isPending,
    isCRMVisibleForAll: settings?.crm_visibility?.enabled_for_all ?? true,
    isVoiceDictationEnabled: settings?.voice_dictation?.enabled ?? false,
  };
}
