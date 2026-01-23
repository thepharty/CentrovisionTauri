// PostgreSQL client for local clinic server
// Handles connection pooling and queries to the local PostgreSQL instance

use crate::commands::{
    Appointment, Branch, Patient, PatientEmbed, Profile, Room,
    AppointmentInput, AppointmentUpdate, PatientInput, PatientUpdate,
    Encounter, DoctorEmbed, EncounterInput, EncounterUpdate,
    ExamEye, ExamEyeInput,
    Study, StudyFile, StudyInput, StudyStatusUpdate,
    Surgery, SurgeryFile, SurgeryInput, SurgeryUpdate,
    Procedure, ProcedureInput, ProcedureUpdate,
    Diagnosis, DiagnosisInput, DiagnosisUpdate,
    Invoice, InvoiceItem, InvoiceInput, InvoiceItemInput, InvoiceWithPatient,
    Payment, PaymentInput,
    ServicePrice, ServicePriceInput, ServicePriceUpdate,
    InventoryItem, InventoryItemInput, InventoryItemUpdate, Supplier,
    CRMPipeline, CRMPipelineInput, CRMPipelineStage, CRMPipelineNote, CRMPipelineNoteInput,
    CRMProcedureType, BranchEmbed,
    ScheduleBlock, ScheduleBlockInput,
    SurgeryType, StudyType, ProcedureTypeConfig,
    ReferringDoctor, ReferringDoctorInput,
    SyncPendingStatus, SyncPendingByTable, SyncPendingDetail,
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

    /// Get appointments by branch and date (with patient embed via LEFT JOIN)
    pub async fn get_appointments(&self, branch_id: &str, date: &str) -> Result<Vec<Appointment>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;
        let date_parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date format: {}", e))?;

        let rows = client
            .query(
                "SELECT a.id, a.patient_id, a.room_id, a.doctor_id, a.branch_id,
                        a.starts_at, a.ends_at, a.reason, a.type::text, a.status::text,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM appointments a
                 LEFT JOIN patients p ON a.patient_id = p.id
                 WHERE a.branch_id = $1
                   AND DATE(a.starts_at) = $2
                   AND a.deleted_at IS NULL
                 ORDER BY a.starts_at",
                &[&branch_uuid, &date_parsed],
            )
            .await
            .map_err(|e| e.to_string())?;

        let appointments = rows
            .iter()
            .map(|row| {
                // Build patient embed if patient data exists
                let patient_embed = row.get::<_, Option<uuid::Uuid>>(10).map(|p_id| {
                    PatientEmbed {
                        id: p_id.to_string(),
                        first_name: row.get(11),
                        last_name: row.get(12),
                        code: row.get(13),
                        phone: row.get(14),
                    }
                });

                Appointment {
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
                    patient: patient_embed,
                }
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
            patient: None, // Will be populated on next fetch
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

        // Fetch updated appointment with patient data
        let row = client
            .query_one(
                "SELECT a.id, a.patient_id, a.room_id, a.doctor_id, a.branch_id,
                        a.starts_at, a.ends_at, a.reason, a.type::text, a.status::text,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM appointments a
                 LEFT JOIN patients p ON a.patient_id = p.id
                 WHERE a.id = $1",
                &[&appt_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let patient_embed = row.get::<_, Option<uuid::Uuid>>(10).map(|p_id| {
            PatientEmbed {
                id: p_id.to_string(),
                first_name: row.get(11),
                last_name: row.get(12),
                code: row.get(13),
                phone: row.get(14),
            }
        });

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
            patient: patient_embed,
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

    // ============================================================
    // ENCOUNTERS (EXPEDIENTES MÉDICOS)
    // ============================================================

    /// Get encounter by ID with patient and doctor embeds
    pub async fn get_encounter_by_id(&self, id: &str) -> Result<Option<Encounter>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let encounter_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        let result = client
            .query_opt(
                "SELECT e.id, e.patient_id, e.appointment_id, e.doctor_id, e.date,
                        e.type::text, e.summary, e.motivo_consulta, e.plan_tratamiento,
                        e.cirugias, e.estudios, e.proxima_cita, e.excursiones_od, e.excursiones_os,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM encounters e
                 LEFT JOIN patients p ON e.patient_id = p.id
                 LEFT JOIN profiles pr ON e.doctor_id = pr.user_id
                 WHERE e.id = $1 AND e.deleted_at IS NULL",
                &[&encounter_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(result.map(|row| self.map_encounter_row(&row)))
    }

    /// Get encounters by patient ID
    pub async fn get_encounters_by_patient(&self, patient_id: &str) -> Result<Vec<Encounter>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let patient_uuid = uuid::Uuid::parse_str(patient_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT e.id, e.patient_id, e.appointment_id, e.doctor_id, e.date,
                        e.type::text, e.summary, e.motivo_consulta, e.plan_tratamiento,
                        e.cirugias, e.estudios, e.proxima_cita, e.excursiones_od, e.excursiones_os,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM encounters e
                 LEFT JOIN patients p ON e.patient_id = p.id
                 LEFT JOIN profiles pr ON e.doctor_id = pr.user_id
                 WHERE e.patient_id = $1 AND e.deleted_at IS NULL
                 ORDER BY e.date DESC",
                &[&patient_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| self.map_encounter_row(row)).collect())
    }

    /// Get encounter by appointment ID
    pub async fn get_encounter_by_appointment(&self, appointment_id: &str) -> Result<Option<Encounter>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let appointment_uuid = uuid::Uuid::parse_str(appointment_id).map_err(|e| e.to_string())?;

        let result = client
            .query_opt(
                "SELECT e.id, e.patient_id, e.appointment_id, e.doctor_id, e.date,
                        e.type::text, e.summary, e.motivo_consulta, e.plan_tratamiento,
                        e.cirugias, e.estudios, e.proxima_cita, e.excursiones_od, e.excursiones_os,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM encounters e
                 LEFT JOIN patients p ON e.patient_id = p.id
                 LEFT JOIN profiles pr ON e.doctor_id = pr.user_id
                 WHERE e.appointment_id = $1 AND e.deleted_at IS NULL",
                &[&appointment_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(result.map(|row| self.map_encounter_row(&row)))
    }

    /// Create a new encounter
    pub async fn create_encounter(&self, encounter: &EncounterInput) -> Result<Encounter, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let patient_uuid = uuid::Uuid::parse_str(&encounter.patient_id).map_err(|e| e.to_string())?;
        let appointment_uuid: Option<uuid::Uuid> = encounter.appointment_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let doctor_uuid: Option<uuid::Uuid> = encounter.doctor_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());

        client
            .execute(
                "INSERT INTO encounters (id, patient_id, appointment_id, doctor_id, date, type, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                &[
                    &id,
                    &patient_uuid,
                    &appointment_uuid,
                    &doctor_uuid,
                    &now.date_naive(),
                    &encounter.encounter_type,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Return the created encounter
        self.get_encounter_by_id(&id.to_string())
            .await?
            .ok_or_else(|| "Encounter not found after creation".to_string())
    }

    /// Update an encounter
    pub async fn update_encounter(&self, id: &str, updates: &EncounterUpdate) -> Result<Encounter, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let encounter_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE encounters SET
                    updated_at = $1,
                    summary = COALESCE($2, summary),
                    motivo_consulta = COALESCE($3, motivo_consulta),
                    plan_tratamiento = COALESCE($4, plan_tratamiento),
                    cirugias = COALESCE($5, cirugias),
                    estudios = COALESCE($6, estudios),
                    proxima_cita = COALESCE($7, proxima_cita),
                    excursiones_od = COALESCE($8, excursiones_od),
                    excursiones_os = COALESCE($9, excursiones_os)
                 WHERE id = $10",
                &[
                    &now,
                    &updates.summary,
                    &updates.motivo_consulta,
                    &updates.plan_tratamiento,
                    &updates.cirugias,
                    &updates.estudios,
                    &updates.proxima_cita,
                    &updates.excursiones_od,
                    &updates.excursiones_os,
                    &encounter_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        self.get_encounter_by_id(id)
            .await?
            .ok_or_else(|| "Encounter not found after update".to_string())
    }

    /// Helper to map encounter row to struct
    fn map_encounter_row(&self, row: &tokio_postgres::Row) -> Encounter {
        let patient_embed = row.get::<_, Option<uuid::Uuid>>(14).map(|p_id| {
            PatientEmbed {
                id: p_id.to_string(),
                first_name: row.get(15),
                last_name: row.get(16),
                code: row.get(17),
                phone: row.get(18),
            }
        });

        let doctor_embed = row.get::<_, Option<uuid::Uuid>>(19).map(|u_id| {
            DoctorEmbed {
                user_id: u_id.to_string(),
                full_name: row.get(20),
                specialty: row.get(21),
            }
        });

        Encounter {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            patient_id: row.get::<_, uuid::Uuid>(1).to_string(),
            appointment_id: row.get::<_, Option<uuid::Uuid>>(2).map(|u| u.to_string()),
            doctor_id: row.get::<_, Option<uuid::Uuid>>(3).map(|u| u.to_string()),
            date: row.get::<_, chrono::NaiveDate>(4).to_string(),
            encounter_type: row.get::<_, String>(5),
            summary: row.get(6),
            motivo_consulta: row.get(7),
            plan_tratamiento: row.get(8),
            cirugias: row.get(9),
            estudios: row.get(10),
            proxima_cita: row.get(11),
            excursiones_od: row.get(12),
            excursiones_os: row.get(13),
            patient: patient_embed,
            doctor: doctor_embed,
        }
    }

    // ============================================================
    // EXAM EYE (EXÁMENES OCULARES)
    // ============================================================

    /// Get exam eye by encounter and side
    pub async fn get_exam_eye(&self, encounter_id: &str, side: &str) -> Result<Option<ExamEye>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let encounter_uuid = uuid::Uuid::parse_str(encounter_id).map_err(|e| e.to_string())?;

        let result = client
            .query_opt(
                "SELECT id, encounter_id, side, av_sc, av_cc,
                        ref_sphere, ref_cyl, ref_axis,
                        ref_subj_sphere, ref_subj_cyl, ref_subj_axis,
                        rx_sphere, rx_cyl, rx_axis, rx_add,
                        iop, slit_lamp, fundus, plan
                 FROM exam_eye
                 WHERE encounter_id = $1 AND side = $2",
                &[&encounter_uuid, &side],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(result.map(|row| self.map_exam_eye_row(&row)))
    }

    /// Get all exam eyes for an encounter (both OD and OS)
    pub async fn get_exam_eyes_by_encounter(&self, encounter_id: &str) -> Result<Vec<ExamEye>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let encounter_uuid = uuid::Uuid::parse_str(encounter_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, encounter_id, side, av_sc, av_cc,
                        ref_sphere, ref_cyl, ref_axis,
                        ref_subj_sphere, ref_subj_cyl, ref_subj_axis,
                        rx_sphere, rx_cyl, rx_axis, rx_add,
                        iop, slit_lamp, fundus, plan
                 FROM exam_eye
                 WHERE encounter_id = $1
                 ORDER BY side",
                &[&encounter_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| self.map_exam_eye_row(row)).collect())
    }

    /// Upsert exam eye (insert or update based on encounter_id + side)
    pub async fn upsert_exam_eye(&self, exam: &ExamEyeInput) -> Result<ExamEye, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let encounter_uuid = uuid::Uuid::parse_str(&exam.encounter_id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        // Check if record exists
        let existing = client
            .query_opt(
                "SELECT id FROM exam_eye WHERE encounter_id = $1 AND side = $2",
                &[&encounter_uuid, &exam.side],
            )
            .await
            .map_err(|e| e.to_string())?;

        if let Some(row) = existing {
            // Update existing
            let id: uuid::Uuid = row.get(0);
            client
                .execute(
                    "UPDATE exam_eye SET
                        av_sc = $1, av_cc = $2,
                        ref_sphere = $3, ref_cyl = $4, ref_axis = $5,
                        ref_subj_sphere = $6, ref_subj_cyl = $7, ref_subj_axis = $8,
                        rx_sphere = $9, rx_cyl = $10, rx_axis = $11, rx_add = $12,
                        iop = $13, slit_lamp = $14, fundus = $15, plan = $16,
                        updated_at = $17
                     WHERE id = $18",
                    &[
                        &exam.av_sc, &exam.av_cc,
                        &exam.ref_sphere, &exam.ref_cyl, &exam.ref_axis,
                        &exam.ref_subj_sphere, &exam.ref_subj_cyl, &exam.ref_subj_axis,
                        &exam.rx_sphere, &exam.rx_cyl, &exam.rx_axis, &exam.rx_add,
                        &exam.iop, &exam.slit_lamp, &exam.fundus, &exam.plan,
                        &now, &id,
                    ],
                )
                .await
                .map_err(|e| e.to_string())?;
        } else {
            // Insert new
            let id = uuid::Uuid::new_v4();
            client
                .execute(
                    "INSERT INTO exam_eye (id, encounter_id, side, av_sc, av_cc,
                        ref_sphere, ref_cyl, ref_axis,
                        ref_subj_sphere, ref_subj_cyl, ref_subj_axis,
                        rx_sphere, rx_cyl, rx_axis, rx_add,
                        iop, slit_lamp, fundus, plan, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)",
                    &[
                        &id, &encounter_uuid, &exam.side, &exam.av_sc, &exam.av_cc,
                        &exam.ref_sphere, &exam.ref_cyl, &exam.ref_axis,
                        &exam.ref_subj_sphere, &exam.ref_subj_cyl, &exam.ref_subj_axis,
                        &exam.rx_sphere, &exam.rx_cyl, &exam.rx_axis, &exam.rx_add,
                        &exam.iop, &exam.slit_lamp, &exam.fundus, &exam.plan,
                        &now, &now,
                    ],
                )
                .await
                .map_err(|e| e.to_string())?;
        }

        // Return the upserted record
        self.get_exam_eye(&exam.encounter_id, &exam.side)
            .await?
            .ok_or_else(|| "ExamEye not found after upsert".to_string())
    }

    /// Helper to map exam_eye row to struct
    fn map_exam_eye_row(&self, row: &tokio_postgres::Row) -> ExamEye {
        ExamEye {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            encounter_id: row.get::<_, uuid::Uuid>(1).to_string(),
            side: row.get(2),
            av_sc: row.get(3),
            av_cc: row.get(4),
            ref_sphere: row.get(5),
            ref_cyl: row.get(6),
            ref_axis: row.get(7),
            ref_subj_sphere: row.get(8),
            ref_subj_cyl: row.get(9),
            ref_subj_axis: row.get(10),
            rx_sphere: row.get(11),
            rx_cyl: row.get(12),
            rx_axis: row.get(13),
            rx_add: row.get(14),
            iop: row.get(15),
            slit_lamp: row.get(16),
            fundus: row.get(17),
            plan: row.get(18),
        }
    }

    // ============================================================
    // STUDIES (ESTUDIOS)
    // ============================================================

    /// Get studies by appointment ID with files
    pub async fn get_studies_by_appointment(&self, appointment_id: &str) -> Result<Vec<Study>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let appointment_uuid = uuid::Uuid::parse_str(appointment_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT s.id, s.appointment_id, s.patient_id, s.study_type::text, s.status::text,
                        s.ordered_by, s.date, s.notes,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM studies s
                 LEFT JOIN patients p ON s.patient_id = p.id
                 WHERE s.appointment_id = $1 AND s.deleted_at IS NULL
                 ORDER BY s.created_at DESC",
                &[&appointment_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let mut studies: Vec<Study> = Vec::new();
        for row in rows {
            let study_id: uuid::Uuid = row.get(0);
            let files = self.get_study_files(&study_id.to_string()).await?;

            let patient_embed = row.get::<_, Option<uuid::Uuid>>(8).map(|p_id| {
                PatientEmbed {
                    id: p_id.to_string(),
                    first_name: row.get(9),
                    last_name: row.get(10),
                    code: row.get(11),
                    phone: row.get(12),
                }
            });

            studies.push(Study {
                id: study_id.to_string(),
                appointment_id: row.get::<_, Option<uuid::Uuid>>(1).map(|u| u.to_string()),
                patient_id: row.get::<_, uuid::Uuid>(2).to_string(),
                study_type: row.get(3),
                status: row.get(4),
                ordered_by: row.get::<_, Option<uuid::Uuid>>(5).map(|u| u.to_string()),
                date: row.get::<_, Option<chrono::NaiveDate>>(6).map(|d| d.to_string()),
                notes: row.get(7),
                study_files: if files.is_empty() { None } else { Some(files) },
                patient: patient_embed,
            });
        }

        Ok(studies)
    }

    /// Get studies by patient ID with files
    pub async fn get_studies_by_patient(&self, patient_id: &str) -> Result<Vec<Study>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let patient_uuid = uuid::Uuid::parse_str(patient_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT s.id, s.appointment_id, s.patient_id, s.study_type::text, s.status::text,
                        s.ordered_by, s.date, s.notes,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM studies s
                 LEFT JOIN patients p ON s.patient_id = p.id
                 WHERE s.patient_id = $1 AND s.deleted_at IS NULL
                 ORDER BY s.created_at DESC",
                &[&patient_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let mut studies: Vec<Study> = Vec::new();
        for row in rows {
            let study_id: uuid::Uuid = row.get(0);
            let files = self.get_study_files(&study_id.to_string()).await?;

            let patient_embed = row.get::<_, Option<uuid::Uuid>>(8).map(|p_id| {
                PatientEmbed {
                    id: p_id.to_string(),
                    first_name: row.get(9),
                    last_name: row.get(10),
                    code: row.get(11),
                    phone: row.get(12),
                }
            });

            studies.push(Study {
                id: study_id.to_string(),
                appointment_id: row.get::<_, Option<uuid::Uuid>>(1).map(|u| u.to_string()),
                patient_id: row.get::<_, uuid::Uuid>(2).to_string(),
                study_type: row.get(3),
                status: row.get(4),
                ordered_by: row.get::<_, Option<uuid::Uuid>>(5).map(|u| u.to_string()),
                date: row.get::<_, Option<chrono::NaiveDate>>(6).map(|d| d.to_string()),
                notes: row.get(7),
                study_files: if files.is_empty() { None } else { Some(files) },
                patient: patient_embed,
            });
        }

        Ok(studies)
    }

    /// Get study files by study ID
    async fn get_study_files(&self, study_id: &str) -> Result<Vec<StudyFile>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let study_uuid = uuid::Uuid::parse_str(study_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, study_id, file_path, mime_type, side, extracted_summary
                 FROM study_files
                 WHERE study_id = $1
                 ORDER BY created_at",
                &[&study_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| StudyFile {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            study_id: row.get::<_, uuid::Uuid>(1).to_string(),
            file_path: row.get(2),
            mime_type: row.get(3),
            side: row.get(4),
            extracted_summary: row.get(5),
        }).collect())
    }

    /// Create a new study
    pub async fn create_study(&self, study: &StudyInput) -> Result<Study, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let patient_uuid = uuid::Uuid::parse_str(&study.patient_id).map_err(|e| e.to_string())?;
        let appointment_uuid: Option<uuid::Uuid> = study.appointment_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let ordered_by_uuid: Option<uuid::Uuid> = study.ordered_by.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());

        client
            .execute(
                "INSERT INTO studies (id, appointment_id, patient_id, study_type, status, ordered_by, notes, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8)",
                &[
                    &id,
                    &appointment_uuid,
                    &patient_uuid,
                    &study.study_type,
                    &ordered_by_uuid,
                    &study.notes,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Get patient embed
        let patient = self.get_patient_by_id(&study.patient_id).await?;
        let patient_embed = patient.map(|p| PatientEmbed {
            id: p.id,
            first_name: Some(p.first_name),
            last_name: Some(p.last_name),
            code: p.code,
            phone: p.phone,
        });

        Ok(Study {
            id: id.to_string(),
            appointment_id: study.appointment_id.clone(),
            patient_id: study.patient_id.clone(),
            study_type: study.study_type.clone(),
            status: "pending".to_string(),
            ordered_by: study.ordered_by.clone(),
            date: None,
            notes: study.notes.clone(),
            study_files: None,
            patient: patient_embed,
        })
    }

    /// Update study status
    pub async fn update_study_status(&self, id: &str, updates: &StudyStatusUpdate) -> Result<Study, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let study_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        // If status is completed, set the date
        let date: Option<chrono::NaiveDate> = if updates.status == "completed" {
            Some(now.date_naive())
        } else {
            None
        };

        client
            .execute(
                "UPDATE studies SET
                    status = $1,
                    notes = COALESCE($2, notes),
                    date = COALESCE($3, date),
                    updated_at = $4
                 WHERE id = $5",
                &[
                    &updates.status,
                    &updates.notes,
                    &date,
                    &now,
                    &study_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Fetch updated study
        let row = client
            .query_one(
                "SELECT s.id, s.appointment_id, s.patient_id, s.study_type::text, s.status::text,
                        s.ordered_by, s.date, s.notes,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM studies s
                 LEFT JOIN patients p ON s.patient_id = p.id
                 WHERE s.id = $1",
                &[&study_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let files = self.get_study_files(id).await?;

        let patient_embed = row.get::<_, Option<uuid::Uuid>>(8).map(|p_id| {
            PatientEmbed {
                id: p_id.to_string(),
                first_name: row.get(9),
                last_name: row.get(10),
                code: row.get(11),
                phone: row.get(12),
            }
        });

        Ok(Study {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            appointment_id: row.get::<_, Option<uuid::Uuid>>(1).map(|u| u.to_string()),
            patient_id: row.get::<_, uuid::Uuid>(2).to_string(),
            study_type: row.get(3),
            status: row.get(4),
            ordered_by: row.get::<_, Option<uuid::Uuid>>(5).map(|u| u.to_string()),
            date: row.get::<_, Option<chrono::NaiveDate>>(6).map(|d| d.to_string()),
            notes: row.get(7),
            study_files: if files.is_empty() { None } else { Some(files) },
            patient: patient_embed,
        })
    }

    // ============================================================
    // SURGERIES (CIRUGÍAS)
    // ============================================================

    /// Get surgeries by appointment ID
    pub async fn get_surgeries_by_appointment(&self, appointment_id: &str) -> Result<Vec<Surgery>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let appointment_uuid = uuid::Uuid::parse_str(appointment_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT s.id, s.appointment_id, s.patient_id, s.surgery_type::text, s.eye,
                        s.date, s.status::text, s.surgeon_id, s.notes,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM surgeries s
                 LEFT JOIN patients p ON s.patient_id = p.id
                 LEFT JOIN profiles pr ON s.surgeon_id = pr.user_id
                 WHERE s.appointment_id = $1 AND s.deleted_at IS NULL
                 ORDER BY s.created_at DESC",
                &[&appointment_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let mut surgeries: Vec<Surgery> = Vec::new();
        for row in rows {
            let surgery_id: uuid::Uuid = row.get(0);
            let files = self.get_surgery_files(&surgery_id.to_string()).await?;
            surgeries.push(self.map_surgery_row(&row, files));
        }

        Ok(surgeries)
    }

    /// Get surgeries by patient ID
    pub async fn get_surgeries_by_patient(&self, patient_id: &str) -> Result<Vec<Surgery>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let patient_uuid = uuid::Uuid::parse_str(patient_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT s.id, s.appointment_id, s.patient_id, s.surgery_type::text, s.eye,
                        s.date, s.status::text, s.surgeon_id, s.notes,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM surgeries s
                 LEFT JOIN patients p ON s.patient_id = p.id
                 LEFT JOIN profiles pr ON s.surgeon_id = pr.user_id
                 WHERE s.patient_id = $1 AND s.deleted_at IS NULL
                 ORDER BY s.date DESC NULLS LAST, s.created_at DESC",
                &[&patient_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let mut surgeries: Vec<Surgery> = Vec::new();
        for row in rows {
            let surgery_id: uuid::Uuid = row.get(0);
            let files = self.get_surgery_files(&surgery_id.to_string()).await?;
            surgeries.push(self.map_surgery_row(&row, files));
        }

        Ok(surgeries)
    }

    /// Get surgery files
    async fn get_surgery_files(&self, surgery_id: &str) -> Result<Vec<SurgeryFile>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let surgery_uuid = uuid::Uuid::parse_str(surgery_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, surgery_id, file_path, mime_type, file_type
                 FROM surgery_files
                 WHERE surgery_id = $1
                 ORDER BY created_at",
                &[&surgery_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| SurgeryFile {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            surgery_id: row.get::<_, uuid::Uuid>(1).to_string(),
            file_path: row.get(2),
            mime_type: row.get(3),
            file_type: row.get(4),
        }).collect())
    }

    /// Create a new surgery
    pub async fn create_surgery(&self, surgery: &SurgeryInput) -> Result<Surgery, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let patient_uuid = uuid::Uuid::parse_str(&surgery.patient_id).map_err(|e| e.to_string())?;
        let appointment_uuid: Option<uuid::Uuid> = surgery.appointment_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let surgeon_uuid: Option<uuid::Uuid> = surgery.surgeon_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let date: Option<chrono::NaiveDate> = surgery.date.as_ref()
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

        client
            .execute(
                "INSERT INTO surgeries (id, appointment_id, patient_id, surgery_type, eye, date, status, surgeon_id, notes, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8, $9, $10)",
                &[
                    &id,
                    &appointment_uuid,
                    &patient_uuid,
                    &surgery.surgery_type,
                    &surgery.eye,
                    &date,
                    &surgeon_uuid,
                    &surgery.notes,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Get patient embed
        let patient = self.get_patient_by_id(&surgery.patient_id).await?;
        let patient_embed = patient.map(|p| PatientEmbed {
            id: p.id,
            first_name: Some(p.first_name),
            last_name: Some(p.last_name),
            code: p.code,
            phone: p.phone,
        });

        Ok(Surgery {
            id: id.to_string(),
            appointment_id: surgery.appointment_id.clone(),
            patient_id: surgery.patient_id.clone(),
            surgery_type: surgery.surgery_type.clone(),
            eye: surgery.eye.clone(),
            date: surgery.date.clone(),
            status: "scheduled".to_string(),
            surgeon_id: surgery.surgeon_id.clone(),
            notes: surgery.notes.clone(),
            surgery_files: None,
            patient: patient_embed,
            surgeon: None,
        })
    }

    /// Update a surgery
    pub async fn update_surgery(&self, id: &str, updates: &SurgeryUpdate) -> Result<Surgery, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let surgery_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        let surgeon_uuid: Option<uuid::Uuid> = updates.surgeon_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let date: Option<chrono::NaiveDate> = updates.date.as_ref()
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

        client
            .execute(
                "UPDATE surgeries SET
                    updated_at = $1,
                    surgery_type = COALESCE($2, surgery_type),
                    eye = COALESCE($3, eye),
                    date = COALESCE($4, date),
                    status = COALESCE($5, status),
                    surgeon_id = COALESCE($6, surgeon_id),
                    notes = COALESCE($7, notes)
                 WHERE id = $8",
                &[
                    &now,
                    &updates.surgery_type,
                    &updates.eye,
                    &date,
                    &updates.status,
                    &surgeon_uuid,
                    &updates.notes,
                    &surgery_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Fetch updated surgery
        let row = client
            .query_one(
                "SELECT s.id, s.appointment_id, s.patient_id, s.surgery_type::text, s.eye,
                        s.date, s.status::text, s.surgeon_id, s.notes,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM surgeries s
                 LEFT JOIN patients p ON s.patient_id = p.id
                 LEFT JOIN profiles pr ON s.surgeon_id = pr.user_id
                 WHERE s.id = $1",
                &[&surgery_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let files = self.get_surgery_files(id).await?;
        Ok(self.map_surgery_row(&row, files))
    }

    /// Delete a surgery (soft delete)
    pub async fn delete_surgery(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let surgery_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE surgeries SET deleted_at = $1, updated_at = $1 WHERE id = $2",
                &[&now, &surgery_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Helper to map surgery row
    fn map_surgery_row(&self, row: &tokio_postgres::Row, files: Vec<SurgeryFile>) -> Surgery {
        let patient_embed = row.get::<_, Option<uuid::Uuid>>(9).map(|p_id| {
            PatientEmbed {
                id: p_id.to_string(),
                first_name: row.get(10),
                last_name: row.get(11),
                code: row.get(12),
                phone: row.get(13),
            }
        });

        let surgeon_embed = row.get::<_, Option<uuid::Uuid>>(14).map(|u_id| {
            DoctorEmbed {
                user_id: u_id.to_string(),
                full_name: row.get(15),
                specialty: row.get(16),
            }
        });

        Surgery {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            appointment_id: row.get::<_, Option<uuid::Uuid>>(1).map(|u| u.to_string()),
            patient_id: row.get::<_, uuid::Uuid>(2).to_string(),
            surgery_type: row.get(3),
            eye: row.get(4),
            date: row.get::<_, Option<chrono::NaiveDate>>(5).map(|d| d.to_string()),
            status: row.get(6),
            surgeon_id: row.get::<_, Option<uuid::Uuid>>(7).map(|u| u.to_string()),
            notes: row.get(8),
            surgery_files: if files.is_empty() { None } else { Some(files) },
            patient: patient_embed,
            surgeon: surgeon_embed,
        }
    }

    // ============================================================
    // PROCEDURES (PROCEDIMIENTOS)
    // ============================================================

    /// Get procedures by appointment ID
    pub async fn get_procedures_by_appointment(&self, appointment_id: &str) -> Result<Vec<Procedure>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let appointment_uuid = uuid::Uuid::parse_str(appointment_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT proc.id, proc.appointment_id, proc.patient_id, proc.procedure_type::text, proc.eye,
                        proc.date, proc.status::text, proc.performed_by, proc.notes,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM procedures proc
                 LEFT JOIN patients p ON proc.patient_id = p.id
                 LEFT JOIN profiles pr ON proc.performed_by = pr.user_id
                 WHERE proc.appointment_id = $1 AND proc.deleted_at IS NULL
                 ORDER BY proc.created_at DESC",
                &[&appointment_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| self.map_procedure_row(row)).collect())
    }

    /// Get procedures by patient ID
    pub async fn get_procedures_by_patient(&self, patient_id: &str) -> Result<Vec<Procedure>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let patient_uuid = uuid::Uuid::parse_str(patient_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT proc.id, proc.appointment_id, proc.patient_id, proc.procedure_type::text, proc.eye,
                        proc.date, proc.status::text, proc.performed_by, proc.notes,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM procedures proc
                 LEFT JOIN patients p ON proc.patient_id = p.id
                 LEFT JOIN profiles pr ON proc.performed_by = pr.user_id
                 WHERE proc.patient_id = $1 AND proc.deleted_at IS NULL
                 ORDER BY proc.date DESC NULLS LAST, proc.created_at DESC",
                &[&patient_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| self.map_procedure_row(row)).collect())
    }

    /// Create a new procedure
    pub async fn create_procedure(&self, procedure: &ProcedureInput) -> Result<Procedure, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let patient_uuid = uuid::Uuid::parse_str(&procedure.patient_id).map_err(|e| e.to_string())?;
        let appointment_uuid: Option<uuid::Uuid> = procedure.appointment_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let performed_by_uuid: Option<uuid::Uuid> = procedure.performed_by.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());

        client
            .execute(
                "INSERT INTO procedures (id, appointment_id, patient_id, procedure_type, eye, date, status, performed_by, notes, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9, $10)",
                &[
                    &id,
                    &appointment_uuid,
                    &patient_uuid,
                    &procedure.procedure_type,
                    &procedure.eye,
                    &now.date_naive(),
                    &performed_by_uuid,
                    &procedure.notes,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Get patient embed
        let patient = self.get_patient_by_id(&procedure.patient_id).await?;
        let patient_embed = patient.map(|p| PatientEmbed {
            id: p.id,
            first_name: Some(p.first_name),
            last_name: Some(p.last_name),
            code: p.code,
            phone: p.phone,
        });

        Ok(Procedure {
            id: id.to_string(),
            appointment_id: procedure.appointment_id.clone(),
            patient_id: procedure.patient_id.clone(),
            procedure_type: procedure.procedure_type.clone(),
            eye: procedure.eye.clone(),
            date: Some(now.date_naive().to_string()),
            status: "completed".to_string(),
            performed_by: procedure.performed_by.clone(),
            notes: procedure.notes.clone(),
            patient: patient_embed,
            doctor: None,
        })
    }

    /// Update a procedure
    pub async fn update_procedure(&self, id: &str, updates: &ProcedureUpdate) -> Result<Procedure, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let procedure_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        let performed_by_uuid: Option<uuid::Uuid> = updates.performed_by.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let date: Option<chrono::NaiveDate> = updates.date.as_ref()
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

        client
            .execute(
                "UPDATE procedures SET
                    updated_at = $1,
                    procedure_type = COALESCE($2, procedure_type),
                    eye = COALESCE($3, eye),
                    date = COALESCE($4, date),
                    status = COALESCE($5, status),
                    performed_by = COALESCE($6, performed_by),
                    notes = COALESCE($7, notes)
                 WHERE id = $8",
                &[
                    &now,
                    &updates.procedure_type,
                    &updates.eye,
                    &date,
                    &updates.status,
                    &performed_by_uuid,
                    &updates.notes,
                    &procedure_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Fetch updated procedure
        let row = client
            .query_one(
                "SELECT proc.id, proc.appointment_id, proc.patient_id, proc.procedure_type::text, proc.eye,
                        proc.date, proc.status::text, proc.performed_by, proc.notes,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM procedures proc
                 LEFT JOIN patients p ON proc.patient_id = p.id
                 LEFT JOIN profiles pr ON proc.performed_by = pr.user_id
                 WHERE proc.id = $1",
                &[&procedure_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(self.map_procedure_row(&row))
    }

    /// Helper to map procedure row
    fn map_procedure_row(&self, row: &tokio_postgres::Row) -> Procedure {
        let patient_embed = row.get::<_, Option<uuid::Uuid>>(9).map(|p_id| {
            PatientEmbed {
                id: p_id.to_string(),
                first_name: row.get(10),
                last_name: row.get(11),
                code: row.get(12),
                phone: row.get(13),
            }
        });

        let doctor_embed = row.get::<_, Option<uuid::Uuid>>(14).map(|u_id| {
            DoctorEmbed {
                user_id: u_id.to_string(),
                full_name: row.get(15),
                specialty: row.get(16),
            }
        });

        Procedure {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            appointment_id: row.get::<_, Option<uuid::Uuid>>(1).map(|u| u.to_string()),
            patient_id: row.get::<_, uuid::Uuid>(2).to_string(),
            procedure_type: row.get(3),
            eye: row.get(4),
            date: row.get::<_, Option<chrono::NaiveDate>>(5).map(|d| d.to_string()),
            status: row.get(6),
            performed_by: row.get::<_, Option<uuid::Uuid>>(7).map(|u| u.to_string()),
            notes: row.get(8),
            patient: patient_embed,
            doctor: doctor_embed,
        }
    }

    // ============================================================
    // DIAGNOSES (DIAGNÓSTICOS)
    // ============================================================

    /// Get diagnoses by encounter ID
    pub async fn get_diagnoses_by_encounter(&self, encounter_id: &str) -> Result<Vec<Diagnosis>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let encounter_uuid = uuid::Uuid::parse_str(encounter_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, encounter_id, code, description, eye, is_primary
                 FROM diagnoses
                 WHERE encounter_id = $1 AND deleted_at IS NULL
                 ORDER BY is_primary DESC, created_at",
                &[&encounter_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| Diagnosis {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            encounter_id: row.get::<_, uuid::Uuid>(1).to_string(),
            code: row.get(2),
            description: row.get(3),
            eye: row.get(4),
            is_primary: row.get::<_, Option<bool>>(5).unwrap_or(false),
        }).collect())
    }

    /// Create a new diagnosis
    pub async fn create_diagnosis(&self, diagnosis: &DiagnosisInput) -> Result<Diagnosis, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let encounter_uuid = uuid::Uuid::parse_str(&diagnosis.encounter_id).map_err(|e| e.to_string())?;
        let is_primary = diagnosis.is_primary.unwrap_or(false);

        client
            .execute(
                "INSERT INTO diagnoses (id, encounter_id, code, description, eye, is_primary, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                &[
                    &id,
                    &encounter_uuid,
                    &diagnosis.code,
                    &diagnosis.description,
                    &diagnosis.eye,
                    &is_primary,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Diagnosis {
            id: id.to_string(),
            encounter_id: diagnosis.encounter_id.clone(),
            code: diagnosis.code.clone(),
            description: diagnosis.description.clone(),
            eye: diagnosis.eye.clone(),
            is_primary,
        })
    }

    /// Update a diagnosis
    pub async fn update_diagnosis(&self, id: &str, updates: &DiagnosisUpdate) -> Result<Diagnosis, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let diagnosis_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE diagnoses SET
                    updated_at = $1,
                    code = COALESCE($2, code),
                    description = COALESCE($3, description),
                    eye = COALESCE($4, eye),
                    is_primary = COALESCE($5, is_primary)
                 WHERE id = $6",
                &[
                    &now,
                    &updates.code,
                    &updates.description,
                    &updates.eye,
                    &updates.is_primary,
                    &diagnosis_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Fetch updated diagnosis
        let row = client
            .query_one(
                "SELECT id, encounter_id, code, description, eye, is_primary
                 FROM diagnoses WHERE id = $1",
                &[&diagnosis_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Diagnosis {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            encounter_id: row.get::<_, uuid::Uuid>(1).to_string(),
            code: row.get(2),
            description: row.get(3),
            eye: row.get(4),
            is_primary: row.get::<_, Option<bool>>(5).unwrap_or(false),
        })
    }

    /// Delete a diagnosis (soft delete)
    pub async fn delete_diagnosis(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let diagnosis_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE diagnoses SET deleted_at = $1, updated_at = $1 WHERE id = $2",
                &[&now, &diagnosis_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    // ============================================================
    // INVOICES (FACTURAS)
    // ============================================================

    /// Get invoices by patient ID
    pub async fn get_invoices_by_patient(&self, patient_id: &str) -> Result<Vec<Invoice>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let patient_uuid = uuid::Uuid::parse_str(patient_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT i.id, i.invoice_number, i.patient_id, i.appointment_id, i.branch_id,
                        i.total_amount, i.balance_due, i.discount_type, i.discount_value,
                        i.discount_reason, i.status::text, i.notes, i.created_at,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM invoices i
                 LEFT JOIN patients p ON i.patient_id = p.id
                 WHERE i.patient_id = $1
                 ORDER BY i.created_at DESC",
                &[&patient_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| self.map_invoice_row(row)).collect())
    }

    /// Get invoices by branch and date
    pub async fn get_invoices_by_branch_and_date(&self, branch_id: &str, date: &str) -> Result<Vec<Invoice>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;
        let date_parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date format: {}", e))?;

        let rows = client
            .query(
                "SELECT i.id, i.invoice_number, i.patient_id, i.appointment_id, i.branch_id,
                        i.total_amount, i.balance_due, i.discount_type, i.discount_value,
                        i.discount_reason, i.status::text, i.notes, i.created_at,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM invoices i
                 LEFT JOIN patients p ON i.patient_id = p.id
                 WHERE i.branch_id = $1 AND DATE(i.created_at) = $2
                 ORDER BY i.created_at DESC",
                &[&branch_uuid, &date_parsed],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| self.map_invoice_row(row)).collect())
    }

    /// Get invoice by ID
    pub async fn get_invoice_by_id(&self, id: &str) -> Result<Option<Invoice>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let invoice_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        let result = client
            .query_opt(
                "SELECT i.id, i.invoice_number, i.patient_id, i.appointment_id, i.branch_id,
                        i.total_amount, i.balance_due, i.discount_type, i.discount_value,
                        i.discount_reason, i.status::text, i.notes, i.created_at,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM invoices i
                 LEFT JOIN patients p ON i.patient_id = p.id
                 WHERE i.id = $1",
                &[&invoice_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(result.map(|row| self.map_invoice_row(&row)))
    }

    /// Create a new invoice with items
    pub async fn create_invoice(&self, invoice: &InvoiceInput, items: &[InvoiceItemInput]) -> Result<Invoice, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let patient_uuid = uuid::Uuid::parse_str(&invoice.patient_id).map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(&invoice.branch_id).map_err(|e| e.to_string())?;
        let appointment_uuid: Option<uuid::Uuid> = invoice.appointment_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());

        // Generate invoice number
        let invoice_number = self.generate_invoice_number(&invoice.branch_id).await?;

        // Calculate totals
        let subtotal: f64 = items.iter()
            .map(|item| item.unit_price * item.quantity as f64)
            .sum();

        let discount_amount = match (invoice.discount_type.as_deref(), invoice.discount_value) {
            (Some("percentage"), Some(value)) => subtotal * (value / 100.0),
            (Some("fixed"), Some(value)) => value,
            _ => 0.0,
        };

        let total_amount = subtotal - discount_amount;

        client
            .execute(
                "INSERT INTO invoices (id, invoice_number, patient_id, appointment_id, branch_id,
                                      total_amount, balance_due, discount_type, discount_value,
                                      discount_reason, status, notes, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13)",
                &[
                    &id,
                    &invoice_number,
                    &patient_uuid,
                    &appointment_uuid,
                    &branch_uuid,
                    &total_amount,
                    &total_amount, // balance_due = total_amount initially
                    &invoice.discount_type,
                    &invoice.discount_value,
                    &invoice.discount_reason,
                    &invoice.notes,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Insert invoice items
        for item in items {
            let item_id = uuid::Uuid::new_v4();
            let service_uuid: Option<uuid::Uuid> = item.service_id.as_ref()
                .and_then(|id| uuid::Uuid::parse_str(id).ok());
            let product_uuid: Option<uuid::Uuid> = item.product_id.as_ref()
                .and_then(|id| uuid::Uuid::parse_str(id).ok());
            let subtotal = item.unit_price * item.quantity as f64;

            client
                .execute(
                    "INSERT INTO invoice_items (id, invoice_id, service_id, product_id, description,
                                               quantity, unit_price, subtotal, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                    &[
                        &item_id,
                        &id,
                        &service_uuid,
                        &product_uuid,
                        &item.description,
                        &item.quantity,
                        &item.unit_price,
                        &subtotal,
                        &now,
                    ],
                )
                .await
                .map_err(|e| e.to_string())?;
        }

        // Get patient embed
        let patient = self.get_patient_by_id(&invoice.patient_id).await?;
        let patient_embed = patient.map(|p| PatientEmbed {
            id: p.id,
            first_name: Some(p.first_name),
            last_name: Some(p.last_name),
            code: p.code,
            phone: p.phone,
        });

        Ok(Invoice {
            id: id.to_string(),
            invoice_number,
            patient_id: invoice.patient_id.clone(),
            appointment_id: invoice.appointment_id.clone(),
            branch_id: invoice.branch_id.clone(),
            total_amount,
            balance_due: total_amount,
            discount_type: invoice.discount_type.clone(),
            discount_value: invoice.discount_value,
            discount_reason: invoice.discount_reason.clone(),
            status: "pending".to_string(),
            notes: invoice.notes.clone(),
            created_at: now.to_rfc3339(),
            patient: patient_embed,
        })
    }

    /// Generate invoice number
    async fn generate_invoice_number(&self, branch_id: &str) -> Result<String, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        // Get branch code
        let branch_row = client
            .query_one(
                "SELECT code FROM branches WHERE id = $1",
                &[&branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let branch_code: Option<String> = branch_row.get(0);
        let prefix = branch_code.unwrap_or_else(|| "FAC".to_string());

        // Get next sequence number for this branch
        let count_row = client
            .query_one(
                "SELECT COUNT(*) + 1 FROM invoices WHERE branch_id = $1",
                &[&branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let count: i64 = count_row.get(0);

        Ok(format!("{}-{:06}", prefix, count))
    }

    /// Update invoice status
    pub async fn update_invoice_status(&self, id: &str, status: &str) -> Result<Invoice, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let invoice_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE invoices SET status = $1, updated_at = $2 WHERE id = $3",
                &[&status, &now, &invoice_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        self.get_invoice_by_id(id)
            .await?
            .ok_or_else(|| "Invoice not found after update".to_string())
    }

    /// Get invoice items
    pub async fn get_invoice_items(&self, invoice_id: &str) -> Result<Vec<InvoiceItem>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let invoice_uuid = uuid::Uuid::parse_str(invoice_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, invoice_id, service_id, product_id, description, quantity, unit_price, subtotal
                 FROM invoice_items
                 WHERE invoice_id = $1
                 ORDER BY created_at",
                &[&invoice_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| InvoiceItem {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            invoice_id: row.get::<_, uuid::Uuid>(1).to_string(),
            service_id: row.get::<_, Option<uuid::Uuid>>(2).map(|u| u.to_string()),
            product_id: row.get::<_, Option<uuid::Uuid>>(3).map(|u| u.to_string()),
            description: row.get(4),
            quantity: row.get(5),
            unit_price: row.get(6),
            subtotal: row.get(7),
        }).collect())
    }

    /// Helper to map invoice row
    fn map_invoice_row(&self, row: &tokio_postgres::Row) -> Invoice {
        let patient_embed = row.get::<_, Option<uuid::Uuid>>(13).map(|p_id| {
            PatientEmbed {
                id: p_id.to_string(),
                first_name: row.get(14),
                last_name: row.get(15),
                code: row.get(16),
                phone: row.get(17),
            }
        });

        Invoice {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            invoice_number: row.get(1),
            patient_id: row.get::<_, uuid::Uuid>(2).to_string(),
            appointment_id: row.get::<_, Option<uuid::Uuid>>(3).map(|u| u.to_string()),
            branch_id: row.get::<_, uuid::Uuid>(4).to_string(),
            total_amount: row.get(5),
            balance_due: row.get(6),
            discount_type: row.get(7),
            discount_value: row.get(8),
            discount_reason: row.get(9),
            status: row.get(10),
            notes: row.get(11),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(12).to_rfc3339(),
            patient: patient_embed,
        }
    }

    // ============================================================
    // PAYMENTS (PAGOS)
    // ============================================================

    /// Get payments by invoice ID
    pub async fn get_payments_by_invoice(&self, invoice_id: &str) -> Result<Vec<Payment>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let invoice_uuid = uuid::Uuid::parse_str(invoice_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, invoice_id, amount, payment_method::text, date, created_at
                 FROM payments
                 WHERE invoice_id = $1 AND deleted_at IS NULL
                 ORDER BY date DESC, created_at DESC",
                &[&invoice_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| Payment {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            invoice_id: row.get::<_, uuid::Uuid>(1).to_string(),
            amount: row.get(2),
            payment_method: row.get(3),
            date: row.get::<_, chrono::NaiveDate>(4).to_string(),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(5).to_rfc3339(),
            invoice: None,
        }).collect())
    }

    /// Get payments by date range with invoice info
    pub async fn get_payments_by_date_range(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<Vec<Payment>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;
        let start = chrono::NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
            .map_err(|e| format!("Invalid start date: {}", e))?;
        let end = chrono::NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
            .map_err(|e| format!("Invalid end date: {}", e))?;

        let rows = client
            .query(
                "SELECT pay.id, pay.invoice_id, pay.amount, pay.payment_method::text, pay.date, pay.created_at,
                        i.id as i_id, i.invoice_number, i.patient_id, i.total_amount, i.balance_due,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM payments pay
                 JOIN invoices i ON pay.invoice_id = i.id
                 LEFT JOIN patients p ON i.patient_id = p.id
                 WHERE i.branch_id = $1 AND pay.date >= $2 AND pay.date <= $3 AND pay.deleted_at IS NULL
                 ORDER BY pay.date DESC, pay.created_at DESC",
                &[&branch_uuid, &start, &end],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| {
            let patient_embed = row.get::<_, Option<uuid::Uuid>>(11).map(|p_id| {
                PatientEmbed {
                    id: p_id.to_string(),
                    first_name: row.get(12),
                    last_name: row.get(13),
                    code: row.get(14),
                    phone: row.get(15),
                }
            });

            let invoice_info = InvoiceWithPatient {
                id: row.get::<_, uuid::Uuid>(6).to_string(),
                invoice_number: row.get(7),
                patient_id: row.get::<_, uuid::Uuid>(8).to_string(),
                total_amount: row.get(9),
                balance_due: row.get(10),
                patient: patient_embed,
            };

            Payment {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                invoice_id: row.get::<_, uuid::Uuid>(1).to_string(),
                amount: row.get(2),
                payment_method: row.get(3),
                date: row.get::<_, chrono::NaiveDate>(4).to_string(),
                created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(5).to_rfc3339(),
                invoice: Some(invoice_info),
            }
        }).collect())
    }

    /// Create a payment and update invoice balance
    pub async fn create_payment(&self, payment: &PaymentInput) -> Result<Payment, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();
        let today = now.date_naive();

        let invoice_uuid = uuid::Uuid::parse_str(&payment.invoice_id).map_err(|e| e.to_string())?;

        // Create payment
        client
            .execute(
                "INSERT INTO payments (id, invoice_id, amount, payment_method, date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)",
                &[
                    &id,
                    &invoice_uuid,
                    &payment.amount,
                    &payment.payment_method,
                    &today,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Update invoice balance_due
        client
            .execute(
                "UPDATE invoices SET balance_due = balance_due - $1, updated_at = $2 WHERE id = $3",
                &[&payment.amount, &now, &invoice_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Update invoice status if fully paid
        client
            .execute(
                "UPDATE invoices SET status = 'paid' WHERE id = $1 AND balance_due <= 0",
                &[&invoice_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Payment {
            id: id.to_string(),
            invoice_id: payment.invoice_id.clone(),
            amount: payment.amount,
            payment_method: payment.payment_method.clone(),
            date: today.to_string(),
            created_at: now.to_rfc3339(),
            invoice: None,
        })
    }

    /// Delete a payment (soft delete) and restore invoice balance
    pub async fn delete_payment(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let payment_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        // Get payment info
        let payment_row = client
            .query_one(
                "SELECT invoice_id, amount FROM payments WHERE id = $1",
                &[&payment_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let invoice_uuid: uuid::Uuid = payment_row.get(0);
        let amount: f64 = payment_row.get(1);

        // Soft delete payment
        client
            .execute(
                "UPDATE payments SET deleted_at = $1, updated_at = $1 WHERE id = $2",
                &[&now, &payment_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Restore invoice balance
        client
            .execute(
                "UPDATE invoices SET balance_due = balance_due + $1, status = 'pending', updated_at = $2 WHERE id = $3",
                &[&amount, &now, &invoice_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    // ============================================================
    // SERVICE PRICES (PRECIOS DE SERVICIOS)
    // ============================================================

    /// Get all service prices
    pub async fn get_service_prices(&self) -> Result<Vec<ServicePrice>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, service_name, service_type::text, price, active
                 FROM service_prices
                 WHERE deleted_at IS NULL
                 ORDER BY service_type, service_name",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| ServicePrice {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            service_name: row.get(1),
            service_type: row.get(2),
            price: row.get(3),
            active: row.get::<_, Option<bool>>(4).unwrap_or(true),
        }).collect())
    }

    /// Create a service price
    pub async fn create_service_price(&self, service: &ServicePriceInput) -> Result<ServicePrice, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        client
            .execute(
                "INSERT INTO service_prices (id, service_name, service_type, price, active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, true, $5, $6)",
                &[
                    &id,
                    &service.service_name,
                    &service.service_type,
                    &service.price,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(ServicePrice {
            id: id.to_string(),
            service_name: service.service_name.clone(),
            service_type: service.service_type.clone(),
            price: service.price,
            active: true,
        })
    }

    /// Update a service price
    pub async fn update_service_price(&self, id: &str, updates: &ServicePriceUpdate) -> Result<ServicePrice, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let service_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE service_prices SET
                    updated_at = $1,
                    service_name = COALESCE($2, service_name),
                    service_type = COALESCE($3, service_type),
                    price = COALESCE($4, price),
                    active = COALESCE($5, active)
                 WHERE id = $6",
                &[
                    &now,
                    &updates.service_name,
                    &updates.service_type,
                    &updates.price,
                    &updates.active,
                    &service_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Fetch updated service
        let row = client
            .query_one(
                "SELECT id, service_name, service_type::text, price, active
                 FROM service_prices WHERE id = $1",
                &[&service_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(ServicePrice {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            service_name: row.get(1),
            service_type: row.get(2),
            price: row.get(3),
            active: row.get::<_, Option<bool>>(4).unwrap_or(true),
        })
    }

    // ============================================================
    // INVENTORY (INVENTARIO)
    // ============================================================

    /// Get inventory items by branch
    pub async fn get_inventory_items(&self, branch_id: &str) -> Result<Vec<InventoryItem>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, category, cost_price, sell_price, supplier_id, branch_id,
                        active, current_stock, reorder_level
                 FROM inventory_items
                 WHERE branch_id = $1 AND deleted_at IS NULL
                 ORDER BY category, name",
                &[&branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| InventoryItem {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            category: row.get(2),
            cost_price: row.get(3),
            sell_price: row.get(4),
            supplier_id: row.get::<_, Option<uuid::Uuid>>(5).map(|u| u.to_string()),
            branch_id: row.get::<_, uuid::Uuid>(6).to_string(),
            active: row.get::<_, Option<bool>>(7).unwrap_or(true),
            current_stock: row.get::<_, Option<i32>>(8).unwrap_or(0),
            reorder_level: row.get(9),
        }).collect())
    }

    /// Create an inventory item
    pub async fn create_inventory_item(&self, item: &InventoryItemInput) -> Result<InventoryItem, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let branch_uuid = uuid::Uuid::parse_str(&item.branch_id).map_err(|e| e.to_string())?;
        let supplier_uuid: Option<uuid::Uuid> = item.supplier_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());

        client
            .execute(
                "INSERT INTO inventory_items (id, name, category, cost_price, sell_price, supplier_id,
                                             branch_id, active, current_stock, reorder_level, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11)",
                &[
                    &id,
                    &item.name,
                    &item.category,
                    &item.cost_price,
                    &item.sell_price,
                    &supplier_uuid,
                    &branch_uuid,
                    &item.current_stock.unwrap_or(0),
                    &item.reorder_level,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(InventoryItem {
            id: id.to_string(),
            name: item.name.clone(),
            category: item.category.clone(),
            cost_price: item.cost_price,
            sell_price: item.sell_price,
            supplier_id: item.supplier_id.clone(),
            branch_id: item.branch_id.clone(),
            active: true,
            current_stock: item.current_stock.unwrap_or(0),
            reorder_level: item.reorder_level,
        })
    }

    /// Update an inventory item
    pub async fn update_inventory_item(&self, id: &str, updates: &InventoryItemUpdate) -> Result<InventoryItem, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let item_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        let supplier_uuid: Option<uuid::Uuid> = updates.supplier_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());

        client
            .execute(
                "UPDATE inventory_items SET
                    updated_at = $1,
                    name = COALESCE($2, name),
                    category = COALESCE($3, category),
                    cost_price = COALESCE($4, cost_price),
                    sell_price = COALESCE($5, sell_price),
                    supplier_id = COALESCE($6, supplier_id),
                    current_stock = COALESCE($7, current_stock),
                    reorder_level = COALESCE($8, reorder_level),
                    active = COALESCE($9, active)
                 WHERE id = $10",
                &[
                    &now,
                    &updates.name,
                    &updates.category,
                    &updates.cost_price,
                    &updates.sell_price,
                    &supplier_uuid,
                    &updates.current_stock,
                    &updates.reorder_level,
                    &updates.active,
                    &item_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Fetch updated item
        let row = client
            .query_one(
                "SELECT id, name, category, cost_price, sell_price, supplier_id, branch_id,
                        active, current_stock, reorder_level
                 FROM inventory_items WHERE id = $1",
                &[&item_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(InventoryItem {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            category: row.get(2),
            cost_price: row.get(3),
            sell_price: row.get(4),
            supplier_id: row.get::<_, Option<uuid::Uuid>>(5).map(|u| u.to_string()),
            branch_id: row.get::<_, uuid::Uuid>(6).to_string(),
            active: row.get::<_, Option<bool>>(7).unwrap_or(true),
            current_stock: row.get::<_, Option<i32>>(8).unwrap_or(0),
            reorder_level: row.get(9),
        })
    }

    /// Get all suppliers
    pub async fn get_suppliers(&self) -> Result<Vec<Supplier>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, contact, phone FROM suppliers WHERE deleted_at IS NULL ORDER BY name",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| Supplier {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            contact: row.get(2),
            phone: row.get(3),
        }).collect())
    }

    // ============================================================
    // CRM PIPELINES
    // ============================================================

    /// Get CRM pipelines by branch
    pub async fn get_crm_pipelines(&self, branch_id: &str, status: Option<&str>) -> Result<Vec<CRMPipeline>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let query = if let Some(s) = status {
            format!(
                "SELECT cp.id, cp.patient_id, cp.procedure_type_id, cp.doctor_id, cp.branch_id,
                        cp.current_stage, cp.status::text, cp.created_at,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        cpt.id as cpt_id, cpt.name as cpt_name, cpt.color,
                        b.id as b_id, b.name as b_name, b.code as b_code,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM crm_pipelines cp
                 LEFT JOIN patients p ON cp.patient_id = p.id
                 LEFT JOIN crm_procedure_types cpt ON cp.procedure_type_id = cpt.id
                 LEFT JOIN branches b ON cp.branch_id = b.id
                 LEFT JOIN profiles pr ON cp.doctor_id = pr.user_id
                 WHERE cp.branch_id = $1 AND cp.status = '{}'
                 ORDER BY cp.created_at DESC",
                s
            )
        } else {
            "SELECT cp.id, cp.patient_id, cp.procedure_type_id, cp.doctor_id, cp.branch_id,
                    cp.current_stage, cp.status::text, cp.created_at,
                    p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                    cpt.id as cpt_id, cpt.name as cpt_name, cpt.color,
                    b.id as b_id, b.name as b_name, b.code as b_code,
                    pr.user_id, pr.full_name, pr.specialty
             FROM crm_pipelines cp
             LEFT JOIN patients p ON cp.patient_id = p.id
             LEFT JOIN crm_procedure_types cpt ON cp.procedure_type_id = cpt.id
             LEFT JOIN branches b ON cp.branch_id = b.id
             LEFT JOIN profiles pr ON cp.doctor_id = pr.user_id
             WHERE cp.branch_id = $1
             ORDER BY cp.created_at DESC".to_string()
        };

        let rows = client
            .query(&query, &[&branch_uuid])
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| self.map_crm_pipeline_row(row)).collect())
    }

    /// Get CRM pipeline by ID
    pub async fn get_crm_pipeline_by_id(&self, id: &str) -> Result<Option<CRMPipeline>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let pipeline_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        let result = client
            .query_opt(
                "SELECT cp.id, cp.patient_id, cp.procedure_type_id, cp.doctor_id, cp.branch_id,
                        cp.current_stage, cp.status::text, cp.created_at,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone,
                        cpt.id as cpt_id, cpt.name as cpt_name, cpt.color,
                        b.id as b_id, b.name as b_name, b.code as b_code,
                        pr.user_id, pr.full_name, pr.specialty
                 FROM crm_pipelines cp
                 LEFT JOIN patients p ON cp.patient_id = p.id
                 LEFT JOIN crm_procedure_types cpt ON cp.procedure_type_id = cpt.id
                 LEFT JOIN branches b ON cp.branch_id = b.id
                 LEFT JOIN profiles pr ON cp.doctor_id = pr.user_id
                 WHERE cp.id = $1",
                &[&pipeline_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(result.map(|row| self.map_crm_pipeline_row(&row)))
    }

    /// Create a CRM pipeline
    pub async fn create_crm_pipeline(&self, pipeline: &CRMPipelineInput) -> Result<CRMPipeline, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let patient_uuid = uuid::Uuid::parse_str(&pipeline.patient_id).map_err(|e| e.to_string())?;
        let procedure_type_uuid = uuid::Uuid::parse_str(&pipeline.procedure_type_id).map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(&pipeline.branch_id).map_err(|e| e.to_string())?;
        let doctor_uuid: Option<uuid::Uuid> = pipeline.doctor_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());

        client
            .execute(
                "INSERT INTO crm_pipelines (id, patient_id, procedure_type_id, doctor_id, branch_id,
                                           current_stage, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, 'consulta_inicial', 'active', $6, $7)",
                &[
                    &id,
                    &patient_uuid,
                    &procedure_type_uuid,
                    &doctor_uuid,
                    &branch_uuid,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        self.get_crm_pipeline_by_id(&id.to_string())
            .await?
            .ok_or_else(|| "Pipeline not found after creation".to_string())
    }

    /// Update CRM pipeline stage
    pub async fn update_crm_pipeline_stage(&self, id: &str, current_stage: &str) -> Result<CRMPipeline, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let pipeline_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE crm_pipelines SET current_stage = $1, updated_at = $2 WHERE id = $3",
                &[&current_stage, &now, &pipeline_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        self.get_crm_pipeline_by_id(id)
            .await?
            .ok_or_else(|| "Pipeline not found after update".to_string())
    }

    /// Get pipeline stages
    pub async fn get_crm_pipeline_stages(&self, pipeline_id: &str) -> Result<Vec<CRMPipelineStage>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let pipeline_uuid = uuid::Uuid::parse_str(pipeline_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, pipeline_id, stage_name, status::text, stage_order, created_by, updated_by
                 FROM crm_pipeline_stages
                 WHERE pipeline_id = $1
                 ORDER BY stage_order",
                &[&pipeline_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| CRMPipelineStage {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            pipeline_id: row.get::<_, uuid::Uuid>(1).to_string(),
            stage_name: row.get(2),
            status: row.get(3),
            stage_order: row.get(4),
            created_by: row.get::<_, Option<uuid::Uuid>>(5).map(|u| u.to_string()),
            updated_by: row.get::<_, Option<uuid::Uuid>>(6).map(|u| u.to_string()),
        }).collect())
    }

    /// Get pipeline notes
    pub async fn get_crm_pipeline_notes(&self, pipeline_id: &str) -> Result<Vec<CRMPipelineNote>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let pipeline_uuid = uuid::Uuid::parse_str(pipeline_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, pipeline_id, note, created_by, created_at
                 FROM crm_pipeline_notes
                 WHERE pipeline_id = $1
                 ORDER BY created_at DESC",
                &[&pipeline_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| CRMPipelineNote {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            pipeline_id: row.get::<_, uuid::Uuid>(1).to_string(),
            note: row.get(2),
            created_by: row.get::<_, uuid::Uuid>(3).to_string(),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(4).to_rfc3339(),
        }).collect())
    }

    /// Create a pipeline note
    pub async fn create_crm_pipeline_note(&self, note: &CRMPipelineNoteInput) -> Result<CRMPipelineNote, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let pipeline_uuid = uuid::Uuid::parse_str(&note.pipeline_id).map_err(|e| e.to_string())?;
        let created_by_uuid = uuid::Uuid::parse_str(&note.created_by).map_err(|e| e.to_string())?;

        client
            .execute(
                "INSERT INTO crm_pipeline_notes (id, pipeline_id, note, created_by, created_at)
                 VALUES ($1, $2, $3, $4, $5)",
                &[
                    &id,
                    &pipeline_uuid,
                    &note.note,
                    &created_by_uuid,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(CRMPipelineNote {
            id: id.to_string(),
            pipeline_id: note.pipeline_id.clone(),
            note: note.note.clone(),
            created_by: note.created_by.clone(),
            created_at: now.to_rfc3339(),
        })
    }

    /// Get CRM procedure types
    pub async fn get_crm_procedure_types(&self) -> Result<Vec<CRMProcedureType>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, color FROM crm_procedure_types WHERE deleted_at IS NULL ORDER BY name",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| CRMProcedureType {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            color: row.get(2),
        }).collect())
    }

    /// Helper to map CRM pipeline row
    fn map_crm_pipeline_row(&self, row: &tokio_postgres::Row) -> CRMPipeline {
        let patient_embed = row.get::<_, Option<uuid::Uuid>>(8).map(|p_id| {
            PatientEmbed {
                id: p_id.to_string(),
                first_name: row.get(9),
                last_name: row.get(10),
                code: row.get(11),
                phone: row.get(12),
            }
        });

        let procedure_type = row.get::<_, Option<uuid::Uuid>>(13).map(|pt_id| {
            CRMProcedureType {
                id: pt_id.to_string(),
                name: row.get(14),
                color: row.get(15),
            }
        });

        let branch_embed = row.get::<_, Option<uuid::Uuid>>(16).map(|b_id| {
            BranchEmbed {
                id: b_id.to_string(),
                name: row.get(17),
                code: row.get(18),
            }
        });

        let doctor_embed = row.get::<_, Option<uuid::Uuid>>(19).map(|d_id| {
            DoctorEmbed {
                user_id: d_id.to_string(),
                full_name: row.get(20),
                specialty: row.get(21),
            }
        });

        CRMPipeline {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            patient_id: row.get::<_, uuid::Uuid>(1).to_string(),
            procedure_type_id: row.get::<_, uuid::Uuid>(2).to_string(),
            doctor_id: row.get::<_, Option<uuid::Uuid>>(3).map(|u| u.to_string()),
            branch_id: row.get::<_, uuid::Uuid>(4).to_string(),
            current_stage: row.get(5),
            status: row.get(6),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(7).to_rfc3339(),
            patient: patient_embed,
            procedure_type,
            branch: branch_embed,
            doctor: doctor_embed,
        }
    }

    // ============================================================
    // SCHEDULE BLOCKS (BLOQUES DE HORARIO)
    // ============================================================

    /// Get schedule blocks by room and date
    pub async fn get_schedule_blocks(&self, room_id: &str, date: &str) -> Result<Vec<ScheduleBlock>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let room_uuid = uuid::Uuid::parse_str(room_id).map_err(|e| e.to_string())?;
        let date_parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date format: {}", e))?;

        let rows = client
            .query(
                "SELECT id, room_id, doctor_id, start_time, end_time, date, reason
                 FROM schedule_blocks
                 WHERE room_id = $1 AND date = $2 AND deleted_at IS NULL
                 ORDER BY start_time",
                &[&room_uuid, &date_parsed],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| ScheduleBlock {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            room_id: row.get::<_, uuid::Uuid>(1).to_string(),
            doctor_id: row.get::<_, Option<uuid::Uuid>>(2).map(|u| u.to_string()),
            start_time: row.get::<_, chrono::NaiveTime>(3).to_string(),
            end_time: row.get::<_, chrono::NaiveTime>(4).to_string(),
            date: row.get::<_, chrono::NaiveDate>(5).to_string(),
            reason: row.get(6),
        }).collect())
    }

    /// Create a schedule block
    pub async fn create_schedule_block(&self, block: &ScheduleBlockInput) -> Result<ScheduleBlock, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let room_uuid = uuid::Uuid::parse_str(&block.room_id).map_err(|e| e.to_string())?;
        let doctor_uuid: Option<uuid::Uuid> = block.doctor_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());
        let date = chrono::NaiveDate::parse_from_str(&block.date, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date: {}", e))?;
        let start_time = chrono::NaiveTime::parse_from_str(&block.start_time, "%H:%M")
            .or_else(|_| chrono::NaiveTime::parse_from_str(&block.start_time, "%H:%M:%S"))
            .map_err(|e| format!("Invalid start_time: {}", e))?;
        let end_time = chrono::NaiveTime::parse_from_str(&block.end_time, "%H:%M")
            .or_else(|_| chrono::NaiveTime::parse_from_str(&block.end_time, "%H:%M:%S"))
            .map_err(|e| format!("Invalid end_time: {}", e))?;

        client
            .execute(
                "INSERT INTO schedule_blocks (id, room_id, doctor_id, start_time, end_time, date, reason, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                &[
                    &id,
                    &room_uuid,
                    &doctor_uuid,
                    &start_time,
                    &end_time,
                    &date,
                    &block.reason,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(ScheduleBlock {
            id: id.to_string(),
            room_id: block.room_id.clone(),
            doctor_id: block.doctor_id.clone(),
            start_time: block.start_time.clone(),
            end_time: block.end_time.clone(),
            date: block.date.clone(),
            reason: block.reason.clone(),
        })
    }

    /// Delete a schedule block
    pub async fn delete_schedule_block(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let block_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE schedule_blocks SET deleted_at = $1, updated_at = $1 WHERE id = $2",
                &[&now, &block_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    // ============================================================
    // CLINICAL TYPES
    // ============================================================

    /// Get all surgery types
    pub async fn get_surgery_types(&self) -> Result<Vec<SurgeryType>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, description FROM surgery_types WHERE deleted_at IS NULL ORDER BY name",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| SurgeryType {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            description: row.get(2),
        }).collect())
    }

    /// Get all study types
    pub async fn get_study_types(&self) -> Result<Vec<StudyType>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, description FROM study_types WHERE deleted_at IS NULL ORDER BY name",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| StudyType {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            description: row.get(2),
        }).collect())
    }

    /// Get all procedure types
    pub async fn get_procedure_types(&self) -> Result<Vec<ProcedureTypeConfig>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, description FROM procedure_types WHERE deleted_at IS NULL ORDER BY name",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| ProcedureTypeConfig {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            description: row.get(2),
        }).collect())
    }

    // ============================================================
    // REFERRING DOCTORS (MÉDICOS REFERIDORES)
    // ============================================================

    /// Get all referring doctors
    pub async fn get_referring_doctors(&self) -> Result<Vec<ReferringDoctor>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, is_internal, internal_profile_id, specialty, phone, active
                 FROM referring_doctors
                 WHERE deleted_at IS NULL
                 ORDER BY name",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| ReferringDoctor {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            is_internal: row.get::<_, Option<bool>>(2).unwrap_or(false),
            internal_profile_id: row.get::<_, Option<uuid::Uuid>>(3).map(|u| u.to_string()),
            specialty: row.get(4),
            phone: row.get(5),
            active: row.get::<_, Option<bool>>(6).unwrap_or(true),
        }).collect())
    }

    /// Create a referring doctor
    pub async fn create_referring_doctor(&self, doctor: &ReferringDoctorInput) -> Result<ReferringDoctor, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();

        let internal_profile_uuid: Option<uuid::Uuid> = doctor.internal_profile_id.as_ref()
            .and_then(|id| uuid::Uuid::parse_str(id).ok());

        client
            .execute(
                "INSERT INTO referring_doctors (id, name, is_internal, internal_profile_id, specialty, phone, active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)",
                &[
                    &id,
                    &doctor.name,
                    &doctor.is_internal.unwrap_or(false),
                    &internal_profile_uuid,
                    &doctor.specialty,
                    &doctor.phone,
                    &now,
                    &now,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(ReferringDoctor {
            id: id.to_string(),
            name: doctor.name.clone(),
            is_internal: doctor.is_internal.unwrap_or(false),
            internal_profile_id: doctor.internal_profile_id.clone(),
            specialty: doctor.specialty.clone(),
            phone: doctor.phone.clone(),
            active: true,
        })
    }

    // ============================================================
    // SYNC PENDING (Phase 21) - Read from _sync_pending table
    // ============================================================

    /// Get count of pending sync items from _sync_pending table
    /// This table is populated by triggers and processed by the sync service
    pub async fn get_sync_pending_count(&self) -> Result<SyncPendingStatus, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        // Check if _sync_pending table exists first
        let table_exists = client
            .query_opt(
                "SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = '_sync_pending'",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        if table_exists.is_none() {
            // Table doesn't exist, return zero pending
            return Ok(SyncPendingStatus {
                total_pending: 0,
                by_table: vec![],
            });
        }

        // Get counts by table (only items not yet synced)
        let rows = client
            .query(
                "SELECT table_name, COUNT(*) as count
                 FROM _sync_pending
                 WHERE synced = false
                 GROUP BY table_name
                 ORDER BY count DESC",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        let by_table: Vec<SyncPendingByTable> = rows
            .iter()
            .map(|row| SyncPendingByTable {
                table_name: row.get(0),
                count: row.get(1),
            })
            .collect();

        // Calculate total
        let total_pending: i64 = by_table.iter().map(|t| t.count).sum();

        Ok(SyncPendingStatus {
            total_pending,
            by_table,
        })
    }

    /// Get detailed list of pending sync items for admin debugging
    pub async fn get_sync_pending_details(&self, limit: i64) -> Result<Vec<SyncPendingDetail>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        // Check if _sync_pending table exists first
        let table_exists = client
            .query_opt(
                "SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = '_sync_pending'",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        if table_exists.is_none() {
            return Ok(vec![]);
        }

        // Get detailed pending items (only items not yet synced)
        let rows = client
            .query(
                "SELECT id::text, table_name, record_id::text, operation, created_at::text
                 FROM _sync_pending
                 WHERE synced = false
                 ORDER BY created_at DESC
                 LIMIT $1",
                &[&limit],
            )
            .await
            .map_err(|e| e.to_string())?;

        let details: Vec<SyncPendingDetail> = rows
            .iter()
            .map(|row| SyncPendingDetail {
                id: row.get(0),
                table_name: row.get(1),
                record_id: row.get(2),
                operation: row.get(3),
                created_at: row.get(4),
            })
            .collect();

        Ok(details)
    }
}
