import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useBranch } from '@/hooks/useBranch';

export default function LotManagement() {
  const { currentBranch } = useBranch();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [lotNumber, setLotNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [costPrice, setCostPrice] = useState('');

  // Buscar productos que requieren lote
  const { data: products } = useQuery({
    queryKey: ['lot-products', searchProduct, currentBranch?.id],
    queryFn: async () => {
      if (!searchProduct || searchProduct.length < 2) return [];
      if (!currentBranch?.id) return [];
      
      const { data } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('active', true)
        .eq('requires_lot', true)
        .eq('branch_id', currentBranch.id)
        .or(`name.ilike.%${searchProduct}%,code.ilike.%${searchProduct}%`)
        .limit(10);
      return data || [];
    },
    enabled: searchProduct.length >= 2 && !!currentBranch?.id,
  });

  // Obtener todos los lotes
  const { data: allLots } = useQuery({
    queryKey: ['all-lots', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];
      
      const { data } = await supabase
        .from('inventory_lots')
        .select(`
          *,
          inventory_items!inner (name, code, category, branch_id)
        `)
        .eq('inventory_items.branch_id', currentBranch.id)
        .order('expiry_date', { ascending: true });
      return data || [];
    },
  });

  // Crear lote
  const createLot = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error('Seleccione un producto');
      if (!lotNumber) throw new Error('Ingrese el número de lote');
      if (!quantity || Number(quantity) <= 0) throw new Error('Ingrese una cantidad válida');

      const { error } = await supabase
        .from('inventory_lots')
        .insert({
          item_id: selectedProduct.id,
          lot_number: lotNumber,
          quantity: Number(quantity),
          expiry_date: expiryDate || null,
          cost_price: costPrice ? Number(costPrice) : null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Lote creado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['all-lots'] });
      queryClient.invalidateQueries({ queryKey: ['product-lots'] });
      
      // Reset form
      setSelectedProduct(null);
      setLotNumber('');
      setQuantity('');
      setExpiryDate('');
      setCostPrice('');
      setSearchProduct('');
      setShowForm(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al crear lote');
    },
  });

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

  return (
    <div className="space-y-4">
      {/* Botón para mostrar formulario */}
      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Crear Nuevo Lote
        </Button>
      )}

      {/* Formulario */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo Lote</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Buscar Producto *</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Productos con control de lote..."
                    value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {products && products.length > 0 && !selectedProduct && (
                  <div className="mt-2 border rounded-md max-h-48 overflow-y-auto">
                    {products.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => {
                          setSelectedProduct(product);
                          setSearchProduct('');
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-muted"
                      >
                        <p className="font-medium">{product.name}</p>
                        {product.code && (
                          <p className="text-xs text-muted-foreground">{product.code}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedProduct && (
                  <div className="mt-2 p-3 bg-muted rounded-md">
                    <p className="font-medium">{selectedProduct.name}</p>
                  </div>
                )}
              </div>

              {selectedProduct && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Número de Lote *</Label>
                      <Input
                        value={lotNumber}
                        onChange={(e) => setLotNumber(e.target.value)}
                        placeholder="Ej: LOT-2025-001"
                      />
                    </div>

                    <div>
                      <Label>Cantidad Inicial *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Fecha de Vencimiento</Label>
                      <Input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label>Precio de Costo</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={costPrice}
                        onChange={(e) => setCostPrice(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => createLot.mutate()}
                      disabled={createLot.isPending}
                      className="flex-1"
                    >
                      {createLot.isPending ? 'Creando...' : 'Crear Lote'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowForm(false)}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de lotes */}
      <Card>
        <CardHeader>
          <CardTitle>Lotes Registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {allLots && allLots.length > 0 ? (
            <div className="space-y-2">
              {allLots.map((lot) => (
                <div
                  key={lot.id}
                  className={`p-3 border rounded-md ${
                    isExpired(lot.expiry_date)
                      ? 'border-red-300 bg-red-50'
                      : isExpiringSoon(lot.expiry_date)
                      ? 'border-orange-300 bg-orange-50'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{lot.lot_number}</p>
                        {isExpired(lot.expiry_date) && (
                          <Badge variant="destructive" className="text-xs">
                            Vencido
                          </Badge>
                        )}
                        {isExpiringSoon(lot.expiry_date) && !isExpired(lot.expiry_date) && (
                          <Badge className="bg-orange-100 text-orange-800 text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Por vencer
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mt-1">{lot.inventory_items?.name}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span>Stock: {Number(lot.quantity).toFixed(2)}</span>
                        {lot.expiry_date && (
                          <span>
                            Vence: {new Date(lot.expiry_date).toLocaleDateString('es-MX')}
                          </span>
                        )}
                        {lot.cost_price && (
                          <span>Costo: ${Number(lot.cost_price).toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No hay lotes registrados
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
