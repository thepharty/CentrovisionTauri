/**
 * Data Source Abstraction Layer
 *
 * This module provides a unified interface for data access that works
 * both in web mode (Supabase) and desktop mode (Tauri + SQLite).
 */

// Check if running in Tauri environment
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

// Types matching Rust structs
export interface Branch {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  active: boolean;
}

export interface Room {
  id: string;
  name: string;
  kind: string;
  branch_id: string;
  active: boolean;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  specialty: string | null;
  gender: string | null;
  is_visible_in_dashboard: boolean;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: string;
}

export interface Patient {
  id: string;
  code: string | null;
  first_name: string;
  last_name: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
  allergies: string | null;
  notes: string | null;
  address: string | null;
  diabetes: boolean;
  hta: boolean;
  ophthalmic_history: string | null;
  occupation: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Appointment {
  id: string;
  patient_id: string | null;
  room_id: string | null;
  doctor_id: string | null;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  appointment_type: string;
  status: string;
  patient_name: string | null;
  doctor_name: string | null;
  room_name: string | null;
}

export interface SyncStatus {
  last_sync: string | null;
  pending_changes: number;
  is_online: boolean;
}

export interface SyncResult {
  success: boolean;
  tables_synced: string[];
  records_count: Record<string, number>;
  error: string | null;
}

// Connection status for dual-mode (Supabase + Local PostgreSQL)
export interface ConnectionStatus {
  mode: 'supabase' | 'local' | 'offline';
  supabase_available: boolean;
  local_available: boolean;
  local_server_ip: string | null;
  description: string;
}

// Sync pending status from PostgreSQL _sync_pending table (Phase 21)
export interface SyncPendingByTable {
  table_name: string;
  count: number;
}

export interface SyncPendingStatus {
  total_pending: number;
  by_table: SyncPendingByTable[];
}

// Detailed sync pending info for admin debugging
export interface SyncPendingDetail {
  id: string;
  table_name: string;
  record_id: string;
  operation: string;
  created_at: string;
}

// Lazy import for Tauri invoke
let tauriInvoke: typeof import('@tauri-apps/api/core').invoke | null = null;

async function getInvoke() {
  if (!tauriInvoke && isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    tauriInvoke = invoke;
  }
  return tauriInvoke;
}

/**
 * Invoke a Tauri command
 */
export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = await getInvoke();
  if (!invoke) {
    throw new Error('Tauri invoke not available');
  }
  return invoke<T>(command, args);
}

// ============================================================
// DATA ACCESS FUNCTIONS
// ============================================================

/**
 * Get sync status from local database
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  if (!isTauri()) {
    return { last_sync: null, pending_changes: 0, is_online: true };
  }
  return invokeCommand<SyncStatus>('get_sync_status');
}

/**
 * Check network connectivity
 */
export async function checkNetworkStatus(): Promise<boolean> {
  if (!isTauri()) {
    return navigator.onLine;
  }
  return invokeCommand<boolean>('check_network_status');
}

/**
 * Get connection status (supabase, local, or offline)
 */
export async function getConnectionStatus(): Promise<ConnectionStatus> {
  if (!isTauri()) {
    return {
      mode: navigator.onLine ? 'supabase' : 'offline',
      supabase_available: navigator.onLine,
      local_available: false,
      local_server_ip: null,
      description: navigator.onLine ? 'Conectado a la nube' : 'Sin conexión',
    };
  }
  return invokeCommand<ConnectionStatus>('get_connection_status');
}

/**
 * Get sync pending status from PostgreSQL _sync_pending table
 * This shows how many changes are waiting to be synced to Supabase
 */
export async function getSyncPendingStatus(): Promise<SyncPendingStatus> {
  if (!isTauri()) {
    return { total_pending: 0, by_table: [] };
  }
  return invokeCommand<SyncPendingStatus>('get_sync_pending_count');
}

/**
 * Get detailed sync pending items for admin debugging
 * Shows record IDs and operations to help diagnose sync issues
 */
