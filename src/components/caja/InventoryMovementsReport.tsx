import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, FileSpreadsheet } from "lucide-react";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { clinicNow } from "@/lib/timezone";
import { useBranch } from "@/hooks/useBranch";

interface InventoryMovementsReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InventoryMovementsReport({ open, onOpenChange }: InventoryMovementsReportProps) {
  const { currentBranch } = useBranch();
  const today = clinicNow();
  
  const [dateFrom, setDateFrom] = useState<Date>(today);
  const [dateTo, setDateTo] = useState<Date>(today);
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("todos");
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | null>('today');

  const { data: movements, isLoading, refetch } = useQuery({
    queryKey: ['movements-report', dateFrom, dateTo, movementTypeFilter, currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch) return [];
      
      let query = supabase
        .from('inventory_movements')
        .select(`
          *,
          inventory_items(name, code, category),
          inventory_lots(lot_number)
        `)
        .eq('branch_id', currentBranch.id)
        .gte('created_at', format(dateFrom, "yyyy-MM-dd") + 'T00:00:00')
        .lte('created_at', format(dateTo, "yyyy-MM-dd") + 'T23:59:59');
      
      if (movementTypeFilter !== 'todos') {
        query = query.eq('movement_type', movementTypeFilter);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: false,
  });

  const handleQuickSelect = (period: 'today' | 'week' | 'month') => {
    const now = clinicNow();
    setSelectedPeriod(period);
    switch (period) {
      case 'today':
        setDateFrom(now);
        setDateTo(now);
        break;
      case 'week':
        setDateFrom(startOfWeek(now, { weekStartsOn: 1 }));
        setDateTo(now);
        break;
      case 'month':
        setDateFrom(startOfMonth(now));
        setDateTo(now);
        break;
    }
  };

  const handleExportPDF = async () => {
    if (!currentBranch) {
      toast.error("Selecciona una sucursal primero");
      return;
    }
    
    toast.loading("Generando reporte PDF...");
    const { data } = await refetch();
    toast.dismiss();
    
    if (!data || data.length === 0) {
      toast.error("No se encontraron movimientos en el período seleccionado");
      return;
    }

    const totalsCalc = data.reduce((acc, m) => {
      const qty = Number(m.quantity);
      if (m.movement_type === 'entrada') {
        acc.entradas += qty;
      } else if (m.movement_type === 'salida') {
        acc.salidas += Math.abs(qty);
      } else if (m.movement_type === 'cortesia') {
        acc.cortesias += Math.abs(qty);
      } else {
        acc.ajustes += qty;
      }
      return acc;
    }, { entradas: 0, salidas: 0, ajustes: 0, cortesias: 0 });

    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.text("INFORME DE MOVIMIENTOS DE INVENTARIO", 14, 15);
    doc.setFontSize(10);
    doc.text("Centro Visión", 14, 22);
    doc.text(`Período: ${format(dateFrom, "dd/MM/yyyy")} - ${format(dateTo, "dd/MM/yyyy")}`, 14, 28);
    
    const tableData = data.map(m => [
      format(new Date(m.created_at!), "dd/MM/yyyy HH:mm"),
      m.movement_type === 'entrada' ? 'Entrada' : m.movement_type === 'salida' ? 'Salida' : m.movement_type === 'cortesia' ? 'Cortesía' : 'Ajuste',
      (m.inventory_items as any)?.name || '-',
      (m.inventory_items as any)?.code || '-',
      (m.inventory_lots as any)?.lot_number || '-',
      m.quantity.toString(),
      m.notes || '-',
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Fecha', 'Tipo', 'Producto', 'Código', 'Lote', 'Cantidad', 'Notas']],
      body: tableData,
      foot: [
        [
          { content: 'RESUMEN', colSpan: 2, styles: { fontStyle: 'bold' } },
          { content: `Entradas: +${totalsCalc.entradas.toFixed(2)}`, colSpan: 2 },
          { content: `Salidas: -${totalsCalc.salidas.toFixed(2)}`, colSpan: 2 },
          { content: `Cortesías: -${totalsCalc.cortesias.toFixed(2)}`, colSpan: 1 },
        ],
        [
          { content: '', colSpan: 2 },
          { content: `Ajustes: ${totalsCalc.ajustes >= 0 ? '+' : ''}${totalsCalc.ajustes.toFixed(2)}`, colSpan: 5 },
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      footStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: 'bold' },
    });
    
    doc.save(`Movimientos_Inventario_${format(clinicNow(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF generado correctamente");
  };

  const handleExportExcel = async () => {
    if (!currentBranch) {
      toast.error("Selecciona una sucursal primero");
      return;
    }
    
    toast.loading("Generando reporte Excel...");
    const { data } = await refetch();
    toast.dismiss();
    
    if (!data || data.length === 0) {
      toast.error("No se encontraron movimientos en el período seleccionado");
      return;
    }

    const totalsCalc = data.reduce((acc, m) => {
      const qty = Number(m.quantity);
      if (m.movement_type === 'entrada') {
        acc.entradas += qty;
      } else if (m.movement_type === 'salida') {
        acc.salidas += Math.abs(qty);
      } else if (m.movement_type === 'cortesia') {
        acc.cortesias += Math.abs(qty);
      } else {
        acc.ajustes += qty;
      }
      return acc;
    }, { entradas: 0, salidas: 0, ajustes: 0, cortesias: 0 });

    const exportData = [
      ["INFORME DE MOVIMIENTOS DE INVENTARIO"],
      ["Centro Visión"],
      [`Período: ${format(dateFrom, "dd/MM/yyyy")} - ${format(dateTo, "dd/MM/yyyy")}`],
      [],
      ["Fecha", "Tipo", "Producto", "Código", "Lote", "Cantidad", "Notas"],
      ...data.map(m => [
        format(new Date(m.created_at!), "dd/MM/yyyy HH:mm"),
        m.movement_type === 'entrada' ? 'Entrada' : m.movement_type === 'salida' ? 'Salida' : m.movement_type === 'cortesia' ? 'Cortesía' : 'Ajuste',
        (m.inventory_items as any)?.name || '-',
        (m.inventory_items as any)?.code || '-',
        (m.inventory_lots as any)?.lot_number || '-',
        m.quantity,
        m.notes || '-',
      ]),
      [],
      ["RESUMEN"],
      [`Total Entradas: +${totalsCalc.entradas.toFixed(2)} unidades`],
      [`Total Salidas: -${totalsCalc.salidas.toFixed(2)} unidades`],
      [`Total Cortesías: -${totalsCalc.cortesias.toFixed(2)} unidades`],
      [`Total Ajustes: ${totalsCalc.ajustes >= 0 ? '+' : ''}${totalsCalc.ajustes.toFixed(2)} unidades`],
    ];
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    
    ws['!cols'] = [
      { wch: 18 }, // Fecha
      { wch: 10 }, // Tipo
      { wch: 25 }, // Producto
      { wch: 12 }, // Código
      { wch: 12 }, // Lote
      { wch: 10 }, // Cantidad
      { wch: 30 }, // Notas
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `Movimientos_${format(clinicNow(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Excel generado correctamente");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Informe de Movimientos de Inventario</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick select buttons */}
          <div className="flex gap-2">
            <Button 
              variant={selectedPeriod === 'today' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => handleQuickSelect('today')}
            >
              Hoy
            </Button>
            <Button 
              variant={selectedPeriod === 'week' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => handleQuickSelect('week')}
            >
              Esta Semana
            </Button>
            <Button 
              variant={selectedPeriod === 'month' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => handleQuickSelect('month')}
            >
              Este Mes
            </Button>
          </div>

          {/* Date range filters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Desde</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateFrom, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => {
                      if (date) {
                        setDateFrom(date);
                        setSelectedPeriod(null);
                      }
                    }}
                    locale={es}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Hasta</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateTo, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(date) => {
                      if (date) {
                        setDateTo(date);
                        setSelectedPeriod(null);
                      }
                    }}
                    locale={es}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Movement type filter */}
          <div className="space-y-2">
            <Label>Tipo de Movimiento</Label>
            <Select value={movementTypeFilter} onValueChange={setMovementTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="salida">Salida</SelectItem>
                <SelectItem value="cortesia">Cortesía</SelectItem>
                <SelectItem value="ajuste">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2 pt-4">
            <Button onClick={handleExportPDF} disabled={isLoading} className="flex-1">
              <Download className="mr-2 h-4 w-4" />
              {isLoading ? "Generando..." : "Exportar PDF"}
            </Button>
            <Button onClick={handleExportExcel} disabled={isLoading} variant="outline" className="flex-1">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {isLoading ? "Generando..." : "Exportar Excel"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
