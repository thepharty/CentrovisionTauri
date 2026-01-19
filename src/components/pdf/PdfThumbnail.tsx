import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { FileText, Loader2 } from 'lucide-react';

// Configurar el worker de pdf.js
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

interface PdfThumbnailProps {
  src: string;
  className?: string;
}

export const PdfThumbnail = ({ src, className = '' }: PdfThumbnailProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const generateThumbnail = async () => {
      if (!src || !canvasRef.current) return;

      try {
        setIsLoading(true);
        setError(false);

        const loadingTask = pdfjsLib.getDocument(src);
        const pdf = await loadingTask.promise;

        if (!mounted) return;

        // Solo renderizar la primera página
        const page = await pdf.getPage(1);

        // Escala para thumbnail (ajustar al contenedor)
        const canvas = canvasRef.current;
        const containerWidth = canvas.parentElement?.clientWidth || 200;
        const containerHeight = canvas.parentElement?.clientHeight || 200;

        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(
          containerWidth / viewport.width,
          containerHeight / viewport.height
        );
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const context = canvas.getContext('2d');
        if (!context) return;

        await page.render({
          canvasContext: context,
          viewport: scaledViewport,
        }).promise;

        if (mounted) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[PdfThumbnail] Error:', err);
        if (mounted) {
          setError(true);
          setIsLoading(false);
        }
      }
    };

    generateThumbnail();

    return () => {
      mounted = false;
    };
  }, [src]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-muted ${className}`}>
        <FileText className="h-12 w-12 text-primary" />
        <span className="text-xs font-medium text-primary px-2 py-1 bg-primary/10 rounded">PDF</span>
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center bg-muted ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`max-w-full max-h-full object-contain ${isLoading ? 'opacity-0' : 'opacity-100'}`}
      />
    </div>
  );
};
