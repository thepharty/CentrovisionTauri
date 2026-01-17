import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/hooks/useBranch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Search, DollarSign, Banknote, Calculator, Clock, CheckCircle2, CreditCard, Wallet, ArrowRightLeft, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PaymentForm() {
  const { currentBranch } = useBranch();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'all'>('all');

  // Calcular cambio
  const change = amountReceived && amount && paymentMethod === 'efectivo'
    ? Number(amountReceived) - Number(amount)
    : null;

  // Obtener todas las facturas pendientes (para la lista) - FILTRADO POR SUCURSAL
  const { data: allPendingInvoices } = useQuery({
    queryKey: ['all-pending-invoices', dateFilter, currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];
      
      let query = supabase
        .from('invoices')
        .select(`
          *,
          patients (first_name, last_name, code)
        `)
        .eq('branch_id', currentBranch.id)
        .neq('status', 'cancelada')
        .gt('balance_due', 0);

      // Aplicar filtro de fecha
      if (dateFilter === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.gte('created_at', today.toISOString());
      } else if (dateFilter === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('created_at', weekAgo.toISOString());
      }

      const { data } = await query
        .order('created_at', { ascending: false })
        .limit(50);
      
      return data || [];
    },
    enabled: !!currentBranch?.id,
  });

  // Función auxiliar para obtener el color del badge según antigüedad
  const getAgeColor = (createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'bg-green-500';
    if (diffDays <= 7) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Buscar facturas pendientes (para búsqueda manual) - FILTRADO POR SUCURSAL
  const { data: pendingInvoices, isLoading: isSearching } = useQuery({
    queryKey: ['pending-invoices', searchTerm.trim(), currentBranch?.id],
    queryFn: async () => {
      const trimmedSearch = searchTerm.trim();
      if (!trimmedSearch || trimmedSearch.length < 2 || !currentBranch?.id) return [];
      
      try {
        console.log('🔍 Buscando facturas con término:', trimmedSearch, 'en sucursal:', currentBranch.id);

        // Query 1: Buscar por número de factura
        const { data: invoicesByNumber, error: error1 } = await supabase
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
          .neq('status', 'cancelada')
          .gt('balance_due', 0)
          .ilike('invoice_number', `%${trimmedSearch}%`)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error1) {
          console.error('❌ Error en búsqueda por número:', error1);
          throw error1;
        }

        console.log('📋 Facturas encontradas por número:', invoicesByNumber?.length || 0);

        // Query 2: Buscar pacientes y luego sus facturas
        const { data: patients, error: error2 } = await supabase
          .from('patients')
          .select('id, first_name, last_name, code')
          .or(`first_name.ilike.%${trimmedSearch}%,last_name.ilike.%${trimmedSearch}%,code.ilike.%${trimmedSearch}%`)
          .limit(20);

        if (error2) {
          console.error('❌ Error en búsqueda de pacientes:', error2);
          throw error2;
        }

        console.log('👥 Pacientes encontrados:', patients?.length || 0, patients);

        let invoicesByPatient: any[] = [];
        if (patients && patients.length > 0) {
          const patientIds = patients.map(p => p.id);
          console.log('🔎 Buscando facturas para pacientes:', patientIds);
          
          const { data: patientInvoices, error: error3 } = await supabase
            .from('invoices')
            .select('*')
            .eq('branch_id', currentBranch.id)
            .neq('status', 'cancelada')
            .gt('balance_due', 0)
            .in('patient_id', patientIds)
            .order('created_at', { ascending: false })
            .limit(10);

          if (error3) {
            console.error('❌ Error en búsqueda de facturas por paciente:', error3);
            throw error3;
          }

          console.log('💰 Facturas encontradas por paciente:', patientInvoices?.length || 0);

          // Mapear datos de pacientes manualmente
          invoicesByPatient = (patientInvoices || []).map(invoice => {
            const patient = patients.find(p => p.id === invoice.patient_id);
            return {
              ...invoice,
              patients: patient ? {
                first_name: patient.first_name,
                last_name: patient.last_name,
                code: patient.code
              } : null
            };
          });
        }

        // Combinar y deduplicar resultados
        const allInvoices = [...(invoicesByNumber || []), ...invoicesByPatient];
        const uniqueInvoices = allInvoices.filter((invoice, index, self) => 
          index === self.findIndex(i => i.id === invoice.id)
        );

        console.log('✅ Total facturas únicas encontradas:', uniqueInvoices.length);
        return uniqueInvoices.slice(0, 10);
      } catch (error) {
        console.error('❌ Error general en búsqueda:', error);
        toast.error('Error al buscar facturas');
        return [];
      }
    },
    enabled: searchTerm.trim().length >= 2,
  });

  // Obtener pagos existentes de la factura seleccionada
  const { data: existingPayments } = useQuery({
    queryKey: ['invoice-payments', selectedInvoice?.id],
    queryFn: async () => {
      if (!selectedInvoice) return [];
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', selectedInvoice.id)
        .eq('status', 'completado')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!selectedInvoice,
  });

  // Crear pago
  const createPayment = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice) throw new Error('Seleccione una factura');
      if (!amount || Number(amount) <= 0) throw new Error('Ingrese un monto válido');
      if (!paymentMethod) throw new Error('Seleccione un método de pago');
      
      // Validar efectivo
      if (paymentMethod === 'efectivo') {
        if (!amountReceived || Number(amountReceived) <= 0) {
          throw new Error('Ingrese el monto recibido del cliente');
        }
        if (Number(amountReceived) < Number(amount)) {
          throw new Error(`El monto recibido debe ser al menos GTQ ${Number(amount).toFixed(2)}`);
        }
      }

      const paymentAmount = Number(amount);
      const balanceDue = Number(selectedInvoice.balance_due);

      if (paymentAmount > balanceDue) {
        throw new Error(`El monto no puede ser mayor al saldo pendiente (GTQ ${balanceDue.toFixed(2)})`);
      }

      // Agregar información de cambio a las notas si es efectivo
      let finalNotes = notes || '';
      if (paymentMethod === 'efectivo' && amountReceived) {
        const changeAmount = Number(amountReceived) - paymentAmount;
        const changeInfo = `Recibido: GTQ ${Number(amountReceived).toFixed(2)} | Cambio: GTQ ${changeAmount.toFixed(2)}`;
        finalNotes = finalNotes ? `${changeInfo}\n${finalNotes}` : changeInfo;
      }

      const { data, error } = await supabase
        .from('payments')
        .insert({
          invoice_id: selectedInvoice.id,
          amount: paymentAmount,
          payment_method: paymentMethod,
          reference: reference || null,
          notes: finalNotes || null,
          status: 'completado',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Actualizar el balance de la factura seleccionada
      const newBalance = Number(selectedInvoice.balance_due) - Number(amount);
      
      setSelectedInvoice({
        ...selectedInvoice,
        balance_due: newBalance
      });
      
      toast.success(
        newBalance > 0 
          ? `Pago registrado. Saldo restante: GTQ ${newBalance.toFixed(2)}`
          : '¡Pago completado! Factura saldada ✓'
      );
      
      // Invalidar queries para actualizar datos
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['pending-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['all-pending-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['caja-summary'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-payments', selectedInvoice.id] });
      
      // Limpiar SOLO los campos del formulario
      setAmount('');
      setPaymentMethod('');
      setAmountReceived('');
      setReference('');
      setNotes('');
      
      // NO resetear selectedInvoice ni searchTerm para permitir pagos múltiples
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al registrar pago');
    },
  });

  const totalPaid = existingPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  // Auto-sugerir el saldo restante cuando se selecciona una factura
  useEffect(() => {
    if (selectedInvoice && !amount && selectedInvoice.balance_due > 0) {
      setAmount(Number(selectedInvoice.balance_due).toFixed(2));
    }
  }, [selectedInvoice?.id]);

  // Helper para obtener ícono del método de pago
  const getPaymentMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case 'efectivo':
        return <Wallet className="h-3 w-3" />;
      case 'tarjeta':
        return <CreditCard className="h-3 w-3" />;
      case 'transferencia':
        return <ArrowRightLeft className="h-3 w-3" />;
      case 'cheque':
        return <FileText className="h-3 w-3" />;
      default:
        return <DollarSign className="h-3 w-3" />;
    }
  };

  // Función para resetear completamente el formulario
  const resetForm = () => {
    setSelectedInvoice(null);
    setAmount('');
    setPaymentMethod('');
    setAmountReceived('');
    setReference('');
    setNotes('');
    setSearchTerm('');
  };

  return (
    <div className="space-y-6">
      {/* Buscar factura con tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Facturas Pendientes</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list">📋 Todas Pendientes</TabsTrigger>
              <TabsTrigger value="search">🔍 Buscar</TabsTrigger>
            </TabsList>

            {/* Tab: Lista de todas las facturas */}
            <TabsContent value="list" className="space-y-4">
              {/* Filtros de fecha */}
              <div className="flex gap-2">
                <Button
                  variant={dateFilter === 'today' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateFilter('today')}
                >
                  Hoy
                </Button>
                <Button
                  variant={dateFilter === 'week' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateFilter('week')}
                >
                  Esta semana
                </Button>
                <Button
                  variant={dateFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateFilter('all')}
                >
                  Todas
                </Button>
              </div>

              {/* Lista de facturas */}
              {!allPendingInvoices || allPendingInvoices.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <p>No hay facturas pendientes</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {allPendingInvoices.map((invoice) => (
                    <button
                      key={invoice.id}
                      onClick={() => {
                        setSelectedInvoice(invoice);
                        setAmount(Number(invoice.balance_due).toFixed(2));
                      }}
                      className="w-full p-4 text-left hover:bg-muted border rounded-md transition-colors"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold">{invoice.invoice_number}</p>
                            <Badge 
                              className={`${getAgeColor(invoice.created_at)} text-white text-xs`}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              {formatDistanceToNow(new Date(invoice.created_at), { 
                                addSuffix: true, 
                                locale: es 
                              })}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {invoice.patients?.first_name} {invoice.patients?.last_name}
                            {invoice.patients?.code && ` • ${invoice.patients.code}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground mb-1">
                            Total: GTQ {Number(invoice.total_amount).toFixed(2)}
                          </p>
                          <p className="font-bold text-orange-600">
                            GTQ {Number(invoice.balance_due).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">Pendiente</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Tab: Búsqueda manual */}
            <TabsContent value="search" className="space-y-4">
              <div>
                <Label>Número de factura o paciente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="FACT-0001, nombre del paciente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {isSearching && searchTerm.trim().length >= 2 && (
                  <div className="mt-2 p-3 text-sm text-muted-foreground text-center">
                    Buscando...
                  </div>
                )}

                {!isSearching && searchTerm.trim().length >= 2 && pendingInvoices && pendingInvoices.length === 0 && !selectedInvoice && (
                  <div className="mt-2 p-4 border rounded-md bg-muted">
                    <p className="text-sm text-muted-foreground text-center">
                      No se encontraron facturas pendientes para "{searchTerm.trim()}"
                    </p>
                    <p className="text-xs text-muted-foreground text-center mt-1">
                      Intente buscar por número de factura, nombre o código del paciente
                    </p>
                  </div>
                )}

                {pendingInvoices && pendingInvoices.length > 0 && !selectedInvoice && (
                  <div className="mt-2 border rounded-md">
                    {pendingInvoices.map((invoice) => (
                      <button
                        key={invoice.id}
                        onClick={() => {
                          setSelectedInvoice(invoice);
                          setSearchTerm('');
                          setAmount(Number(invoice.balance_due).toFixed(2));
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-muted border-b last:border-b-0"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{invoice.invoice_number}</p>
                            <p className="text-sm text-muted-foreground">
                              {invoice.patients?.first_name} {invoice.patients?.last_name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-orange-600">
                              GTQ {Number(invoice.balance_due).toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Factura seleccionada (se muestra en ambos tabs) */}
          {selectedInvoice && (
              <Card className="bg-muted">
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Factura:</span>
                      <span className="text-sm">{selectedInvoice.invoice_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Paciente:</span>
                      <span className="text-sm">
                        {selectedInvoice.patients?.first_name} {selectedInvoice.patients?.last_name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Total factura:</span>
                      <span className="text-sm">GTQ {Number(selectedInvoice.total_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Pagado:</span>
                      <span className="text-sm text-green-600">GTQ {totalPaid.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-semibold">Saldo pendiente:</span>
                      <span className="font-semibold text-orange-600">
                        GTQ {Number(selectedInvoice.balance_due).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {/* Mostrar alerta si está completamente pagada */}
                  {selectedInvoice.balance_due === 0 ? (
                    <Alert className="mt-4 bg-green-50 border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-900">¡Factura Saldada!</AlertTitle>
                      <AlertDescription className="text-green-700">
                        Esta factura ha sido pagada completamente.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetForm}
                      className="w-full mt-4"
                    >
                      Cambiar factura
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
        </CardContent>
      </Card>

      {/* Registrar pago - solo si hay saldo pendiente */}
      {selectedInvoice && selectedInvoice.balance_due > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Registrar Pago</span>
              {existingPayments && existingPayments.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  Pago {existingPayments.length + 1}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Monto a pagar *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={Number(selectedInvoice.balance_due)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-10"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Máximo: GTQ {Number(selectedInvoice.balance_due).toFixed(2)}
                </p>
              </div>

              <div>
                <Label>Método de pago *</Label>
                <Select 
                  value={paymentMethod} 
                  onValueChange={(value) => {
                    setPaymentMethod(value);
                    // Limpiar monto recibido si se cambia de método
                    if (value !== 'efectivo') {
                      setAmountReceived('');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Calculadora de cambio - solo para efectivo */}
              {paymentMethod === 'efectivo' && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Calculator className="h-5 w-5 text-blue-600" />
                        <h3 className="font-semibold text-blue-900">Calculadora de Cambio</h3>
                      </div>

                      <div>
                        <Label className="text-blue-900">Monto recibido del cliente *</Label>
                        <div className="relative">
                          <Banknote className="absolute left-3 top-3 h-4 w-4 text-blue-600" />
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={amountReceived}
                            onChange={(e) => setAmountReceived(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="pl-10 bg-white border-blue-300 focus:border-blue-500"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {/* Mostrar cambio */}
                      {change !== null && (
                        <div className={`p-4 rounded-lg border-2 ${
                          change >= 0 
                            ? 'bg-green-50 border-green-300' 
                            : 'bg-orange-50 border-orange-300'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className={`font-medium ${
                              change >= 0 ? 'text-green-900' : 'text-orange-900'
                            }`}>
                              Cambio a devolver:
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-2xl font-bold ${
                                change >= 0 ? 'text-green-600' : 'text-orange-600'
                              }`}>
                                GTQ {Math.abs(change).toFixed(2)}
                              </span>
                              {change >= 0 ? (
                                <Badge className="bg-green-600">✓</Badge>
                              ) : (
                                <Badge variant="destructive">Falta</Badge>
                              )}
                            </div>
                          </div>
                          {change < 0 && (
                            <p className="text-xs text-orange-700 mt-2">
                              El cliente debe entregar al menos GTQ {Number(amount).toFixed(2)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div>
                <Label>Referencia (Opcional)</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Número de transacción, cheque, etc."
                />
              </div>

              <div>
                <Label>Notas (Opcional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones adicionales..."
                  rows={3}
                />
              </div>

              <Button
                onClick={() => createPayment.mutate()}
                disabled={
                  createPayment.isPending || 
                  !amount || 
                  !paymentMethod ||
                  (paymentMethod === 'efectivo' && (!amountReceived || change === null || change < 0))
                }
                className="w-full"
                size="lg"
              >
                {createPayment.isPending ? 'Registrando...' : 'Registrar Pago'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial de pagos - Mejorado */}
      {selectedInvoice && existingPayments && existingPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Historial de Pagos</span>
              <Badge className="bg-blue-600">
                {existingPayments.length} pago{existingPayments.length !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {existingPayments.map((payment, index) => (
                <div key={payment.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="gap-1">
                      {getPaymentMethodIcon(payment.payment_method)}
                      {payment.payment_method.charAt(0).toUpperCase() + payment.payment_method.slice(1)}
                    </Badge>
                    <div>
                      <p className="font-semibold">GTQ {Number(payment.amount).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(payment.created_at), { 
                          addSuffix: true, 
                          locale: es 
                        })}
                      </p>
                      {payment.reference && (
                        <p className="text-xs text-muted-foreground">Ref: {payment.reference}</p>
                      )}
                    </div>
                  </div>
                  {payment.notes?.includes('Cambio:') && (
                    <span className="text-xs text-muted-foreground">
                      {payment.notes.split('\n')[0]}
                    </span>
                  )}
                </div>
              ))}
              
              {/* Resumen de pagos */}
              <div className="pt-3 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total pagado:</span>
                  <span className="font-semibold text-green-600">GTQ {totalPaid.toFixed(2)}</span>
                </div>
                {selectedInvoice.balance_due > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Saldo pendiente:</span>
                    <span className="font-semibold text-orange-600">
                      GTQ {Number(selectedInvoice.balance_due).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Botón para finalizar si está completamente pagada */}
              {selectedInvoice.balance_due === 0 && (
                <Button 
                  variant="default" 
                  onClick={resetForm}
                  className="w-full mt-2"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Finalizar y buscar otra factura
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
