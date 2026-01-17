import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Info
} from 'lucide-react';
import JSZip from 'jszip';
import { FK_MAPPING, IMPORT_ORDER, AUTH_USER_TABLES, AUTH_USER_DIRECT_TABLES, AUTH_USER_INDIRECT_TABLES, AUTH_USER_STATS, generateSafeImportScript } from '@/lib/fkMapping';
import { toast } from '@/hooks/use-toast';

interface ValidationResult {
  tableName: string;
  totalRecords: number;
  validRecords: number;
  pendingRecords: { row: number; column: string; refTable: string; missingId: string }[];
  invalidRecords: { row: number; column: string; refTable: string; missingId: string }[];
  authUserRefs: { row: number; column: string; userId: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MigrationValidator({ open, onOpenChange }: Props) {
  const [isValidating, setIsValidating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTable, setCurrentTable] = useState('');
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [csvData, setCsvData] = useState<Record<string, any[]>>({});
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const parseCSV = (content: string): any[] => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row: any = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx];
        });
        rows.push(row);
      }
    }
    
    return rows;
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    
    return result;
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsValidating(true);
    setProgress(0);
    setResults([]);
    setCsvData({});

    try {
      const loadedData: Record<string, any[]> = {};

      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const csvFiles = Object.keys(zip.files).filter(name => name.endsWith('.csv'));
        
        for (let i = 0; i < csvFiles.length; i++) {
          const fileName = csvFiles[i];
          setCurrentTable(`Cargando ${fileName}...`);
          setProgress((i / csvFiles.length) * 50);
          
          const content = await zip.files[fileName].async('string');
          // Extract table name from filename (e.g., "01_branches.csv" -> "branches")
          const tableName = fileName.replace(/^\d+_/, '').replace('.csv', '').split('/').pop();
          if (tableName) {
            loadedData[tableName] = parseCSV(content);
          }
        }
      } else if (file.name.endsWith('.csv')) {
        const content = await file.text();
        const tableName = file.name.replace(/^\d+_/, '').replace('.csv', '');
        loadedData[tableName] = parseCSV(content);
      }

      setCsvData(loadedData);
      
      // Now validate
      await validateData(loadedData);
      
    } catch (error: any) {
      console.error('Error loading file:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cargar el archivo',
        variant: 'destructive'
      });
    } finally {
      setIsValidating(false);
      setProgress(100);
      setCurrentTable('');
    }
  }, []);

  const validateData = async (data: Record<string, any[]>) => {
    const validationResults: ValidationResult[] = [];
    const tableNames = Object.keys(data);
    
    for (let i = 0; i < tableNames.length; i++) {
      const tableName = tableNames[i];
      setCurrentTable(`Validando ${tableName}...`);
      setProgress(50 + (i / tableNames.length) * 50);
      
      const rows = data[tableName];
      const fks = FK_MAPPING[tableName] || [];
      
      const result: ValidationResult = {
        tableName,
        totalRecords: rows.length,
        validRecords: 0,
        pendingRecords: [],
        invalidRecords: [],
        authUserRefs: []
      };
      
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        let rowValid = true;
        
        for (const fk of fks) {
          const value = row[fk.column];
          
          // Skip null/empty values for nullable FKs
          if (!value || value === '' || value === 'null' || value === 'NULL') {
            continue;
          }
          
          // Check if it's a reference to auth.users
          if (fk.refTable === 'auth.users') {
            result.authUserRefs.push({
              row: rowIdx + 2, // +2 for 1-indexed and header row
              column: fk.column,
              userId: value
            });
            continue;
          }
          
          // Check if referenced table is in our loaded data
          const refData = data[fk.refTable];
          
          if (refData) {
            // Check if the ID exists in the referenced table
            const exists = refData.some(r => r[fk.refColumn] === value);
            if (!exists) {
              // Check if parent table comes later in import order
              const currentOrder = IMPORT_ORDER.indexOf(tableName);
              const refOrder = IMPORT_ORDER.indexOf(fk.refTable);
              
              if (refOrder > currentOrder || refOrder === -1) {
                result.pendingRecords.push({
                  row: rowIdx + 2,
                  column: fk.column,
                  refTable: fk.refTable,
                  missingId: value
                });
              } else {
                result.invalidRecords.push({
                  row: rowIdx + 2,
                  column: fk.column,
                  refTable: fk.refTable,
                  missingId: value
                });
              }
              rowValid = false;
            }
          } else {
            // Referenced table not in our data - mark as pending
            result.pendingRecords.push({
              row: rowIdx + 2,
              column: fk.column,
              refTable: fk.refTable,
              missingId: value
            });
            rowValid = false;
          }
        }
        
        if (rowValid) {
          result.validRecords++;
        }
      }
      
      validationResults.push(result);
    }
    
    setResults(validationResults);
  };

  const toggleExpanded = (tableName: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  const downloadReport = () => {
    const report = [
      '# REPORTE DE VALIDACIÓN DE MIGRACIÓN',
      `# Fecha: ${new Date().toISOString()}`,
      `# Total tablas analizadas: ${results.length}`,
      '',
      '## RESUMEN',
      '',
    ];

    let totalValid = 0;
    let totalPending = 0;
    let totalInvalid = 0;
    let totalAuthRefs = 0;

    for (const r of results) {
      totalValid += r.validRecords;
      totalPending += r.pendingRecords.length;
      totalInvalid += r.invalidRecords.length;
      totalAuthRefs += r.authUserRefs.length;
    }

    report.push(`✅ Registros válidos: ${totalValid}`);
    report.push(`⚠️ Registros pendientes (falta importar padre): ${totalPending}`);
    report.push(`❌ Registros inválidos (referencia no existe): ${totalInvalid}`);
    report.push(`🔐 Referencias a auth.users: ${totalAuthRefs}`);
    report.push('');
    report.push('## DETALLE POR TABLA');
    report.push('');

    for (const r of results) {
      report.push(`### ${r.tableName}`);
      report.push(`Total: ${r.totalRecords} | Válidos: ${r.validRecords} | Pendientes: ${r.pendingRecords.length} | Inválidos: ${r.invalidRecords.length} | Auth refs: ${r.authUserRefs.length}`);
      
      if (r.invalidRecords.length > 0) {
        report.push('');
        report.push('#### Registros Inválidos:');
        for (const inv of r.invalidRecords.slice(0, 10)) {
          report.push(`- Fila ${inv.row}: ${inv.column} = "${inv.missingId}" no existe en ${inv.refTable}`);
        }
        if (r.invalidRecords.length > 10) {
          report.push(`... y ${r.invalidRecords.length - 10} más`);
        }
      }
      
      if (r.pendingRecords.length > 0) {
        report.push('');
        report.push('#### Registros Pendientes (importar padre primero):');
        for (const pend of r.pendingRecords.slice(0, 5)) {
          report.push(`- Fila ${pend.row}: ${pend.column} requiere ${pend.refTable}`);
        }
        if (r.pendingRecords.length > 5) {
          report.push(`... y ${r.pendingRecords.length - 5} más`);
        }
      }
      
      report.push('');
    }

    const blob = new Blob([report.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migration_validation_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSafeImportScript = () => {
    const script = generateSafeImportScript();
    const blob = new Blob([script], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safe_import_script_${new Date().toISOString().split('T')[0]}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Script descargado',
      description: 'Ejecuta la Parte 1 antes de importar CSVs, y la Parte 2 después.'
    });
  };

  const totalStats = results.reduce((acc, r) => ({
    total: acc.total + r.totalRecords,
    valid: acc.valid + r.validRecords,
    pending: acc.pending + r.pendingRecords.length,
    invalid: acc.invalid + r.invalidRecords.length,
    authRefs: acc.authRefs + r.authUserRefs.length
  }), { total: 0, valid: 0, pending: 0, invalid: 0, authRefs: 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Validador de Migración (Dry-Run)
          </DialogTitle>
          <DialogDescription>
            Analiza los CSVs exportados para detectar referencias inválidas ANTES de importar. No modifica ningún dato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Section */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".zip,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
              disabled={isValidating}
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">
                  {isValidating ? 'Validando...' : 'Cargar ZIP de backup o CSV individual'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Arrastra aquí o haz clic para seleccionar
                </p>
              </div>
            </label>
          </div>

          {/* Progress */}
          {isValidating && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{currentTable}</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Results Summary */}
          {results.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card className="p-3">
                  <div className="text-2xl font-bold">{totalStats.total}</div>
                  <div className="text-xs text-muted-foreground">Total registros</div>
                </Card>
                <Card className="p-3 bg-green-500/10">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-2xl font-bold text-green-600">{totalStats.valid}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Válidos</div>
                </Card>
                <Card className="p-3 bg-amber-500/10">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-2xl font-bold text-amber-600">{totalStats.pending}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Pendientes</div>
                </Card>
                <Card className="p-3 bg-red-500/10">
                  <div className="flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-2xl font-bold text-red-600">{totalStats.invalid}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Inválidos</div>
                </Card>
                <Card className="p-3 bg-blue-500/10">
                  <div className="flex items-center gap-1">
                    <Info className="h-4 w-4 text-blue-600" />
                    <span className="text-2xl font-bold text-blue-600">{totalStats.authRefs}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Auth refs</div>
                </Card>
              </div>

              {/* Métricas de dependencias de auth.users */}
              <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-4">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-600" />
                  Dependencias de auth.users en el esquema
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/30 rounded">
                    <p className="text-xl font-bold text-blue-600">{AUTH_USER_STATS.directTables}</p>
                    <p className="text-xs text-muted-foreground">Tablas directas</p>
                  </div>
                  <div className="text-center p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded">
                    <p className="text-xl font-bold text-indigo-600">{AUTH_USER_STATS.indirectTables}</p>
                    <p className="text-xs text-muted-foreground">Tablas indirectas</p>
                  </div>
                  <div className="text-center p-2 bg-purple-50 dark:bg-purple-900/30 rounded">
                    <p className="text-xl font-bold text-purple-600">{AUTH_USER_STATS.totalColumns}</p>
                    <p className="text-xs text-muted-foreground">Columnas totales</p>
                  </div>
                </div>
              </div>

              {/* Info about auth.users */}
              {totalStats.authRefs > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="flex gap-2">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                        {totalStats.authRefs} referencias a auth.users detectadas en tus datos
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Asegúrate de ejecutar el script de migración de usuarios ANTES de importar los CSVs.
                        Esto creará los usuarios con los mismos UUIDs en el proyecto destino.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              {/* Table Results */}
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {results.map(r => (
                    <Collapsible 
                      key={r.tableName} 
                      open={expandedTables.has(r.tableName)}
                      onOpenChange={() => toggleExpanded(r.tableName)}
                    >
                      <CollapsibleTrigger asChild>
                        <Card className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ChevronDown className={`h-4 w-4 transition-transform ${expandedTables.has(r.tableName) ? 'rotate-180' : ''}`} />
                              <span className="font-medium">{r.tableName}</span>
                              <span className="text-sm text-muted-foreground">({r.totalRecords} registros)</span>
                            </div>
                            <div className="flex gap-2">
                              {r.validRecords === r.totalRecords && (
                                <Badge className="bg-green-500/20 text-green-700">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Todo OK
                                </Badge>
                              )}
                              {r.pendingRecords.length > 0 && (
                                <Badge variant="outline" className="border-amber-500 text-amber-600">
                                  ⚠️ {r.pendingRecords.length} pendientes
                                </Badge>
                              )}
                              {r.invalidRecords.length > 0 && (
                                <Badge variant="destructive">
                                  ❌ {r.invalidRecords.length} inválidos
                                </Badge>
                              )}
                              {r.authUserRefs.length > 0 && (
                                <Badge variant="outline" className="border-blue-500 text-blue-600">
                                  🔐 {r.authUserRefs.length}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Card>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-6 mt-2 space-y-2 text-sm">
                          {r.invalidRecords.slice(0, 5).map((inv, idx) => (
                            <div key={idx} className="bg-red-500/10 p-2 rounded flex gap-2">
                              <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                              <span>
                                Fila {inv.row}: <code className="bg-muted px-1 rounded">{inv.column}</code> = 
                                "<code className="text-red-600">{inv.missingId.substring(0, 20)}...</code>" 
                                no existe en <strong>{inv.refTable}</strong>
                              </span>
                            </div>
                          ))}
                          {r.invalidRecords.length > 5 && (
                            <p className="text-muted-foreground">... y {r.invalidRecords.length - 5} errores más</p>
                          )}
                          {r.pendingRecords.slice(0, 3).map((pend, idx) => (
                            <div key={idx} className="bg-amber-500/10 p-2 rounded flex gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                              <span>
                                Fila {pend.row}: requiere importar <strong>{pend.refTable}</strong> primero
                              </span>
                            </div>
                          ))}
                          {r.pendingRecords.length > 3 && (
                            <p className="text-muted-foreground">... y {r.pendingRecords.length - 3} pendientes más</p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </ScrollArea>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={downloadReport}>
                  <FileText className="h-4 w-4 mr-2" />
                  Descargar Reporte
                </Button>
                <Button onClick={downloadSafeImportScript}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Script SQL Seguro
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
