import { useState } from 'react';
import { generatePrintHTML, PrintPDFData } from '@/lib/printTemplates';

export const usePrintPDF = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);

  const generatePDF = async (data: PrintPDFData) => {
    setIsGenerating(true);
    console.log('[usePrintPDF] Iniciando generación de PDF:', data.type);

    try {
      // Generate HTML locally (works offline)
      const html = generatePrintHTML(data);

      console.log('[usePrintPDF] PDF generado exitosamente (local)');
      setHtmlContent(html);

    } catch (error: any) {
      console.error('[usePrintPDF] Error:', error);
      // Don't show toast for now, just log
    } finally {
      setIsGenerating(false);
    }
  };

  const clearContent = () => {
    setHtmlContent(null);
  };

  return {
    generatePDF,
    isGenerating,
    htmlContent,
    clearContent,
  };
};

// Re-export the type for convenience
export type { PrintPDFData };
