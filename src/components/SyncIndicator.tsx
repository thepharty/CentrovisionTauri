import { Cloud, Server, WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { isTauri } from '@/lib/dataSource';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function SyncIndicator() {
  const { syncStatus, isSyncing, connectionMode, connectionStatus } = useNetworkStatus();

  // Don't show in web mode
  if (!isTauri()) {
    return null;
  }

  const pendingChanges = syncStatus?.pending_changes ?? 0;

  const getStatusIcon = () => {
    if (isSyncing) {
      return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
    }

    switch (connectionMode) {
      case 'supabase':
        return <Cloud className="h-4 w-4 text-green-500" />;
      case 'local':
        return <Server className="h-4 w-4 text-yellow-500" />;
      case 'offline':
      default:
        return <WifiOff className="h-4 w-4 text-red-500" />;
    }
  };

  const getTooltipText = () => {
    if (isSyncing) {
      return 'Sincronizando...';
    }

    const pendingText = pendingChanges > 0 ? ` (${pendingChanges} cambios pendientes)` : '';

    switch (connectionMode) {
      case 'supabase':
        return `Conectado a la nube${pendingText}`;
      case 'local':
        const serverIp = connectionStatus?.local_server_ip || 'servidor local';
        return `Usando ${serverIp}${pendingText}`;
      case 'offline':
      default:
        return `Sin conexión${pendingText}`;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center p-1.5 cursor-default">
            {getStatusIcon()}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-sm font-medium">{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
