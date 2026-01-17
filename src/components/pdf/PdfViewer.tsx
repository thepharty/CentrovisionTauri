import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
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
}

export const PdfViewer = ({ src, height = '80vh' }: PdfViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let mounted = true;
    const canvases: HTMLCanvasElement[] = [];

    const loadPdf = async (retryCount = 0) => {
      try {
        setIsLoading(true);
        setError(null);

        const loadingTask = pdfjsLib.getDocument(src);
        const pdf = await loadingTask.promise;

        if (!mounted) return;

        // Renderizar todas las páginas a escala fija
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) continue;

          canvas.height = viewport.height;
          canvas.width = viewport.width;
          canvas.className = 'mx-auto mb-4 shadow-lg max-w-full h-auto';

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };

          await page.render(renderContext as any).promise;

          if (mounted) {
            canvases.push(canvas);
          }
        }

        if (mounted) {
          setPages(canvases);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[PdfViewer] Error al cargar PDF:', err);
        if (mounted) {
          // Reintentar hasta 3 veces en caso de error de red
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
      canvases.forEach(canvas => {
        canvas.remove();
      });
    };
  }, [src]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    // Limpiar contenedor
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Agregar todas las páginas
    const fragment = document.createDocumentFragment();
    pages.forEach((canvas) => {
      canvas.style.cursor = zoom > 1 ? 'grab' : 'default';
      fragment.appendChild(canvas);
    });
    container.appendChild(fragment);
    
    // Telemetría para validar dimensiones
    if (pages.length > 0) {
      console.debug('[PdfViewer] Páginas insertadas:', pages.length);
      console.debug('[PdfViewer] Primera página:', pages[0].width, 'x', pages[0].height);
      console.debug('[PdfViewer] Contenedor scroll:', scrollContainerRef.current?.clientWidth, 'x', scrollContainerRef.current?.clientHeight);
    }
  }, [pages]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault(); // Evitar selección de texto al arrastrar
    isDraggingRef.current = true;
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
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.5, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
      scrollContainerRef.current.scrollLeft = 0;
    }
  };

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
    <div className="relative w-full" style={{ height }}>
      {/* Controles de zoom internos */}
      <div className="sticky top-4 right-4 z-10 flex gap-2 justify-end mr-4 mt-4">
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

      {/* Contenedor con scroll */}
      <div
        ref={scrollContainerRef}
        className="w-full h-full overflow-auto overscroll-contain"
        style={{ height }}
      >
        <div
          className="inline-block min-w-full"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            transition: 'transform 0.2s ease-out',
          }}
        >
          <div
            ref={containerRef}
            style={{
              cursor: zoom > 1 ? (isDraggingRef.current ? 'grabbing' : 'grab') : 'default',
              userSelect: 'none',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />
        </div>
      </div>
    </div>
  );
};
