export type AppRole = 'admin' | 'doctor' | 'nurse' | 'reception' | 'diagnostico' | 'caja' | 'contabilidad' | 'estudios';
export type RoomKind = 'consultorio' | 'diagnostico' | 'quirofano';
export type AppointmentType = 'consulta' | 'diagnostico' | 'cirugia' | 'control' | 'nueva_consulta' | 'reconsulta_menos_3m' | 'reconsulta_mas_3m' | 'post_operado' | 'lectura_resultados' | 'cortesia' | 'procedimiento' | 'estudio';
export type AppointmentStatus = 'scheduled' | 'checked_in' | 'preconsulta_ready' | 'done' | 'cancelled' | 'no_show';
export type EncounterType = 'consulta' | 'posop' | 'urgencia' | 'quirurgico';
export type EyeSide = 'OD' | 'OI' | 'OU';
export type OrderKind = 'topografia' | 'OCT' | 'campovisual' | 'biometria' | 'otro';
export type OrderPriority = 'normal' | 'alta' | 'urgente';
export type OrderStatus = 'ordered' | 'done' | 'reported' | 'cancelled';
export type DocumentKind = 'receta' | 'receta_lentes' | 'orden_estudio';
export type BranchCode = 'central' | 'santa_lucia';

export interface Branch {
  id: string;
  code: BranchCode;
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserBranch {
  id: string;
  user_id: string;
  branch_id: string;
  created_at: string;
  branch?: Branch;
}

export interface Patient {
  id: string;
  code?: string;
  first_name: string;
  last_name: string;
  dob?: string;
  phone?: string;
  email?: string;
  address?: string;
  occupation?: string;
  allergies: string;
  notes: string;
  ophthalmic_history: string;
  diabetes?: boolean;
  hta?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  specialty?: string;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  active: boolean;
  branch_id: string;
  created_at: string;
  updated_at: string;
  branch?: Branch;
}

export interface Appointment {
  id: string;
  patient_id: string;
  room_id?: string;
  doctor_id?: string;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  reason?: string;
  type: AppointmentType;
  status: AppointmentStatus;
  autorefractor?: string;
  lensometry?: string;
  od_text?: string;
  os_text?: string;
  photo_od?: string;
  photo_oi?: string;
  post_op_type?: string;
  keratometry_od_k1?: string;
  keratometry_od_k2?: string;
  keratometry_os_k1?: string;
  keratometry_os_k2?: string;
  pio_od?: number;
  pio_os?: number;
  is_courtesy?: boolean;
  reception_notes?: string;
  external_doctor_name?: string;
  created_at: string;
  updated_at: string;
  patient?: Patient;
  room?: Room;
  doctor?: Profile;
  branch?: Branch;
}

export interface Encounter {
  id: string;
  patient_id: string;
  date: string;
  type: EncounterType;
  doctor_id?: string;
  appointment_id?: string; // NEW: Link to specific appointment
  summary: string;
  plan_tratamiento?: string;
  cirugias?: string;
  estudios?: string;
  proxima_cita?: string;
  motivo_consulta?: string;
  excursiones_od?: string;
  excursiones_os?: string;
  created_at: string;
  updated_at: string;
  patient?: Patient;
  doctor?: Profile;
}

export interface ExamEye {
  id: string;
  encounter_id: string;
  side: EyeSide;
  av_sc?: string;
  av_cc?: string;
  ref_sphere?: number;
  ref_cyl?: number;
  ref_axis?: number;
  ref_subj_sphere?: number;
  ref_subj_cyl?: number;
  ref_subj_axis?: number;
  rx_sphere?: number;
  rx_cyl?: number;
  rx_axis?: number;
  rx_add?: number;
  iop?: number;
  slit_lamp?: string;
  fundus?: string;
  plan?: string;
  created_at: string;
  updated_at: string;
}

export interface Diagnosis {
  id: string;
  encounter_id: string;
  code?: string;
  label: string;
  created_at: string;
}

export interface Order {
  id: string;
  encounter_id: string;
  kind: OrderKind;
  priority: OrderPriority;
  side: EyeSide;
  status: OrderStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Result {
  id: string;
  order_id: string;
  file_path: string;
  mime_type?: string;
  side: EyeSide;
  extracted_summary?: string;
  created_at: string;
}

export interface Document {
  id: string;
  encounter_id: string;
  kind: DocumentKind;
  file_path: string;
  created_by?: string;
  created_at: string;
}

export interface Template {
  id: string;
  kind: DocumentKind;
  name: string;
  body: any;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  target_table?: string;
  target_id?: string;
  meta?: any;
  created_at: string;
}
