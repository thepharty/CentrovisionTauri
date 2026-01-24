import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';
import { getCachedUser } from '@/lib/dataSource';
import { clinicStartOfDay, clinicEndOfDay, clinicNow } from "@/lib/timezone";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useBranch } from '@/hooks/useBranch';
import { Loader2, DollarSign, ShoppingCart, Stethoscope, Syringe, FileText, Package, CreditCard, Printer, FileSpreadsheet, FileDown } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateCashClosureHTML, CashClosureData } from '@/lib/printTemplates';
import { PrintPreviewDialog } from '@/components/dashboard/PrintPreviewDialog';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface CashClosureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ServiceSales {
  service_type: string;
  cantidad: number;
  total: number;
}

interface InventorySales {
  category: string;
  cantidad: number;
  total: number;
}

interface PaymentMethod {
  payment_method: string;
  cantidad: number;
  total: number;
}

interface Invoice {
  invoice_number: string;
  patient_name: string;
  total_amount: number;
  status: string;
  payment_method: string | null;
}

export function CashClosureDialog({ open, onOpenChange }: CashClosureDialogProps) {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const [isClosing, setIsClosing] = useState(false);
  const [printHtmlContent, setPrintHtmlContent] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const today = clinicNow();
  const startOfDay = clinicStartOfDay(today);
  const endOfDay = clinicEndOfDay(today);

  // Obtener perfil del usuario actual
  const { data: userProfile } = useQuery({
    queryKey: ["user-profile", isLocalMode],
    queryFn: async () => {
      // En modo local, usar sesión cacheada
      if (isLocalMode) {
        console.log('[CashClosureDialog] Getting user profile from cached session');
        const cachedUser = await getCachedUser();
        if (cachedUser) {
          return {
            full_name: cachedUser.full_name || cachedUser.email,
            email: cachedUser.email,
          };
        }
        return null;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .single();

      return data;
    },
  });

  // Ventas por tipo de servicio
  const { data: serviceSales = [] } = useQuery({
    queryKey: ["service-sales", startOfDay.toISOString(), currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Modo local: usar Tauri command
      if (isLocalMode) {
        return await invoke<ServiceSales[]>('get_service_sales', {
          branchId: currentBranch.id,
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        });
      }

      // Modo online: Supabase RPC
      const { data, error } = await supabase.rpc("get_service_sales", {
        start_date: startOfDay.toISOString(),
        end_date: endOfDay.toISOString(),
        branch_filter: currentBranch?.id || null,
      });
      if (error) throw error;
      return (data || []) as unknown as ServiceSales[];
    },
    enabled: open && !!currentBranch?.id,
  });

  // Detalle individual de servicios vendidos
  const { data: serviceDetails = [] } = useQuery({
    queryKey: ["service-details", startOfDay.toISOString(), currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Modo local: usar Tauri command
      if (isLocalMode) {
        const data = await invoke<any[]>('get_service_details', {
          branchId: currentBranch.id,
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        });
        return (data || []).map((item: any) => ({
          service_name: item.service_name,
          service_type: item.service_type,
          quantity: Number(item.cantidad),
          subtotal: Number(item.total),
        }));
      }

      // Modo online: Supabase RPC
      const { data, error } = await supabase.rpc('get_service_details', {
        start_date: startOfDay.toISOString(),
        end_date: endOfDay.toISOString(),
        branch_filter: currentBranch?.id || null,
      });
      if (error) throw error;
      return (data || []).map((item: any) => ({
        service_name: item.service_name,
        service_type: item.service_type,
        quantity: Number(item.cantidad),
        subtotal: Number(item.total),
      }));
    },
    enabled: open && !!currentBranch?.id,
  });

  // Detalle individual de productos vendidos
  const { data: inventoryDetails = [] } = useQuery({
    queryKey: ["inventory-details", startOfDay.toISOString(), currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Modo local: usar Tauri command
      if (isLocalMode) {
        const data = await invoke<any[]>('get_inventory_details', {
          branchId: currentBranch.id,
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        });
        return (data || []).map((item: any) => ({
          category: item.category,
          product_name: item.product_name,
          quantity: Number(item.cantidad),
          total: Number(item.total),
        }));
      }

      // Modo online: Supabase RPC
      const { data, error } = await supabase.rpc('get_inventory_details_v3' as any, {
        start_date: startOfDay.toISOString(),
        end_date: endOfDay.toISOString(),
        branch_filter: currentBranch?.id || null,
      });
      if (error) throw error;
      return (data || []).map((item: any) => ({
        category: item.category,
        product_name: item.product_name,
        quantity: Number(item.cantidad),
        total: Number(item.total),
      }));
    },
    enabled: open && !!currentBranch?.id,
  });

  // Ventas de inventario
  const { data: inventorySales = [] } = useQuery({
    queryKey: ["inventory-sales", startOfDay.toISOString(), currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Modo local: usar Tauri command
      if (isLocalMode) {
        return await invoke<InventorySales[]>('get_inventory_sales', {
          branchId: currentBranch.id,
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        });
      }

      // Modo online: Supabase RPC
      const { data, error } = await supabase.rpc("get_inventory_sales_v3" as any, {
        start_date: startOfDay.toISOString(),
        end_date: endOfDay.toISOString(),
        branch_filter: currentBranch?.id || null,
      });
      if (error) throw error;
      return (data || []) as unknown as InventorySales[];
    },
    enabled: open && !!currentBranch?.id,
  });

  // Métodos de pago
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["payment-methods", startOfDay.toISOString(), currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Modo local: usar Tauri command
      if (isLocalMode) {
        return await invoke<PaymentMethod[]>('get_payment_method_summary', {
          branchId: currentBranch.id,
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        });
      }

      // Modo online: Supabase RPC
      const { data, error } = await supabase.rpc("get_payment_methods", {
        start_date: startOfDay.toISOString(),
        end_date: endOfDay.toISOString(),
        branch_filter: currentBranch?.id || null,
      });
      if (error) throw error;
      return (data || []) as unknown as PaymentMethod[];
    },
    enabled: open && !!currentBranch?.id,
  });

  // Resumen diario
  const { data: dailySummary } = useQuery({
    queryKey: ["daily-summary", startOfDay.toISOString(), currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return null;

      // Modo local: usar Tauri command
      if (isLocalMode) {
        const summary = await invoke<{
          total_invoiced: number;
          total_collected: number;
          total_pending: number;
          total_discounts: number;
        }>('get_daily_summary', {
          branchId: currentBranch.id,
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        });
        return {
          totalInvoiced: summary.total_invoiced,
          totalCollected: summary.total_collected,
          totalPending: summary.total_pending,
          totalDiscounts: summary.total_discounts,
        };
      }

      // Modo online: Supabase queries
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("total_amount, balance_due, discount_value")
        .eq("branch_id", currentBranch.id)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .neq("status", "cancelada");

      if (invoicesError) throw invoicesError;

      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("amount, invoices!inner(branch_id)")
        .eq("invoices.branch_id", currentBranch.id)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .eq("status", "completado");

      if (paymentsError) throw paymentsError;

      const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
      const totalCollected = payments.reduce((sum, pay) => sum + Number(pay.amount), 0);
      const totalPending = invoices.reduce((sum, inv) => sum + Number(inv.balance_due), 0);
      const totalDiscounts = invoices.reduce((sum, inv) => sum + Number(inv.discount_value || 0), 0);

      return { totalInvoiced, totalCollected, totalPending, totalDiscounts };
    },
    enabled: open && !!currentBranch?.id,
  });

  // Facturas del día
  const { data: invoices = [] } = useQuery({
    queryKey: ["daily-invoices", startOfDay.toISOString(), currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Modo local: usar Tauri command
      if (isLocalMode) {
        return await invoke<Invoice[]>('get_daily_invoices', {
          branchId: currentBranch.id,
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        });
      }

      // Modo online: Supabase query
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          invoice_number,
          total_amount,
          status,
          patients (first_name, last_name),
          payments (payment_method)
        `)
        .eq("branch_id", currentBranch.id)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((inv: any) => ({
        invoice_number: inv.invoice_number,
        patient_name: `${inv.patients?.first_name || ""} ${inv.patients?.last_name || ""}`.trim(),
        total_amount: inv.total_amount,
        status: inv.status,
        payment_method: inv.payments?.[0]?.payment_method || null,
      })) as Invoice[];
    },
    enabled: open && !!currentBranch?.id,
  });

  const closeCashMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Calcular totales por tipo de servicio
      const consultas = serviceSales.find(s => s.service_type === "consulta") || { cantidad: 0, total: 0 };
      const cirugias = serviceSales.find(s => s.service_type === "cirugia") || { cantidad: 0, total: 0 };
      const procedimientos = serviceSales.find(s => s.service_type === "procedimiento") || { cantidad: 0, total: 0 };
      const estudios = serviceSales.find(s => s.service_type === "estudio") || { cantidad: 0, total: 0 };

      // Totales de inventario
      const inventoryTotal = inventorySales.reduce((sum, item) => sum + item.total, 0);
      const inventoryCount = inventorySales.reduce((sum, item) => sum + item.cantidad, 0);

      // Totales por método de pago
      const efectivo = paymentMethods.find(p => p.payment_method === "efectivo") || { total: 0 };
      const tarjeta = paymentMethods.find(p => p.payment_method === "tarjeta") || { total: 0 };
      const transferencia = paymentMethods.find(p => p.payment_method === "transferencia") || { total: 0 };
      const cheque = paymentMethods.find(p => p.payment_method === "cheque") || { total: 0 };
      const otro = paymentMethods.find(p => p.payment_method === "otro") || { total: 0 };

      const closureData = {
        branch_id: currentBranch?.id || '',
        period_start: startOfDay.toISOString(),
        period_end: clinicNow().toISOString(),
        total_invoiced: dailySummary?.totalInvoiced || 0,
        total_collected: dailySummary?.totalCollected || 0,
        total_pending: dailySummary?.totalPending || 0,
        total_discounts: dailySummary?.totalDiscounts || 0,
        consultas_total: consultas.total,
        consultas_count: consultas.cantidad,
        cirugias_total: cirugias.total,
        cirugias_count: cirugias.cantidad,
        procedimientos_total: procedimientos.total,
        procedimientos_count: procedimientos.cantidad,
        estudios_total: estudios.total,
        estudios_count: estudios.cantidad,
        inventory_total: inventoryTotal,
        inventory_count: inventoryCount,
        efectivo_total: efectivo.total,
        tarjeta_total: tarjeta.total,
        transferencia_total: transferencia.total,
        cheque_total: cheque.total,
        otro_total: otro.total,
        detailed_data: {
          invoices,
          service_sales: serviceSales,
          inventory_sales: inventorySales,
          payment_methods: paymentMethods,
        },
        closed_by: user.id,
      };

      // Modo local: usar Tauri command
      if (isLocalMode) {
        await invoke('create_cash_closure', { closure: closureData });
        return;
      }

      // Modo online: Supabase
      const { error } = await supabase.from("cash_closures").insert([closureData as any]);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cierre de caja completado exitosamente");
      queryClient.invalidateQueries({ queryKey: ["daily-summary"] });
      queryClient.invalidateQueries({ queryKey: ["caja-summary"], exact: false });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Error al cerrar caja: " + error.message);
    },
  });

  const handleCloseCash = async () => {
    if (!confirm("¿Está seguro de cerrar la caja del día? Esta acción guardará el registro permanente.")) {
      return;
    }
    setIsClosing(true);
    await closeCashMutation.mutateAsync();
    setIsClosing(false);
  };

  const handlePrint = () => {
    const printData: CashClosureData = {
      date: format(today, "d 'de' MMMM 'de' yyyy", { locale: es }),
      period: `${format(startOfDay, "HH:mm")} - ${format(clinicNow(), "HH:mm")}`,
      closedBy: userProfile?.full_name || 'N/A',
      branchName: currentBranch?.name || 'N/A',
      serviceSales: serviceSales,
      inventorySales: inventorySales,
      paymentMethods: paymentMethods,
      summary: {
        totalInvoiced: dailySummary?.totalInvoiced || 0,
        totalCollected: dailySummary?.totalCollected || 0,
        totalPending: dailySummary?.totalPending || 0,
        totalDiscounts: dailySummary?.totalDiscounts || 0,
      },
      invoices: invoices,
    };

    const html = generateCashClosureHTML(printData);
    setPrintHtmlContent(html);
    setShowPrintPreview(true);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPosition = 20;

    // Encabezado
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("CIERRE DE CAJA", pageWidth / 2, yPosition, { align: "center" });
    
    yPosition += 8;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es }), pageWidth / 2, yPosition, { align: "center" });
    
    yPosition += 6;
    doc.setFontSize(10);
    doc.text(`Período: ${format(startOfDay, "HH:mm")} - ${format(clinicNow(), "HH:mm")}`, pageWidth / 2, yPosition, { align: "center" });
    
    if (userProfile) {
      yPosition += 6;
      doc.text(`Cerrado por: ${userProfile.full_name}`, pageWidth / 2, yPosition, { align: "center" });
    }
    
    yPosition += 10;

    // Resumen Financiero
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen Financiero", 14, yPosition);
    yPosition += 8;

    autoTable(doc, {
      startY: yPosition,
      head: [["Concepto", "Monto (GTQ)"]],
      body: [
        ["Total Facturado", Number(dailySummary?.totalInvoiced || 0).toFixed(2)],
        ["Total Cobrado", Number(dailySummary?.totalCollected || 0).toFixed(2)],
        ["Total Pendiente", Number(dailySummary?.totalPending || 0).toFixed(2)],
        ["Total Descuentos", Number(dailySummary?.totalDiscounts || 0).toFixed(2)],
      ],
      theme: "grid",
      headStyles: { fillColor: [225, 29, 72], textColor: 255 },
      styles: { fontSize: 10 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;

    // Ventas por Tipo de Servicio
    if (serviceSales.length > 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Ventas por Tipo de Servicio", 14, yPosition);
      yPosition += 8;

      const serviceRows: any[] = [];
      serviceSales.forEach(service => {
        const details = serviceDetails.filter(d => d.service_type === service.service_type);
        
        // Agregar fila de tipo de servicio
        serviceRows.push([
          { content: getServiceLabel(service.service_type), styles: { fontStyle: "bold" } },
          "",
          service.cantidad.toString(),
          Number(service.total).toFixed(2),
        ]);
        
        // Agregar detalles
        details.forEach(detail => {
          serviceRows.push([
            "",
            detail.service_name,
            detail.quantity.toString(),
            Number(detail.subtotal).toFixed(2),
          ]);
        });
      });

      autoTable(doc, {
        startY: yPosition,
        head: [["Tipo", "Servicio", "Cant.", "Total (GTQ)"]],
        body: serviceRows,
        theme: "grid",
        headStyles: { fillColor: [225, 29, 72], textColor: 255 },
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 70 },
          2: { cellWidth: 20, halign: "center" },
          3: { cellWidth: 30, halign: "right" },
        },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }

    // Nueva página si es necesario
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    // Ventas de Inventario
    if (inventorySales.length > 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Ventas de Inventario", 14, yPosition);
      yPosition += 8;

      const inventoryRows: any[] = [];
      inventorySales.forEach(category => {
        const details = inventoryDetails.filter(d => d.category === category.category);
        
        // Agregar fila de categoría
        inventoryRows.push([
          { content: category.category, styles: { fontStyle: "bold" } },
          "",
          category.cantidad.toString(),
          Number(category.total).toFixed(2),
        ]);
        
        // Agregar detalles
        details.forEach(detail => {
          inventoryRows.push([
            "",
            detail.product_name,
            detail.quantity.toString(),
            Number(detail.total).toFixed(2),
          ]);
        });
      });

      autoTable(doc, {
        startY: yPosition,
        head: [["Categoría", "Producto", "Cant.", "Total (GTQ)"]],
        body: inventoryRows,
        theme: "grid",
        headStyles: { fillColor: [225, 29, 72], textColor: 255 },
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 70 },
          2: { cellWidth: 20, halign: "center" },
          3: { cellWidth: 30, halign: "right" },
        },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }

    // Nueva página si es necesario
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    // Métodos de Pago
    if (paymentMethods.length > 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Métodos de Pago", 14, yPosition);
      yPosition += 8;

      autoTable(doc, {
        startY: yPosition,
        head: [["Método de Pago", "Cantidad", "Total (GTQ)"]],
        body: paymentMethods.map(p => [
          p.payment_method.charAt(0).toUpperCase() + p.payment_method.slice(1),
          p.cantidad.toString(),
          Number(p.total).toFixed(2),
        ]),
        theme: "grid",
        headStyles: { fillColor: [225, 29, 72], textColor: 255 },
        styles: { fontSize: 10 },
        columnStyles: {
          1: { halign: "center" },
          2: { halign: "right" },
        },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }

    // Nueva página si es necesario
    if (yPosition > 220) {
      doc.addPage();
      yPosition = 20;
    }

    // Facturas del Día
    if (invoices.length > 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`Facturas del Día (${invoices.length})`, 14, yPosition);
      yPosition += 8;

      autoTable(doc, {
        startY: yPosition,
        head: [["No. Factura", "Paciente", "Monto", "Estado"]],
        body: invoices.map(inv => [
          inv.invoice_number,
          inv.patient_name,
          `Q ${Number(inv.total_amount).toFixed(2)}`,
          inv.status.charAt(0).toUpperCase() + inv.status.slice(1),
        ]),
        theme: "grid",
        headStyles: { fillColor: [225, 29, 72], textColor: 255 },
        styles: { fontSize: 9 },
        columnStyles: {
          2: { halign: "right" },
        },
      });
    }

    // Guardar el PDF
    const fileName = `Cierre_Caja_${format(today, "yyyy-MM-dd")}.pdf`;
    doc.save(fileName);
    
    toast.success("PDF generado exitosamente");
  };

  const handleExportToExcel = () => {
    // Crear un nuevo libro de trabajo
    const workbook = XLSX.utils.book_new();

    // Hoja 1: Resumen General
    const resumenData = [
      ["CIERRE DE CAJA"],
      [format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })],
      [`Período: ${format(startOfDay, "HH:mm")} - ${format(clinicNow(), "HH:mm")}`],
      userProfile ? [`Cerrado por: ${userProfile.full_name}`] : [],
      [],
      ["Concepto", "Monto (GTQ)"],
      ["Total Facturado", Number(dailySummary?.totalInvoiced || 0).toFixed(2)],
      ["Total Cobrado", Number(dailySummary?.totalCollected || 0).toFixed(2)],
      ["Total Pendiente", Number(dailySummary?.totalPending || 0).toFixed(2)],
      ["Total Descuentos", Number(dailySummary?.totalDiscounts || 0).toFixed(2)],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    wsResumen['!cols'] = [{ wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, wsResumen, "Resumen");

    // Hoja 2: Servicios (Detallado)
    const serviciosData: any[][] = [
      ["Tipo de Servicio", "Servicio", "Cantidad", "Total (GTQ)"],
    ];
    
    // Agregar servicios agrupados por tipo
    serviceSales.forEach(serviceType => {
      const details = serviceDetails.filter(d => d.service_type === serviceType.service_type);
      
      // Agregar encabezado del tipo
      serviciosData.push([
        getServiceLabel(serviceType.service_type),
        "",
        serviceType.cantidad.toString(),
        Number(serviceType.total).toFixed(2)
      ]);
      
      // Agregar detalle individual
      details.forEach(detail => {
        serviciosData.push([
          "",
          detail.service_name,
          detail.quantity.toString(),
          Number(detail.subtotal).toFixed(2)
        ]);
      });
      
      // Línea en blanco entre tipos
      serviciosData.push(["", "", "", ""]);
    });
    
    const wsServicios = XLSX.utils.aoa_to_sheet(serviciosData);
    wsServicios['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, wsServicios, "Servicios");

    // Hoja 3: Inventario (Resumen)
    const inventarioData = [
      ["Categoría", "Cantidad", "Total (GTQ)"],
      ...inventorySales.map(i => [
        i.category,
        i.cantidad,
        Number(i.total).toFixed(2)
      ])
    ];
    const wsInventario = XLSX.utils.aoa_to_sheet(inventarioData);
    wsInventario['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, wsInventario, "Inventario");

    // Hoja 3b: Inventario (Detallado)
    const inventarioDetalleData: any[][] = [
      ["Categoría", "Producto", "Cantidad", "Total (GTQ)"],
    ];
    
    // Agregar productos agrupados por categoría
    inventorySales.forEach(category => {
      const details = inventoryDetails.filter(d => d.category === category.category);
      
      // Agregar encabezado de la categoría
      inventarioDetalleData.push([
        category.category,
        "",
        category.cantidad.toString(),
        Number(category.total).toFixed(2)
      ]);
      
      // Agregar detalle individual
      details.forEach(detail => {
        inventarioDetalleData.push([
          "",
          detail.product_name,
          detail.quantity.toString(),
          Number(detail.total).toFixed(2)
        ]);
      });
      
      // Línea en blanco entre categorías
      inventarioDetalleData.push(["", "", "", ""]);
    });
    
    const wsInventarioDetalle = XLSX.utils.aoa_to_sheet(inventarioDetalleData);
    wsInventarioDetalle['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, wsInventarioDetalle, "Inventario Detallado");

    // Hoja 4: Métodos de Pago
    const metodosData = [
      ["Método de Pago", "Cantidad", "Total (GTQ)"],
      ...paymentMethods.map(p => [
        p.payment_method.charAt(0).toUpperCase() + p.payment_method.slice(1),
        p.cantidad,
        Number(p.total).toFixed(2)
      ])
    ];
    const wsMetodos = XLSX.utils.aoa_to_sheet(metodosData);
    wsMetodos['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, wsMetodos, "Métodos de Pago");

    // Hoja 5: Facturas
    const facturasData = [
      ["No. Factura", "Paciente", "Monto (GTQ)", "Estado", "Método de Pago"],
      ...invoices.map(inv => [
        inv.invoice_number,
        inv.patient_name,
        Number(inv.total_amount).toFixed(2),
        inv.status.charAt(0).toUpperCase() + inv.status.slice(1),
        inv.payment_method ? inv.payment_method.charAt(0).toUpperCase() + inv.payment_method.slice(1) : "Pendiente"
      ])
    ];
    const wsFacturas = XLSX.utils.aoa_to_sheet(facturasData);
    wsFacturas['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, wsFacturas, "Facturas");

    // Generar el archivo
    const fileName = `Cierre_Caja_${format(today, "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    toast.success("Archivo Excel generado exitosamente");
  };

  const getServiceIcon = (type: string) => {
    switch (type) {
      case "consulta": return <Stethoscope className="h-4 w-4" />;
      case "cirugia": return <Syringe className="h-4 w-4" />;
      case "procedimiento": return <FileText className="h-4 w-4" />;
      case "estudio": return <FileText className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const getServiceLabel = (type: string) => {
    const labels: Record<string, string> = {
      consulta: "Consultas",
      cirugia: "Cirugías",
      procedimiento: "Procedimientos",
      estudio: "Estudios",
    };
    return labels[type] || type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader className="print:border-b print:pb-4">
          <DialogTitle className="text-2xl font-bold text-rose-600">
            Cierre de Caja
          </DialogTitle>
          <div className="text-sm text-muted-foreground space-y-1">
            <div className="flex items-center justify-between gap-4">
              <p>{format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}</p>
              {userProfile && (
                <p className="font-medium text-foreground">
                  Cerrado por: {userProfile.full_name}
                </p>
              )}
            </div>
            <p>Período: {format(startOfDay, "HH:mm", { locale: es })} - {format(clinicNow(), "HH:mm", { locale: es })}</p>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-200px)]">
          <div className="space-y-6 pr-4">
            {/* Ventas por Tipo de Servicio */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Ventas por Tipo de Servicio
              </h3>
              <div className="space-y-4">
                {serviceSales.length > 0 ? (
                  serviceSales.map((service) => {
                    // Filtrar servicios individuales de este tipo
                    const details = serviceDetails.filter(d => d.service_type === service.service_type);
                    
                    return (
                      <div key={service.service_type} className="border rounded-lg p-3 bg-secondary/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getServiceIcon(service.service_type)}
                            <div>
                              <p className="font-bold text-lg">{getServiceLabel(service.service_type)}</p>
                              <p className="text-sm text-muted-foreground">{service.cantidad} servicios</p>
                            </div>
                          </div>
                          <p className="font-bold text-lg">GTQ {Number(service.total).toFixed(2)}</p>
                        </div>
                        
                        {/* Detalle de servicios individuales */}
                        {details.length > 0 && (
                          <div className="mt-3 pl-8 space-y-1 border-l-2 border-muted">
                            {details.map((detail, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  • {detail.service_name} {detail.quantity > 1 ? `(x${detail.quantity})` : ''}
                                </span>
                                <span className="font-medium">GTQ {Number(detail.subtotal).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground text-center py-4">No hay ventas de servicios hoy</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Ventas de Inventario */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Package className="h-5 w-5" />
                Ventas de Inventario
              </h3>
              <div className="space-y-4">
                {inventorySales.length > 0 ? (
                  inventorySales.map((item) => {
                    // Filtrar productos individuales de esta categoría
                    const details = inventoryDetails.filter(d => d.category === item.category);
                    
                    return (
                      <div key={item.category} className="border rounded-lg p-3 bg-secondary/50">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-bold text-lg capitalize">{item.category}</p>
                            <p className="text-sm text-muted-foreground">{item.cantidad} unidades</p>
                          </div>
                          <p className="font-bold text-lg">GTQ {Number(item.total).toFixed(2)}</p>
                        </div>
                        
                        {/* Detalle de productos individuales */}
                        {details.length > 0 && (
                          <div className="mt-3 pl-8 space-y-1 border-l-2 border-muted">
                            {details.map((detail, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  • {detail.product_name} {detail.quantity > 1 ? `(x${detail.quantity})` : ''}
                                </span>
                                <span className="font-medium">GTQ {Number(detail.total).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground text-center py-4">No hay ventas de inventario hoy</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Resumen Financiero */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Resumen Financiero
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <p className="text-sm text-muted-foreground">Total Facturado</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    GTQ {Number(dailySummary?.totalInvoiced || 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <p className="text-sm text-muted-foreground">Total Cobrado</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    GTQ {Number(dailySummary?.totalCollected || 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                  <p className="text-sm text-muted-foreground">Pendiente</p>
                  <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                    GTQ {Number(dailySummary?.totalPending || 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                  <p className="text-sm text-muted-foreground">Descuentos</p>
                  <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
                    GTQ {Number(dailySummary?.totalDiscounts || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Métodos de Pago */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Métodos de Pago
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {paymentMethods.length > 0 ? (
                  paymentMethods.map((method) => (
                    <div key={method.payment_method} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                      <div>
                        <p className="font-medium capitalize">{method.payment_method}</p>
                        <p className="text-sm text-muted-foreground">{method.cantidad} pagos</p>
                      </div>
                      <p className="font-bold">GTQ {Number(method.total).toFixed(2)}</p>
                    </div>
                  ))
                ) : (
                  <p className="col-span-2 text-muted-foreground text-center py-4">No hay pagos registrados hoy</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Facturas del Día */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Facturas del Día ({invoices.length})</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {invoices.length > 0 ? (
                  invoices.map((invoice) => (
                    <div key={invoice.invoice_number} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1">
                        <p className="font-medium">{invoice.invoice_number}</p>
                        <p className="text-sm text-muted-foreground">{invoice.patient_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">GTQ {Number(invoice.total_amount).toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {invoice.status === "pagada" ? invoice.payment_method || "N/A" : "Pendiente"}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">No hay facturas registradas hoy</p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-between gap-3 pt-4 border-t print:hidden">
          <div className="flex gap-3">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" onClick={handleExportPDF}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
            <Button variant="outline" onClick={handleExportToExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCloseCash}
              disabled={isClosing}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              {isClosing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cerrar Caja
            </Button>
          </div>
        </div>
      </DialogContent>

      <PrintPreviewDialog
        isOpen={showPrintPreview}
        onClose={() => {
          setShowPrintPreview(false);
          setPrintHtmlContent(null);
        }}
        htmlContent={printHtmlContent}
        title="Cierre de Caja"
      />
    </Dialog>
  );
}
