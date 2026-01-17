import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface InvoiceDetailDialogProps {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InvoiceDetailDialog({ invoiceId, open, onOpenChange }: InvoiceDetailDialogProps) {
  const { data: invoice } = useQuery({
    queryKey: ['invoice-detail', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null;
      
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          patients (
            first_name,
            last_name,
            code,
            phone,
            email
          )
        `)
        .eq('id', invoiceId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!invoiceId && open,
  });

  const { data: items } = useQuery({
    queryKey: ['invoice-items', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];
      
      const { data, error } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!invoiceId && open,
  });

  const { data: payments } = useQuery({
    queryKey: ['invoice-payments', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];
      
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!invoiceId && open,
  });

  if (!invoice) return null;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle de Factura</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información de la factura */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Número de Factura</p>
                <p className="text-lg font-semibold">{invoice.invoice_number}</p>
              </div>
              <Badge className={getStatusColor(invoice.status)}>
                {getStatusLabel(invoice.status)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Fecha</p>
                <p className="font-medium">
                  {new Date(invoice.created_at).toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paciente</p>
                <p className="font-medium">
                  {invoice.patients?.first_name} {invoice.patients?.last_name}
                </p>
                <p className="text-sm text-muted-foreground">{invoice.patients?.code}</p>
              </div>
            </div>

            {invoice.patients?.phone && (
              <div className="mt-2">
                <p className="text-sm text-muted-foreground">Teléfono</p>
                <p className="font-medium">{invoice.patients.phone}</p>
              </div>
            )}

            {invoice.notes && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">Notas</p>
                <p className="text-sm">{invoice.notes}</p>
              </div>
            )}

            {(invoice.discount_type && invoice.discount_value > 0) && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-green-800">Descuento Aplicado</p>
                    <p className="text-xs text-green-700 mt-1">
                      {invoice.discount_reason}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-green-800">
                    {invoice.discount_type === 'percentage' 
                      ? `${invoice.discount_value}%` 
                      : `GTQ ${Number(invoice.discount_value).toFixed(2)}`}
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Items de la factura */}
          <div>
            <h3 className="font-semibold mb-3">Items</h3>
            <div className="space-y-2">
              {items?.map((item) => (
                <div key={item.id} className="flex justify-between items-start border-b pb-2">
                  <div className="flex-1">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} x GTQ {Number(item.unit_price).toFixed(2)}
                    </p>
                  </div>
                  <p className="font-semibold">GTQ {Number(item.subtotal).toFixed(2)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {(invoice.discount_type && invoice.discount_value > 0) && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>GTQ {(Number(invoice.total_amount) + (
                      invoice.discount_type === 'percentage'
                        ? (Number(invoice.total_amount) * Number(invoice.discount_value)) / (100 - Number(invoice.discount_value))
                        : Number(invoice.discount_value)
                    )).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>
                      Descuento ({invoice.discount_type === 'percentage' ? `${invoice.discount_value}%` : 'Fijo'})
                    </span>
                    <span>
                      -GTQ {(
                        invoice.discount_type === 'percentage'
                          ? (Number(invoice.total_amount) * Number(invoice.discount_value)) / (100 - Number(invoice.discount_value))
                          : Number(invoice.discount_value)
                      ).toFixed(2)}
                    </span>
                  </div>
                </>
              )}
              
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>Total</span>
                <span>GTQ {Number(invoice.total_amount).toFixed(2)}</span>
              </div>
              
              {Number(invoice.balance_due) > 0 && (
                <div className="flex justify-between text-orange-600 font-semibold">
                  <span>Saldo Pendiente</span>
                  <span>GTQ {Number(invoice.balance_due).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Historial de pagos */}
          {payments && payments.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3">Historial de Pagos</h3>
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <p className="font-medium">
                          {new Date(payment.created_at).toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {payment.payment_method}
                          {payment.reference && ` - Ref: ${payment.reference}`}
                        </p>
                      </div>
                      <p className="font-semibold text-green-600">
                        GTQ {Number(payment.amount).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
