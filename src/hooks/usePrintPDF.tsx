import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PrintPDFData {
  type: 'prescription' | 'treatment' | 'surgeries' | 'studies';
  patientData: {
    name: string;
    age: number;
    code: string;
  };
  doctorData: {
    name: string;
    specialty?: string;
  };
  date: string;
  content: any;
}

export const usePrintPDF = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);

  const generatePDF = async (data: PrintPDFData) => {
    setIsGenerating(true);
    console.log('[usePrintPDF] Iniciando generación de PDF:', data.type);

    try {
      // Get current user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('No hay sesión activa');
      }

      console.log('[usePrintPDF] Llamando edge function...');

      // Call edge function
      const { data: result, error } = await supabase.functions.invoke('generate-prescription-pdf', {
        body: data,
      });

      if (error) {
        console.error('[usePrintPDF] Error de edge function:', error);
        throw error;
      }

      if (!result?.html) {
        throw new Error('No se recibió el HTML del PDF');
      }

      console.log('[usePrintPDF] PDF generado exitosamente');

      // Store HTML content directly (no base64 decoding needed - JSON handles UTF-8)
      setHtmlContent(result.html);
      
    } catch (error: any) {
      console.error('[usePrintPDF] Error:', error);
      toast.error('Error al generar el documento: ' + (error.message || 'Error desconocido'));
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
