import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { 
  Camera, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  TrendingDown,
  TrendingUp,
  Minus,
  RefreshCw,
  History
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface TableCount {
  name: string;
  label: string;
  count: number;
}

interface BackupSnapshot {
  id: string;
  created_at: string;
  created_by: string | null;
  snapshot_type: 'manual' | 'auto_export' | 'scheduled';
  table_counts: Record<string, number>;
  notes: string | null;
}

const CRITICAL_TABLES = [
  { name: 'patients', label: 'Pacientes' },
  { name: 'appointments', label: 'Citas' },
  { name: 'encounters', label: 'Encuentros' },
  { name: 'exam_eye', label: 'Exámenes Oculares' },
  { name: 'diagnoses', label: 'Diagnósticos' },
  { name: 'surgeries', label: 'Cirugías' },
  { name: 'procedures', label: 'Procedimientos' },
  { name: 'invoices', label: 'Facturas' },
  { name: 'invoice_items', label: 'Items Factura' },
  { name: 'payments', label: 'Pagos' },
  { name: 'profiles', label: 'Perfiles' },
  { name: 'user_roles', label: 'Roles' },
];

export default function BackupManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  // Fetch current table counts
  const { data: currentCounts = [], isLoading: isLoadingCounts, refetch: refetchCounts } = useQuery({
    queryKey: ['backup-table-counts'],
    queryFn: async () => {
      const counts: TableCount[] = [];
      
      for (const table of CRITICAL_TABLES) {
        try {
          const { count } = await supabase
            .from(table.name as any)
            .select('*', { count: 'exact', head: true });
          counts.push({ name: table.name, label: table.label, count: count || 0 });
        } catch (e) {
          counts.push({ name: table.name, label: table.label, count: 0 });
        }
      }
      
      return counts;
    },
    refetchInterval: 60000,
  });

  // Fetch snapshot history
  const { data: snapshots = [], isLoading: isLoadingSnapshots } = useQuery({
    queryKey: ['backup-snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backup_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      return data as BackupSnapshot[];
    },
  });

  // Create snapshot mutation
  const createSnapshotMutation = useMutation({
    mutationFn: async (notes?: string) => {
      // Build table counts object
      const tableCounts: Record<string, number> = {};
      for (const tc of currentCounts) {
        tableCounts[tc.name] = tc.count;
      }

      const { data, error } = await supabase
        .from('backup_snapshots')
        .insert({
          created_by: user?.id,
          snapshot_type: 'manual',
          table_counts: tableCounts,
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Snapshot creado',
        description: 'El estado actual de las tablas ha sido guardado.',
      });
      queryClient.invalidateQueries({ queryKey: ['backup-snapshots'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el snapshot.',
        variant: 'destructive',
      });
    },
  });

  const handleCreateSnapshot = async () => {
    setIsCreatingSnapshot(true);
    await refetchCounts();
    await createSnapshotMutation.mutateAsync('Snapshot manual');
    setIsCreatingSnapshot(false);
  };

  // Compare current counts with last snapshot
  const lastSnapshot = snapshots[0];
  const getChangeIndicator = (tableName: string, currentCount: number) => {
    if (!lastSnapshot) return null;
    
    const previousCount = lastSnapshot.table_counts[tableName] || 0;
    const diff = currentCount - previousCount;
    const percentChange = previousCount > 0 ? ((diff / previousCount) * 100) : 0;

    if (diff === 0) {
      return <Minus className="h-4 w-4 text-muted-foreground" />;
    } else if (diff > 0) {
      return (
        <div className="flex items-center gap-1 text-green-600">
          <TrendingUp className="h-4 w-4" />
          <span className="text-xs">+{diff}</span>
        </div>
      );
    } else {
      // Check if reduction is drastic (>5%)
      const isDrastic = percentChange < -5;
      return (
        <div className={`flex items-center gap-1 ${isDrastic ? 'text-destructive' : 'text-orange-500'}`}>
          <TrendingDown className="h-4 w-4" />
          <span className="text-xs">{diff}</span>
          {isDrastic && <AlertTriangle className="h-3 w-3" />}
        </div>
      );
    }
  };

  // Check for drastic reductions
  const hasAlerts = lastSnapshot && currentCounts.some(tc => {
    const previousCount = lastSnapshot.table_counts[tc.name] || 0;
    if (previousCount === 0) return false;
    const percentChange = ((tc.count - previousCount) / previousCount) * 100;
    return percentChange < -5;
  });

  const totalRecords = currentCounts.reduce((sum, tc) => sum + tc.count, 0);

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {hasAlerts && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">¡Alerta de Reducción de Datos!</p>
                <p className="text-sm text-muted-foreground">
                  Se detectó una reducción mayor al 5% en una o más tablas desde el último snapshot.
                  Revisa los cambios antes de continuar.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current State */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Estado Actual
                </CardTitle>
                <CardDescription>
                  {totalRecords.toLocaleString()} registros en tablas críticas
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchCounts()}
                  disabled={isLoadingCounts}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingCounts ? 'animate-spin' : ''}`} />
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleCreateSnapshot}
                  disabled={isCreatingSnapshot || isLoadingCounts}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {isCreatingSnapshot ? 'Guardando...' : 'Crear Snapshot'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {isLoadingCounts ? (
                  <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                ) : (
                  currentCounts.map((tc) => (
                    <div 
                      key={tc.name}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="font-medium">{tc.label}</div>
                        <Badge variant="secondary" className="font-mono">
                          {tc.count.toLocaleString()}
                        </Badge>
                      </div>
                      {getChangeIndicator(tc.name, tc.count)}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Snapshot History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial de Snapshots
            </CardTitle>
            <CardDescription>
              Últimos {snapshots.length} snapshots guardados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {isLoadingSnapshots ? (
                  <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                ) : snapshots.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No hay snapshots guardados</p>
                    <p className="text-sm">Crea tu primer snapshot para comenzar el seguimiento</p>
                  </div>
                ) : (
                  snapshots.map((snapshot, index) => {
                    const totalInSnapshot = Object.values(snapshot.table_counts).reduce((a, b) => a + b, 0);
                    const prevSnapshot = snapshots[index + 1];
                    const prevTotal = prevSnapshot 
                      ? Object.values(prevSnapshot.table_counts).reduce((a, b) => a + b, 0)
                      : totalInSnapshot;
                    const diff = totalInSnapshot - prevTotal;

                    return (
                      <div 
                        key={snapshot.id}
                        className="p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant={snapshot.snapshot_type === 'manual' ? 'default' : 'secondary'}
                              >
                                {snapshot.snapshot_type === 'manual' ? 'Manual' : 
                                 snapshot.snapshot_type === 'auto_export' ? 'Auto Export' : 'Programado'}
                              </Badge>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(snapshot.created_at), { 
                                  addSuffix: true, 
                                  locale: es 
                                })}
                              </span>
                            </div>
                            <p className="text-sm font-medium">
                              {totalInSnapshot.toLocaleString()} registros totales
                            </p>
                            {snapshot.notes && (
                              <p className="text-xs text-muted-foreground">{snapshot.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {diff === 0 ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : diff > 0 ? (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <TrendingUp className="h-4 w-4" />
                                +{diff}
                              </span>
                            ) : (
                              <span className="text-xs text-orange-500 flex items-center gap-1">
                                <TrendingDown className="h-4 w-4" />
                                {diff}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Table counts preview */}
                        <div className="mt-2 pt-2 border-t">
                          <div className="flex flex-wrap gap-1">
                            {CRITICAL_TABLES.slice(0, 6).map(table => (
                              <Badge key={table.name} variant="outline" className="text-xs">
                                {table.label}: {(snapshot.table_counts[table.name] || 0).toLocaleString()}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Sistema de Protección de Datos Activo</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>ON DELETE SET NULL</strong>: Los registros relacionados NO se borran en cascada</li>
                <li>• <strong>Soft Delete</strong>: Las tablas críticas tienen columna <code>deleted_at</code> para recuperación</li>
                <li>• <strong>Snapshots</strong>: Historial de conteos para detectar pérdidas de datos</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
