import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';
import { useBranch } from "@/hooks/useBranch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import * as XLSX from 'xlsx';
import { toast } from "sonner";
import { clinicNow } from "@/lib/timezone";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export function ProductsReport() {
  const { currentBranch } = useBranch();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const [dateFrom, setDateFrom] = useState(format(clinicNow(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(clinicNow(), "yyyy-MM-dd"));
  const [categoryFilter, setCategoryFilter] = useState<string>("todas");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['products-report', dateFrom, dateTo, currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Modo local: usar Tauri command
      if (isLocalMode) {
        const startDate = `${dateFrom}T00:00:00`;
        const endDate = `${dateTo}T23:59:59`;
        return await invoke<any[]>('get_products_report', {
          branchId: currentBranch.id,
          startDate,
          endDate,
        });
      }

      // Modo online: Supabase queries
      // Primera query: obtener los invoice_items
      const { data: items, error: itemsError } = await supabase
        .from('invoice_items')
        .select(`
          id,
          item_id,
          quantity,
          unit_price,
          subtotal,
          description,
          invoices!inner(invoice_number, created_at, status, branch_id, patients(first_name, last_name))
        `)
        .eq('item_type', 'producto')
        .eq('invoices.branch_id', currentBranch.id)
        .gte('invoices.created_at', `${dateFrom}T00:00:00`)
        .lte('invoices.created_at', `${dateTo}T23:59:59`)
        .neq('invoices.status', 'cancelada');

      if (itemsError) throw itemsError;
      if (!items) return [];

      // Segunda query: obtener datos de inventory_items si hay item_ids
      const itemIds = items
        .map(i => i.item_id)
        .filter((id): id is string => id !== null);

      let inventoryData: any[] = [];
      if (itemIds.length > 0) {
        const { data: inventory, error: invError } = await supabase
          .from('inventory_items')
          .select('id, name, category, cost_price, supplier_id, suppliers(name)')
          .in('id', itemIds);

        if (!invError && inventory) {
          inventoryData = inventory;
        }
      }

      // Combinar datos
      return items.map((item: any) => {
        const inventoryItem = inventoryData.find(inv => inv.id === item.item_id);
        const firstName = item.invoices?.patients?.first_name || '';
        const lastName = item.invoices?.patients?.last_name || '';
        const patientName = `${firstName} ${lastName}`.trim() || 'Sin paciente';

        return {
          invoice_number: item.invoices.invoice_number,
          created_at: item.invoices.created_at,
          patient_name: patientName,
          product_name: inventoryItem?.name || item.description || 'Producto eliminado',
          category: inventoryItem?.category || 'N/A',
          supplier_name: inventoryItem?.suppliers?.name || 'Sin proveedor',
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          cost_price: Number(inventoryItem?.cost_price || 0),
          subtotal: Number(item.subtotal),
          profit: Number(item.subtotal) - (Number(inventoryItem?.cost_price || 0) * Number(item.quantity))
        };
      });
    },
    enabled: false
  });

  const { data: categories } = useQuery({
    queryKey: ['product-categories', currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Modo local: usar Tauri command
      if (isLocalMode) {
        const items = await invoke<any[]>('get_inventory_items', { branchId: currentBranch.id });
        const uniqueCategories = [...new Set(items.filter(i => i.active !== false).map(item => item.category))];
        return uniqueCategories.filter(Boolean);
      }

      // Modo online: Supabase
      const { data, error } = await supabase
        .from('inventory_items')
        .select('category')
        .eq('active', true)
        .limit(5000);

      if (error) throw error;
      const uniqueCategories = [...new Set(data.map(item => item.category))];
      return uniqueCategories;
    }
  });

  const filteredProducts = products?.filter(p => {
    const matchesSearch = p.product_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'todas' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }) || [];

  const totals = filteredProducts.reduce((acc, p) => ({
    quantity: acc.quantity + p.quantity,
    sales: acc.sales + p.subtotal,
    cost: acc.cost + (p.cost_price * p.quantity),
    profit: acc.profit + p.profit
  }), { quantity: 0, sales: 0, cost: 0, profit: 0 });

  const handleExport = () => {
    const exportData = [
      ["REPORTE DE VENTAS POR PRODUCTOS"],
      [`Período: ${format(new Date(`${dateFrom}T12:00:00`), "dd/MM/yyyy")} - ${format(new Date(`${dateTo}T12:00:00`), "dd/MM/yyyy")}`],
      [],
      ["Doc No.", "Nombre", "Fecha", "Producto", "Categoría", "Proveedor", "Cantidad", "Precio Venta", "Precio Costo", "Total", "Ganancia"],
      ...filteredProducts.map(p => [
        p.invoice_number,
        p.patient_name,
        format(new Date(p.created_at), "dd/MM/yyyy HH:mm"),
        p.product_name,
        p.category,
        p.supplier_name,
        p.quantity,
        p.unit_price.toFixed(2),
        p.cost_price.toFixed(2),
        p.subtotal.toFixed(2),
        p.profit.toFixed(2)
      ]),
      [],
      ["TOTALES", "", "", "", "", "", totals.quantity, "", "", totals.sales.toFixed(2), totals.profit.toFixed(2)]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 16 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, `Reporte_Productos_${format(clinicNow(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Reporte exportado exitosamente");
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.text("REPORTE DE VENTAS POR PRODUCTOS", 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${format(new Date(`${dateFrom}T12:00:00`), "dd/MM/yyyy")} - ${format(new Date(`${dateTo}T12:00:00`), "dd/MM/yyyy")}`, 14, 22);
    
    const tableData = filteredProducts.map(p => [
      p.invoice_number,
      p.patient_name,
      format(new Date(p.created_at), "dd/MM/yyyy HH:mm"),
      p.product_name,
      p.category,
      p.supplier_name,
      p.quantity.toString(),
      `Q ${p.unit_price.toFixed(2)}`,
      `Q ${p.cost_price.toFixed(2)}`,
      `Q ${p.subtotal.toFixed(2)}`,
      `Q ${p.profit.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['Doc No.', 'Nombre', 'Fecha', 'Producto', 'Categoría', 'Proveedor', 'Cant.', 'P. Venta', 'P. Costo', 'Total', 'Ganancia']],
      body: tableData,
      foot: [[
        'TOTALES', '', '', '', '', '',
        totals.quantity.toString(),
        '',
        `Q ${totals.cost.toFixed(2)}`,
        `Q ${totals.sales.toFixed(2)}`,
        `Q ${totals.profit.toFixed(2)}`
      ]],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [229, 231, 235], textColor: 0, fontStyle: 'bold' },
      columnStyles: {
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right' },
        10: { halign: 'right' }
      }
    });

    doc.save(`Reporte_Productos_${format(clinicNow(), "yyyy-MM-dd")}.pdf`);
    toast.success("Reporte PDF exportado exitosamente");
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Desde</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Hasta</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Categoría</label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Buscar</label>
          <Input
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={() => refetch()} disabled={isLoading} className="bg-indigo-500 hover:bg-indigo-600">
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generar Reporte
        </Button>
        <Button 
          onClick={handleExport} 
          disabled={!products || products.length === 0}
          className="bg-green-500 hover:bg-green-600"
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </Button>
        <Button 
          onClick={handleExportPDF} 
          disabled={!products || products.length === 0}
          className="bg-red-500 hover:bg-red-600"
        >
          <FileText className="mr-2 h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      {products && (
        <div className="text-sm text-muted-foreground">
          Registros: {filteredProducts.length}
        </div>
      )}

      <div className="border rounded-md flex-1 min-h-0 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doc No.</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">P. Venta</TableHead>
              <TableHead className="text-right">P. Costo</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Ganancia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  No se encontraron registros
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredProducts.map((p, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{p.invoice_number}</TableCell>
                    <TableCell>{p.patient_name}</TableCell>
                    <TableCell>{format(new Date(p.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>{p.product_name}</TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.supplier_name}</TableCell>
                    <TableCell className="text-right">{p.quantity}</TableCell>
                    <TableCell className="text-right">Q {p.unit_price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">Q {p.cost_price.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">Q {p.subtotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-green-600 font-medium">Q {p.profit.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={6}>TOTALES</TableCell>
                  <TableCell className="text-right">{totals.quantity}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">Q {totals.cost.toFixed(2)}</TableCell>
                  <TableCell className="text-right">Q {totals.sales.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-green-600">Q {totals.profit.toFixed(2)}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
