import { ConsultationView } from './ConsultationView';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Types for Tauri commands
interface EncounterLocal {
  id: string;
  motivo_consulta: string | null;
}

// Helper function to format autorefractor/lensometry text
const formatRefractionText = (text: string | null): string => {
  if (!text) return '';

  // Format: "OD: 3 4 x 25 | OS: 3 2 x 25" -> "OD: Esf +3.00 Cil -4.00 Eje 25° | OS: Esf +3.00 Cil -2.00 Eje 25°"
  const parts = text.split('|').map(part => part.trim());

  return parts.map(part => {
    const match = part.match(/(OD|OS):\s*([-+]?\d+\.?\d*)\s+([-+]?\d+\.?\d*)\s+x\s+(\d+)/i);
    if (match) {
      const [, eye, sphere, cyl, axis] = match;
      const sphereNum = parseFloat(sphere);
      const cylNum = parseFloat(cyl);
      const sphereSign = sphereNum >= 0 ? '+' : '';
      const cylSign = cylNum >= 0 ? '+' : '';
      return `${eye}: Esf ${sphereSign}${sphereNum.toFixed(2)} Cil ${cylSign}${cylNum.toFixed(2)} Eje ${axis}°`;
    }
    return part;
  }).join(' | ');
};

interface ReconsultaViewProps {
  encounterId: string;
}

export function ReconsultaView({ encounterId }: ReconsultaViewProps) {
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  // Fetch motivo_consulta (datos subjetivos) separately
  const { data: encounter } = useQuery({
    queryKey: ['reconsulta-motivo', encounterId, connectionMode],
    queryFn: async () => {
      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[ReconsultaView] Getting encounter from PostgreSQL local');
        const data = await invoke<EncounterLocal | null>('get_encounter_by_id', {
          encounterId: encounterId,
        });
        return data ? { motivo_consulta: data.motivo_consulta } : null;
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('encounters')
        .select('motivo_consulta')
        .eq('id', encounterId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const datosSubjetivosSection = encounter?.motivo_consulta ? (
    <div className="bg-card rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4">Datos Subjetivos</h2>
      <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
        {encounter.motivo_consulta}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <ConsultationView 
        encounterId={encounterId} 
        additionalSectionsAfterDiagnosis={datosSubjetivosSection}
      />
    </div>
  );
}
