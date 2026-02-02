import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';
import { useBranch } from '@/hooks/useBranch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, XCircle, Upload, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const VALID_CATEGORIES = ['medicamento', 'gota', 'lente', 'aro', 'accesorio', 'otro'];

interface ParsedProduct {
  codigo: string;
  nombre: string;
  categoria: string;
  proveedor: string;
  precio_costo: number | null;
  precio_venta: number | null;
  stock_actual: number;
  stock_minimo: number;
  requiere_lote: boolean;
  notas: string;
}

interface ValidationResult {
  rowNumber: number;
  data: ParsedProduct;
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export default function BulkImportDialog({ open, onOpenChange }: BulkImportDialogProps) {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [hasFile, setHasFile] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'error'>('all');
  const [editingCell, setEditingCell] = useState<{ rowNumber: number; field: keyof ParsedProduct } | null>(null);

  // Fetch suppliers for validation
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        const data = await invoke<any[]>('get_suppliers');
        return (data || []).filter(s => s.active);
      }
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('active', true);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch existing product codes for duplicate validation
  const { data: existingCodes = [] } = useQuery({
    queryKey: ['existing-product-codes', currentBranch?.id, isLocalMode],
    queryFn: async () => {
      if (!currentBranch) return [];

      if (isLocalMode) {
        const items = await invoke<any[]>('get_inventory_items', { branchId: currentBranch.id });
        return items
          .filter(item => item.code)
          .map(item => item.code?.toLowerCase().trim())
          .filter(Boolean) as string[];
      }

      const { data } = await supabase
        .from('inventory_items')
        .select('code')
        .eq('branch_id', currentBranch.id)
        .not('code', 'is', null)
        .limit(5000);
      return data?.map(item => item.code?.toLowerCase().trim()).filter(Boolean) as string[] || [];
    },
    enabled: !!currentBranch,
  });

  // Track duplicate codes within the file being imported
  const [duplicateCodesInFile, setDuplicateCodesInFile] = useState<string[]>([]);

  const findSimilarCategory = (input: string): string | null => {
    const normalized = input.toLowerCase().trim();
    for (const cat of VALID_CATEGORIES) {
      if (cat.includes(normalized) || normalized.includes(cat.substring(0, 3))) {
        return cat;
      }
    }
    return null;
  };

  const findSimilarSupplier = (input: string): string | null => {
    const normalized = input.toLowerCase().trim();
    for (const supplier of suppliers) {
      const supplierNorm = supplier.name.toLowerCase();
      if (supplierNorm.includes(normalized) || normalized.includes(supplierNorm.substring(0, 3))) {
        return supplier.name;
      }
    }
    return null;
  };

  const validateRow = (row: ParsedProduct, rowNumber: number, fileDuplicates: string[] = []): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate nombre (required)
    if (!row.nombre || row.nombre.trim() === '') {
      errors.push('Nombre es requerido');
    }

    // Validate categoria (required, must be valid)
    if (!row.categoria || row.categoria.trim() === '') {
      errors.push('Categoría es requerida');
    } else if (!VALID_CATEGORIES.includes(row.categoria.toLowerCase().trim())) {
      const similar = findSimilarCategory(row.categoria);
      if (similar) {
        errors.push(`Categoría '${row.categoria}' no válida. ¿Quiso decir '${similar}'?`);
      } else {
        errors.push(`Categoría '${row.categoria}' no válida. Válidas: ${VALID_CATEGORIES.join(', ')}`);
      }
    }

    // Validate precio_venta (required, > 0)
    if (row.precio_venta === null || row.precio_venta === undefined || isNaN(row.precio_venta)) {
      errors.push('Precio de venta es requerido');
    } else if (row.precio_venta <= 0) {
      errors.push('Precio de venta debe ser mayor a 0');
    }

    // Validate codigo - check for duplicates in database
    if (row.codigo && row.codigo.trim() !== '') {
      const codeNormalized = row.codigo.toLowerCase().trim();
      
      // Check if code exists in database
      if (existingCodes.includes(codeNormalized)) {
        errors.push(`Código '${row.codigo}' ya existe en el inventario`);
      }
      
      // Check if code is duplicated within the file
      if (fileDuplicates.includes(codeNormalized)) {
        errors.push(`Código '${row.codigo}' está duplicado en el archivo`);
      }
    }

    // Validate proveedor (optional, but warn if not found)
    if (row.proveedor && row.proveedor.trim() !== '') {
      const supplierExists = suppliers.some(s => 
        s.name.toLowerCase() === row.proveedor.toLowerCase().trim()
      );
      if (!supplierExists) {
        const similar = findSimilarSupplier(row.proveedor);
        if (similar) {
          warnings.push(`Proveedor '${row.proveedor}' no encontrado. ¿Quiso decir '${similar}'?`);
        } else {
          warnings.push(`Proveedor '${row.proveedor}' no existe en el sistema`);
        }
      }
    }

