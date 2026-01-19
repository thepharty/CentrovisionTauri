import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Maximize2, Minimize2, ChevronLeft, ChevronRight, X, PanelLeftClose, PanelLeftOpen, FileText, Download, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'fit' | 'full'>('fit');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  // Seleccionar el primer estudio automáticamente si hay estudios disponibles
  useEffect(() => {
    if (studies && studies.length > 0 && !selectedStudy) {
      setSelectedStudy(studies[0]);
    }
  }, [studies, selectedStudy]);


  // Reset viewMode cuando se cierra el modal
  useEffect(() => {
    if (selectedImageIndex === null) {
      setViewMode('fit');
    }
  }, [selectedImageIndex]);

  // Navegación con teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedImageIndex === null) return;

      const viewFiles = selectedStudy?.study_files.filter((f) =>
        f.mime_type?.startsWith('image/') || f.mime_type === 'application/pdf'
      ) || [];

      if (e.key === 'ArrowLeft' && selectedImageIndex > 0) {
        setSelectedImageIndex(selectedImageIndex - 1);
        setViewMode('fit');
      } else if (e.key === 'ArrowRight' && selectedImageIndex < viewFiles.length - 1) {
        setSelectedImageIndex(selectedImageIndex + 1);
        setViewMode('fit');
      } else if (e.key === 'Escape') {
        setSelectedImageIndex(null);
        setViewMode('fit');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageIndex, selectedStudy]);

  const handleStudySelect = (study: Study) => {
    setSelectedStudy(study);
    setSelectedImageIndex(null);
    setViewMode('fit');
    navigate(`/ver-estudios/${study.patient_id}`);
  };

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setViewMode('fit');
  };

  const toggleViewMode = () => {
    setViewMode(prev => prev === 'fit' ? 'full' : 'fit');
  };

  const handlePrintPdf = () => {
    if (selectedImageIndex !== null && viewableFiles[selectedImageIndex]) {
      const url = viewableFiles[selectedImageIndex].signedUrl;
      window.open(url, '_blank');
    }
  };

  const handlePrintImage = () => {
    if (selectedImageIndex !== null && viewableFiles[selectedImageIndex]) {
      const printWindow = window.open('', '_blank');
      const img = viewableFiles[selectedImageIndex].signedUrl;
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
              body { 
                margin: 0; 
                padding: 20px;
                font-family: system-ui, -apple-system, sans-serif;
              }
              .header {
                text-align: center;
                margin-bottom: 20px;
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
              }
              .header p {
                margin: 5px 0;
                color: #666;
              }
              .image-container {
                display: flex;
                justify-content: center;
                align-items: center;
              }
              img { 
                max-width: 100%; 
                height: auto;
              }
              @media print {
                body { 
                  margin: 0;
                  padding: 10px;
                }
                img { 
                  max-width: 100%; 
                  page-break-inside: avoid; 
                }
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
              <img src="${img}" onload="window.print(); window.onafterprint = function() { window.close(); }" />
            </div>
          </body>
        </html>
      `);
      printWindow?.document.close();
    }
  };

  const handlePrint = () => {
    if (selectedImageIndex !== null && viewableFiles[selectedImageIndex]) {
      const file = viewableFiles[selectedImageIndex];
      if (file.mime_type === 'application/pdf') {
        handlePrintPdf();
      } else if (file.mime_type?.startsWith('image/')) {
        handlePrintImage();
      }
    }
  };

  const viewableFiles = selectedStudy?.study_files.filter((f) =>
    f.mime_type?.startsWith('image/') || f.mime_type === 'application/pdf'
  ) || [];

  if (loadingStudies) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className={`border-r border-border bg-card transition-all duration-300 ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-80'}`}>
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
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border bg-card p-6">
          <div className="max-w-7xl mx-auto flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="flex-shrink-0"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>
            
            <div className="flex-1">
              {selectedStudy ? (
                <>
                  <div className="flex items-baseline gap-3 mb-2">
                    <h1 className="text-3xl font-bold">{selectedStudy.title}</h1>
                    {selectedStudy.patient && (
                      <span className="text-xl text-muted-foreground">
                        • {selectedStudy.patient.first_name} {selectedStudy.patient.last_name}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Ojo: {selectedStudy.eye_side}</span>
                    <span>•</span>
                    <span>{format(new Date(selectedStudy.created_at), "d 'de' MMMM, yyyy", { locale: es })}</span>
                    {selectedStudy.comments && (
                      <>
                        <span>•</span>
                        <span className="italic">{selectedStudy.comments}</span>
                      </>
                    )}
                  </div>
                </>
              ) : patient ? (
                <h1 className="text-3xl font-bold">
                  {patient.first_name} {patient.last_name}
                </h1>
              ) : (
                <h1 className="text-3xl font-bold">Estudios</h1>
              )}
            </div>
          </div>
        </div>

        {/* Galería */}
        <ScrollArea className="flex-1">
          <div className="max-w-7xl mx-auto p-6">
            {!studies || studies.length === 0 ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-muted-foreground mb-2">
                    Paciente no cuenta con estudios en registro
                  </h2>
                  {patient && (
                    <p className="text-muted-foreground">
                      {patient.first_name} {patient.last_name}
                    </p>
                  )}
                </div>
              </div>
            ) : selectedStudy && viewableFiles.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {viewableFiles.map((file, index) => (
                  <button
                    key={file.id}
                    onClick={() => handleImageClick(index)}
                    className="relative aspect-square overflow-hidden rounded-lg border border-border hover:border-primary transition-colors group"
                  >
                    {file.mime_type?.startsWith('image/') ? (
                      <>
                        <img
                          src={file.signedUrl}
                          alt={`Imagen ${index + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Maximize2 className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </>
                    ) : file.mime_type === 'application/pdf' ? (
                      <>
                        <PdfThumbnail
                          src={file.signedUrl || ''}
                          className="w-full h-full"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Maximize2 className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : selectedStudy ? (
              <div className="text-center text-muted-foreground py-12">
                No hay archivos visualizables en este estudio
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-12">
                Seleccione un estudio del panel izquierdo
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Modal de archivo ampliado */}
      <Dialog open={selectedImageIndex !== null} onOpenChange={() => setSelectedImageIndex(null)}>
        <DialogContent className="max-w-[98vw] sm:max-w-[95vw] max-h-[98vh] sm:max-h-[95vh] p-0 overflow-hidden">
          <DialogTitle className="sr-only">Visor de estudios</DialogTitle>
          {selectedImageIndex !== null && viewableFiles[selectedImageIndex] && (
            <div className="relative bg-black">
              {/* Controles superiores */}
              <div className="absolute top-0 left-0 right-0 z-10 bg-black/50 py-2 px-2 sm:px-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-white text-xs sm:text-sm flex items-center gap-1 sm:gap-2">
                  {viewableFiles[selectedImageIndex].mime_type === 'application/pdf' && (
                    <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  <span className="whitespace-nowrap">
                    {viewableFiles[selectedImageIndex].mime_type === 'application/pdf' ? 'PDF' : 'Img'} {selectedImageIndex + 1}/{viewableFiles.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  {/* Botón de ajuste de vista para imágenes */}
                  {viewableFiles[selectedImageIndex].mime_type?.startsWith('image/') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleViewMode}
                      className="text-white hover:bg-white/20 h-8 w-8 sm:h-10 sm:w-10"
                      title={viewMode === 'fit' ? 'Ver tamaño real' : 'Ajustar a pantalla'}
                    >
                      {viewMode === 'fit' ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrint}
                    className="text-white hover:bg-white/20 h-8 w-8 sm:h-10 sm:w-10"
                    title="Imprimir"
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedImageIndex(null)}
                    className="text-white hover:bg-white/20 h-8 w-8 sm:h-10 sm:w-10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Contenedor de archivo con scroll nativo */}
              <div 
                className={`overflow-auto ${viewMode === 'fit' ? 'flex items-center justify-center h-[75vh] sm:h-[80vh]' : 'max-h-[75vh] sm:max-h-[80vh]'} p-2 sm:p-4 pt-14 sm:pt-16`}
              >
                  {viewableFiles[selectedImageIndex].mime_type === 'application/pdf' ? (
                    <PdfViewer 
                      src={viewableFiles[selectedImageIndex].signedUrl || ''} 
                    />
                  ) : (
                  <img
                    src={viewableFiles[selectedImageIndex].signedUrl}
                    alt={`Imagen ${selectedImageIndex + 1}`}
                    className={viewMode === 'fit' ? 'h-full w-auto' : 'w-auto h-auto block'}
                    style={viewMode === 'full' ? { transformOrigin: 'top left' } : undefined}
                  />
                )}
              </div>

              {/* Controles de navegación */}
              {selectedImageIndex > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedImageIndex(selectedImageIndex - 1);
                    setViewMode('fit');
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
              )}

              {selectedImageIndex < viewableFiles.length - 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedImageIndex(selectedImageIndex + 1);
                    setViewMode('fit');
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
