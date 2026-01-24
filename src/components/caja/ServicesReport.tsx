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

export function ServicesReport() {
  const { currentBranch } = useBranch();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const [dateFrom, setDateFrom] = useState(format(clinicNow(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(clinicNow(), "yyyy-MM-dd"));
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("todos");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: services, isLoading, refetch } = useQuery({
    queryKey: ['services-report', dateFrom, dateTo, currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Modo local: usar Tauri command
      if (isLocalMode) {
        const startDate = `${dateFrom}T00:00:00`;
        const endDate = `${dateTo}T23:59:59`;
        return await invoke<any[]>('get_services_report', {
          branchId: currentBranch.id,
          startDate,
          endDate,
        });
      }

      // Modo online: Supabase queries
      // Primera query: invoice_items
      const { data: items, error: itemsError } = await supabase
        .from('invoice_items')
        .select(`
          id,
          item_id,
          quantity,
          unit_price,
          subtotal,
          description,
          invoices!inner(invoice_number, created_at, status, branch_id, discount_type, discount_value, discount_reason, patients(first_name, last_name))
        `)
        .eq('item_type', 'servicio')
        .eq('invoices.branch_id', currentBranch.id)
        .gte('invoices.created_at', `${dateFrom}T00:00:00`)
        .lte('invoices.created_at', `${dateTo}T23:59:59`)
        .neq('invoices.status', 'cancelada');

      if (itemsError) throw itemsError;
      if (!items) return [];

      // Segunda query: service_prices si hay item_ids
      const itemIds = items
        .map(i => i.item_id)
        .filter((id): id is string => id !== null);

      let servicesData: any[] = [];
      if (itemIds.length > 0) {
        const { data: services, error: svcError } = await supabase
          .from('service_prices')
          .select('id, service_name, service_type')
          .in('id', itemIds);

        if (!svcError && services) {
          servicesData = services;
        }
      }

      // Combinar datos
      return items.map((item: any) => {
        const serviceItem = servicesData.find(svc => svc.id === item.item_id);
        const firstName = item.invoices?.patients?.first_name || '';
        const lastName = item.invoices?.patients?.last_name || '';
        const patientName = `${firstName} ${lastName}`.trim() || 'Sin paciente';

        return {
          invoice_number: item.invoices.invoice_number,
          created_at: item.invoices.created_at,
          patient_name: patientName,
          service_name: serviceItem?.service_name || item.description,
          service_type: serviceItem?.service_type || 'N/A',
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
          discount_type: item.invoices.discount_type,
          discount_value: Number(item.invoices.discount_value || 0),
          discount_reason: item.invoices.discount_reason
        };
      });
    },
    enabled: false
  });

  const getServiceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      consulta: "Consulta",
      cirugia: "Cirugía",
      procedimiento: "Procedimiento",
      estudio: "Estudio"
    };
    return labels[type] || type;
  };

  const filteredServices = services?.filter(s => {
    const matchesSearch = s.service_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = serviceTypeFilter === 'todos' || s.service_type === serviceTypeFilter;
    return matchesSearch && matchesType;
  }) || [];

  const totals = filteredServices.reduce((acc, s) => ({
    quantity: acc.quantity + s.quantity,
    total: acc.total + s.subtotal
  }), { quantity: 0, total: 0 });

  const handleExport = () => {
    const exportData = [
      ["REPORTE DE VENTAS POR SERVICIOS"],
      [`Período: ${format(new Date(`${dateFrom}T12:00:00`), "dd/MM/yyyy")} - ${format(new Date(`${dateTo}T12:00:00`), "dd/MM/yyyy")}`],
      [],
      ["Doc No.", "Nombre", "Fecha", "Servicio", "Tipo", "Cantidad", "Precio Unitario", "Total", "Descuento"],
      ...filteredServices.map(s => [
        s.invoice_number,
        s.patient_name,
        format(new Date(s.created_at), "dd/MM/yyyy"),
        s.service_name,
        getServiceTypeLabel(s.service_type),
        s.quantity,
        s.unit_price.toFixed(2),
        s.subtotal.toFixed(2),
        s.discount_value > 0 ? `Q ${s.discount_value.toFixed(2)}${s.discount_reason ? ' - ' + s.discount_reason : ''}` : '-'
      ]),
      [],
      ["TOTALES", "", "", "", "", totals.quantity, "", totals.total.toFixed(2)]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, "Servicios");

    // Hoja 2: Resumen por tipo
    const summaryByType = filteredServices.reduce((acc, s) => {
      const type = getServiceTypeLabel(s.service_type);
      if (!acc[type]) {
        acc[type] = { quantity: 0, total: 0 };
      }
      acc[type].quantity += s.quantity;
      acc[type].total += s.subtotal;
      return acc;
    }, {} as Record<string, { quantity: number; total: number }>);

    const summaryData = [
      ["RESUMEN POR TIPO DE SERVICIO"],
      [],
      ["Tipo", "Cantidad", "Total"],
      ...Object.entries(summaryByType).map(([type, data]) => [
        type,
        data.quantity,
        data.total.toFixed(2)
      ])
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen por Tipo");

    XLSX.writeFile(wb, `Reporte_Servicios_${format(clinicNow(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Reporte exportado exitosamente");
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.text("REPORTE DE VENTAS POR SERVICIOS", 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${format(new Date(`${dateFrom}T12:00:00`), "dd/MM/yyyy")} - ${format(new Date(`${dateTo}T12:00:00`), "dd/MM/yyyy")}`, 14, 22);
    
    const tableData = filteredServices.map(s => [
      s.invoice_number,
      s.patient_name,
      format(new Date(s.created_at), "dd/MM/yyyy"),
      s.service_name,
      getServiceTypeLabel(s.service_type),
      s.quantity.toString(),
      `Q ${s.unit_price.toFixed(2)}`,
      `Q ${s.subtotal.toFixed(2)}`,
      s.discount_value > 0 ? `Q ${s.discount_value.toFixed(2)}${s.discount_reason ? ' - ' + s.discount_reason : ''}` : '-'
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['Doc No.', 'Nombre', 'Fecha', 'Servicio', 'Tipo', 'Cantidad', 'Precio Unitario', 'Total', 'Descuento']],
      body: tableData,
      foot: [[
        'TOTALES', '', '', '', '',
        totals.quantity.toString(),
        '',
        `Q ${totals.total.toFixed(2)}`,
        ''
      ]],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [229, 231, 235], textColor: 0, fontStyle: 'bold' },
      columnStyles: {
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'left', cellWidth: 35 }
      }
    });

    doc.save(`Reporte_Servicios_${format(clinicNow(), "yyyy-MM-dd")}.pdf`);
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
        <label className="text-xs font-medium text-muted-foreground">Tipo de servicio</label>
        <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            <SelectItem value="consulta">Consulta</SelectItem>
            <SelectItem value="cirugia">Cirugía</SelectItem>
            <SelectItem value="procedimiento">Procedimiento</SelectItem>
            <SelectItem value="estudio">Estudio</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Buscar</label>
        <Input
          placeholder="Buscar servicio..."
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
          disabled={!services || services.length === 0}
          className="bg-green-500 hover:bg-green-600"
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </Button>
        <Button 
          onClick={handleExportPDF} 
          disabled={!services || services.length === 0}
          className="bg-red-500 hover:bg-red-600"
        >
          <FileText className="mr-2 h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      {services && (
        <div className="text-sm text-muted-foreground">
          Registros: {filteredServices.length}
        </div>
      )}

      <div className="border rounded-md flex-1 min-h-0 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doc No.</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio Unitario</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Descuento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredServices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No se encontraron registros
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredServices.map((s, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{s.invoice_number}</TableCell>
                    <TableCell>{s.patient_name}</TableCell>
                    <TableCell>{format(new Date(s.created_at), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{s.service_name}</TableCell>
                    <TableCell>{getServiceTypeLabel(s.service_type)}</TableCell>
                    <TableCell className="text-right">{s.quantity}</TableCell>
                    <TableCell className="text-right">Q {s.unit_price.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">Q {s.subtotal.toFixed(2)}</TableCell>
                    <TableCell className="text-sm">
                      {s.discount_value > 0 ? (
                        <span>Q {s.discount_value.toFixed(2)}{s.discount_reason ? ` - ${s.discount_reason}` : ''}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={5}>TOTALES</TableCell>
                  <TableCell className="text-right">{totals.quantity}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">Q {totals.total.toFixed(2)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