export async function getSyncPendingDetails(limit?: number): Promise<SyncPendingDetail[]> {
  if (!isTauri()) {
    return [];
  }
  return invokeCommand<SyncPendingDetail[]>('get_sync_pending_details', { limit: limit ?? 50 });
}

/**
 * Trigger initial sync from Supabase to local SQLite
 */
export async function triggerInitialSync(apiKey: string): Promise<SyncResult> {
  if (!isTauri()) {
    throw new Error('Initial sync only available in Tauri mode');
  }
  return invokeCommand<SyncResult>('trigger_initial_sync', { apiKey });
}

/**
 * Get all active branches
 */
export async function getBranches(): Promise<Branch[]> {
  if (!isTauri()) {
    // In web mode, this will be handled by the existing hook
    throw new Error('Use useBranch hook in web mode');
  }
  return invokeCommand<Branch[]>('get_branches');
}

/**
 * Get rooms for a specific branch
 */
export async function getRooms(branchId: string): Promise<Room[]> {
  if (!isTauri()) {
    throw new Error('Use Supabase query in web mode');
  }
  return invokeCommand<Room[]>('get_rooms', { branchId });
}

/**
 * Get patients with optional search
 */
export async function getPatients(search?: string, limit?: number): Promise<Patient[]> {
  if (!isTauri()) {
    throw new Error('Use Supabase query in web mode');
  }
  return invokeCommand<Patient[]>('get_patients', { search, limit });
}

/**
 * Get patient by ID
 */
export async function getPatientById(id: string): Promise<Patient | null> {
  if (!isTauri()) {
    throw new Error('Use Supabase query in web mode');
  }
  return invokeCommand<Patient | null>('get_patient_by_id', { id });
}

/**
 * Get appointments for a branch and date
 */
export async function getAppointments(branchId: string, date: string): Promise<Appointment[]> {
  if (!isTauri()) {
    throw new Error('Use Supabase query in web mode');
  }
  return invokeCommand<Appointment[]>('get_appointments', { branchId, date });
}

/**
 * Get all doctors (profiles with doctor role)
 */
export async function getDoctors(): Promise<Profile[]> {
  if (!isTauri()) {
    throw new Error('Use Supabase query in web mode');
  }
  return invokeCommand<Profile[]>('get_doctors');
}

/**
 * Get user roles
 */
export async function getUserRoles(userId: string): Promise<UserRole[]> {
  if (!isTauri()) {
    throw new Error('Use Supabase query in web mode');
  }
  return invokeCommand<UserRole[]>('get_user_roles', { userId });
}

// ============================================================
// WRITE OPERATIONS (Tauri Only)
// ============================================================

export interface PatientInput {
  first_name: string;
  last_name: string;
  dob?: string;
  phone?: string;
  email?: string;
  allergies?: string;
  notes?: string;
  address?: string;
  diabetes?: boolean;
  hta?: boolean;
  ophthalmic_history?: string;
  occupation?: string;
}

export interface PatientUpdate {
  first_name?: string;
  last_name?: string;
  dob?: string;
  phone?: string;
  email?: string;
  allergies?: string;
  notes?: string;
  address?: string;
  diabetes?: boolean;
  hta?: boolean;
  ophthalmic_history?: string;
  occupation?: string;
}

export interface AppointmentInput {
  patient_id?: string;
  room_id?: string;
  doctor_id?: string;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  reason?: string;
  type: string;
  status?: string;
}

export interface AppointmentUpdate {
  patient_id?: string;
  room_id?: string;
  doctor_id?: string;
  starts_at?: string;
  ends_at?: string;
  reason?: string;
  type?: string;
  status?: string;
}

export interface SyncUploadResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

/**
 * Create a new patient (local + sync queue)
 */
export async function createPatient(patient: PatientInput): Promise<Patient> {
  if (!isTauri()) {
    throw new Error('Use Supabase mutation in web mode');
  }
  return invokeCommand<Patient>('create_patient', { patient });
}

/**
 * Update an existing patient (local + sync queue)
 */
export async function updatePatient(id: string, updates: PatientUpdate): Promise<Patient> {
  if (!isTauri()) {
    throw new Error('Use Supabase mutation in web mode');
  }
  return invokeCommand<Patient>('update_patient', { id, updates });
}

