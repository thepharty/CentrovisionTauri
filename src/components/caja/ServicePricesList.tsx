import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Power, Search, Stethoscope, Activity, Clipboard, FileSearch } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ServicePriceDialog from './ServicePriceDialog';

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

const categoryMap: Record<ServiceType, string> = {
  consulta: 'Consulta',
  cirugia: 'Cirugía',
  procedimiento: 'Procedimiento',
  estudio: 'Examen'
};

const categoryIcons: Record<ServiceType, any> = {
  consulta: Stethoscope,
  cirugia: Activity,
  procedimiento: Clipboard,
  estudio: FileSearch
};

export default function ServicePricesList() {
  const { hasRole } = useAuth();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'todos' | ServiceType>('todos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['service-prices', isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        // En modo local, usar el comando Tauri
        const data = await invoke<ServicePrice[]>('get_service_prices', {});
        // Ordenar en cliente
        return (data || []).sort((a, b) => {
          if (a.service_type !== b.service_type) {
            return a.service_type.localeCompare(b.service_type);
          }
          return a.service_name.localeCompare(b.service_name);
        });
      }

      const { data, error } = await supabase
        .from('service_prices')
        .select('*')
        .order('service_type', { ascending: true })
        .order('service_name', { ascending: true });

      if (error) throw error;
      return data as ServicePrice[];
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, currentActive }: { id: string; currentActive: boolean }) => {
      if (isLocalMode) {
        // En modo local, usar el comando Tauri
        await invoke('update_service_price', {
          id,
          updates: { active: !currentActive }
        });
        return;
      }

      const { error } = await supabase
        .from('service_prices')
        .update({ active: !currentActive })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-prices'] });
      toast({
        title: 'Estado actualizado',
        description: 'El estado del servicio se ha actualizado correctamente.'
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `No se pudo actualizar el estado: ${error.message}`,
        variant: 'destructive'
      });
    }
  });

  const filteredServices = services.filter(service => {
    const matchesSearch = service.service_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'todos' || service.service_type === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleNewService = () => {
    setSelectedServiceId(null);
    setDialogOpen(true);
  };

  const handleEditService = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setDialogOpen(true);
  };

  const handleToggleActive = (id: string, currentActive: boolean) => {
    toggleActiveMutation.mutate({ id, currentActive });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Gestión de Servicios y Precios</CardTitle>
            {(hasRole('admin') || hasRole('contabilidad')) && (
              <Button onClick={handleNewService} className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo Servicio
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar servicio por nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Tabs de categorías */}
          <Tabs value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as any)}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="consulta" className="gap-2">
                <Stethoscope className="h-3 w-3" />
                Consultas
              </TabsTrigger>
              <TabsTrigger value="cirugia" className="gap-2">
                <Activity className="h-3 w-3" />
                Cirugías
              </TabsTrigger>
              <TabsTrigger value="procedimiento" className="gap-2">
                <Clipboard className="h-3 w-3" />
                Procedimientos
              </TabsTrigger>
              <TabsTrigger value="estudio" className="gap-2">
                <FileSearch className="h-3 w-3" />
                Exámenes
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Tabla */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre del Servicio</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  {(hasRole('admin') || hasRole('contabilidad')) && (
                    <TableHead className="text-right">Acciones</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={(hasRole('admin') || hasRole('contabilidad')) ? 5 : 4} className="text-center py-8 text-muted-foreground">
                      Cargando servicios...
                    </TableCell>
                  </TableRow>
                ) : filteredServices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={(hasRole('admin') || hasRole('contabilidad')) ? 5 : 4} className="text-center py-8 text-muted-foreground">
                      No se encontraron servicios
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredServices.map((service) => {
                    const Icon = categoryIcons[service.service_type];
                    return (
                      <TableRow key={service.id}>
                        <TableCell className="font-medium">{service.service_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {categoryMap[service.service_type]}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          Q {service.price.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={service.active ? 'default' : 'secondary'}>
                            {service.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        {(hasRole('admin') || hasRole('contabilidad')) && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditService(service.id)}
                                className="gap-2"
                              >
                                <Pencil className="h-4 w-4" />
                                Editar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleActive(service.id, service.active)}
                                className="gap-2"
                              >
                                <Power className="h-4 w-4" />
                                {service.active ? 'Desactivar' : 'Activar'}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Resumen */}
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Mostrando {filteredServices.length} de {services.length} servicios
            </p>
            <p className="text-sm text-muted-foreground">
              Activos: {services.filter(s => s.active).length} | 
              Inactivos: {services.filter(s => !s.active).length}
            </p>
          </div>
        </CardContent>
      </Card>

      <ServicePriceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        serviceId={selectedServiceId}
      />
    </>
  );
}
