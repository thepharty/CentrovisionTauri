import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ServicePriceForm from './ServicePriceForm';

type ServiceType = 'consulta' | 'cirugia' | 'procedimiento' | 'estudio';

interface ServicePrice {
  id: string;
  service_name: string;
  service_type: ServiceType;
  price: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ServicePriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceId: string | null;
}

export default function ServicePriceDialog({
  open,
  onOpenChange,
  serviceId
}: ServicePriceDialogProps) {
  const { data: service, isLoading } = useQuery<ServicePrice | null>({
    queryKey: ['service-price', serviceId],
    queryFn: async () => {
      if (!serviceId) return null;
      
      const { data, error } = await supabase
        .from('service_prices')
        .select('*')
        .eq('id', serviceId)
        .single();
      
      if (error) throw error;
      
      // Filtrar solo los service_type válidos
      if (data && ['consulta', 'cirugia', 'procedimiento', 'estudio'].includes(data.service_type)) {
        return data as ServicePrice;
      }
      return null;
    },
    enabled: !!serviceId
  });

  const handleSuccess = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {serviceId ? 'Editar Servicio' : 'Nuevo Servicio'}
          </DialogTitle>
        </DialogHeader>
        
        {isLoading && serviceId ? (
          <div className="py-8 text-center text-muted-foreground">
            Cargando datos del servicio...
          </div>
        ) : (
          <ServicePriceForm
            serviceId={serviceId}
            defaultValues={service || undefined}
            onSuccess={handleSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
