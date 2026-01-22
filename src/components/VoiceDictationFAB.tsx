import { useState } from 'react';
import { Mic, MicOff, X, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useVoiceDictation, ParsedDictation, DictationField } from '@/hooks/useVoiceDictation';
import { toast } from 'sonner';

// Mapeo de campos a nombres legibles
const FIELD_LABELS: Record<DictationField, string> = {
  diagnostico: 'Diagnóstico',
  planTratamiento: 'Tratamiento',
  motivoConsulta: 'Motivo',
  datosSubjetivos: 'Subjetivo',
  lamparaOD: 'Lámpara OD',
  lamparaOS: 'Lámpara OS',
  antecedentesGenerales: 'Antec. Generales',
  antecedentesOftalmologicos: 'Antec. Oftalmológicos',
};

interface VoiceDictationFABProps {
  onApplyDictation: (field: DictationField, content: string, eye?: 'OD' | 'OS' | 'OU') => void;
  availableFields?: DictationField[];
  className?: string;
}

export function VoiceDictationFAB({
  onApplyDictation,
  availableFields = ['diagnostico', 'planTratamiento', 'motivoConsulta', 'datosSubjetivos', 'lamparaOD', 'lamparaOS'],
  className,
}: VoiceDictationFABProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [pendingResults, setPendingResults] = useState<ParsedDictation[]>([]);

  const {
    isListening,
    isSupported,
    interimText,
    finalText,
    currentField,
    currentEye,
    startListening,
    stopListening,
    clearText,
  } = useVoiceDictation({
    onResult: (results) => {
      // Filtrar solo campos disponibles
      const validResults = results.filter(r => availableFields.includes(r.field));
      if (validResults.length > 0) {
        // Aplicar automáticamente cada resultado detectado
        validResults.forEach(result => {
          onApplyDictation(result.field, result.content, result.eye);
        });
        // También guardar en pendientes para mostrar en la UI
        setPendingResults(prev => [...prev, ...validResults]);
        toast.success(`Campo "${FIELD_LABELS[validResults[0].field]}" actualizado`);
      }
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      setIsExpanded(true);
      startListening();
    }
  };

  const handleApply = () => {
    // Aplicar todos los resultados pendientes
    pendingResults.forEach(result => {
      onApplyDictation(result.field, result.content, result.eye);
    });

    if (pendingResults.length > 0) {
      toast.success(`${pendingResults.length} campo(s) actualizado(s)`);
    }

    // Limpiar
    setPendingResults([]);
    clearText();
    setIsExpanded(false);
  };

  const handleCancel = () => {
    stopListening();
    setPendingResults([]);
    clearText();
    setIsExpanded(false);
  };

  // No mostrar el FAB si no está soportado (ej: Tauri/WKWebView)
  // Esto evita confusión al usuario - solo funciona en navegador web
  if (!isSupported) {
    return null;
  }

  return (
    <div className={cn("fixed bottom-6 right-6 z-50", className)}>
      {/* Panel expandido */}
      {isExpanded && (
        <div className="absolute bottom-16 right-0 w-80 bg-background border rounded-lg shadow-xl p-4 mb-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isListening ? (
                <>
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <span className="text-sm font-medium">Escuchando...</span>
                </>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">Dictado pausado</span>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Campo y ojo detectados */}
          {(currentField || currentEye) && (
            <div className="flex gap-2 mb-3">
              {currentField && (
                <Badge variant="secondary" className="text-xs">
                  {FIELD_LABELS[currentField]}
                </Badge>
              )}
              {currentEye && (
                <Badge variant="outline" className="text-xs">
                  {currentEye}
                </Badge>
              )}
            </div>
          )}

          {/* Texto en tiempo real */}
          <div className="bg-muted/50 rounded-md p-3 mb-3 min-h-[60px] max-h-[120px] overflow-y-auto">
            {finalText || interimText ? (
              <p className="text-sm">
                {finalText}
                {interimText && (
                  <span className="text-muted-foreground italic"> {interimText}</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Diga "diagnóstico...", "tratamiento...", etc.
              </p>
            )}
          </div>

          {/* Resultados pendientes */}
          {pendingResults.length > 0 && (
            <div className="mb-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Campos detectados:</p>
              {pendingResults.map((result, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs bg-primary/10 rounded px-2 py-1">
                  <Badge variant="secondary" className="text-xs">
                    {FIELD_LABELS[result.field]}
                  </Badge>
                  {result.eye && <span className="text-muted-foreground">({result.eye})</span>}
                  <span className="truncate flex-1">{result.content.substring(0, 30)}...</span>
                </div>
              ))}
            </div>
          )}

          {/* Instrucciones */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground mb-3">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <p>
              Palabras clave: "diagnóstico", "tratamiento", "motivo", "subjetivo", "ojo derecho/izquierdo".
              Diga "listo" para terminar.
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleCancel}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1"
              onClick={handleApply}
              disabled={pendingResults.length === 0}
            >
              <Check className="h-4 w-4" />
              Aplicar ({pendingResults.length})
            </Button>
          </div>
        </div>
      )}

      {/* FAB principal */}
      <Button
        variant={isListening ? "destructive" : "default"}
        size="icon"
        className={cn(
          "h-14 w-14 rounded-full shadow-lg transition-all",
          isListening && "animate-pulse"
        )}
        onClick={handleToggle}
        title={isListening ? "Detener dictado" : "Iniciar dictado por voz"}
      >
        {isListening ? (
          <MicOff className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </Button>
    </div>
  );
}
