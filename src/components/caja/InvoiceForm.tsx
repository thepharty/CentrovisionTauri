import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';
import { useBranch } from '@/hooks/useBranch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, Search, ShoppingCart, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface InvoiceFormProps {
  initialAppointmentId?: string;
  initialPatientId?: string;
}

interface InvoiceItem {
  item_type: 'servicio' | 'producto';
  item_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export default function InvoiceForm({ initialAppointmentId, initialPatientId }: InvoiceFormProps) {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const [searchPatient, setSearchPatient] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<string>(initialAppointmentId || '');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [notes, setNotes] = useState('');
  const [isExternalClient, setIsExternalClient] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<string>('consulta');
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('0');
  const [discountReason, setDiscountReason] = useState('');
  const [customProductDialogOpen, setCustomProductDialogOpen] = useState(false);
  const [customProductCode, setCustomProductCode] = useState('');
  const [customProductDescription, setCustomProductDescription] = useState('');
  const [customProductPrice, setCustomProductPrice] = useState('');
  
  // Estado para animación de escaneo exitoso
  const [scanSuccess, setScanSuccess] = useState(false);

  // Cargar paciente inicial si se proporciona
  useEffect(() => {
    if (initialPatientId && !selectedPatient) {
      loadInitialPatient();
    }
  }, [initialPatientId]);

  const loadInitialPatient = async () => {
    if (!initialPatientId) return;

    if (isLocalMode) {
      const patient = await invoke<any>('get_patient_by_id', { id: initialPatientId });
      if (patient) setSelectedPatient(patient);
      return;
    }

    const { data: patient } = await supabase
      .from('patients')
      .select('*')
      .eq('id', initialPatientId)
      .single();

    if (patient) {
      setSelectedPatient(patient);
    }
  };

  const selectExternalClient = async () => {
    if (isLocalMode) {
      // En modo local, buscar cliente externo
      const patients = await invoke<any[]>('get_patients', { branchId: currentBranch?.id || '', search: 'EXTERNO-001' });
      const externalPatient = patients.find(p => p.code === 'EXTERNO-001');
      if (externalPatient) {
        setSelectedPatient(externalPatient);
        setIsExternalClient(true);
        setSelectedAppointment('');
        toast.success('Cliente externo seleccionado');
      } else {
        toast.error('Error al cargar cliente externo');
      }
      return;
    }

    const { data: externalPatient } = await supabase
      .from('patients')
      .select('*')
      .eq('code', 'EXTERNO-001')
      .single();

    if (externalPatient) {
      setSelectedPatient(externalPatient);
      setIsExternalClient(true);
      setSelectedAppointment('');
      toast.success('Cliente externo seleccionado');
    } else {
      toast.error('Error al cargar cliente externo');
    }
  };

  // Buscar pacientes
  const { data: patients } = useQuery({
    queryKey: ['patients-search', searchPatient, isLocalMode],
    queryFn: async () => {
      if (!searchPatient || searchPatient.length < 2) return [];

      if (isLocalMode) {
        const allPatients = await invoke<any[]>('get_patients', { branchId: currentBranch?.id || '', search: searchPatient });
        return allPatients.slice(0, 10);
      }

      const { data } = await supabase
        .from('patients')
        .select('id, first_name, last_name, code')
        .or(`first_name.ilike.%${searchPatient}%,last_name.ilike.%${searchPatient}%,code.ilike.%${searchPatient}%`)
        .limit(10);
      return data || [];
    },
    enabled: searchPatient.length >= 2,
  });

  // Obtener citas del paciente
  const { data: appointments } = useQuery({
    queryKey: ['patient-appointments', selectedPatient?.id, isLocalMode],
    queryFn: async () => {
      if (!selectedPatient) return [];

      if (isLocalMode) {
        // En modo local, obtener citas por paciente
        const today = new Date().toISOString().split('T')[0];
        const allAppointments = await invoke<any[]>('get_appointments', {
          branchId: currentBranch?.id || '',
          date: today
        });
        // Filtrar por paciente y ordenar
        return allAppointments
          .filter(apt => apt.patient_id === selectedPatient.id || apt.patient?.id === selectedPatient.id)
          .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
          .slice(0, 20)
          .map(apt => ({
            id: apt.id,
            type: apt.appointment_type || apt.type,
            starts_at: apt.starts_at,
            status: apt.status
          }));
      }

      const { data } = await supabase
        .from('appointments')
        .select('id, type, starts_at, status')
        .eq('patient_id', selectedPatient.id)
        .order('starts_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!selectedPatient,
  });

  // Obtener precios de servicios
  const { data: servicePrices } = useQuery({
    queryKey: ['service-prices', isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        return await invoke<any[]>('get_service_prices');
      }
      const { data } = await supabase
        .from('service_prices')
        .select('*')
        .eq('active', true);
      return data || [];
    },
  });

  // Obtener productos de inventario (filtrado por sucursal actual)
  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items', currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      if (isLocalMode) {
        const items = await invoke<any[]>('get_inventory_items', { branchId: currentBranch.id });
        return items.filter(item => item.active !== false);
      }

      const { data } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('active', true)
        .eq('branch_id', currentBranch.id);
      return data || [];
    },
    enabled: !!currentBranch?.id,
  });

  // Efecto para selección automática por código de barras (coincidencia exacta)
  useEffect(() => {
    if (productSearchTerm.length >= 2 && inventoryItems && inventoryItems.length > 0) {
      const exactMatch = inventoryItems.find(
        p => p.code?.toUpperCase() === productSearchTerm.toUpperCase()
      );
      if (exactMatch) {
        addProductItem(exactMatch.id);
        setOpenProductSearch(false);
        setProductSearchTerm('');
        setScanSuccess(true);
        setTimeout(() => setScanSuccess(false), 1500);
        toast.success(`✓ ${exactMatch.name} agregado`, { duration: 2000 });
      }
    }
  }, [productSearchTerm, inventoryItems]);

  // Crear factura
  const createInvoice = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error('Seleccione un paciente');
      if (items.length === 0) throw new Error('Agregue al menos un item');
      if (discountEnabled && !discountReason.trim()) throw new Error('Debe ingresar la razón del descuento');
      if (!currentBranch?.id) throw new Error('No hay sucursal seleccionada');

      if (isLocalMode) {
        // En modo local, generar número de factura manualmente
        const prefix = currentBranch?.code || 'CV';
        const timestamp = Date.now().toString().slice(-6);
        const invoiceNumber = `${prefix}-${timestamp}`;

        // Crear factura usando Tauri
        const invoice = await invoke<any>('create_invoice', {
          invoice: {
            branch_id: currentBranch.id,
            invoice_number: invoiceNumber,
            patient_id: selectedPatient.id,
            appointment_id: selectedAppointment || null,
            total_amount: total,
            balance_due: total,
            status: 'pendiente',
            notes: notes || null,
            discount_type: discountEnabled ? discountType : null,
            discount_value: discountEnabled ? Number(discountValue) : 0,
            discount_reason: discountEnabled ? discountReason : null,
          }
        });

        // Crear items
        for (const item of items) {
          await invoke('create_invoice_item', {
            item: {
              invoice_id: invoice.id,
              ...item,
            }
          });
        }

        return invoice;
      }

      // Generar número de factura con prefijo por sucursal (CV-0001 para Central, SL-0001 para Santa Lucía)
      const { data: invoiceNumber } = await supabase.rpc('generate_invoice_number_for_branch', {
        p_branch_id: currentBranch.id
      });

      // Crear factura
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          branch_id: currentBranch?.id || '',
          invoice_number: invoiceNumber,
          patient_id: selectedPatient.id,
          appointment_id: selectedAppointment || null,
          total_amount: total,
          balance_due: total,
          status: 'pendiente',
          notes: notes,
          discount_type: discountEnabled ? discountType : null,
          discount_value: discountEnabled ? Number(discountValue) : 0,
          discount_reason: discountEnabled ? discountReason : null,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Crear items
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(
          items.map((item) => ({
            invoice_id: invoice.id,
            ...item,
          }))
        );

      if (itemsError) throw itemsError;

      return invoice;
    },
    onSuccess: () => {
      toast.success('Factura creada exitosamente');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['caja-summary'] });
      // Reset form
      setSelectedPatient(null);
      setSelectedAppointment('');
      setItems([]);
      setNotes('');
      setSearchPatient('');
      setIsExternalClient(false);
      setDiscountEnabled(false);
      setDiscountType('percentage');
      setDiscountValue('0');
      setDiscountReason('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al crear factura');
    },
  });

  const addServiceItem = (serviceId: string) => {
    const service = servicePrices?.find((s) => s.id === serviceId);
    if (!service) return;

    setItems([
      ...items,
      {
        item_type: 'servicio',
        item_id: service.id,
        description: service.service_name,
        quantity: 1,
        unit_price: Number(service.price),
        subtotal: Number(service.price),
      },
    ]);
  };

  const addProductItem = (productId: string) => {
    const product = inventoryItems?.find((p) => p.id === productId);
    if (!product) return;

    setItems([
      ...items,
      {
        item_type: 'producto',
        item_id: product.id,
        description: product.name,
        quantity: 1,
        unit_price: Number(product.unit_price),
        subtotal: Number(product.unit_price),
      },
    ]);
  };

  const addCustomProduct = () => {
    if (!customProductDescription.trim() || !customProductPrice || Number(customProductPrice) <= 0) {
      toast.error('Complete los campos requeridos');
      return;
    }

    setItems([
      ...items,
      {
        item_type: 'producto',
        item_id: undefined,
        description: customProductCode.trim() 
          ? `[${customProductCode.trim()}] ${customProductDescription.trim()}` 
          : customProductDescription.trim(),
        quantity: 1,
        unit_price: Number(customProductPrice),
        subtotal: Number(customProductPrice),
      },
    ]);

    // Limpiar y cerrar
    setCustomProductCode('');
    setCustomProductDescription('');
    setCustomProductPrice('');
    setCustomProductDialogOpen(false);
    toast.success('Producto personalizado agregado');
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    const newItems = [...items];
    newItems[index].quantity = quantity;
    newItems[index].subtotal = quantity * newItems[index].unit_price;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateDiscount = () => {
    if (!discountEnabled || !discountValue || Number(discountValue) === 0) return 0;
    
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    
    if (discountType === 'percentage') {
      const percentage = Math.min(Number(discountValue), 100);
      return (subtotal * percentage) / 100;
    } else {
      return Math.min(Number(discountValue), subtotal);
    }
  };

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = calculateDiscount();
  const total = subtotal - discountAmount;

  return (
    <div className="space-y-6">
      {/* Selección de paciente */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <Label>Buscar Paciente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre, apellido o código..."
                  value={searchPatient}
                  onChange={(e) => setSearchPatient(e.target.value)}
                  className="pl-10"
                />
              </div>
              {patients && patients.length > 0 && !selectedPatient && (
                <div className="mt-2 border rounded-md">
                  {patients.map((patient) => (
                    <button
                      key={patient.id}
                      onClick={() => {
                        setSelectedPatient(patient);
                        setSearchPatient('');
                        setIsExternalClient(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-muted"
                    >
                      {patient.first_name} {patient.last_name} - {patient.code}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!selectedPatient && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">O bien</span>
                </div>
              </div>
            )}

            {!selectedPatient && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={selectExternalClient}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Venta a Cliente Externo
              </Button>
            )}

            {selectedPatient && (
              <>
                <div className={`p-3 rounded-md ${isExternalClient ? 'bg-blue-50 border border-blue-200' : 'bg-muted'}`}>
                  <p className="font-medium">
                    {selectedPatient.first_name} {selectedPatient.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">Código: {selectedPatient.code}</p>
                  {isExternalClient && (
                    <p className="text-xs text-blue-600 mt-1">Venta directa sin paciente registrado</p>
                  )}
                </div>

                {!isExternalClient && (
                  <div>
                    <Label>Cita Relacionada (Opcional)</Label>
                    <Select value={selectedAppointment} onValueChange={setSelectedAppointment}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una cita" />
                      </SelectTrigger>
                      <SelectContent>
                        {appointments?.map((apt) => (
                          <SelectItem key={apt.id} value={apt.id}>
                            {apt.type} - {new Date(apt.starts_at).toLocaleDateString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Agregar items */}
      {selectedPatient && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label>Servicios</Label>
                  <Tabs value={serviceFilter} onValueChange={setServiceFilter} className="w-full mt-2">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="consulta">Consultas</TabsTrigger>
                      <TabsTrigger value="cirugia">Cirugías</TabsTrigger>
                      <TabsTrigger value="procedimiento">Procedimientos</TabsTrigger>
                      <TabsTrigger value="estudio">Exámenes</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <Select onValueChange={addServiceItem}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar servicio" />
                  </SelectTrigger>
                  <SelectContent>
                    {servicePrices
                      ?.filter((service) => service.service_type === serviceFilter)
                      .sort((a, b) => a.service_name.localeCompare(b.service_name))
                      .map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.service_name} - GTQ {Number(service.price).toFixed(2)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Productos</Label>
                <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className={`w-full justify-start mt-2 transition-all duration-300 ${
                        scanSuccess ? 'ring-2 ring-green-500 bg-green-50' : ''
                      }`}
                    >
                      {scanSuccess ? (
                        <Check className="mr-2 h-4 w-4 text-green-600 animate-scale-in" />
                      ) : (
                        <Search className="mr-2 h-4 w-4" />
                      )}
                      {scanSuccess ? 'Producto agregado ✓' : 'Buscar producto...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Escanear código o buscar..." 
                        value={productSearchTerm}
                        onValueChange={setProductSearchTerm}
                      />
                      <CommandList>
                        <CommandEmpty>No se encontraron productos</CommandEmpty>
                        <CommandGroup>
                          {inventoryItems
                            ?.filter(product => 
                              product.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                              product.code?.toLowerCase().includes(productSearchTerm.toLowerCase())
                            )
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((product) => (
                              <CommandItem
                                key={product.id}
                                value={`${product.code || ''} ${product.name}`.toLowerCase()}
                                onSelect={() => {
                                  addProductItem(product.id);
                                  setOpenProductSearch(false);
                                  setProductSearchTerm('');
                                }}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <div>
                                    <span className="font-medium">
                                      {product.code ? `[${product.code}] ` : ''}
                                      {product.name}
                                    </span>
                                    <span className="text-sm text-muted-foreground ml-2">
                                      Stock: {product.current_stock}
                                    </span>
                                  </div>
                                  <span className="font-medium">
                                    GTQ {Number(product.unit_price).toFixed(2)}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button 
                  variant="outline" 
                  className="w-full mt-2"
                  onClick={() => setCustomProductDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Producto Personalizado
                </Button>
              </div>

              {/* Lista de items */}
              {items.length > 0 && (
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 border rounded-md">
                      <div className="flex-1">
                        <p className="font-medium">{item.description}</p>
                        <p className="text-sm text-muted-foreground">
                          GTQ {item.unit_price.toFixed(2)} x {item.quantity}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItemQuantity(index, Number(e.target.value))}
                        className="w-20"
                      />
                      <p className="font-medium w-24 text-right">GTQ {item.subtotal.toFixed(2)}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {items.length > 0 && (
                <div className="flex justify-end pt-4 border-t">
                  <div className="text-right space-y-2">
                    <div className="flex justify-between gap-8">
                      <p className="text-sm text-muted-foreground">Subtotal</p>
                      <p className="font-medium">GTQ {subtotal.toFixed(2)}</p>
                    </div>
                    
                    {discountEnabled && discountAmount > 0 && (
                      <div className="flex justify-between gap-8 text-green-600">
                        <p className="text-sm">
                          Descuento ({discountType === 'percentage' ? `${discountValue}%` : 'Fijo'})
                        </p>
                        <p className="font-medium">-GTQ {discountAmount.toFixed(2)}</p>
                      </div>
                    )}
                    
                    <div className="flex justify-between gap-8 pt-2 border-t">
                      <p className="text-sm font-semibold">TOTAL</p>
                      <p className="text-2xl font-bold">GTQ {total.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Descuento */}
      {selectedPatient && items.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Aplicar Descuento</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="discount-toggle"
                    checked={discountEnabled}
                    onChange={(e) => setDiscountEnabled(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="discount-toggle" className="text-sm cursor-pointer">
                    Activar descuento
                  </label>
                </div>
              </div>

              {discountEnabled && (
                <div className="space-y-4 p-4 border rounded-md bg-blue-50">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Tipo de Descuento</Label>
                      <Select value={discountType} onValueChange={(value: 'percentage' | 'fixed') => setDiscountType(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                          <SelectItem value="fixed">Monto Fijo (GTQ)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Valor del Descuento</Label>
                      <Input
                        type="number"
                        min="0"
                        max={discountType === 'percentage' ? '100' : undefined}
                        step="0.01"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={discountType === 'percentage' ? 'Ej: 15' : 'Ej: 50.00'}
                      />
                      {discountType === 'percentage' && (
                        <p className="text-xs text-muted-foreground mt-1">Máximo 100%</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>Razón del Descuento *</Label>
                    <Textarea
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder="Ej: Paciente de escasos recursos, Descuento por cortesía médica, etc."
                      className="min-h-[60px]"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Este campo es obligatorio para fines de auditoría
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notas */}
      {selectedPatient && items.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div>
              <Label>Notas (Opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones adicionales..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Producto Personalizado */}
      <Dialog open={customProductDialogOpen} onOpenChange={setCustomProductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Producto Personalizado</DialogTitle>
            <DialogDescription>
              Ingrese los datos del producto que no está en el inventario
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="custom-code">Código (Opcional)</Label>
              <Input
                id="custom-code"
                value={customProductCode}
                onChange={(e) => setCustomProductCode(e.target.value)}
                placeholder="Ej: PROD-001"
              />
            </div>
            <div>
              <Label htmlFor="custom-description">Descripción *</Label>
              <Input
                id="custom-description"
                value={customProductDescription}
                onChange={(e) => setCustomProductDescription(e.target.value)}
                placeholder="Ej: Lentes de contacto"
              />
            </div>
            <div>
              <Label htmlFor="custom-price">Precio Unitario (GTQ) *</Label>
              <Input
                id="custom-price"
                type="number"
                min="0"
                step="0.01"
                value={customProductPrice}
                onChange={(e) => setCustomProductPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCustomProductDialogOpen(false);
                setCustomProductCode('');
                setCustomProductDescription('');
                setCustomProductPrice('');
              }}
            >
              Cancelar
            </Button>
            <Button onClick={addCustomProduct}>
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Botón crear */}
      {selectedPatient && items.length > 0 && (
        <Button
          onClick={() => createInvoice.mutate()}
          disabled={createInvoice.isPending}
          size="lg"
          className="w-full"
        >
          {createInvoice.isPending ? 'Creando...' : 'Crear Factura'}
        </Button>
      )}
    </div>
  );
}
