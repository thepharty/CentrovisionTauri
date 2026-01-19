import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, Mail } from 'lucide-react';
import { isTauri } from '@/lib/dataSource';

interface PrintPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  htmlContent: string | null;
  title?: string;
}

export function PrintPreviewDialog({
  isOpen,
  onClose,
  htmlContent,
  title = 'Preview de Documento',
}: PrintPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = async () => {
    if (isTauri() && htmlContent) {
      // En Tauri, abrir en navegador del sistema para imprimir
      try {
        const { open } = await import('@tauri-apps/plugin-shell');
        // Crear un blob URL con el contenido HTML + script de auto-print
        const printHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Imprimir</title>
          </head>
          <body>
            ${htmlContent}
            <script>
              window.onload = function() {
                window.print();
              }
            </script>
          </body>
          </html>
        `;
        // Crear archivo temporal y abrirlo
        const blob = new Blob([printHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        // Abrir en nueva ventana del navegador web
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print();
          };
        }
      } catch (error) {
        console.error('Error al imprimir:', error);
        // Fallback: intentar con iframe
        const iframe = iframeRef.current;
        if (iframe?.contentWindow) {
          iframe.contentWindow.print();
        }
      }
    } else {
      // En web normal, usar el método del iframe
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.print();
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden border rounded-md">
          <iframe
            ref={iframeRef}
            srcDoc={htmlContent || ''}
            className="w-full h-full min-h-[600px]"
            title="Print Preview"
          />
        </div>

        <DialogFooter className="flex justify-between gap-2">
          <Button variant="outline">
            <Mail className="mr-2 h-4 w-4" />
            Correo
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Cerrar
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
