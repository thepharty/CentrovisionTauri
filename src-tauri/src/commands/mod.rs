use crate::db::Database;
use crate::AppState;
use crate::connection_manager::ConnectionStatus;
use serde::{Deserialize, Serialize};
use tauri::State;
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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_online: bool,
    pub pending_count: i64,
    pub last_sync: Option<String>,
}

// ============================================================
// COMMANDS - CONNECTION STATUS (NEW)
// ============================================================

/// Get the current connection status (Supabase, Local, or Offline)
#[tauri::command]
pub async fn get_connection_status(
    app_state: State<'_, Arc<AppState>>,
) -> Result<ConnectionStatus, String> {
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

    // Fallback to SQLite cache
    log::info!("get_appointments: Using SQLite cache");
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, patient_id, room_id, doctor_id, branch_id, starts_at, ends_at, reason, type, status
             FROM appointments
             WHERE branch_id = ?
               AND date(starts_at) = date(?)
               AND deleted_at IS NULL
             ORDER BY starts_at",
        )
        .map_err(|e| e.to_string())?;

    let appointments = stmt
        .query_map([&branch_id, &date], |row| {
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

    // Get updated appointment
    let appointment = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, patient_id, room_id, doctor_id, branch_id, starts_at, ends_at, reason, type, status
                 FROM appointments WHERE id = ?",
            )
            .map_err(|e| e.to_string())?;

        stmt.query_row([&id], |row| {
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
