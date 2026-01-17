import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/hooks/useBranch';
import { X, Droplet, ChevronDown, ChevronRight, AlertTriangle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface StockPanelProps {
  onClose: () => void;
  onSelectItem?: (itemName: string) => void;
}

interface InventoryLot {
  expiry_date: string | null;
  quantity: number;
}

interface InventoryItem {
  id: string;
  name: string;
  current_stock: number;
  min_stock: number | null;
  supplier_id: string | null;
  suppliers: {
    id: string;
    name: string;
  } | null;
  inventory_lots: InventoryLot[];
  nearest_expiry?: string | null;
}

interface GroupedStock {
  [supplierName: string]: InventoryItem[];
}

// Componente simple para cada item (solo doble click)
function DropItem({ 
  item, 
  isMatch, 
  isExpiring, 
  isExpired: isItemExpired,
  getStockColor, 
  onDoubleClick 
}: {
  item: { id: string; name: string; current_stock: number; min_stock: number | null };
  isMatch: boolean;
  isExpiring: boolean;
  isExpired: boolean;
  getStockColor: (stock: number, min: number | null) => string;
  onDoubleClick: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 px-2 text-sm rounded cursor-pointer hover:bg-muted/50 transition-colors",
        isMatch 
          ? "bg-blue-500 hover:bg-blue-600" 
          : (isExpiring || isItemExpired) && "bg-yellow-200 dark:bg-yellow-800/60"
      )}
      onDoubleClick={onDoubleClick}
      title="Doble click para agregar al Plan de Tratamiento"
    >
      <span className={cn(
        "truncate pr-2",
        isMatch && "text-white font-medium"
      )}>
        {item.name}
      </span>
      <span className={cn(
        "tabular-nums text-sm min-w-[40px] text-right",
        isMatch ? "text-white font-semibold" : getStockColor(item.current_stock, item.min_stock)
      )}>
        {item.current_stock}
      </span>
    </div>
  );
}

export function StockPanel({ onClose, onSelectItem }: StockPanelProps) {
  const { currentBranch } = useBranch();
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['stock-gotas', currentBranch?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select(`
          id,
          name,
          current_stock,
          min_stock,
          supplier_id,
          suppliers (
            id,
            name
          ),
          inventory_lots (
            expiry_date,
            quantity
          )
        `)
        .eq('branch_id', currentBranch!.id)
        .eq('category', 'gota')
        .eq('active', true)
        .gt('current_stock', 0)
        .order('name');

      if (error) throw error;
      
      // Process items to find nearest expiry date from lots with quantity > 0
      const processedItems = (data as InventoryItem[]).map(item => {
        const validLots = item.inventory_lots?.filter(lot => lot.quantity > 0 && lot.expiry_date) || [];
        const sortedLots = validLots.sort((a, b) => 
          new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime()
        );
        return {
          ...item,
          nearest_expiry: sortedLots.length > 0 ? sortedLots[0].expiry_date : null
        };
      });
      
      return processedItems;
    },
    enabled: !!currentBranch?.id,
  });

  // Filter items by search term
  const filteredItems = items.filter(item => 
    searchTerm === '' || 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.suppliers?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group items by supplier
  const groupedStock: GroupedStock = filteredItems.reduce((acc, item) => {
    const supplierName = item.suppliers?.name || 'Sin Proveedor';
    if (!acc[supplierName]) {
      acc[supplierName] = [];
    }
    acc[supplierName].push(item);
    return acc;
  }, {} as GroupedStock);

  const toggleSupplier = (supplierName: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(supplierName)) {
        next.delete(supplierName);
      } else {
        next.add(supplierName);
      }
      return next;
    });
  };

  const getStockColor = (stock: number, minStock: number | null) => {
    if (minStock && stock <= minStock) return 'text-orange-500 font-semibold';
    return 'text-primary font-semibold';
  };

  const isExpiringSoon = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const isExpired = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const matchesSearch = (itemName: string) => {
    if (!searchTerm.trim()) return false;
    return itemName.toLowerCase().includes(searchTerm.toLowerCase());
  };

  const sortedSuppliers = Object.keys(groupedStock).sort();

  return (
    <div className="fixed right-4 top-20 z-50 w-80 bg-card border rounded-lg shadow-lg">
      <div className="flex items-center justify-between p-3 border-b bg-muted/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Droplet className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Stock de Gotas</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 w-28 pl-7 pr-2 text-xs"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[400px]">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Cargando...
          </div>
        ) : sortedSuppliers.length === 0 && searchTerm !== '' ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No se encontraron gotas con "{searchTerm}"
          </div>
        ) : sortedSuppliers.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No hay gotas en inventario
          </div>
        ) : (
          <div className="p-2">
            {sortedSuppliers.map(supplierName => {
              const supplierItems = groupedStock[supplierName];
              const isExpanded = expandedSuppliers.has(supplierName) || searchTerm.trim() !== '';
              const totalStock = supplierItems.reduce((sum, item) => sum + item.current_stock, 0);
              const hasExpiringSoon = supplierItems.some(item => 
                isExpiringSoon(item.nearest_expiry) || isExpired(item.nearest_expiry)
              );

              return (
                <div key={supplierName} className="mb-1">
                  <button
                    onClick={() => toggleSupplier(supplierName)}
                    className="w-full flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm">{supplierName}</span>
                      {hasExpiringSoon && (
                        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {supplierItems.length} productos • {totalStock} uds
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="ml-6 border-l pl-3 py-1">
                      {supplierItems.map(item => {
                        const isMatch = matchesSearch(item.name);
                        return (
                          <DropItem
                            key={item.id}
                            item={item}
                            isMatch={isMatch}
                            isExpiring={isExpiringSoon(item.nearest_expiry)}
                            isExpired={isExpired(item.nearest_expiry)}
                            getStockColor={getStockColor}
                            onDoubleClick={() => onSelectItem?.(item.name)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