    // Validate stock values
    if (row.stock_actual < 0) {
      errors.push('Stock actual no puede ser negativo');
    }
    if (row.stock_minimo < 0) {
      errors.push('Stock mínimo no puede ser negativo');
    }

    return {
      rowNumber,
      data: row,
      errors,
      warnings,
      isValid: errors.length === 0,
    };
  };

  const parseExcelFile = async (file: File): Promise<ParsedProduct[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          const products: ParsedProduct[] = jsonData.map((row: any) => ({
            codigo: String(row.codigo || row.Codigo || row.CODIGO || '').trim(),
            nombre: String(row.nombre || row.Nombre || row.NOMBRE || '').trim(),
            categoria: String(row.categoria || row.Categoria || row.CATEGORIA || '').trim().toLowerCase(),
            proveedor: String(row.proveedor || row.Proveedor || row.PROVEEDOR || '').trim(),
            precio_costo: parseFloat(row.precio_costo || row.precio_Costo || row.PRECIO_COSTO || row['precio costo'] || 0) || null,
            precio_venta: parseFloat(row.precio_venta || row.precio_Venta || row.PRECIO_VENTA || row['precio venta'] || 0) || null,
            stock_actual: parseInt(row.stock_actual || row.Stock_Actual || row.STOCK_ACTUAL || row['stock actual'] || 0) || 0,
            stock_minimo: parseInt(row.stock_minimo || row.Stock_Minimo || row.STOCK_MINIMO || row['stock minimo'] || 0) || 0,
            requiere_lote: ['si', 'sí', 'yes', 'true', '1'].includes(
              String(row.requiere_lote || row.Requiere_Lote || row.REQUIERE_LOTE || row['requiere lote'] || 'no').toLowerCase()
            ),
            notas: String(row.notas || row.Notas || row.NOTAS || '').trim(),
          }));

          resolve(products);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsBinaryString(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProgress(10);
    setHasFile(true);

    try {
      setProgress(30);
      const products = await parseExcelFile(file);
      
      setProgress(50);
      
      // Detect duplicate codes within the file
      const codeCount: Record<string, number> = {};
      products.forEach(p => {
        if (p.codigo && p.codigo.trim() !== '') {
          const code = p.codigo.toLowerCase().trim();
          codeCount[code] = (codeCount[code] || 0) + 1;
        }
      });
      const fileDuplicates = Object.keys(codeCount).filter(c => codeCount[c] > 1);
      setDuplicateCodesInFile(fileDuplicates);
      
      setProgress(70);
      
      // Validate each row with duplicate info
      const results = products.map((product, index) => 
        validateRow(product, index + 2, fileDuplicates) // +2 because row 1 is header, and we're 0-indexed
      );
      
      setProgress(100);
      setValidationResults(results);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Error al procesar el archivo');
      resetDialog();
    } finally {
      setIsProcessing(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async (validProducts: ParsedProduct[]) => {
      if (!currentBranch) throw new Error('No hay sucursal seleccionada');

      const productsToInsert = await Promise.all(validProducts.map(async (product) => {
        // Find supplier ID if exists
        let supplierId = null;
        if (product.proveedor) {
          const supplier = suppliers.find(s =>
            s.name.toLowerCase() === product.proveedor.toLowerCase().trim()
          );
          supplierId = supplier?.id || null;
        }

        return {
          branch_id: currentBranch.id,
          code: product.codigo || null,
          name: product.nombre,
          category: product.categoria.toLowerCase(),
          supplier_id: supplierId,
          cost_price: product.precio_costo,
          unit_price: product.precio_venta!,
          current_stock: product.stock_actual,
          min_stock: product.stock_minimo,
          requires_lot: product.requiere_lote,
          notes: product.notas || null,
          active: true,
        };
      }));

      if (isLocalMode) {
        // En modo local, insertar uno por uno usando Tauri
        for (const item of productsToInsert) {
          await invoke('create_inventory_item', { item });
        }
        return productsToInsert.length;
      }

      const { error } = await supabase
        .from('inventory_items')
        .insert(productsToInsert);

      if (error) throw error;
      return productsToInsert.length;
    },
    onSuccess: (count) => {
      toast.success(`Se importaron ${count} productos correctamente`);
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      resetDialog();
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error importing products:', error);
      toast.error('Error al importar productos');
    },
  });

  const handleImport = () => {
    const validProducts = validationResults
      .filter(r => r.isValid)
      .map(r => r.data);
    
    if (validProducts.length === 0) {
      toast.error('No hay productos válidos para importar');
      return;
    }

    importMutation.mutate(validProducts);
  };

  const resetDialog = () => {
    setValidationResults([]);
    setProgress(0);
    setHasFile(false);
    setIsProcessing(false);
    setStatusFilter('all');
    setEditingCell(null);
    setDuplicateCodesInFile([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const updateCellValue = (rowNumber: number, field: keyof ParsedProduct, value: string) => {
    setValidationResults(prev =>
      prev.map(result => {
        if (result.rowNumber === rowNumber) {
          let parsedValue: any = value;
          
          // Parse numeric fields
          if (field === 'precio_venta' || field === 'precio_costo') {
            parsedValue = parseFloat(value) || null;
          } else if (field === 'stock_actual' || field === 'stock_minimo') {
            parsedValue = parseInt(value) || 0;
          }
          
          const updatedData = { ...result.data, [field]: parsedValue };
          return validateRow(updatedData, rowNumber, duplicateCodesInFile);
        }
        return result;
      })
    );
    setEditingCell(null);
  };

  const EditableCell = ({ 
    result, 
    field, 
    displayValue, 
    isError = false,
    isWarning = false,
    isNumeric = false 
  }: { 
    result: ValidationResult; 
    field: keyof ParsedProduct; 
    displayValue: string;
    isError?: boolean;
    isWarning?: boolean;
    isNumeric?: boolean;
  }) => {
    const isEditing = editingCell?.rowNumber === result.rowNumber && editingCell?.field === field;
    const [tempValue, setTempValue] = useState(String(result.data[field] ?? ''));

    if (isEditing) {
      if (field === 'categoria') {
        return (
          <Select
            defaultValue={String(result.data.categoria)}
            onValueChange={(value) => updateCellValue(result.rowNumber, field, value)}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VALID_CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      
      const inputRef = useRef<HTMLInputElement>(null);
      
      const handleSave = () => {
        const value = inputRef.current?.value ?? tempValue;
        updateCellValue(result.rowNumber, field, value);
      };

      return (
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            autoFocus
            className="h-8 flex-1 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            type="text"
            inputMode={isNumeric ? 'decimal' : 'text'}
            defaultValue={tempValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSave();
              }
              if (e.key === 'Escape') {
                setEditingCell(null);
              }
            }}
          />
          <Button
            size="sm"
            className="h-8 px-2"
            onClick={handleSave}
          >
            OK
          </Button>
        </div>
      );
    }

    return (
      <span
        onClick={() => {
          setTempValue(String(result.data[field] ?? ''));
          setEditingCell({ rowNumber: result.rowNumber, field });
        }}
        className={`cursor-pointer hover:underline ${
          isError ? 'text-destructive font-semibold' : 
          isWarning ? 'text-yellow-600 font-medium' : ''
        } ${displayValue === '(vacío)' || displayValue === '-' ? 'opacity-60' : ''}`}
        title="Clic para editar"
      >
        {displayValue}
      </span>
    );
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetDialog();
    }
    onOpenChange(newOpen);
  };

  const validCount = validationResults.filter(r => r.isValid).length;
  const errorCount = validationResults.filter(r => !r.isValid).length;
  const warningCount = validationResults.filter(r => r.warnings.length > 0).length;

  const filteredResults = validationResults.filter(result => {
    if (statusFilter === 'valid') return result.isValid;
    if (statusFilter === 'error') return !result.isValid;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Productos desde Excel/CSV
          </DialogTitle>
          <DialogDescription>
            Sube un archivo Excel o CSV con los productos a importar. Las columnas requeridas son: nombre, categoria, precio_venta
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {!hasFile && (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">Selecciona un archivo Excel o CSV</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button onClick={() => fileInputRef.current?.click()}>
                Seleccionar archivo
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                Columnas: codigo, nombre*, categoria*, proveedor, precio_costo, precio_venta*, stock_actual, stock_minimo, requiere_lote, notas
              </p>
            </div>
          )}

        {isProcessing && (
          <div className="py-8">
            <p className="text-center mb-4">Procesando archivo...</p>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {hasFile && !isProcessing && validationResults.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline" className="flex items-center gap-1">
                <span className="font-semibold">{validationResults.length}</span> productos encontrados
              </Badge>
              <button
                onClick={() => setStatusFilter(statusFilter === 'valid' ? 'all' : 'valid')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium transition-all ${
                  statusFilter === 'valid' 
                    ? 'bg-green-600 text-white ring-2 ring-green-600 ring-offset-2' 
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                {validCount} válidos
              </button>
              {errorCount > 0 && (
                <button
                  onClick={() => setStatusFilter(statusFilter === 'error' ? 'all' : 'error')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium transition-all ${
                    statusFilter === 'error' 
                      ? 'bg-destructive text-destructive-foreground ring-2 ring-destructive ring-offset-2' 
                      : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  }`}
                >
                  <XCircle className="h-3 w-3" />
                  {errorCount} con errores
                </button>
              )}
              {warningCount > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1 bg-yellow-500 text-white">
                  <AlertTriangle className="h-3 w-3" />
                  {warningCount} con advertencias
                </Badge>
              )}
            </div>
            {statusFilter !== 'all' && (
              <p className="text-sm text-muted-foreground mb-2">
                Mostrando {filteredResults.length} de {validationResults.length} productos 
                (Filtro: {statusFilter === 'valid' ? 'Válidos' : 'Con errores'})
                <button 
                  onClick={() => setStatusFilter('all')} 
                  className="ml-2 text-primary underline hover:no-underline"
                >
                  Mostrar todos
                </button>
              </p>
            )}

            <div className="h-[400px] border rounded-lg overflow-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 sticky top-0 bg-background">#</TableHead>
                      <TableHead className="sticky top-0 bg-background">Código</TableHead>
                      <TableHead className="sticky top-0 bg-background">Nombre</TableHead>
                      <TableHead className="sticky top-0 bg-background">Categoría</TableHead>
                      <TableHead className="sticky top-0 bg-background">Proveedor</TableHead>
                      <TableHead className="text-right sticky top-0 bg-background">P. Costo</TableHead>
                      <TableHead className="text-right sticky top-0 bg-background">P. Venta</TableHead>
                      <TableHead className="text-right sticky top-0 bg-background">Stock</TableHead>
                      <TableHead className="w-40 sticky top-0 bg-background">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result) => (
                    <TableRow 
                      key={result.rowNumber}
                      className={
                        !result.isValid 
                          ? 'bg-destructive/10' 
                          : result.warnings.length > 0 
                            ? 'bg-yellow-500/10' 
                            : 'bg-green-500/10'
                      }
                    >
                      <TableCell className="font-mono text-xs">{result.rowNumber}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <EditableCell 
                          result={result} 
                          field="codigo" 
                          displayValue={result.data.codigo || '-'} 
                        />
                      </TableCell>
                      <TableCell>
                        <EditableCell 
                          result={result} 
                          field="nombre" 
                          displayValue={result.data.nombre || '(vacío)'} 
                          isError={!result.data.nombre}
                        />
                      </TableCell>
                      <TableCell>
                        <EditableCell 
                          result={result} 
                          field="categoria" 
                          displayValue={result.data.categoria || '(vacío)'} 
                          isError={result.errors.some(e => e.includes('Categoría'))}
                        />
                      </TableCell>
                      <TableCell>
                        <EditableCell 
                          result={result} 
                          field="proveedor" 
                          displayValue={result.data.proveedor || '-'} 
                          isWarning={result.warnings.some(w => w.includes('Proveedor'))}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <EditableCell 
                          result={result} 
                          field="precio_costo" 
                          displayValue={result.data.precio_costo ? `$${result.data.precio_costo.toFixed(2)}` : '-'} 
                          isNumeric
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <EditableCell 
                          result={result} 
                          field="precio_venta" 
                          displayValue={result.data.precio_venta ? `$${result.data.precio_venta.toFixed(2)}` : '(vacío)'} 
                          isError={result.errors.some(e => e.includes('Precio de venta'))}
                          isNumeric
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <EditableCell 
                          result={result} 
                          field="stock_actual" 
                          displayValue={String(result.data.stock_actual)} 
                          isNumeric
                        />
                      </TableCell>
                      <TableCell>
                        {result.isValid ? (
                          result.warnings.length > 0 ? (
                            <div className="flex items-center gap-1 text-yellow-600" title={result.warnings.join('\n')}>
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              <span className="text-xs">Advertencia</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              <span className="text-xs">OK</span>
                            </div>
                          )
                        ) : (
                          <div className="flex items-center gap-1 text-destructive" title={result.errors.join('\n')}>
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span className="text-xs">{result.errors[0]}</span>
                          </div>
                        )}
                      </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </div>
          </>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          {hasFile && !isProcessing && (
            <>
              <Button variant="outline" onClick={resetDialog}>
                Seleccionar otro archivo
              </Button>
              <Button 
                onClick={handleImport}
                disabled={validCount === 0 || importMutation.isPending}
              >
                {importMutation.isPending ? 'Importando...' : `Importar ${validCount} productos`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
