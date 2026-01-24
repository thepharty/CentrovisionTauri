import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/hooks/useBranch';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, Package, FolderTree, History, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CategoryTree } from '@/components/inventario-sala/CategoryTree';
import { CategoryForm } from '@/components/inventario-sala/CategoryForm';
import { ItemsList } from '@/components/inventario-sala/ItemsList';
import { ItemForm } from '@/components/inventario-sala/ItemForm';
import { StockMovementForm } from '@/components/inventario-sala/StockMovementForm';
import { MovementsHistory } from '@/components/inventario-sala/MovementsHistory';
import { LowStockAlert } from '@/components/inventario-sala/LowStockAlert';

export interface RoomInventoryCategory {
  id: string;
  name: string;
  parent_id: string | null;
  display_order: number;
  active: boolean;
  branch_id: string;
  created_at: string;
  updated_at: string;
}

export interface RoomInventoryItem {
  id: string;
  category_id: string;
  name: string;
  code: string | null;
  brand: string | null;
  specification: string | null;
  current_stock: number;
  min_stock: number;
  unit: string;
  notes: string | null;
  active: boolean;
  branch_id: string;
  created_at: string;
  updated_at: string;
  category?: RoomInventoryCategory;
}

export interface RoomInventoryMovement {
  id: string;
  item_id: string;
  quantity: number;
  movement_type: 'entrada' | 'uso' | 'ajuste';
  notes: string | null;
  user_id: string | null;
  branch_id: string;
  created_at: string;
  item?: RoomInventoryItem;
}

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export default function InventarioSala() {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { connectionMode } = useNetworkStatus();

  // Check if we should use local mode
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  
  const [selectedCategory, setSelectedCategory] = useState<RoomInventoryCategory | null>(null);
  const [selectedItem, setSelectedItem] = useState<RoomInventoryItem | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<RoomInventoryCategory | null>(null);
  const [editingItem, setEditingItem] = useState<RoomInventoryItem | null>(null);

  // Fetch categories
  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['room-inventory-categories', currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      if (isLocalMode) {
        return await invoke<RoomInventoryCategory[]>('get_room_inventory_categories', {
          branchId: currentBranch.id,
        });
      }

      const { data, error } = await supabase
        .from('room_inventory_categories')
        .select('*')
        .eq('branch_id', currentBranch.id)
        .eq('active', true)
        .order('display_order');
      if (error) throw error;
      return data as RoomInventoryCategory[];
    },
    enabled: !!currentBranch?.id,
  });

  // Fetch items for selected category
  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['room-inventory-items', currentBranch?.id, selectedCategory?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      if (isLocalMode) {
        return await invoke<RoomInventoryItem[]>('get_room_inventory_items', {
          branchId: currentBranch.id,
          categoryId: selectedCategory?.id || null,
        });
      }

      let query = supabase
        .from('room_inventory_items')
        .select('*, category:room_inventory_categories(*)')
        .eq('branch_id', currentBranch.id)
        .eq('active', true)
        .order('name');

      if (selectedCategory) {
        query = query.eq('category_id', selectedCategory.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as RoomInventoryItem[];
    },
    enabled: !!currentBranch?.id,
  });

  // Fetch all items for low stock alert
  const { data: allItems = [] } = useQuery({
    queryKey: ['room-inventory-all-items', currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      if (isLocalMode) {
        return await invoke<RoomInventoryItem[]>('get_room_inventory_items', {
          branchId: currentBranch.id,
          categoryId: null,
        });
      }

      const { data, error } = await supabase
        .from('room_inventory_items')
        .select('*, category:room_inventory_categories(*)')
        .eq('branch_id', currentBranch.id)
        .eq('active', true);
      if (error) throw error;
      return data as RoomInventoryItem[];
    },
    enabled: !!currentBranch?.id,
  });

  const lowStockItems = allItems.filter(item => item.current_stock <= item.min_stock);

  // Mutations
  const createCategoryMutation = useMutation({
    mutationFn: async (data: Partial<RoomInventoryCategory>) => {
      if (isLocalMode) {
        await invoke('create_room_inventory_category', {
          input: {
            name: data.name,
            parent_id: data.parent_id || null,
            display_order: data.display_order || 0,
            branch_id: currentBranch!.id,
          },
        });
        return;
      }

      const { error } = await supabase
        .from('room_inventory_categories')
        .insert({
          name: data.name,
          parent_id: data.parent_id || null,
          branch_id: currentBranch!.id,
          display_order: data.display_order || 0,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-inventory-categories'] });
      toast.success('Categoría creada');
      setShowCategoryForm(false);
    },
    onError: () => toast.error('Error al crear categoría'),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async (data: Partial<RoomInventoryCategory> & { id: string }) => {
      if (isLocalMode) {
        await invoke('update_room_inventory_category', {
          id: data.id,
          updates: {
            name: data.name,
            parent_id: data.parent_id,
            display_order: data.display_order,
          },
        });
        return;
      }

      const { error } = await supabase
        .from('room_inventory_categories')
        .update({
          name: data.name,
          parent_id: data.parent_id,
          display_order: data.display_order,
        })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-inventory-categories'] });
      toast.success('Categoría actualizada');
      setEditingCategory(null);
    },
    onError: () => toast.error('Error al actualizar categoría'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isLocalMode) {
        await invoke('delete_room_inventory_category', { id });
        return;
      }

      const { error } = await supabase
        .from('room_inventory_categories')
        .update({ active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-inventory-categories'] });
      toast.success('Categoría eliminada');
      if (selectedCategory?.id === editingCategory?.id) {
        setSelectedCategory(null);
      }
    },
    onError: () => toast.error('Error al eliminar categoría'),
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: Partial<RoomInventoryItem>) => {
      if (isLocalMode) {
        await invoke('create_room_inventory_item', {
          input: {
            category_id: data.category_id,
            name: data.name,
            code: data.code || null,
            brand: data.brand || null,
            specification: data.specification || null,
            current_stock: data.current_stock || 0,
            min_stock: data.min_stock || 5,
            unit: data.unit || 'unidad',
            notes: data.notes || null,
            branch_id: currentBranch!.id,
          },
        });
        return;
      }

      const { error } = await supabase
        .from('room_inventory_items')
        .insert({
          category_id: data.category_id,
          name: data.name,
          code: data.code || null,
          brand: data.brand || null,
          specification: data.specification || null,
          current_stock: data.current_stock || 0,
          min_stock: data.min_stock || 5,
          unit: data.unit || 'unidad',
          notes: data.notes || null,
          branch_id: currentBranch!.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['room-inventory-all-items'] });
      toast.success('Item creado');
      setShowItemForm(false);
    },
    onError: () => toast.error('Error al crear item'),
  });

  const updateItemMutation = useMutation({
    mutationFn: async (data: Partial<RoomInventoryItem> & { id: string }) => {
      if (isLocalMode) {
        await invoke('update_room_inventory_item', {
          id: data.id,
          updates: {
            category_id: data.category_id,
            name: data.name,
            code: data.code,
            brand: data.brand,
            specification: data.specification,
            min_stock: data.min_stock,
            unit: data.unit,
            notes: data.notes,
          },
        });
        return;
      }

      const { error } = await supabase
        .from('room_inventory_items')
        .update({
          category_id: data.category_id,
          name: data.name,
          code: data.code,
          brand: data.brand,
          specification: data.specification,
          min_stock: data.min_stock,
          unit: data.unit,
          notes: data.notes,
        })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['room-inventory-all-items'] });
      toast.success('Item actualizado');
      setEditingItem(null);
    },
    onError: () => toast.error('Error al actualizar item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isLocalMode) {
        await invoke('delete_room_inventory_item', { id });
        return;
      }

      const { error } = await supabase
        .from('room_inventory_items')
        .update({ active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['room-inventory-all-items'] });
      toast.success('Item eliminado');
    },
    onError: () => toast.error('Error al eliminar item'),
  });

  const createMovementMutation = useMutation({
    mutationFn: async (data: { item_id: string; quantity: number; movement_type: string; notes?: string }) => {
      // Calculate new stock
      const item = allItems.find(i => i.id === data.item_id);
      let newStock = item?.current_stock || 0;
      if (data.movement_type === 'entrada') {
        newStock += data.quantity;
      } else if (data.movement_type === 'uso') {
        newStock -= data.quantity;
      } else if (data.movement_type === 'ajuste') {
        newStock = data.quantity;
      }
      newStock = Math.max(0, newStock);

      if (isLocalMode) {
        // Create movement
        await invoke('create_room_inventory_movement', {
          input: {
            item_id: data.item_id,
            quantity: data.quantity,
            movement_type: data.movement_type,
            notes: data.notes || null,
            user_id: user?.id || null,
            branch_id: currentBranch!.id,
          },
        });
        // Update stock
        await invoke('update_room_inventory_stock', {
          id: data.item_id,
          newStock,
        });
        return;
      }

      // Crear movimiento
      const { error: movError } = await supabase
        .from('room_inventory_movements')
        .insert({
          item_id: data.item_id,
          quantity: data.quantity,
          movement_type: data.movement_type,
          notes: data.notes || null,
          user_id: user?.id,
          branch_id: currentBranch!.id,
        });
      if (movError) throw movError;

      // Actualizar stock del item
      if (item) {
        const { error: updateError } = await supabase
          .from('room_inventory_items')
          .update({ current_stock: newStock })
          .eq('id', data.item_id);
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['room-inventory-all-items'] });
      queryClient.invalidateQueries({ queryKey: ['room-inventory-movements'] });
      toast.success('Movimiento registrado');
      setSelectedItem(null);
    },
    onError: () => toast.error('Error al registrar movimiento'),
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Inventario de Sala</h1>
                <p className="text-sm text-muted-foreground">
                  {currentBranch?.name} - Gestión de insumos quirúrgicos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowCategoryForm(true)} variant="outline">
                <FolderTree className="h-4 w-4 mr-2" />
                Nueva Categoría
              </Button>
              <Button onClick={() => setShowItemForm(true)} disabled={categories.length === 0}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Item
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Low Stock Alert */}
        {lowStockItems.length > 0 && (
          <LowStockAlert items={lowStockItems} onSelectItem={setSelectedItem} />
        )}

        <div className="grid grid-cols-12 gap-6 mt-6">
          {/* Left Panel - Categories */}
          <div className="col-span-12 md:col-span-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FolderTree className="h-5 w-5" />
                  Categorías
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryTree
                  categories={categories}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  onEditCategory={setEditingCategory}
                  onDeleteCategory={(id) => deleteCategoryMutation.mutate(id)}
                  loading={loadingCategories}
                />
              </CardContent>
            </Card>
          </div>

          {/* Center Panel - Items */}
          <div className="col-span-12 md:col-span-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {selectedCategory ? selectedCategory.name : 'Todos los Items'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ItemsList
                  items={items}
                  selectedItem={selectedItem}
                  onSelectItem={setSelectedItem}
                  onEditItem={setEditingItem}
                  onDeleteItem={(id) => deleteItemMutation.mutate(id)}
                  loading={loadingItems}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Stock Movement / History */}
          <div className="col-span-12 md:col-span-4">
            <Tabs defaultValue="movement" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="movement">Movimiento</TabsTrigger>
                <TabsTrigger value="history">Historial</TabsTrigger>
              </TabsList>
              <TabsContent value="movement">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      {selectedItem ? `Stock: ${selectedItem.name}` : 'Seleccione un item'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedItem ? (
                      <StockMovementForm
                        item={selectedItem}
                        onSubmit={(data) => createMovementMutation.mutate(data)}
                        loading={createMovementMutation.isPending}
                      />
                    ) : (
                      <p className="text-muted-foreground text-center py-8">
                        Seleccione un item para registrar un movimiento
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="history">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Historial
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MovementsHistory
                      itemId={selectedItem?.id}
                      branchId={currentBranch?.id}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Category Form Dialog */}
      {(showCategoryForm || editingCategory) && (
        <CategoryForm
          open={showCategoryForm || !!editingCategory}
          onClose={() => {
            setShowCategoryForm(false);
            setEditingCategory(null);
          }}
          category={editingCategory}
          categories={categories}
          onSubmit={(data) => {
            if (editingCategory) {
              updateCategoryMutation.mutate({ ...data, id: editingCategory.id });
            } else {
              createCategoryMutation.mutate(data);
            }
          }}
          loading={createCategoryMutation.isPending || updateCategoryMutation.isPending}
        />
      )}

      {/* Item Form Dialog */}
      {(showItemForm || editingItem) && (
        <ItemForm
          open={showItemForm || !!editingItem}
          onClose={() => {
            setShowItemForm(false);
            setEditingItem(null);
          }}
          item={editingItem}
          categories={categories}
          selectedCategoryId={selectedCategory?.id}
          onSubmit={(data) => {
            if (editingItem) {
              updateItemMutation.mutate({ ...data, id: editingItem.id });
            } else {
              createItemMutation.mutate(data);
            }
          }}
          loading={createItemMutation.isPending || updateItemMutation.isPending}
        />
      )}
    </div>
  );
}
