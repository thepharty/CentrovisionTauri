import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, FileText, CreditCard, Package, ArrowLeft, Stethoscope, FileBarChart, DoorClosed } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { clinicNow, clinicStartOfDay } from '@/lib/timezone';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}
import InvoiceForm from '@/components/caja/InvoiceForm';
import InvoicesList from '@/components/caja/InvoicesList';
import PaymentForm from '@/components/caja/PaymentForm';
import PaymentsHistory from '@/components/caja/PaymentsHistory';
import InventoryList from '@/components/caja/InventoryList';
import InventoryMovements from '@/components/caja/InventoryMovements';
import LotManagement from '@/components/caja/LotManagement';
import ServicePricesList from '@/components/caja/ServicePricesList';
import { CashClosureDialog } from '@/components/caja/CashClosureDialog';
import { ReportsDialog } from '@/components/caja/ReportsDialog';

export default function Caja() {
  const { role, roles } = useAuth();
  const { currentBranch } = useBranch();
  const navigate = useNavigate();
  const location = useLocation();
  const [cashClosureOpen, setCashClosureOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [showSecretButton, setShowSecretButton] = useState(false);
  const { connectionMode } = useNetworkStatus();

  // Check if we should use local mode
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  // Verificar que el usuario tiene permisos de caja, contabilidad o admin
  const hasAccess = roles.some(r => r === 'admin' || r === 'caja' || r === 'contabilidad');
  if (roles.length > 0 && !hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  // Query para obtener resumen de caja del día
  const { data: summary } = useQuery({
    queryKey: ['caja-summary', currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return null;

      const today = clinicNow();
      const startOfDay = clinicStartOfDay(today);
      const todayStr = today.toISOString().split('T')[0];

      if (isLocalMode) {
        // En modo local, usar los comandos Tauri existentes
        // Get invoices for today
        const invoices = await invoke<any[]>('get_invoices_by_branch_and_date', {
          branchId: currentBranch.id,
          date: todayStr,
        });

        // Get payments for date range (today)
        const payments = await invoke<any[]>('get_payments_by_date_range', {
          branchId: currentBranch.id,
          startDate: startOfDay.toISOString(),
          endDate: today.toISOString(),
        });

        const totalInvoiced = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;
        const totalPending = invoices?.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0) || 0;
        const totalCollected = payments?.filter(p => p.status === 'completado')
          .reduce((sum, pay) => sum + Number(pay.amount || 0), 0) || 0;
        const invoiceCount = invoices?.length || 0;

        return {
          totalInvoiced,
          totalPending,
          totalCollected,
          invoiceCount,
        };
      }

      // Buscar el último cierre de caja del día
      const { data: lastClosure } = await supabase
        .from('cash_closures')
        .select('period_end')
        .eq('branch_id', currentBranch.id)
        .gte('period_end', startOfDay.toISOString())
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Si existe un cierre, usar su period_end como punto de inicio
      // Si no existe, usar el inicio del día
      const periodStart = lastClosure?.period_end
        ? new Date(lastClosure.period_end)
        : startOfDay;

      // Facturas desde el último cierre (o desde inicio del día)
      const { data: invoices } = await supabase
        .from('invoices')
        .select('total_amount, balance_due, status')
        .eq('branch_id', currentBranch.id)
        .gte('created_at', periodStart.toISOString());

      // Pagos desde el último cierre (o desde inicio del día) - filtrar por invoices de la sede
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, invoices!inner(branch_id)')
        .eq('invoices.branch_id', currentBranch.id)
        .gte('created_at', periodStart.toISOString())
        .eq('status', 'completado');

      const totalInvoiced = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;
      const totalPending = invoices?.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0) || 0;
      const totalCollected = payments?.reduce((sum, pay) => sum + Number(pay.amount || 0), 0) || 0;
      const invoiceCount = invoices?.length || 0;

      return {
        totalInvoiced,
        totalPending,
        totalCollected,
        invoiceCount,
      };
    },
    enabled: hasAccess && !!currentBranch?.id,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div 
                className="bg-primary p-2 rounded-lg cursor-pointer"
                onClick={() => setShowSecretButton(prev => !prev)}
              >
                <DollarSign className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">Caja</h1>
                  {currentBranch && (
                    <span className="text-sm font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {currentBranch.name}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">Facturación, cobros e inventario</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Botones visibles solo para admin y contabilidad */}
              {roles.some(r => r === 'admin' || r === 'contabilidad') && (
                <>
                  <Button 
                    onClick={() => navigate('/analytics')}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <FileBarChart className="h-4 w-4 mr-2" />
                    Analíticas
                  </Button>
                  <Button 
                    onClick={() => setReportsOpen(true)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Generar Reportes
                  </Button>
                </>
              )}
              
              {/* Botón visible para todos los roles permitidos */}
              <Button 
                onClick={() => setCashClosureOpen(true)}
                className="bg-rose-500 hover:bg-rose-600 text-white"
              >
                <DoorClosed className="h-4 w-4 mr-2" />
                Cierre de Caja
              </Button>
            </div>
          </div>

          {/* Resumen del día */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Facturas Hoy</CardDescription>
                <CardTitle className="text-2xl">{summary?.invoiceCount || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Facturado</CardDescription>
                <CardTitle className="text-2xl">
                  GTQ {summary?.totalInvoiced.toFixed(2) || '0.00'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Cobrado</CardDescription>
                <CardTitle className="text-2xl text-green-600">
                  GTQ {summary?.totalCollected.toFixed(2) || '0.00'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pendiente</CardDescription>
                <CardTitle className="text-2xl text-orange-600">
                  GTQ {summary?.totalPending.toFixed(2) || '0.00'}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="facturar" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="facturar" className="gap-2">
              <FileText className="h-4 w-4" />
              Facturar
            </TabsTrigger>
            <TabsTrigger value="facturas" className="gap-2">
              <FileText className="h-4 w-4" />
              Facturas
            </TabsTrigger>
            <TabsTrigger value="cobrar" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Cobrar
            </TabsTrigger>
            <TabsTrigger value="inventario" className="gap-2">
              <Package className="h-4 w-4" />
              Inventario
            </TabsTrigger>
            <TabsTrigger value="servicios" className="gap-2">
              <Stethoscope className="h-4 w-4" />
              Servicios
            </TabsTrigger>
          </TabsList>

          <TabsContent value="facturar">
            <Card>
              <CardHeader>
                <CardTitle>Nueva Factura</CardTitle>
                <CardDescription>
                  Crea facturas para citas y servicios
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InvoiceForm 
                  initialAppointmentId={location.state?.appointmentId}
                  initialPatientId={location.state?.patientId}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="facturas">
            <InvoicesList />
          </TabsContent>

          <TabsContent value="cobrar">
            <Tabs defaultValue="registrar" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="registrar">Registrar Pago</TabsTrigger>
                <TabsTrigger value="historial">Historial</TabsTrigger>
              </TabsList>
              <TabsContent value="registrar">
                <PaymentForm />
              </TabsContent>
              <TabsContent value="historial">
                <PaymentsHistory />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="inventario">
            <Tabs defaultValue="productos" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="productos">Productos</TabsTrigger>
                <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
                <TabsTrigger value="lotes">Lotes</TabsTrigger>
              </TabsList>
              <TabsContent value="productos">
                <InventoryList showSecretButton={showSecretButton} />
              </TabsContent>
              <TabsContent value="movimientos">
                <InventoryMovements />
              </TabsContent>
              <TabsContent value="lotes">
                <LotManagement />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="servicios">
            <ServicePricesList />
          </TabsContent>
        </Tabs>
      </main>

      <CashClosureDialog 
        open={cashClosureOpen} 
        onOpenChange={setCashClosureOpen} 
      />
      
      <ReportsDialog 
        open={reportsOpen} 
        onOpenChange={setReportsOpen} 
      />
    </div>
  );
}
