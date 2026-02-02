import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { jsPDF } from 'jspdf';
import { useBranch } from '@/hooks/useBranch';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, AlertTriangle, Edit, Plus, Download, Gift, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { toast } from 'sonner';
import InventoryItemForm from './InventoryItemForm';
import BulkImportDialog from './BulkImportDialog';

interface InventoryListProps {
  showSecretButton?: boolean;
}

export default function InventoryList({ showSecretButton = false }: InventoryListProps) {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const { currentBranch } = useBranch();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [courtesyDialogOpen, setCourtesyDialogOpen] = useState(false);
  const [selectedCourtesyItem, setSelectedCourtesyItem] = useState<any>(null);
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [courtesyQuantity, setCourtesyQuantity] = useState(1);
  const [showBulkImport, setShowBulkImport] = useState(false);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        // En modo local, usar el comando Tauri
        const data = await invoke<any[]>('get_suppliers', {});
        // Filtrar activos y ordenar
        return (data || [])
          .filter(s => s.active)
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ['inventory-items', categoryFilter, supplierFilter, showLowStock, currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      if (isLocalMode) {
        // En modo local, usar el comando Tauri
        const data = await invoke<any[]>('get_inventory_items', {
          branchId: currentBranch.id,
        });

        // Aplicar filtros en cliente
        let filtered = (data || []).filter(item => item.active);

        if (categoryFilter !== 'all') {
          filtered = filtered.filter(item => item.category === categoryFilter);
        }

        if (supplierFilter !== 'all') {
          filtered = filtered.filter(item => item.supplier_id === supplierFilter);
        }

        if (showLowStock) {
          filtered = filtered.filter(item => Number(item.current_stock) <= Number(item.min_stock || 0));
        }

        // Mapear supplier a suppliers para compatibilidad
        return filtered
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(item => ({
            ...item,
            suppliers: item.supplier ? { name: item.supplier.name } : null
          }));
      }

      let query = supabase
        .from('inventory_items')
        .select('*, suppliers(name)')
        .eq('active', true)
        .eq('branch_id', currentBranch.id)
        .order('name')
        .limit(5000);

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      if (supplierFilter !== 'all') {
        query = query.eq('supplier_id', supplierFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (showLowStock) {
        return data?.filter(item => Number(item.current_stock) <= Number(item.min_stock || 0)) || [];
      }

      return data || [];
    },
  });

  const filteredItems = items?.filter((item) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(searchLower) ||
      item.code?.toLowerCase().includes(searchLower) ||
      item.category.toLowerCase().includes(searchLower)
    );
  });

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'medicamento':
        return 'bg-blue-100 text-blue-800';
      case 'gota':
        return 'bg-cyan-100 text-cyan-800';
      case 'lente':
        return 'bg-purple-100 text-purple-800';
      case 'aro':
        return 'bg-pink-100 text-pink-800';
      case 'accesorio':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      medicamento: 'Medicamento',
      gota: 'Gota',
      lente: 'Lente',
      aro: 'Aro',
      accesorio: 'Accesorio',
      otro: 'Otro',
    };
    return labels[category] || category;
  };

  const isLowStock = (item: any) => {
    return Number(item.current_stock) <= Number(item.min_stock || 0);
  };

  const generateCourtesyPDF = (item: any, authorizedBy: string, quantity: number) => {
    const doc = new jsPDF();
    
    // Configurar fuente
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    
    // Título
    doc.text('COMPROBANTE DE CORTESÍA', 105, 30, { align: 'center' });
    
    // Línea decorativa
    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);
    
    // Información del producto
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    
    let yPos = 50;
    
    doc.text('Producto:', 20, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(item.name, 70, yPos);
    yPos += 10;
    
    if (item.code) {
      doc.setFont('helvetica', 'normal');
      doc.text('Código:', 20, yPos);
      doc.setFont('helvetica', 'bold');
      doc.text(item.code, 70, yPos);
      yPos += 10;
    }
    
    // Cantidad
    doc.setFont('helvetica', 'normal');
    doc.text('Cantidad:', 20, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(quantity.toString(), 70, yPos);
    yPos += 10;
    
    // Autorizado por
    doc.setFont('helvetica', 'normal');
    doc.text('Autorizado por:', 20, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(authorizedBy, 70, yPos);
    yPos += 10;
    
    // Fecha y hora
    doc.setFont('helvetica', 'normal');
    doc.text('Fecha:', 20, yPos);
    doc.text(format(new Date(), 'dd/MM/yyyy HH:mm'), 70, yPos);
    yPos += 10;
    
    // Sucursal si existe
    if (currentBranch?.name) {
      doc.text('Sucursal:', 20, yPos);
      doc.text(currentBranch.name, 70, yPos);
      yPos += 10;
    }
    
    // Espacio para firma
    const signatureY = yPos + 20;
    doc.setFont('helvetica', 'normal');
    doc.text('Firma:', 20, signatureY);
    
    // Línea para firma
    doc.setLineWidth(0.3);
    doc.line(50, signatureY + 2, 150, signatureY + 2);
    
    // Pie de página
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Centro Visión - Sistema de Gestión de Inventario', 105, 280, { align: 'center' });
    
    // Descargar
    const fileName = `cortesia_${item.code || 'producto'}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
    doc.save(fileName);
  };

  const handleCourtesy = async () => {
    if (!authorizedBy.trim()) {
      toast.error('Por favor ingrese quién autorizó la cortesía');
      return;
    }

    if (!selectedCourtesyItem) return;

    if (courtesyQuantity < 1) {
      toast.error('La cantidad debe ser al menos 1');
      return;
    }

    if (courtesyQuantity > (selectedCourtesyItem?.current_stock || 0)) {
      toast.error('No hay suficiente stock disponible');
      return;
    }

    try {
      // 1. Registrar movimiento en inventory_movements
      if (isLocalMode) {
        // En modo local, usar Tauri command
        console.log('[InventoryList] Creating courtesy movement via PostgreSQL local');
        await invoke('create_inventory_movement', {
          movement: {
            branch_id: currentBranch?.id || '',
            item_id: selectedCourtesyItem.id,
            movement_type: 'cortesia',
            quantity: -courtesyQuantity,
            notes: `Cortesía (x${courtesyQuantity}) - Autorizado por: ${authorizedBy}`,
            reference_type: 'cortesia',
          }
        });
      } else {
        const { error } = await supabase
          .from('inventory_movements')
          .insert({
            branch_id: currentBranch?.id || '',
            item_id: selectedCourtesyItem.id,
            movement_type: 'cortesia',
            quantity: -courtesyQuantity,
            notes: `Cortesía (x${courtesyQuantity}) - Autorizado por: ${authorizedBy}`,
            reference_type: 'cortesia',
          });

        if (error) throw error;
      }

      // 2. Generar PDF de comprobante
      generateCourtesyPDF(selectedCourtesyItem, authorizedBy, courtesyQuantity);

      // 3. Mostrar éxito
      toast.success('Cortesía registrada exitosamente. Documento descargado.');

      // 3.5. Invalidar query para actualizar la UI
      await queryClient.invalidateQueries({ queryKey: ['inventory-items'] });

      // 4. Limpiar y cerrar
      setCourtesyDialogOpen(false);
      setAuthorizedBy('');
      setCourtesyQuantity(1);
      setSelectedCourtesyItem(null);
    } catch (error: any) {
      console.error('Error registrando cortesía:', error);
      toast.error('Error al registrar la cortesía');
    }
  };

  const exportInventoryToExcel = () => {
    if (!filteredItems || filteredItems.length === 0) {
      toast.error('No hay productos para exportar');
      return;
    }

    // Agrupar productos por categoría
    const productsByCategory = filteredItems.reduce((acc, item) => {
      const category = item.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    // Crear libro de Excel
    const workbook = XLSX.utils.book_new();

    // Crear hoja de resumen
    const summaryData = Object.entries(productsByCategory).map(([category, products]) => {
      const totalValue = products.reduce((sum, p) => 
        sum + (Number(p.current_stock) * Number(p.unit_price)), 0
      );
      const lowStockCount = products.filter(p => isLowStock(p)).length;
      
      return {
        'Categoría': getCategoryLabel(category),
        'Total Productos': products.length,
        'Valor Total': new Intl.NumberFormat('es-GT', {
          style: 'currency',
          currency: 'GTQ'
        }).format(totalValue),
        'Con Stock Bajo': lowStockCount
      };
    });

    const summarySheet = XLSX.utils.json_to_sheet([
      { 'Categoría': 'REPORTE DE INVENTARIO', 'Total Productos': '', 'Valor Total': '', 'Con Stock Bajo': '' },
      { 'Categoría': `Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 'Total Productos': '', 'Valor Total': '', 'Con Stock Bajo': '' },
      {},
      ...summaryData
    ]);

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

    // Crear una hoja por cada categoría
    Object.entries(productsByCategory).forEach(([category, products]) => {
      const sheetData = products.map(item => ({
        'Código': item.code || '',
        'Nombre': item.name,
        'Stock Actual': Number(item.current_stock),
        'Stock Mínimo': Number(item.min_stock || 0),
        'Precio': Number(item.unit_price),
        'Valor Total': Number(item.current_stock) * Number(item.unit_price),
        'Proveedor': item.suppliers?.name || '',
        'Estado': isLowStock(item) ? '⚠️ STOCK BAJO' : 'OK'
      }));

      // Agregar totales al final
      const totalProducts = products.length;
      const totalStock = products.reduce((sum, p) => sum + Number(p.current_stock), 0);
      const totalValue = products.reduce((sum, p) => 
        sum + (Number(p.current_stock) * Number(p.unit_price)), 0
      );

      sheetData.push({} as any);
      sheetData.push({
        'Código': 'TOTALES',
        'Nombre': `${totalProducts} productos`,
        'Stock Actual': totalStock,
        'Stock Mínimo': '' as any,
        'Precio': '' as any,
        'Valor Total': totalValue,
        'Proveedor': '',
        'Estado': ''
      } as any);

      const sheet = XLSX.utils.json_to_sheet(sheetData);
      
      // Aplicar anchos de columna
      sheet['!cols'] = [
        { wch: 12 },  // Código
        { wch: 35 },  // Nombre
        { wch: 12 },  // Stock Actual
        { wch: 12 },  // Stock Mínimo
        { wch: 12 },  // Precio
        { wch: 15 },  // Valor Total
        { wch: 20 },  // Proveedor
        { wch: 15 },  // Estado
      ];

      XLSX.utils.book_append_sheet(workbook, sheet, getCategoryLabel(category));
    });

    // Descargar archivo
    const fileName = `inventario_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    toast.success('Inventario exportado exitosamente');
  };

  if (showForm) {
    return (
      <InventoryItemForm
        item={editingItem}
        onClose={() => {
          setShowForm(false);
          setEditingItem(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros y búsqueda */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="medicamento">Medicamento</SelectItem>
                <SelectItem value="gota">Gota</SelectItem>
                <SelectItem value="lente">Lente</SelectItem>
                <SelectItem value="aro">Aro</SelectItem>
                <SelectItem value="accesorio">Accesorio</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>

            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                {suppliers?.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={showLowStock ? 'default' : 'outline'}
              onClick={() => setShowLowStock(!showLowStock)}
              className="w-full"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Stock Bajo
            </Button>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              onClick={exportInventoryToExcel}
              disabled={!filteredItems || filteredItems.length === 0}
              className="flex-1"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar a Excel
            </Button>

            {(hasRole('admin') || hasRole('contabilidad')) && (
              <Button
                onClick={() => setShowForm(true)}
                className="flex-1"
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar Producto
              </Button>
            )}

            {showSecretButton && (
              <Button variant="outline" onClick={() => setShowBulkImport(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Cargar archivo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de importación masiva */}
      <BulkImportDialog 
        open={showBulkImport} 
        onOpenChange={setShowBulkImport}
      />

      {/* Lista de productos */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Cargando inventario...</p>
          </CardContent>
        </Card>
      ) : filteredItems && filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <Card key={item.id} className={isLowStock(item) ? 'border-orange-300' : ''}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold">{item.name}</p>
                      {item.code && (
                        <p className="text-xs text-muted-foreground">Código: {item.code}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {/* Botón de Cortesía */}
                      {(hasRole('admin') || hasRole('caja') || hasRole('contabilidad')) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedCourtesyItem(item);
                            setCourtesyDialogOpen(true);
                          }}
                          title="Registrar cortesía"
                        >
                          <Gift className="h-4 w-4 text-blue-600" />
                        </Button>
                      )}
                      {/* Botón de Editar */}
                      {(hasRole('admin') || hasRole('contabilidad')) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingItem(item);
                            setShowForm(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Badge className={getCategoryColor(item.category)}>
                      {getCategoryLabel(item.category)}
                    </Badge>
                    {item.suppliers?.name && (
                      <Badge variant="outline" className="text-xs">
                        {item.suppliers.name}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Stock actual:</span>
                      <span className={`font-semibold ${isLowStock(item) ? 'text-orange-600' : ''}`}>
                        {Math.round(Number(item.current_stock))}
                        {isLowStock(item) && (
                          <AlertTriangle className="inline h-3 w-3 ml-1" />
                        )}
                      </span>
                    </div>
                    {item.min_stock && Number(item.min_stock) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Stock mínimo:</span>
                        <span>{Math.round(Number(item.min_stock))}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Precio unitario:</span>
                      <span className="font-medium">GTQ {Number(item.unit_price).toFixed(2)}</span>
                    </div>
                  </div>

                  {item.requires_lot && (
                    <Badge variant="outline" className="text-xs">
                      Requiere lote
                    </Badge>
                  )}

                  {item.notes && (
                    <p className="text-xs text-muted-foreground pt-2 border-t">
                      {item.notes}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {showLowStock ? 'No hay productos con stock bajo' : 'No se encontraron productos'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Cortesía */}
      <Dialog open={courtesyDialogOpen} onOpenChange={setCourtesyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-blue-600" />
              Registrar Cortesía
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Producto</Label>
              <p className="text-lg font-semibold text-blue-600">
                {selectedCourtesyItem?.name}
              </p>
              {selectedCourtesyItem?.code && (
                <p className="text-xs text-muted-foreground">
                  Código: {selectedCourtesyItem.code}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="courtesyQuantity">Cantidad:</Label>
              <Input
                id="courtesyQuantity"
                type="number"
                min={1}
                max={selectedCourtesyItem?.current_stock || 99}
                value={courtesyQuantity}
                onChange={(e) => setCourtesyQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <p className="text-xs text-muted-foreground">
                Stock disponible: {Number(selectedCourtesyItem?.current_stock || 0).toFixed(0)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="authorizedBy">
                Autorizado por:
              </Label>
              <Input
                id="authorizedBy"
                placeholder="Nombre de quien autoriza..."
                value={authorizedBy}
                onChange={(e) => setAuthorizedBy(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCourtesyDialogOpen(false);
                setAuthorizedBy('');
                setCourtesyQuantity(1);
                setSelectedCourtesyItem(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCourtesy}>
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
