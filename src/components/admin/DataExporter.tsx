import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Download, 
  Database, 
  HardDrive, 
  FileArchive, 
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  FolderDown,
  FileCode,
  BookOpen,
  AlertTriangle,
  ExternalLink,
  FileText,
  Users,
  Shield,
  CheckCircle2,
  SearchCheck,
  Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { formatBytes } from '@/lib/utils';
import MigrationValidator from './MigrationValidator';

interface BucketInfo {
  bucket_id: string;
  total_files: number;
  total_bytes: number;
}

interface TableInfo {
  name: string;
  label: string;
  count: number;
}

const bucketLabels: Record<string, string> = {
  documents: 'Documentos',
  results: 'Resultados',
  studies: 'Estudios',
  surgeries: 'Cirugías',
};

// Orden correcto para importación respetando foreign keys
const IMPORT_ORDER = [
  { name: 'branches', label: 'Sedes', order: 1, deps: [] },
  { name: 'profiles', label: 'Perfiles de Usuario', order: 2, deps: ['auth.users'] },
  { name: 'user_roles', label: 'Roles de Usuario', order: 3, deps: ['profiles'] },
  { name: 'user_branches', label: 'Sedes de Usuario', order: 4, deps: ['profiles', 'branches'] },
  { name: 'rooms', label: 'Salas', order: 5, deps: ['branches'] },
  { name: 'suppliers', label: 'Proveedores', order: 6, deps: [] },
  { name: 'patients', label: 'Pacientes', order: 7, deps: [] },
  { name: 'service_prices', label: 'Precios de Servicios', order: 8, deps: [] },
  { name: 'study_types', label: 'Tipos de Estudio', order: 9, deps: [] },
  { name: 'surgery_types', label: 'Tipos de Cirugía', order: 10, deps: [] },
  { name: 'procedure_types', label: 'Tipos de Procedimiento', order: 11, deps: [] },
  { name: 'templates', label: 'Plantillas', order: 12, deps: [] },
  { name: 'app_settings', label: 'Configuración App', order: 13, deps: [] },
  { name: 'edge_function_settings', label: 'Config Edge Functions', order: 14, deps: [] },
  // CRM
  { name: 'crm_procedure_types', label: 'Tipos Procedimiento CRM', order: 15, deps: [] },
  { name: 'crm_pipelines', label: 'Pipelines CRM', order: 16, deps: ['patients', 'crm_procedure_types', 'profiles', 'branches'] },
  { name: 'crm_pipeline_stages', label: 'Etapas Pipeline CRM', order: 17, deps: ['crm_pipelines'] },
  { name: 'crm_pipeline_notes', label: 'Notas Pipeline CRM', order: 18, deps: ['crm_pipelines'] },
  { name: 'crm_activity_log', label: 'Actividad CRM', order: 19, deps: ['crm_pipelines', 'branches'] },
  { name: 'crm_activity_read', label: 'Lectura Actividad CRM', order: 20, deps: [] },
  // Inventario Sala
  { name: 'room_inventory_categories', label: 'Categorías Inv. Sala', order: 21, deps: ['branches'] },
  { name: 'room_inventory_items', label: 'Items Inv. Sala', order: 22, deps: ['room_inventory_categories', 'branches'] },
  { name: 'room_inventory_movements', label: 'Movimientos Inv. Sala', order: 23, deps: ['room_inventory_items', 'branches'] },
  // Inventario Caja
  { name: 'inventory_items', label: 'Inventario', order: 24, deps: ['branches', 'suppliers'] },
  { name: 'inventory_lots', label: 'Lotes de Inventario', order: 25, deps: ['inventory_items'] },
  // Citas y clínica
  { name: 'appointments', label: 'Citas', order: 26, deps: ['patients', 'rooms', 'branches', 'profiles'] },
  { name: 'schedule_blocks', label: 'Bloqueos de Agenda', order: 27, deps: ['branches', 'rooms', 'profiles'] },
  { name: 'encounters', label: 'Encuentros', order: 28, deps: ['patients', 'appointments', 'profiles'] },
  { name: 'exam_eye', label: 'Exámenes Oculares', order: 29, deps: ['encounters'] },
  { name: 'diagnoses', label: 'Diagnósticos', order: 30, deps: ['encounters'] },
  { name: 'surgeries', label: 'Cirugías', order: 31, deps: ['encounters'] },
  { name: 'surgery_files', label: 'Archivos de Cirugías', order: 32, deps: ['surgeries'] },
  { name: 'procedures', label: 'Procedimientos', order: 33, deps: ['encounters'] },
  { name: 'studies', label: 'Estudios', order: 34, deps: ['patients', 'appointments'] },
  { name: 'study_files', label: 'Archivos de Estudios', order: 35, deps: ['studies'] },
  { name: 'orders', label: 'Órdenes', order: 36, deps: ['encounters'] },
  { name: 'results', label: 'Resultados', order: 37, deps: ['orders'] },
  { name: 'documents', label: 'Documentos', order: 38, deps: ['encounters'] },
  // Facturación
  { name: 'invoices', label: 'Facturas', order: 39, deps: ['patients', 'appointments', 'branches'] },
  { name: 'invoice_items', label: 'Items de Factura', order: 40, deps: ['invoices'] },
  { name: 'payments', label: 'Pagos', order: 41, deps: ['invoices'] },
  { name: 'cash_closures', label: 'Cierres de Caja', order: 42, deps: ['branches'] },
  { name: 'inventory_movements', label: 'Movimientos Inv. Caja', order: 43, deps: ['inventory_items', 'inventory_lots', 'branches'] },
  // Sistema
  { name: 'audit_logs', label: 'Logs de Auditoría', order: 44, deps: [] },
  { name: 'pending_registrations', label: 'Registros Pendientes', order: 45, deps: [] },
];

