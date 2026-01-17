import { Appointment } from '@/types/database';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';

interface AppointmentBlockProps {
  appointment: Appointment;
  onClick: () => void;
}

export function AppointmentBlock({ appointment, onClick }: AppointmentBlockProps) {
  // Check if appointment has invoice
  const { data: hasInvoice } = useQuery({
    queryKey: ['appointment-invoice', appointment.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id')
        .eq('appointment_id', appointment.id)
        .maybeSingle();
      return !!data;
    },
    enabled: appointment.status === 'done' && !appointment.is_courtesy,
  });

  const typeColors: Record<string, string> = {
    nueva_consulta: 'border-l-consulta bg-consulta/5',
    reconsulta_menos_3m: 'border-l-reconsulta-corta bg-reconsulta-corta/5',
    reconsulta_mas_3m: 'border-l-reconsulta-larga bg-reconsulta-larga/5',
    post_operado: 'border-l-post-operado bg-post-operado/5',
    lectura_resultados: 'border-l-lectura bg-lectura/5',
    procedimiento: 'border-l-procedimiento bg-procedimiento/5',
    cirugia: 'border-l-cirugia bg-cirugia/5',
    consulta: 'border-l-consulta bg-consulta/5',
    estudio: 'border-l-estudio bg-estudio/5',
  };

  const typeLabels: Record<string, string> = {
    nueva_consulta: 'Nueva consulta',
    reconsulta_menos_3m: 'Reconsulta - 3m',
    reconsulta_mas_3m: 'Reconsulta + 3m',
    post_operado: 'Post operado',
    lectura_resultados: 'Lectura resultados',
    procedimiento: 'Procedimiento',
    cirugia: 'Cirugía',
    consulta: 'Consulta',
    estudio: 'Estudio',
  };

  const getTypeDisplay = () => {
    const typeLabel = typeLabels[appointment.type] || appointment.type;
    
    // Si es cirugía y tiene reason, mostrar "Cirugía - [tipo]"
    if (appointment.type === 'cirugia' && appointment.reason) {
      return appointment.is_courtesy ? `Cirugía - ${appointment.reason} - cortesía` : `Cirugía - ${appointment.reason}`;
    }
    
    // Si es procedimiento y tiene reason, mostrar "Procedimiento - [tipo]"
    if (appointment.type === 'procedimiento' && appointment.reason) {
      return appointment.is_courtesy ? `Procedimiento - ${appointment.reason} - cortesía` : `Procedimiento - ${appointment.reason}`;
    }
    
    // Si es estudio y tiene reason, mostrar "Estudio - [tipo]"
    if (appointment.type === 'estudio' && appointment.reason) {
      return appointment.is_courtesy ? `Estudio - ${appointment.reason} - cortesía` : `Estudio - ${appointment.reason}`;
    }
    
    // Si es post operado y tiene post_op_type, mostrar "Post operado - [tipo]"
    if (appointment.type === 'post_operado' && appointment.post_op_type) {
      return appointment.is_courtesy ? `Post operado - ${appointment.post_op_type} - cortesía` : `Post operado - ${appointment.post_op_type}`;
    }
    
    return appointment.is_courtesy ? `${typeLabel} - cortesía` : typeLabel;
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-2 rounded border-l-4 cursor-pointer hover:shadow-md transition-all mb-1',
        typeColors[appointment.type]
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-base truncate">
            {appointment.patient?.first_name} {appointment.patient?.last_name}
          </p>
          {(appointment as any).external_doctor_name && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-orange-100 text-orange-700 border-orange-300 flex-shrink-0">
              🏥 {(appointment as any).external_doctor_name}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-base text-muted-foreground truncate flex-1">{getTypeDisplay()}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {appointment.status === 'done' && (
              <>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-5 w-5 text-done" />
                  <span className="text-sm text-done">Atendida</span>
                </div>
                {!appointment.is_courtesy && !hasInvoice && (
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 text-xs">
                    <DollarSign className="h-3 w-3 mr-1" />
                    No facturado
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {appointment.reason && appointment.type !== 'cirugia' && appointment.type !== 'procedimiento' && appointment.type !== 'post_operado' && appointment.type !== 'estudio' && (
        <p className="text-sm text-muted-foreground mt-1 truncate">{appointment.reason}</p>
      )}
    </div>
  );
}
