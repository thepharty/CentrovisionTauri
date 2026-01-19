// PostgreSQL client for local clinic server
// Handles connection pooling and queries to the local PostgreSQL instance

use crate::commands::{
    Appointment, Branch, Patient, Profile, Room,
    AppointmentInput, AppointmentUpdate, PatientInput, PatientUpdate,
};
use crate::config::LocalServerConfig;
use deadpool_postgres::{Config, Pool, Runtime, PoolError};
use tokio_postgres::NoTls;
use std::sync::Arc;

/// PostgreSQL connection pool wrapper
pub struct PostgresPool {
    pool: Pool,
    config: LocalServerConfig,
}

impl PostgresPool {
    /// Create a new PostgreSQL connection pool
    pub async fn new(config: &LocalServerConfig) -> Result<Self, String> {
        let mut cfg = Config::new();
        cfg.host = Some(config.host.clone());
        cfg.port = Some(config.port);
        cfg.dbname = Some(config.database.clone());
        cfg.user = Some(config.user.clone());
        cfg.password = Some(config.password.clone());

        let pool = cfg
            .create_pool(Some(Runtime::Tokio1), NoTls)
            .map_err(|e| format!("Failed to create PostgreSQL pool: {}", e))?;

        log::info!("PostgreSQL pool created for {}:{}", config.host, config.port);

        Ok(Self {
            pool,
            config: config.clone(),
        })
    }

    /// Check if the connection is healthy
    pub async fn health_check(&self) -> bool {
        match self.pool.get().await {
            Ok(client) => {
                match client.query_one("SELECT 1", &[]).await {
                    Ok(_) => true,
                    Err(e) => {
                        log::warn!("PostgreSQL health check query failed: {}", e);
                        false
                    }
                }
            }
            Err(e) => {
                log::warn!("Failed to get PostgreSQL connection: {}", e);
                false
            }
        }
    }

    /// Get server address for display
    pub fn get_server_address(&self) -> String {
        format!("{}:{}", self.config.host, self.config.port)
    }

    // ============================================================
    // READ OPERATIONS
    // ============================================================

    /// Get all active branches
    pub async fn get_branches(&self) -> Result<Vec<Branch>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, code, address, phone, active
                 FROM branches WHERE active = true ORDER BY code",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        let branches = rows
            .iter()
            .map(|row| Branch {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                name: row.get(1),
                code: row.get(2),
                address: row.get(3),
                phone: row.get(4),
                active: row.get(5),
            })
            .collect();

