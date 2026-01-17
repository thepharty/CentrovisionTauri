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

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
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
