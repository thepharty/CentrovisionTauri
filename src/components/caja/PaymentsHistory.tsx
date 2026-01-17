import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { Search, DollarSign, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentsHistory() {
  const { hasRole } = useAuth();
  const { currentBranch } = useBranch();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<any>(null);

  const canDeletePayment = hasRole('admin') || hasRole('contabilidad');

  const deleteMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      // 1. Obtener información del pago antes de eliminarlo
      const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('invoice_id, amount')
        .eq('id', paymentId)
        .single();

      if (fetchError) throw fetchError;
      if (!payment) throw new Error('Pago no encontrado');

      // 2. Eliminar el pago
      const { error: deleteError } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentId);

      if (deleteError) throw deleteError;

      // 3. Recalcular el balance de la factura
      const { data: remainingPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('invoice_id', payment.invoice_id)
        .eq('status', 'completado');

      const { data: invoice } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('id', payment.invoice_id)
        .single();

      if (!invoice) throw new Error('Factura no encontrada');

      const totalPaid = remainingPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const newBalance = Number(invoice.total_amount) - totalPaid;

      // 4. Actualizar factura con nuevo balance y estado
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          balance_due: newBalance,
          status: newBalance > 0 ? 'pendiente' : 'pagada',
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.invoice_id);

      if (updateError) throw updateError;

      return { paymentId, invoiceId: payment.invoice_id };
    },
    onSuccess: () => {
      toast.success('Pago eliminado correctamente. Balance de factura actualizado.');
      queryClient.invalidateQueries({ queryKey: ['payments-history'] });
      setShowDeleteDialog(false);
      setPaymentToDelete(null);
    },
    onError: (error: any) => {
      toast.error('Error al eliminar el pago: ' + error.message);
      console.error('Error deleting payment:', error);
    }
  });

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments-history', methodFilter, dateFrom, dateTo, currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];
      
      let query = supabase
        .from('payments')
        .select(`
          *,
          invoices!inner (
            invoice_number,
            branch_id,
            patients (
              first_name,
              last_name,
              code
            )
          )
        `)
        .eq('invoices.branch_id', currentBranch.id)
        .eq('status', 'completado')
        .order('created_at', { ascending: false });

      if (methodFilter !== 'all') {
        query = query.eq('payment_method', methodFilter);
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

  const filteredPayments = payments?.filter((payment) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      payment.invoices?.invoice_number.toLowerCase().includes(searchLower) ||
      payment.invoices?.patients?.first_name.toLowerCase().includes(searchLower) ||
      payment.invoices?.patients?.last_name.toLowerCase().includes(searchLower) ||
      payment.invoices?.patients?.code.toLowerCase().includes(searchLower) ||
      payment.reference?.toLowerCase().includes(searchLower)
    );
  });

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'efectivo':
        return 'bg-green-100 text-green-800';
      case 'tarjeta':
        return 'bg-blue-100 text-blue-800';
      case 'transferencia':
        return 'bg-purple-100 text-purple-800';
      case 'cheque':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMethodLabel = (method: string) => {
    return method.charAt(0).toUpperCase() + method.slice(1);
  };

  const totalAmount = filteredPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

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
                  placeholder="Buscar por factura, paciente, referencia..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Método de pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
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

      {/* Resumen */}
      {filteredPayments && filteredPayments.length > 0 && (
        <Card className="bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Total cobrado:</span>
              </div>
              <span className="text-2xl font-bold text-primary">
                GTQ {totalAmount.toFixed(2)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredPayments.length} pago{filteredPayments.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lista de pagos */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Cargando pagos...</p>
          </CardContent>
        </Card>
      ) : filteredPayments && filteredPayments.length > 0 ? (
        <div className="space-y-2">
          {filteredPayments.map((payment) => (
            <Card key={payment.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-lg">GTQ {Number(payment.amount).toFixed(2)}</p>
                      <Badge className={getMethodColor(payment.payment_method)}>
                        {getMethodLabel(payment.payment_method)}
                      </Badge>
                    </div>
                    
                    <div className="mt-2 space-y-1">
                      <p className="text-sm">
                        <span className="text-muted-foreground">Factura:</span>{' '}
                        <span className="font-medium">{payment.invoices?.invoice_number}</span>
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Paciente:</span>{' '}
                        {payment.invoices?.patients?.first_name} {payment.invoices?.patients?.last_name}
                      </p>
                      {payment.reference && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Referencia:</span> {payment.reference}
                        </p>
                      )}
                    </div>

                    {payment.notes && (
                      <p className="text-sm text-muted-foreground mt-2 pt-2 border-t">
                        {payment.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right text-xs text-muted-foreground">
                      <p>
                        {new Date(payment.created_at).toLocaleDateString('es-MX', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      <p>
                        {new Date(payment.created_at).toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    {canDeletePayment && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setPaymentToDelete(payment);
                          setShowDeleteDialog(true);
                        }}
                        title="Eliminar pago"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No se encontraron pagos</p>
          </CardContent>
        </Card>
      )}

      {/* Diálogo de confirmación de eliminación */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el pago de GTQ {Number(paymentToDelete?.amount || 0).toFixed(2)} 
              {paymentToDelete?.invoices?.invoice_number && 
                ` de la factura ${paymentToDelete.invoices.invoice_number}`}.
              <br /><br />
              El balance de la factura se recalculará automáticamente.
              <br /><br />
              <strong>Esta acción no se puede deshacer.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (paymentToDelete?.id) {
                  deleteMutation.mutate(paymentToDelete.id);
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar pago'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
