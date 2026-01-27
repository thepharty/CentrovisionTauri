import { useState, useCallback, useRef, useEffect } from 'react';

// Tipos para los campos que se pueden dictar
export type DictationField =
  | 'diagnostico'
  | 'planTratamiento'
  | 'motivoConsulta'
  | 'datosSubjetivos'
  | 'lamparaOD'
  | 'lamparaOS'
  | 'antecedentesGenerales'
  | 'antecedentesOftalmologicos';

// Resultado parseado del dictado
export interface ParsedDictation {
  field: DictationField;
  content: string;
  eye?: 'OD' | 'OS' | 'OU';
}

// Palabras clave para detectar campos
const FIELD_KEYWORDS: Record<string, DictationField> = {
  'diagnóstico': 'diagnostico',
  'diagnostico': 'diagnostico',
  'tratamiento': 'planTratamiento',
  'plan de tratamiento': 'planTratamiento',
  'motivo': 'motivoConsulta',
  'motivo de consulta': 'motivoConsulta',
  'subjetivo': 'datosSubjetivos',
  'datos subjetivos': 'datosSubjetivos',
  'lámpara derecho': 'lamparaOD',
  'lampara derecho': 'lamparaOD',
  'lámpara izquierdo': 'lamparaOS',
  'lampara izquierdo': 'lamparaOS',
  'antecedentes generales': 'antecedentesGenerales',
  'antecedentes oftalmológicos': 'antecedentesOftalmologicos',
  'antecedentes oftalmologicos': 'antecedentesOftalmologicos',
};

// Palabras clave para ojos
const EYE_KEYWORDS: Record<string, 'OD' | 'OS' | 'OU'> = {
  'ojo derecho': 'OD',
  'od': 'OD',
  'derecho': 'OD',
  'ojo izquierdo': 'OS',
  'oi': 'OS',
  'os': 'OS',
  'izquierdo': 'OS',
  'ambos ojos': 'OU',
  'ou': 'OU',
  'ao': 'OU',
  'bilateral': 'OU',
};

// Palabras para terminar el dictado
const STOP_KEYWORDS = ['listo', 'guardar', 'terminar', 'finalizar', 'parar'];

interface UseVoiceDictationOptions {
  onResult?: (results: ParsedDictation[]) => void;
  onInterimResult?: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  lang?: string;
}

interface UseVoiceDictationReturn {
  isListening: boolean;
  isSupported: boolean;
  interimText: string;
  finalText: string;
  currentField: DictationField | null;
  currentEye: 'OD' | 'OS' | 'OU' | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  clearText: () => void;
}

// Declaración de tipos para Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Detectar entorno
const isInTauri = typeof window !== 'undefined' && '__TAURI__' in window;
const isMacOS = typeof navigator !== 'undefined' && /Macintosh|Mac OS/.test(navigator.userAgent);
const useNativeSTT = isInTauri && isMacOS;