/**
 * Create a new appointment (local + sync queue)
 */
export async function createAppointment(appointment: AppointmentInput): Promise<Appointment> {
  if (!isTauri()) {
    throw new Error('Use Supabase mutation in web mode');
  }
  return invokeCommand<Appointment>('create_appointment', { appointment });
}

/**
 * Update an existing appointment (local + sync queue)
 */
export async function updateAppointment(id: string, updates: AppointmentUpdate): Promise<Appointment> {
  if (!isTauri()) {
    throw new Error('Use Supabase mutation in web mode');
  }
  return invokeCommand<Appointment>('update_appointment', { id, updates });
}

/**
 * Delete an appointment (soft delete, local + sync queue)
 */
export async function deleteAppointment(id: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('Use Supabase mutation in web mode');
  }
  return invokeCommand<void>('delete_appointment', { id });
}

/**
 * Process pending sync queue items
 */
export async function processSyncQueue(apiKey: string): Promise<SyncUploadResult> {
  if (!isTauri()) {
    throw new Error('Sync queue only available in Tauri mode');
  }
  return invokeCommand<SyncUploadResult>('process_sync_queue', { apiKey });
}

/**
 * Get count of pending sync items
 */
export async function getPendingSyncCount(): Promise<number> {
  if (!isTauri()) {
    return 0;
  }
  return invokeCommand<number>('get_pending_sync_count');
}

// ============================================================
// AUTHENTICATION (Tauri Only)
// ============================================================

export interface CachedSession {
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  roles: string[];
  full_name: string | null;
  cached_at: string;
}

export interface CachedUser {
  id: string;
  email: string;
  roles: string[];
  full_name: string | null;
}

/**
 * Cache auth session to secure storage (Tauri only)
 */
export async function cacheAuthSession(
  userId: string,
  email: string,
  accessToken: string,
  refreshToken: string,
  roles: string[],
  fullName?: string
): Promise<void> {
  if (!isTauri()) return;
  return invokeCommand<void>('cache_auth_session', {
    userId,
    email,
    accessToken,
    refreshToken,
    roles,
    fullName: fullName ?? null,
  });
}

/**
 * Get cached session if valid (Tauri only)
 */
export async function getCachedSession(): Promise<CachedSession | null> {
  if (!isTauri()) return null;
  return invokeCommand<CachedSession | null>('get_cached_session');
}

/**
 * Clear cached session on logout (Tauri only)
 */
export async function clearCachedSession(): Promise<void> {
  if (!isTauri()) return;
  return invokeCommand<void>('clear_cached_session');
}

/**
 * Check if we have a valid cached session (Tauri only)
 */
export async function hasValidCachedSession(): Promise<boolean> {
  if (!isTauri()) return false;
  return invokeCommand<boolean>('has_valid_cached_session');
}

/**
 * Get cached user info without tokens (Tauri only)
 */
export async function getCachedUser(): Promise<CachedUser | null> {
  if (!isTauri()) return null;
  return invokeCommand<CachedUser | null>('get_cached_user');
}

// ============================================================
// WRITE-THROUGH CACHE (Save Supabase data to SQLite)
// ============================================================

