import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/hooks/useBranch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from 'xlsx';
import { toast } from "sonner";
import { clinicNow } from "@/lib/timezone";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function TransactionsReport() {
  const { currentBranch } = useBranch();
  const [dateFrom, setDateFrom] = useState(format(clinicNow(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(clinicNow(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState<string>("todas");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("todos");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: transactions, isLoading, refetch } = useQuery({
    queryKey: ['transactions-report', dateFrom, dateTo, statusFilter, paymentMethodFilter, searchTerm, currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];
      
      let query = supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          created_at,
          status,
          total_amount,
          balance_due,
          discount_type,
          discount_value,
          discount_reason,
          patients(first_name, last_name),
          payments(payment_method, amount)
        `)
        .eq('branch_id', currentBranch.id)
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'todas') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data.map((inv: any) => {
        const payments = inv.payments || [];
        const efectivo = payments.filter((p: any) => p.payment_method === 'efectivo').reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        const tarjeta = payments.filter((p: any) => p.payment_method === 'tarjeta').reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        const transferencia = payments.filter((p: any) => p.payment_method === 'transferencia').reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        const otros = payments.filter((p: any) => !['efectivo', 'tarjeta', 'transferencia'].includes(p.payment_method)).reduce((sum: number, p: any) => sum + Number(p.amount), 0);

        return {
          invoice_number: inv.invoice_number,
          created_at: inv.created_at,
          status: inv.status,
          patient_name: inv.patients ? `${inv.patients.first_name} ${inv.patients.last_name}` : 'N/A',
          discount_type: inv.discount_type,
          discount_value: Number(inv.discount_value || 0),
          discount_reason: inv.discount_reason,
          efectivo,
          tarjeta,
          transferencia,
          otros,
          total_amount: Number(inv.total_amount),
          balance_due: Number(inv.balance_due)
        };
      });
    },
    enabled: false
  });

  const filteredTransactions = transactions?.filter(t => {
    const matchesSearch = t.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         t.patient_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPayment = paymentMethodFilter === 'todos' || 
      (paymentMethodFilter === 'efectivo' && t.efectivo > 0) ||
      (paymentMethodFilter === 'tarjeta' && t.tarjeta > 0) ||
      (paymentMethodFilter === 'transferencia' && t.transferencia > 0);
    
    return matchesSearch && matchesPayment;
  }) || [];

  const totals = filteredTransactions.reduce((acc, t) => ({
    efectivo: acc.efectivo + t.efectivo,
    tarjeta: acc.tarjeta + t.tarjeta,
    transferencia: acc.transferencia + t.transferencia,
    otros: acc.otros + t.otros,
    descuentos: acc.descuentos + t.discount_value,
    total: acc.total + t.total_amount,
    balance: acc.balance + t.balance_due
  }), { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0, descuentos: 0, total: 0, balance: 0 });

  const handleExport = () => {
    const exportData = [
      ["REPORTE DE TRANSACCIONES"],
      [`Período: ${format(new Date(`${dateFrom}T12:00:00`), "dd/MM/yyyy")} - ${format(new Date(`${dateTo}T12:00:00`), "dd/MM/yyyy")}`],
      [],
      ["No. Factura", "Fecha", "Estado", "Paciente", "Descuento", "Efectivo", "Tarjeta", "Transferencia", "Otros", "Total", "Saldo"],
      ...filteredTransactions.map(t => [
        t.invoice_number,
        format(new Date(t.created_at), "dd/MM/yyyy HH:mm"),
        t.status,
        t.patient_name,
        t.discount_value > 0 ? `Q ${t.discount_value.toFixed(2)}${t.discount_reason ? ' - ' + t.discount_reason : ''}` : '-',
        t.efectivo.toFixed(2),
        t.tarjeta.toFixed(2),
        t.transferencia.toFixed(2),
        t.otros.toFixed(2),
        t.total_amount.toFixed(2),
        t.balance_due.toFixed(2)
      ]),
      [],
      ["TOTALES", "", "", "", totals.descuentos.toFixed(2), totals.efectivo.toFixed(2), totals.tarjeta.toFixed(2), totals.transferencia.toFixed(2), totals.otros.toFixed(2), totals.total.toFixed(2), totals.balance.toFixed(2)]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Transacciones");
    XLSX.writeFile(wb, `Reporte_Transacciones_${format(clinicNow(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Reporte exportado exitosamente");
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.text("REPORTE DE TRANSACCIONES", 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${format(new Date(`${dateFrom}T12:00:00`), "dd/MM/yyyy")} - ${format(new Date(`${dateTo}T12:00:00`), "dd/MM/yyyy")}`, 14, 22);
    
    const tableData = filteredTransactions.map(t => [
      t.invoice_number,
      format(new Date(t.created_at), "dd/MM/yyyy HH:mm"),
      t.status.charAt(0).toUpperCase() + t.status.slice(1),
      t.patient_name,
      t.discount_value > 0 ? `Q ${t.discount_value.toFixed(2)}${t.discount_reason ? ' - ' + t.discount_reason : ''}` : '-',
      `Q ${t.efectivo.toFixed(2)}`,
      `Q ${t.tarjeta.toFixed(2)}`,
      `Q ${t.transferencia.toFixed(2)}`,
      `Q ${t.otros.toFixed(2)}`,
      `Q ${t.total_amount.toFixed(2)}`,
      `Q ${t.balance_due.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['No. Factura', 'Fecha', 'Estado', 'Paciente', 'Descuento', 'Efectivo', 'Tarjeta', 'Transferencia', 'Otros', 'Total', 'Saldo']],
      body: tableData,
      foot: [[
        'TOTALES', '', '', '',
        `Q ${totals.descuentos.toFixed(2)}`,
        `Q ${totals.efectivo.toFixed(2)}`,
        `Q ${totals.tarjeta.toFixed(2)}`,
        `Q ${totals.transferencia.toFixed(2)}`,
        `Q ${totals.otros.toFixed(2)}`,
        `Q ${totals.total.toFixed(2)}`,
        `Q ${totals.balance.toFixed(2)}`
      ]],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [229, 231, 235], textColor: 0, fontStyle: 'bold' },
      columnStyles: {
        4: { halign: 'left', cellWidth: 30 },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right' },
        10: { halign: 'right' }
      }
    });

    doc.save(`Reporte_Transacciones_${format(clinicNow(), "yyyy-MM-dd")}.pdf`);
    toast.success("Reporte PDF exportado exitosamente");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pagada: "bg-green-100 text-green-800",
      pendiente: "bg-orange-100 text-orange-800",
      cancelada: "bg-gray-100 text-gray-800"
    };
    return <Badge className={variants[status] || ""}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
        <label className="text-xs font-medium text-muted-foreground">Estado</label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="pagada">Pagada</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Método de pago</label>
        <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="efectivo">Efectivo</SelectItem>
            <SelectItem value="tarjeta">Tarjeta</SelectItem>
            <SelectItem value="transferencia">Transferencia</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Buscar</label>
        <Input
          placeholder="Buscar factura o paciente..."
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
          disabled={!transactions || transactions.length === 0}
          className="bg-green-500 hover:bg-green-600"
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </Button>
        <Button 
          onClick={handleExportPDF} 
          disabled={!transactions || transactions.length === 0}
          className="bg-red-500 hover:bg-red-600"
        >
          <FileText className="mr-2 h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      {transactions && (
        <div className="text-sm text-muted-foreground">
          Registros: {filteredTransactions.length}
        </div>
      )}

      <div className="border rounded-md flex-1 min-h-0 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. Factura</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Descuento</TableHead>
              <TableHead className="text-right">Efectivo</TableHead>
              <TableHead className="text-right">Tarjeta</TableHead>
              <TableHead className="text-right">Transferencia</TableHead>
              <TableHead className="text-right">Otros</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  No se encontraron registros
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredTransactions.map((t) => (
                  <TableRow key={t.invoice_number}>
                    <TableCell className="font-medium">{t.invoice_number}</TableCell>
                    <TableCell>{format(new Date(t.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>{getStatusBadge(t.status)}</TableCell>
                    <TableCell>{t.patient_name}</TableCell>
                    <TableCell className="text-sm">
                      {t.discount_value > 0 ? (
                        <span>Q {t.discount_value.toFixed(2)}{t.discount_reason ? ` - ${t.discount_reason}` : ''}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">Q {t.efectivo.toFixed(2)}</TableCell>
                    <TableCell className="text-right">Q {t.tarjeta.toFixed(2)}</TableCell>
                    <TableCell className="text-right">Q {t.transferencia.toFixed(2)}</TableCell>
                    <TableCell className="text-right">Q {t.otros.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">Q {t.total_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">Q {t.balance_due.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={4}>TOTALES</TableCell>
                  <TableCell>Q {totals.descuentos.toFixed(2)}</TableCell>
                  <TableCell className="text-right">Q {totals.efectivo.toFixed(2)}</TableCell>
                  <TableCell className="text-right">Q {totals.tarjeta.toFixed(2)}</TableCell>
                  <TableCell className="text-right">Q {totals.transferencia.toFixed(2)}</TableCell>
                  <TableCell className="text-right">Q {totals.otros.toFixed(2)}</TableCell>
                  <TableCell className="text-right">Q {totals.total.toFixed(2)}</TableCell>
                  <TableCell className="text-right">Q {totals.balance.toFixed(2)}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