export function useVoiceDictation(options: UseVoiceDictationOptions = {}): UseVoiceDictationReturn {
  const {
    onResult,
    onInterimResult,
    onError,
    onEnd,
    lang = 'es-MX',
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [currentField, setCurrentField] = useState<DictationField | null>(null);
  const [currentEye, setCurrentEye] = useState<'OD' | 'OS' | 'OU' | null>(null);
  const [nativeSTTAvailable, setNativeSTTAvailable] = useState<boolean | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedTextRef = useRef<string>('');
  const shouldRestartRef = useRef<boolean>(false);
  const manualStopRef = useRef<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nativeUnlistenRef = useRef<any>(null);

  // Verificar soporte de Web Speech API
  const webSpeechSupported = typeof window !== 'undefined' &&
    !useNativeSTT &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Parsear el texto para extraer campo, ojo y contenido
  const parseText = useCallback((text: string): ParsedDictation[] => {
    const results: ParsedDictation[] = [];
    const lowerText = text.toLowerCase();

    // Detectar campo
    let detectedField: DictationField | null = null;
    let fieldEndIndex = 0;

    for (const [keyword, field] of Object.entries(FIELD_KEYWORDS)) {
      const index = lowerText.indexOf(keyword);
      if (index !== -1) {
        detectedField = field;
        fieldEndIndex = index + keyword.length;
        break;
      }
    }

    if (detectedField) {
      setCurrentField(detectedField);
    }

    // Detectar ojo
    let detectedEye: 'OD' | 'OS' | 'OU' | null = null;

    for (const [keyword, eye] of Object.entries(EYE_KEYWORDS)) {
      if (lowerText.includes(keyword)) {
        detectedEye = eye;
        break;
      }
    }

    if (detectedEye) {
      setCurrentEye(detectedEye);
    }

    // Extraer contenido (todo después de la palabra clave del campo)
    if (detectedField) {
      let content = text.substring(fieldEndIndex).trim();

      // Remover palabras clave de ojo del contenido
      for (const keyword of Object.keys(EYE_KEYWORDS)) {
        content = content.replace(new RegExp(keyword, 'gi'), '').trim();
      }

      // Limpiar comas y espacios extras al inicio
      content = content.replace(/^[,\s]+/, '').trim();

      if (content) {
        results.push({
          field: detectedField,
          content,
          eye: detectedEye || undefined,
        });
      }
    }

    return results;
  }, []);

  // Verificar si debe parar
  const shouldStop = useCallback((text: string): boolean => {
    const lowerText = text.toLowerCase();
    return STOP_KEYWORDS.some(keyword => lowerText.includes(keyword));
  }, []);

  // Verificar disponibilidad de STT nativo al montar
  useEffect(() => {
    if (!useNativeSTT) {
      setNativeSTTAvailable(false);
      return;
    }

    const checkNativeSTT = async () => {
      try {
        const stt = await import('tauri-plugin-stt-api');
        const response = await stt.isAvailable();
        setNativeSTTAvailable(response.available);
        if (!response.available) {
          console.log('Native STT not available:', response.reason);
        }
      } catch (e) {
        console.error('Failed to check native STT:', e);
        setNativeSTTAvailable(false);
      }
    };

    checkNativeSTT();
  }, []);

  // Inicializar reconocimiento Web Speech API
  useEffect(() => {
    if (!webSpeechSupported || useNativeSTT) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognitionAPI();

    const recognition = recognitionRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        setInterimText(interim);
        onInterimResult?.(interim);
      }

      if (final) {
        accumulatedTextRef.current += ' ' + final;
        const fullText = accumulatedTextRef.current.trim();
        setFinalText(fullText);
        setInterimText('');

        // Parsear y enviar resultados
        const parsed = parseText(fullText);
        if (parsed.length > 0) {
          onResult?.(parsed);
        }

        // Verificar si debe parar
        if (shouldStop(final)) {
          recognition.stop();
        }
      }
    };

    recognition.onerror = (event) => {
      // Stop auto-restart on fatal errors to prevent infinite loop
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldRestartRef.current = false;
      }

      const errorMessage = event.error === 'not-allowed'
        ? 'Permiso de micrófono denegado'
        : event.error === 'no-speech'
        ? 'No se detectó voz'
        : `Error: ${event.error}`;

      onError?.(errorMessage);
      setIsListening(false);
    };

    recognition.onend = () => {
      // Si fue un stop manual, no reiniciar
      if (manualStopRef.current) {
        manualStopRef.current = false;
        setIsListening(false);
        onEnd?.();
        return;
      }

      // Si debe seguir escuchando (no fue stop manual), reiniciar
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.error('Error restarting recognition:', e);
          setIsListening(false);
          onEnd?.();
        }
      } else {
        setIsListening(false);
        onEnd?.();
      }
    };

    return () => {
      recognition.abort();
    };
  }, [webSpeechSupported, lang, onResult, onInterimResult, onError, onEnd, parseText, shouldStop]);

  // Start listening - Web Speech API
  const startWebSpeech = useCallback(() => {
    if (!recognitionRef.current || isListening) return;

    accumulatedTextRef.current = '';
    setFinalText('');
    setInterimText('');
    setCurrentField(null);
    setCurrentEye(null);
    shouldRestartRef.current = true;
    manualStopRef.current = false;

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      shouldRestartRef.current = false;
    }
  }, [isListening]);

  // Stop listening - Web Speech API
  const stopWebSpeech = useCallback(() => {
    if (!recognitionRef.current) return;
    shouldRestartRef.current = false;
    manualStopRef.current = true;
    try {
      recognitionRef.current.stop();
    } catch (e) {
      console.log('Recognition already stopped');
    }
    setIsListening(false);
  }, []);

  // Start listening - Native STT (Tauri plugin)
  const startNativeSTT = useCallback(async () => {
    if (isListening) return;

    try {
      const stt = await import('tauri-plugin-stt-api');

      console.log('Starting native STT...');

      accumulatedTextRef.current = '';
      setFinalText('');
      setInterimText('');
      setCurrentField(null);
      setCurrentEye(null);

      // Registrar listener para cambios de estado
      const unlistenState = await stt.onStateChange((event) => {
        console.log('STT State:', event.state);
        if (event.state === 'listening') {
          setIsListening(true);
        } else if (event.state === 'idle') {
          setIsListening(false);
        }
      });

      // Registrar listener para errores
      const unlistenError = await stt.onError((error) => {
        console.error('STT Error:', error);
        onError?.(`Error STT: ${error.message}`);
        setIsListening(false);
      });

      // Registrar listener para resultados
      const unlisten = await stt.onResult((result) => {
        console.log('STT Result:', result);
        if (result.isFinal) {
          accumulatedTextRef.current += ' ' + result.transcript;
          const fullText = accumulatedTextRef.current.trim();
          setFinalText(fullText);
          setInterimText('');

          // Parsear y enviar resultados
          const parsed = parseText(fullText);
          if (parsed.length > 0) {
            onResult?.(parsed);
          }

          // Verificar si debe parar
          if (shouldStop(result.transcript)) {
            stt.stopListening();
          }
        } else {
          setInterimText(result.transcript);
          onInterimResult?.(result.transcript);
        }
      });

      // Guardar todos los unlisteners
      nativeUnlistenRef.current = async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cleanup = (listener: any) => {
            if (typeof listener === 'function') listener();
            else if (listener?.unsubscribe) listener.unsubscribe();
          };
          cleanup(unlisten);
          cleanup(unlistenError);
          cleanup(unlistenState);
        } catch (err) {
          console.error('Error cleaning up listeners:', err);
        }
      };

      // Marcar como escuchando ANTES de llamar startListening
      setIsListening(true);

      // Iniciar escucha con idioma español
      console.log('Calling startListening...');
      await stt.startListening({ language: 'es-ES', interimResults: true, continuous: true });
      console.log('startListening completed');
    } catch (e) {
      console.error('Error starting native STT:', e);
      onError?.(`Error iniciando dictado: ${e}`);
      setIsListening(false);
    }
  }, [isListening, onResult, onInterimResult, onError, parseText, shouldStop]);

  // Stop listening - Native STT
  const stopNativeSTT = useCallback(async () => {
    try {
      const stt = await import('tauri-plugin-stt-api');
      await stt.stopListening();

      if (nativeUnlistenRef.current) {
        nativeUnlistenRef.current();
        nativeUnlistenRef.current = null;
      }

      setIsListening(false);
      onEnd?.();
    } catch (e) {
      console.error('Error stopping native STT:', e);
      setIsListening(false);
    }
  }, [onEnd]);

  // Unified start/stop functions
  const startListening = useCallback(() => {
    if (useNativeSTT) {
      startNativeSTT();
    } else {
      startWebSpeech();
    }
  }, [startNativeSTT, startWebSpeech]);

  const stopListening = useCallback(() => {
    if (useNativeSTT) {
      stopNativeSTT();
    } else {
      stopWebSpeech();
    }
  }, [stopNativeSTT, stopWebSpeech]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const clearText = useCallback(() => {
    accumulatedTextRef.current = '';
    setFinalText('');
    setInterimText('');
    setCurrentField(null);
    setCurrentEye(null);
  }, []);

  return {
    isListening,
    isSupported: webSpeechSupported || (useNativeSTT && nativeSTTAvailable !== false),
    interimText,
    finalText,
    currentField,
    currentEye,
    startListening,
    stopListening,
    toggleListening,
    clearText,
  };
}
