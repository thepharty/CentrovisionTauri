import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface MovementsHistoryProps {
  itemId?: string;
  branchId?: string;
}

interface Movement {
  id: string;
  item_id: string;
  quantity: number;
  movement_type: 'entrada' | 'uso' | 'ajuste';
  notes: string | null;
  user_id: string | null;
  created_at: string;
  item?: {
    name: string;
    unit: string;
  };
}

export function MovementsHistory({ itemId, branchId }: MovementsHistoryProps) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['room-inventory-movements', branchId, itemId],
    queryFn: async () => {
      if (!branchId) return [];
      
      let query = supabase
        .from('room_inventory_movements')
        .select('*, item:room_inventory_items(name, unit)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (itemId) {
        query = query.eq('item_id', itemId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Movement[];
    },
    enabled: !!branchId,
  });

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'entrada':
        return <ArrowDownCircle className="h-4 w-4 text-green-500" />;
      case 'uso':
        return <ArrowUpCircle className="h-4 w-4 text-red-500" />;
      case 'ajuste':
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'entrada':
        return <Badge variant="outline" className="text-green-600 border-green-300">Entrada</Badge>;
      case 'uso':
        return <Badge variant="outline" className="text-red-600 border-red-300">Uso</Badge>;
      case 'ajuste':
        return <Badge variant="outline" className="text-blue-600 border-blue-300">Ajuste</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {itemId ? 'No hay movimientos para este item' : 'Seleccione un item para ver su historial'}
      </p>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3 pr-4">
        {movements.map((movement) => (
          <div
            key={movement.id}
            className="p-3 rounded-lg border bg-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {getMovementIcon(movement.movement_type)}
                <div>
                  {!itemId && movement.item && (
                    <p className="font-medium text-sm">{movement.item.name}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    {getMovementBadge(movement.movement_type)}
                    <span className="font-mono">
                      {movement.movement_type === 'uso' ? '-' : '+'}
                      {movement.quantity} {movement.item?.unit || 'und'}
                    </span>
                  </div>
                  {movement.notes && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {movement.notes}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {format(new Date(movement.created_at), "dd MMM HH:mm", { locale: es })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