        Ok(branches)
    }

    /// Get rooms by branch
    pub async fn get_rooms(&self, branch_id: &str) -> Result<Vec<Room>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, kind, branch_id, active
                 FROM rooms WHERE branch_id = $1 AND active = true",
                &[&branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let rooms = rows
            .iter()
            .map(|row| Room {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                name: row.get(1),
                kind: row.get::<_, String>(2),
                branch_id: row.get::<_, uuid::Uuid>(3).to_string(),
                active: row.get(4),
            })
            .collect();

        Ok(rooms)
    }

    /// Get patients with optional search
    pub async fn get_patients(&self, search: Option<&str>, limit: i32) -> Result<Vec<Patient>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = if let Some(search_term) = search {
            let pattern = format!("%{}%", search_term);
            client
                .query(
                    "SELECT id, code, first_name, last_name, dob, phone, email,
                            allergies, notes, address, diabetes, hta,
                            ophthalmic_history, occupation
                     FROM patients
                     WHERE deleted_at IS NULL
                       AND (first_name ILIKE $1 OR last_name ILIKE $1 OR code ILIKE $1)
                     ORDER BY last_name, first_name
                     LIMIT $2",
                    &[&pattern, &(limit as i64)],
                )
                .await
                .map_err(|e| e.to_string())?
        } else {
            client
                .query(
                    "SELECT id, code, first_name, last_name, dob, phone, email,
                            allergies, notes, address, diabetes, hta,
                            ophthalmic_history, occupation
                     FROM patients
                     WHERE deleted_at IS NULL
                     ORDER BY last_name, first_name
                     LIMIT $1",
                    &[&(limit as i64)],
                )
                .await
                .map_err(|e| e.to_string())?
        };

        let patients = rows
            .iter()
            .map(|row| Patient {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                code: row.get(1),
                first_name: row.get(2),
                last_name: row.get(3),
                dob: row.get::<_, Option<chrono::NaiveDate>>(4).map(|d| d.to_string()),
                phone: row.get(5),
                email: row.get(6),
                allergies: row.get(7),
                notes: row.get(8),
                address: row.get(9),
                diabetes: row.get::<_, Option<bool>>(10).unwrap_or(false),
                hta: row.get::<_, Option<bool>>(11).unwrap_or(false),
                ophthalmic_history: row.get(12),
                occupation: row.get(13),
            })
            .collect();

        Ok(patients)
    }

    /// Get patient by ID
    pub async fn get_patient_by_id(&self, id: &str) -> Result<Option<Patient>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let patient_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        let result = client
            .query_opt(
                "SELECT id, code, first_name, last_name, dob, phone, email,
                        allergies, notes, address, diabetes, hta,
                        ophthalmic_history, occupation
                 FROM patients
                 WHERE id = $1 AND deleted_at IS NULL",
                &[&patient_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(result.map(|row| Patient {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            code: row.get(1),
            first_name: row.get(2),
            last_name: row.get(3),
            dob: row.get::<_, Option<chrono::NaiveDate>>(4).map(|d| d.to_string()),
            phone: row.get(5),
            email: row.get(6),
            allergies: row.get(7),
            notes: row.get(8),
            address: row.get(9),
            diabetes: row.get::<_, Option<bool>>(10).unwrap_or(false),
            hta: row.get::<_, Option<bool>>(11).unwrap_or(false),
            ophthalmic_history: row.get(12),
            occupation: row.get(13),
        }))
    }

    /// Get appointments by branch and date
    pub async fn get_appointments(&self, branch_id: &str, date: &str) -> Result<Vec<Appointment>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;
        let date_parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date format: {}", e))?;

        let rows = client
            .query(
                "SELECT id, patient_id, room_id, doctor_id, branch_id,
                        starts_at, ends_at, reason, type, status
                 FROM appointments
                 WHERE branch_id = $1
                   AND DATE(starts_at) = $2
                   AND deleted_at IS NULL
                 ORDER BY starts_at",
                &[&branch_uuid, &date_parsed],
            )
            .await
            .map_err(|e| e.to_string())?;

        let appointments = rows
            .iter()
            .map(|row| Appointment {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                patient_id: row.get::<_, Option<uuid::Uuid>>(1).map(|u| u.to_string()),
                room_id: row.get::<_, Option<uuid::Uuid>>(2).map(|u| u.to_string()),
                doctor_id: row.get::<_, Option<uuid::Uuid>>(3).map(|u| u.to_string()),
                branch_id: row.get::<_, uuid::Uuid>(4).to_string(),
                starts_at: row.get::<_, chrono::DateTime<chrono::Utc>>(5).to_rfc3339(),
                ends_at: row.get::<_, chrono::DateTime<chrono::Utc>>(6).to_rfc3339(),
                reason: row.get(7),
                appointment_type: row.get::<_, String>(8),
                status: row.get::<_, String>(9),
            })
            .collect();

        Ok(appointments)
    }

    /// Get doctors (profiles with doctor role)
    pub async fn get_doctors(&self) -> Result<Vec<Profile>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT p.id, p.user_id, p.full_name, p.email, p.specialty, p.is_visible_in_dashboard
                 FROM profiles p
                 INNER JOIN user_roles ur ON ur.user_id = p.user_id
                 WHERE ur.role = 'doctor' AND p.is_visible_in_dashboard = true",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        let profiles = rows
            .iter()
            .map(|row| Profile {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                user_id: row.get::<_, uuid::Uuid>(1).to_string(),
                full_name: row.get(2),
                email: row.get(3),
                specialty: row.get(4),
                is_visible_in_dashboard: row.get(5),
            })
            .collect();

        Ok(profiles)
    }

    /// Get user roles
    pub async fn get_user_roles(&self, user_id: &str) -> Result<Vec<String>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let user_uuid = uuid::Uuid::parse_str(user_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT role FROM user_roles WHERE user_id = $1",
                &[&user_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let roles: Vec<String> = rows.iter().map(|row| row.get::<_, String>(0)).collect();
        Ok(roles)
    }

    // ============================================================
    // WRITE OPERATIONS
    // ============================================================

    /// Create a new patient
    pub async fn create_patient(&self, patient: &PatientInput) -> Result<Patient, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        // Generate patient code
        let count: i64 = client
            .query_one("SELECT COUNT(*) + 1 FROM patients", &[])
            .await
            .map_err(|e| e.to_string())?
            .get(0);
        let code = format!("P-{:05}", count);

        let dob: Option<chrono::NaiveDate> = patient.dob.as_ref().and_then(|d| {
            chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()
        });

        client
            .execute(
                "INSERT INTO patients (id, code, first_name, last_name, dob, phone, email,
                                       allergies, notes, address, diabetes, hta,
                                       ophthalmic_history, occupation, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
                &[
                    &id,
                    &code,
                    &patient.first_name,
                    &patient.last_name,
                    &dob,
                    &patient.phone,
                    &patient.email,
                    &patient.allergies,
                    &patient.notes,
                    &patient.address,
                    &patient.diabetes.unwrap_or(false),
                    &patient.hta.unwrap_or(false),
                    &patient.ophthalmic_history,
                    &patient.occupation,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Patient {
            id: id.to_string(),
            code: Some(code),
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
        })
    }

    /// Create a new appointment
    pub async fn create_appointment(&self, appointment: &AppointmentInput) -> Result<Appointment, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();
        let status = appointment.status.clone().unwrap_or_else(|| "scheduled".to_string());

        let branch_uuid = uuid::Uuid::parse_str(&appointment.branch_id).map_err(|e| e.to_string())?;
        let patient_uuid: Option<uuid::Uuid> = appointment.patient_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let room_uuid: Option<uuid::Uuid> = appointment.room_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let doctor_uuid: Option<uuid::Uuid> = appointment.doctor_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());

        let starts_at = chrono::DateTime::parse_from_rfc3339(&appointment.starts_at)
            .map_err(|e| format!("Invalid starts_at: {}", e))?
            .with_timezone(&chrono::Utc);
        let ends_at = chrono::DateTime::parse_from_rfc3339(&appointment.ends_at)
            .map_err(|e| format!("Invalid ends_at: {}", e))?
            .with_timezone(&chrono::Utc);

        client
            .execute(
                "INSERT INTO appointments (id, patient_id, room_id, doctor_id, branch_id,
                                          starts_at, ends_at, reason, type, status,
                                          created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
                &[
                    &id,
                    &patient_uuid,
                    &room_uuid,
                    &doctor_uuid,
                    &branch_uuid,
                    &starts_at,
                    &ends_at,
                    &appointment.reason,
                    &appointment.appointment_type,
                    &status,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Appointment {
            id: id.to_string(),
            patient_id: appointment.patient_id.clone(),
            room_id: appointment.room_id.clone(),
            doctor_id: appointment.doctor_id.clone(),
            branch_id: appointment.branch_id.clone(),
            starts_at: appointment.starts_at.clone(),
            ends_at: appointment.ends_at.clone(),
            reason: appointment.reason.clone(),
            appointment_type: appointment.appointment_type.clone(),
            status,
        })
    }

    /// Update an appointment
    pub async fn update_appointment(&self, id: &str, updates: &AppointmentUpdate) -> Result<Appointment, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let appt_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        // Build dynamic UPDATE query
        let mut set_parts: Vec<String> = vec!["updated_at = $1".to_string()];
        let mut param_idx = 2;

        // This is a simplified approach - in production you might want a more elegant solution
        // For now, we'll update all fields if they're Some

        client
            .execute(
                &format!(
                    "UPDATE appointments SET
                        updated_at = $1,
                        patient_id = COALESCE($2, patient_id),
                        room_id = COALESCE($3, room_id),
                        doctor_id = COALESCE($4, doctor_id),
                        starts_at = COALESCE($5, starts_at),
                        ends_at = COALESCE($6, ends_at),
                        reason = COALESCE($7, reason),
                        type = COALESCE($8, type),
                        status = COALESCE($9, status)
                     WHERE id = $10"
                ),
                &[
                    &now,
                    &updates.patient_id.as_ref().and_then(|id| uuid::Uuid::parse_str(id).ok()),
                    &updates.room_id.as_ref().and_then(|id| uuid::Uuid::parse_str(id).ok()),
                    &updates.doctor_id.as_ref().and_then(|id| uuid::Uuid::parse_str(id).ok()),
                    &updates.starts_at.as_ref().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()).map(|dt| dt.with_timezone(&chrono::Utc)),
                    &updates.ends_at.as_ref().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()).map(|dt| dt.with_timezone(&chrono::Utc)),
                    &updates.reason,
                    &updates.appointment_type,
                    &updates.status,
                    &appt_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Fetch updated appointment
        let row = client
            .query_one(
                "SELECT id, patient_id, room_id, doctor_id, branch_id,
                        starts_at, ends_at, reason, type, status
                 FROM appointments WHERE id = $1",
                &[&appt_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Appointment {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            patient_id: row.get::<_, Option<uuid::Uuid>>(1).map(|u| u.to_string()),
            room_id: row.get::<_, Option<uuid::Uuid>>(2).map(|u| u.to_string()),
            doctor_id: row.get::<_, Option<uuid::Uuid>>(3).map(|u| u.to_string()),
            branch_id: row.get::<_, uuid::Uuid>(4).to_string(),
            starts_at: row.get::<_, chrono::DateTime<chrono::Utc>>(5).to_rfc3339(),
            ends_at: row.get::<_, chrono::DateTime<chrono::Utc>>(6).to_rfc3339(),
            reason: row.get(7),
            appointment_type: row.get::<_, String>(8),
            status: row.get::<_, String>(9),
        })
    }

    /// Delete an appointment (soft delete)
    pub async fn delete_appointment(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let appt_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE appointments SET deleted_at = $1, updated_at = $1 WHERE id = $2",
                &[&now, &appt_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Update a patient
    pub async fn update_patient(&self, id: &str, updates: &PatientUpdate) -> Result<Patient, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let patient_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        let dob: Option<chrono::NaiveDate> = updates.dob.as_ref().and_then(|d| {
            chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()
        });

        client
            .execute(
                "UPDATE patients SET
                    updated_at = $1,
                    first_name = COALESCE($2, first_name),
                    last_name = COALESCE($3, last_name),
                    dob = COALESCE($4, dob),
                    phone = COALESCE($5, phone),
                    email = COALESCE($6, email),
                    allergies = COALESCE($7, allergies),
                    notes = COALESCE($8, notes),
                    address = COALESCE($9, address),
                    diabetes = COALESCE($10, diabetes),
                    hta = COALESCE($11, hta),
                    ophthalmic_history = COALESCE($12, ophthalmic_history),
                    occupation = COALESCE($13, occupation)
                 WHERE id = $14",
                &[
                    &now,
                    &updates.first_name,
                    &updates.last_name,
                    &dob,
                    &updates.phone,
                    &updates.email,
                    &updates.allergies,
                    &updates.notes,
                    &updates.address,
                    &updates.diabetes,
                    &updates.hta,
                    &updates.ophthalmic_history,
                    &updates.occupation,
                    &patient_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Fetch updated patient
        self.get_patient_by_id(id)
            .await?
            .ok_or_else(|| "Patient not found after update".to_string())
    }
}
