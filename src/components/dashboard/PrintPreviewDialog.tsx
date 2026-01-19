import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, Mail, Loader2 } from 'lucide-react';
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
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = async () => {
    if (!htmlContent) return;
    setIsPrinting(true);

    try {
      if (isTauri()) {
        // En Tauri: usar el comando nativo que llama webview.print()
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('print_webview');
      } else {
        // En web: usar window.print() directamente
        window.print();
      }
    } catch (error) {
      console.error('Error al imprimir:', error);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <>
      {/* Contenido para impresión - renderizado directamente en body via portal */}
      {htmlContent && createPortal(
        <div
          id="print-content"
          className="hidden print:block print:!visible"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />,
        document.body
      )}

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col print:hidden">
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
              <Button onClick={handlePrint} disabled={isPrinting}>
                {isPrinting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-2 h-4 w-4" />
                )}
                {isPrinting ? 'Imprimiendo...' : 'Imprimir'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
