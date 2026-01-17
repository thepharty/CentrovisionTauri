/**
 * Mapa completo de Foreign Keys por tabla
 * Usado para validación pre-importación de migración
 */

export interface ForeignKeyMapping {
  column: string;
  refTable: string;
  refColumn: string;
  nullable: boolean;
}

export const FK_MAPPING: Record<string, ForeignKeyMapping[]> = {
  // Configuración - Sin dependencias o dependencias simples
  branches: [],
  suppliers: [],
  patients: [],
  service_prices: [],
  study_types: [],
  surgery_types: [],
  procedure_types: [],
  templates: [],
  app_settings: [],
  edge_function_settings: [
    { column: 'disabled_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  
  // Perfiles y usuarios
  profiles: [
    { column: 'user_id', refTable: 'auth.users', refColumn: 'id', nullable: false },
  ],
  user_roles: [
    { column: 'user_id', refTable: 'auth.users', refColumn: 'id', nullable: false },
  ],
  user_branches: [
    { column: 'user_id', refTable: 'auth.users', refColumn: 'id', nullable: false },
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
  ],
  
  // Salas
  rooms: [
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
  ],
  
  // CRM
  crm_procedure_types: [],
  crm_pipelines: [
    { column: 'patient_id', refTable: 'patients', refColumn: 'id', nullable: false },
    { column: 'procedure_type_id', refTable: 'crm_procedure_types', refColumn: 'id', nullable: false },
    { column: 'doctor_id', refTable: 'profiles', refColumn: 'user_id', nullable: true },
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  crm_pipeline_stages: [
    { column: 'pipeline_id', refTable: 'crm_pipelines', refColumn: 'id', nullable: false },
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
    { column: 'updated_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  crm_pipeline_notes: [
    { column: 'pipeline_id', refTable: 'crm_pipelines', refColumn: 'id', nullable: false },
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  crm_activity_log: [
    { column: 'pipeline_id', refTable: 'crm_pipelines', refColumn: 'id', nullable: false },
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  crm_activity_read: [
    { column: 'user_id', refTable: 'auth.users', refColumn: 'id', nullable: false },
  ],
  
  // Inventario Sala
  room_inventory_categories: [
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'parent_id', refTable: 'room_inventory_categories', refColumn: 'id', nullable: true },
  ],
  room_inventory_items: [
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'category_id', refTable: 'room_inventory_categories', refColumn: 'id', nullable: false },
  ],
  room_inventory_movements: [
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'item_id', refTable: 'room_inventory_items', refColumn: 'id', nullable: false },
    { column: 'user_id', refTable: 'auth.users', refColumn: 'id', nullable: true },
  ],
  
  // Inventario Caja
  inventory_items: [
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'supplier_id', refTable: 'suppliers', refColumn: 'id', nullable: true },
  ],
  inventory_lots: [
    { column: 'item_id', refTable: 'inventory_items', refColumn: 'id', nullable: false },
  ],
  inventory_movements: [
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'item_id', refTable: 'inventory_items', refColumn: 'id', nullable: false },
    { column: 'lot_id', refTable: 'inventory_lots', refColumn: 'id', nullable: true },
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  
  // Citas
  appointments: [
    { column: 'patient_id', refTable: 'patients', refColumn: 'id', nullable: true },
    { column: 'room_id', refTable: 'rooms', refColumn: 'id', nullable: true },
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'doctor_id', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  schedule_blocks: [
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'room_id', refTable: 'rooms', refColumn: 'id', nullable: true },
    { column: 'doctor_id', refTable: 'profiles', refColumn: 'user_id', nullable: true },
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  
  // Clínico
  encounters: [
    { column: 'patient_id', refTable: 'patients', refColumn: 'id', nullable: true },
    { column: 'appointment_id', refTable: 'appointments', refColumn: 'id', nullable: true },
    { column: 'doctor_id', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  exam_eye: [
    { column: 'encounter_id', refTable: 'encounters', refColumn: 'id', nullable: true },
  ],
  diagnoses: [
    { column: 'encounter_id', refTable: 'encounters', refColumn: 'id', nullable: true },
  ],
  surgeries: [
    { column: 'encounter_id', refTable: 'encounters', refColumn: 'id', nullable: false },
  ],
  surgery_files: [
    { column: 'surgery_id', refTable: 'surgeries', refColumn: 'id', nullable: false },
  ],
  procedures: [
    { column: 'encounter_id', refTable: 'encounters', refColumn: 'id', nullable: false },
  ],
  studies: [
    { column: 'patient_id', refTable: 'patients', refColumn: 'id', nullable: false },
    { column: 'appointment_id', refTable: 'appointments', refColumn: 'id', nullable: true },
  ],
  study_files: [
    { column: 'study_id', refTable: 'studies', refColumn: 'id', nullable: false },
  ],
  orders: [
    { column: 'encounter_id', refTable: 'encounters', refColumn: 'id', nullable: false },
  ],
  results: [
    { column: 'order_id', refTable: 'orders', refColumn: 'id', nullable: false },
  ],
  documents: [
    { column: 'encounter_id', refTable: 'encounters', refColumn: 'id', nullable: false },
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  
  // Facturación
  invoices: [
    { column: 'patient_id', refTable: 'patients', refColumn: 'id', nullable: true },
    { column: 'appointment_id', refTable: 'appointments', refColumn: 'id', nullable: true },
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  invoice_items: [
    { column: 'invoice_id', refTable: 'invoices', refColumn: 'id', nullable: true },
  ],
  payments: [
    { column: 'invoice_id', refTable: 'invoices', refColumn: 'id', nullable: false },
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  cash_closures: [
    { column: 'branch_id', refTable: 'branches', refColumn: 'id', nullable: false },
    { column: 'closed_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
  
  // Sistema
  audit_logs: [
    { column: 'user_id', refTable: 'auth.users', refColumn: 'id', nullable: true },
  ],
  pending_registrations: [],
  backup_snapshots: [
    { column: 'created_by', refTable: 'profiles', refColumn: 'user_id', nullable: true },
  ],
};

// Orden de importación (ya definido en DataExporter, aquí para referencia)
export const IMPORT_ORDER = [
  'branches',
  'suppliers', 
  'patients',
  'service_prices',
  'study_types',
  'surgery_types',
  'procedure_types',
  'templates',
  'app_settings',
  'crm_procedure_types',
  'profiles',
  'user_roles',
  'user_branches',
  'rooms',
  'edge_function_settings',
  'room_inventory_categories',
  'room_inventory_items',
  'room_inventory_movements',
  'inventory_items',
  'inventory_lots',
  'appointments',
  'schedule_blocks',
  'crm_pipelines',
  'crm_pipeline_stages',
  'crm_pipeline_notes',
  'crm_activity_log',
  'crm_activity_read',
  'encounters',
  'exam_eye',
  'diagnoses',
  'surgeries',
  'surgery_files',
  'procedures',
  'studies',
  'study_files',
  'orders',
  'results',
  'documents',
  'invoices',
  'invoice_items',
  'payments',
  'inventory_movements',
  'cash_closures',
  'audit_logs',
  'pending_registrations',
  'backup_snapshots',
];

// Tablas con referencia DIRECTA a auth.users (6 tablas)
export const AUTH_USER_DIRECT_TABLES: { table: string; column: string; nullable: boolean }[] = [
  { table: 'profiles', column: 'user_id', nullable: false },
  { table: 'user_roles', column: 'user_id', nullable: false },
  { table: 'user_branches', column: 'user_id', nullable: false },
  { table: 'crm_activity_read', column: 'user_id', nullable: false },
  { table: 'room_inventory_movements', column: 'user_id', nullable: true },
  { table: 'audit_logs', column: 'user_id', nullable: true },
];

// Tablas con referencia INDIRECTA a auth.users (vía profiles.user_id) - 14 tablas
export const AUTH_USER_INDIRECT_TABLES: { table: string; columns: string[] }[] = [
  { table: 'edge_function_settings', columns: ['disabled_by'] },
  { table: 'crm_pipelines', columns: ['doctor_id', 'created_by'] },
  { table: 'crm_pipeline_stages', columns: ['created_by', 'updated_by'] },
  { table: 'crm_pipeline_notes', columns: ['created_by'] },
  { table: 'crm_activity_log', columns: ['created_by'] },
  { table: 'appointments', columns: ['doctor_id'] },
  { table: 'schedule_blocks', columns: ['doctor_id', 'created_by'] },
  { table: 'encounters', columns: ['doctor_id'] },
  { table: 'inventory_movements', columns: ['created_by'] },
  { table: 'documents', columns: ['created_by'] },
  { table: 'invoices', columns: ['created_by'] },
  { table: 'payments', columns: ['created_by'] },
  { table: 'cash_closures', columns: ['closed_by'] },
  { table: 'backup_snapshots', columns: ['created_by'] },
];

// Todos los nombres de tablas que dependen de usuarios (para backwards compatibility)
export const AUTH_USER_TABLES = [
  ...AUTH_USER_DIRECT_TABLES.map(t => t.table),
  ...AUTH_USER_INDIRECT_TABLES.map(t => t.table),
];

// Conteos para métricas
export const AUTH_USER_STATS = {
  directTables: AUTH_USER_DIRECT_TABLES.length,
  indirectTables: AUTH_USER_INDIRECT_TABLES.length,
  totalTables: AUTH_USER_DIRECT_TABLES.length + AUTH_USER_INDIRECT_TABLES.length,
  directColumns: AUTH_USER_DIRECT_TABLES.length, // 1 column each
  indirectColumns: AUTH_USER_INDIRECT_TABLES.reduce((sum, t) => sum + t.columns.length, 0),
  totalColumns: AUTH_USER_DIRECT_TABLES.length + AUTH_USER_INDIRECT_TABLES.reduce((sum, t) => sum + t.columns.length, 0),
};

/**
 * Genera el script SQL para desactivar/reactivar FKs durante importación
 */
export function generateSafeImportScript(): string {
  return `-- ============================================
-- SCRIPT DE IMPORTACIÓN SEGURA
-- ============================================
-- Este script desactiva temporalmente la validación de FKs
-- para permitir importar datos en cualquier orden sin errores.
-- 
-- INSTRUCCIONES:
-- 1. Ejecuta la Parte 1 ANTES de importar CSVs
-- 2. Importa todos los CSVs desde Table Editor
-- 3. Ejecuta la Parte 2 DESPUÉS de importar todo
-- 4. Ejecuta la Parte 3 para verificar integridad
-- ============================================

-- ==========================================
-- PARTE 1: DESACTIVAR VALIDACIÓN DE FKs
-- ==========================================
-- Ejecuta esto ANTES de importar cualquier CSV

SET session_replication_role = 'replica';

-- Ahora puedes importar los CSVs en cualquier orden
-- sin errores de foreign key.

-- ==========================================
-- PARTE 2: REACTIVAR VALIDACIÓN DE FKs
-- ==========================================
-- Ejecuta esto DESPUÉS de importar TODOS los CSVs

SET session_replication_role = 'origin';

-- ==========================================
-- PARTE 3: VERIFICACIÓN DE INTEGRIDAD
-- ==========================================
-- Ejecuta estos queries para encontrar huérfanos
-- (registros con referencias inválidas)

-- Verificar encounters huérfanos (sin patient)
SELECT 'encounters sin patient' as check_name, COUNT(*) as orphan_count
FROM encounters e
LEFT JOIN patients p ON e.patient_id = p.id
WHERE e.patient_id IS NOT NULL AND p.id IS NULL;

-- Verificar exam_eye huérfanos (sin encounter)
SELECT 'exam_eye sin encounter' as check_name, COUNT(*) as orphan_count
FROM exam_eye ee
LEFT JOIN encounters e ON ee.encounter_id = e.id
WHERE ee.encounter_id IS NOT NULL AND e.id IS NULL;

-- Verificar crm_pipelines huérfanos (sin patient)
SELECT 'crm_pipelines sin patient' as check_name, COUNT(*) as orphan_count
FROM crm_pipelines cp
LEFT JOIN patients p ON cp.patient_id = p.id
WHERE p.id IS NULL;

-- Verificar invoices huérfanos (sin patient)
SELECT 'invoices sin patient' as check_name, COUNT(*) as orphan_count
FROM invoices i
LEFT JOIN patients p ON i.patient_id = p.id
WHERE i.patient_id IS NOT NULL AND p.id IS NULL;

-- Verificar appointments huérfanos (sin patient)
SELECT 'appointments sin patient' as check_name, COUNT(*) as orphan_count
FROM appointments a
LEFT JOIN patients p ON a.patient_id = p.id
WHERE a.patient_id IS NOT NULL AND p.id IS NULL;

-- Verificar surgeries huérfanos (sin encounter)
SELECT 'surgeries sin encounter' as check_name, COUNT(*) as orphan_count
FROM surgeries s
LEFT JOIN encounters e ON s.encounter_id = e.id
WHERE e.id IS NULL;

-- Verificar procedures huérfanos (sin encounter)
SELECT 'procedures sin encounter' as check_name, COUNT(*) as orphan_count
FROM procedures pr
LEFT JOIN encounters e ON pr.encounter_id = e.id
WHERE e.id IS NULL;

-- Verificar studies huérfanos (sin patient)
SELECT 'studies sin patient' as check_name, COUNT(*) as orphan_count
FROM studies st
LEFT JOIN patients p ON st.patient_id = p.id
WHERE p.id IS NULL;

-- Si todos los counts son 0, la importación fue exitosa!
`;
}
