import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, TrendingUp, TrendingDown, Settings, FileText, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useBranch } from '@/hooks/useBranch';
import { InventoryMovementsReport } from './InventoryMovementsReport';
import jsPDF from 'jspdf';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface EntryData {
  productName: string;
  productCode: string;
  quantity: number;
  costPrice: number;
  date: Date;
}

export default function InventoryMovements() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const [showForm, setShowForm] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedLot, setSelectedLot] = useState<string>('');
  const [movementType, setMovementType] = useState<'entrada' | 'salida' | 'ajuste'>('entrada');
  const [quantity, setQuantity] = useState('');
  const [referenceType, setReferenceType] = useState('');
  const [notes, setNotes] = useState('');
  
  // Estados para el popup de factura de compra
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [lastEntryData, setLastEntryData] = useState<EntryData | null>(null);
  
  // Estado para animación de escaneo exitoso
  const [scanSuccess, setScanSuccess] = useState(false);

  // Buscar productos
  // Buscar productos (filtrado por sucursal actual)
  const { data: products } = useQuery({
    queryKey: ['inventory-search', searchProduct, currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!searchProduct || searchProduct.length < 2 || !currentBranch?.id) return [];

      if (isLocalMode) {
        // En modo local, obtener todos y filtrar client-side
        const allItems = await invoke<any[]>('get_inventory_items', { branchId: currentBranch.id });
        const searchLower = searchProduct.toLowerCase();
        return allItems
          .filter(item => item.active !== false &&
            (item.name?.toLowerCase().includes(searchLower) ||
             item.code?.toLowerCase().includes(searchLower)))
          .slice(0, 10);
      }

      const { data } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('active', true)
        .eq('branch_id', currentBranch.id)
        .or(`name.ilike.%${searchProduct}%,code.ilike.%${searchProduct}%`)
        .limit(10);
      return data || [];
    },
    enabled: searchProduct.length >= 2 && !!currentBranch?.id,
  });

  // Efecto para selección automática por código de barras (coincidencia exacta)
  useEffect(() => {
    if (products && products.length > 0 && searchProduct.length >= 2 && !selectedProduct) {
      const exactMatch = products.find(
        p => p.code?.toUpperCase() === searchProduct.toUpperCase()
      );
      if (exactMatch) {
        setSelectedProduct(exactMatch);
        setSearchProduct('');
        setScanSuccess(true);
        setTimeout(() => setScanSuccess(false), 1500);
        toast.success(`✓ ${exactMatch.name}`, { duration: 2000 });
      }
    }
  }, [products, searchProduct, selectedProduct]);

  // Obtener lotes del producto seleccionado
  const { data: lots } = useQuery({
    queryKey: ['product-lots', selectedProduct?.id, isLocalMode],
    queryFn: async () => {
      if (!selectedProduct) return [];

      if (isLocalMode) {
        return await invoke<any[]>('get_inventory_lots', { itemId: selectedProduct.id });
      }

      const { data } = await supabase
        .from('inventory_lots')
        .select('*')
        .eq('item_id', selectedProduct.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!selectedProduct && selectedProduct.requires_lot,
  });

  // Historial de movimientos
  const { data: movements } = useQuery({
    queryKey: ['inventory-movements', currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      if (isLocalMode) {
        return await invoke<any[]>('get_inventory_movements', {
          branchId: currentBranch.id,
          limit: 50
        });
      }

      const { data } = await supabase
        .from('inventory_movements')
        .select(`
          *,
          inventory_items (name, code),
          inventory_lots (lot_number)
        `)
        .eq('branch_id', currentBranch.id)
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Generar PDF de comprobante de compra
  const generatePurchasePDF = () => {
    if (!lastEntryData) return;
    
    const doc = new jsPDF();
    const total = lastEntryData.quantity * lastEntryData.costPrice;
    
    // Encabezado
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPROBANTE DE COMPRA', 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text('ENTRADA DE INVENTARIO', 105, 28, { align: 'center' });
    
    // Línea separadora
    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);
    
    // Fecha
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Fecha:', 20, 48);
    doc.setFont('helvetica', 'bold');
    doc.text(lastEntryData.date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }), 50, 48);
    
    // Producto
    doc.setFont('helvetica', 'normal');
    doc.text('Producto:', 20, 60);
    doc.setFont('helvetica', 'bold');
    doc.text(lastEntryData.productName, 50, 60);
    
    // Código
    doc.setFont('helvetica', 'normal');
    doc.text('Código:', 20, 72);
    doc.setFont('helvetica', 'bold');
    doc.text(lastEntryData.productCode || 'N/A', 50, 72);
    
    // Cantidad
    doc.setFont('helvetica', 'normal');
    doc.text('Cantidad:', 20, 84);
    doc.setFont('helvetica', 'bold');
    doc.text(lastEntryData.quantity.toString(), 50, 84);
    
    // Costo unitario
    doc.setFont('helvetica', 'normal');
    doc.text('Costo Unitario:', 20, 96);
    doc.setFont('helvetica', 'bold');
    doc.text(`Q ${lastEntryData.costPrice.toFixed(2)}`, 65, 96);
    
    // Línea separadora antes del total
    doc.setLineWidth(0.3);
    doc.line(20, 105, 100, 105);
    
    // Total (más grande y destacado)
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 20, 116);
    doc.text(`Q ${total.toFixed(2)}`, 65, 116);
    
    // Guardar PDF
    const fileName = `compra_${lastEntryData.productCode || 'producto'}_${lastEntryData.date.toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    
    toast.success('Comprobante de compra descargado');
  };

  // Crear movimiento
  const createMovement = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error('Seleccione un producto');
      if (!quantity || Number(quantity) === 0) throw new Error('Ingrese una cantidad válida');

      // Validar stock para salidas
      if (movementType === 'salida' && Number(quantity) > (selectedProduct.current_stock || 0)) {
        throw new Error(`Stock insuficiente. Disponible: ${selectedProduct.current_stock || 0}`);
      }

      if (selectedProduct.requires_lot && movementType !== 'ajuste' && !selectedLot) {
        throw new Error('Este producto requiere seleccionar un lote');
      }

      const movementData = {
        branch_id: currentBranch?.id || '',
        item_id: selectedProduct.id,
        lot_id: selectedLot || null,
        movement_type: movementType,
        quantity: Number(quantity),
        reference_type: referenceType || null,
        notes: notes || null,
      };

      if (isLocalMode) {
        await invoke('create_inventory_movement', { movement: movementData });
      } else {
        const { error } = await supabase
          .from('inventory_movements')
          .insert(movementData);

        if (error) throw error;
      }

      // Retornar datos para usar en onSuccess
      return {
        isEntry: movementType === 'entrada',
        productName: selectedProduct.name,
        productCode: selectedProduct.code || '',
        quantity: Number(quantity),
        costPrice: Number(selectedProduct.cost_price) || 0,
      };
    },
    onSuccess: (data) => {
      toast.success('Movimiento registrado exitosamente');
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['product-lots'] });
      
      // Si es una entrada, preguntar si desea descargar comprobante de compra
      if (data?.isEntry) {
        setLastEntryData({
          productName: data.productName,
          productCode: data.productCode,
          quantity: data.quantity,
          costPrice: data.costPrice,
          date: new Date()
        });
        setShowPurchaseDialog(true);
      }
      
      // Reset form
      setSelectedProduct(null);
      setSelectedLot('');
      setQuantity('');
      setReferenceType('');
      setNotes('');
      setSearchProduct('');
      setShowForm(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al registrar movimiento');
    },
  });

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'entrada':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'salida':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Settings className="h-4 w-4 text-blue-600" />;
    }
  };

  const getMovementColor = (type: string) => {
    switch (type) {
      case 'entrada':
        return 'bg-green-100 text-green-800';
      case 'salida':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="space-y-4">
      {/* Botón para mostrar formulario */}
        {!showForm && (
          <div className="flex gap-2">
            <Button onClick={() => setShowForm(true)} className="flex-1">
              Registrar Movimiento
            </Button>
            <Button variant="outline" onClick={() => setShowReportDialog(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Informe
            </Button>
          </div>
        )}

      {/* Formulario */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo Movimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Seleccionar producto */}
              <div>
                <Label>Buscar Producto *</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Escanear código o buscar..."
                    value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    className={`pl-10 transition-all duration-300 ${
                      scanSuccess ? 'ring-2 ring-green-500 bg-green-50' : ''
                    }`}
                  />
                  {scanSuccess && (
                    <div className="absolute right-3 top-3 animate-scale-in">
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                  )}
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
                    <p className="text-sm text-muted-foreground">
                      Stock actual: {Number(selectedProduct.current_stock).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              {selectedProduct && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Tipo de Movimiento *</Label>
                      <Select
                        value={movementType}
                        onValueChange={(value: any) => setMovementType(value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada</SelectItem>
                          <SelectItem value="salida">Salida</SelectItem>
                          <SelectItem value="ajuste">Ajuste</SelectItem>
                        </SelectContent>
                      </Select>
                      {movementType === 'entrada' && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          Si acaba de crear este producto con stock inicial, NO necesita registrar entrada.
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>Cantidad *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {selectedProduct.requires_lot && movementType !== 'ajuste' && (
                    <div>
                      <Label>Lote *</Label>
                      <Select value={selectedLot} onValueChange={setSelectedLot}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione un lote" />
                        </SelectTrigger>
                        <SelectContent>
                          {lots?.map((lot) => (
                            <SelectItem key={lot.id} value={lot.id}>
                              {lot.lot_number} - Stock: {Number(lot.quantity).toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label>Tipo de Referencia</Label>
                    <Select value={referenceType} onValueChange={setReferenceType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compra">Compra</SelectItem>
                        <SelectItem value="venta">Venta</SelectItem>
                        <SelectItem value="ajuste">Ajuste</SelectItem>
                        <SelectItem value="devolucion">Devolución</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Notas</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observaciones..."
                      rows={2}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => createMovement.mutate()}
                      disabled={createMovement.isPending}
                      className="flex-1"
                    >
                      {createMovement.isPending ? 'Registrando...' : 'Registrar Movimiento'}
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

      {/* Historial */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Movimientos</CardTitle>
        </CardHeader>
        <CardContent>
          {movements && movements.length > 0 ? (
            <div className="space-y-2">
              {movements.map((movement) => (
                <div key={movement.id} className="p-3 border rounded-md">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getMovementIcon(movement.movement_type)}
                        <Badge className={getMovementColor(movement.movement_type)}>
                          {movement.movement_type.charAt(0).toUpperCase() + movement.movement_type.slice(1)}
                        </Badge>
                        <span className="font-medium">
                          {movement.movement_type === 'salida' ? '-' : '+'}
                          {Math.abs(Number(movement.quantity)).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-sm font-medium mt-1">
                        {movement.inventory_items?.name}
                      </p>
                      {movement.inventory_lots && (
                        <p className="text-xs text-muted-foreground">
                          Lote: {movement.inventory_lots.lot_number}
                        </p>
                      )}
                      {movement.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{movement.notes}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(movement.created_at).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No hay movimientos registrados
            </p>
          )}
        </CardContent>
      </Card>

      <InventoryMovementsReport
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
      />

      {/* Popup de confirmación de descarga de comprobante de compra */}
      <AlertDialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>📄 Comprobante de Compra</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Desea descargar el comprobante de entrada para llevar control de esta compra?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowPurchaseDialog(false);
              setLastEntryData(null);
            }}>
              No
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              generatePurchasePDF();
              setShowPurchaseDialog(false);
              setLastEntryData(null);
            }}>
              Sí, descargar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
