import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// Configurar el worker de pdf.js con soporte ESM
if (typeof window !== 'undefined' && 'Worker' in window) {
  try {
    const workerUrl = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();

    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch (e) {
    console.error('Error configurando worker de PDF.js:', e);
  }
}

interface PdfViewerProps {
  src: string;
  height?: string | number;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  showControls?: boolean;
}

export const PdfViewer = ({ src, height = '100%', zoom: externalZoom, onZoomChange, showControls = true }: PdfViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderingRef = useRef(false);

  // Refs para drag/pan
  const isDraggingRef = useRef(false);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [internalZoom, setInternalZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  // Usar zoom externo si se proporciona, sino interno
  const zoom = externalZoom ?? internalZoom;
  const setZoom = onZoomChange ?? setInternalZoom;

  // Escala base para buena calidad
  const BASE_SCALE = 1.5;

  // Cargar el documento PDF
  useEffect(() => {
    let mounted = true;

    const loadPdf = async (retryCount = 0) => {
      try {
        setIsLoading(true);
        setError(null);

        const loadingTask = pdfjsLib.getDocument(src);
        const pdf = await loadingTask.promise;

        if (!mounted) {
          pdf.destroy();
          return;
        }

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setIsLoading(false);
      } catch (err) {
        console.error('[PdfViewer] Error al cargar PDF:', err);
        if (mounted) {
          if (retryCount < 2) {
            console.log(`[PdfViewer] Reintentando... (${retryCount + 1}/2)`);
            setTimeout(() => loadPdf(retryCount + 1), 1000);
          } else {
            setError('Error al cargar el PDF');
            setIsLoading(false);
          }
        }
      }
    };

    loadPdf();

    return () => {
      mounted = false;
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
  }, [src]);

  // Renderizar páginas cuando cambia el zoom o se carga el documento
  const renderPages = useCallback(async () => {
    const pdf = pdfDocRef.current;
    const container = containerRef.current;

    if (!pdf || !container || renderingRef.current) return;

    renderingRef.current = true;

    // Limpiar contenedor
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const scale = BASE_SCALE * zoom;

    try {
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) continue;

        // Usar devicePixelRatio para mejor calidad en pantallas retina
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = viewport.width * pixelRatio;
        canvas.height = viewport.height * pixelRatio;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.className = 'block mx-auto mb-4 shadow-lg';

        context.scale(pixelRatio, pixelRatio);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext as any).promise;
        container.appendChild(canvas);
      }
    } catch (err) {
      console.error('[PdfViewer] Error renderizando páginas:', err);
    } finally {
      renderingRef.current = false;
    }
  }, [zoom, BASE_SCALE]);

  // Re-renderizar cuando cambia zoom o numPages
  useEffect(() => {
    if (numPages > 0) {
      renderPages();
    }
  }, [numPages, renderPages]);

  const handleZoomIn = () => setZoom(Math.min(zoom + 0.25, 3));
  const handleZoomOut = () => setZoom(Math.max(zoom - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
      scrollContainerRef.current.scrollLeft = 0;
    }
  };

  // Manejar zoom con Ctrl+scroll
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(Math.min(Math.max(zoom + delta, 0.5), 3));
    }
  }, [zoom, setZoom]);

  // Handlers para drag/pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    lastPositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || zoom <= 1 || !scrollContainerRef.current) return;

    const deltaX = e.clientX - lastPositionRef.current.x;
    const deltaY = e.clientY - lastPositionRef.current.y;

    scrollContainerRef.current.scrollLeft -= deltaX;
    scrollContainerRef.current.scrollTop -= deltaY;

    lastPositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Cargando PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-white text-center">{error}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            setIsLoading(true);
            window.location.reload();
          }}
          className="bg-white/10 hover:bg-white/20 text-white border-white/20"
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col" style={{ height }}>
      {/* Controles de zoom internos - solo si showControls es true */}
      {showControls && (
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="bg-black/50 hover:bg-black/70 text-white border-white/20"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleResetZoom}
            disabled={zoom === 1}
            className="bg-black/50 hover:bg-black/70 text-white border-white/20"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="bg-black/50 hover:bg-black/70 text-white border-white/20"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Contenedor con scroll y drag/pan */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto overscroll-contain"
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={containerRef}
          className="p-4"
          style={{ userSelect: 'none' }}
        />
      </div>

      {/* Indicador de zoom */}
      {showControls && (
        <div className="absolute bottom-4 left-4 text-white/60 text-sm bg-black/30 px-2 py-1 rounded">
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  );
};
