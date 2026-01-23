import { useState, useEffect } from 'react';
import { Cloud, Server, WifiOff, RefreshCcw, ArrowUpDown } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAuth } from '@/hooks/useAuth';
import { isTauri, getSyncPendingDetails, SyncPendingDetail } from '@/lib/dataSource';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Traducción de nombres de tablas para mostrar en español
const TABLE_NAMES_ES: Record<string, string> = {
  appointments: 'citas',
  patients: 'pacientes',
  encounters: 'consultas',
  invoices: 'facturas',
  payments: 'pagos',
  surgeries: 'cirugías',
  studies: 'estudios',
  procedures: 'procedimientos',
  diagnoses: 'diagnósticos',
  crm_pipelines: 'pipelines CRM',
  schedule_blocks: 'bloqueos',
};

export function SyncIndicator() {
  const { syncStatus, isSyncing, connectionMode, syncPendingStatus, connectionStatus, lastChecked } = useNetworkStatus();
  const { hasRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingDetails, setPendingDetails] = useState<SyncPendingDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const isAdmin = hasRole('admin');

  // Fetch detailed pending items when popover opens
  useEffect(() => {
    if (isOpen && isAdmin && isTauri()) {
      setLoadingDetails(true);
      getSyncPendingDetails(20)
        .then(details => {
          setPendingDetails(details);
        })
        .catch(err => {
          console.warn('Failed to get sync pending details:', err);
          setPendingDetails([]);
        })
        .finally(() => {
          setLoadingDetails(false);
        });
    }
  }, [isOpen, isAdmin]);

  // Don't show in web mode
  if (!isTauri()) {
    return null;
  }

  const pendingChanges = syncStatus?.pending_changes ?? 0;
  const totalPending = syncPendingStatus?.total_pending ?? 0;

  // Usa el mayor entre los dos conteos de pendientes
  const hasPendingSync = totalPending > 0 || pendingChanges > 0;
  const pendingCount = Math.max(totalPending, pendingChanges);

  const getStatusIcon = () => {
    // Si está sincronizando, mostrar flechas circulares girando
    if (isSyncing) {
      return <RefreshCcw className="h-4 w-4 animate-spin text-blue-500" />;
    }

    // Si hay pendientes de sync, mostrar flechas animadas
    if (hasPendingSync && connectionMode === 'local') {
      return (
        <div className="relative">
          <ArrowUpDown className="h-4 w-4 text-yellow-500 animate-pulse" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500 text-[8px] text-white font-bold items-center justify-center">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          </span>
        </div>
      );
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

  const getStatusText = () => {
    if (isSyncing) return 'Sincronizando...';
    switch (connectionMode) {
      case 'supabase':
        return 'Conectado a la nube';
      case 'local':
        return hasPendingSync ? 'Servidor Local - Pendientes' : 'Servidor Local - Sincronizado';
      case 'offline':
      default:
        return 'Sin conexión';
    }
  };

  const getTooltipContent = () => {
    if (isSyncing) {
      return <p className="text-sm font-medium">Sincronizando...</p>;
    }

    const pendingText = pendingCount > 0 ? ` (${pendingCount} pendientes)` : '';

    switch (connectionMode) {
      case 'supabase':
        return <p className="text-sm font-medium">Conectado a la nube{pendingText}</p>;
      case 'local':
        return (
          <p className="text-sm font-medium">
            Servidor Local{hasPendingSync ? ` - ${pendingCount} pendientes` : ' - Sincronizado'}
            {isAdmin && <span className="block text-xs text-muted-foreground">Click para ver detalle</span>}
          </p>
        );
      case 'offline':
      default:
        return <p className="text-sm font-medium">Sin conexión{pendingText}</p>;
    }
  };

  // Contenido del popover para admins
  const getPopoverContent = () => {
    // Determinar estado real de PostgreSQL local
    const localServerConnected = connectionStatus?.local_available || connectionMode === 'local';
    const localServerConfigured = connectionStatus?.local_server_ip != null;

    return (
      <div className="min-w-[420px] space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b">
          {getStatusIcon()}
          <span className="font-medium">{getStatusText()}</span>
        </div>

        {/* Estado de conexiones */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">Conexiones</p>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span>Supabase:</span>
              <span className={connectionStatus?.supabase_available ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                {connectionStatus?.supabase_available ? 'Conectado' : 'Sin conexión'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>PostgreSQL Local:</span>
              <span className={localServerConnected ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                {localServerConnected ? `Conectado (${connectionStatus?.local_server_ip})` :
                 localServerConfigured ? 'No disponible' : 'No configurado'}
              </span>
            </div>
          </div>
        </div>

        {/* Cambios pendientes - resumen */}
        {syncPendingStatus && syncPendingStatus.by_table && syncPendingStatus.by_table.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Cambios pendientes de sincronizar ({totalPending})
            </p>
            <div className="text-sm space-y-0.5">
              {syncPendingStatus.by_table.map((item) => (
                <div key={item.table_name} className="flex justify-between text-xs">
                  <span>{TABLE_NAMES_ES[item.table_name] || item.table_name}:</span>
                  <span className="font-medium text-yellow-600">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detalle de pendientes para debugging */}
        {pendingDetails.length > 0 && (
          <div className="space-y-1 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Detalle (Debug)
            </p>
            {loadingDetails ? (
              <div className="text-xs text-muted-foreground">Cargando...</div>
            ) : (
              <div className="text-xs space-y-1 max-h-40 overflow-y-auto font-mono bg-muted/50 p-2 rounded">
                {pendingDetails.map((detail) => (
                  <div key={detail.id} className="flex flex-col border-b border-muted pb-1 last:border-0">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{TABLE_NAMES_ES[detail.table_name] || detail.table_name}</span>
                      <span className={detail.operation === 'INSERT' ? 'text-green-600' :
                                       detail.operation === 'UPDATE' ? 'text-blue-600' : 'text-red-600'}>
                        {detail.operation}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate" title={detail.record_id}>
                      ID: {detail.record_id}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(detail.created_at).toLocaleString('es-MX')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sin pendientes - solo mostrar si no hay detalles tampoco */}
        {(!syncPendingStatus?.by_table || syncPendingStatus.by_table.length === 0) && pendingDetails.length === 0 && (
          <div className="text-sm text-green-600 flex items-center gap-2">
            <span>✓</span> Todo sincronizado
          </div>
        )}

        {/* Info de última verificación */}
        {lastChecked && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Última verificación: {lastChecked.toLocaleString('es-GT', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}
          </div>
        )}
      </div>
    );
  };

  // Para admin: Popover clickeable
  if (isAdmin) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button className="flex items-center p-1.5 hover:bg-accent rounded-md transition-colors">
                  {getStatusIcon()}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="bottom" className="max-w-xs">
                {getTooltipContent()}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <PopoverContent side="bottom" align="end" className="p-3 w-auto">
          {getPopoverContent()}
        </PopoverContent>
      </Popover>
    );
  }

  // Para no-admin: Solo tooltip
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center p-1.5 cursor-default">
            {getStatusIcon()}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {getTooltipContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
