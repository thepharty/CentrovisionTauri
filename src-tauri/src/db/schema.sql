-- ============================================================
-- ESQUEMA SQLite - CentroVisión EHR (Offline)
-- ============================================================
-- Convertido desde PostgreSQL para uso local offline
-- ============================================================

-- ============================================================
-- TABLAS DE SINCRONIZACIÓN (Nuevas para offline)
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    synced INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(synced) WHERE synced = 0;

-- ============================================================
-- TABLAS DE CONFIGURACIÓN
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    address TEXT,
    phone TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT,
    local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'consultorio',
    branch_id TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT,
    local_only INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rooms_branch ON rooms(branch_id);

-- ============================================================
-- USUARIOS Y PERFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    specialty TEXT,
    gender TEXT,
    is_visible_in_dashboard INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT,
    local_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_roles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT,
    local_only INTEGER DEFAULT 0,
    UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS user_branches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT,
    local_only INTEGER DEFAULT 0,
    UNIQUE (user_id, branch_id)
);

-- ============================================================
-- PACIENTES
-- ============================================================

CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    dob TEXT,
    phone TEXT,
    email TEXT,
    allergies TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    address TEXT,
    diabetes INTEGER DEFAULT 0,
    hta INTEGER DEFAULT 0,
    ophthalmic_history TEXT DEFAULT '',
    occupation TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    synced_at TEXT,
    local_only INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(code);
CREATE INDEX IF NOT EXISTS idx_patients_names ON patients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(id) WHERE deleted_at IS NULL;

-- ============================================================
-- CITAS Y AGENDA
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    room_id TEXT,
    doctor_id TEXT,
    branch_id TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    reason TEXT,
    type TEXT NOT NULL DEFAULT 'consulta',
    status TEXT NOT NULL DEFAULT 'scheduled',
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
    pio_od REAL,
    pio_os REAL,
    is_courtesy INTEGER DEFAULT 0,
    reception_notes TEXT,
    external_doctor_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    synced_at TEXT,
    local_only INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_dates ON appointments(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_appointments_branch ON appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);

-- ============================================================
-- ENCUENTROS CLÍNICOS
-- ============================================================

CREATE TABLE IF NOT EXISTS encounters (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    appointment_id TEXT,
    doctor_id TEXT,
    type TEXT NOT NULL DEFAULT 'consulta',
    date TEXT DEFAULT (datetime('now')),
    motivo_consulta TEXT,
    estudios TEXT,
    cirugias TEXT,
    plan_tratamiento TEXT,
    interpretacion_resultados TEXT,
    summary TEXT,
    proxima_cita TEXT,
    excursiones_od TEXT,
    excursiones_os TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    synced_at TEXT,
    local_only INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_appointment ON encounters(appointment_id);

-- ============================================================
-- EXAMEN OCULAR
-- ============================================================

CREATE TABLE IF NOT EXISTS exam_eye (
    id TEXT PRIMARY KEY,
    encounter_id TEXT,
    side TEXT NOT NULL DEFAULT 'OD',
    av_sc TEXT,
    av_cc TEXT,
    iop REAL,
    ref_sphere REAL,
    ref_cyl REAL,
    ref_axis INTEGER,
    ref_subj_sphere REAL,
    ref_subj_cyl REAL,
    ref_subj_axis INTEGER,
    ref_subj_av TEXT,
    rx_sphere REAL,
    rx_cyl REAL,
    rx_axis INTEGER,
    rx_add REAL,
    slit_lamp TEXT,
    fundus TEXT,
    plan TEXT,
    prescription_notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    synced_at TEXT,
    local_only INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_exam_eye_encounter ON exam_eye(encounter_id);

-- ============================================================
-- DIAGNÓSTICOS
-- ============================================================

CREATE TABLE IF NOT EXISTS diagnoses (
    id TEXT PRIMARY KEY,
    encounter_id TEXT,
    code TEXT,
    label TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    synced_at TEXT,
    local_only INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_encounter ON diagnoses(encounter_id);

-- ============================================================
-- CONFIGURACIÓN DE APP
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL DEFAULT '{}',
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT,
    local_only INTEGER DEFAULT 0
);

-- ============================================================
-- TRIGGERS PARA updated_at
-- ============================================================

CREATE TRIGGER IF NOT EXISTS update_patients_updated_at
    AFTER UPDATE ON patients
    FOR EACH ROW
    BEGIN
        UPDATE patients SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_appointments_updated_at
    AFTER UPDATE ON appointments
    FOR EACH ROW
    BEGIN
        UPDATE appointments SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_encounters_updated_at
    AFTER UPDATE ON encounters
    FOR EACH ROW
    BEGIN
        UPDATE encounters SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

-- ============================================================
-- FIN DEL ESQUEMA SQLite
-- ============================================================
