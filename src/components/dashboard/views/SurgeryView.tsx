import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileImage } from 'lucide-react';
import React from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';
import { readFileAsDataUrl } from '@/lib/localStorageHelper';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Types for Tauri commands
interface SurgeryLocal {
  id: string;
  encounter_id: string;
  tipo_cirugia: string | null;
  ojo_operar: string | null;
  nota_operatoria: string | null;
  medicacion: string | null;
  surgery_files?: SurgeryFileLocal[];
}

interface SurgeryFileLocal {
  id: string;
  surgery_id: string;
  file_path: string;
  mime_type: string | null;
}

interface SurgeryViewProps {
  encounterId: string;
}

export function SurgeryView({ encounterId }: SurgeryViewProps) {
  const [filesWithUrls, setFilesWithUrls] = React.useState<Array<{ id: string; url: string; mime_type: string }>>([]);
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  const { data: surgery, isLoading } = useQuery({
    queryKey: ['surgery-view', encounterId, connectionMode],
    queryFn: async () => {
      // En modo local, usar Tauri command con archivos
      if (isLocalMode) {
        console.log('[SurgeryView] Getting surgery from PostgreSQL local');
        // Primero obtener el encounter para obtener el appointment_id
        const encounter = await invoke<any>('get_encounter_by_id', { encounterId });
        if (!encounter?.appointment_id) {
          console.log('[SurgeryView] No appointment_id found in encounter');
          return null;
        }

        const surgeries = await invoke<SurgeryLocal[]>('get_surgeries_by_appointment', {
          appointmentId: encounter.appointment_id,
        });
        const surgery = surgeries.find(s => s.encounter_id === encounterId);
        return surgery || null;
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('surgeries')
        .select('*, surgery_files(*)')
        .eq('encounter_id', encounterId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  // Generar URLs firmadas para los archivos
  React.useEffect(() => {
    const generateUrls = async () => {
      if (!surgery?.surgery_files || surgery.surgery_files.length === 0) {
        setFilesWithUrls([]);
        return;
      }

      // En modo local, usar readFileAsDataUrl para obtener archivos locales
      if (isLocalMode) {
        console.log('[SurgeryView] Loading files from local SMB storage');
        const filesWithLocalUrls = await Promise.all(
          surgery.surgery_files.map(async (file: any) => {
            try {
              const dataUrl = await readFileAsDataUrl('surgeries', file.file_path);
              return {
                id: file.id,
                url: dataUrl || '',
                mime_type: file.mime_type || ''
              };
            } catch (error) {
              console.error('[SurgeryView] Error loading local file:', file.file_path, error);
              return {
                id: file.id,
                url: '',
                mime_type: file.mime_type || ''
              };
            }
          })
        );
        setFilesWithUrls(filesWithLocalUrls.filter(f => f.url));
        return;
      }

      // Modo Supabase - usar URLs firmadas
      const filesWithSignedUrls = await Promise.all(
        surgery.surgery_files.map(async (file: any) => {
          const { data } = await supabase.storage
            .from('surgeries')
            .createSignedUrl(file.file_path, 3600);
          return {
            id: file.id,
            url: data?.signedUrl || '',
            mime_type: file.mime_type || ''
          };
        })
      );
      setFilesWithUrls(filesWithSignedUrls);
    };
    generateUrls();
  }, [surgery, isLocalMode]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!surgery) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No hay datos de cirugía disponibles.
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
      {/* Información de la Cirugía */}
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4">Información de la Cirugía</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Tipo de Cirugía</Label>
            <div className="px-3 py-2 rounded-md border bg-muted text-sm mt-2">
              {surgery.tipo_cirugia || 'No especificado'}
            </div>
          </div>
          <div>
            <Label>Ojo Operado</Label>
            <div className="px-3 py-2 rounded-md border bg-muted text-sm mt-2">
              {surgery.ojo_operar || '-'}
            </div>
          </div>
        </div>
      </div>

      {/* Nota operatoria */}
      {surgery.nota_operatoria && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Nota operatoria</h2>
          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
            {surgery.nota_operatoria}
          </div>
        </div>
      )}

      {/* Medicación */}
      {surgery.medicacion && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Medicación</h2>
          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
            {surgery.medicacion}
          </div>
        </div>
      )}

      {/* Imágenes y Documentos */}
      {filesWithUrls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Imágenes y Documentos de Cirugía ({filesWithUrls.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filesWithUrls.map((file) => (
                <div 
                  key={file.id} 
                  className="relative border rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => window.open(file.url, '_blank')}
                >
                  {file.mime_type?.startsWith('image/') ? (
                    <img
                      src={file.url}
                      alt="Imagen de cirugía"
                      className="w-full h-40 object-cover"
                    />
                  ) : file.mime_type?.startsWith('video/') ? (
                    <video
                      src={file.url}
                      className="w-full h-40 object-cover"
                    />
                  ) : (
                    <div className="w-full h-40 bg-muted flex items-center justify-center">
                      <FileImage className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
