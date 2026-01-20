import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Printer, Maximize } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PdfViewer } from '@/components/pdf/PdfViewer';
import { PdfThumbnail } from '@/components/pdf/PdfThumbnail';

type StudyFile = {
  id: string;
  file_path: string;
  mime_type: string | null;
  signedUrl?: string;
};

type Study = {
  id: string;
  title: string;
  eye_side: 'OD' | 'OI' | 'OU';
  comments: string | null;
  created_at: string;
  appointment_id: string;
  patient_id: string;
  study_files: StudyFile[];
  patient?: {
    first_name: string;
    last_name: string;
  };
};

export default function ViewEstudios() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [zoom, setZoom] = useState(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const lastPanPosition = useRef({ x: 0, y: 0 });
  const mainViewerRef = useRef<HTMLDivElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  // Cargar estudios del paciente
  const { data: studies, isLoading: loadingStudies } = useQuery({
    queryKey: ['patient-studies', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('studies')
        .select('*, study_files(*), patient:patients(first_name, last_name)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Generar URLs firmadas para todos los archivos
      const studiesWithUrls = await Promise.all(
        (data || []).map(async (study: any) => {
          const filesWithUrls = await Promise.all(
            (study.study_files || []).map(async (file: any) => {
              const { data: signedData } = await supabase.storage
                .from('studies')
                .createSignedUrl(file.file_path, 3600);

              return {
                ...file,
                signedUrl: signedData?.signedUrl || ''
              };
            })
          );
          return { ...study, study_files: filesWithUrls };
        })
      );

      return studiesWithUrls as Study[];
    },
    enabled: !!patientId,
  });

  // Cargar información del paciente
  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('first_name, last_name')
        .eq('id', patientId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
  });

  const viewableFiles = selectedStudy?.study_files.filter((f) =>
    f.mime_type?.startsWith('image/') || f.mime_type === 'application/pdf'
  ) || [];

  const currentFile = viewableFiles[selectedFileIndex];

  // Seleccionar el primer estudio automáticamente
  useEffect(() => {
    if (studies && studies.length > 0 && !selectedStudy) {
      setSelectedStudy(studies[0]);
      setSelectedFileIndex(0);
    }
  }, [studies, selectedStudy]);

  // Reset zoom y pan cuando cambia el archivo
  useEffect(() => {
    setZoom(1);
    setPanPosition({ x: 0, y: 0 });
  }, [selectedFileIndex, selectedStudy]);

  // Scroll filmstrip para mostrar el thumbnail seleccionado
  useEffect(() => {
    if (filmstripRef.current && viewableFiles.length > 0) {
      const thumbnail = filmstripRef.current.children[selectedFileIndex] as HTMLElement;
      if (thumbnail) {
        thumbnail.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedFileIndex, viewableFiles.length]);

  // Navegación con teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewableFiles.length === 0) return;

      if (e.key === 'ArrowLeft' && selectedFileIndex > 0) {
        setSelectedFileIndex(selectedFileIndex - 1);
      } else if (e.key === 'ArrowRight' && selectedFileIndex < viewableFiles.length - 1) {
        setSelectedFileIndex(selectedFileIndex + 1);
      } else if (e.key === 'Escape' && isFullscreen) {
        document.exitFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFileIndex, viewableFiles.length, isFullscreen]);

  // Detectar cambios de fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);


  const handleStudySelect = (study: Study) => {
    setSelectedStudy(study);
    setSelectedFileIndex(0);
    setZoom(1);
    setPanPosition({ x: 0, y: 0 });
    navigate(`/ver-estudios/${study.patient_id}`);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.25, 0.5);
      if (newZoom <= 1) setPanPosition({ x: 0, y: 0 });
      return newZoom;
    });
  };

  const handlePrevFile = () => {
    if (selectedFileIndex > 0) {
      setSelectedFileIndex(selectedFileIndex - 1);
    }
  };

  const handleNextFile = () => {
    if (selectedFileIndex < viewableFiles.length - 1) {
      setSelectedFileIndex(selectedFileIndex + 1);
    }
  };

  const handleFullscreen = () => {
    if (mainViewerRef.current) {
      if (!document.fullscreenElement) {
        mainViewerRef.current.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  };

  // Pan handlers para imágenes con zoom
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1 || currentFile?.mime_type === 'application/pdf') return;
    e.preventDefault();
    setIsPanning(true);
    lastPanPosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || zoom <= 1) return;
    const deltaX = e.clientX - lastPanPosition.current.x;
    const deltaY = e.clientY - lastPanPosition.current.y;
    setPanPosition((prev) => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY,
    }));
    lastPanPosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setIsPanning(false);
  const handleMouseLeave = () => setIsPanning(false);

  // Imprimir
  const handlePrint = () => {
    if (!currentFile) return;

    if (currentFile.mime_type === 'application/pdf') {
      window.open(currentFile.signedUrl, '_blank');
    } else if (currentFile.mime_type?.startsWith('image/')) {
      const printWindow = window.open('', '_blank');
      const studyTitle = selectedStudy?.title || 'Estudio';
      const patientName = selectedStudy?.patient
        ? `${selectedStudy.patient.first_name} ${selectedStudy.patient.last_name}`
        : '';

      printWindow?.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Imprimir ${studyTitle}</title>
            <style>
              body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }
              .header { text-align: center; margin-bottom: 20px; }
              .header h1 { margin: 0; font-size: 24px; }
              .header p { margin: 5px 0; color: #666; }
              .image-container { display: flex; justify-content: center; align-items: center; }
              img { max-width: 100%; height: auto; }
              @media print {
                body { margin: 0; padding: 10px; }
                img { max-width: 100%; page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${studyTitle}</h1>
              ${patientName ? `<p>${patientName}</p>` : ''}
              <p>Ojo: ${selectedStudy?.eye_side || ''} - ${format(new Date(selectedStudy?.created_at || ''), "d 'de' MMMM, yyyy", { locale: es })}</p>
            </div>
            <div class="image-container">
              <img src="${currentFile.signedUrl}" onload="window.print(); window.onafterprint = function() { window.close(); }" />
            </div>
          </body>
        </html>
      `);
      printWindow?.document.close();
    }
  };

  if (loadingStudies) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <div className={`border-r border-border bg-card transition-all duration-300 flex-shrink-0 ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-80'}`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={() => {
                const returnTo = searchParams.get('returnTo');
                const returnEncounterId = searchParams.get('encounterId');

                if (returnTo && returnEncounterId) {
                  navigate(`/${returnTo}/${returnEncounterId}`);
                } else if (returnTo) {
                  navigate(`/${returnTo}`);
                } else {
                  navigate('/dashboard');
                }
              }}
              className="flex-1"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </div>
          <h2 className="text-lg font-semibold">Estudios</h2>
        </div>

        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="p-4 space-y-2">
            {studies && studies.length > 0 ? (
              studies.map((study) => (
                <Button
                  key={study.id}
                  variant={selectedStudy?.id === study.id ? 'default' : 'ghost'}
                  className="w-full justify-start text-left h-auto py-3"
                  onClick={() => handleStudySelect(study)}
                >
                  <div className="w-full">
                    <div className="font-medium">{study.title}</div>
                    <div className={selectedStudy?.id === study.id ? "text-xs text-primary-foreground/80 mt-1" : "text-xs text-muted-foreground mt-1"}>
                      {format(new Date(study.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                    </div>
                    <div className={selectedStudy?.id === study.id ? "text-xs text-primary-foreground/80" : "text-xs text-muted-foreground"}>
                      Ojo: {study.eye_side} • {study.study_files.length} archivo(s)
                    </div>
                  </div>
                </Button>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8 px-4">
                Este paciente no tiene estudios registrados
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header compacto */}
        <div className="border-b border-border bg-card px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex-shrink-0"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>

          {selectedStudy && (
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="text-lg font-semibold truncate">{selectedStudy.title}</h1>
                {selectedStudy.patient && (
                  <span className="text-sm text-muted-foreground truncate">
                    • {selectedStudy.patient.first_name} {selectedStudy.patient.last_name}
                  </span>
                )}
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Ojo: {selectedStudy.eye_side}</span>
                <span>•</span>
                <span>{format(new Date(selectedStudy.created_at), "d 'de' MMMM, yyyy", { locale: es })}</span>
              </div>
            </div>
          )}
        </div>

        {/* Área principal del visor */}
        {!studies || studies.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-neutral-900">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-neutral-400 mb-2">
                Paciente no cuenta con estudios en registro
              </h2>
              {patient && (
                <p className="text-neutral-500">
                  {patient.first_name} {patient.last_name}
                </p>
              )}
            </div>
          </div>
        ) : selectedStudy && viewableFiles.length > 0 ? (
          <div className="flex-1 flex flex-col min-h-0 relative">
            {/* Visor principal */}
            <div
              ref={mainViewerRef}
              className="flex-1 relative bg-neutral-900 overflow-hidden"
            >
              {/* Contenido principal */}
              <div
                className="absolute inset-0 flex items-center justify-center overflow-hidden"
                onMouseDown={currentFile?.mime_type?.startsWith('image/') ? handleMouseDown : undefined}
                onMouseMove={currentFile?.mime_type?.startsWith('image/') ? handleMouseMove : undefined}
                onMouseUp={currentFile?.mime_type?.startsWith('image/') ? handleMouseUp : undefined}
                onMouseLeave={currentFile?.mime_type?.startsWith('image/') ? handleMouseLeave : undefined}
                style={{ cursor: zoom > 1 && currentFile?.mime_type?.startsWith('image/') ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
              >
                {currentFile?.mime_type === 'application/pdf' ? (
                  <div className="w-full h-full">
                    <PdfViewer
                      src={currentFile.signedUrl || ''}
                      height="100%"
                      showControls={true}
                    />
                  </div>
                ) : currentFile?.mime_type?.startsWith('image/') ? (
                  <img
                    src={currentFile.signedUrl}
                    alt={`Imagen ${selectedFileIndex + 1}`}
                    className="max-w-full max-h-full object-contain transition-transform duration-200"
                    style={{
                      transform: `scale(${zoom}) translate(${panPosition.x / zoom}px, ${panPosition.y / zoom}px)`,
                    }}
                    draggable={false}
                  />
                ) : null}
              </div>
            </div>

            {/* Barra de controles flotante */}
            <div
              className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="bg-neutral-800/90 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-1 shadow-xl border border-neutral-700">
                {/* Zoom controls - solo para imágenes, PDFs tienen sus propios controles */}
                {currentFile?.mime_type?.startsWith('image/') && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleZoomOut}
                      disabled={zoom <= 0.5}
                      className="text-white hover:bg-white/20 h-8 w-8"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleZoomIn}
                      disabled={zoom >= 3}
                      className="text-white hover:bg-white/20 h-8 w-8"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-5 bg-white/20 mx-1" />
                  </>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevFile}
                  disabled={selectedFileIndex === 0}
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNextFile}
                  disabled={selectedFileIndex === viewableFiles.length - 1}
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                <div className="w-px h-5 bg-white/20 mx-1" />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrint}
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <Printer className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleFullscreen}
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <Maximize className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Filmstrip */}
            <div className="h-24 bg-neutral-800 border-t border-neutral-700 flex-shrink-0">
              <div
                ref={filmstripRef}
                className="flex gap-2 px-4 py-3 overflow-x-auto h-full items-center scrollbar-thin scrollbar-thumb-neutral-600 scrollbar-track-transparent"
              >
                {viewableFiles.map((file, index) => (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFileIndex(index)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all duration-200 ${
                      index === selectedFileIndex
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-neutral-800 scale-105'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {file.mime_type?.startsWith('image/') ? (
                      <img
                        src={file.signedUrl}
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : file.mime_type === 'application/pdf' ? (
                      <PdfThumbnail
                        src={file.signedUrl || ''}
                        className="w-full h-full"
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : selectedStudy ? (
          <div className="flex-1 flex items-center justify-center bg-neutral-900">
            <p className="text-neutral-400">No hay archivos visualizables en este estudio</p>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-neutral-900">
            <p className="text-neutral-400">Seleccione un estudio del panel izquierdo</p>
          </div>
        )}
      </div>
    </div>
  );
}