export interface AppointmentCache {
  id: string;
  patient_id: string | null;
  room_id: string | null;
  doctor_id: string | null;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  type: string;
  status: string;
  is_courtesy?: boolean;
  post_op_type?: string | null;
  reception_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Save appointments from Supabase to local SQLite cache
 * This is called after fetching appointments online to keep SQLite up to date
 */
export async function saveAppointmentsToSqlite(appointments: AppointmentCache[]): Promise<number> {
  if (!isTauri()) return 0;
  try {
    return await invokeCommand<number>('save_appointments_to_sqlite', { appointments });
  } catch (error) {
    console.warn('Failed to save appointments to SQLite cache:', error);
    return 0;
  }
}

/**
 * Remove an appointment from SQLite cache (after successful sync)
 */
export async function removeAppointmentFromSqlite(id: string): Promise<void> {
  if (!isTauri()) return;
  try {
    return await invokeCommand<void>('remove_appointment_from_sqlite', { id });
  } catch (error) {
    console.warn('Failed to remove appointment from SQLite cache:', error);
  }
}

/**
 * Get appointments from SQLite (for offline use)
 */
export async function getAppointmentsFromSqlite(branchId: string, date: string): Promise<Appointment[]> {
  if (!isTauri()) return [];
  try {
    return await invokeCommand<Appointment[]>('get_appointments', { branchId, date });
  } catch (error) {
    console.warn('Failed to get appointments from SQLite:', error);
    return [];
  }
}

// ============================================================
// LOCAL STORAGE (Phase 22) - For offline file storage
// ============================================================

export interface LocalStorageResult {
  success: boolean;
  local_path: string;
  bucket: string;
  file_path: string;
}

export interface LocalStorageStatus {
  enabled: boolean;
  smb_path: string | null;
  is_accessible: boolean;
}

/**
 * Upload a file to local SMB storage (for offline use)
 * The sync service will later upload this to Supabase Storage
 */
export async function uploadFileToLocalStorage(
  bucket: string,
  filePath: string,
  fileData: Uint8Array
): Promise<LocalStorageResult> {
  if (!isTauri()) {
    throw new Error('Local storage only available in Tauri mode');
  }
  return invokeCommand<LocalStorageResult>('upload_file_to_local_storage', {
    bucket,
    filePath,
    fileData: Array.from(fileData), // Convert Uint8Array to array for serialization
  });
}

/**
 * Read a file from local SMB storage
 */
export async function readFileFromLocalStorage(
  bucket: string,
  filePath: string
): Promise<Uint8Array> {
  if (!isTauri()) {
    throw new Error('Local storage only available in Tauri mode');
  }
  const data = await invokeCommand<number[]>('read_file_from_local_storage', {
    bucket,
    filePath,
  });
  return new Uint8Array(data);
}

/**
 * Check if local storage is available and accessible
 */
export async function getLocalStorageStatus(): Promise<LocalStorageStatus> {
  if (!isTauri()) {
    return { enabled: false, smb_path: null, is_accessible: false };
  }
  return invokeCommand<LocalStorageStatus>('get_local_storage_status');
}

/**
 * List files in a bucket from local storage
 */
export async function listLocalStorageFiles(
  bucket: string,
  prefix?: string
): Promise<string[]> {
  if (!isTauri()) {
    return [];
  }
  return invokeCommand<string[]>('list_local_storage_files', {
    bucket,
    prefix,
  });
}

// ============================================================
// CRM FUNCTIONS (PostgreSQL Local)
// ============================================================

export interface CRMPipelineLocal {
  id: string;
  patient_id: string;
  procedure_type_id: string;
  doctor_id: string | null;
  branch_id: string;
  current_stage: string;
  eye_side: string;
  status: string;
  priority: string;
  notes: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_code: string | null;
  patient_phone: string | null;
  procedure_type_name: string | null;
  procedure_type_color: string | null;
  doctor_full_name: string | null;
  branch_name: string | null;
}

/**
 * Get CRM pipelines from PostgreSQL local
 */
export async function getCRMPipelines(branchId: string, status?: string): Promise<CRMPipelineLocal[]> {
  if (!isTauri()) {
    throw new Error('Use Supabase query in web mode');
  }
  return invokeCommand<CRMPipelineLocal[]>('get_crm_pipelines', { branchId, status });
}

// ============================================================
// ROOMS FUNCTION (PostgreSQL Local)
// ============================================================

/**
 * Get rooms from PostgreSQL local
 */
export async function getRoomsLocal(branchId: string): Promise<Room[]> {
  if (!isTauri()) {
    throw new Error('Use Supabase query in web mode');
  }
  return invokeCommand<Room[]>('get_rooms', { branchId });
}

/**
 * Get doctors/profiles from PostgreSQL local
 */
export async function getDoctorsLocal(): Promise<Profile[]> {
  if (!isTauri()) {
    throw new Error('Use Supabase query in web mode');
  }
  return invokeCommand<Profile[]>('get_doctors');
}
