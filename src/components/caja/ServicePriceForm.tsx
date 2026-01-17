import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Stethoscope, Activity, Clipboard, FileSearch } from 'lucide-react';

const serviceSchema = z.object({
  service_name: z
    .string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  service_type: z.enum(['consulta', 'cirugia', 'procedimiento', 'estudio'], {
    required_error: 'Debe seleccionar una categoría'
  }),
  price: z
    .number({ invalid_type_error: 'Debe ingresar un precio válido' })
    .min(0, 'El precio no puede ser negativo'),
  active: z.boolean().default(true)
});

type ServiceFormValues = z.infer<typeof serviceSchema>;

interface ServicePriceFormProps {
  serviceId: string | null;
  defaultValues?: Partial<ServiceFormValues>;
  onSuccess?: () => void;
}

const categoryOptions = [
  { value: 'consulta', label: 'Consulta', icon: Stethoscope },
  { value: 'cirugia', label: 'Cirugía', icon: Activity },
  { value: 'procedimiento', label: 'Procedimiento', icon: Clipboard },
  { value: 'estudio', label: 'Examen', icon: FileSearch },
] as const;

export default function ServicePriceForm({
  serviceId,
  defaultValues,
  onSuccess
}: ServicePriceFormProps) {
  const queryClient = useQueryClient();

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      service_name: defaultValues?.service_name || '',
      service_type: defaultValues?.service_type || undefined,
      price: defaultValues?.price || 0,
      active: defaultValues?.active ?? true
    }
  });

  const createMutation = useMutation({
    mutationFn: async (values: ServiceFormValues) => {
      const { data, error } = await supabase
        .from('service_prices')
        .insert({
          service_name: values.service_name,
          service_type: values.service_type,
          price: values.price,
          active: values.active
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-prices'] });
      toast({
        title: 'Servicio creado',
        description: 'El servicio se ha creado correctamente.'
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error al crear servicio',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (values: ServiceFormValues) => {
      const { data, error } = await supabase
        .from('service_prices')
        .update({
          service_name: values.service_name,
          service_type: values.service_type,
          price: values.price,
          active: values.active
        })
        .eq('id', serviceId!)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-prices'] });
      queryClient.invalidateQueries({ queryKey: ['service-price', serviceId] });
      toast({
        title: 'Servicio actualizado',
        description: 'El servicio se ha actualizado correctamente.'
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error al actualizar servicio',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const onSubmit = (values: ServiceFormValues) => {
    if (serviceId) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="service_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del Servicio</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ej: Facoemulsificación + LIO"
                  {...field}
                  disabled={isLoading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="service_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categoría</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={isLoading}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione una categoría" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categoryOptions.map((category) => {
                    const Icon = category.icon;
                    return (
                      <SelectItem key={category.value} value={category.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {category.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Precio (GTQ)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  disabled={isLoading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Estado</FormLabel>
                <div className="text-sm text-muted-foreground">
                  {field.value ? 'Servicio activo' : 'Servicio inactivo'}
                </div>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isLoading}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Guardando...' : serviceId ? 'Actualizar Servicio' : 'Crear Servicio'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
