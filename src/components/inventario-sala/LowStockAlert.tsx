import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { RoomInventoryItem } from '@/pages/InventarioSala';

interface LowStockAlertProps {
  items: RoomInventoryItem[];
  onSelectItem: (item: RoomInventoryItem) => void;
}

export function LowStockAlert({ items, onSelectItem }: LowStockAlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || items.length === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-amber-700 dark:text-amber-400">
              {items.length} {items.length === 1 ? 'item con stock bajo' : 'items con stock bajo'}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2">
              {items.slice(0, 5).map((item) => (
                <Badge
                  key={item.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-amber-500/20 border-amber-500/50"
                  onClick={() => onSelectItem(item)}
                >
                  {item.name}
                  <span className="ml-1 text-amber-600 font-mono">
                    ({item.current_stock}/{item.min_stock})
                  </span>
                </Badge>
              ))}
              {items.length > 5 && (
                <Badge variant="outline" className="border-amber-500/50">
                  +{items.length - 5} más
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-amber-600 hover:text-amber-700"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
