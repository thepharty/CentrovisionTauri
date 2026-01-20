import { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isTauri, checkNetworkStatus, getSyncStatus, processSyncQueue, getConnectionStatus, SyncStatus, ConnectionStatus } from '@/lib/dataSource';

// Supabase API key for sync (from env)
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Connection modes
export type ConnectionMode = 'supabase' | 'local' | 'offline';

interface NetworkStatusContextType {
  isOnline: boolean;
  syncStatus: SyncStatus | null;
  refreshStatus: () => Promise<void>;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
  connectionMode: ConnectionMode;
  connectionStatus: ConnectionStatus | null;
}

const NetworkStatusContext = createContext<NetworkStatusContextType>({
  isOnline: true,
  syncStatus: null,
  refreshStatus: async () => {},
  isSyncing: false,
  triggerSync: async () => {},
  connectionMode: 'supabase',
  connectionStatus: null,
});

export const useNetworkStatus = () => useContext(NetworkStatusContext);

export const NetworkStatusProvider = ({ children }: { children: ReactNode }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('supabase');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const syncInProgress = useRef(false);
  const queryClient = useQueryClient();

  const refreshStatus = useCallback(async () => {
    try {
      if (isTauri()) {
        // In Tauri mode, check network, sync status, and connection mode
        const online = await checkNetworkStatus();
        setIsOnline(online);

        const status = await getSyncStatus();
        setSyncStatus(status);

        // Get connection mode (supabase, local, or offline)
        try {
          const connStatus = await getConnectionStatus();
          setConnectionStatus(connStatus);
          setConnectionMode(connStatus.mode as ConnectionMode);
        } catch (e) {
          console.warn('Failed to get connection status:', e);
          // Fallback based on online status
          setConnectionMode(online ? 'supabase' : 'offline');
        }
      } else {
        // In web mode, use browser's online status
        setIsOnline(navigator.onLine);
        setConnectionMode(navigator.onLine ? 'supabase' : 'offline');
        setSyncStatus({
          last_sync: null,
          pending_changes: 0,
          is_online: navigator.onLine,
        });
        setConnectionStatus({
          mode: navigator.onLine ? 'supabase' : 'offline',
          supabase_available: navigator.onLine,
          local_available: false,
          local_server_ip: null,
          description: navigator.onLine ? 'Conectado a la nube' : 'Sin conexión',
        });
      }
    } catch (error) {
      console.error('Failed to refresh network status:', error);
    }
  }, []);

  // Process sync queue when online
  const triggerSync = useCallback(async () => {
    if (!isTauri() || syncInProgress.current || !SUPABASE_KEY) return;

    try {
      syncInProgress.current = true;
      setIsSyncing(true);

      const result = await processSyncQueue(SUPABASE_KEY);
      console.log('Sync result:', result);

      if (result.failed > 0) {
        console.warn('Some items failed to sync:', result.errors);
      }

      // Refresh status after sync
      await refreshStatus();

      // Invalidate queries to refresh data from Supabase after sync
      if (result.succeeded > 0) {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['patients'] });
        queryClient.invalidateQueries({ queryKey: ['patients-search'] });
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      syncInProgress.current = false;
      setIsSyncing(false);
    }
  }, [refreshStatus]);

  // Initial status check
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Browser online/offline events (for both web and Tauri)
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      await refreshStatus();
      // Auto-sync when coming back online
      if (isTauri()) {
        triggerSync();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (syncStatus) {
        setSyncStatus({ ...syncStatus, is_online: false });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshStatus, syncStatus, triggerSync]);

  // Periodic status check and auto-sync (every 10 seconds in Tauri mode)
  useEffect(() => {
    if (!isTauri()) return;

    const interval = setInterval(async () => {
      await refreshStatus();
      // Auto-sync if online and has pending changes
      if (isOnline && syncStatus && syncStatus.pending_changes > 0) {
        triggerSync();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [refreshStatus, triggerSync, isOnline, syncStatus]);

  return (
    <NetworkStatusContext.Provider
      value={{
        isOnline,
        syncStatus,
        refreshStatus,
        isSyncing,
        triggerSync,
        connectionMode,
        connectionStatus,
      }}
    >
      {children}
    </NetworkStatusContext.Provider>
  );
};
