import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBranch } from '@/hooks/useBranch';

interface InventoryItemFormProps {
  item?: any;
  onClose: () => void;
}

export default function InventoryItemForm({ item, onClose }: InventoryItemFormProps) {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [formData, setFormData] = useState({
    code: item?.code || '',
    name: item?.name || '',
    category: item?.category || 'medicamento',
    supplier_id: item?.supplier_id || '',
    requires_lot: item?.requires_lot || false,
    current_stock: item?.current_stock ? Number(item.current_stock) : 0,
    min_stock: item?.min_stock ? Number(item.min_stock) : 0,
    unit_price: item?.unit_price ? String(item.unit_price) : '',
    cost_price: item?.cost_price ? String(item.cost_price) : '',
    notes: item?.notes || '',
  });

  // Fetch suppliers
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name) throw new Error('El nombre es requerido');
      
      const unitPrice = Number(formData.unit_price);
      const costPrice = Number(formData.cost_price);
      
      if (!unitPrice || unitPrice <= 0) throw new Error('El precio debe ser mayor a 0');

      const data = {
        code: formData.code || null,
        name: formData.name,
        category: formData.category,
        supplier_id: formData.supplier_id || null,
        requires_lot: formData.requires_lot,
        current_stock: formData.current_stock,
        min_stock: formData.min_stock,
        unit_price: unitPrice,
        cost_price: costPrice,
        notes: formData.notes || null,
        active: true,
        branch_id: currentBranch?.id || '',
      };

      if (item) {
        // Update
        const { error } = await supabase
          .from('inventory_items')
          .update(data)
          .eq('id', item.id);
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('inventory_items')
          .insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(item ? 'Producto actualizado' : 'Producto creado');
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al guardar producto');
    },
  });

  const createSupplierMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (newSupplier) => {
      setFormData({ ...formData, supplier_id: newSupplier.id });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowSupplierDialog(false);
      setNewSupplierName('');
      toast.success('Proveedor creado exitosamente');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al crear proveedor');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!item) return;
      
      // Verificar si el producto tiene movimientos de inventario
      const { data: movements, error: movError } = await supabase
        .from('inventory_movements')
        .select('id')
        .eq('item_id', item.id)
        .limit(1);
      
      if (movError) throw movError;
      
      if (movements && movements.length > 0) {
        throw new Error('No se puede eliminar: el producto tiene movimientos de inventario registrados');
      }
      
      // Verificar si el producto está en facturas
      const { data: invoiceItems, error: invError } = await supabase
        .from('invoice_items')
        .select('id')
        .eq('item_id', item.id)
        .limit(1);
      
      if (invError) throw invError;
      
      if (invoiceItems && invoiceItems.length > 0) {
        throw new Error('No se puede eliminar: el producto está incluido en facturas');
      }
      
      // Soft delete: marcar como inactivo
      const { error } = await supabase
        .from('inventory_items')
        .update({ active: false })
        .eq('id', item.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Producto eliminado correctamente');
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setShowDeleteDialog(false);
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al eliminar producto');
      setShowDeleteDialog(false);
    },
  });

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onClose} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver al inventario
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{item ? 'Editar Producto' : 'Nuevo Producto'}</CardTitle>
            {item && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Código (Opcional)</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="SKU o código interno"
                />
              </div>

              <div>
                <Label>Nombre *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nombre del producto"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Categoría *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medicamento">Medicamento</SelectItem>
                    <SelectItem value="gota">Gota</SelectItem>
                    <SelectItem value="lente">Lente</SelectItem>
                    <SelectItem value="aro">Aro</SelectItem>
                    <SelectItem value="accesorio">Accesorio</SelectItem>
                    <SelectItem value="certificado_medico">Certificado Médico</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Proveedor (Opcional)</Label>
                <Select
                  value={formData.supplier_id}
                  onValueChange={(value) => {
                    if (value === '__add_new__') {
                      setShowSupplierDialog(true);
                    } else {
                      setFormData({ ...formData, supplier_id: value });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__add_new__">
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        <span>Agregar proveedor</span>
                      </div>
                    </SelectItem>
                    {suppliers?.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div>
                <Label>Precio de Costo</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.cost_price}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, '');
                    // Permitir solo un punto decimal
                    const parts = value.split('.');
                    const formattedValue = parts.length > 2 
                      ? parts[0] + '.' + parts.slice(1).join('')
                      : value;
                    setFormData({ ...formData, cost_price: formattedValue });
                  }}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Costo de adquisición del producto
                </p>
              </div>

              <div>
                <Label>Precio Unitario (Venta) *</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.unit_price}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, '');
                    // Permitir solo un punto decimal
                    const parts = value.split('.');
                    const formattedValue = parts.length > 2 
                      ? parts[0] + '.' + parts.slice(1).join('')
                      : value;
                    setFormData({ ...formData, unit_price: formattedValue });
                  }}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Margen: {Number(formData.unit_price) > 0 && Number(formData.cost_price) > 0 
                    ? `${(((Number(formData.unit_price) - Number(formData.cost_price)) / Number(formData.unit_price)) * 100).toFixed(1)}%`
                    : 'N/A'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Stock Actual</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({ ...formData, current_stock: Number(e.target.value) })}
                  placeholder="0.00"
                  disabled={!!item}
                />
                {item && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Use movimientos de inventario para ajustar stock
                  </p>
                )}
              </div>

              <div>
                <Label>Stock Mínimo</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({ ...formData, min_stock: Number(e.target.value) })}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Alerta cuando esté por debajo
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.requires_lot}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_lot: checked })}
              />
              <Label>Requiere control de lotes</Label>
            </div>

            <div>
              <Label>Notas (Opcional)</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Información adicional del producto..."
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex-1"
              >
                {saveMutation.isPending ? 'Guardando...' : item ? 'Actualizar' : 'Crear Producto'}
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Esta acción desactivará el producto <strong>"{item?.name}"</strong>.
              </p>
              {item?.current_stock > 0 && (
                <p className="text-orange-600 font-medium">
                  ⚠️ Advertencia: El producto tiene stock actual de {item.current_stock}
                </p>
              )}
              <p className="text-sm">
                No podrás usarlo en nuevas facturas, pero se mantendrá el historial existente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar Producto'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Proveedor</DialogTitle>
            <DialogDescription>
              Ingrese el nombre del nuevo proveedor
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nombre del Proveedor *</Label>
              <Input
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="Ej: Farmacia ABC"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSupplierName.trim()) {
                    createSupplierMutation.mutate(newSupplierName.trim());
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSupplierDialog(false);
                setNewSupplierName('');
              }}
              disabled={createSupplierMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => createSupplierMutation.mutate(newSupplierName.trim())}
              disabled={!newSupplierName.trim() || createSupplierMutation.isPending}
            >
              {createSupplierMutation.isPending ? 'Creando...' : 'Crear Proveedor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