export default function DataExporter() {
  const [downloadingBucket, setDownloadingBucket] = useState<string | null>(null);
  const [bucketProgress, setBucketProgress] = useState(0);
  const [exportingTable, setExportingTable] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportingAllCSV, setExportingAllCSV] = useState(false);
  const [tableExportProgress, setTableExportProgress] = useState(0);
  const [currentExportTable, setCurrentExportTable] = useState('');
  const [downloadingMigrations, setDownloadingMigrations] = useState(false);
  const [sqlExportProgress, setSqlExportProgress] = useState(0);
  const [sqlExportPhase, setSqlExportPhase] = useState('');
  const [showMigrationGuide, setShowMigrationGuide] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [exportAsCSV, setExportAsCSV] = useState(true); // Default to CSV
  const [exportingUserScript, setExportingUserScript] = useState(false);
  const [exportingEdgeFunctions, setExportingEdgeFunctions] = useState(false);
  const [showMigrationValidator, setShowMigrationValidator] = useState(false);
  const [exportingConsolidated, setExportingConsolidated] = useState(false);
  const [exportingTableSQL, setExportingTableSQL] = useState<string | null>(null);

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Fetch storage stats
  const { data: bucketStats = [] } = useQuery({
    queryKey: ['storage-stats-export'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_storage_stats');
      if (error) throw error;
      return (data || []) as unknown as BucketInfo[];
    },
    refetchInterval: 60000,
  });

  // Complete list of all 45 tables grouped by category
  const tableDefinitions = [
    // Clínicos
    { name: 'patients', label: 'Pacientes', category: 'Clínicos' },
    { name: 'appointments', label: 'Citas', category: 'Clínicos' },
    { name: 'encounters', label: 'Encuentros', category: 'Clínicos' },
    { name: 'exam_eye', label: 'Exámenes Oculares', category: 'Clínicos' },
    { name: 'diagnoses', label: 'Diagnósticos', category: 'Clínicos' },
    { name: 'surgeries', label: 'Cirugías', category: 'Clínicos' },
    { name: 'procedures', label: 'Procedimientos', category: 'Clínicos' },
    { name: 'studies', label: 'Estudios', category: 'Clínicos' },
    // Archivos
    { name: 'surgery_files', label: 'Archivos de Cirugías', category: 'Archivos' },
    { name: 'study_files', label: 'Archivos de Estudios', category: 'Archivos' },
    { name: 'documents', label: 'Documentos', category: 'Archivos' },
    { name: 'results', label: 'Resultados', category: 'Archivos' },
    { name: 'orders', label: 'Órdenes', category: 'Archivos' },
    // Facturación
    { name: 'invoices', label: 'Facturas', category: 'Facturación' },
    { name: 'invoice_items', label: 'Items de Factura', category: 'Facturación' },
    { name: 'payments', label: 'Pagos', category: 'Facturación' },
    { name: 'cash_closures', label: 'Cierres de Caja', category: 'Facturación' },
    // Inventario Caja
    { name: 'inventory_items', label: 'Inventario', category: 'Inventario Caja' },
    { name: 'inventory_lots', label: 'Lotes de Inventario', category: 'Inventario Caja' },
    { name: 'inventory_movements', label: 'Movimientos Inv. Caja', category: 'Inventario Caja' },
    { name: 'suppliers', label: 'Proveedores', category: 'Inventario Caja' },
    // Inventario Sala
    { name: 'room_inventory_categories', label: 'Categorías Inv. Sala', category: 'Inventario Sala' },
    { name: 'room_inventory_items', label: 'Items Inv. Sala', category: 'Inventario Sala' },
    { name: 'room_inventory_movements', label: 'Movimientos Inv. Sala', category: 'Inventario Sala' },
    // CRM
    { name: 'crm_procedure_types', label: 'Tipos Procedimiento CRM', category: 'CRM' },
    { name: 'crm_pipelines', label: 'Pipelines CRM', category: 'CRM' },
    { name: 'crm_pipeline_stages', label: 'Etapas Pipeline CRM', category: 'CRM' },
    { name: 'crm_pipeline_notes', label: 'Notas Pipeline CRM', category: 'CRM' },
    { name: 'crm_activity_log', label: 'Actividad CRM', category: 'CRM' },
    { name: 'crm_activity_read', label: 'Lectura Actividad CRM', category: 'CRM' },
    // Configuración
    { name: 'profiles', label: 'Perfiles de Usuario', category: 'Configuración' },
    { name: 'user_roles', label: 'Roles de Usuario', category: 'Configuración' },
    { name: 'user_branches', label: 'Sedes de Usuario', category: 'Configuración' },
    { name: 'branches', label: 'Sedes', category: 'Configuración' },
    { name: 'rooms', label: 'Salas', category: 'Configuración' },
    { name: 'service_prices', label: 'Precios de Servicios', category: 'Configuración' },
    // Catálogos
    { name: 'study_types', label: 'Tipos de Estudio', category: 'Catálogos' },
    { name: 'surgery_types', label: 'Tipos de Cirugía', category: 'Catálogos' },
    { name: 'procedure_types', label: 'Tipos de Procedimiento', category: 'Catálogos' },
    { name: 'templates', label: 'Plantillas', category: 'Catálogos' },
    // Sistema
    { name: 'schedule_blocks', label: 'Bloqueos de Agenda', category: 'Sistema' },
    { name: 'audit_logs', label: 'Logs de Auditoría', category: 'Sistema' },
    { name: 'pending_registrations', label: 'Registros Pendientes', category: 'Sistema' },
    { name: 'app_settings', label: 'Configuración App', category: 'Sistema' },
    { name: 'edge_function_settings', label: 'Config Edge Functions', category: 'Sistema' },
  ];

  // Fetch table counts
  const { data: tableCounts = [] } = useQuery({
    queryKey: ['table-counts-export'],
    queryFn: async () => {
      const tables: TableInfo[] = [];
      
      for (const def of tableDefinitions) {
        try {
          const { count } = await supabase.from(def.name as any).select('*', { count: 'exact', head: true });
          tables.push({ name: def.name, label: def.label, count: count || 0 });
        } catch (e) {
          tables.push({ name: def.name, label: def.label, count: 0 });
        }
      }
      
      return tables;
    },
    refetchInterval: 60000,
  });

  const downloadBucket = async (bucketId: string) => {
    setDownloadingBucket(bucketId);
    setBucketProgress(0);
    
    const BATCH_SIZE = 3;
    const MAX_RETRIES = 3;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No hay sesión activa');

      // Get list of files from bucket
      const { data: files, error: listError } = await supabase.storage
        .from(bucketId)
        .list('', { limit: 10000 });

      if (listError) throw listError;
      if (!files || files.length === 0) {
        toast({ title: 'Bucket vacío', description: `No hay archivos en ${bucketLabels[bucketId]}` });
        return;
      }

      // For buckets with folders, we need to list recursively
      const allFiles: { path: string }[] = [];
      
      const listRecursive = async (prefix: string = '') => {
        const { data, error } = await supabase.storage
          .from(bucketId)
          .list(prefix, { limit: 10000 });
        
        if (error) throw error;
        
        for (const item of data || []) {
          const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id) {
            allFiles.push({ path: fullPath });
          } else {
            await listRecursive(fullPath);
          }
        }
      };

      await listRecursive();

      if (allFiles.length === 0) {
        toast({ title: 'Bucket vacío', description: `No hay archivos en ${bucketLabels[bucketId]}` });
        return;
      }

      // Create ZIP with actual files
      const zip = new JSZip();
      let processed = 0;
      const successFiles: { path: string; size: number }[] = [];
      const failedFiles: { path: string; error: string }[] = [];
      const startTime = new Date();

      toast({
        title: 'Descargando archivos...',
        description: `Preparando ${allFiles.length} archivos (batches de ${BATCH_SIZE})`,
      });

      // Download file with retries
      const downloadWithRetry = async (filePath: string): Promise<{ data: Blob | null; error: string | null }> => {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const { data: fileData, error: downloadError } = await supabase.storage
              .from(bucketId)
              .download(filePath);
            
            if (downloadError) {
              if (attempt === MAX_RETRIES) {
                return { data: null, error: downloadError.message };
              }
              await new Promise(r => setTimeout(r, 500 * attempt)); // Backoff
              continue;
            }
            
            return { data: fileData, error: null };
          } catch (err: any) {
            if (attempt === MAX_RETRIES) {
              return { data: null, error: err.message || 'Error desconocido' };
            }
            await new Promise(r => setTimeout(r, 500 * attempt));
          }
        }
        return { data: null, error: 'Max reintentos alcanzados' };
      };

      // Process in batches of 3
      for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
        const batch = allFiles.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.all(
          batch.map(async (file) => {
            const result = await downloadWithRetry(file.path);
            return { path: file.path, ...result };
          })
        );

        for (const result of results) {
          if (result.data) {
            zip.file(result.path, result.data);
            successFiles.push({ path: result.path, size: result.data.size });
          } else {
            failedFiles.push({ path: result.path, error: result.error || 'Error desconocido' });
            console.error(`Error descargando ${result.path}:`, result.error);
          }
          processed++;
          setBucketProgress((processed / allFiles.length) * 100);
        }
      }

      // Generate MANIFEST.txt
      const endTime = new Date();
      const manifestContent = [
        `# Exportación de bucket: ${bucketId}`,
        `# Bucket label: ${bucketLabels[bucketId]}`,
        `# Fecha inicio: ${startTime.toISOString()}`,
        `# Fecha fin: ${endTime.toISOString()}`,
        `# Duración: ${Math.round((endTime.getTime() - startTime.getTime()) / 1000)} segundos`,
        `# Total archivos esperados: ${allFiles.length}`,
        `# Archivos exitosos: ${successFiles.length}`,
        `# Archivos fallidos: ${failedFiles.length}`,
        ``,
        `## ARCHIVOS INCLUIDOS EN ESTE ZIP:`,
        ``,
        ...successFiles.map(f => `✓ ${f.path} (${formatBytes(f.size)})`),
      ].join('\n');
      
      zip.file('_MANIFEST.txt', manifestContent);

      // Generate ERRORS.txt if there were failures
      if (failedFiles.length > 0) {
        const errorsContent = [
          `# ERRORES DE EXPORTACIÓN - ${bucketId}`,
          `# Fecha: ${new Date().toISOString()}`,
          `# IMPORTANTE: Estos archivos NO están incluidos en el ZIP`,
          `# Deberás descargarlos manualmente o reintentar la exportación`,
          ``,
          `## ARCHIVOS FALTANTES (${failedFiles.length}):`,
          ``,
          ...failedFiles.map(f => `✗ ${f.path}\n  Error: ${f.error}`),
        ].join('\n');
        
        zip.file('_ERRORS.txt', errorsContent);
      }

      // Generate and download the ZIP
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bucketId}_export_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: failedFiles.length > 0 ? 'Exportación parcial' : 'Exportación completada',
        description: failedFiles.length > 0 
          ? `ZIP: ${successFiles.length} archivos (${formatBytes(zipBlob.size)}). ${failedFiles.length} fallaron - ver _ERRORS.txt`
          : `ZIP: ${successFiles.length} archivos (${formatBytes(zipBlob.size)}). Incluye _MANIFEST.txt`,
        variant: failedFiles.length > 0 ? 'destructive' : 'default',
      });
    } catch (error: any) {
      console.error('Error downloading bucket:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo exportar el bucket',
        variant: 'destructive',
      });
    } finally {
      setDownloadingBucket(null);
      setBucketProgress(0);
    }
  };

  // Convert data to CSV string
  const dataToCSV = (data: any[]): string => {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows: string[] = [];
    
    // Header row
    csvRows.push(headers.map(h => `"${h}"`).join(','));
    
    // Data rows
    for (const row of data) {
      const values = headers.map(h => {
        let val = row[h];
        // NULL values must be completely empty (no quotes) for PostgreSQL to interpret as NULL
        // This is critical for UUID columns like item_id in invoice_items
        if (val === null || val === undefined) {
          return '';
        }
        // Empty strings should also be exported without quotes for UUID compatibility
        if (val === '') {
          return '';
        }
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
        // Escape quotes and wrap in quotes for non-null values
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  };

  // Convert data to SQL INSERT statements - handles NULL values correctly for UUID columns
  const dataToSQL = (data: any[], tableName: string): string => {
    if (!data || data.length === 0) return '';
    
    const columns = Object.keys(data[0]);
    const statements: string[] = [];
    
    // Add header comment
    statements.push(`-- Exportación de ${tableName}`);
    statements.push(`-- Fecha: ${new Date().toISOString()}`);
    statements.push(`-- Total registros: ${data.length}`);
    statements.push(`-- IMPORTANTE: Este archivo usa NULL literal para valores nulos (compatible con UUID)`);
    statements.push('');
    
    for (const row of data) {
      const values = columns.map(col => {
        const val = row[col];
        
        // NULL values - return SQL NULL literal
        if (val === null || val === undefined) {
          return 'NULL';
        }
        
        // Empty strings should also be NULL for UUID columns
        if (val === '') {
          return 'NULL';
        }
        
        // Boolean values
        if (typeof val === 'boolean') {
          return val ? 'TRUE' : 'FALSE';
        }
        
        // Numeric values
        if (typeof val === 'number') {
          return val.toString();
        }
        
        // Object values (JSON)
        if (typeof val === 'object') {
          const jsonStr = JSON.stringify(val).replace(/'/g, "''");
          return `'${jsonStr}'`;
        }
        
        // String values - escape single quotes
        const strVal = String(val).replace(/'/g, "''");
        return `'${strVal}'`;
      });
      
      statements.push(
        `INSERT INTO public.${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`
      );
    }
    
    return statements.join('\n');
  };

  // Export a single table as SQL INSERT statements (with pagination to bypass 1000 row limit)
  const exportTableAsSQL = async (tableName: string) => {
    setExportingTableSQL(tableName);
    
    try {
      // Fetch ALL records using pagination (Supabase has 1000 row limit per query)
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from(tableName as any)
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .order('id');

        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          page++;
          hasMore = data.length === pageSize; // If less than pageSize, no more pages
        } else {
          hasMore = false;
        }
      }

      if (allData.length === 0) {
        toast({ title: 'Sin datos', description: `La tabla ${tableName} está vacía` });
        return;
      }

      const sqlContent = dataToSQL(allData, tableName);
      const blob = new Blob([sqlContent], { type: 'text/sql;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}_export_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Exportación SQL completada',
        description: `${allData.length} registros exportados como INSERT statements`,
      });
    } catch (error: any) {
      console.error('Error exporting table as SQL:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo exportar la tabla',
        variant: 'destructive',
      });
    } finally {
      setExportingTableSQL(null);
    }
  };

  const exportTable = async (tableName: string, asCSV?: boolean) => {
    const useCSV = asCSV !== undefined ? asCSV : exportAsCSV;
    setExportingTable(tableName);
    
    try {
      // Fetch all data from table
      const { data, error } = await supabase
        .from(tableName as any)
        .select('*')
        .limit(50000); // Safety limit

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: 'Sin datos', description: `La tabla ${tableName} está vacía` });
        return;
      }

      if (useCSV) {
        // Export as CSV
        const csvContent = dataToCSV(data);
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tableName}_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        // Create Excel workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, tableName);
        XLSX.writeFile(wb, `${tableName}_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      }

      toast({
        title: 'Exportación completada',
        description: `${data.length} registros exportados de ${tableName}`,
      });
    } catch (error: any) {
      console.error('Error exporting table:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo exportar la tabla',
        variant: 'destructive',
      });
    } finally {
      setExportingTable(null);
    }
  };

  const exportAllData = async () => {
    setExportingAll(true);
    
    try {
      const wb = XLSX.utils.book_new();
      
      // Export all 34 tables in order
      for (const table of IMPORT_ORDER) {
        try {
          const { data } = await supabase
            .from(table.name as any)
            .select('*')
            .limit(50000);
          
          if (data && data.length > 0) {
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, table.name.substring(0, 31)); // Excel limit
          }
        } catch (e) {
          console.warn(`Could not export ${table.name}:`, e);
        }
      }
      
      XLSX.writeFile(wb, `centrovision_backup_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast({
        title: 'Backup completo',
        description: 'Todas las tablas han sido exportadas exitosamente',
      });
    } catch (error: any) {
      console.error('Error exporting all:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo completar la exportación',
        variant: 'destructive',
      });
    } finally {
      setExportingAll(false);
    }
  };

  // NOTE: checkOrphanRecords function was REMOVED - it was causing critical data loss

  // NOTE: cleanOrphanRecords function was REMOVED - it was causing critical data loss

  // Export all tables as individual CSVs in a ZIP
  const exportAllAsCSV = async () => {
    setExportingAllCSV(true);
    setTableExportProgress(0);
    setCurrentExportTable('Preparando exportación...');
    
    try {
      // NOTE: Orphan cleanup was removed - it was causing critical data loss
      const zip = new JSZip();
      const exportDate = new Date().toISOString().split('T')[0];
      const exportTime = new Date().toISOString();
      const results: { table: string; count: number; success: boolean; error?: string }[] = [];

      toast({
        title: 'Exportando datos...',
        description: `Preparando ${IMPORT_ORDER.length} tablas en formato CSV`,
      });

      // Export each table
      for (let i = 0; i < IMPORT_ORDER.length; i++) {
        const table = IMPORT_ORDER[i];
        setCurrentExportTable(table.label);
        setTableExportProgress(((i) / IMPORT_ORDER.length) * 100);
        
        try {
          // Fetch ALL records using pagination (no 1000-row limit)
          const PAGE_SIZE = 1000;
          let allData: any[] = [];
          let offset = 0;
          let hasMore = true;
          let pageCount = 0;

          while (hasMore) {
            const { data, error } = await supabase
              .from(table.name as any)
              .select('*')
              .range(offset, offset + PAGE_SIZE - 1);
            
            if (error) {
              results.push({ table: table.name, count: 0, success: false, error: error.message });
              hasMore = false;
              continue;
            }
            
            if (data && data.length > 0) {
              allData = [...allData, ...data];
              offset += PAGE_SIZE;
              pageCount++;
              hasMore = data.length === PAGE_SIZE;
              
              // Update progress with page info
              if (pageCount > 1) {
                setCurrentExportTable(`${table.label} (página ${pageCount}, ${allData.length} registros)`);
              }
            } else {
              hasMore = false;
            }
          }
          
          if (allData.length > 0) {
            const csvContent = dataToCSV(allData);
            // Add order number prefix for easy sorting
            const fileName = `${String(table.order).padStart(2, '0')}_${table.name}.csv`;
            zip.file(`data/${fileName}`, '\ufeff' + csvContent);
            results.push({ table: table.name, count: allData.length, success: true });
          } else {
            results.push({ table: table.name, count: 0, success: true });
          }
        } catch (e: any) {
          console.warn(`Could not export ${table.name}:`, e);
          results.push({ table: table.name, count: 0, success: false, error: e.message });
        }
        
        setTableExportProgress(((i + 1) / IMPORT_ORDER.length) * 100);
      }

      // Generate _IMPORT_ORDER.txt
      const importOrderContent = [
        `# ORDEN DE IMPORTACIÓN DE DATOS - CentroVisión`,
        `# Fecha de exportación: ${exportTime}`,
        `#`,
        `# IMPORTANTE: Importar las tablas EN ESTE ORDEN para respetar las`,
        `# claves foráneas (foreign keys) y evitar errores.`,
        `#`,
        `# Método de importación recomendado:`,
        `# 1. En Supabase Dashboard: Table Editor → Seleccionar tabla → Import data from CSV`,
        `# 2. O usando psql: \\copy tablename FROM 'archivo.csv' WITH CSV HEADER`,
        `#`,
        `# ========================================`,
        ``,
        ...IMPORT_ORDER.map(t => {
          const result = results.find(r => r.table === t.name);
          const count = result?.count || 0;
          const status = result?.success ? '✓' : '✗';
          return `${String(t.order).padStart(2, '0')}. ${status} ${t.name.padEnd(25)} | ${t.label.padEnd(25)} | ${count} registros${t.deps.length > 0 ? ` | Deps: ${t.deps.join(', ')}` : ''}`;
        }),
        ``,
        `# ========================================`,
        `# Resumen:`,
        `# - Tablas exportadas exitosamente: ${results.filter(r => r.success).length}`,
        `# - Tablas con errores: ${results.filter(r => !r.success).length}`,
        `# - Total registros: ${results.reduce((sum, r) => sum + r.count, 0)}`,
      ].join('\n');
      
      zip.file('_IMPORT_ORDER.txt', importOrderContent);

      // Generate _README.txt
      const readmeContent = [
        `# BACKUP DE DATOS - CentroVisión`,
        `# ================================`,
        ``,
        `Fecha de exportación: ${exportTime}`,
        ``,
        `## CONTENIDO DEL ZIP:`,
        ``,
        `📁 data/`,
        `   └── XX_tablename.csv  (archivos CSV numerados en orden de importación)`,
        ``,
        `📄 _IMPORT_ORDER.txt     (orden correcto de importación)`,
        `📄 _README.txt           (este archivo)`,
        ``,
        `## CÓMO IMPORTAR LOS DATOS:`,
        ``,
        `### Opción 1: Supabase Dashboard (Más fácil)`,
        `1. Ve a Table Editor en tu proyecto Supabase`,
        `2. Selecciona cada tabla en el orden indicado en _IMPORT_ORDER.txt`,
        `3. Click en "Import data from CSV"`,
        `4. Sube el archivo CSV correspondiente`,
        `5. Asegúrate de que los tipos de datos coincidan`,
        ``,
        `### Opción 2: Línea de comandos (psql)`,
        `Para cada archivo en orden:`,
        `  psql -h HOST -U postgres -d postgres -c "\\copy tablename FROM 'XX_tablename.csv' WITH CSV HEADER"`,
        ``,
        `### Opción 3: Script SQL`,
        `Puedes generar statements INSERT desde los CSVs usando herramientas`,
        `como csv2sql o importar directamente con pgAdmin.`,
        ``,
        `## NOTAS IMPORTANTES:`,
        ``,
        `⚠️ IMPORTAR EN ORDEN: Las tablas tienen dependencias (foreign keys).`,
        `   Importar fuera de orden causará errores de constraint.`,
        ``,
        `⚠️ USUARIOS: Las contraseñas NO se exportan por seguridad.`,
        `   Los usuarios deberán resetear sus contraseñas.`,
        ``,
        `⚠️ ARCHIVOS: Este backup solo contiene DATOS de las tablas.`,
        `   Los archivos de storage (imágenes, PDFs) deben exportarse`,
        `   por separado usando la opción "Exportar bucket".`,
        ``,
        `⚠️ ESTRUCTURA: Este backup NO incluye el esquema de la base de datos.`,
        `   Primero debes ejecutar las migraciones SQL para crear las tablas.`,
        ``,
        `## SOPORTE:`,
        ``,
        `Si tienes problemas importando los datos, revisa:`,
        `1. Que las tablas existan (ejecutar migraciones primero)`,
        `2. Que estés importando en el orden correcto`,
        `3. Que los tipos de datos del CSV coincidan con la tabla`,
        ``,
      ].join('\n');
      
      zip.file('_README.txt', readmeContent);

      // Generate the ZIP
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `centrovision_data_${exportDate}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      const failedCount = results.filter(r => !r.success).length;
      toast({
        title: failedCount > 0 ? 'Exportación parcial' : 'Exportación completada',
        description: `ZIP con ${results.filter(r => r.success).length} CSVs (${formatBytes(zipBlob.size)})${failedCount > 0 ? `. ${failedCount} tablas fallaron.` : ''}`,
        variant: failedCount > 0 ? 'destructive' : 'default',
      });
    } catch (error: any) {
      console.error('Error exporting all as CSV:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo completar la exportación',
        variant: 'destructive',
      });
    } finally {
      setExportingAllCSV(false);
      setTableExportProgress(0);
      setCurrentExportTable('');
    }
  };

  // Export user creation script for migration
  const exportUserScript = async () => {
    setExportingUserScript(true);
    
    try {
      // Fetch profiles with roles and branches
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*');
      
      if (profilesError) throw profilesError;

      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      
      if (rolesError) throw rolesError;

      const { data: userBranches, error: branchesError } = await supabase
        .from('user_branches')
        .select('*, branches(name)');
      
      if (branchesError) throw branchesError;

      // Build user mapping with all their data
      const userMapping = profiles?.map(profile => {
        const roles = userRoles?.filter(r => r.user_id === profile.user_id).map(r => r.role) || [];
        const branches = userBranches?.filter(b => b.user_id === profile.user_id).map(b => ({
          branch_id: b.branch_id,
          branch_name: (b.branches as any)?.name || 'Unknown'
        })) || [];
        
        return {
          user_id: profile.user_id,
          email: profile.email,
          full_name: profile.full_name,
          specialty: profile.specialty,
          gender: profile.gender,
          roles,
          branches
        };
      }) || [];

      // Generate JavaScript/Node.js script
      const scriptContent = `/**
 * SCRIPT DE CREACIÓN DE USUARIOS - CentroVisión
 * =============================================
 * 
 * Este script crea usuarios en tu NUEVO proyecto Supabase
 * preservando los UUIDs originales para que las relaciones
 * en la base de datos funcionen correctamente.
 * 
 * INSTRUCCIONES:
 * 1. Instala Node.js si no lo tienes: https://nodejs.org
 * 2. Crea una carpeta y copia este archivo ahí
 * 3. Ejecuta: npm init -y
 * 4. Ejecuta: npm install @supabase/supabase-js
 * 5. Edita las variables SUPABASE_URL y SERVICE_ROLE_KEY con los valores de tu NUEVO proyecto
 * 6. Ejecuta: node create_users.js
 * 
 * IMPORTANTE: 
 * - Usa el SERVICE_ROLE_KEY, NO el anon key
 * - Este script debe ejecutarse ANTES de importar los CSVs
 * - Los usuarios serán creados con contraseña temporal "012026"
 * - Pide a cada usuario que use "Olvidé mi contraseña" después
 * 
 * Fecha de exportación: ${new Date().toISOString()}
 */

const { createClient } = require('@supabase/supabase-js');

// ⚠️ EDITA ESTOS VALORES con los de tu NUEVO proyecto Supabase
const SUPABASE_URL = 'https://TU-NUEVO-PROYECTO.supabase.co';
const SERVICE_ROLE_KEY = 'tu-service-role-key-del-nuevo-proyecto';

// Contraseña temporal para todos los usuarios
const TEMP_PASSWORD = '012026';

// Datos de usuarios exportados (NO MODIFICAR)
const USERS = ${JSON.stringify(userMapping, null, 2)};

async function main() {
  console.log('\\n🚀 Iniciando creación de usuarios...\\n');
  
  if (SUPABASE_URL.includes('TU-NUEVO-PROYECTO')) {
    console.error('❌ ERROR: Debes editar SUPABASE_URL con la URL de tu nuevo proyecto');
    process.exit(1);
  }
  
  if (SERVICE_ROLE_KEY.includes('tu-service-role-key')) {
    console.error('❌ ERROR: Debes editar SERVICE_ROLE_KEY con la clave de tu nuevo proyecto');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  let created = 0;
  let failed = 0;
  const errors = [];

  for (const user of USERS) {
    try {
      console.log(\`📝 Creando: \${user.email} (\${user.full_name})...\`);
      
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: TEMP_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: user.full_name
        },
        // Esto preserva el UUID original
        id: user.user_id
      });

      if (error) {
        if (error.message.includes('already been registered')) {
          console.log(\`   ⚠️ Usuario ya existe, saltando...\`);
        } else {
          throw error;
        }
      } else {
        console.log(\`   ✅ Creado exitosamente\`);
        created++;
      }
    } catch (err) {
      console.error(\`   ❌ Error: \${err.message}\`);
      errors.push({ email: user.email, error: err.message });
      failed++;
    }
  }

  console.log('\\n========================================');
  console.log(\`✅ Usuarios creados: \${created}\`);
  console.log(\`❌ Usuarios fallidos: \${failed}\`);
  console.log(\`📊 Total procesados: \${USERS.length}\`);
  
  if (errors.length > 0) {
    console.log('\\n⚠️ Errores encontrados:');
    errors.forEach(e => console.log(\`   - \${e.email}: \${e.error}\`));
  }
  
  console.log('\\n🎉 ¡Proceso completado!');
  console.log('\\n📌 SIGUIENTE PASO: Importa los CSVs en el orden indicado en _IMPORT_ORDER.txt');
  console.log('📌 RECUERDA: Pide a los usuarios que reseteen su contraseña\\n');
}

main().catch(console.error);
`;

      // Generate user mapping JSON
      const mappingJson = JSON.stringify({
        exportDate: new Date().toISOString(),
        totalUsers: userMapping.length,
        users: userMapping
      }, null, 2);

      // Create ZIP with both files
      const zip = new JSZip();
      zip.file('create_users.js', scriptContent);
      zip.file('user_mapping.json', mappingJson);
      
      // Generate update_profiles.sql script to complete profile data after user creation
      const escapeSQL = (val: string | null | undefined) => {
        if (val === null || val === undefined) return 'NULL';
        return `'${val.replace(/'/g, "''")}'`;
      };
      
      let updateProfilesSQL = `-- SCRIPT PARA ACTUALIZAR PROFILES
-- ================================
-- 
-- Este script actualiza los campos adicionales de la tabla profiles
-- DESPUÉS de ejecutar create_users.js
-- 
-- El trigger handle_new_user solo crea registros básicos (user_id, full_name, email).
-- Este script completa los campos: specialty, gender, is_visible_in_dashboard
-- 
-- INSTRUCCIONES:
-- 1. Primero ejecuta create_users.js para crear los usuarios
-- 2. Luego ve a Supabase → SQL Editor
-- 3. Pega este script completo y haz clic en "Run"
-- 
-- Fecha de exportación: ${new Date().toISOString()}
-- Total de profiles: ${profiles?.length || 0}

`;
      
      if (profiles && profiles.length > 0) {
        for (const profile of profiles) {
          updateProfilesSQL += `UPDATE profiles SET 
  specialty = ${escapeSQL(profile.specialty)},
  gender = ${escapeSQL(profile.gender)},
  is_visible_in_dashboard = ${profile.is_visible_in_dashboard ?? true}
WHERE user_id = '${profile.user_id}';

`;
        }
      }
      
      updateProfilesSQL += `-- ¡Listo! Los profiles ahora tienen todos sus datos completos.
-- Continúa con la importación de los demás CSVs (saltando profiles).
`;
      
      zip.file('update_profiles.sql', updateProfilesSQL);
      
      // Add a SQL alternative script
      const sqlScript = `-- SCRIPT SQL ALTERNATIVO DE MIGRACIÓN DE USUARIOS
-- ================================================
-- 
-- Si prefieres NO usar Node.js, puedes usar este script SQL
-- para actualizar los user_id DESPUÉS de crear usuarios manualmente.
-- 
-- INSTRUCCIONES:
-- 1. Crea usuarios manualmente en Authentication → Users con los mismos emails
-- 2. Obtén los nuevos UUIDs con: SELECT id, email FROM auth.users;
-- 3. Reemplaza los placeholders OLD_ID y NEW_ID en este script
-- 4. Ejecuta en SQL Editor
--
-- Fecha de exportación: ${new Date().toISOString()}

-- MAPEO DE USUARIOS (reemplaza NEW_ID con los UUIDs del nuevo proyecto):
${userMapping.map(u => `-- ${u.email} | Nombre: ${u.full_name} | OLD_ID: ${u.user_id} | NEW_ID: ___________`).join('\n')}

-- TEMPLATE DE UPDATES (descomenta y completa después de tener los nuevos IDs):
-- UPDATE profiles SET user_id = 'NEW_ID' WHERE user_id = 'OLD_ID';
-- UPDATE user_roles SET user_id = 'NEW_ID' WHERE user_id = 'OLD_ID';
-- UPDATE user_branches SET user_id = 'NEW_ID' WHERE user_id = 'OLD_ID';
-- UPDATE appointments SET doctor_id = 'NEW_ID' WHERE doctor_id = 'OLD_ID';
-- UPDATE encounters SET doctor_id = 'NEW_ID' WHERE doctor_id = 'OLD_ID';
-- UPDATE schedule_blocks SET doctor_id = 'NEW_ID' WHERE doctor_id = 'OLD_ID';
-- UPDATE schedule_blocks SET created_by = 'NEW_ID' WHERE created_by = 'OLD_ID';
-- UPDATE invoices SET created_by = 'NEW_ID' WHERE created_by = 'OLD_ID';
-- UPDATE payments SET created_by = 'NEW_ID' WHERE created_by = 'OLD_ID';
-- UPDATE documents SET created_by = 'NEW_ID' WHERE created_by = 'OLD_ID';
-- UPDATE cash_closures SET closed_by = 'NEW_ID' WHERE closed_by = 'OLD_ID';
-- UPDATE inventory_movements SET created_by = 'NEW_ID' WHERE created_by = 'OLD_ID';
-- UPDATE pending_registrations SET reviewed_by = 'NEW_ID' WHERE reviewed_by = 'OLD_ID';
-- UPDATE crm_pipelines SET doctor_id = 'NEW_ID' WHERE doctor_id = 'OLD_ID';
-- UPDATE crm_pipelines SET created_by = 'NEW_ID' WHERE created_by = 'OLD_ID';
-- UPDATE crm_activity_log SET created_by = 'NEW_ID' WHERE created_by = 'OLD_ID';
-- UPDATE crm_pipeline_notes SET created_by = 'NEW_ID' WHERE created_by = 'OLD_ID';
-- UPDATE crm_pipeline_stages SET created_by = 'NEW_ID' WHERE created_by = 'OLD_ID';
-- UPDATE crm_pipeline_stages SET updated_by = 'NEW_ID' WHERE updated_by = 'OLD_ID';
-- UPDATE room_inventory_movements SET user_id = 'NEW_ID' WHERE user_id = 'OLD_ID';
`;
      
      zip.file('user_migration_sql_alternative.sql', sqlScript);
      
      // Add README with updated instructions
      const readme = `# ARCHIVOS DE MIGRACIÓN DE USUARIOS
=====================================

Este ZIP contiene las herramientas para migrar usuarios preservando sus UUIDs.

## ARCHIVOS INCLUIDOS:

📄 create_users.js
   Script de Node.js que crea usuarios con sus UUIDs originales.
   ESTE ES EL MÉTODO RECOMENDADO.

📄 update_profiles.sql ⭐ NUEVO
   Script SQL para completar los datos de profiles después de crear usuarios.
   El trigger solo crea datos básicos, este script añade specialty, gender, etc.

📄 user_mapping.json
   JSON con todos los usuarios y sus datos para referencia.

📄 user_migration_sql_alternative.sql
   Alternativa SQL si prefieres crear usuarios manualmente.

## ORDEN DE EJECUCIÓN CORRECTO:

1️⃣ Crear proyecto nuevo en Supabase
2️⃣ Ejecutar migraciones SQL (esquema/estructura)
3️⃣ Ejecutar create_users.js (crea usuarios y profiles básicos)
4️⃣ Ejecutar update_profiles.sql en SQL Editor (completa datos de profiles)
5️⃣ Importar resto de CSVs en orden (SALTANDO profiles)

## PASOS DETALLADOS:

### Paso 3: Crear usuarios
1. Instala Node.js: https://nodejs.org
2. Crea una carpeta y copia create_users.js
3. Ejecuta: npm init -y && npm install @supabase/supabase-js
4. Edita SUPABASE_URL y SERVICE_ROLE_KEY en el script
5. Ejecuta: node create_users.js

### Paso 4: Completar profiles
1. Ve a Supabase → SQL Editor
2. Abre el archivo update_profiles.sql
3. Copia todo el contenido
4. Pégalo en SQL Editor y haz clic en "Run"

### Paso 5: Importar CSVs
1. Importa los CSVs en el orden de _IMPORT_ORDER.txt
2. ⚠️ SALTA la tabla "profiles" - ya tiene los datos completos

## POR QUÉ PRESERVAR UUIDs:

Los UUIDs de usuarios están referenciados en muchas tablas:
- appointments.doctor_id
- encounters.doctor_id
- invoices.created_by
- payments.created_by
- schedule_blocks.doctor_id y created_by
- documents.created_by
- cash_closures.closed_by
- inventory_movements.created_by
- crm_pipelines.doctor_id y created_by
- crm_activity_log.created_by
- crm_pipeline_notes.created_by
- crm_pipeline_stages.created_by y updated_by
- room_inventory_movements.user_id

Si NO preservas los UUIDs originales, todas estas referencias
quedarán rotas y tendrás que hacer UPDATEs masivos.

Fecha de exportación: ${new Date().toISOString()}
`;
      zip.file('README.txt', readme);

      // Download ZIP
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user_migration_scripts_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Scripts de usuarios exportados',
        description: `ZIP con script para ${userMapping.length} usuarios. Incluye Node.js y SQL alternativo.`,
      });
    } catch (error: any) {
      console.error('Error exporting user script:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudieron exportar los scripts de usuarios',
        variant: 'destructive',
      });
    } finally {
      setExportingUserScript(false);
    }
  };

  // Export Edge Functions code
  const exportEdgeFunctions = async () => {
    setExportingEdgeFunctions(true);
    
    try {
      const zip = new JSZip();
      const exportDate = new Date().toISOString();

      // Define edge functions with their purpose
      const edgeFunctions = [
        {
          name: 'approve-registration',
          description: 'Aprueba registros pendientes y crea usuarios en el sistema',
          purpose: 'Gestión de registro de usuarios'
        },
        {
          name: 'cleanup-old-photos',
          description: 'Limpia fotos antiguas del storage para liberar espacio',
          purpose: 'Mantenimiento de storage'
        },
        {
          name: 'create-user',
          description: 'Crea usuarios nuevos con roles y permisos',
          purpose: 'Gestión de usuarios'
        },
        {
          name: 'delete-user',
          description: 'Elimina usuarios del sistema de forma segura',
          purpose: 'Gestión de usuarios'
        },
        {
          name: 'export-migrations',
          description: 'Genera el SQL completo del esquema de la base de datos',
          purpose: 'Herramienta de migración'
        },
        {
          name: 'generate-prescription-pdf',
          description: 'Genera PDFs de recetas médicas',
          purpose: 'Documentos clínicos'
        },
        {
          name: 'submit-registration',
          description: 'Recibe y procesa solicitudes de registro de usuarios',
          purpose: 'Gestión de registro de usuarios'
        },
        {
          name: 'update-user-password',
          description: 'Permite a administradores cambiar contraseñas de usuarios',
          purpose: 'Gestión de usuarios'
        }
      ];

      // Generate README
      const readmeContent = `# EDGE FUNCTIONS - CentroVisión
=======================================

Fecha de exportación: ${exportDate}

## FUNCIONES INCLUIDAS

${edgeFunctions.map((fn, i) => `${i + 1}. **${fn.name}**
   - Propósito: ${fn.purpose}
   - Descripción: ${fn.description}
`).join('\n')}

## CÓMO DESPLEGAR EN EL NUEVO PROYECTO

### Opción 1: Usando Supabase CLI (Recomendado)

1. Instala Supabase CLI:
   \`\`\`bash
   npm install -g supabase
   \`\`\`

2. Inicia sesión:
   \`\`\`bash
   supabase login
   \`\`\`

3. Vincula tu proyecto:
   \`\`\`bash
   supabase link --project-ref TU_PROJECT_REF
   \`\`\`

4. Copia la carpeta 'functions' a tu proyecto local en 'supabase/functions/'

5. Despliega todas las funciones:
   \`\`\`bash
   supabase functions deploy
   \`\`\`

### Opción 2: Manualmente en Supabase Dashboard

1. Ve a Edge Functions en tu proyecto Supabase
2. Crea una nueva función con el mismo nombre
3. Copia el contenido del index.ts correspondiente
4. Guarda y despliega

## CONFIGURACIÓN IMPORTANTE

Algunas funciones requieren variables de entorno o secrets:

- **SUPABASE_SERVICE_ROLE_KEY**: Ya está disponible automáticamente
- **SUPABASE_URL**: Ya está disponible automáticamente

## NOTAS

- Las funciones que modifican usuarios (approve-registration, create-user, 
  delete-user, update-user-password) usan SERVICE_ROLE_KEY para 
  operaciones administrativas.

- Asegúrate de que las políticas RLS estén correctamente configuradas
  antes de desplegar las funciones.

- Prueba cada función después de desplegarla para verificar que funciona
  correctamente con el nuevo proyecto.
`;

      zip.file('README.txt', readmeContent);

      // Add placeholder for each function with instructions
      for (const fn of edgeFunctions) {
        const functionContent = `// Edge Function: ${fn.name}
// =====================================
// Propósito: ${fn.purpose}
// Descripción: ${fn.description}
//
// NOTA: Este es un placeholder. El código real debe copiarse desde
// el repositorio del proyecto original.
//
// Ubicación original: supabase/functions/${fn.name}/index.ts
//
// Para obtener el código completo:
// 1. Accede al repositorio del proyecto en Lovable
// 2. Navega a supabase/functions/${fn.name}/index.ts
// 3. Copia el contenido completo
//
// O si tienes acceso al código fuente local, copia el archivo
// directamente desde esa ubicación.

// Estructura básica de una Edge Function de Supabase:
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Tu lógica aquí...
    
    return new Response(
      JSON.stringify({ message: 'OK' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
`;
        zip.file(`functions/${fn.name}/index.ts`, functionContent);
      }

      // Add config.toml template
      const configToml = `# Supabase Edge Functions Configuration
# =====================================
# Este archivo debe colocarse en supabase/config.toml

[project]
project_id = "TU_PROJECT_ID"

# Funciones que no requieren autenticación JWT
[functions.submit-registration]
verify_jwt = false

# Todas las demás funciones requieren JWT por defecto
`;

      zip.file('config.toml', configToml);

      // Generate ZIP
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edge_functions_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Edge Functions exportadas',
        description: `ZIP con ${edgeFunctions.length} funciones y guía de despliegue.`,
      });
    } catch (error: any) {
      console.error('Error exporting edge functions:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudieron exportar las Edge Functions',
        variant: 'destructive',
      });
    } finally {
      setExportingEdgeFunctions(false);
    }
  };

  // Export consolidated migration SQL
  const exportConsolidatedMigration = async () => {
    setExportingConsolidated(true);
    
    try {
      // Read the consolidated migration file from the server or generate it
      const consolidatedSQL = generateConsolidatedMigrationSQL();
      
      const blob = new Blob([consolidatedSQL], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MIGRACION_CONSOLIDADA_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Migración consolidada exportada',
        description: 'Archivo SQL con esquema completo incluyendo todas las columnas (deleted_at, etc.)',
      });
    } catch (error: any) {
      console.error('Error exporting consolidated migration:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo exportar la migración consolidada',
        variant: 'destructive',
      });
    } finally {
      setExportingConsolidated(false);
    }
  };

  // Generate consolidated migration SQL with complete schema
  const generateConsolidatedMigrationSQL = (): string => {
    const exportDate = new Date().toISOString();
    
    return `-- ============================================================
-- MIGRACIÓN CONSOLIDADA - CentroVisión
-- ============================================================
-- 
-- Este archivo crea TODAS las tablas con su estructura FINAL,
-- incluyendo columnas agregadas posteriormente como deleted_at.
-- 
-- USO: Ejecutar este archivo en SQL Editor del nuevo proyecto
--      Supabase ANTES de importar los CSVs.
-- 
-- VENTAJAS vs migraciones individuales:
-- - Un solo archivo en lugar de 120+
-- - Esquema completo desde el inicio
-- - Sin errores de columnas faltantes al importar CSVs
-- 
-- Fecha de exportación: ${exportDate}
-- ============================================================

-- ============================================================
-- ENUMS (Tipos personalizados)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_type AS ENUM ('consulta', 'estudio', 'cirugia', 'procedimiento', 'reconsulta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'doctor', 'recepcion', 'asistente', 'optometrista', 'enfermeria');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.branch_code AS ENUM ('VY', 'BR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.document_kind AS ENUM ('receta', 'indicaciones', 'consentimiento', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.encounter_type AS ENUM ('consulta', 'estudio', 'cirugia', 'procedimiento', 'reconsulta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.eye_side AS ENUM ('OD', 'OS', 'OU');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_kind AS ENUM ('study', 'lab', 'imaging', 'referral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_priority AS ENUM ('routine', 'urgent', 'stat');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('ordered', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.room_kind AS ENUM ('consultorio', 'optometria', 'sala', 'estudios', 'preconsulta', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLAS DE CONFIGURACIÓN (Sin dependencias)
-- ============================================================

-- Sucursales/Sedes
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  code branch_code,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuración de la aplicación
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Configuración de Edge Functions
CREATE TABLE IF NOT EXISTS public.edge_function_settings (
  function_name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_by UUID,
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLAS DE CATÁLOGOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.study_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surgery_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procedure_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind document_kind NOT NULL,
  body JSONB NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  service_type appointment_type NOT NULL,
  price NUMERIC NOT NULL,
  requires_deposit BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- USUARIOS Y PERFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  specialty TEXT,
  gender TEXT,
  is_visible_in_dashboard BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.user_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role app_role NOT NULL,
  specialty TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SALAS Y ESPACIOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind room_kind NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PACIENTES - CON deleted_at INCLUIDO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob DATE,
  phone TEXT,
  email TEXT,
  allergies TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  address TEXT,
  diabetes BOOLEAN DEFAULT FALSE,
  hta BOOLEAN DEFAULT FALSE,
  ophthalmic_history TEXT DEFAULT '',
  occupation TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA DESDE EL INICIO
);

-- ============================================================
-- CITAS Y AGENDA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  doctor_id UUID,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  type appointment_type NOT NULL DEFAULT 'consulta',
  status appointment_status NOT NULL DEFAULT 'scheduled',
  autorefractor TEXT,
  lensometry TEXT,
  photo_od TEXT,
  photo_oi TEXT,
  post_op_type TEXT,
  od_text TEXT,
  os_text TEXT,
  keratometry_od_k1 TEXT,
  keratometry_od_k2 TEXT,
  keratometry_od_axis TEXT,
  keratometry_os_k1 TEXT,
  keratometry_os_k2 TEXT,
  keratometry_os_axis TEXT,
  pio_od NUMERIC,
  pio_os NUMERIC,
  is_courtesy BOOLEAN DEFAULT FALSE,
  reception_notes TEXT,
  external_doctor_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  doctor_id UUID,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ENCUENTROS CLÍNICOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  doctor_id UUID,
  type encounter_type NOT NULL DEFAULT 'consulta',
  date TIMESTAMPTZ DEFAULT now(),
  motivo_consulta TEXT,
  estudios TEXT,
  cirugias TEXT,
  plan_tratamiento TEXT,
  interpretacion_resultados TEXT,
  summary TEXT,
  proxima_cita TEXT,
  excursiones_od TEXT,
  excursiones_os TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

CREATE TABLE IF NOT EXISTS public.exam_eye (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE,
  side eye_side NOT NULL,
  av_sc TEXT,
  av_cc TEXT,
  iop NUMERIC,
  ref_sphere NUMERIC,
  ref_cyl NUMERIC,
  ref_axis INTEGER,
  ref_subj_sphere NUMERIC,
  ref_subj_cyl NUMERIC,
  ref_subj_axis INTEGER,
  ref_subj_av TEXT,
  rx_sphere NUMERIC,
  rx_cyl NUMERIC,
  rx_axis INTEGER,
  rx_add NUMERIC,
  slit_lamp TEXT,
  fundus TEXT,
  plan TEXT,
  prescription_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

CREATE TABLE IF NOT EXISTS public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE,
  code TEXT,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

CREATE TABLE IF NOT EXISTS public.surgeries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  tipo_cirugia TEXT NOT NULL,
  ojo_operar eye_side NOT NULL DEFAULT 'OD',
  consentimiento_informado BOOLEAN NOT NULL DEFAULT FALSE,
  medicacion TEXT,
  nota_operatoria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surgery_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surgery_id UUID NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  tipo_procedimiento TEXT NOT NULL,
  ojo_operar eye_side NOT NULL DEFAULT 'OD',
  consentimiento_informado BOOLEAN NOT NULL DEFAULT FALSE,
  medicacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  eye_side eye_side NOT NULL DEFAULT 'OU',
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  kind order_kind NOT NULL,
  side eye_side,
  status order_status NOT NULL DEFAULT 'ordered',
  priority order_priority NOT NULL DEFAULT 'routine',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  side eye_side,
  extracted_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  kind document_kind NOT NULL,
  file_path TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FACTURACIÓN
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  balance_due NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  discount_type TEXT,
  discount_value NUMERIC,
  discount_reason TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- ← COLUMNA INCLUIDA
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id UUID,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  closure_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_invoiced NUMERIC NOT NULL DEFAULT 0,
  total_collected NUMERIC NOT NULL DEFAULT 0,
  total_pending NUMERIC NOT NULL DEFAULT 0,
  total_discounts NUMERIC,
  efectivo_total NUMERIC,
  tarjeta_total NUMERIC,
  transferencia_total NUMERIC,
  cheque_total NUMERIC,
  otro_total NUMERIC,
  consultas_count INTEGER,
  consultas_total NUMERIC,
  estudios_count INTEGER,
  estudios_total NUMERIC,
  procedimientos_count INTEGER,
  procedimientos_total NUMERIC,
  cirugias_count INTEGER,
  cirugias_total NUMERIC,
  inventory_count INTEGER,
  inventory_total NUMERIC,
  detailed_data JSONB,
  closed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INVENTARIO DE CAJA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  category TEXT NOT NULL,
  unit_price NUMERIC NOT NULL,
  cost_price NUMERIC,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER,
  requires_lot BOOLEAN NOT NULL DEFAULT FALSE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  expiry_date DATE,
  cost_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INVENTARIO DE SALA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.room_inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES room_inventory_categories(id) ON DELETE CASCADE,
  display_order INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES room_inventory_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  brand TEXT,
  specification TEXT,
  unit TEXT,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES room_inventory_items(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  notes TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- CRM
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_procedure_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  default_stages JSONB NOT NULL DEFAULT '[]',
  display_order INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  procedure_type_id UUID NOT NULL REFERENCES crm_procedure_types(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  doctor_id UUID,
  eye_side eye_side NOT NULL DEFAULT 'OD',
  current_stage TEXT NOT NULL DEFAULT 'Valoración',
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'normal',
  notes TEXT,
  cancellation_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  amount NUMERIC,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_pipeline_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_activity_read (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SISTEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.backup_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type TEXT NOT NULL,
  table_counts JSONB NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FUNCIONES UTILITARIAS
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 5) AS INTEGER)), 0) + 1
  INTO next_number
  FROM invoices
  WHERE invoice_number LIKE 'INV-%';
  
  RETURN 'INV-' || LPAD(next_number::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.generate_invoice_number_for_branch(p_branch_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  branch_prefix TEXT;
BEGIN
  SELECT COALESCE(code::TEXT, 'XX') INTO branch_prefix FROM branches WHERE id = p_branch_id;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_number
  FROM invoices
  WHERE branch_id = p_branch_id;
  
  RETURN branch_prefix || '-' || LPAD(next_number::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función para verificar rol de usuario
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Función para obtener rol del usuario
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Función para verificar acceso CRM
CREATE OR REPLACE FUNCTION public.has_crm_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = _user_id
    AND role IN ('admin', 'recepcion', 'caja', 'contabilidad', 'enfermeria', 'diagnostico')
  )
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS update_patients_updated_at ON patients;
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_encounters_updated_at ON encounters;
CREATE TRIGGER update_encounters_updated_at BEFORE UPDATE ON encounters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(code);
CREATE INDEX IF NOT EXISTS idx_patients_names ON patients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_dates ON appointments(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_appointments_branch ON appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_appointment ON encounters(appointment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch ON inventory_items(branch_id);

-- ============================================================
-- ROW LEVEL SECURITY - Habilitar RLS en todas las tablas
-- ============================================================

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_eye ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_function_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_procedure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activity_read ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLÍTICAS RLS (Row Level Security)
-- ============================================================

-- PACIENTES
CREATE POLICY "Todos pueden leer pacientes" ON patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Recepción y admins pueden crear pacientes" ON patients FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion'));
CREATE POLICY "Recepción y admins pueden actualizar pacientes" ON patients FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion'));
CREATE POLICY "Admins pueden borrar pacientes" ON patients FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Médicos pueden actualizar antecedentes de pacientes" ON patients FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'doctor'));

-- PERFILES
CREATE POLICY "Usuarios pueden ver todos los perfiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Usuarios pueden insertar su propio perfil" ON profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ROLES
CREATE POLICY "Todos pueden ver roles" ON user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Solo admin puede gestionar roles" ON user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- BRANCHES Y USER_BRANCHES
CREATE POLICY "Todos pueden ver branches" ON branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar branches" ON branches FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Todos pueden ver user_branches" ON user_branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar user_branches" ON user_branches FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- SALAS
CREATE POLICY "Todos pueden ver salas" ON rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar salas" ON rooms FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- CITAS
CREATE POLICY "Todos pueden ver citas" ON appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear citas" ON appointments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "Personal clínico puede actualizar citas" ON appointments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "Personal clínico puede eliminar citas" ON appointments FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion') OR has_role(auth.uid(), 'doctor'));

-- BLOQUEOS DE AGENDA
CREATE POLICY "Todos pueden ver bloqueos" ON schedule_blocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal puede gestionar bloqueos" ON schedule_blocks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'recepcion') OR has_role(auth.uid(), 'doctor'));

-- ENCUENTROS CLÍNICOS
CREATE POLICY "Todos pueden ver encuentros" ON encounters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear encuentros" ON encounters FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'optometrista') OR has_role(auth.uid(), 'asistente'));
CREATE POLICY "Personal clínico puede actualizar encuentros" ON encounters FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'optometrista') OR has_role(auth.uid(), 'asistente'));
CREATE POLICY "Admin y doctor pueden eliminar encuentros" ON encounters FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- EXÁMENES OCULARES
CREATE POLICY "Todos pueden ver exámenes" ON exam_eye FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar exámenes" ON exam_eye FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'optometrista'));

-- DIAGNÓSTICOS
CREATE POLICY "Todos pueden ver diagnósticos" ON diagnoses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar diagnósticos" ON diagnoses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- CIRUGÍAS
CREATE POLICY "Todos pueden ver cirugías" ON surgeries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Médicos pueden gestionar cirugías" ON surgeries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- ARCHIVOS DE CIRUGÍAS
CREATE POLICY "Personal clínico puede ver archivos de cirugías" ON surgery_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear archivos de cirugías" ON surgery_files FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'enfermeria'));
CREATE POLICY "Personal clínico puede eliminar archivos de cirugías" ON surgery_files FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- PROCEDIMIENTOS
CREATE POLICY "Todos pueden ver procedimientos" ON procedures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar procedimientos" ON procedures FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- ESTUDIOS
CREATE POLICY "Todos pueden ver estudios" ON studies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal puede gestionar estudios" ON studies FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'diagnostico'));

-- ARCHIVOS DE ESTUDIOS
CREATE POLICY "Personal clínico puede ver archivos de estudios" ON study_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear archivos de estudios" ON study_files FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'diagnostico'));
CREATE POLICY "Personal clínico puede eliminar archivos de estudios" ON study_files FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- ÓRDENES Y RESULTADOS
CREATE POLICY "Todos pueden ver órdenes" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar órdenes" ON orders FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));
CREATE POLICY "Todos pueden ver resultados" ON results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede gestionar resultados" ON results FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'diagnostico'));

-- DOCUMENTOS
CREATE POLICY "Todos pueden ver documentos" ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Personal clínico puede crear documentos" ON documents FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'doctor'));

-- PLANTILLAS
CREATE POLICY "Todos pueden ver plantillas" ON templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar plantillas" ON templates FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- FACTURAS, ITEMS Y PAGOS
CREATE POLICY "Todos pueden ver facturas" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar facturas" ON invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Todos pueden ver items de factura" ON invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar items" ON invoice_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Todos pueden ver pagos" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar pagos" ON payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

-- CIERRES DE CAJA
CREATE POLICY "Admin y caja pueden ver cierres" ON cash_closures FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));
CREATE POLICY "Admin y caja pueden crear cierres" ON cash_closures FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

-- INVENTARIO (BOX)
CREATE POLICY "Todos pueden ver inventario" ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar inventario" ON inventory_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "Todos pueden ver lotes" ON inventory_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar lotes" ON inventory_lots FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja'));
CREATE POLICY "Todos pueden ver movimientos" ON inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar movimientos" ON inventory_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja'));

-- INVENTARIO DE SALAS
CREATE POLICY "Todos pueden ver categorías de inventario de sala" ON room_inventory_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y enfermería pueden gestionar categorías" ON room_inventory_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'enfermeria'));
CREATE POLICY "Todos pueden ver items de inventario de sala" ON room_inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y enfermería pueden gestionar items" ON room_inventory_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'enfermeria'));
CREATE POLICY "Todos pueden ver movimientos de sala" ON room_inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y enfermería pueden gestionar movimientos de sala" ON room_inventory_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'enfermeria'));

-- PRECIOS DE SERVICIOS
CREATE POLICY "Todos pueden ver precios" ON service_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar precios" ON service_prices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja') OR has_role(auth.uid(), 'contabilidad'));

-- PROVEEDORES
CREATE POLICY "Todos pueden ver proveedores" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y caja pueden gestionar proveedores" ON suppliers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'caja'));

-- CATÁLOGOS (tipos de cirugía, estudio, procedimiento)
CREATE POLICY "Todos pueden ver tipos de cirugía" ON surgery_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Solo admin puede gestionar tipos de cirugía" ON surgery_types FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Todos pueden ver tipos de estudio" ON study_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Solo admin puede gestionar tipos de estudio" ON study_types FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Todos pueden ver tipos de procedimiento" ON procedure_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Solo admin puede gestionar tipos de procedimiento" ON procedure_types FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- REGISTROS PENDIENTES
CREATE POLICY "Admin puede ver registros pendientes" ON pending_registrations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin puede gestionar registros pendientes" ON pending_registrations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- CONFIGURACIÓN
CREATE POLICY "Todos pueden ver app_settings" ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar app_settings" ON app_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Todos pueden ver edge_function_settings" ON edge_function_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin puede gestionar edge_function_settings" ON edge_function_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- AUDITORÍA Y BACKUPS
CREATE POLICY "Todos pueden ver audit_logs" ON audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sistema puede insertar audit_logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin puede gestionar snapshots" ON backup_snapshots FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- CRM - TIPOS DE PROCEDIMIENTO
CREATE POLICY "Usuarios CRM pueden ver tipos de procedimiento CRM" ON crm_procedure_types FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Admin puede gestionar tipos de procedimiento CRM" ON crm_procedure_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- CRM - PIPELINES
CREATE POLICY "Usuarios CRM pueden ver pipelines" ON crm_pipelines FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios CRM pueden gestionar pipelines" ON crm_pipelines FOR ALL TO authenticated
  USING (has_crm_access(auth.uid())) WITH CHECK (has_crm_access(auth.uid()));

-- CRM - ETAPAS
CREATE POLICY "Usuarios CRM pueden ver etapas" ON crm_pipeline_stages FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios CRM pueden gestionar etapas" ON crm_pipeline_stages FOR ALL TO authenticated
  USING (has_crm_access(auth.uid())) WITH CHECK (has_crm_access(auth.uid()));

-- CRM - NOTAS
CREATE POLICY "Usuarios CRM pueden ver notas" ON crm_pipeline_notes FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios CRM pueden gestionar notas" ON crm_pipeline_notes FOR ALL TO authenticated
  USING (has_crm_access(auth.uid())) WITH CHECK (has_crm_access(auth.uid()));

-- CRM - ACTIVIDAD
CREATE POLICY "Usuarios CRM pueden ver actividades" ON crm_activity_log FOR SELECT TO authenticated
  USING (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios CRM pueden registrar actividades" ON crm_activity_log FOR INSERT TO authenticated
  WITH CHECK (has_crm_access(auth.uid()));
CREATE POLICY "Usuarios pueden gestionar su lectura de actividad" ON crm_activity_read FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FIN DE MIGRACIÓN CONSOLIDADA
-- ============================================================

-- NOTA: Después de ejecutar este script:
-- 1. Ejecutar el script de creación de usuarios (create_users.js)
-- 2. Importar los CSVs en el orden indicado en _IMPORT_ORDER.txt
`;
  };

  const downloadMigrations = async () => {
    setDownloadingMigrations(true);
    setSqlExportProgress(0);
    setSqlExportPhase('Generando esquema completo...');

    try {
      // Generar esquema completo localmente (incluye tablas, funciones, triggers, RLS)
      // Ya no dependemos del Edge Function - todo está en generateConsolidatedMigrationSQL()
      const completeSQL = generateConsolidatedMigrationSQL();

      setSqlExportProgress(80);
      setSqlExportPhase('Preparando descarga...');
      
      // Create download
      const blob = new Blob([completeSQL], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ESQUEMA_COMPLETO_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setSqlExportProgress(100);
      setSqlExportPhase('Completado');

      toast({
        title: 'Esquema SQL completo descargado',
        description: 'Archivo único con tablas, funciones, triggers y RLS',
      });
    } catch (error: any) {
      console.error('Error downloading complete schema:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo descargar el esquema completo',
        variant: 'destructive',
      });
    } finally {
      setDownloadingMigrations(false);
      setSqlExportProgress(0);
      setSqlExportPhase('');
    }
  };

  const totalFiles = bucketStats.reduce((acc, b) => acc + b.total_files, 0);
  const totalBytes = bucketStats.reduce((acc, b) => acc + b.total_bytes, 0);
  const totalRecords = tableCounts.reduce((acc, t) => acc + t.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileArchive className="h-5 w-5" />
          Exportación de Datos
        </CardTitle>
        <CardDescription>
          Descarga tus datos para backup o migración a otro sistema
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <HardDrive className="h-8 w-8 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold">{totalFiles}</div>
            <div className="text-sm text-muted-foreground">Archivos</div>
            <div className="text-xs text-muted-foreground">{formatBytes(totalBytes)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <Database className="h-8 w-8 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold">{totalRecords.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Registros</div>
            <div className="text-xs text-muted-foreground">{tableCounts.length} tablas</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <FileCode className="h-8 w-8 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold">97</div>
            <div className="text-sm text-muted-foreground">Migraciones</div>
            <div className="text-xs text-muted-foreground">Estructura DB</div>
          </div>
        </div>

        <Separator />

        {/* Migration Guide Button */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <BookOpen className="h-6 w-6 text-primary mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-foreground mb-1">¿Necesitas migrar a otro proyecto?</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Sigue nuestra guía paso a paso con checklist interactivo para no olvidar ningún detalle.
              </p>
              <Button 
                onClick={() => setShowMigrationGuide(true)}
                className="w-full sm:w-auto"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                Ver Guía Completa de Migración
              </Button>
            </div>
          </div>
        </div>

        {/* Storage Buckets */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <FolderDown className="h-4 w-4" />
            Archivos de Almacenamiento
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Descarga todos los archivos de cada bucket en un ZIP.
          </p>
          <div className="space-y-2">
            {bucketStats.map((bucket) => (
              <div 
                key={bucket.bucket_id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{bucketLabels[bucket.bucket_id] || bucket.bucket_id}</div>
                    <div className="text-sm text-muted-foreground">
                      {bucket.total_files} archivos • {formatBytes(bucket.total_bytes)}
                    </div>
                  </div>
                </div>
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={() => downloadBucket(bucket.bucket_id)}
                  disabled={downloadingBucket === bucket.bucket_id || bucket.total_files === 0}
                >
                  {downloadingBucket === bucket.bucket_id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {Math.round(bucketProgress)}%
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Exportar ZIP
                    </>
                  )}
                </Button>
              </div>
            ))}
            {bucketStats.length === 0 && (
              <div className="text-center text-muted-foreground py-4">
                No hay buckets con archivos
              </div>
            )}
          </div>
          {downloadingBucket && (
            <div className="mt-3">
              <Progress value={bucketProgress} className="h-2" />
            </div>
          )}
        </div>

        <Separator />

        {/* Database Tables */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Database className="h-4 w-4" />
              Datos de Base de Datos
            </h3>
            <div className="flex items-center gap-2">
              <Label htmlFor="csv-toggle" className="text-sm text-muted-foreground">Excel</Label>
              <Switch 
                id="csv-toggle" 
                checked={exportAsCSV} 
                onCheckedChange={setExportAsCSV}
              />
              <Label htmlFor="csv-toggle" className="text-sm text-muted-foreground">CSV</Label>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Exporta cada tabla en formato {exportAsCSV ? 'CSV (recomendado para importar)' : 'Excel (.xlsx)'}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {tableCounts.map((table) => (
              <Button
                key={table.name}
                variant="outline"
                size="sm"
                className="justify-between h-auto py-2"
                onClick={() => exportTable(table.name)}
                disabled={exportingTable === table.name || table.count === 0}
              >
                <span className="flex items-center gap-2">
                  {exportAsCSV ? (
                    <FileText className="h-4 w-4" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  <span className="truncate">{table.label}</span>
                </span>
                <Badge variant="secondary" className="ml-2">
                  {exportingTable === table.name ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    table.count.toLocaleString()
                  )}
                </Badge>
              </Button>
            ))}
          </div>
        </div>

        {/* Special SQL Export for tables with nullable UUID columns */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-foreground mb-1">
                ⚠️ Tablas con UUIDs Nullable (Exportar como SQL)
              </h4>
              <p className="text-sm text-muted-foreground mb-3">
                Estas tablas tienen columnas UUID que pueden ser NULL. El importador CSV de Supabase 
                no maneja correctamente estos valores. <strong>Usa la exportación SQL</strong> y ejecuta 
                el archivo directamente en el SQL Editor del proyecto destino.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-500"
                  onClick={() => exportTableAsSQL('invoice_items')}
                  disabled={exportingTableSQL === 'invoice_items'}
                >
                  {exportingTableSQL === 'invoice_items' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <FileCode className="h-4 w-4 mr-2" />
                      invoice_items (SQL)
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-500 text-amber-600 hover:bg-amber-500/10"
                  onClick={() => exportTableAsSQL('inventory_movements')}
                  disabled={exportingTableSQL === 'inventory_movements'}
                >
                  {exportingTableSQL === 'inventory_movements' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <FileCode className="h-4 w-4 mr-2" />
                      inventory_movements (SQL)
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Migration Validator Button */}
        <Button 
          onClick={() => setShowMigrationValidator(true)}
          variant="outline"
          className="w-full border-blue-500 text-blue-600 hover:bg-blue-500/10"
        >
          <SearchCheck className="h-4 w-4 mr-2" />
          Validar CSVs Antes de Importar (Dry-Run)
        </Button>

        {/* Full Export Actions */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={exportAllAsCSV}
              disabled={exportingAllCSV}
              className="flex-1"
              variant="default"
            >
              {exportingAllCSV ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exportando CSVs...
                </>
              ) : (
                <>
                  <FileArchive className="h-4 w-4 mr-2" />
                  Exportar Todo (ZIP con CSVs)
                </>
              )}
            </Button>
            <Button 
              onClick={exportAllData}
              disabled={exportingAll}
              className="flex-1"
              variant="outline"
            >
              {exportingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exportando Excel...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Exportar Todo (Excel)
                </>
              )}
            </Button>
          </div>
          
          {/* Progress bar for CSV ZIP export */}
          {exportingAllCSV && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Exportando: <span className="font-medium text-foreground">{currentExportTable}</span>
                </span>
                <span className="font-medium">{Math.round(tableExportProgress)}%</span>
              </div>
              <Progress value={tableExportProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Tabla {Math.ceil((tableExportProgress / 100) * IMPORT_ORDER.length)} de {IMPORT_ORDER.length}
              </p>
            </div>
          )}
          
          <Button 
            onClick={downloadMigrations}
            disabled={downloadingMigrations}
            className="w-full bg-green-600 text-white hover:bg-green-500"
          >
            {downloadingMigrations ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {sqlExportPhase || 'Generando SQL...'}
              </>
            ) : (
              <>
                <FileCode className="h-4 w-4 mr-2" />
                Descargar Esquema SQL Completo
              </>
            )}
          </Button>
          
          {/* Progress bar for SQL schema export */}
          {downloadingMigrations && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{sqlExportPhase}</span>
                <span className="font-medium">{Math.round(sqlExportProgress)}%</span>
              </div>
              <Progress value={sqlExportProgress} className="h-2" />
            </div>
          )}

          {/* User Migration Script Button */}
          <Button 
            onClick={exportUserScript}
            disabled={exportingUserScript}
            className="w-full bg-amber-500 text-white hover:bg-amber-400"
          >
            {exportingUserScript ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando scripts de usuarios...
              </>
            ) : (
              <>
                <Users className="h-4 w-4 mr-2" />
                Exportar Script de Usuarios (Preserva UUIDs)
              </>
            )}
          </Button>

          {/* Edge Functions Export Button */}
          <Button 
            onClick={exportEdgeFunctions}
            disabled={exportingEdgeFunctions}
            className="w-full bg-purple-600 text-white hover:bg-purple-500"
          >
            {exportingEdgeFunctions ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exportando Edge Functions...
              </>
            ) : (
              <>
                <FileCode className="h-4 w-4 mr-2" />
                Exportar Edge Functions (8 funciones)
              </>
            )}
          </Button>

          {/* OCULTO - Funcionalidad unificada en "Descargar Esquema SQL Completo" arriba
          <Button 
            onClick={exportConsolidatedMigration}
            disabled={exportingConsolidated}
            className="w-full bg-teal-600 text-white hover:bg-teal-500"
          >
            {exportingConsolidated ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando migración consolidada...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Migración Consolidada (1 archivo SQL)
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            ⭐ Recomendado: Un solo archivo SQL con esquema completo (incluye deleted_at)
          </p>
          */}
        </div>

        {/* Important User Migration Notice */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-foreground mb-1">⚠️ Migración de Usuarios</h4>
              <p className="text-sm text-muted-foreground mb-2">
                El script de usuarios es <strong>ESENCIAL</strong> para la migración. Preserva los UUIDs originales 
                para que todas las relaciones (citas, encuentros, facturas) funcionen correctamente.
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>Ejecutar ANTES</strong> de importar los CSVs</li>
                <li>• Crea usuarios con los mismos IDs que el sistema actual</li>
                <li>• Los usuarios deberán resetear su contraseña después</li>
              </ul>
            </div>
          </div>
        </div>

        {/* CSV Benefits Info */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-foreground mb-1">¿Por qué exportar como CSV?</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>Fácil importación</strong> en Supabase Table Editor</li>
                <li>• <strong>Orden correcto</strong> incluido para respetar foreign keys</li>
                <li>• <strong>Formato estándar</strong> compatible con cualquier base de datos</li>
                <li>• <strong>Incluye README</strong> con instrucciones paso a paso</li>
              </ul>
            </div>
          </div>
        </div>

      </CardContent>

      {/* Migration Guide Dialog */}
      <Dialog open={showMigrationGuide} onOpenChange={setShowMigrationGuide}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl flex items-center gap-2">
              <BookOpen className="h-6 w-6" />
              Guía Completa de Migración
            </DialogTitle>
            <DialogDescription>
              Sigue cada paso en orden. Marca las casillas conforme completas cada tarea.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[70vh] px-6 pb-6">
            <div className="space-y-8 pr-4">
              
              {/* FASE 0: Advertencia importante */}
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-destructive mb-2">⚠️ Antes de empezar - Lee esto</h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Este proceso puede tomar <strong>2-4 horas</strong> dependiendo del volumen de datos</li>
                      <li>• <strong>Las contraseñas de usuarios NO se pueden migrar</strong> (seguridad de Supabase)</li>
                      <li>• Necesitarás pedir a todos los usuarios que reseteen su contraseña</li>
                      <li>• Asegúrate de tener buena conexión a internet</li>
                      <li>• Haz todo esto en un momento de poco uso del sistema</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* FASE 1 */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                  <span className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-sm">1</span>
                  FASE 1: Preparación (Descargar todo de aquí)
                </h3>
                <p className="text-sm text-muted-foreground">
                  Primero descarga todos los datos desde este sistema. Usa los botones de arriba en esta misma página.
                </p>
                <div className="space-y-2 ml-9">
                  <MigrationCheckItem 
                    id="f1-1" 
                    checked={checkedItems['f1-1']} 
                    onCheck={() => toggleCheck('f1-1')}
                    label='Click en "Exportar Todo (ZIP con CSVs)" - Descarga el archivo ZIP'
                  />
                  <MigrationCheckItem 
                    id="f1-2" 
                    checked={checkedItems['f1-2']} 
                    onCheck={() => toggleCheck('f1-2')}
                    label='Click en "Descargar Esquema SQL" - Guarda el archivo .sql'
                  />
                  <MigrationCheckItem 
                    id="f1-2b" 
                    checked={checkedItems['f1-2b']} 
                    onCheck={() => toggleCheck('f1-2b')}
                    label='Click en "Exportar Script de Usuarios" - ¡CRÍTICO para preservar UUIDs!'
                  />
                  <MigrationCheckItem 
                    id="f1-3" 
                    checked={checkedItems['f1-3']} 
                    onCheck={() => toggleCheck('f1-3')}
                    label='Click en "Exportar ZIP" para cada bucket de almacenamiento'
                  />
                  <MigrationCheckItem 
                    id="f1-4" 
                    checked={checkedItems['f1-4']} 
                    onCheck={() => toggleCheck('f1-4')}
                    label="Descomprime todos los ZIPs descargados"
                  />
                  <MigrationCheckItem 
                    id="f1-5" 
                    checked={checkedItems['f1-5']} 
                    onCheck={() => toggleCheck('f1-5')}
                    label="Revisa el archivo _IMPORT_ORDER.txt para conocer el orden de importación"
                  />
                </div>
              </div>

              <Separator />

              {/* FASE 2 */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                  <span className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-sm">2</span>
                  FASE 2: Crear Nuevo Proyecto en Supabase
                </h3>
                <div className="space-y-2 ml-9">
                  <MigrationCheckItem 
                    id="f2-1" 
                    checked={checkedItems['f2-1']} 
                    onCheck={() => toggleCheck('f2-1')}
                    label="Ve a supabase.com y crea una cuenta si no tienes"
                    link="https://supabase.com"
                  />
                  <MigrationCheckItem 
                    id="f2-2" 
                    checked={checkedItems['f2-2']} 
                    onCheck={() => toggleCheck('f2-2')}
                    label='Click en "New Project" (Nuevo Proyecto)'
                  />
                  <MigrationCheckItem 
                    id="f2-3" 
                    checked={checkedItems['f2-3']} 
                    onCheck={() => toggleCheck('f2-3')}
                    label="Elige un nombre para el proyecto (ej: centrovision-produccion)"
                  />
                  <MigrationCheckItem 
                    id="f2-4" 
                    checked={checkedItems['f2-4']} 
                    onCheck={() => toggleCheck('f2-4')}
                    label="Crea una contraseña FUERTE para la base de datos - GUÁRDALA EN LUGAR SEGURO"
                  />
                  <MigrationCheckItem 
                    id="f2-5" 
                    checked={checkedItems['f2-5']} 
                    onCheck={() => toggleCheck('f2-5')}
                    label="Selecciona la región más cercana a tus usuarios (ej: South America - São Paulo)"
                  />
                  <MigrationCheckItem 
                    id="f2-6" 
                    checked={checkedItems['f2-6']} 
                    onCheck={() => toggleCheck('f2-6')}
                    label='Click en "Create new project" y espera 2-3 minutos a que se cree'
                  />
                  <div className="bg-muted/50 rounded-lg p-3 mt-3">
                    <p className="text-sm font-medium mb-2">📝 Una vez creado, copia y guarda estos valores:</p>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• <strong>Project URL</strong>: En Settings → API → Project URL</li>
                      <li>• <strong>Anon/Public Key</strong>: En Settings → API → Project API keys → anon public</li>
                      <li>• <strong>Service Role Key</strong>: En Settings → API → Project API keys → service_role (¡mantén en secreto!)</li>
                      <li>• <strong>Project ID</strong>: Está en la URL del dashboard (ej: abcdefghijk)</li>
                    </ul>
                  </div>
                  <MigrationCheckItem 
                    id="f2-7" 
                    checked={checkedItems['f2-7']} 
                    onCheck={() => toggleCheck('f2-7')}
                    label="Ya copié y guardé los 4 valores en un lugar seguro"
                  />
                </div>
              </div>

              <Separator />

              {/* FASE 3 */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                  <span className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-sm">3</span>
                  FASE 3: Ejecutar Migraciones SQL (Crear estructura)
                </h3>
                <p className="text-sm text-muted-foreground">
                  Esto crea todas las tablas, funciones, triggers y políticas RLS.
                </p>
                <div className="space-y-2 ml-9">
                  <MigrationCheckItem 
                    id="f3-1" 
                    checked={checkedItems['f3-1']} 
                    onCheck={() => toggleCheck('f3-1')}
                    label="En tu nuevo proyecto de Supabase, ve a SQL Editor (menú izquierdo)"
                  />
                  <MigrationCheckItem 
                    id="f3-2" 
                    checked={checkedItems['f3-2']} 
                    onCheck={() => toggleCheck('f3-2')}
                    label='Click en "+ New query" (Nueva consulta)'
                  />
                  <MigrationCheckItem 
                    id="f3-3" 
                    checked={checkedItems['f3-3']} 
                    onCheck={() => toggleCheck('f3-3')}
                    label="Abre el archivo migrations_FECHA.sql que descargaste"
                  />
                  <MigrationCheckItem 
                    id="f3-4" 
                    checked={checkedItems['f3-4']} 
                    onCheck={() => toggleCheck('f3-4')}
                    label="Copia TODO el contenido del archivo (Ctrl+A, Ctrl+C)"
                  />
                  <MigrationCheckItem 
                    id="f3-5" 
                    checked={checkedItems['f3-5']} 
                    onCheck={() => toggleCheck('f3-5')}
                    label="Pega en el SQL Editor de Supabase (Ctrl+V)"
                  />
                  <MigrationCheckItem 
                    id="f3-6" 
                    checked={checkedItems['f3-6']} 
                    onCheck={() => toggleCheck('f3-6')}
                    label='Click en "Run" o "Execute" (botón verde)'
                  />
                  <MigrationCheckItem 
                    id="f3-7" 
                    checked={checkedItems['f3-7']} 
                    onCheck={() => toggleCheck('f3-7')}
                    label='Verifica que diga "Success" sin errores rojos'
                  />
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-2">
                    <p className="text-sm"><strong>⚠️ Si hay errores:</strong></p>
                    <ul className="text-sm text-muted-foreground mt-1">
                      <li>• Intenta ejecutar el SQL en partes más pequeñas</li>
                      <li>• Busca el mensaje de error y corrígelo</li>
                      <li>• Los errores de "already exists" se pueden ignorar</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Separator />

              {/* FASE 4 - Crear Usuarios (NUEVA - CRÍTICA) */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2 text-amber-600">
                  <span className="bg-amber-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">4</span>
                  FASE 4: Crear Usuarios con Script (⚠️ CRÍTICO - ANTES de importar datos)
                </h3>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-3">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Este paso preserva los UUIDs originales de los usuarios
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sin esto, las referencias a doctor_id, created_by, etc. quedarán rotas.
                  </p>
                </div>
                
                {/* Info box de dependencias */}
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-3">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    📊 Dependencias de auth.users
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="text-center p-2 bg-blue-100/50 dark:bg-blue-900/30 rounded">
                      <p className="text-xl font-bold text-blue-600 dark:text-blue-400">6</p>
                      <p className="text-xs text-muted-foreground">Tablas → auth.users (directas)</p>
                    </div>
                    <div className="text-center p-2 bg-indigo-100/50 dark:bg-indigo-900/30 rounded">
                      <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">14</p>
                      <p className="text-xs text-muted-foreground">Tablas → profiles (indirectas)</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Total: 20 tablas con 26 columnas que requieren usuarios existentes
                  </p>
                </div>
                <div className="space-y-2 ml-9">
                  <MigrationCheckItem 
                    id="f4-0" 
                    checked={checkedItems['f4-0']} 
                    onCheck={() => toggleCheck('f4-0')}
                    label="Instala Node.js si no lo tienes (nodejs.org)"
                    link="https://nodejs.org"
                  />
                  <MigrationCheckItem 
                    id="f4-1" 
                    checked={checkedItems['f4-1']} 
                    onCheck={() => toggleCheck('f4-1')}
                    label="Descomprime el ZIP de user_migration_scripts"
                  />
                  <MigrationCheckItem 
                    id="f4-1b" 
                    checked={checkedItems['f4-1b']} 
                    onCheck={() => toggleCheck('f4-1b')}
                    label="Crea una carpeta nueva y copia ahí create_users.js"
                  />
                  <MigrationCheckItem 
                    id="f4-2" 
                    checked={checkedItems['f4-2']} 
                    onCheck={() => toggleCheck('f4-2')}
                    label="Abre terminal en esa carpeta y ejecuta: npm init -y"
                  />
                  <MigrationCheckItem 
                    id="f4-2b" 
                    checked={checkedItems['f4-2b']} 
                    onCheck={() => toggleCheck('f4-2b')}
                    label="Ejecuta: npm install @supabase/supabase-js"
                  />
                  <MigrationCheckItem 
                    id="f4-3" 
                    checked={checkedItems['f4-3']} 
                    onCheck={() => toggleCheck('f4-3')}
                    label="Edita create_users.js - Pon tu SUPABASE_URL del nuevo proyecto"
                  />
                  <MigrationCheckItem 
                    id="f4-4" 
                    checked={checkedItems['f4-4']} 
                    onCheck={() => toggleCheck('f4-4')}
                    label="Edita create_users.js - Pon tu SERVICE_ROLE_KEY del nuevo proyecto"
                  />
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm font-medium mb-1">📝 ¿Dónde encuentro estos valores?</p>
                    <p className="text-sm text-muted-foreground">
                      En Supabase Dashboard → Settings → API → Project URL y service_role (secret)
                    </p>
                  </div>
                  <MigrationCheckItem 
                    id="f4-5" 
                    checked={checkedItems['f4-5']} 
                    onCheck={() => toggleCheck('f4-5')}
                    label="Ejecuta: node create_users.js"
                  />
                  <MigrationCheckItem 
                    id="f4-6" 
                    checked={checkedItems['f4-6']} 
                    onCheck={() => toggleCheck('f4-6')}
                    label="Verifica que todos los usuarios se crearon exitosamente"
                  />
                  <MigrationCheckItem 
                    id="f4-7" 
                    checked={checkedItems['f4-7']} 
                    onCheck={() => toggleCheck('f4-7')}
                    label="En Supabase Dashboard → Authentication → Users - Confirma que aparecen los usuarios"
                  />
                </div>
              </div>

              <Separator />

              {/* FASE 5 - Importar Datos */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                  <span className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-sm">5</span>
                  FASE 5: Importar Datos (CSVs)
                </h3>
                <p className="text-sm text-muted-foreground">
                  Elige uno de los dos métodos para importar los datos.
                </p>

                {/* Método A - Recomendado */}
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <h4 className="font-semibold text-green-700 dark:text-green-400 mb-2">
                    ✅ Método A: Desactivar FKs (RECOMENDADO)
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Desactiva temporalmente las restricciones FK para importar en cualquier orden.
                  </p>
                  <div className="space-y-2">
                    <MigrationCheckItem 
                      id="f5-a1" 
                      checked={checkedItems['f5-a1']} 
                      onCheck={() => toggleCheck('f5-a1')}
                      label="Ve a SQL Editor en Supabase Dashboard"
                    />
                    <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto">
                      <p className="text-muted-foreground mb-1">-- Ejecuta ANTES de importar:</p>
                      <p className="text-primary">SET session_replication_role = 'replica';</p>
                    </div>
                    <MigrationCheckItem 
                      id="f5-a2" 
                      checked={checkedItems['f5-a2']} 
                      onCheck={() => toggleCheck('f5-a2')}
                      label="Ejecuté el comando para desactivar FKs"
                    />
                    <MigrationCheckItem 
                      id="f5-a3" 
                      checked={checkedItems['f5-a3']} 
                      onCheck={() => toggleCheck('f5-a3')}
                      label="Importé todos los CSVs (cualquier orden funciona)"
                    />
                    <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto">
                      <p className="text-muted-foreground mb-1">-- Ejecuta DESPUÉS de importar:</p>
                      <p className="text-primary">SET session_replication_role = 'origin';</p>
                    </div>
                    <MigrationCheckItem 
                      id="f5-a4" 
                      checked={checkedItems['f5-a4']} 
                      onCheck={() => toggleCheck('f5-a4')}
                      label="Ejecuté el comando para reactivar FKs"
                    />
                  </div>
                </div>

                {/* Método B - Orden estricto */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-semibold text-muted-foreground mb-2">
                    📋 Método B: Orden Estricto (sin desactivar FKs)
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Si prefieres no desactivar FKs, sigue el orden exacto del archivo.
                  </p>
                  <div className="space-y-2">
                    <MigrationCheckItem 
                      id="f5-b1" 
                      checked={checkedItems['f5-b1']} 
                      onCheck={() => toggleCheck('f5-b1')}
                      label="Abre el archivo _IMPORT_ORDER.txt del ZIP"
                    />
                    <MigrationCheckItem 
                      id="f5-b2" 
                      checked={checkedItems['f5-b2']} 
                      onCheck={() => toggleCheck('f5-b2')}
                      label="Importé todas las tablas en orden exacto (01 a 34)"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* FASE 6 - Verificar Integridad */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2 text-amber-600">
                  <span className="bg-amber-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">6</span>
                  FASE 6: Verificar Integridad
                </h3>
                <p className="text-sm text-muted-foreground">
                  Ejecuta estas queries en SQL Editor para confirmar que no hay registros huérfanos.
                </p>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto max-h-48 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-muted-foreground">{`-- Verificar encounters sin patient
SELECT 'encounters sin patient' as check, COUNT(*) 
FROM encounters e
LEFT JOIN patients p ON e.patient_id = p.id
WHERE e.patient_id IS NOT NULL AND p.id IS NULL;

-- Verificar exam_eye sin encounter
SELECT 'exam_eye sin encounter' as check, COUNT(*)
FROM exam_eye ee
LEFT JOIN encounters e ON ee.encounter_id = e.id
WHERE ee.encounter_id IS NOT NULL AND e.id IS NULL;

-- Verificar crm_pipelines sin patient
SELECT 'crm_pipelines sin patient' as check, COUNT(*)
FROM crm_pipelines cp
LEFT JOIN patients p ON cp.patient_id = p.id
WHERE p.id IS NULL;

-- Verificar profiles sin user_id válido
SELECT 'profiles huérfanos' as check, COUNT(*)
FROM profiles p
LEFT JOIN auth.users u ON p.user_id = u.id
WHERE u.id IS NULL;`}</pre>
                </div>
                <div className="space-y-2 ml-9">
                  <MigrationCheckItem 
                    id="f6-verify" 
                    checked={checkedItems['f6-verify']} 
                    onCheck={() => toggleCheck('f6-verify')}
                    label="Ejecuté las queries y todos los counts son 0 ✓"
                  />
                </div>
              </div>

              <Separator />

              {/* FASE 7 - Storage */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                  <span className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-sm">7</span>
                  FASE 7: Subir Archivos de Storage
                </h3>
                <div className="space-y-2 ml-9">
                  <MigrationCheckItem 
                    id="f7-1" 
                    checked={checkedItems['f7-1']} 
                    onCheck={() => toggleCheck('f7-1')}
                    label="Ve a Storage en Supabase Dashboard"
                  />
                  <MigrationCheckItem 
                    id="f7-2" 
                    checked={checkedItems['f7-2']} 
                    onCheck={() => toggleCheck('f7-2')}
                    label="Crea los 4 buckets: documents, results, studies, surgeries"
                  />
                  <MigrationCheckItem 
                    id="f7-3" 
                    checked={checkedItems['f7-3']} 
                    onCheck={() => toggleCheck('f7-3')}
                    label="Descomprime cada ZIP de bucket exportado"
                  />
                  <MigrationCheckItem 
                    id="f7-4" 
                    checked={checkedItems['f7-4']} 
                    onCheck={() => toggleCheck('f7-4')}
                    label="Sube los archivos a cada bucket manteniendo la estructura de carpetas"
                  />
                </div>
              </div>

              <Separator />

              {/* FASE 8 - Configuración Final */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2 text-green-600">
                  <span className="bg-green-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">8</span>
                  FASE 8: Configuración Final
                </h3>
                <div className="bg-muted/50 rounded-lg p-4 mb-3">
                  <p className="text-sm font-semibold">Usuarios ya creados con el script</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Los usuarios deben usar "Olvidé mi contraseña" para crear una nueva contraseña.
                  </p>
                </div>
                <div className="space-y-2 ml-9">
                  <MigrationCheckItem 
                    id="f8-1" 
                    checked={checkedItems['f8-1']} 
                    onCheck={() => toggleCheck('f8-1')}
                    label="Ve a Authentication → Settings en el nuevo proyecto"
                  />
                  <MigrationCheckItem 
                    id="f8-2" 
                    checked={checkedItems['f8-2']} 
                    onCheck={() => toggleCheck('f8-2')}
                    label="Configura Site URL con la URL de tu aplicación"
                  />
                  <MigrationCheckItem 
                    id="f8-3" 
                    checked={checkedItems['f8-3']} 
                    onCheck={() => toggleCheck('f8-3')}
                    label="Actualiza el archivo .env con las nuevas credenciales"
                  />
                  <MigrationCheckItem 
                    id="f8-4" 
                    checked={checkedItems['f8-4']} 
                    onCheck={() => toggleCheck('f8-4')}
                    label="Notifica a los usuarios que deben resetear su contraseña"
                  />
                  <MigrationCheckItem 
                    id="f8-5" 
                    checked={checkedItems['f8-5']} 
                    onCheck={() => toggleCheck('f8-5')}
                    label="Prueba que el login funciona correctamente"
                  />
                </div>
              </div>

              <Separator />

              {/* Solución de Problemas */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                  Solución de Problemas
                </h3>
                <div className="space-y-4 ml-4">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="font-medium text-sm">❌ Error: "violates foreign key constraint"</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Causa: Intentaste importar sin desactivar FKs o en orden incorrecto
                    </p>
                    <p className="text-sm text-primary mt-1">
                      Solución: Usa Método A - ejecuta SET session_replication_role = 'replica' primero
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="font-medium text-sm">❌ Error: "User already exists"</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Causa: El script de usuarios ya se ejecutó previamente
                    </p>
                    <p className="text-sm text-primary mt-1">
                      Solución: Puedes ignorar o borrar usuarios existentes y re-ejecutar
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="font-medium text-sm">❌ Datos no aparecen en la aplicación</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Causa: Puede ser tema de políticas RLS
                    </p>
                    <p className="text-sm text-primary mt-1">
                      Solución: Verifica que las políticas RLS estén configuradas correctamente
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="font-medium text-sm">❌ Verificación muestra registros huérfanos</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Causa: Datos importados tienen referencias a registros que no existen
                    </p>
                    <p className="text-sm text-primary mt-1">
                      Solución: Usa el Validador de CSVs para identificar y resolver antes de importar
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Completion */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <div>
                    <h4 className="font-semibold text-green-700 dark:text-green-400">¡Migración Completa!</h4>
                    <p className="text-sm text-muted-foreground">
                      Una vez completados todos los pasos, tu sistema estará funcionando en el nuevo proyecto.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Migration Validator Dialog */}
      <MigrationValidator 
        open={showMigrationValidator} 
        onOpenChange={setShowMigrationValidator} 
      />
    </Card>
  );
}

// Helper component for migration checklist items
function MigrationCheckItem({ 
  id, 
  checked, 
  onCheck, 
  label, 
  link 
}: { 
  id: string; 
  checked?: boolean; 
  onCheck: () => void; 
  label: string;
  link?: string;
}) {
  return (
    <div className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 transition-colors">
      <Checkbox 
        id={id} 
        checked={checked} 
        onCheckedChange={onCheck}
        className="mt-0.5"
      />
      <label 
        htmlFor={id} 
        className={`text-sm cursor-pointer flex-1 ${checked ? 'line-through text-muted-foreground' : ''}`}
      >
        {label}
        {link && (
          <a 
            href={link} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="ml-2 text-primary hover:underline inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </label>
      {checked && <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />}
    </div>
  );
}