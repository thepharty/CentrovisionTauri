use crate::db::Database;
use crate::AppState;
use crate::connection_manager::ConnectionStatus;
use serde::{Deserialize, Serialize};
use tauri::{State, AppHandle, Manager};
use std::sync::Arc;

// ============================================================
// TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Branch {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Room {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub branch_id: String,
    pub active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Profile {
    pub id: String,
    pub user_id: String,
    pub full_name: String,
    pub email: Option<String>,
    pub specialty: Option<String>,
    pub is_visible_in_dashboard: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserRole {
    pub id: String,
    pub user_id: String,
    pub role: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Patient {
    pub id: String,
    pub code: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub dob: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub allergies: Option<String>,
    pub notes: Option<String>,
    pub address: Option<String>,
    pub diabetes: bool,
    pub hta: bool,
    pub ophthalmic_history: Option<String>,
    pub occupation: Option<String>,
}

/// Embedded patient info for appointments (avoids separate lookup)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PatientEmbed {
    pub id: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub code: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Appointment {
    pub id: String,
    pub patient_id: Option<String>,
    pub room_id: Option<String>,
    pub doctor_id: Option<String>,
    pub branch_id: String,
    pub starts_at: String,
    pub ends_at: String,
    pub reason: Option<String>,
    #[serde(rename = "type")]
    pub appointment_type: String,
    pub status: String,
    /// Embedded patient data from JOIN
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patient: Option<PatientEmbed>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_online: bool,
    pub pending_count: i64,
    pub last_sync: Option<String>,
}

// ============================================================
// SYNC PENDING STATUS (for _sync_pending table on PostgreSQL)
// ============================================================

/// Count of pending sync items per table
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncPendingByTable {
    pub table_name: String,
    pub count: i64,
}

/// Full sync pending status from PostgreSQL _sync_pending table
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncPendingStatus {
    pub total_pending: i64,
    pub by_table: Vec<SyncPendingByTable>,
}

/// Detailed pending sync item for admin debugging
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncPendingDetail {
    pub id: String,
    pub table_name: String,
    pub record_id: String,
    pub operation: String,
    pub created_at: String,
}

// ============================================================
// COMMANDS - CONNECTION STATUS (NEW)
// ============================================================

/// Get the current connection status (Supabase, Local, or Offline)
#[tauri::command]
pub async fn get_connection_status(
    app_state: State<'_, Arc<AppState>>,
) -> Result<ConnectionStatus, String> {
    // Re-check connections before returning status
    app_state.connection_manager.check_connections().await;
    Ok(app_state.connection_manager.get_status().await)
}

// ============================================================
// COMMANDS - SYNC STATUS
// ============================================================

#[tauri::command]
pub async fn get_sync_status(db: State<'_, Arc<Database>>) -> Result<SyncStatus, String> {
    let pending_count = db.get_pending_sync_count().map_err(|e| e.to_string())?;
    let last_sync = db.get_sync_metadata("last_sync").map_err(|e| e.to_string())?;

    Ok(SyncStatus {
        is_online: true, // TODO: Implement actual network check
        pending_count,
        last_sync,
    })
}

// ============================================================
// COMMANDS - BRANCHES
// ============================================================

#[tauri::command]
pub async fn get_branches(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<Branch>, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_branches: Using local PostgreSQL");
        return pool.get_branches().await;
    }

    // Fallback to SQLite cache
    log::info!("get_branches: Using SQLite cache");
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, code, address, phone, active FROM branches WHERE active = 1 ORDER BY code")
        .map_err(|e| e.to_string())?;

    let branches = stmt
        .query_map([], |row| {
            Ok(Branch {
                id: row.get(0)?,
                name: row.get(1)?,
                code: row.get(2)?,
                address: row.get(3)?,
                phone: row.get(4)?,
                active: row.get::<_, i32>(5)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(branches)
}

// ============================================================
// COMMANDS - ROOMS
// ============================================================

#[tauri::command]
pub async fn get_rooms(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    branch_id: String,
) -> Result<Vec<Room>, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_rooms: Using local PostgreSQL");
        return pool.get_rooms(&branch_id).await;
    }

    // Fallback to SQLite cache
    log::info!("get_rooms: Using SQLite cache");
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, kind, branch_id, active FROM rooms WHERE branch_id = ? AND active = 1")
        .map_err(|e| e.to_string())?;

    let rooms = stmt
        .query_map([&branch_id], |row| {
            Ok(Room {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                branch_id: row.get(3)?,
                active: row.get::<_, i32>(4)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rooms)
}

// ============================================================
// COMMANDS - PATIENTS
// ============================================================

#[tauri::command]
pub async fn get_patients(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    search: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<Patient>, String> {
    let limit = limit.unwrap_or(100);

    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_patients: Using local PostgreSQL");
        return pool.get_patients(search.as_deref(), limit).await;
    }

    // Fallback to SQLite cache
    log::info!("get_patients: Using SQLite cache");
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let sql = if let Some(ref search_term) = search {
        format!(
            "SELECT id, code, first_name, last_name, dob, phone, email, allergies, notes, address, diabetes, hta, ophthalmic_history, occupation
             FROM patients
             WHERE deleted_at IS NULL
               AND (first_name LIKE '%{}%' OR last_name LIKE '%{}%' OR code LIKE '%{}%')
             ORDER BY last_name, first_name
             LIMIT {}",
            search_term, search_term, search_term, limit
        )
    } else {
        format!(
            "SELECT id, code, first_name, last_name, dob, phone, email, allergies, notes, address, diabetes, hta, ophthalmic_history, occupation
             FROM patients
             WHERE deleted_at IS NULL
             ORDER BY last_name, first_name
             LIMIT {}",
            limit
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let patients = stmt
        .query_map([], |row| {
            Ok(Patient {
                id: row.get(0)?,
                code: row.get(1)?,
                first_name: row.get(2)?,
                last_name: row.get(3)?,
                dob: row.get(4)?,
                phone: row.get(5)?,
                email: row.get(6)?,
                allergies: row.get(7)?,
                notes: row.get(8)?,
                address: row.get(9)?,
                diabetes: row.get::<_, i32>(10)? == 1,
                hta: row.get::<_, i32>(11)? == 1,
                ophthalmic_history: row.get(12)?,
                occupation: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(patients)
}

#[tauri::command]
pub async fn get_patient_by_id(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<Patient>, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_patient_by_id: Using local PostgreSQL");
        return pool.get_patient_by_id(&id).await;
    }

    // Fallback to SQLite cache
    log::info!("get_patient_by_id: Using SQLite cache");
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, code, first_name, last_name, dob, phone, email, allergies, notes, address, diabetes, hta, ophthalmic_history, occupation
             FROM patients
             WHERE id = ? AND deleted_at IS NULL",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt.query_row([&id], |row| {
        Ok(Patient {
            id: row.get(0)?,
            code: row.get(1)?,
            first_name: row.get(2)?,
            last_name: row.get(3)?,
            dob: row.get(4)?,
            phone: row.get(5)?,
            email: row.get(6)?,
            allergies: row.get(7)?,
            notes: row.get(8)?,
            address: row.get(9)?,
            diabetes: row.get::<_, i32>(10)? == 1,
            hta: row.get::<_, i32>(11)? == 1,
            ophthalmic_history: row.get(12)?,
            occupation: row.get(13)?,
        })
    });

    match result {
        Ok(patient) => Ok(Some(patient)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// ============================================================
// COMMANDS - APPOINTMENTS
// ============================================================

#[tauri::command]
pub async fn get_appointments(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    branch_id: String,
    date: String,
) -> Result<Vec<Appointment>, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_appointments: Using local PostgreSQL");
        return pool.get_appointments(&branch_id, &date).await;
    }

    // Fallback to SQLite cache (with patient JOIN)
    log::info!("get_appointments: Using SQLite cache");
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.patient_id, a.room_id, a.doctor_id, a.branch_id,
                    a.starts_at, a.ends_at, a.reason, a.type, a.status,
                    p.id, p.first_name, p.last_name, p.code, p.phone
             FROM appointments a
             LEFT JOIN patients p ON a.patient_id = p.id
             WHERE a.branch_id = ?
               AND date(a.starts_at) = date(?)
               AND a.deleted_at IS NULL
             ORDER BY a.starts_at",
        )
        .map_err(|e| e.to_string())?;

    let appointments = stmt
        .query_map([&branch_id, &date], |row| {
            let patient_id: Option<String> = row.get(10)?;
            let patient_embed = patient_id.map(|pid| {
                PatientEmbed {
                    id: pid,
                    first_name: row.get(11).ok().flatten(),
                    last_name: row.get(12).ok().flatten(),
                    code: row.get(13).ok().flatten(),
                    phone: row.get(14).ok().flatten(),
                }
            });

            Ok(Appointment {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                room_id: row.get(2)?,
                doctor_id: row.get(3)?,
                branch_id: row.get(4)?,
                starts_at: row.get(5)?,
                ends_at: row.get(6)?,
                reason: row.get(7)?,
                appointment_type: row.get(8)?,
                status: row.get(9)?,
                patient: patient_embed,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(appointments)
}

// ============================================================
// COMMANDS - PROFILES & ROLES
// ============================================================

#[tauri::command]
pub async fn get_doctors(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<Profile>, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_doctors: Using local PostgreSQL");
        return pool.get_doctors().await;
    }

    // Fallback to SQLite cache
    log::info!("get_doctors: Using SQLite cache");
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.user_id, p.full_name, p.email, p.specialty, p.is_visible_in_dashboard
             FROM profiles p
             INNER JOIN user_roles ur ON ur.user_id = p.user_id
             WHERE ur.role = 'doctor' AND p.is_visible_in_dashboard = 1",
        )
        .map_err(|e| e.to_string())?;

    let profiles = stmt
        .query_map([], |row| {
            Ok(Profile {
                id: row.get(0)?,
                user_id: row.get(1)?,
                full_name: row.get(2)?,
                email: row.get(3)?,
                specialty: row.get(4)?,
                is_visible_in_dashboard: row.get::<_, i32>(5)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(profiles)
}

#[tauri::command]
pub async fn get_user_roles(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    user_id: String,
) -> Result<Vec<String>, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_user_roles: Using local PostgreSQL");
        return pool.get_user_roles(&user_id).await;
    }

    // Fallback to SQLite cache
    log::info!("get_user_roles: Using SQLite cache");
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT role FROM user_roles WHERE user_id = ?")
        .map_err(|e| e.to_string())?;

    let roles: Vec<String> = stmt
        .query_map([&user_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(roles)
}

// ============================================================
// INPUT TYPES FOR MUTATIONS
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct PatientInput {
    pub first_name: String,
    pub last_name: String,
    pub dob: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub allergies: Option<String>,
    pub notes: Option<String>,
    pub address: Option<String>,
    pub diabetes: Option<bool>,
    pub hta: Option<bool>,
    pub ophthalmic_history: Option<String>,
    pub occupation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PatientUpdate {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub dob: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub allergies: Option<String>,
    pub notes: Option<String>,
    pub address: Option<String>,
    pub diabetes: Option<bool>,
    pub hta: Option<bool>,
    pub ophthalmic_history: Option<String>,
    pub occupation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppointmentInput {
    pub patient_id: Option<String>,
    pub room_id: Option<String>,
    pub doctor_id: Option<String>,
    pub branch_id: String,
    pub starts_at: String,
    pub ends_at: String,
    pub reason: Option<String>,
    #[serde(rename = "type")]
    pub appointment_type: String,
    pub status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppointmentUpdate {
    pub patient_id: Option<String>,
    pub room_id: Option<String>,
    pub doctor_id: Option<String>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub reason: Option<String>,
    #[serde(rename = "type")]
    pub appointment_type: Option<String>,
    pub status: Option<String>,
}

// ============================================================
// COMMANDS - CREATE PATIENT
// ============================================================

#[tauri::command]
pub async fn create_patient(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    patient: PatientInput,
) -> Result<Patient, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_patient: Using local PostgreSQL");
        return pool.create_patient(&patient).await;
    }

    // Fallback to SQLite (with sync queue)
    log::info!("create_patient: Using SQLite with sync queue");
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Generate patient code (e.g., P-00001)
    let code = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) + 1 FROM patients", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        format!("P-{:05}", count)
    };

    let new_patient = Patient {
        id: id.clone(),
        code: Some(code.clone()),
        first_name: patient.first_name.clone(),
        last_name: patient.last_name.clone(),
        dob: patient.dob.clone(),
        phone: patient.phone.clone(),
        email: patient.email.clone(),
        allergies: patient.allergies.clone(),
        notes: patient.notes.clone(),
        address: patient.address.clone(),
        diabetes: patient.diabetes.unwrap_or(false),
        hta: patient.hta.unwrap_or(false),
        ophthalmic_history: patient.ophthalmic_history.clone(),
        occupation: patient.occupation.clone(),
    };

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO patients (id, code, first_name, last_name, dob, phone, email, allergies, notes, address, diabetes, hta, ophthalmic_history, occupation, created_at, updated_at, local_only)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
            rusqlite::params![
                &id,
                &code,
                &patient.first_name,
                &patient.last_name,
                &patient.dob,
                &patient.phone,
                &patient.email,
                &patient.allergies,
                &patient.notes,
                &patient.address,
                if patient.diabetes.unwrap_or(false) { 1 } else { 0 },
                if patient.hta.unwrap_or(false) { 1 } else { 0 },
                &patient.ophthalmic_history,
                &patient.occupation,
                &now,
                &now,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Add to sync queue
    let patient_json = serde_json::to_string(&new_patient).map_err(|e| e.to_string())?;
    db.add_to_sync_queue("patients", &id, "INSERT", &patient_json)
        .map_err(|e| e.to_string())?;

    log::info!("Created patient {} locally, added to sync queue", id);

    Ok(new_patient)
}

// ============================================================
// COMMANDS - UPDATE PATIENT
// ============================================================

#[tauri::command]
pub async fn update_patient(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    id: String,
    updates: PatientUpdate,
) -> Result<Patient, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_patient: Using local PostgreSQL");
        return pool.update_patient(&id, &updates).await;
    }

    // Fallback to SQLite (with sync queue)
    log::info!("update_patient: Using SQLite with sync queue");
    let now = chrono::Utc::now().to_rfc3339();

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        // Build dynamic UPDATE query
        let mut set_clauses = vec!["updated_at = ?".to_string()];
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now.clone())];

        if let Some(ref v) = updates.first_name {
            set_clauses.push("first_name = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.last_name {
            set_clauses.push("last_name = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.dob {
            set_clauses.push("dob = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.phone {
            set_clauses.push("phone = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.email {
            set_clauses.push("email = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.allergies {
            set_clauses.push("allergies = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.notes {
            set_clauses.push("notes = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.address {
            set_clauses.push("address = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(v) = updates.diabetes {
            set_clauses.push("diabetes = ?".to_string());
            params.push(Box::new(if v { 1 } else { 0 }));
        }
        if let Some(v) = updates.hta {
            set_clauses.push("hta = ?".to_string());
            params.push(Box::new(if v { 1 } else { 0 }));
        }
        if let Some(ref v) = updates.ophthalmic_history {
            set_clauses.push("ophthalmic_history = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.occupation {
            set_clauses.push("occupation = ?".to_string());
            params.push(Box::new(v.clone()));
        }

        params.push(Box::new(id.clone()));

        let sql = format!(
            "UPDATE patients SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, params_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    // Get updated patient
    let patient = get_patient_by_id(db.clone(), app_state.clone(), id.clone())
        .await?
        .ok_or("Patient not found after update")?;

    // Add to sync queue
    let patient_json = serde_json::to_string(&patient).map_err(|e| e.to_string())?;
    db.add_to_sync_queue("patients", &id, "UPDATE", &patient_json)
        .map_err(|e| e.to_string())?;

    log::info!("Updated patient {} locally, added to sync queue", id);

    Ok(patient)
}

// ============================================================
// COMMANDS - CREATE APPOINTMENT
// ============================================================

#[tauri::command]
pub async fn create_appointment(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    appointment: AppointmentInput,
) -> Result<Appointment, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_appointment: Using local PostgreSQL");
        return pool.create_appointment(&appointment).await;
    }

    // Fallback to SQLite (with sync queue)
    log::info!("create_appointment: Using SQLite with sync queue");
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = appointment.status.clone().unwrap_or_else(|| "scheduled".to_string());

    let new_appointment = Appointment {
        id: id.clone(),
        patient_id: appointment.patient_id.clone(),
        room_id: appointment.room_id.clone(),
        doctor_id: appointment.doctor_id.clone(),
        branch_id: appointment.branch_id.clone(),
        starts_at: appointment.starts_at.clone(),
        ends_at: appointment.ends_at.clone(),
        reason: appointment.reason.clone(),
        appointment_type: appointment.appointment_type.clone(),
        status: status.clone(),
        patient: None, // Will be populated on next fetch
    };

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO appointments (id, patient_id, room_id, doctor_id, branch_id, starts_at, ends_at, reason, type, status, created_at, updated_at, local_only)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
            rusqlite::params![
                &id,
                &appointment.patient_id,
                &appointment.room_id,
                &appointment.doctor_id,
                &appointment.branch_id,
                &appointment.starts_at,
                &appointment.ends_at,
                &appointment.reason,
                &appointment.appointment_type,
                &status,
                &now,
                &now,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Add to sync queue
    let appt_json = serde_json::to_string(&new_appointment).map_err(|e| e.to_string())?;
    db.add_to_sync_queue("appointments", &id, "INSERT", &appt_json)
        .map_err(|e| e.to_string())?;

    log::info!("Created appointment {} locally, added to sync queue", id);

    Ok(new_appointment)
}

// ============================================================
// COMMANDS - UPDATE APPOINTMENT
// ============================================================

#[tauri::command]
pub async fn update_appointment(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    id: String,
    updates: AppointmentUpdate,
) -> Result<Appointment, String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_appointment: Using local PostgreSQL");
        return pool.update_appointment(&id, &updates).await;
    }

    // Fallback to SQLite (with sync queue)
    log::info!("update_appointment: Using SQLite with sync queue");
    let now = chrono::Utc::now().to_rfc3339();

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let mut set_clauses = vec!["updated_at = ?".to_string()];
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now.clone())];

        if let Some(ref v) = updates.patient_id {
            set_clauses.push("patient_id = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.room_id {
            set_clauses.push("room_id = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.doctor_id {
            set_clauses.push("doctor_id = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.starts_at {
            set_clauses.push("starts_at = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.ends_at {
            set_clauses.push("ends_at = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.reason {
            set_clauses.push("reason = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.appointment_type {
            set_clauses.push("type = ?".to_string());
            params.push(Box::new(v.clone()));
        }
        if let Some(ref v) = updates.status {
            set_clauses.push("status = ?".to_string());
            params.push(Box::new(v.clone()));
        }

        params.push(Box::new(id.clone()));

        let sql = format!(
            "UPDATE appointments SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, params_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    // Get updated appointment with patient data
    let appointment = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT a.id, a.patient_id, a.room_id, a.doctor_id, a.branch_id,
                        a.starts_at, a.ends_at, a.reason, a.type, a.status,
                        p.id, p.first_name, p.last_name, p.code, p.phone
                 FROM appointments a
                 LEFT JOIN patients p ON a.patient_id = p.id
                 WHERE a.id = ?",
            )
            .map_err(|e| e.to_string())?;

        stmt.query_row([&id], |row| {
            let patient_id: Option<String> = row.get(10)?;
            let patient_embed = patient_id.map(|pid| {
                PatientEmbed {
                    id: pid,
                    first_name: row.get(11).ok().flatten(),
                    last_name: row.get(12).ok().flatten(),
                    code: row.get(13).ok().flatten(),
                    phone: row.get(14).ok().flatten(),
                }
            });

            Ok(Appointment {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                room_id: row.get(2)?,
                doctor_id: row.get(3)?,
                branch_id: row.get(4)?,
                starts_at: row.get(5)?,
                ends_at: row.get(6)?,
                reason: row.get(7)?,
                appointment_type: row.get(8)?,
                status: row.get(9)?,
                patient: patient_embed,
            })
        })
        .map_err(|e| e.to_string())?
    };

    // Add to sync queue
    let appt_json = serde_json::to_string(&appointment).map_err(|e| e.to_string())?;
    db.add_to_sync_queue("appointments", &id, "UPDATE", &appt_json)
        .map_err(|e| e.to_string())?;

    log::info!("Updated appointment {} locally, added to sync queue", id);

    Ok(appointment)
}

// ============================================================
// COMMANDS - DELETE APPOINTMENT (Soft delete)
// ============================================================

#[tauri::command]
pub async fn delete_appointment(
    db: State<'_, Arc<Database>>,
    app_state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    // Check if we should use local PostgreSQL
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("delete_appointment: Using local PostgreSQL");
        return pool.delete_appointment(&id).await;
    }

    // Fallback to SQLite (with sync queue)
    log::info!("delete_appointment: Using SQLite with sync queue");
    let now = chrono::Utc::now().to_rfc3339();

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE appointments SET deleted_at = ?, updated_at = ? WHERE id = ?",
            [&now, &now, &id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Add to sync queue
    db.add_to_sync_queue("appointments", &id, "DELETE", "{}")
        .map_err(|e| e.to_string())?;

    log::info!("Deleted appointment {} locally, added to sync queue", id);

    Ok(())
}

// ============================================================
// COMMANDS - SAVE APPOINTMENTS TO SQLITE (Write-through cache)
// ============================================================

/// Input type for saving appointments from Supabase to SQLite
#[derive(Debug, Serialize, Deserialize)]
pub struct AppointmentCache {
    pub id: String,
    pub patient_id: Option<String>,
    pub room_id: Option<String>,
    pub doctor_id: Option<String>,
    pub branch_id: String,
    pub starts_at: String,
    pub ends_at: String,
    pub reason: Option<String>,
    #[serde(rename = "type")]
    pub appointment_type: String,
    pub status: String,
    pub is_courtesy: Option<bool>,
    pub post_op_type: Option<String>,
    pub reception_notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[tauri::command]
pub async fn save_appointments_to_sqlite(
    db: State<'_, Arc<Database>>,
    appointments: Vec<AppointmentCache>,
) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut saved_count = 0;

    for appt in &appointments {
        let result = conn.execute(
            "INSERT OR REPLACE INTO appointments (
                id, patient_id, room_id, doctor_id, branch_id,
                starts_at, ends_at, reason, type, status,
                is_courtesy, post_op_type, reception_notes,
                created_at, updated_at, synced_at, local_only
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
            rusqlite::params![
                &appt.id,
                &appt.patient_id,
                &appt.room_id,
                &appt.doctor_id,
                &appt.branch_id,
                &appt.starts_at,
                &appt.ends_at,
                &appt.reason,
                &appt.appointment_type,
                &appt.status,
                if appt.is_courtesy.unwrap_or(false) { 1 } else { 0 },
                &appt.post_op_type,
                &appt.reception_notes,
                &appt.created_at.as_ref().unwrap_or(&now),
                &appt.updated_at.as_ref().unwrap_or(&now),
                &now,
            ],
        );

        match result {
            Ok(_) => saved_count += 1,
            Err(e) => log::warn!("Failed to save appointment {}: {}", appt.id, e),
        }
    }

    log::info!("Saved {} appointments to SQLite cache", saved_count);
    Ok(saved_count)
}

// ============================================================
// COMMANDS - DELETE APPOINTMENT FROM SQLITE (for sync cleanup)
// ============================================================

#[tauri::command]
pub async fn remove_appointment_from_sqlite(
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM appointments WHERE id = ?", [&id])
        .map_err(|e| e.to_string())?;

    log::info!("Removed appointment {} from SQLite cache", id);
    Ok(())
}

// ============================================================
// COMMANDS - PRINT HTML
// ============================================================

/// Trigger print dialog on the main webview
/// On macOS: uses native webview.print()
/// On Windows: window.print() is called from frontend
#[tauri::command]
pub async fn print_webview(app: AppHandle) -> Result<(), String> {
    log::info!("print_webview: Opening print dialog");

    // Get the main window's webview
    let main_window = app.get_webview_window("main")
        .ok_or("Could not find main window")?;

    // Call the native print method (works on macOS, on Windows will fallback)
    main_window.print()
        .map_err(|e| format!("Failed to print: {}", e))?;

    log::info!("print_webview: Print dialog opened");

    Ok(())
}

// ============================================================
// ENCOUNTERS (EXPEDIENTES MÉDICOS) - TYPES
// ============================================================

/// Embedded doctor info for encounters
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DoctorEmbed {
    pub user_id: String,
    pub full_name: Option<String>,
    pub specialty: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Encounter {
    pub id: String,
    pub patient_id: String,
    pub appointment_id: Option<String>,
    pub doctor_id: Option<String>,
    pub date: String,
    #[serde(rename = "type")]
    pub encounter_type: String,
    pub summary: Option<String>,
    pub motivo_consulta: Option<String>,
    pub plan_tratamiento: Option<String>,
    pub cirugias: Option<serde_json::Value>,
    pub estudios: Option<serde_json::Value>,
    pub proxima_cita: Option<String>,
    pub excursiones_od: Option<String>,
    pub excursiones_os: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patient: Option<PatientEmbed>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doctor: Option<DoctorEmbed>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncounterInput {
    pub patient_id: String,
    pub appointment_id: Option<String>,
    pub doctor_id: Option<String>,
    #[serde(rename = "type")]
    pub encounter_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncounterUpdate {
    pub summary: Option<String>,
    pub motivo_consulta: Option<String>,
    pub plan_tratamiento: Option<String>,
    pub cirugias: Option<serde_json::Value>,
    pub estudios: Option<serde_json::Value>,
    pub proxima_cita: Option<String>,
    pub excursiones_od: Option<String>,
    pub excursiones_os: Option<String>,
}

// ============================================================
// COMMANDS - ENCOUNTERS
// ============================================================

#[tauri::command]
pub async fn get_encounter_by_id(
    app_state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<Encounter>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_encounter_by_id: Using local PostgreSQL");
        return pool.get_encounter_by_id(&id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_encounters_by_patient(
    app_state: State<'_, Arc<AppState>>,
    patient_id: String,
) -> Result<Vec<Encounter>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_encounters_by_patient: Using local PostgreSQL");
        return pool.get_encounters_by_patient(&patient_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_encounter_by_appointment(
    app_state: State<'_, Arc<AppState>>,
    appointment_id: String,
) -> Result<Option<Encounter>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_encounter_by_appointment: Using local PostgreSQL");
        return pool.get_encounter_by_appointment(&appointment_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_encounter(
    app_state: State<'_, Arc<AppState>>,
    encounter: EncounterInput,
) -> Result<Encounter, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_encounter: Using local PostgreSQL");
        return pool.create_encounter(&encounter).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn update_encounter(
    app_state: State<'_, Arc<AppState>>,
    id: String,
    updates: EncounterUpdate,
) -> Result<Encounter, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_encounter: Using local PostgreSQL");
        return pool.update_encounter(&id, &updates).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// EXAM EYE (EXÁMENES OCULARES) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExamEye {
    pub id: String,
    pub encounter_id: String,
    pub side: String,  // "OD" o "OS"
    // Agudeza Visual
    pub av_sc: Option<String>,
    pub av_cc: Option<String>,
    // Refracción Objetiva
    pub ref_sphere: Option<f64>,
    pub ref_cyl: Option<f64>,
    pub ref_axis: Option<i32>,
    // Refracción Subjetiva
    pub ref_subj_sphere: Option<f64>,
    pub ref_subj_cyl: Option<f64>,
    pub ref_subj_axis: Option<i32>,
    // Rx Final
    pub rx_sphere: Option<f64>,
    pub rx_cyl: Option<f64>,
    pub rx_axis: Option<i32>,
    pub rx_add: Option<f64>,
    // Otros
    pub iop: Option<f64>,
    pub slit_lamp: Option<String>,
    pub fundus: Option<String>,
    pub plan: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExamEyeInput {
    pub encounter_id: String,
    pub side: String,
    pub av_sc: Option<String>,
    pub av_cc: Option<String>,
    pub ref_sphere: Option<f64>,
    pub ref_cyl: Option<f64>,
    pub ref_axis: Option<i32>,
    pub ref_subj_sphere: Option<f64>,
    pub ref_subj_cyl: Option<f64>,
    pub ref_subj_axis: Option<i32>,
    pub rx_sphere: Option<f64>,
    pub rx_cyl: Option<f64>,
    pub rx_axis: Option<i32>,
    pub rx_add: Option<f64>,
    pub iop: Option<f64>,
    pub slit_lamp: Option<String>,
    pub fundus: Option<String>,
    pub plan: Option<String>,
}

// ============================================================
// COMMANDS - EXAM EYE
// ============================================================

#[tauri::command]
pub async fn get_exam_eye(
    app_state: State<'_, Arc<AppState>>,
    encounter_id: String,
    side: String,
) -> Result<Option<ExamEye>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_exam_eye: Using local PostgreSQL");
        return pool.get_exam_eye(&encounter_id, &side).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_exam_eyes_by_encounter(
    app_state: State<'_, Arc<AppState>>,
    encounter_id: String,
) -> Result<Vec<ExamEye>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_exam_eyes_by_encounter: Using local PostgreSQL");
        return pool.get_exam_eyes_by_encounter(&encounter_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn upsert_exam_eye(
    app_state: State<'_, Arc<AppState>>,
    exam: ExamEyeInput,
) -> Result<ExamEye, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("upsert_exam_eye: Using local PostgreSQL");
        return pool.upsert_exam_eye(&exam).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// STUDIES (ESTUDIOS) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudyFile {
    pub id: String,
    pub study_id: String,
    pub file_path: String,
    pub mime_type: Option<String>,
    pub side: Option<String>,
    pub extracted_summary: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Study {
    pub id: String,
    pub appointment_id: Option<String>,
    pub patient_id: String,
    pub study_type: String,
    pub status: String,
    pub ordered_by: Option<String>,
    pub date: Option<String>,
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub study_files: Option<Vec<StudyFile>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patient: Option<PatientEmbed>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StudyInput {
    pub appointment_id: Option<String>,
    pub patient_id: String,
    pub study_type: String,
    pub ordered_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StudyStatusUpdate {
    pub status: String,
    pub notes: Option<String>,
}

// ============================================================
// COMMANDS - STUDIES
// ============================================================

#[tauri::command]
pub async fn get_studies_by_appointment(
    app_state: State<'_, Arc<AppState>>,
    appointment_id: String,
) -> Result<Vec<Study>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_studies_by_appointment: Using local PostgreSQL");
        return pool.get_studies_by_appointment(&appointment_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_studies_by_patient(
    app_state: State<'_, Arc<AppState>>,
    patient_id: String,
) -> Result<Vec<Study>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_studies_by_patient: Using local PostgreSQL");
        return pool.get_studies_by_patient(&patient_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_study(
    app_state: State<'_, Arc<AppState>>,
    study: StudyInput,
) -> Result<Study, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_study: Using local PostgreSQL");
        return pool.create_study(&study).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn update_study_status(
    app_state: State<'_, Arc<AppState>>,
    id: String,
    updates: StudyStatusUpdate,
) -> Result<Study, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_study_status: Using local PostgreSQL");
        return pool.update_study_status(&id, &updates).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// SURGERIES (CIRUGÍAS) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SurgeryFile {
    pub id: String,
    pub surgery_id: String,
    pub file_path: String,
    pub mime_type: Option<String>,
    pub file_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Surgery {
    pub id: String,
    pub appointment_id: Option<String>,
    pub patient_id: String,
    pub surgery_type: String,
    pub eye: Option<String>,
    pub date: Option<String>,
    pub status: String,
    pub surgeon_id: Option<String>,
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surgery_files: Option<Vec<SurgeryFile>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patient: Option<PatientEmbed>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surgeon: Option<DoctorEmbed>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SurgeryInput {
    pub appointment_id: Option<String>,
    pub patient_id: String,
    pub surgery_type: String,
    pub eye: Option<String>,
    pub date: Option<String>,
    pub surgeon_id: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SurgeryUpdate {
    pub surgery_type: Option<String>,
    pub eye: Option<String>,
    pub date: Option<String>,
    pub status: Option<String>,
    pub surgeon_id: Option<String>,
    pub notes: Option<String>,
}

// ============================================================
// PROCEDURES (PROCEDIMIENTOS) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Procedure {
    pub id: String,
    pub appointment_id: Option<String>,
    pub patient_id: String,
    pub procedure_type: String,
    pub eye: Option<String>,
    pub date: Option<String>,
    pub status: String,
    pub performed_by: Option<String>,
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patient: Option<PatientEmbed>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doctor: Option<DoctorEmbed>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcedureInput {
    pub appointment_id: Option<String>,
    pub patient_id: String,
    pub procedure_type: String,
    pub eye: Option<String>,
    pub performed_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcedureUpdate {
    pub procedure_type: Option<String>,
    pub eye: Option<String>,
    pub date: Option<String>,
    pub status: Option<String>,
    pub performed_by: Option<String>,
    pub notes: Option<String>,
}

// ============================================================
// COMMANDS - SURGERIES
// ============================================================

#[tauri::command]
pub async fn get_surgeries_by_appointment(
    app_state: State<'_, Arc<AppState>>,
    appointment_id: String,
) -> Result<Vec<Surgery>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_surgeries_by_appointment: Using local PostgreSQL");
        return pool.get_surgeries_by_appointment(&appointment_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_surgeries_by_patient(
    app_state: State<'_, Arc<AppState>>,
    patient_id: String,
) -> Result<Vec<Surgery>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_surgeries_by_patient: Using local PostgreSQL");
        return pool.get_surgeries_by_patient(&patient_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_surgery(
    app_state: State<'_, Arc<AppState>>,
    surgery: SurgeryInput,
) -> Result<Surgery, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_surgery: Using local PostgreSQL");
        return pool.create_surgery(&surgery).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn update_surgery(
    app_state: State<'_, Arc<AppState>>,
    id: String,
    updates: SurgeryUpdate,
) -> Result<Surgery, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_surgery: Using local PostgreSQL");
        return pool.update_surgery(&id, &updates).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn delete_surgery(
    app_state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("delete_surgery: Using local PostgreSQL");
        return pool.delete_surgery(&id).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// COMMANDS - PROCEDURES
// ============================================================

#[tauri::command]
pub async fn get_procedures_by_appointment(
    app_state: State<'_, Arc<AppState>>,
    appointment_id: String,
) -> Result<Vec<Procedure>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_procedures_by_appointment: Using local PostgreSQL");
        return pool.get_procedures_by_appointment(&appointment_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_procedures_by_patient(
    app_state: State<'_, Arc<AppState>>,
    patient_id: String,
) -> Result<Vec<Procedure>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_procedures_by_patient: Using local PostgreSQL");
        return pool.get_procedures_by_patient(&patient_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_procedure(
    app_state: State<'_, Arc<AppState>>,
    procedure: ProcedureInput,
) -> Result<Procedure, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_procedure: Using local PostgreSQL");
        return pool.create_procedure(&procedure).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn update_procedure(
    app_state: State<'_, Arc<AppState>>,
    id: String,
    updates: ProcedureUpdate,
) -> Result<Procedure, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_procedure: Using local PostgreSQL");
        return pool.update_procedure(&id, &updates).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// DIAGNOSES (DIAGNÓSTICOS) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Diagnosis {
    pub id: String,
    pub encounter_id: String,
    pub code: Option<String>,
    pub description: String,
    pub eye: Option<String>,
    pub is_primary: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosisInput {
    pub encounter_id: String,
    pub code: Option<String>,
    pub description: String,
    pub eye: Option<String>,
    pub is_primary: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosisUpdate {
    pub code: Option<String>,
    pub description: Option<String>,
    pub eye: Option<String>,
    pub is_primary: Option<bool>,
}

// ============================================================
// COMMANDS - DIAGNOSES
// ============================================================

#[tauri::command]
pub async fn get_diagnoses_by_encounter(
    app_state: State<'_, Arc<AppState>>,
    encounter_id: String,
) -> Result<Vec<Diagnosis>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_diagnoses_by_encounter: Using local PostgreSQL");
        return pool.get_diagnoses_by_encounter(&encounter_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_diagnosis(
    app_state: State<'_, Arc<AppState>>,
    diagnosis: DiagnosisInput,
) -> Result<Diagnosis, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_diagnosis: Using local PostgreSQL");
        return pool.create_diagnosis(&diagnosis).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn update_diagnosis(
    app_state: State<'_, Arc<AppState>>,
    id: String,
    updates: DiagnosisUpdate,
) -> Result<Diagnosis, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_diagnosis: Using local PostgreSQL");
        return pool.update_diagnosis(&id, &updates).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn delete_diagnosis(
    app_state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("delete_diagnosis: Using local PostgreSQL");
        return pool.delete_diagnosis(&id).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// INVOICES (FACTURAS) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Invoice {
    pub id: String,
    pub invoice_number: String,
    pub patient_id: String,
    pub appointment_id: Option<String>,
    pub branch_id: String,
    pub total_amount: f64,
    pub balance_due: f64,
    pub discount_type: Option<String>,
    pub discount_value: Option<f64>,
    pub discount_reason: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patient: Option<PatientEmbed>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InvoiceItem {
    pub id: String,
    pub invoice_id: String,
    pub service_id: Option<String>,
    pub product_id: Option<String>,
    pub description: String,
    pub quantity: i32,
    pub unit_price: f64,
    pub subtotal: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvoiceInput {
    pub patient_id: String,
    pub appointment_id: Option<String>,
    pub branch_id: String,
    pub discount_type: Option<String>,
    pub discount_value: Option<f64>,
    pub discount_reason: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvoiceItemInput {
    pub service_id: Option<String>,
    pub product_id: Option<String>,
    pub description: String,
    pub quantity: i32,
    pub unit_price: f64,
}

// ============================================================
// COMMANDS - INVOICES
// ============================================================

#[tauri::command]
pub async fn get_invoices_by_patient(
    app_state: State<'_, Arc<AppState>>,
    patient_id: String,
) -> Result<Vec<Invoice>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_invoices_by_patient: Using local PostgreSQL");
        return pool.get_invoices_by_patient(&patient_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_invoices_by_branch_and_date(
    app_state: State<'_, Arc<AppState>>,
    branch_id: String,
    date: String,
) -> Result<Vec<Invoice>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_invoices_by_branch_and_date: Using local PostgreSQL");
        return pool.get_invoices_by_branch_and_date(&branch_id, &date).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_invoice_by_id(
    app_state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<Invoice>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_invoice_by_id: Using local PostgreSQL");
        return pool.get_invoice_by_id(&id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_invoice(
    app_state: State<'_, Arc<AppState>>,
    invoice: InvoiceInput,
    items: Vec<InvoiceItemInput>,
) -> Result<Invoice, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_invoice: Using local PostgreSQL");
        return pool.create_invoice(&invoice, &items).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn update_invoice_status(
    app_state: State<'_, Arc<AppState>>,
    id: String,
    status: String,
) -> Result<Invoice, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_invoice_status: Using local PostgreSQL");
        return pool.update_invoice_status(&id, &status).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_invoice_items(
    app_state: State<'_, Arc<AppState>>,
    invoice_id: String,
) -> Result<Vec<InvoiceItem>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_invoice_items: Using local PostgreSQL");
        return pool.get_invoice_items(&invoice_id).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// PAYMENTS (PAGOS) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Payment {
    pub id: String,
    pub invoice_id: String,
    pub amount: f64,
    pub payment_method: String,
    pub date: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice: Option<InvoiceWithPatient>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InvoiceWithPatient {
    pub id: String,
    pub invoice_number: String,
    pub patient_id: String,
    pub total_amount: f64,
    pub balance_due: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patient: Option<PatientEmbed>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentInput {
    pub invoice_id: String,
    pub amount: f64,
    pub payment_method: String,
}

// ============================================================
// COMMANDS - PAYMENTS
// ============================================================

#[tauri::command]
pub async fn get_payments_by_invoice(
    app_state: State<'_, Arc<AppState>>,
    invoice_id: String,
) -> Result<Vec<Payment>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_payments_by_invoice: Using local PostgreSQL");
        return pool.get_payments_by_invoice(&invoice_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_payments_by_date_range(
    app_state: State<'_, Arc<AppState>>,
    branch_id: String,
    start_date: String,
    end_date: String,
) -> Result<Vec<Payment>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_payments_by_date_range: Using local PostgreSQL");
        return pool.get_payments_by_date_range(&branch_id, &start_date, &end_date).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_payment(
    app_state: State<'_, Arc<AppState>>,
    payment: PaymentInput,
) -> Result<Payment, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_payment: Using local PostgreSQL");
        return pool.create_payment(&payment).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn delete_payment(
    app_state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("delete_payment: Using local PostgreSQL");
        return pool.delete_payment(&id).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// SERVICE PRICES (PRECIOS DE SERVICIOS) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServicePrice {
    pub id: String,
    pub service_name: String,
    pub service_type: String,
    pub price: f64,
    pub active: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServicePriceInput {
    pub service_name: String,
    pub service_type: String,
    pub price: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServicePriceUpdate {
    pub service_name: Option<String>,
    pub service_type: Option<String>,
    pub price: Option<f64>,
    pub active: Option<bool>,
}

// ============================================================
// COMMANDS - SERVICE PRICES
// ============================================================

#[tauri::command]
pub async fn get_service_prices(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<ServicePrice>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_service_prices: Using local PostgreSQL");
        return pool.get_service_prices().await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_service_price(
    app_state: State<'_, Arc<AppState>>,
    service: ServicePriceInput,
) -> Result<ServicePrice, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_service_price: Using local PostgreSQL");
        return pool.create_service_price(&service).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn update_service_price(
    app_state: State<'_, Arc<AppState>>,
    id: String,
    updates: ServicePriceUpdate,
) -> Result<ServicePrice, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_service_price: Using local PostgreSQL");
        return pool.update_service_price(&id, &updates).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// INVENTORY (INVENTARIO) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InventoryItem {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub cost_price: Option<f64>,
    pub sell_price: f64,
    pub supplier_id: Option<String>,
    pub branch_id: String,
    pub active: bool,
    pub current_stock: i32,
    pub reorder_level: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InventoryItemInput {
    pub name: String,
    pub category: Option<String>,
    pub cost_price: Option<f64>,
    pub sell_price: f64,
    pub supplier_id: Option<String>,
    pub branch_id: String,
    pub current_stock: Option<i32>,
    pub reorder_level: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InventoryItemUpdate {
    pub name: Option<String>,
    pub category: Option<String>,
    pub cost_price: Option<f64>,
    pub sell_price: Option<f64>,
    pub supplier_id: Option<String>,
    pub current_stock: Option<i32>,
    pub reorder_level: Option<i32>,
    pub active: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Supplier {
    pub id: String,
    pub name: String,
    pub contact: Option<String>,
    pub phone: Option<String>,
}

// ============================================================
// COMMANDS - INVENTORY
// ============================================================

#[tauri::command]
pub async fn get_inventory_items(
    app_state: State<'_, Arc<AppState>>,
    branch_id: String,
) -> Result<Vec<InventoryItem>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_inventory_items: Using local PostgreSQL");
        return pool.get_inventory_items(&branch_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_inventory_item(
    app_state: State<'_, Arc<AppState>>,
    item: InventoryItemInput,
) -> Result<InventoryItem, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_inventory_item: Using local PostgreSQL");
        return pool.create_inventory_item(&item).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn update_inventory_item(
    app_state: State<'_, Arc<AppState>>,
    id: String,
    updates: InventoryItemUpdate,
) -> Result<InventoryItem, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_inventory_item: Using local PostgreSQL");
        return pool.update_inventory_item(&id, &updates).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_suppliers(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<Supplier>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_suppliers: Using local PostgreSQL");
        return pool.get_suppliers().await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// CRM PIPELINES - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchEmbed {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CRMProcedureType {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CRMPipeline {
    pub id: String,
    pub patient_id: String,
    pub procedure_type_id: String,
    pub doctor_id: Option<String>,
    pub branch_id: String,
    pub current_stage: String,
    pub status: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patient: Option<PatientEmbed>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub procedure_type: Option<CRMProcedureType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<BranchEmbed>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doctor: Option<DoctorEmbed>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CRMPipelineInput {
    pub patient_id: String,
    pub procedure_type_id: String,
    pub doctor_id: Option<String>,
    pub branch_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CRMPipelineStage {
    pub id: String,
    pub pipeline_id: String,
    pub stage_name: String,
    pub status: String,
    pub stage_order: i32,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CRMPipelineNote {
    pub id: String,
    pub pipeline_id: String,
    pub note: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CRMPipelineNoteInput {
    pub pipeline_id: String,
    pub note: String,
    pub created_by: String,
}

// ============================================================
// COMMANDS - CRM PIPELINES
// ============================================================

#[tauri::command]
pub async fn get_crm_pipelines(
    app_state: State<'_, Arc<AppState>>,
    branch_id: String,
    status: Option<String>,
) -> Result<Vec<CRMPipeline>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_crm_pipelines: Using local PostgreSQL");
        return pool.get_crm_pipelines(&branch_id, status.as_deref()).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_crm_pipeline_by_id(
    app_state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<CRMPipeline>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_crm_pipeline_by_id: Using local PostgreSQL");
        return pool.get_crm_pipeline_by_id(&id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_crm_pipeline(
    app_state: State<'_, Arc<AppState>>,
    pipeline: CRMPipelineInput,
) -> Result<CRMPipeline, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_crm_pipeline: Using local PostgreSQL");
        return pool.create_crm_pipeline(&pipeline).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn update_crm_pipeline_stage(
    app_state: State<'_, Arc<AppState>>,
    id: String,
    current_stage: String,
) -> Result<CRMPipeline, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("update_crm_pipeline_stage: Using local PostgreSQL");
        return pool.update_crm_pipeline_stage(&id, &current_stage).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_crm_pipeline_stages(
    app_state: State<'_, Arc<AppState>>,
    pipeline_id: String,
) -> Result<Vec<CRMPipelineStage>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_crm_pipeline_stages: Using local PostgreSQL");
        return pool.get_crm_pipeline_stages(&pipeline_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_crm_pipeline_notes(
    app_state: State<'_, Arc<AppState>>,
    pipeline_id: String,
) -> Result<Vec<CRMPipelineNote>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_crm_pipeline_notes: Using local PostgreSQL");
        return pool.get_crm_pipeline_notes(&pipeline_id).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_crm_pipeline_note(
    app_state: State<'_, Arc<AppState>>,
    note: CRMPipelineNoteInput,
) -> Result<CRMPipelineNote, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_crm_pipeline_note: Using local PostgreSQL");
        return pool.create_crm_pipeline_note(&note).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_crm_procedure_types(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<CRMProcedureType>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_crm_procedure_types: Using local PostgreSQL");
        return pool.get_crm_procedure_types().await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// SCHEDULE BLOCKS (BLOQUES DE HORARIO) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScheduleBlock {
    pub id: String,
    pub room_id: String,
    pub doctor_id: Option<String>,
    pub start_time: String,
    pub end_time: String,
    pub date: String,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScheduleBlockInput {
    pub room_id: String,
    pub doctor_id: Option<String>,
    pub start_time: String,
    pub end_time: String,
    pub date: String,
    pub reason: Option<String>,
}

// ============================================================
// CLINICAL TYPES (TIPOS CLÍNICOS) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SurgeryType {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudyType {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcedureTypeConfig {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

// ============================================================
// REFERRING DOCTORS (MÉDICOS REFERIDORES) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReferringDoctor {
    pub id: String,
    pub name: String,
    pub is_internal: bool,
    pub internal_profile_id: Option<String>,
    pub specialty: Option<String>,
    pub phone: Option<String>,
    pub active: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReferringDoctorInput {
    pub name: String,
    pub is_internal: Option<bool>,
    pub internal_profile_id: Option<String>,
    pub specialty: Option<String>,
    pub phone: Option<String>,
}

// ============================================================
// COMMANDS - SCHEDULE BLOCKS
// ============================================================

#[tauri::command]
pub async fn get_schedule_blocks(
    app_state: State<'_, Arc<AppState>>,
    room_id: String,
    date: String,
) -> Result<Vec<ScheduleBlock>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_schedule_blocks: Using local PostgreSQL");
        return pool.get_schedule_blocks(&room_id, &date).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_schedule_block(
    app_state: State<'_, Arc<AppState>>,
    block: ScheduleBlockInput,
) -> Result<ScheduleBlock, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_schedule_block: Using local PostgreSQL");
        return pool.create_schedule_block(&block).await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn delete_schedule_block(
    app_state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("delete_schedule_block: Using local PostgreSQL");
        return pool.delete_schedule_block(&id).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// COMMANDS - CLINICAL TYPES
// ============================================================

#[tauri::command]
pub async fn get_surgery_types(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<SurgeryType>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_surgery_types: Using local PostgreSQL");
        return pool.get_surgery_types().await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_study_types(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<StudyType>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_study_types: Using local PostgreSQL");
        return pool.get_study_types().await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn get_procedure_types(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<ProcedureTypeConfig>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_procedure_types: Using local PostgreSQL");
        return pool.get_procedure_types().await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// COMMANDS - REFERRING DOCTORS
// ============================================================

#[tauri::command]
pub async fn get_referring_doctors(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<ReferringDoctor>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_referring_doctors: Using local PostgreSQL");
        return pool.get_referring_doctors().await;
    }
    Err("No database connection available".to_string())
}

#[tauri::command]
pub async fn create_referring_doctor(
    app_state: State<'_, Arc<AppState>>,
    doctor: ReferringDoctorInput,
) -> Result<ReferringDoctor, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("create_referring_doctor: Using local PostgreSQL");
        return pool.create_referring_doctor(&doctor).await;
    }
    Err("No database connection available".to_string())
}

// ============================================================
// COMMANDS - SYNC PENDING COUNT (Phase 21)
// ============================================================

/// Get count of pending sync items from _sync_pending table
/// This reads from the PostgreSQL table that the sync service uses
#[tauri::command]
pub async fn get_sync_pending_count(
    app_state: State<'_, Arc<AppState>>,
) -> Result<SyncPendingStatus, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_sync_pending_count: Using local PostgreSQL");
        return pool.get_sync_pending_count().await;
    }
    // If no PostgreSQL connection, return zero pending
    Ok(SyncPendingStatus {
        total_pending: 0,
        by_table: vec![],
    })
}

/// Get detailed list of pending sync items (for admin debugging)
#[tauri::command]
pub async fn get_sync_pending_details(
    app_state: State<'_, Arc<AppState>>,
    limit: Option<i64>,
) -> Result<Vec<SyncPendingDetail>, String> {
    if let Some(pool) = app_state.connection_manager.get_postgres_pool().await {
        log::info!("get_sync_pending_details: Using local PostgreSQL");
        return pool.get_sync_pending_details(limit.unwrap_or(50)).await;
    }
    Ok(vec![])
}

// ============================================================
// LOCAL STORAGE (Phase 22) - TYPES
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalStorageResult {
    pub success: bool,
    pub local_path: String,
    pub bucket: String,
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalStorageStatus {
    pub enabled: bool,
    pub smb_path: Option<String>,
    pub is_accessible: bool,
}

// ============================================================
// COMMANDS - LOCAL STORAGE (Phase 22)
// ============================================================

/// Upload a file to local SMB storage (for offline use)
/// The sync service will later upload this to Supabase Storage
#[tauri::command]
pub async fn upload_file_to_local_storage(
    app_state: State<'_, Arc<AppState>>,
    bucket: String,
    file_path: String,
    file_data: Vec<u8>,
) -> Result<LocalStorageResult, String> {
    // Check if local storage is configured
    let storage_config = app_state.config.local_storage.as_ref()
        .ok_or_else(|| "Local storage not configured".to_string())?;

    if !storage_config.enabled {
        return Err("Local storage is disabled".to_string());
    }

    let smb_path = &storage_config.smb_path;

    // Construct full path: \\server\share\bucket\file_path
    let full_path = std::path::Path::new(smb_path)
        .join(&bucket)
        .join(&file_path);

    log::info!("upload_file_to_local_storage: Writing to {:?}", full_path);

    // Create parent directories if they don't exist
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
    }

    // Write the file
    std::fs::write(&full_path, &file_data)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    log::info!("upload_file_to_local_storage: Successfully wrote {} bytes", file_data.len());

    Ok(LocalStorageResult {
        success: true,
        local_path: full_path.to_string_lossy().to_string(),
        bucket,
        file_path,
    })
}

/// Read a file from local SMB storage
#[tauri::command]
pub async fn read_file_from_local_storage(
    app_state: State<'_, Arc<AppState>>,
    bucket: String,
    file_path: String,
) -> Result<Vec<u8>, String> {
    // Check if local storage is configured
    let storage_config = app_state.config.local_storage.as_ref()
        .ok_or_else(|| "Local storage not configured".to_string())?;

    if !storage_config.enabled {
        return Err("Local storage is disabled".to_string());
    }

    let smb_path = &storage_config.smb_path;

    // Construct full path
    let full_path = std::path::Path::new(smb_path)
        .join(&bucket)
        .join(&file_path);

    log::info!("read_file_from_local_storage: Reading from {:?}", full_path);

    // Read the file
    let data = std::fs::read(&full_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    log::info!("read_file_from_local_storage: Read {} bytes", data.len());

    Ok(data)
}

/// Check if local storage is available and accessible
#[tauri::command]
pub async fn get_local_storage_status(
    app_state: State<'_, Arc<AppState>>,
) -> Result<LocalStorageStatus, String> {
    let storage_config = match app_state.config.local_storage.as_ref() {
        Some(config) => config,
        None => {
            return Ok(LocalStorageStatus {
                enabled: false,
                smb_path: None,
                is_accessible: false,
            });
        }
    };

    if !storage_config.enabled {
        return Ok(LocalStorageStatus {
            enabled: false,
            smb_path: Some(storage_config.smb_path.clone()),
            is_accessible: false,
        });
    }

    // Check if the SMB path is accessible
    let path = std::path::Path::new(&storage_config.smb_path);
    let is_accessible = path.exists() && path.is_dir();

    Ok(LocalStorageStatus {
        enabled: true,
        smb_path: Some(storage_config.smb_path.clone()),
        is_accessible,
    })
}

/// List files in a bucket from local storage
#[tauri::command]
pub async fn list_local_storage_files(
    app_state: State<'_, Arc<AppState>>,
    bucket: String,
    prefix: Option<String>,
) -> Result<Vec<String>, String> {
    let storage_config = app_state.config.local_storage.as_ref()
        .ok_or_else(|| "Local storage not configured".to_string())?;

    if !storage_config.enabled {
        return Err("Local storage is disabled".to_string());
    }

    let smb_path = &storage_config.smb_path;
    let bucket_path = std::path::Path::new(smb_path).join(&bucket);

    let search_path = match &prefix {
        Some(p) => bucket_path.join(p),
        None => bucket_path.clone(),
    };

    if !search_path.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    collect_files_recursive(&search_path, &bucket_path, &mut files)?;

    Ok(files)
}

fn collect_files_recursive(
    current: &std::path::Path,
    base: &std::path::Path,
    files: &mut Vec<String>,
) -> Result<(), String> {
    if current.is_dir() {
        let entries = std::fs::read_dir(current)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            collect_files_recursive(&entry.path(), base, files)?;
        }
    } else if current.is_file() {
        // Get relative path from bucket base
        if let Ok(relative) = current.strip_prefix(base) {
            files.push(relative.to_string_lossy().to_string());
        }
    }
    Ok(())
}
