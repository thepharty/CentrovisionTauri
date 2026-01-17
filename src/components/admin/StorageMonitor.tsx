import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { HardDrive, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface BucketStats {
  bucket_id: string;
  total_files: number;
  total_bytes: number;
}

const STORAGE_LIMIT_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB

const bucketNames: Record<string, string> = {
  documents: 'Documentos',
  results: 'Resultados',
  studies: 'Estudios',
  surgeries: 'Cirugías',
};

export default function StorageMonitor() {
  const { data: bucketStats = [], isLoading, refetch, isFetching } = useQuery<BucketStats[]>({
    queryKey: ['storage-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_storage_stats');

      if (error) throw error;

      // Parse the JSON result from the RPC function
      return (Array.isArray(data) ? data : []) as unknown as BucketStats[];
    },
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  const totalBytes = bucketStats.reduce((sum, bucket) => sum + bucket.total_bytes, 0);
  const totalFiles = bucketStats.reduce((sum, bucket) => sum + bucket.total_files, 0);
  const usagePercentage = (totalBytes / STORAGE_LIMIT_BYTES) * 100;

  const getStatusBadge = () => {
    if (usagePercentage >= 90) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Crítico
        </Badge>
      );
    }
    if (usagePercentage >= 80) {
      return (
        <Badge variant="destructive" className="gap-1 bg-orange-500">
          <AlertTriangle className="h-3 w-3" />
          Advertencia
        </Badge>
      );
    }
    if (usagePercentage >= 60) {
      return (
        <Badge variant="default" className="gap-1 bg-yellow-500">
          <AlertTriangle className="h-3 w-3" />
          Atención
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="gap-1 bg-green-500">
        <CheckCircle2 className="h-3 w-3" />
        Normal
      </Badge>
    );
  };

  const handleRefresh = async () => {
    await refetch();
    toast({
      title: 'Actualizado',
      description: 'Los datos de almacenamiento han sido actualizados.',
    });
  };

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            <CardTitle>Monitoreo de Almacenamiento</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>
          Uso actual del espacio de almacenamiento en Lovable Cloud
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando datos...</div>
        ) : (
          <>
            {/* Total Storage Usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Uso Total</span>
                <span className="text-muted-foreground">
                  {formatBytes(totalBytes)} / {formatBytes(STORAGE_LIMIT_BYTES)} ({usagePercentage.toFixed(1)}%)
                </span>
              </div>
              <Progress value={usagePercentage} className="h-3" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{totalFiles.toLocaleString('es-ES')} archivos totales</span>
                <span>{formatBytes(STORAGE_LIMIT_BYTES - totalBytes)} disponibles</span>
              </div>
            </div>

            {/* Bucket Breakdown */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Desglose por Bucket</h4>
              <div className="space-y-3">
                {bucketStats.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No hay archivos almacenados aún
                  </div>
                ) : (
                  bucketStats.map((bucket) => {
                    const bucketPercentage = (bucket.total_bytes / totalBytes) * 100;
                    return (
                      <div key={bucket.bucket_id} className="flex items-center gap-3 p-3 border rounded-lg">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">
                              {bucketNames[bucket.bucket_id] || bucket.bucket_id}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {bucket.total_files.toLocaleString('es-ES')} archivos
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatBytes(bucket.total_bytes)}</span>
                            <span>{bucketPercentage.toFixed(1)}% del total</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Warning Messages */}
            {usagePercentage >= 80 && (
              <div className="p-4 border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-950 rounded">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Advertencia: Espacio limitado
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                  {usagePercentage >= 90
                    ? 'Espacio crítico. Contacte a soporte de Lovable para ampliar su plan.'
                    : 'Se recomienda contactar a soporte de Lovable para ampliar su almacenamiento.'}
                </p>
              </div>
            )}

            {/* Refresh Button */}
            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-xs text-muted-foreground">
                Actualización automática cada 5 minutos
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
