import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, Eye, Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import InvoiceDetailDialog from './InvoiceDetailDialog';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';

export default function InvoicesList() {
  const { currentBranch } = useBranch();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null);
  
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices', statusFilter, dateFrom, dateTo, currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];
      
      let query = supabase
        .from('invoices')
        .select(`
          *,
          patients (
            first_name,
            last_name,
            code
          )
        `)
        .eq('branch_id', currentBranch.id)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (dateFrom) {
        query = query.gte('created_at', new Date(dateFrom).toISOString());
      }

      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const filteredInvoices = invoices?.filter((invoice) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      invoice.invoice_number.toLowerCase().includes(searchLower) ||
      invoice.patients?.first_name?.toLowerCase().includes(searchLower) ||
      invoice.patients?.last_name?.toLowerCase().includes(searchLower) ||
      invoice.patients?.code?.toLowerCase().includes(searchLower)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pagada':
        return 'bg-green-100 text-green-800';
      case 'pendiente':
        return 'bg-orange-100 text-orange-800';
      case 'cancelada':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pagada':
        return 'Pagada';
      case 'pendiente':
        return 'Pendiente';
      case 'cancelada':
        return 'Cancelada';
      default:
        return status;
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      // First, delete all invoice items
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', invoiceId);

      if (itemsError) throw itemsError;

      // Then, delete the invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId);

      if (invoiceError) throw invoiceError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['caja-summary'] });
      toast.success('Factura eliminada exitosamente');
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
    },
    onError: (error) => {
      toast.error('Error al eliminar la factura: ' + error.message);
    },
  });

  const handleView = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setDetailDialogOpen(true);
  };

  const handlePrint = (invoice: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Factura ${invoice.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .info { margin-bottom: 20px; }
            .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .table th { background-color: #f2f2f2; }
            .totals { margin-top: 20px; text-align: right; }
            .totals div { margin: 5px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>FACTURA</h1>
            <h2>${invoice.invoice_number}</h2>
          </div>
          <div class="info">
            <p><strong>Fecha:</strong> ${new Date(invoice.created_at).toLocaleDateString('es-MX')}</p>
            <p><strong>Paciente:</strong> ${invoice.patients?.first_name} ${invoice.patients?.last_name}</p>
            <p><strong>Código:</strong> ${invoice.patients?.code}</p>
            ${invoice.patients?.phone ? `<p><strong>Teléfono:</strong> ${invoice.patients.phone}</p>` : ''}
          </div>
          <div class="totals">
            ${(invoice.discount_type && invoice.discount_value > 0) ? `
              <div><strong>Subtotal:</strong> GTQ ${(Number(invoice.total_amount) + (
                invoice.discount_type === 'percentage'
                  ? (Number(invoice.total_amount) * Number(invoice.discount_value)) / (100 - Number(invoice.discount_value))
                  : Number(invoice.discount_value)
              )).toFixed(2)}</div>
              <div style="color: green;">
                <strong>Descuento (${invoice.discount_type === 'percentage' ? `${invoice.discount_value}%` : 'Fijo'}):</strong> 
                -GTQ ${(
                  invoice.discount_type === 'percentage'
                    ? (Number(invoice.total_amount) * Number(invoice.discount_value)) / (100 - Number(invoice.discount_value))
                    : Number(invoice.discount_value)
                ).toFixed(2)}
              </div>
              <div style="margin-top: 10px;"><em>Razón: ${invoice.discount_reason}</em></div>
            ` : ''}
            <div style="font-size: 18px; margin-top: 10px;"><strong>Total:</strong> GTQ ${Number(invoice.total_amount).toFixed(2)}</div>
            ${Number(invoice.balance_due) > 0 ? `<div style="color: orange;"><strong>Saldo Pendiente:</strong> GTQ ${Number(invoice.balance_due).toFixed(2)}</div>` : ''}
          </div>
          ${invoice.notes ? `<div style="margin-top: 20px;"><strong>Notas:</strong> ${invoice.notes}</div>` : ''}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleDeleteClick = (invoice: any) => {
    if (invoice.status === 'pagada') {
      toast.error('No se puede eliminar una factura pagada');
      return;
    }
    setInvoiceToDelete(invoice);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (invoiceToDelete) {
      deleteMutation.mutate(invoiceToDelete.id);
    }
  };

  const canDelete = hasRole('admin') || hasRole('contabilidad');

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número, paciente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="pagada">Pagada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="Desde"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="Hasta"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de facturas */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Cargando facturas...</p>
          </CardContent>
        </Card>
      ) : filteredInvoices && filteredInvoices.length > 0 ? (
        <div className="space-y-2">
          {filteredInvoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                <div className="flex items-center gap-3">
                  <p className="font-semibold">{invoice.invoice_number}</p>
                  <Badge className={getStatusColor(invoice.status)}>
                    {getStatusLabel(invoice.status)}
                  </Badge>
                  {(invoice.discount_type && invoice.discount_value > 0) && (
                    <Badge className="bg-green-100 text-green-800">
                      Descuento {invoice.discount_type === 'percentage' ? `${invoice.discount_value}%` : `GTQ ${invoice.discount_value}`}
                    </Badge>
                  )}
                </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {invoice.patients?.first_name} {invoice.patients?.last_name} (
                      {invoice.patients?.code})
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(invoice.created_at).toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div className="text-right space-y-1">
                    <p className="text-lg font-bold">
                      GTQ {Number(invoice.total_amount).toFixed(2)}
                    </p>
                    {invoice.status === 'pendiente' && Number(invoice.balance_due) > 0 && (
                      <p className="text-sm text-orange-600">
                        Saldo: GTQ {Number(invoice.balance_due).toFixed(2)}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleView(invoice.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handlePrint(invoice)}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    {canDelete && (invoice.status === 'pendiente' || invoice.status === 'cancelada') && (
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDeleteClick(invoice)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {invoice.notes && (
                  <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">
                    {invoice.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No se encontraron facturas</p>
          </CardContent>
        </Card>
      )}

      <InvoiceDetailDialog
        invoiceId={selectedInvoiceId}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la factura{' '}
              <strong>{invoiceToDelete?.invoice_number}</strong>.
              <br /><br />
              <strong>Nota:</strong> Los pagos asociados NO serán eliminados y quedarán registrados en el historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
