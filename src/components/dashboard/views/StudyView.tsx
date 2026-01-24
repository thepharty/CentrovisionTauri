import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileImage, Video, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { PdfThumbnail } from '@/components/pdf/PdfThumbnail';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';
import { readFileAsDataUrl } from '@/lib/localStorageHelper';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Types for Tauri commands
interface StudyLocal {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  title: string;
  eye_side: string;
  comments: string | null;
  status: string;
}

interface StudyFileLocal {
  id: string;
  study_id: string;
  file_path: string;
  mime_type: string | null;
  side: string | null;
}

interface EncounterLocal {
  id: string;
  appointment_id: string | null;
}

interface StudyViewProps {
  encounterId?: string;
  appointmentId?: string;
}

export function StudyView({ encounterId, appointmentId }: StudyViewProps) {
  const [filesWithUrls, setFilesWithUrls] = useState<any[]>([]);
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  // Fetch study data
  const { data: study, isLoading } = useQuery({
    queryKey: ['study-view', encounterId, appointmentId, connectionMode],
    queryFn: async () => {
      console.log('🔍 [StudyView] Props recibidas:', { encounterId, appointmentId });

      // En modo local, usar Tauri commands
      if (isLocalMode) {
        console.log('[StudyView] Getting study from PostgreSQL local');

        let effectiveAppointmentId = appointmentId;

        if (!effectiveAppointmentId && encounterId) {
          const encounter = await invoke<EncounterLocal | null>('get_encounter_by_id', {
            encounterId: encounterId,
          });
          effectiveAppointmentId = encounter?.appointment_id || null;
        }

        if (!effectiveAppointmentId) return null;

        const studies = await invoke<StudyLocal[]>('get_studies_by_appointment', {
          appointmentId: effectiveAppointmentId,
        });
        return studies[0] || null;
      }

      // Modo Supabase
      // @ts-ignore - Type inference issue with Supabase query
      let query = supabase.from('studies').select('*');

      if (appointmentId) {
        console.log('📍 [StudyView] Buscando por appointment_id:', appointmentId);
        query = query.eq('appointment_id', appointmentId);
      } else if (encounterId) {
        console.log('📍 [StudyView] Buscando por encounter_id:', encounterId);
        // Buscar por encounter_id no funciona ya que studies no tiene esa columna
        // En su lugar, buscar el appointment_id del encounter
        const { data: encounter } = await supabase
          .from('encounters')
          .select('appointment_id')
          .eq('id', encounterId)
          .single();

        console.log('📋 [StudyView] Encounter encontrado:', encounter);

        if (encounter?.appointment_id) {
          console.log('✓ [StudyView] Usando appointment_id del encounter:', encounter.appointment_id);
          query = query.eq('appointment_id', encounter.appointment_id);
        } else {
          console.log('❌ [StudyView] No se encontró appointment_id en el encounter');
          return null;
        }
      }

      const { data, error } = await query.maybeSingle();

      console.log('✅ [StudyView] Resultado de query studies:', { data, error });

      if (error) throw error;
      return data;
    },
    enabled: !!(encounterId || appointmentId),
  });

  // Fetch study files
  const { data: studyFiles } = useQuery<any[]>({
    queryKey: ['study-files', study?.id, connectionMode],
    queryFn: async () => {
      console.log('📁 [StudyView] Buscando archivos para study_id:', study?.id);
      if (!study?.id) return [];

      // En modo local, usar Tauri command para obtener archivos
      if (isLocalMode) {
        console.log('[StudyView] Getting study files from PostgreSQL local');
        // Obtener los estudios con sus archivos incluidos
        const studies = await invoke<any[]>('get_studies_by_patient', {
          patientId: study.patient_id
        });
        // Buscar el estudio específico y retornar sus archivos
        const currentStudy = studies.find(s => s.id === study.id);
        return currentStudy?.study_files || [];
      }

      // @ts-ignore - Type inference issue with Supabase query
      const { data, error } = await supabase
        .from('study_files')
        .select('*')
        .eq('study_id', study.id);

      console.log('✅ [StudyView] Archivos encontrados:', { count: data?.length, data, error });

      if (error) throw error;
      return data || [];
    },
    enabled: !!study?.id,
  });

  // Get signed URLs when files are loaded
  useEffect(() => {
    const fetchSignedUrls = async () => {
      console.log('🔗 [StudyView] Generando URLs firmadas para:', studyFiles?.length, 'archivos');
      if (!studyFiles || studyFiles.length === 0) {
        setFilesWithUrls([]);
        return;
      }

      // En modo local, usar readFileAsDataUrl para obtener archivos locales
      if (isLocalMode) {
        console.log('[StudyView] Loading files from local SMB storage');
        const filesWithLocalUrls = await Promise.all(
          studyFiles.map(async (file) => {
            try {
              const dataUrl = await readFileAsDataUrl('studies', file.file_path);
              console.log('🔐 [StudyView] Local URL generada para:', file.file_path, dataUrl ? '✓' : '✗');
              return { ...file, signedUrl: dataUrl || '' };
            } catch (error) {
              console.error('[StudyView] Error loading local file:', file.file_path, error);
              return { ...file, signedUrl: '' };
            }
          })
        );
        console.log('✅ [StudyView] Local URLs generadas:', filesWithLocalUrls.length);
        setFilesWithUrls(filesWithLocalUrls);
        return;
      }

      // Modo Supabase - usar URLs firmadas
      const filesWithSignedUrls = await Promise.all(
        studyFiles.map(async (file) => {
          const { data } = await supabase.storage
            .from('studies')
            .createSignedUrl(file.file_path, 3600);
          console.log('🔐 [StudyView] URL firmada generada para:', file.file_path, data?.signedUrl ? '✓' : '✗');
          return { ...file, signedUrl: data?.signedUrl };
        })
      );
      console.log('✅ [StudyView] URLs firmadas generadas:', filesWithSignedUrls.length);
      setFilesWithUrls(filesWithSignedUrls);
    };

    fetchSignedUrls();
  }, [studyFiles, isLocalMode]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!study) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No hay datos de estudio disponibles.
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

  const getFileType = (file: any): 'image' | 'video' | 'pdf' | 'other' => {
    // Primero intentar por mime_type
    if (file.mime_type?.startsWith('image/')) return 'image';
    if (file.mime_type?.startsWith('video/')) return 'video';
    if (file.mime_type === 'application/pdf') return 'pdf';

    // Fallback: detectar por extensión del archivo
    const ext = file.file_path?.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
    if (ext === 'pdf') return 'pdf';

    return 'other';
  };

  const handleDownload = async (url: string, fileName: string) => {
    try {
      // Fetch el archivo como blob para poder descargarlo (cross-origin)
      const response = await fetch(url);
      const blob = await response.blob();

      // Crear URL temporal del blob
      const blobUrl = window.URL.createObjectURL(blob);

      // Crear link y forzar descarga
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      // Limpiar
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error al descargar archivo:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Información del Estudio */}
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4">Información del Estudio</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Título de estudio</Label>
            <div className="px-3 py-2 rounded-md border bg-muted text-sm mt-2">
              {study.title}
            </div>
          </div>
          <div>
            <Label>Ojo</Label>
            <div className="mt-2">
              <Badge className={getEyeColor(study.eye_side)} variant="outline">
                {study.eye_side}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Archivos Adjuntos */}
      {filesWithUrls && filesWithUrls.length > 0 && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Archivos Adjuntos</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filesWithUrls.map((file: any) => (
              <div
                key={file.id}
                className="relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow group"
              >
                {(() => {
                  const fileType = getFileType(file);

                  if (fileType === 'image') {
                    return (
                      <img
                        src={file.signedUrl || ''}
                        alt="Estudio"
                        className="w-full h-32 object-cover"
                      />
                    );
                  }

                  if (fileType === 'video') {
                    return (
                      <div className="relative w-full h-32 bg-muted flex items-center justify-center">
                        <Video className="h-12 w-12 text-muted-foreground" />
                        <video
                          src={file.signedUrl || ''}
                          className="absolute inset-0 w-full h-full object-cover opacity-50"
                        />
                      </div>
                    );
                  }

                  if (fileType === 'pdf') {
                    return (
                      <PdfThumbnail
                        src={file.signedUrl || ''}
                        className="w-full h-32"
                      />
                    );
                  }

                  return (
                    <div className="w-full h-32 bg-muted flex items-center justify-center">
                      <FileImage className="h-12 w-12 text-muted-foreground" />
                    </div>
                  );
                })()}
                <div className="p-2 bg-card flex items-center justify-between">
                  <span className="text-xs truncate flex-1">
                    {file.file_path.split('/').pop()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 ml-1"
                    onClick={() => handleDownload(file.signedUrl, file.file_path.split('/').pop())}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comentarios */}
      {study.comments && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Comentarios</h2>
          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
            {study.comments}
          </div>
        </div>
      )}
    </div>
  );
}
