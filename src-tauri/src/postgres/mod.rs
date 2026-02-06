// PostgreSQL client for local clinic server
// Handles connection pooling and queries to the local PostgreSQL instance

use crate::commands::{
    Appointment, Branch, Patient, PatientEmbed, Profile, Room,
    BranchInput, BranchUpdate, RoomInput, RoomUpdate,
    UserWithProfile, PendingRegistration,
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
    CRMUnreadActivity, CRMActivityLog, CRMActivityPatient, CRMActivityProcedureType, CRMActivityCreator,
    ScheduleBlock, ScheduleBlockInput,
    SurgeryType, StudyType, ProcedureTypeConfig,
    SurgeryTypeInput, StudyTypeInput, ProcedureTypeInput, ClinicalTypeUpdate,
    ReferringDoctor, ReferringDoctorInput,
    SyncPendingStatus, SyncPendingByTable, SyncPendingDetail,
    AppSetting, ConsentSignature,
    RoomInventoryCategory, RoomInventoryCategoryInput, RoomInventoryCategoryUpdate,
    RoomInventoryItem, RoomInventoryItemInput, RoomInventoryItemUpdate,
    RoomInventoryMovement, RoomInventoryMovementInput,
    SupplierInput, InventoryLot, InventoryLotInput, InventoryLotWithProduct,
    InventoryMovement, InventoryMovementInput,
    InventoryItemEmbed, InventoryLotEmbed,
    ServiceSales, ServiceDetail, InventorySales, InventoryDetail, PaymentMethodSummary,
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

    /// Get all branches (including inactive for admin)
    pub async fn get_branches(&self) -> Result<Vec<Branch>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, code, address, phone, active, theme_primary_hsl, pdf_header_url
                 FROM branches ORDER BY name",
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
                theme_primary_hsl: row.get(6),
                pdf_header_url: row.get(7),
            })
            .collect();

        Ok(branches)
    }

    /// Create a new branch
    pub async fn create_branch(&self, input: &BranchInput) -> Result<Branch, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let row = client
            .query_one(
                "INSERT INTO branches (name, address, phone, active, code)
                 VALUES ($1, $2, $3, true, NULL)
                 RETURNING id, name, code, address, phone, active, theme_primary_hsl, pdf_header_url",
                &[&input.name, &input.address, &input.phone],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Branch {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            code: row.get(2),
            address: row.get(3),
            phone: row.get(4),
            active: row.get(5),
            theme_primary_hsl: row.get(6),
            pdf_header_url: row.get(7),
        })
    }

    /// Update an existing branch
    pub async fn update_branch(&self, id: &str, update: &BranchUpdate) -> Result<Branch, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        // Build dynamic update query
        let mut set_clauses = Vec::new();
        let mut param_index = 1;

        if update.name.is_some() {
            param_index += 1;
            set_clauses.push(format!("name = ${}", param_index));
        }
        if update.address.is_some() {
            param_index += 1;
            set_clauses.push(format!("address = ${}", param_index));
        }
        if update.phone.is_some() {
            param_index += 1;
            set_clauses.push(format!("phone = ${}", param_index));
        }
        if update.active.is_some() {
            param_index += 1;
            set_clauses.push(format!("active = ${}", param_index));
        }
        if update.theme_primary_hsl.is_some() {
            param_index += 1;
            set_clauses.push(format!("theme_primary_hsl = ${}", param_index));
        }
        if update.pdf_header_url.is_some() {
            param_index += 1;
            set_clauses.push(format!("pdf_header_url = ${}", param_index));
        }

        if set_clauses.is_empty() {
            return Err("No fields to update".to_string());
        }

        let query = format!(
            "UPDATE branches SET {} WHERE id = $1
             RETURNING id, name, code, address, phone, active, theme_primary_hsl, pdf_header_url",
            set_clauses.join(", ")
        );

        // Build params dynamically - this is a bit verbose but type-safe
        let row = if let (Some(name), Some(address), Some(phone), Some(active), Some(theme), Some(pdf)) =
            (&update.name, &update.address, &update.phone, &update.active, &update.theme_primary_hsl, &update.pdf_header_url)
        {
            client.query_one(&query, &[&branch_uuid, name, address, phone, active, theme, pdf]).await
        } else if let (Some(name), Some(address), Some(phone), Some(active), Some(theme)) =
            (&update.name, &update.address, &update.phone, &update.active, &update.theme_primary_hsl)
        {
            client.query_one(&query, &[&branch_uuid, name, address, phone, active, theme]).await
        } else if let (Some(name), Some(address), Some(phone), Some(active)) =
            (&update.name, &update.address, &update.phone, &update.active)
        {
            client.query_one(&query, &[&branch_uuid, name, address, phone, active]).await
        } else {
            // For simpler updates, use a fixed query
            client
                .query_one(
                    "UPDATE branches SET
                        name = COALESCE($2, name),
                        address = COALESCE($3, address),
                        phone = COALESCE($4, phone),
                        active = COALESCE($5, active),
                        theme_primary_hsl = COALESCE($6, theme_primary_hsl),
                        pdf_header_url = COALESCE($7, pdf_header_url)
                     WHERE id = $1
                     RETURNING id, name, code, address, phone, active, theme_primary_hsl, pdf_header_url",
                    &[&branch_uuid, &update.name, &update.address, &update.phone, &update.active, &update.theme_primary_hsl, &update.pdf_header_url],
                )
                .await
        }.map_err(|e| e.to_string())?;

        Ok(Branch {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            code: row.get(2),
            address: row.get(3),
            phone: row.get(4),
            active: row.get(5),
            theme_primary_hsl: row.get(6),
            pdf_header_url: row.get(7),
        })
    }

    /// Delete a branch and its rooms
    pub async fn delete_branch(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        // First delete associated rooms
        client
            .execute("DELETE FROM rooms WHERE branch_id = $1", &[&branch_uuid])
            .await
            .map_err(|e| e.to_string())?;

        // Then delete the branch
        client
            .execute("DELETE FROM branches WHERE id = $1", &[&branch_uuid])
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Get rooms by branch (including inactive for admin)
    pub async fn get_rooms(&self, branch_id: &str) -> Result<Vec<Room>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, kind::text, branch_id, active
                 FROM rooms WHERE branch_id = $1 ORDER BY name",
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

    /// Get all rooms (for counting active rooms per branch)
    pub async fn get_all_rooms(&self) -> Result<Vec<Room>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, kind::text, branch_id, active
                 FROM rooms ORDER BY name",
                &[],
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

    /// Create a new room
    pub async fn create_room(&self, input: &RoomInput) -> Result<Room, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(&input.branch_id).map_err(|e| e.to_string())?;

        let row = client
            .query_one(
                "INSERT INTO rooms (name, kind, branch_id, active)
                 VALUES ($1, $2, $3, true)
                 RETURNING id, name, kind, branch_id, active",
                &[&input.name, &input.kind, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Room {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            kind: row.get::<_, String>(2),
            branch_id: row.get::<_, uuid::Uuid>(3).to_string(),
            active: row.get(4),
        })
    }

    /// Update an existing room
    pub async fn update_room(&self, id: &str, update: &RoomUpdate) -> Result<Room, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let room_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        let row = client
            .query_one(
                "UPDATE rooms SET
                    name = COALESCE($2, name),
                    kind = COALESCE($3, kind),
                    active = COALESCE($4, active)
                 WHERE id = $1
                 RETURNING id, name, kind, branch_id, active",
                &[&room_uuid, &update.name, &update.kind, &update.active],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Room {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            kind: row.get::<_, String>(2),
            branch_id: row.get::<_, uuid::Uuid>(3).to_string(),
            active: row.get(4),
        })
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
                "SELECT p.id, p.user_id, p.full_name, p.email, p.specialty, p.gender, p.professional_title, p.is_visible_in_dashboard
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
                gender: row.get(5),
                professional_title: row.get(6),
                is_visible_in_dashboard: row.get(7),
            })
            .collect();

        Ok(profiles)
    }

    /// Get profile by user_id
    pub async fn get_profile_by_user_id(&self, user_id: &str) -> Result<Option<Profile>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let user_uuid = uuid::Uuid::parse_str(user_id).map_err(|e| e.to_string())?;

        let row = client
            .query_opt(
                "SELECT id, user_id, full_name, email, specialty, gender, professional_title, is_visible_in_dashboard
                 FROM profiles
                 WHERE user_id = $1",
                &[&user_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(row.map(|r| Profile {
            id: r.get::<_, uuid::Uuid>(0).to_string(),
            user_id: r.get::<_, uuid::Uuid>(1).to_string(),
            full_name: r.get(2),
            email: r.get(3),
            specialty: r.get(4),
            gender: r.get(5),
            professional_title: r.get(6),
            is_visible_in_dashboard: r.get(7),
        }))
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

    /// Get all users with their profiles and roles (for Admin panel)
    pub async fn get_all_users_with_profiles(&self) -> Result<Vec<UserWithProfile>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        // Get all user roles
        let roles_rows = client
            .query(
                "SELECT user_id, role, created_at FROM user_roles ORDER BY created_at",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Collect unique user_ids
        let user_ids: Vec<uuid::Uuid> = roles_rows
            .iter()
            .map(|row| row.get::<_, uuid::Uuid>(0))
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        if user_ids.is_empty() {
            return Ok(vec![]);
        }

        // Get profiles for all users - build query with placeholders
        let placeholders: Vec<String> = (1..=user_ids.len()).map(|i| format!("${}", i)).collect();
        let query = format!(
            "SELECT user_id, full_name, email, specialty, is_visible_in_dashboard, gender, professional_title FROM profiles WHERE user_id IN ({})",
            placeholders.join(", ")
        );

        // Convert to references for query params
        let params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = user_ids
            .iter()
            .map(|id| id as &(dyn tokio_postgres::types::ToSql + Sync))
            .collect();

        let profiles_rows = client
            .query(&query, &params[..])
            .await
            .map_err(|e| e.to_string())?;

        // Build map of profiles
        let mut profiles_map: std::collections::HashMap<String, (String, String, Option<String>, bool, Option<String>, Option<String>)> = std::collections::HashMap::new();
        for row in profiles_rows {
            let user_id: uuid::Uuid = row.get(0);
            let full_name: String = row.get(1);
            let email: Option<String> = row.get(2);
            let specialty: Option<String> = row.get(3);
            let is_visible: bool = row.get::<_, Option<bool>>(4).unwrap_or(true);
            let gender: Option<String> = row.get(5);
            let professional_title: Option<String> = row.get(6);
            profiles_map.insert(user_id.to_string(), (full_name, email.unwrap_or_else(|| "N/A".to_string()), specialty, is_visible, gender, professional_title));
        }

        // Group roles by user
        let mut users_map: std::collections::HashMap<String, UserWithProfile> = std::collections::HashMap::new();
        for row in roles_rows {
            let user_id: uuid::Uuid = row.get(0);
            let role: String = row.get(1);
            let created_at: chrono::DateTime<chrono::Utc> = row.get(2);
            let user_id_str = user_id.to_string();

            let profile = profiles_map.get(&user_id_str);

            users_map
                .entry(user_id_str.clone())
                .and_modify(|u| {
                    if !u.roles.contains(&role) {
                        u.roles.push(role.clone());
                    }
                })
                .or_insert_with(|| UserWithProfile {
                    user_id: user_id_str,
                    email: profile.map(|p| p.1.clone()).unwrap_or_else(|| "N/A".to_string()),
                    full_name: profile.map(|p| p.0.clone()).unwrap_or_else(|| "N/A".to_string()),
                    roles: vec![role],
                    specialty: profile.and_then(|p| p.2.clone()),
                    gender: profile.and_then(|p| p.4.clone()),
                    professional_title: profile.and_then(|p| p.5.clone()),
                    created_at: created_at.to_rfc3339(),
                    is_visible_in_dashboard: profile.map(|p| p.3).unwrap_or(true),
                });
        }

        Ok(users_map.into_values().collect())
    }

    /// Get pending registrations
    pub async fn get_pending_registrations(&self) -> Result<Vec<PendingRegistration>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, email, full_name, role, specialty, status, created_at
                 FROM pending_registrations
                 WHERE status = 'pending'
                 ORDER BY created_at DESC",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        let registrations = rows
            .iter()
            .map(|row| PendingRegistration {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                email: row.get(1),
                full_name: row.get(2),
                role: row.get(3),
                specialty: row.get(4),
                status: row.get(5),
                created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(6).to_rfc3339(),
            })
            .collect();

        Ok(registrations)
    }

    /// Add a role to a user
    pub async fn add_user_role(&self, user_id: &str, role: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let user_uuid = uuid::Uuid::parse_str(user_id).map_err(|e| e.to_string())?;

        client
            .execute(
                "INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                &[&user_uuid, &role],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Update user visibility in dashboard
    pub async fn update_profile_visibility(&self, user_id: &str, is_visible: bool) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let user_uuid = uuid::Uuid::parse_str(user_id).map_err(|e| e.to_string())?;

        client
            .execute(
                "UPDATE profiles SET is_visible_in_dashboard = $2 WHERE user_id = $1",
                &[&user_uuid, &is_visible],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Update user specialty and gender (for doctors)
    pub async fn update_profile_doctor_info(&self, user_id: &str, specialty: Option<String>, gender: Option<String>, professional_title: Option<String>) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let user_uuid = uuid::Uuid::parse_str(user_id).map_err(|e| e.to_string())?;

        client
            .execute(
                "UPDATE profiles SET specialty = $2, gender = $3, professional_title = $4 WHERE user_id = $1",
                &[&user_uuid, &specialty, &gender, &professional_title],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
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

    /// Delete a patient (CASCADE will handle related records)
    pub async fn delete_patient(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let patient_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        client
            .execute(
                "DELETE FROM patients WHERE id = $1",
                &[&patient_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
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
                "SELECT id, encounter_id, side::text, av_sc, av_cc,
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
                "SELECT id, encounter_id, side::text, av_sc, av_cc,
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
                "SELECT id, study_id, file_path, mime_type, side::text, extracted_summary
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
                "SELECT s.id, s.appointment_id, s.patient_id, s.surgery_type::text, s.eye::text,
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
                "SELECT s.id, s.appointment_id, s.patient_id, s.surgery_type::text, s.eye::text,
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
                "SELECT s.id, s.appointment_id, s.patient_id, s.surgery_type::text, s.eye::text,
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

    /// Delete a surgery file
    pub async fn delete_surgery_file(&self, file_id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let file_uuid = uuid::Uuid::parse_str(file_id).map_err(|e| e.to_string())?;

        client
            .execute("DELETE FROM surgery_files WHERE id = $1", &[&file_uuid])
            .await
            .map_err(|e| e.to_string())?;

        log::info!("Deleted surgery_file {} from local PostgreSQL", file_id);
        Ok(())
    }

    /// Delete a study file
    pub async fn delete_study_file(&self, file_id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let file_uuid = uuid::Uuid::parse_str(file_id).map_err(|e| e.to_string())?;

        client
            .execute("DELETE FROM study_files WHERE id = $1", &[&file_uuid])
            .await
            .map_err(|e| e.to_string())?;

        log::info!("Deleted study_file {} from local PostgreSQL", file_id);
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
                "SELECT proc.id, proc.appointment_id, proc.patient_id, proc.procedure_type::text, proc.eye::text,
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
                "SELECT proc.id, proc.appointment_id, proc.patient_id, proc.procedure_type::text, proc.eye::text,
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
                "SELECT proc.id, proc.appointment_id, proc.patient_id, proc.procedure_type::text, proc.eye::text,
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

    /// Get pending invoices by branch (balance_due > 0)
    pub async fn get_pending_invoices_by_branch(&self, branch_id: &str, date_filter: Option<&str>) -> Result<Vec<Invoice>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let (query, params): (String, Vec<Box<dyn tokio_postgres::types::ToSql + Sync + Send>>) = match date_filter {
            Some("today") => {
                let today = chrono::Utc::now().date_naive();
                (
                    "SELECT i.id, i.invoice_number, i.patient_id, i.appointment_id, i.branch_id,
                            i.total_amount, i.balance_due, i.discount_type, i.discount_value,
                            i.discount_reason, i.status::text, i.notes, i.created_at,
                            p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                     FROM invoices i
                     LEFT JOIN patients p ON i.patient_id = p.id
                     WHERE i.branch_id = $1 AND i.status != 'cancelada' AND i.balance_due > 0
                       AND DATE(i.created_at) = $2
                     ORDER BY i.created_at DESC
                     LIMIT 50".to_string(),
                    vec![Box::new(branch_uuid), Box::new(today)]
                )
            }
            Some("week") => {
                let week_ago = chrono::Utc::now() - chrono::Duration::days(7);
                (
                    "SELECT i.id, i.invoice_number, i.patient_id, i.appointment_id, i.branch_id,
                            i.total_amount, i.balance_due, i.discount_type, i.discount_value,
                            i.discount_reason, i.status::text, i.notes, i.created_at,
                            p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                     FROM invoices i
                     LEFT JOIN patients p ON i.patient_id = p.id
                     WHERE i.branch_id = $1 AND i.status != 'cancelada' AND i.balance_due > 0
                       AND i.created_at >= $2
                     ORDER BY i.created_at DESC
                     LIMIT 50".to_string(),
                    vec![Box::new(branch_uuid), Box::new(week_ago)]
                )
            }
            _ => {
                (
                    "SELECT i.id, i.invoice_number, i.patient_id, i.appointment_id, i.branch_id,
                            i.total_amount, i.balance_due, i.discount_type, i.discount_value,
                            i.discount_reason, i.status::text, i.notes, i.created_at,
                            p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                     FROM invoices i
                     LEFT JOIN patients p ON i.patient_id = p.id
                     WHERE i.branch_id = $1 AND i.status != 'cancelada' AND i.balance_due > 0
                     ORDER BY i.created_at DESC
                     LIMIT 50".to_string(),
                    vec![Box::new(branch_uuid)]
                )
            }
        };

        let params_refs: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = params.iter().map(|p| p.as_ref() as &(dyn tokio_postgres::types::ToSql + Sync)).collect();

        let rows = client
            .query(&query, &params_refs)
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

    /// Get invoice by appointment ID
    pub async fn get_invoice_by_appointment(&self, appointment_id: &str) -> Result<Option<Invoice>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let appointment_uuid = uuid::Uuid::parse_str(appointment_id).map_err(|e| e.to_string())?;

        let result = client
            .query_opt(
                "SELECT i.id, i.invoice_number, i.patient_id, i.appointment_id, i.branch_id,
                        i.total_amount, i.balance_due, i.discount_type, i.discount_value,
                        i.discount_reason, i.status::text, i.notes, i.created_at,
                        p.id as p_id, p.first_name, p.last_name, p.code, p.phone
                 FROM invoices i
                 LEFT JOIN patients p ON i.patient_id = p.id
                 WHERE i.appointment_id = $1",
                &[&appointment_uuid],
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
    pub async fn generate_invoice_number(&self, branch_id: &str) -> Result<String, String> {
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

    /// Create a supplier
    pub async fn create_supplier(&self, input: &crate::commands::SupplierInput) -> Result<Supplier, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let row = client
            .query_one(
                "INSERT INTO suppliers (name, active) VALUES ($1, true) RETURNING id, name, contact, phone",
                &[&input.name],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(Supplier {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            contact: row.get(2),
            phone: row.get(3),
        })
    }

    // ============================================================
    // INVENTORY LOTS
    // ============================================================

    /// Get inventory lots by item_id
    pub async fn get_inventory_lots(&self, item_id: &str) -> Result<Vec<crate::commands::InventoryLot>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let item_uuid = uuid::Uuid::parse_str(item_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, item_id, lot_number, expiration_date, quantity, created_at
                 FROM inventory_lots
                 WHERE item_id = $1
                 ORDER BY created_at DESC",
                &[&item_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| {
            let exp_date: Option<chrono::NaiveDate> = row.get(3);
            crate::commands::InventoryLot {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                item_id: row.get::<_, uuid::Uuid>(1).to_string(),
                lot_number: row.get(2),
                expiration_date: exp_date.map(|d| d.to_string()),
                quantity: row.get::<_, f64>(4),
                created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(5).to_rfc3339(),
            }
        }).collect())
    }

    /// Get all inventory lots with product info for a branch
    pub async fn get_all_inventory_lots(&self, branch_id: &str) -> Result<Vec<crate::commands::InventoryLotWithProduct>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT l.id, l.item_id, l.lot_number, l.expiry_date, l.quantity, l.cost_price, l.created_at,
                        i.name as item_name, i.code as item_code
                 FROM inventory_lots l
                 JOIN inventory_items i ON l.item_id = i.id
                 WHERE i.branch_id = $1
                 ORDER BY l.expiry_date ASC NULLS LAST",
                &[&branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| {
            let exp_date: Option<chrono::NaiveDate> = row.get(3);
            let cost: Option<f64> = row.get(5);
            let item_name: Option<String> = row.get(7);
            let item_code: Option<String> = row.get(8);

            crate::commands::InventoryLotWithProduct {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                item_id: row.get::<_, uuid::Uuid>(1).to_string(),
                lot_number: row.get(2),
                expiry_date: exp_date.map(|d| d.to_string()),
                quantity: row.get::<_, f64>(4),
                cost_price: cost,
                created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(6).to_rfc3339(),
                inventory_items: item_name.map(|name| crate::commands::InventoryItemEmbed {
                    name,
                    code: item_code,
                }),
            }
        }).collect())
    }

    /// Create an inventory lot
    pub async fn create_inventory_lot(&self, input: &crate::commands::InventoryLotInput) -> Result<crate::commands::InventoryLot, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let item_uuid = uuid::Uuid::parse_str(&input.item_id).map_err(|e| e.to_string())?;
        let expiry = input.expiry_date.as_ref()
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

        let row = client
            .query_one(
                "INSERT INTO inventory_lots (item_id, lot_number, quantity, expiry_date, cost_price)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, item_id, lot_number, expiry_date, quantity, created_at",
                &[&item_uuid, &input.lot_number, &input.quantity, &expiry, &input.cost_price],
            )
            .await
            .map_err(|e| e.to_string())?;

        let exp_date: Option<chrono::NaiveDate> = row.get(3);

        Ok(crate::commands::InventoryLot {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            item_id: row.get::<_, uuid::Uuid>(1).to_string(),
            lot_number: row.get(2),
            expiration_date: exp_date.map(|d| d.to_string()),
            quantity: row.get::<_, f64>(4),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(5).to_rfc3339(),
        })
    }

    // ============================================================
    // INVENTORY MOVEMENTS
    // ============================================================

    /// Get inventory movements with joins
    pub async fn get_inventory_movements(&self, branch_id: &str, limit: i32) -> Result<Vec<crate::commands::InventoryMovement>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT m.id, m.branch_id, m.item_id, m.lot_id, m.movement_type::text, m.quantity,
                        m.reference_type, m.reference_id, m.notes, m.created_at,
                        i.name as item_name, i.code as item_code,
                        l.lot_number
                 FROM inventory_movements m
                 LEFT JOIN inventory_items i ON m.item_id = i.id
                 LEFT JOIN inventory_lots l ON m.lot_id = l.id
                 WHERE m.branch_id = $1
                 ORDER BY m.created_at DESC
                 LIMIT $2",
                &[&branch_uuid, &(limit as i64)],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| {
            let lot_id: Option<uuid::Uuid> = row.get(3);
            let ref_id: Option<uuid::Uuid> = row.get(7);
            let item_name: Option<String> = row.get(10);
            let item_code: Option<String> = row.get(11);
            let lot_number: Option<String> = row.get(12);

            crate::commands::InventoryMovement {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                branch_id: row.get::<_, uuid::Uuid>(1).to_string(),
                item_id: row.get::<_, uuid::Uuid>(2).to_string(),
                lot_id: lot_id.map(|u| u.to_string()),
                movement_type: row.get(4),
                quantity: row.get::<_, f64>(5),
                reference_type: row.get(6),
                reference_id: ref_id.map(|u| u.to_string()),
                notes: row.get(8),
                created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(9).to_rfc3339(),
                inventory_items: item_name.map(|name| crate::commands::InventoryItemEmbed {
                    name,
                    code: item_code,
                }),
                inventory_lots: lot_number.map(|ln| crate::commands::InventoryLotEmbed {
                    lot_number: ln,
                }),
            }
        }).collect())
    }

    /// Create inventory movement (trigger will update stock)
    pub async fn create_inventory_movement(&self, input: &crate::commands::InventoryMovementInput) -> Result<crate::commands::InventoryMovement, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(&input.branch_id).map_err(|e| e.to_string())?;
        let item_uuid = uuid::Uuid::parse_str(&input.item_id).map_err(|e| e.to_string())?;
        let lot_uuid = match &input.lot_id {
            Some(id) if !id.is_empty() => Some(uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?),
            _ => None,
        };

        let row = client
            .query_one(
                "INSERT INTO inventory_movements (branch_id, item_id, lot_id, movement_type, quantity, reference_type, notes)
                 VALUES ($1, $2, $3, $4::inventory_movement_type, $5, $6, $7)
                 RETURNING id, branch_id, item_id, lot_id, movement_type::text, quantity, reference_type, reference_id, notes, created_at",
                &[&branch_uuid, &item_uuid, &lot_uuid, &input.movement_type, &input.quantity, &input.reference_type, &input.notes],
            )
            .await
            .map_err(|e| e.to_string())?;

        let lot_id: Option<uuid::Uuid> = row.get(3);
        let ref_id: Option<uuid::Uuid> = row.get(7);

        Ok(crate::commands::InventoryMovement {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            branch_id: row.get::<_, uuid::Uuid>(1).to_string(),
            item_id: row.get::<_, uuid::Uuid>(2).to_string(),
            lot_id: lot_id.map(|u| u.to_string()),
            movement_type: row.get(4),
            quantity: row.get::<_, f64>(5),
            reference_type: row.get(6),
            reference_id: ref_id.map(|u| u.to_string()),
            notes: row.get(8),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(9).to_rfc3339(),
            inventory_items: None,
            inventory_lots: None,
        })
    }

    // ============================================================
    // CASH CLOSURE REPORTS
    // ============================================================

    /// Get service sales summary by type
    pub async fn get_service_sales(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<Vec<crate::commands::ServiceSales>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT sp.service_type, COUNT(*)::bigint as cantidad, COALESCE(SUM(ii.subtotal), 0)::float8 as total
                 FROM invoice_items ii
                 JOIN invoices i ON ii.invoice_id = i.id
                 JOIN service_prices sp ON ii.item_id = sp.id
                 WHERE ii.item_type = 'servicio'
                   AND i.branch_id = $1
                   AND i.created_at >= $2::timestamptz
                   AND i.created_at <= $3::timestamptz
                   AND i.status != 'cancelada'
                 GROUP BY sp.service_type
                 ORDER BY total DESC",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::ServiceSales {
            service_type: row.get(0),
            cantidad: row.get(1),
            total: row.get(2),
        }).collect())
    }

    /// Get detailed service sales
    pub async fn get_service_details(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<Vec<crate::commands::ServiceDetail>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT sp.service_name, sp.service_type, SUM(ii.quantity)::bigint as cantidad, COALESCE(SUM(ii.subtotal), 0)::float8 as total
                 FROM invoice_items ii
                 JOIN invoices i ON ii.invoice_id = i.id
                 JOIN service_prices sp ON ii.item_id = sp.id
                 WHERE ii.item_type = 'servicio'
                   AND i.branch_id = $1
                   AND i.created_at >= $2::timestamptz
                   AND i.created_at <= $3::timestamptz
                   AND i.status != 'cancelada'
                 GROUP BY sp.service_name, sp.service_type
                 ORDER BY total DESC",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::ServiceDetail {
            service_name: row.get(0),
            service_type: row.get(1),
            cantidad: row.get(2),
            total: row.get(3),
        }).collect())
    }

    /// Get inventory sales summary by category
    pub async fn get_inventory_sales(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<Vec<crate::commands::InventorySales>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT COALESCE(inv.category, 'Sin categoría') as category, SUM(ii.quantity)::bigint as cantidad, COALESCE(SUM(ii.subtotal), 0)::float8 as total
                 FROM invoice_items ii
                 JOIN invoices i ON ii.invoice_id = i.id
                 LEFT JOIN inventory_items inv ON ii.item_id = inv.id
                 WHERE ii.item_type = 'producto'
                   AND i.branch_id = $1
                   AND i.created_at >= $2::timestamptz
                   AND i.created_at <= $3::timestamptz
                   AND i.status != 'cancelada'
                 GROUP BY inv.category
                 ORDER BY total DESC",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::InventorySales {
            category: row.get(0),
            cantidad: row.get(1),
            total: row.get(2),
        }).collect())
    }

    /// Get detailed inventory sales
    pub async fn get_inventory_details(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<Vec<crate::commands::InventoryDetail>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT COALESCE(inv.category, 'Sin categoría') as category, COALESCE(inv.name, ii.description) as product_name,
                        SUM(ii.quantity)::bigint as cantidad, COALESCE(SUM(ii.subtotal), 0)::float8 as total
                 FROM invoice_items ii
                 JOIN invoices i ON ii.invoice_id = i.id
                 LEFT JOIN inventory_items inv ON ii.item_id = inv.id
                 WHERE ii.item_type = 'producto'
                   AND i.branch_id = $1
                   AND i.created_at >= $2::timestamptz
                   AND i.created_at <= $3::timestamptz
                   AND i.status != 'cancelada'
                 GROUP BY inv.category, COALESCE(inv.name, ii.description)
                 ORDER BY total DESC",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::InventoryDetail {
            category: row.get(0),
            product_name: row.get(1),
            cantidad: row.get(2),
            total: row.get(3),
        }).collect())
    }

    /// Get payment method summary
    pub async fn get_payment_method_summary(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<Vec<crate::commands::PaymentMethodSummary>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT p.payment_method, COUNT(*)::bigint as cantidad, COALESCE(SUM(p.amount), 0)::float8 as total
                 FROM payments p
                 JOIN invoices i ON p.invoice_id = i.id
                 WHERE i.branch_id = $1
                   AND p.created_at >= $2::timestamptz
                   AND p.created_at <= $3::timestamptz
                   AND p.status = 'completado'
                 GROUP BY p.payment_method
                 ORDER BY total DESC",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::PaymentMethodSummary {
            payment_method: row.get(0),
            cantidad: row.get(1),
            total: row.get(2),
        }).collect())
    }

    /// Get products report with detailed sales data
    pub async fn get_products_report(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<Vec<crate::commands::ProductReportItem>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT
                    inv.invoice_number,
                    inv.created_at,
                    COALESCE(p.first_name || ' ' || p.last_name, 'Sin paciente') as patient_name,
                    COALESCE(ii.name, it.description, 'Producto eliminado') as product_name,
                    COALESCE(ii.category, 'N/A') as category,
                    COALESCE(s.name, 'Sin proveedor') as supplier_name,
                    it.quantity::float8,
                    it.unit_price::float8,
                    COALESCE(ii.cost_price, 0)::float8 as cost_price,
                    it.subtotal::float8,
                    (it.subtotal - COALESCE(ii.cost_price, 0) * it.quantity)::float8 as profit
                 FROM invoice_items it
                 JOIN invoices inv ON it.invoice_id = inv.id
                 LEFT JOIN patients p ON inv.patient_id = p.id
                 LEFT JOIN inventory_items ii ON it.item_id = ii.id
                 LEFT JOIN suppliers s ON ii.supplier_id = s.id
                 WHERE inv.branch_id = $1
                   AND it.item_type = 'producto'
                   AND inv.created_at >= $2::timestamptz
                   AND inv.created_at <= $3::timestamptz
                   AND inv.status != 'cancelada'
                 ORDER BY inv.created_at DESC",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::ProductReportItem {
            invoice_number: row.get(0),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(1).to_rfc3339(),
            patient_name: row.get(2),
            product_name: row.get(3),
            category: row.get(4),
            supplier_name: row.get(5),
            quantity: row.get(6),
            unit_price: row.get(7),
            cost_price: row.get(8),
            subtotal: row.get(9),
            profit: row.get(10),
        }).collect())
    }

    /// Get services report with detailed sales data
    pub async fn get_services_report(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<Vec<crate::commands::ServiceReportItem>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT
                    inv.invoice_number,
                    inv.created_at,
                    COALESCE(p.first_name || ' ' || p.last_name, 'Sin paciente') as patient_name,
                    COALESCE(sp.service_name, it.description, 'Servicio') as service_name,
                    COALESCE(sp.service_type, 'N/A') as service_type,
                    it.quantity::float8,
                    it.unit_price::float8,
                    it.subtotal::float8,
                    inv.discount_type,
                    COALESCE(inv.discount_value, 0)::float8 as discount_value,
                    inv.discount_reason
                 FROM invoice_items it
                 JOIN invoices inv ON it.invoice_id = inv.id
                 LEFT JOIN patients p ON inv.patient_id = p.id
                 LEFT JOIN service_prices sp ON it.item_id = sp.id
                 WHERE inv.branch_id = $1
                   AND it.item_type = 'servicio'
                   AND inv.created_at >= $2::timestamptz
                   AND inv.created_at <= $3::timestamptz
                   AND inv.status != 'cancelada'
                 ORDER BY inv.created_at DESC",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::ServiceReportItem {
            invoice_number: row.get(0),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(1).to_rfc3339(),
            patient_name: row.get(2),
            service_name: row.get(3),
            service_type: row.get(4),
            quantity: row.get(5),
            unit_price: row.get(6),
            subtotal: row.get(7),
            discount_type: row.get(8),
            discount_value: row.get(9),
            discount_reason: row.get(10),
        }).collect())
    }

    // ============================================================
    // CASH CLOSURE
    // ============================================================

    /// Get daily summary for cash closure
    pub async fn get_daily_summary(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<crate::commands::DailySummary, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        // Get invoices totals
        let invoice_row = client
            .query_one(
                "SELECT
                    COALESCE(SUM(total_amount), 0)::float8 as total_invoiced,
                    COALESCE(SUM(balance_due), 0)::float8 as total_pending,
                    COALESCE(SUM(discount_value), 0)::float8 as total_discounts
                 FROM invoices
                 WHERE branch_id = $1
                   AND created_at >= $2::timestamptz
                   AND created_at <= $3::timestamptz
                   AND status != 'cancelada'",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        // Get payments total
        let payment_row = client
            .query_one(
                "SELECT COALESCE(SUM(p.amount), 0)::float8 as total_collected
                 FROM payments p
                 JOIN invoices inv ON p.invoice_id = inv.id
                 WHERE inv.branch_id = $1
                   AND p.created_at >= $2::timestamptz
                   AND p.created_at <= $3::timestamptz
                   AND p.status = 'completado'",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(crate::commands::DailySummary {
            total_invoiced: invoice_row.get(0),
            total_collected: payment_row.get(0),
            total_pending: invoice_row.get(1),
            total_discounts: invoice_row.get(2),
        })
    }

    /// Get daily invoices for cash closure
    pub async fn get_daily_invoices(&self, branch_id: &str, start_date: &str, end_date: &str) -> Result<Vec<crate::commands::DailyInvoice>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT
                    inv.invoice_number,
                    COALESCE(p.first_name || ' ' || p.last_name, 'Sin paciente') as patient_name,
                    inv.total_amount::float8,
                    inv.status::text,
                    (SELECT payment_method::text FROM payments WHERE invoice_id = inv.id ORDER BY created_at DESC LIMIT 1)
                 FROM invoices inv
                 LEFT JOIN patients p ON inv.patient_id = p.id
                 WHERE inv.branch_id = $1
                   AND inv.created_at >= $2::timestamptz
                   AND inv.created_at <= $3::timestamptz
                 ORDER BY inv.created_at DESC",
                &[&branch_uuid, &start_date, &end_date],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::DailyInvoice {
            invoice_number: row.get(0),
            patient_name: row.get(1),
            total_amount: row.get(2),
            status: row.get(3),
            payment_method: row.get(4),
        }).collect())
    }

    /// Create cash closure
    pub async fn create_cash_closure(&self, closure: crate::commands::CashClosureInput) -> Result<serde_json::Value, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(&closure.branch_id).map_err(|e| e.to_string())?;
        let closed_by_uuid = uuid::Uuid::parse_str(&closure.closed_by).map_err(|e| e.to_string())?;

        let row = client
            .query_one(
                "INSERT INTO cash_closures (
                    branch_id, period_start, period_end,
                    total_invoiced, total_collected, total_pending, total_discounts,
                    consultas_total, consultas_count,
                    cirugias_total, cirugias_count,
                    procedimientos_total, procedimientos_count,
                    estudios_total, estudios_count,
                    inventory_total, inventory_count,
                    efectivo_total, tarjeta_total, transferencia_total, cheque_total, otro_total,
                    detailed_data, closed_by
                ) VALUES (
                    $1, $2::timestamptz, $3::timestamptz,
                    $4, $5, $6, $7,
                    $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                    $18, $19, $20, $21, $22,
                    $23, $24
                ) RETURNING id, created_at",
                &[
                    &branch_uuid,
                    &closure.period_start,
                    &closure.period_end,
                    &closure.total_invoiced,
                    &closure.total_collected,
                    &closure.total_pending,
                    &closure.total_discounts,
                    &closure.consultas_total,
                    &closure.consultas_count,
                    &closure.cirugias_total,
                    &closure.cirugias_count,
                    &closure.procedimientos_total,
                    &closure.procedimientos_count,
                    &closure.estudios_total,
                    &closure.estudios_count,
                    &closure.inventory_total,
                    &closure.inventory_count,
                    &closure.efectivo_total,
                    &closure.tarjeta_total,
                    &closure.transferencia_total,
                    &closure.cheque_total,
                    &closure.otro_total,
                    &closure.detailed_data,
                    &closed_by_uuid,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        let id: uuid::Uuid = row.get(0);
        let created_at: chrono::DateTime<chrono::Utc> = row.get(1);

        Ok(serde_json::json!({
            "id": id.to_string(),
            "created_at": created_at.to_rfc3339()
        }))
    }

    // ============================================================
    // CRM PIPELINES
    // ============================================================

    /// Get CRM pipelines by branch
    pub async fn get_crm_pipelines(&self, branch_id: &str, status: Option<&str>) -> Result<Vec<CRMPipeline>, String> {
        log::info!("PostgresPool::get_crm_pipelines: branch_id={}, status={:?}", branch_id, status);

        let client = match self.pool.get().await {
            Ok(c) => {
                log::info!("PostgresPool::get_crm_pipelines: Got client from pool");
                c
            }
            Err(e) => {
                log::error!("PostgresPool::get_crm_pipelines: Failed to get client: {}", e);
                return Err(e.to_string());
            }
        };

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
                "SELECT id, name, category, display_order, active
                 FROM surgery_types
                 WHERE deleted_at IS NULL
                 ORDER BY category, display_order",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| SurgeryType {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            category: row.get(2),
            display_order: row.get::<_, Option<i32>>(3).unwrap_or(0),
            active: row.get::<_, Option<bool>>(4).unwrap_or(true),
        }).collect())
    }

    /// Get all study types
    pub async fn get_study_types(&self) -> Result<Vec<StudyType>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, display_order, active
                 FROM study_types
                 WHERE deleted_at IS NULL
                 ORDER BY display_order",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| StudyType {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            display_order: row.get::<_, Option<i32>>(2).unwrap_or(0),
            active: row.get::<_, Option<bool>>(3).unwrap_or(true),
        }).collect())
    }

    /// Get all procedure types
    pub async fn get_procedure_types(&self) -> Result<Vec<ProcedureTypeConfig>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, display_order, active
                 FROM procedure_types
                 WHERE deleted_at IS NULL
                 ORDER BY display_order",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| ProcedureTypeConfig {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            display_order: row.get::<_, Option<i32>>(2).unwrap_or(0),
            active: row.get::<_, Option<bool>>(3).unwrap_or(true),
        }).collect())
    }

    /// Create surgery type
    pub async fn create_surgery_type(&self, input: &SurgeryTypeInput) -> Result<SurgeryType, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let row = client
            .query_one(
                "INSERT INTO surgery_types (name, category, display_order)
                 VALUES ($1, $2, COALESCE($3, 0))
                 RETURNING id, name, category, display_order, active",
                &[&input.name, &input.category, &input.display_order],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(SurgeryType {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            category: row.get(2),
            display_order: row.get::<_, Option<i32>>(3).unwrap_or(0),
            active: row.get::<_, Option<bool>>(4).unwrap_or(true),
        })
    }

    /// Create study type
    pub async fn create_study_type(&self, input: &StudyTypeInput) -> Result<StudyType, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let row = client
            .query_one(
                "INSERT INTO study_types (name, display_order)
                 VALUES ($1, COALESCE($2, 0))
                 RETURNING id, name, display_order, active",
                &[&input.name, &input.display_order],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(StudyType {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            display_order: row.get::<_, Option<i32>>(2).unwrap_or(0),
            active: row.get::<_, Option<bool>>(3).unwrap_or(true),
        })
    }

    /// Create procedure type
    pub async fn create_procedure_type(&self, input: &ProcedureTypeInput) -> Result<ProcedureTypeConfig, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let row = client
            .query_one(
                "INSERT INTO procedure_types (name, display_order)
                 VALUES ($1, COALESCE($2, 0))
                 RETURNING id, name, display_order, active",
                &[&input.name, &input.display_order],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(ProcedureTypeConfig {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            display_order: row.get::<_, Option<i32>>(2).unwrap_or(0),
            active: row.get::<_, Option<bool>>(3).unwrap_or(true),
        })
    }

    /// Update surgery type
    pub async fn update_surgery_type(&self, id: &str, updates: &ClinicalTypeUpdate) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        let mut query_parts = Vec::new();
        let mut param_idx = 1;

        if updates.name.is_some() {
            param_idx += 1;
            query_parts.push(format!("name = ${}", param_idx));
        }
        if updates.active.is_some() {
            param_idx += 1;
            query_parts.push(format!("active = ${}", param_idx));
        }

        if query_parts.is_empty() {
            return Ok(());
        }

        let query = format!(
            "UPDATE surgery_types SET {} WHERE id = $1",
            query_parts.join(", ")
        );

        let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = vec![&uuid];
        if let Some(ref name) = updates.name {
            params.push(name);
        }
        if let Some(ref active) = updates.active {
            params.push(active);
        }

        client.execute(&query, &params[..]).await.map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Update study type
    pub async fn update_study_type(&self, id: &str, updates: &ClinicalTypeUpdate) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        let mut query_parts = Vec::new();
        let mut param_idx = 1;

        if updates.name.is_some() {
            param_idx += 1;
            query_parts.push(format!("name = ${}", param_idx));
        }
        if updates.active.is_some() {
            param_idx += 1;
            query_parts.push(format!("active = ${}", param_idx));
        }

        if query_parts.is_empty() {
            return Ok(());
        }

        let query = format!(
            "UPDATE study_types SET {} WHERE id = $1",
            query_parts.join(", ")
        );

        let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = vec![&uuid];
        if let Some(ref name) = updates.name {
            params.push(name);
        }
        if let Some(ref active) = updates.active {
            params.push(active);
        }

        client.execute(&query, &params[..]).await.map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Update procedure type
    pub async fn update_procedure_type(&self, id: &str, updates: &ClinicalTypeUpdate) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        let mut query_parts = Vec::new();
        let mut param_idx = 1;

        if updates.name.is_some() {
            param_idx += 1;
            query_parts.push(format!("name = ${}", param_idx));
        }
        if updates.active.is_some() {
            param_idx += 1;
            query_parts.push(format!("active = ${}", param_idx));
        }

        if query_parts.is_empty() {
            return Ok(());
        }

        let query = format!(
            "UPDATE procedure_types SET {} WHERE id = $1",
            query_parts.join(", ")
        );

        let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = vec![&uuid];
        if let Some(ref name) = updates.name {
            params.push(name);
        }
        if let Some(ref active) = updates.active {
            params.push(active);
        }

        client.execute(&query, &params[..]).await.map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Delete surgery type (hard delete)
    pub async fn delete_surgery_type(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        client
            .execute("DELETE FROM surgery_types WHERE id = $1", &[&uuid])
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Delete study type (hard delete)
    pub async fn delete_study_type(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        client
            .execute("DELETE FROM study_types WHERE id = $1", &[&uuid])
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Delete procedure type (hard delete)
    pub async fn delete_procedure_type(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;

        client
            .execute("DELETE FROM procedure_types WHERE id = $1", &[&uuid])
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
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

    // ============================================================
    // CRM ACTIVITY LOG
    // ============================================================

    /// Get last read timestamp for CRM activities by user
    pub async fn get_crm_activity_read(&self, user_id: &str) -> Result<Option<String>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let user_uuid = uuid::Uuid::parse_str(user_id).map_err(|e| e.to_string())?;

        let result = client
            .query_opt(
                "SELECT last_read_at::text FROM crm_activity_read WHERE user_id = $1",
                &[&user_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(result.map(|row| row.get(0)))
    }

    /// Upsert CRM activity read timestamp
    pub async fn upsert_crm_activity_read(&self, user_id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let user_uuid = uuid::Uuid::parse_str(user_id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "INSERT INTO crm_activity_read (user_id, last_read_at)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id)
                 DO UPDATE SET last_read_at = $2",
                &[&user_uuid, &now],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Get unread CRM activities count with procedure info
    pub async fn get_crm_unread_activities(&self, branch_id: &str, last_read: Option<&str>) -> Result<Vec<CRMUnreadActivity>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = if let Some(last_read_at) = last_read {
            let last_read_time = chrono::DateTime::parse_from_rfc3339(last_read_at)
                .map_err(|e| e.to_string())?
                .with_timezone(&chrono::Utc);

            client
                .query(
                    "SELECT al.id, pt.name as procedure_name
                     FROM crm_activity_log al
                     LEFT JOIN crm_pipelines p ON al.pipeline_id = p.id
                     LEFT JOIN crm_procedure_types pt ON p.procedure_type_id = pt.id
                     WHERE al.branch_id = $1 AND al.created_at > $2",
                    &[&branch_uuid, &last_read_time],
                )
                .await
                .map_err(|e| e.to_string())?
        } else {
            client
                .query(
                    "SELECT al.id, pt.name as procedure_name
                     FROM crm_activity_log al
                     LEFT JOIN crm_pipelines p ON al.pipeline_id = p.id
                     LEFT JOIN crm_procedure_types pt ON p.procedure_type_id = pt.id
                     WHERE al.branch_id = $1",
                    &[&branch_uuid],
                )
                .await
                .map_err(|e| e.to_string())?
        };

        Ok(rows.iter().map(|row| CRMUnreadActivity {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            procedure_name: row.get(1),
        }).collect())
    }

    /// Get recent CRM activities (last 48 hours)
    pub async fn get_crm_recent_activities(&self, branch_id: &str) -> Result<Vec<CRMActivityLog>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;
        let two_days_ago = chrono::Utc::now() - chrono::Duration::hours(48);

        let rows = client
            .query(
                "SELECT al.id, al.pipeline_id, al.activity_type::text, al.from_stage, al.to_stage,
                        al.reason, al.created_by, al.branch_id, al.created_at,
                        p.eye_side::text,
                        pat.first_name as patient_first_name, pat.last_name as patient_last_name,
                        pt.name as procedure_name, pt.color as procedure_color,
                        pr.full_name as creator_name
                 FROM crm_activity_log al
                 LEFT JOIN crm_pipelines p ON al.pipeline_id = p.id
                 LEFT JOIN patients pat ON p.patient_id = pat.id
                 LEFT JOIN crm_procedure_types pt ON p.procedure_type_id = pt.id
                 LEFT JOIN profiles pr ON al.created_by = pr.user_id
                 WHERE al.branch_id = $1 AND al.created_at >= $2
                 ORDER BY al.created_at DESC
                 LIMIT 50",
                &[&branch_uuid, &two_days_ago],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| {
            let patient = if row.get::<_, Option<String>>(10).is_some() {
                Some(CRMActivityPatient {
                    first_name: row.get(10),
                    last_name: row.get(11),
                })
            } else {
                None
            };

            let procedure_type = if row.get::<_, Option<String>>(12).is_some() {
                Some(CRMActivityProcedureType {
                    name: row.get(12),
                    color: row.get(13),
                })
            } else {
                None
            };

            let creator = row.get::<_, Option<String>>(14).map(|name| CRMActivityCreator {
                full_name: name,
            });

            CRMActivityLog {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                pipeline_id: row.get::<_, uuid::Uuid>(1).to_string(),
                activity_type: row.get(2),
                from_stage: row.get(3),
                to_stage: row.get(4),
                reason: row.get(5),
                created_by: row.get::<_, Option<uuid::Uuid>>(6).map(|u| u.to_string()),
                branch_id: row.get::<_, uuid::Uuid>(7).to_string(),
                created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(8).to_rfc3339(),
                eye_side: row.get(9),
                patient,
                procedure_type,
                creator,
            }
        }).collect())
    }

    // ============================================================
    // APP SETTINGS
    // ============================================================

    /// Get all app settings
    pub async fn get_app_settings(&self) -> Result<Vec<AppSetting>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, key, value, description FROM app_settings ORDER BY key",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| {
            AppSetting {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                key: row.get(1),
                value: row.get(2),  // JSONB se convierte directamente a serde_json::Value
                description: row.get(3),
            }
        }).collect())
    }

    /// Update an app setting by key
    pub async fn update_app_setting(&self, key: &str, value: &serde_json::Value) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let value_str = serde_json::to_string(value).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE app_settings SET value = $1, updated_at = $2 WHERE key = $3",
                &[&value_str, &now, &key],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Get consent signature by surgery ID
    pub async fn get_consent_signature_by_surgery(&self, surgery_id: &str) -> Result<Option<ConsentSignature>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let surgery_uuid = uuid::Uuid::parse_str(surgery_id).map_err(|e| e.to_string())?;

        let row = client
            .query_opt(
                "SELECT id, surgery_id, procedure_id, patient_id, patient_signature, patient_name,
                        witness_signature, witness_name, consent_text, pdf_url, signed_at, signed_by, branch_id
                 FROM consent_signatures
                 WHERE surgery_id = $1",
                &[&surgery_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        match row {
            Some(row) => {
                let id: uuid::Uuid = row.get("id");
                let surgery_id: Option<uuid::Uuid> = row.get("surgery_id");
                let procedure_id: Option<uuid::Uuid> = row.get("procedure_id");
                let patient_id: uuid::Uuid = row.get("patient_id");
                let signed_at: chrono::DateTime<chrono::Utc> = row.get("signed_at");
                let signed_by: Option<uuid::Uuid> = row.get("signed_by");
                let branch_id: Option<uuid::Uuid> = row.get("branch_id");

                Ok(Some(ConsentSignature {
                    id: id.to_string(),
                    surgery_id: surgery_id.map(|u| u.to_string()),
                    procedure_id: procedure_id.map(|u| u.to_string()),
                    patient_id: patient_id.to_string(),
                    patient_signature: row.get("patient_signature"),
                    patient_name: row.get("patient_name"),
                    witness_signature: row.get("witness_signature"),
                    witness_name: row.get("witness_name"),
                    consent_text: row.get("consent_text"),
                    pdf_url: row.get("pdf_url"),
                    signed_at: signed_at.to_rfc3339(),
                    signed_by: signed_by.map(|u| u.to_string()),
                    branch_id: branch_id.map(|u| u.to_string()),
                }))
            }
            None => Ok(None),
        }
    }

    /// Get consent signatures by patient ID
    pub async fn get_consent_signatures_by_patient(&self, patient_id: &str) -> Result<Vec<ConsentSignature>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let patient_uuid = uuid::Uuid::parse_str(patient_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, surgery_id, procedure_id, patient_id, patient_signature, patient_name,
                        witness_signature, witness_name, consent_text, pdf_url, signed_at, signed_by, branch_id
                 FROM consent_signatures
                 WHERE patient_id = $1
                 ORDER BY signed_at DESC",
                &[&patient_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let signatures = rows.iter().map(|row| {
            let id: uuid::Uuid = row.get("id");
            let surgery_id: Option<uuid::Uuid> = row.get("surgery_id");
            let procedure_id: Option<uuid::Uuid> = row.get("procedure_id");
            let patient_id: uuid::Uuid = row.get("patient_id");
            let signed_at: chrono::DateTime<chrono::Utc> = row.get("signed_at");
            let signed_by: Option<uuid::Uuid> = row.get("signed_by");
            let branch_id: Option<uuid::Uuid> = row.get("branch_id");

            ConsentSignature {
                id: id.to_string(),
                surgery_id: surgery_id.map(|u| u.to_string()),
                procedure_id: procedure_id.map(|u| u.to_string()),
                patient_id: patient_id.to_string(),
                patient_signature: row.get("patient_signature"),
                patient_name: row.get("patient_name"),
                witness_signature: row.get("witness_signature"),
                witness_name: row.get("witness_name"),
                consent_text: row.get("consent_text"),
                pdf_url: row.get("pdf_url"),
                signed_at: signed_at.to_rfc3339(),
                signed_by: signed_by.map(|u| u.to_string()),
                branch_id: branch_id.map(|u| u.to_string()),
            }
        }).collect();

        Ok(signatures)
    }

    /// Link a consent signature to a surgery by updating its surgery_id
    pub async fn link_consent_signature_to_surgery(&self, signature_id: &str, surgery_id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let sig_uuid = uuid::Uuid::parse_str(signature_id).map_err(|e| e.to_string())?;
        let surgery_uuid = uuid::Uuid::parse_str(surgery_id).map_err(|e| e.to_string())?;

        client
            .execute(
                "UPDATE consent_signatures SET surgery_id = $1 WHERE id = $2",
                &[&surgery_uuid, &sig_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    // ============================================================
    // ROOM INVENTORY
    // ============================================================

    /// Get room inventory categories by branch
    pub async fn get_room_inventory_categories(&self, branch_id: &str) -> Result<Vec<RoomInventoryCategory>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT id, name, parent_id, display_order, active, branch_id, created_at, updated_at
                 FROM room_inventory_categories
                 WHERE branch_id = $1 AND active = true
                 ORDER BY display_order, name",
                &[&branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| {
            RoomInventoryCategory {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                name: row.get(1),
                parent_id: row.get::<_, Option<uuid::Uuid>>(2).map(|u| u.to_string()),
                display_order: row.get(3),
                active: row.get(4),
                branch_id: row.get::<_, uuid::Uuid>(5).to_string(),
                created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(6).to_rfc3339(),
                updated_at: row.get::<_, chrono::DateTime<chrono::Utc>>(7).to_rfc3339(),
            }
        }).collect())
    }

    /// Create a room inventory category
    pub async fn create_room_inventory_category(&self, input: &RoomInventoryCategoryInput) -> Result<RoomInventoryCategory, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(&input.branch_id).map_err(|e| e.to_string())?;
        let parent_uuid = match &input.parent_id {
            Some(p) => Some(uuid::Uuid::parse_str(p).map_err(|e| e.to_string())?),
            None => None,
        };
        let display_order = input.display_order.unwrap_or(0);

        let row = client
            .query_one(
                "INSERT INTO room_inventory_categories (name, parent_id, display_order, branch_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, name, parent_id, display_order, active, branch_id, created_at, updated_at",
                &[&input.name, &parent_uuid, &display_order, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(RoomInventoryCategory {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            parent_id: row.get::<_, Option<uuid::Uuid>>(2).map(|u| u.to_string()),
            display_order: row.get(3),
            active: row.get(4),
            branch_id: row.get::<_, uuid::Uuid>(5).to_string(),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(6).to_rfc3339(),
            updated_at: row.get::<_, chrono::DateTime<chrono::Utc>>(7).to_rfc3339(),
        })
    }

    /// Update a room inventory category
    pub async fn update_room_inventory_category(&self, id: &str, updates: &RoomInventoryCategoryUpdate) -> Result<RoomInventoryCategory, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let category_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let parent_uuid = match &updates.parent_id {
            Some(p) => Some(uuid::Uuid::parse_str(p).map_err(|e| e.to_string())?),
            None => None,
        };
        let now = chrono::Utc::now();

        // Build dynamic update query
        let row = client
            .query_one(
                "UPDATE room_inventory_categories
                 SET name = COALESCE($1, name),
                     parent_id = COALESCE($2, parent_id),
                     display_order = COALESCE($3, display_order),
                     updated_at = $4
                 WHERE id = $5
                 RETURNING id, name, parent_id, display_order, active, branch_id, created_at, updated_at",
                &[&updates.name, &parent_uuid, &updates.display_order, &now, &category_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(RoomInventoryCategory {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            name: row.get(1),
            parent_id: row.get::<_, Option<uuid::Uuid>>(2).map(|u| u.to_string()),
            display_order: row.get(3),
            active: row.get(4),
            branch_id: row.get::<_, uuid::Uuid>(5).to_string(),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(6).to_rfc3339(),
            updated_at: row.get::<_, chrono::DateTime<chrono::Utc>>(7).to_rfc3339(),
        })
    }

    /// Soft delete a room inventory category
    pub async fn delete_room_inventory_category(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let category_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE room_inventory_categories SET active = false, updated_at = $1 WHERE id = $2",
                &[&now, &category_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Get room inventory items by branch and optional category
    pub async fn get_room_inventory_items(&self, branch_id: &str, category_id: Option<&str>) -> Result<Vec<RoomInventoryItem>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;

        let rows = if let Some(cat_id) = category_id {
            let category_uuid = uuid::Uuid::parse_str(cat_id).map_err(|e| e.to_string())?;
            client
                .query(
                    "SELECT i.id, i.category_id, i.name, i.code, i.brand, i.specification,
                            i.current_stock, i.min_stock, i.unit, i.notes, i.active, i.branch_id,
                            i.created_at, i.updated_at,
                            c.id as c_id, c.name as c_name, c.parent_id as c_parent_id,
                            c.display_order as c_display_order, c.active as c_active,
                            c.branch_id as c_branch_id, c.created_at as c_created_at, c.updated_at as c_updated_at
                     FROM room_inventory_items i
                     LEFT JOIN room_inventory_categories c ON i.category_id = c.id
                     WHERE i.branch_id = $1 AND i.category_id = $2 AND i.active = true
                     ORDER BY i.name",
                    &[&branch_uuid, &category_uuid],
                )
                .await
                .map_err(|e| e.to_string())?
        } else {
            client
                .query(
                    "SELECT i.id, i.category_id, i.name, i.code, i.brand, i.specification,
                            i.current_stock, i.min_stock, i.unit, i.notes, i.active, i.branch_id,
                            i.created_at, i.updated_at,
                            c.id as c_id, c.name as c_name, c.parent_id as c_parent_id,
                            c.display_order as c_display_order, c.active as c_active,
                            c.branch_id as c_branch_id, c.created_at as c_created_at, c.updated_at as c_updated_at
                     FROM room_inventory_items i
                     LEFT JOIN room_inventory_categories c ON i.category_id = c.id
                     WHERE i.branch_id = $1 AND i.active = true
                     ORDER BY i.name",
                    &[&branch_uuid],
                )
                .await
                .map_err(|e| e.to_string())?
        };

        Ok(rows.iter().map(|row| {
            let category = row.get::<_, Option<uuid::Uuid>>(14).map(|_| {
                RoomInventoryCategory {
                    id: row.get::<_, uuid::Uuid>(14).to_string(),
                    name: row.get(15),
                    parent_id: row.get::<_, Option<uuid::Uuid>>(16).map(|u| u.to_string()),
                    display_order: row.get(17),
                    active: row.get(18),
                    branch_id: row.get::<_, uuid::Uuid>(19).to_string(),
                    created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(20).to_rfc3339(),
                    updated_at: row.get::<_, chrono::DateTime<chrono::Utc>>(21).to_rfc3339(),
                }
            });

            RoomInventoryItem {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                category_id: row.get::<_, uuid::Uuid>(1).to_string(),
                name: row.get(2),
                code: row.get(3),
                brand: row.get(4),
                specification: row.get(5),
                current_stock: row.get(6),
                min_stock: row.get(7),
                unit: row.get(8),
                notes: row.get(9),
                active: row.get(10),
                branch_id: row.get::<_, uuid::Uuid>(11).to_string(),
                created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(12).to_rfc3339(),
                updated_at: row.get::<_, chrono::DateTime<chrono::Utc>>(13).to_rfc3339(),
                category,
            }
        }).collect())
    }

    /// Create a room inventory item
    pub async fn create_room_inventory_item(&self, input: &RoomInventoryItemInput) -> Result<RoomInventoryItem, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(&input.branch_id).map_err(|e| e.to_string())?;
        let category_uuid = uuid::Uuid::parse_str(&input.category_id).map_err(|e| e.to_string())?;
        let current_stock = input.current_stock.unwrap_or(0);
        let min_stock = input.min_stock.unwrap_or(5);
        let unit = input.unit.clone().unwrap_or_else(|| "unidad".to_string());

        let row = client
            .query_one(
                "INSERT INTO room_inventory_items (category_id, name, code, brand, specification, current_stock, min_stock, unit, notes, branch_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING id, category_id, name, code, brand, specification, current_stock, min_stock, unit, notes, active, branch_id, created_at, updated_at",
                &[&category_uuid, &input.name, &input.code, &input.brand, &input.specification, &current_stock, &min_stock, &unit, &input.notes, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(RoomInventoryItem {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            category_id: row.get::<_, uuid::Uuid>(1).to_string(),
            name: row.get(2),
            code: row.get(3),
            brand: row.get(4),
            specification: row.get(5),
            current_stock: row.get(6),
            min_stock: row.get(7),
            unit: row.get(8),
            notes: row.get(9),
            active: row.get(10),
            branch_id: row.get::<_, uuid::Uuid>(11).to_string(),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(12).to_rfc3339(),
            updated_at: row.get::<_, chrono::DateTime<chrono::Utc>>(13).to_rfc3339(),
            category: None,
        })
    }

    /// Update a room inventory item
    pub async fn update_room_inventory_item(&self, id: &str, updates: &RoomInventoryItemUpdate) -> Result<RoomInventoryItem, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let item_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let category_uuid = match &updates.category_id {
            Some(c) => Some(uuid::Uuid::parse_str(c).map_err(|e| e.to_string())?),
            None => None,
        };
        let now = chrono::Utc::now();

        let row = client
            .query_one(
                "UPDATE room_inventory_items
                 SET category_id = COALESCE($1, category_id),
                     name = COALESCE($2, name),
                     code = COALESCE($3, code),
                     brand = COALESCE($4, brand),
                     specification = COALESCE($5, specification),
                     min_stock = COALESCE($6, min_stock),
                     unit = COALESCE($7, unit),
                     notes = COALESCE($8, notes),
                     updated_at = $9
                 WHERE id = $10
                 RETURNING id, category_id, name, code, brand, specification, current_stock, min_stock, unit, notes, active, branch_id, created_at, updated_at",
                &[&category_uuid, &updates.name, &updates.code, &updates.brand, &updates.specification, &updates.min_stock, &updates.unit, &updates.notes, &now, &item_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(RoomInventoryItem {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            category_id: row.get::<_, uuid::Uuid>(1).to_string(),
            name: row.get(2),
            code: row.get(3),
            brand: row.get(4),
            specification: row.get(5),
            current_stock: row.get(6),
            min_stock: row.get(7),
            unit: row.get(8),
            notes: row.get(9),
            active: row.get(10),
            branch_id: row.get::<_, uuid::Uuid>(11).to_string(),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(12).to_rfc3339(),
            updated_at: row.get::<_, chrono::DateTime<chrono::Utc>>(13).to_rfc3339(),
            category: None,
        })
    }

    /// Soft delete a room inventory item
    pub async fn delete_room_inventory_item(&self, id: &str) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let item_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();

        client
            .execute(
                "UPDATE room_inventory_items SET active = false, updated_at = $1 WHERE id = $2",
                &[&now, &item_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Update room inventory item stock
    pub async fn update_room_inventory_stock(&self, id: &str, new_stock: i32) -> Result<(), String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let item_uuid = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now();
        let stock = std::cmp::max(0, new_stock);

        client
            .execute(
                "UPDATE room_inventory_items SET current_stock = $1, updated_at = $2 WHERE id = $3",
                &[&stock, &now, &item_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Create a room inventory movement
    pub async fn create_room_inventory_movement(&self, input: &RoomInventoryMovementInput) -> Result<RoomInventoryMovement, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(&input.branch_id).map_err(|e| e.to_string())?;
        let item_uuid = uuid::Uuid::parse_str(&input.item_id).map_err(|e| e.to_string())?;
        let user_uuid = match &input.user_id {
            Some(u) => Some(uuid::Uuid::parse_str(u).map_err(|e| e.to_string())?),
            None => None,
        };

        let row = client
            .query_one(
                "INSERT INTO room_inventory_movements (item_id, quantity, movement_type, notes, user_id, branch_id)
                 VALUES ($1, $2, $3::room_inventory_movement_type, $4, $5, $6)
                 RETURNING id, item_id, quantity, movement_type::text, notes, user_id, branch_id, created_at",
                &[&item_uuid, &input.quantity, &input.movement_type, &input.notes, &user_uuid, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(RoomInventoryMovement {
            id: row.get::<_, uuid::Uuid>(0).to_string(),
            item_id: row.get::<_, uuid::Uuid>(1).to_string(),
            quantity: row.get(2),
            movement_type: row.get(3),
            notes: row.get(4),
            user_id: row.get::<_, Option<uuid::Uuid>>(5).map(|u| u.to_string()),
            branch_id: row.get::<_, uuid::Uuid>(6).to_string(),
            created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(7).to_rfc3339(),
            item: None,
        })
    }

    /// Get room inventory movements
    pub async fn get_room_inventory_movements(&self, branch_id: &str, item_id: Option<&str>, limit: i32) -> Result<Vec<RoomInventoryMovement>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid = uuid::Uuid::parse_str(branch_id).map_err(|e| e.to_string())?;
        let limit_i64 = limit as i64;

        let rows = if let Some(item) = item_id {
            let item_uuid = uuid::Uuid::parse_str(item).map_err(|e| e.to_string())?;
            client
                .query(
                    "SELECT m.id, m.item_id, m.quantity, m.movement_type::text, m.notes, m.user_id, m.branch_id, m.created_at,
                            i.id as i_id, i.category_id, i.name, i.code, i.brand, i.specification,
                            i.current_stock, i.min_stock, i.unit, i.notes as i_notes, i.active,
                            i.branch_id as i_branch_id, i.created_at as i_created_at, i.updated_at as i_updated_at
                     FROM room_inventory_movements m
                     LEFT JOIN room_inventory_items i ON m.item_id = i.id
                     WHERE m.branch_id = $1 AND m.item_id = $2
                     ORDER BY m.created_at DESC
                     LIMIT $3",
                    &[&branch_uuid, &item_uuid, &limit_i64],
                )
                .await
                .map_err(|e| e.to_string())?
        } else {
            client
                .query(
                    "SELECT m.id, m.item_id, m.quantity, m.movement_type::text, m.notes, m.user_id, m.branch_id, m.created_at,
                            i.id as i_id, i.category_id, i.name, i.code, i.brand, i.specification,
                            i.current_stock, i.min_stock, i.unit, i.notes as i_notes, i.active,
                            i.branch_id as i_branch_id, i.created_at as i_created_at, i.updated_at as i_updated_at
                     FROM room_inventory_movements m
                     LEFT JOIN room_inventory_items i ON m.item_id = i.id
                     WHERE m.branch_id = $1
                     ORDER BY m.created_at DESC
                     LIMIT $2",
                    &[&branch_uuid, &limit_i64],
                )
                .await
                .map_err(|e| e.to_string())?
        };

        Ok(rows.iter().map(|row| {
            let item = row.get::<_, Option<uuid::Uuid>>(8).map(|_| {
                RoomInventoryItem {
                    id: row.get::<_, uuid::Uuid>(8).to_string(),
                    category_id: row.get::<_, uuid::Uuid>(9).to_string(),
                    name: row.get(10),
                    code: row.get(11),
                    brand: row.get(12),
                    specification: row.get(13),
                    current_stock: row.get(14),
                    min_stock: row.get(15),
                    unit: row.get(16),
                    notes: row.get(17),
                    active: row.get(18),
                    branch_id: row.get::<_, uuid::Uuid>(19).to_string(),
                    created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(20).to_rfc3339(),
                    updated_at: row.get::<_, chrono::DateTime<chrono::Utc>>(21).to_rfc3339(),
                    category: None,
                }
            });

            RoomInventoryMovement {
                id: row.get::<_, uuid::Uuid>(0).to_string(),
                item_id: row.get::<_, uuid::Uuid>(1).to_string(),
                quantity: row.get(2),
                movement_type: row.get(3),
                notes: row.get(4),
                user_id: row.get::<_, Option<uuid::Uuid>>(5).map(|u| u.to_string()),
                branch_id: row.get::<_, uuid::Uuid>(6).to_string(),
                created_at: row.get::<_, chrono::DateTime<chrono::Utc>>(7).to_rfc3339(),
                item,
            }
        }).collect())
    }

    // ============================================================
    // ANALYTICS V2 - For Analytics.tsx offline support
    // ============================================================

    /// Get service sales for analytics (with optional branch filter)
    pub async fn get_analytics_service_sales(&self, start_date: &str, end_date: &str, branch_filter: Option<&str>) -> Result<Vec<crate::commands::AnalyticsServiceSales>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid: Option<uuid::Uuid> = branch_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());

        let rows = client
            .query(
                "SELECT
                    ii.service_type as service_type,
                    COUNT(*)::bigint as cantidad,
                    COALESCE(SUM(ii.total), 0)::float8 as total
                 FROM invoice_items ii
                 JOIN invoices i ON ii.invoice_id = i.id
                 WHERE i.created_at >= $1::timestamptz
                   AND i.created_at <= $2::timestamptz
                   AND i.status != 'cancelada'
                   AND ii.service_type IS NOT NULL
                   AND ($3::uuid IS NULL OR i.branch_id = $3)
                 GROUP BY ii.service_type
                 ORDER BY total DESC",
                &[&start_date, &end_date, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::AnalyticsServiceSales {
            service_type: row.get::<_, Option<String>>(0).unwrap_or_else(|| "Otro".to_string()),
            cantidad: row.get(1),
            total: row.get(2),
        }).collect())
    }

    /// Get payment methods for analytics (with optional branch filter)
    pub async fn get_analytics_payment_methods(&self, start_date: &str, end_date: &str, branch_filter: Option<&str>) -> Result<Vec<crate::commands::AnalyticsPaymentMethod>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid: Option<uuid::Uuid> = branch_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());

        let rows = client
            .query(
                "SELECT
                    p.payment_method,
                    COUNT(*)::bigint as cantidad,
                    COALESCE(SUM(p.amount), 0)::float8 as total
                 FROM payments p
                 JOIN invoices i ON p.invoice_id = i.id
                 WHERE p.created_at >= $1::timestamptz
                   AND p.created_at <= $2::timestamptz
                   AND p.status = 'completado'
                   AND ($3::uuid IS NULL OR i.branch_id = $3)
                 GROUP BY p.payment_method
                 ORDER BY total DESC",
                &[&start_date, &end_date, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::AnalyticsPaymentMethod {
            metodo: row.get::<_, Option<String>>(0).unwrap_or_else(|| "Otro".to_string()),
            cantidad: row.get(1),
            total: row.get(2),
        }).collect())
    }

    /// Get top inventory products for analytics (with optional branch filter)
    pub async fn get_analytics_inventory_details(&self, start_date: &str, end_date: &str, branch_filter: Option<&str>) -> Result<Vec<crate::commands::AnalyticsItemDetail>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid: Option<uuid::Uuid> = branch_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());

        let rows = client
            .query(
                "SELECT
                    COALESCE(ii.item_id::text, '') as item_id,
                    COALESCE(ii.description, 'Sin nombre') as item_name,
                    COALESCE(SUM(ii.quantity), 0)::bigint as total_quantity,
                    COALESCE(SUM(ii.total), 0)::float8 as total_revenue
                 FROM invoice_items ii
                 JOIN invoices i ON ii.invoice_id = i.id
                 WHERE i.created_at >= $1::timestamptz
                   AND i.created_at <= $2::timestamptz
                   AND i.status != 'cancelada'
                   AND ii.item_type = 'producto'
                   AND ($3::uuid IS NULL OR i.branch_id = $3)
                 GROUP BY ii.item_id, ii.description
                 ORDER BY total_revenue DESC
                 LIMIT 10",
                &[&start_date, &end_date, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::AnalyticsItemDetail {
            item_id: row.get(0),
            item_name: row.get(1),
            total_quantity: row.get(2),
            total_revenue: row.get(3),
        }).collect())
    }

    /// Get top service items for analytics (with optional branch filter)
    pub async fn get_analytics_service_details(&self, start_date: &str, end_date: &str, branch_filter: Option<&str>) -> Result<Vec<crate::commands::AnalyticsItemDetail>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid: Option<uuid::Uuid> = branch_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());

        let rows = client
            .query(
                "SELECT
                    COALESCE(ii.item_id::text, '') as item_id,
                    COALESCE(ii.description, 'Sin nombre') as item_name,
                    COALESCE(SUM(ii.quantity), 0)::bigint as total_quantity,
                    COALESCE(SUM(ii.total), 0)::float8 as total_revenue
                 FROM invoice_items ii
                 JOIN invoices i ON ii.invoice_id = i.id
                 WHERE i.created_at >= $1::timestamptz
                   AND i.created_at <= $2::timestamptz
                   AND i.status != 'cancelada'
                   AND ii.item_type = 'servicio'
                   AND ($3::uuid IS NULL OR i.branch_id = $3)
                 GROUP BY ii.item_id, ii.description
                 ORDER BY total_revenue DESC
                 LIMIT 10",
                &[&start_date, &end_date, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::AnalyticsItemDetail {
            item_id: row.get(0),
            item_name: row.get(1),
            total_quantity: row.get(2),
            total_revenue: row.get(3),
        }).collect())
    }

    /// Get clinical stats with revenue for analytics
    pub async fn get_clinical_stats_with_revenue(&self, start_date: &str, end_date: &str, doctor_filter: Option<&str>, branch_filter: Option<&str>) -> Result<Vec<crate::commands::ClinicalStatsWithRevenue>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let doctor_uuid: Option<uuid::Uuid> = doctor_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());
        let branch_uuid: Option<uuid::Uuid> = branch_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());

        let rows = client
            .query(
                "WITH appointment_data AS (
                    SELECT
                        a.id as appointment_id,
                        a.type as tipo_cita,
                        a.doctor_id,
                        COALESCE(p.full_name, 'Sin asignar') as doctor_name,
                        a.patient_id,
                        a.starts_at
                    FROM appointments a
                    LEFT JOIN profiles p ON a.doctor_id = p.user_id
                    WHERE a.starts_at >= $1::timestamptz
                      AND a.starts_at <= $2::timestamptz
                      AND a.status = 'done'
                      AND ($3::uuid IS NULL OR a.doctor_id = $3)
                      AND ($4::uuid IS NULL OR a.branch_id = $4)
                ),
                service_prices_lookup AS (
                    SELECT service_type, price
                    FROM service_prices
                    WHERE active = true
                ),
                calculated_revenue AS (
                    SELECT
                        ad.tipo_cita,
                        ad.doctor_id,
                        ad.doctor_name,
                        ad.patient_id,
                        COALESCE(
                            (SELECT SUM(ii.total) FROM invoice_items ii
                             JOIN invoices i ON ii.invoice_id = i.id
                             WHERE i.appointment_id = ad.appointment_id
                               AND i.status != 'cancelada'),
                            0
                        ) as revenue_real,
                        COALESCE(
                            (SELECT sp.price FROM service_prices_lookup sp
                             WHERE sp.service_type = ad.tipo_cita
                             LIMIT 1),
                            0
                        ) as revenue_estimado
                    FROM appointment_data ad
                )
                SELECT
                    tipo_cita,
                    doctor_id::text,
                    doctor_name,
                    COUNT(*)::bigint as cantidad,
                    COUNT(DISTINCT patient_id)::bigint as pacientes_unicos,
                    SUM(revenue_real)::float8 as revenue_real,
                    SUM(revenue_estimado)::float8 as revenue_estimado,
                    SUM(GREATEST(revenue_real, revenue_estimado))::float8 as revenue_total
                FROM calculated_revenue
                GROUP BY tipo_cita, doctor_id, doctor_name
                ORDER BY revenue_total DESC",
                &[&start_date, &end_date, &doctor_uuid, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::ClinicalStatsWithRevenue {
            tipo_cita: row.get::<_, Option<String>>(0).unwrap_or_else(|| "desconocido".to_string()),
            doctor_id: row.get(1),
            doctor_name: row.get(2),
            cantidad: row.get(3),
            pacientes_unicos: row.get(4),
            revenue_real: row.get(5),
            revenue_estimado: row.get(6),
            revenue_total: row.get(7),
        }).collect())
    }

    /// Get invoices for analytics metrics
    pub async fn get_analytics_invoices(&self, start_date: &str, end_date: &str, branch_filter: Option<&str>) -> Result<Vec<crate::commands::AnalyticsInvoice>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid: Option<uuid::Uuid> = branch_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());

        let rows = client
            .query(
                "SELECT
                    id::text,
                    COALESCE(total_amount, 0)::float8 as total_amount,
                    created_at::text,
                    status,
                    COALESCE(discount_value, 0)::float8 as discount_value,
                    discount_type
                 FROM invoices
                 WHERE created_at >= $1::timestamptz
                   AND created_at <= $2::timestamptz
                   AND status != 'cancelada'
                   AND ($3::uuid IS NULL OR branch_id = $3)
                 ORDER BY created_at",
                &[&start_date, &end_date, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::AnalyticsInvoice {
            id: row.get(0),
            total_amount: row.get(1),
            created_at: row.get(2),
            status: row.get(3),
            discount_value: row.get(4),
            discount_type: row.get(5),
        }).collect())
    }

    /// Get cash closures for analytics
    pub async fn get_analytics_closures(&self, start_date: &str, end_date: &str, branch_filter: Option<&str>) -> Result<Vec<crate::commands::AnalyticsClosure>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let branch_uuid: Option<uuid::Uuid> = branch_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());

        let rows = client
            .query(
                "SELECT
                    c.id::text,
                    c.closure_date::text,
                    COALESCE(c.total_invoiced, 0)::float8 as total_invoiced,
                    COALESCE(c.total_collected, 0)::float8 as total_collected,
                    COALESCE(c.total_pending, 0)::float8 as total_pending,
                    c.closed_by::text,
                    COALESCE(p.full_name, 'N/A') as user_name
                 FROM cash_closures c
                 LEFT JOIN profiles p ON c.closed_by = p.user_id
                 WHERE c.closure_date >= $1::timestamptz
                   AND c.closure_date <= $2::timestamptz
                   AND ($3::uuid IS NULL OR c.branch_id = $3)
                 ORDER BY c.closure_date DESC",
                &[&start_date, &end_date, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::AnalyticsClosure {
            id: row.get(0),
            closure_date: row.get(1),
            total_invoiced: row.get(2),
            total_collected: row.get(3),
            total_pending: row.get(4),
            closed_by: row.get(5),
            user_name: row.get(6),
        }).collect())
    }

    /// Get appointments for analytics daily trend
    pub async fn get_analytics_appointments(&self, start_date: &str, end_date: &str, doctor_filter: Option<&str>, branch_filter: Option<&str>) -> Result<Vec<crate::commands::AnalyticsAppointment>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;
        let doctor_uuid: Option<uuid::Uuid> = doctor_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());
        let branch_uuid: Option<uuid::Uuid> = branch_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());

        let rows = client
            .query(
                "SELECT
                    id::text,
                    starts_at::text,
                    type
                 FROM appointments
                 WHERE starts_at >= $1::timestamptz
                   AND starts_at <= $2::timestamptz
                   AND status = 'done'
                   AND ($3::uuid IS NULL OR doctor_id = $3)
                   AND ($4::uuid IS NULL OR branch_id = $4)
                 ORDER BY starts_at",
                &[&start_date, &end_date, &doctor_uuid, &branch_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::AnalyticsAppointment {
            id: row.get(0),
            starts_at: row.get(1),
            appointment_type: row.get(2),
        }).collect())
    }

    /// Get doctors list for analytics
    pub async fn get_analytics_doctors(&self) -> Result<Vec<crate::commands::AnalyticsDoctor>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let rows = client
            .query(
                "SELECT p.user_id::text, p.full_name
                 FROM profiles p
                 JOIN user_roles ur ON p.user_id = ur.user_id
                 WHERE ur.role = 'doctor'
                 ORDER BY p.full_name",
                &[],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::AnalyticsDoctor {
            user_id: row.get(0),
            full_name: row.get(1),
        }).collect())
    }

    // ============================================================
    // RESEARCH - Clinical Research Data
    // ============================================================

    /// Get clinical research data by encounter
    pub async fn get_clinical_research_data(&self, filters: &crate::commands::ResearchFilters) -> Result<Vec<crate::commands::ClinicalResearchRow>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let doctor_uuid: Option<uuid::Uuid> = filters.doctor_filter.as_ref().and_then(|s| uuid::Uuid::parse_str(s).ok());
        let diagnosis_filter = filters.diagnosis_filter.clone();
        let search_field_type = filters.search_field_type.clone().unwrap_or_else(|| "diagnosis".to_string());
        let surgery_type_filter = filters.surgery_type_filter.clone();
        let appointment_type_filter = filters.appointment_type_filter.clone();

        // Build the complex query with dynamic text search
        let query = r#"
            WITH encounters_base AS (
                SELECT
                    e.id as encounter_id,
                    e.patient_id,
                    e.appointment_id,
                    e.created_at as encounter_date,
                    e.chief_complaint,
                    a.type as appointment_type,
                    a.doctor_id,
                    p.full_name as doctor_name
                FROM encounters e
                LEFT JOIN appointments a ON e.appointment_id = a.id
                LEFT JOIN profiles p ON a.doctor_id = p.user_id
                WHERE e.created_at >= $1::timestamptz
                  AND e.created_at <= $2::timestamptz
                  AND ($3::uuid IS NULL OR a.doctor_id = $3)
                  AND ($4::text IS NULL OR a.type = $4)
            ),
            diagnoses_agg AS (
                SELECT
                    d.encounter_id,
                    string_agg(DISTINCT d.description, '; ') as diagnosis_summary,
                    string_agg(DISTINCT d.treatment_plan, '; ') as treatment_plan,
                    string_agg(DISTINCT d.recommended_surgeries, '; ') as recommended_surgeries,
                    string_agg(DISTINCT d.recommended_studies, '; ') as recommended_studies
                FROM diagnoses d
                GROUP BY d.encounter_id
            ),
            exam_od AS (
                SELECT
                    ee.encounter_id,
                    ee.avsc as od_avsc,
                    ee.avcc as od_avcc,
                    ee.pio as od_pio,
                    ee.autorefractor as od_autorefractor,
                    ee.lensometry as od_lensometry,
                    ee.keratometry as od_keratometry,
                    ee.subjective_refraction as od_subjective_refraction,
                    ee.final_prescription as od_final_prescription,
                    ee.slit_lamp as od_slit_lamp,
                    ee.fundus as od_fundus
                FROM exam_eye ee
                WHERE ee.eye = 'OD'
            ),
            exam_oi AS (
                SELECT
                    ee.encounter_id,
                    ee.avsc as oi_avsc,
                    ee.avcc as oi_avcc,
                    ee.pio as oi_pio,
                    ee.autorefractor as oi_autorefractor,
                    ee.lensometry as oi_lensometry,
                    ee.keratometry as oi_keratometry,
                    ee.subjective_refraction as oi_subjective_refraction,
                    ee.final_prescription as oi_final_prescription,
                    ee.slit_lamp as oi_slit_lamp,
                    ee.fundus as oi_fundus
                FROM exam_eye ee
                WHERE ee.eye = 'OI'
            ),
            surgeries_agg AS (
                SELECT
                    s.encounter_id,
                    st.name as surgery_type,
                    s.eye as surgery_eye,
                    s.surgery_date::text as surgery_date
                FROM surgeries s
                LEFT JOIN surgery_types st ON s.surgery_type_id = st.id
            ),
            procedures_agg AS (
                SELECT
                    pr.encounter_id,
                    pt.name as procedure_type,
                    pr.eye as procedure_eye
                FROM procedures pr
                LEFT JOIN procedure_types pt ON pr.procedure_type_id = pt.id
            ),
            studies_agg AS (
                SELECT
                    st.encounter_id,
                    sty.name as study_type,
                    st.status as study_status
                FROM studies st
                LEFT JOIN study_types sty ON st.study_type_id = sty.id
            )
            SELECT
                pt.id::text as patient_id,
                pt.code as patient_code,
                CONCAT(pt.first_name, ' ', pt.last_name) as patient_name,
                EXTRACT(YEAR FROM age(pt.birthdate))::integer as patient_age,
                pt.gender as patient_gender,
                COALESCE(pt.pathological_history->>'diabetes', 'false')::boolean as has_diabetes,
                COALESCE(pt.pathological_history->>'hipertension', 'false')::boolean as has_hta,
                eb.encounter_id::text,
                eb.encounter_date::text,
                eb.appointment_type,
                eb.doctor_name,
                eb.chief_complaint,
                da.diagnosis_summary,
                da.treatment_plan,
                da.recommended_surgeries,
                da.recommended_studies,
                eod.od_avsc,
                eod.od_avcc,
                eod.od_pio,
                eod.od_autorefractor,
                eod.od_lensometry,
                eod.od_keratometry,
                eod.od_subjective_refraction,
                eod.od_final_prescription,
                eod.od_slit_lamp,
                eod.od_fundus,
                eoi.oi_avsc,
                eoi.oi_avcc,
                eoi.oi_pio,
                eoi.oi_autorefractor,
                eoi.oi_lensometry,
                eoi.oi_keratometry,
                eoi.oi_subjective_refraction,
                eoi.oi_final_prescription,
                eoi.oi_slit_lamp,
                eoi.oi_fundus,
                sa.surgery_type,
                sa.surgery_eye,
                sa.surgery_date,
                pa.procedure_type,
                pa.procedure_eye,
                sta.study_type,
                sta.study_status
            FROM encounters_base eb
            JOIN patients pt ON eb.patient_id = pt.id
            LEFT JOIN diagnoses_agg da ON eb.encounter_id = da.encounter_id
            LEFT JOIN exam_od eod ON eb.encounter_id = eod.encounter_id
            LEFT JOIN exam_oi eoi ON eb.encounter_id = eoi.encounter_id
            LEFT JOIN surgeries_agg sa ON eb.encounter_id = sa.encounter_id
            LEFT JOIN procedures_agg pa ON eb.encounter_id = pa.encounter_id
            LEFT JOIN studies_agg sta ON eb.encounter_id = sta.encounter_id
            WHERE (
                $5::text IS NULL
                OR (
                    CASE $6::text
                        WHEN 'diagnosis' THEN COALESCE(da.diagnosis_summary, '') ILIKE '%' || $5 || '%'
                        WHEN 'treatment_plan' THEN COALESCE(da.treatment_plan, '') ILIKE '%' || $5 || '%'
                        WHEN 'surgeries' THEN COALESCE(da.recommended_surgeries, '') ILIKE '%' || $5 || '%'
                        WHEN 'studies' THEN COALESCE(da.recommended_studies, '') ILIKE '%' || $5 || '%'
                        WHEN 'chief_complaint' THEN COALESCE(eb.chief_complaint, '') ILIKE '%' || $5 || '%'
                        WHEN 'all' THEN (
                            COALESCE(da.diagnosis_summary, '') ILIKE '%' || $5 || '%'
                            OR COALESCE(da.treatment_plan, '') ILIKE '%' || $5 || '%'
                            OR COALESCE(da.recommended_surgeries, '') ILIKE '%' || $5 || '%'
                            OR COALESCE(da.recommended_studies, '') ILIKE '%' || $5 || '%'
                            OR COALESCE(eb.chief_complaint, '') ILIKE '%' || $5 || '%'
                        )
                        ELSE COALESCE(da.diagnosis_summary, '') ILIKE '%' || $5 || '%'
                    END
                )
            )
            AND ($7::text IS NULL OR sa.surgery_type ILIKE '%' || $7 || '%')
            AND ($8::integer IS NULL OR EXTRACT(YEAR FROM age(pt.birthdate)) >= $8)
            AND ($9::integer IS NULL OR EXTRACT(YEAR FROM age(pt.birthdate)) <= $9)
            AND ($10::text IS NULL OR pt.gender = $10)
            AND ($11::boolean IS NULL OR ($11 = true AND COALESCE(pt.pathological_history->>'diabetes', 'false')::boolean = true))
            AND ($12::boolean IS NULL OR ($12 = true AND COALESCE(pt.pathological_history->>'hipertension', 'false')::boolean = true))
            ORDER BY eb.encounter_date DESC
            LIMIT 1000
        "#;

        let rows = client
            .query(
                query,
                &[
                    &filters.start_date,
                    &filters.end_date,
                    &doctor_uuid,
                    &appointment_type_filter,
                    &diagnosis_filter,
                    &search_field_type,
                    &surgery_type_filter,
                    &filters.min_age,
                    &filters.max_age,
                    &filters.gender_filter,
                    &filters.has_diabetes,
                    &filters.has_hta,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::ClinicalResearchRow {
            patient_id: row.get(0),
            patient_code: row.get(1),
            patient_name: row.get(2),
            patient_age: row.get(3),
            patient_gender: row.get(4),
            has_diabetes: row.get(5),
            has_hta: row.get(6),
            encounter_id: row.get(7),
            encounter_date: row.get(8),
            appointment_type: row.get(9),
            doctor_name: row.get(10),
            chief_complaint: row.get(11),
            diagnosis_summary: row.get(12),
            treatment_plan: row.get(13),
            recommended_surgeries: row.get(14),
            recommended_studies: row.get(15),
            od_avsc: row.get(16),
            od_avcc: row.get(17),
            od_pio: row.get(18),
            od_autorefractor: row.get(19),
            od_lensometry: row.get(20),
            od_keratometry: row.get(21),
            od_subjective_refraction: row.get(22),
            od_final_prescription: row.get(23),
            od_slit_lamp: row.get(24),
            od_fundus: row.get(25),
            oi_avsc: row.get(26),
            oi_avcc: row.get(27),
            oi_pio: row.get(28),
            oi_autorefractor: row.get(29),
            oi_lensometry: row.get(30),
            oi_keratometry: row.get(31),
            oi_subjective_refraction: row.get(32),
            oi_final_prescription: row.get(33),
            oi_slit_lamp: row.get(34),
            oi_fundus: row.get(35),
            surgery_type: row.get(36),
            surgery_eye: row.get(37),
            surgery_date: row.get(38),
            procedure_type: row.get(39),
            procedure_eye: row.get(40),
            study_type: row.get(41),
            study_status: row.get(42),
        }).collect())
    }

    /// Get clinical research data grouped by patient
    pub async fn get_clinical_research_data_by_patient(&self, filters: &crate::commands::ResearchFilters) -> Result<Vec<crate::commands::ClinicalResearchPatient>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let doctor_uuid: Option<uuid::Uuid> = filters.doctor_filter.as_ref().and_then(|s| uuid::Uuid::parse_str(s).ok());
        let diagnosis_filter = filters.diagnosis_filter.clone();
        let search_field_type = filters.search_field_type.clone().unwrap_or_else(|| "diagnosis".to_string());
        let surgery_type_filter = filters.surgery_type_filter.clone();
        let appointment_type_filter = filters.appointment_type_filter.clone();

        // Query patients with their visits
        let query = r#"
            WITH filtered_encounters AS (
                SELECT
                    e.id as encounter_id,
                    e.patient_id,
                    e.created_at as encounter_date,
                    a.type as appointment_type,
                    p.full_name as doctor_name,
                    d.diagnosis_summary,
                    d.treatment_plan,
                    eod.od_avsc, eod.od_avcc, eod.od_pio,
                    eoi.oi_avsc, eoi.oi_avcc, eoi.oi_pio,
                    sa.surgery_type
                FROM encounters e
                LEFT JOIN appointments a ON e.appointment_id = a.id
                LEFT JOIN profiles p ON a.doctor_id = p.user_id
                LEFT JOIN LATERAL (
                    SELECT string_agg(DISTINCT description, '; ') as diagnosis_summary,
                           string_agg(DISTINCT treatment_plan, '; ') as treatment_plan,
                           string_agg(DISTINCT recommended_surgeries, '; ') as recommended_surgeries
                    FROM diagnoses WHERE encounter_id = e.id
                ) d ON true
                LEFT JOIN LATERAL (
                    SELECT avsc as od_avsc, avcc as od_avcc, pio as od_pio
                    FROM exam_eye WHERE encounter_id = e.id AND eye = 'OD' LIMIT 1
                ) eod ON true
                LEFT JOIN LATERAL (
                    SELECT avsc as oi_avsc, avcc as oi_avcc, pio as oi_pio
                    FROM exam_eye WHERE encounter_id = e.id AND eye = 'OI' LIMIT 1
                ) eoi ON true
                LEFT JOIN LATERAL (
                    SELECT st.name as surgery_type
                    FROM surgeries s
                    LEFT JOIN surgery_types st ON s.surgery_type_id = st.id
                    WHERE s.encounter_id = e.id LIMIT 1
                ) sa ON true
                WHERE e.created_at >= $1::timestamptz
                  AND e.created_at <= $2::timestamptz
                  AND ($3::uuid IS NULL OR a.doctor_id = $3)
                  AND ($4::text IS NULL OR a.type = $4)
                  AND (
                      $5::text IS NULL
                      OR (
                          CASE $6::text
                              WHEN 'diagnosis' THEN COALESCE(d.diagnosis_summary, '') ILIKE '%' || $5 || '%'
                              WHEN 'treatment_plan' THEN COALESCE(d.treatment_plan, '') ILIKE '%' || $5 || '%'
                              WHEN 'surgeries' THEN COALESCE(d.recommended_surgeries, '') ILIKE '%' || $5 || '%'
                              WHEN 'all' THEN (
                                  COALESCE(d.diagnosis_summary, '') ILIKE '%' || $5 || '%'
                                  OR COALESCE(d.treatment_plan, '') ILIKE '%' || $5 || '%'
                                  OR COALESCE(d.recommended_surgeries, '') ILIKE '%' || $5 || '%'
                              )
                              ELSE COALESCE(d.diagnosis_summary, '') ILIKE '%' || $5 || '%'
                          END
                      )
                  )
                  AND ($7::text IS NULL OR sa.surgery_type ILIKE '%' || $7 || '%')
            ),
            patient_visits AS (
                SELECT
                    fe.patient_id,
                    json_agg(
                        json_build_object(
                            'encounter_id', fe.encounter_id::text,
                            'encounter_date', fe.encounter_date::text,
                            'appointment_type', fe.appointment_type,
                            'doctor_name', fe.doctor_name,
                            'diagnosis_summary', fe.diagnosis_summary,
                            'treatment_plan', fe.treatment_plan,
                            'od_avsc', fe.od_avsc,
                            'od_avcc', fe.od_avcc,
                            'od_pio', fe.od_pio,
                            'oi_avsc', fe.oi_avsc,
                            'oi_avcc', fe.oi_avcc,
                            'oi_pio', fe.oi_pio
                        ) ORDER BY fe.encounter_date DESC
                    ) as visits,
                    COUNT(*)::integer as total_visits,
                    MIN(fe.encounter_date)::text as first_visit,
                    MAX(fe.encounter_date)::text as last_visit
                FROM filtered_encounters fe
                GROUP BY fe.patient_id
            )
            SELECT
                pt.id::text as patient_id,
                pt.code as patient_code,
                CONCAT(pt.first_name, ' ', pt.last_name) as patient_name,
                EXTRACT(YEAR FROM age(pt.birthdate))::integer as patient_age,
                pt.gender as patient_gender,
                COALESCE(pt.pathological_history->>'diabetes', 'false')::boolean as has_diabetes,
                COALESCE(pt.pathological_history->>'hipertension', 'false')::boolean as has_hta,
                pv.total_visits,
                pv.first_visit,
                pv.last_visit,
                pv.visits
            FROM patient_visits pv
            JOIN patients pt ON pv.patient_id = pt.id
            WHERE ($8::integer IS NULL OR EXTRACT(YEAR FROM age(pt.birthdate)) >= $8)
              AND ($9::integer IS NULL OR EXTRACT(YEAR FROM age(pt.birthdate)) <= $9)
              AND ($10::text IS NULL OR pt.gender = $10)
              AND ($11::boolean IS NULL OR ($11 = true AND COALESCE(pt.pathological_history->>'diabetes', 'false')::boolean = true))
              AND ($12::boolean IS NULL OR ($12 = true AND COALESCE(pt.pathological_history->>'hipertension', 'false')::boolean = true))
            ORDER BY pv.last_visit DESC
            LIMIT 500
        "#;

        let rows = client
            .query(
                query,
                &[
                    &filters.start_date,
                    &filters.end_date,
                    &doctor_uuid,
                    &appointment_type_filter,
                    &diagnosis_filter,
                    &search_field_type,
                    &surgery_type_filter,
                    &filters.min_age,
                    &filters.max_age,
                    &filters.gender_filter,
                    &filters.has_diabetes,
                    &filters.has_hta,
                ],
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| {
            let visits_json: Option<serde_json::Value> = row.get(10);
            let visits: Vec<crate::commands::PatientVisit> = visits_json
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();

            crate::commands::ClinicalResearchPatient {
                patient_id: row.get(0),
                patient_code: row.get(1),
                patient_name: row.get(2),
                patient_age: row.get(3),
                patient_gender: row.get(4),
                has_diabetes: row.get(5),
                has_hta: row.get(6),
                total_visits: row.get(7),
                first_visit: row.get(8),
                last_visit: row.get(9),
                visits,
            }
        }).collect())
    }

    // ============================================================
    // DOCTOR DETAIL DIALOG
    // ============================================================

    /// Get doctor activity detail (desglose completo de actividad)
    pub async fn get_doctor_activity_detail(
        &self,
        start_date: &str,
        end_date: &str,
        doctor_filter: &str,
        branch_filter: Option<&str>,
    ) -> Result<Vec<crate::commands::DoctorActivityDetail>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let doctor_uuid = uuid::Uuid::parse_str(doctor_filter).map_err(|e| e.to_string())?;
        let branch_uuid: Option<uuid::Uuid> = branch_filter.and_then(|s| uuid::Uuid::parse_str(s).ok());

        // Query similar to get_doctor_activity_detail_v4 RPC
        let query = r#"
            SELECT
                a.id::text as appointment_id,
                pt.code as patient_code,
                UPPER(COALESCE(pt.first_name, '') || ' ' || COALESCE(pt.last_name, '')) as patient_name,
                a.type as appointment_type,
                a.starts_at::text as appointment_date,
                CASE WHEN i.id IS NOT NULL AND i.status != 'cancelada' THEN true ELSE false END as is_invoiced,
                COALESCE(a.reason ILIKE '%cortesia%' OR a.reason ILIKE '%cortesía%', false) as is_courtesy,
                COALESCE(i.total_amount, 0)::float8 as invoice_amount,
                (SELECT st.name FROM surgeries s
                 JOIN surgery_types st ON s.surgery_type_id = st.id
                 JOIN encounters e ON s.encounter_id = e.id
                 WHERE e.appointment_id = a.id
                 LIMIT 1) as surgery_type,
                (SELECT pt2.name FROM procedures pr
                 JOIN procedure_types pt2 ON pr.procedure_type_id = pt2.id
                 JOIN encounters e ON pr.encounter_id = e.id
                 WHERE e.appointment_id = a.id
                 LIMIT 1) as procedure_type
            FROM appointments a
            LEFT JOIN patients pt ON a.patient_id = pt.id
            LEFT JOIN invoices i ON i.appointment_id = a.id AND i.status != 'cancelada'
            WHERE a.doctor_id = $1
              AND a.starts_at::date >= $2::date
              AND a.starts_at::date <= $3::date
              AND a.status = 'done'
              AND ($4::uuid IS NULL OR a.branch_id = $4)
            ORDER BY a.starts_at DESC
        "#;

        let rows = client
            .query(query, &[&doctor_uuid, &start_date, &end_date, &branch_uuid])
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::DoctorActivityDetail {
            appointment_id: row.get(0),
            patient_code: row.get(1),
            patient_name: row.get(2),
            appointment_type: row.get(3),
            appointment_date: row.get(4),
            is_invoiced: row.get(5),
            is_courtesy: row.get(6),
            invoice_amount: row.get(7),
            surgery_type: row.get(8),
            procedure_type: row.get(9),
        }).collect())
    }

    /// Get referred studies by doctor (estudios donde el doctor es el referidor)
    pub async fn get_referred_studies_by_doctor(
        &self,
        doctor_id: &str,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<crate::commands::ReferredStudy>, String> {
        let client = self.pool.get().await.map_err(|e| e.to_string())?;

        let doctor_uuid = uuid::Uuid::parse_str(doctor_id).map_err(|e| e.to_string())?;

        // First find the referring_doctor entry for this internal profile
        let ref_doc_row = client
            .query_opt(
                "SELECT id FROM referring_doctors WHERE internal_profile_id = $1",
                &[&doctor_uuid],
            )
            .await
            .map_err(|e| e.to_string())?;

        let ref_doc_id: Option<uuid::Uuid> = ref_doc_row.map(|r| r.get(0));

        if ref_doc_id.is_none() {
            return Ok(Vec::new());
        }

        let ref_doc_id = ref_doc_id.unwrap();

        // Query studies referred by this doctor
        let query = r#"
            SELECT
                s.id::text,
                s.study_type as title,
                (SELECT sf.side::text FROM study_files sf WHERE sf.study_id = s.id LIMIT 1) as eye_side,
                s.date::text as created_at,
                pt.code as patient_code,
                COALESCE(pt.first_name, '') as patient_first_name,
                COALESCE(pt.last_name, '') as patient_last_name,
                (SELECT COUNT(*)::int4 FROM study_files sf WHERE sf.study_id = s.id) as files_count
            FROM studies s
            LEFT JOIN patients pt ON s.patient_id = pt.id
            WHERE s.ordered_by = $1
              AND s.date >= $2::date
              AND s.date <= $3::date
            ORDER BY s.date DESC
        "#;

        let rows = client
            .query(query, &[&ref_doc_id, &start_date, &end_date])
            .await
            .map_err(|e| e.to_string())?;

        Ok(rows.iter().map(|row| crate::commands::ReferredStudy {
            id: row.get(0),
            title: row.get(1),
            eye_side: row.get(2),
            created_at: row.get::<_, Option<String>>(3).unwrap_or_default(),
            patient_code: row.get(4),
            patient_first_name: row.get(5),
            patient_last_name: row.get(6),
            files_count: row.get(7),
        }).collect())
    }
}
