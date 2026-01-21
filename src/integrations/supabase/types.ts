export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      appointments: {
        Row: {
          autorefractor: string | null
          branch_id: string
          created_at: string | null
          deleted_at: string | null
          doctor_id: string | null
          ends_at: string
          external_doctor_name: string | null
          id: string
          is_courtesy: boolean | null
          keratometry_od_axis: string | null
          keratometry_od_k1: string | null
          keratometry_od_k2: string | null
          keratometry_os_axis: string | null
          keratometry_os_k1: string | null
          keratometry_os_k2: string | null
          lensometry: string | null
          od_text: string | null
          os_text: string | null
          patient_id: string | null
          photo_od: string | null
          photo_oi: string | null
          pio_od: number | null
          pio_os: number | null
          post_op_type: string | null
          reason: string | null
          reception_notes: string | null
          room_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string | null
        }
        Insert: {
          autorefractor?: string | null
          branch_id: string
          created_at?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          ends_at: string
          external_doctor_name?: string | null
          id?: string
          is_courtesy?: boolean | null
          keratometry_od_axis?: string | null
          keratometry_od_k1?: string | null
          keratometry_od_k2?: string | null
          keratometry_os_axis?: string | null
          keratometry_os_k1?: string | null
          keratometry_os_k2?: string | null
          lensometry?: string | null
          od_text?: string | null
          os_text?: string | null
          patient_id?: string | null
          photo_od?: string | null
          photo_oi?: string | null
          pio_od?: number | null
          pio_os?: number | null
          post_op_type?: string | null
          reason?: string | null
          reception_notes?: string | null
          room_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string | null
        }
        Update: {
          autorefractor?: string | null
          branch_id?: string
          created_at?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          ends_at?: string
          external_doctor_name?: string | null
          id?: string
          is_courtesy?: boolean | null
          keratometry_od_axis?: string | null
          keratometry_od_k1?: string | null
          keratometry_od_k2?: string | null
          keratometry_os_axis?: string | null
          keratometry_os_k1?: string | null
          keratometry_os_k2?: string | null
          lensometry?: string | null
          od_text?: string | null
          os_text?: string | null
          patient_id?: string | null
          photo_od?: string | null
          photo_oi?: string | null
          pio_od?: number | null
          pio_os?: number | null
          post_op_type?: string | null
          reason?: string | null
          reception_notes?: string | null
          room_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          meta: Json | null
          target_id: string | null
          target_table: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          meta?: Json | null
          target_id?: string | null
          target_table?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          meta?: Json | null
          target_id?: string | null
          target_table?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_snapshots: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          snapshot_type: string
          table_counts: Json
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          snapshot_type: string
          table_counts: Json
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          snapshot_type?: string
          table_counts?: Json
        }
        Relationships: [
          {
            foreignKeyName: "backup_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          address: string | null
          code: Database["public"]["Enums"]["branch_code"] | null
          created_at: string
          id: string
          name: string
          pdf_header_url: string | null
          phone: string | null
          theme_primary_hsl: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          code?: Database["public"]["Enums"]["branch_code"] | null
          created_at?: string
          id?: string
          name: string
          pdf_header_url?: string | null
          phone?: string | null
          theme_primary_hsl?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          code?: Database["public"]["Enums"]["branch_code"] | null
          created_at?: string
          id?: string
          name?: string
          pdf_header_url?: string | null
          phone?: string | null
          theme_primary_hsl?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cash_closures: {
        Row: {
          branch_id: string
          cheque_total: number | null
          cirugias_count: number | null
          cirugias_total: number | null
          closed_by: string | null
          closure_date: string
          consultas_count: number | null
          consultas_total: number | null
          created_at: string | null
          detailed_data: Json | null
          efectivo_total: number | null
          estudios_count: number | null
          estudios_total: number | null
          id: string
          inventory_count: number | null
          inventory_total: number | null
          otro_total: number | null
          period_end: string
          period_start: string
          procedimientos_count: number | null
          procedimientos_total: number | null
          tarjeta_total: number | null
          total_collected: number
          total_discounts: number | null
          total_invoiced: number
          total_pending: number
          transferencia_total: number | null
        }
        Insert: {
          branch_id: string
          cheque_total?: number | null
          cirugias_count?: number | null
          cirugias_total?: number | null
          closed_by?: string | null
          closure_date?: string
          consultas_count?: number | null
          consultas_total?: number | null
          created_at?: string | null
          detailed_data?: Json | null
          efectivo_total?: number | null
          estudios_count?: number | null
          estudios_total?: number | null
          id?: string
          inventory_count?: number | null
          inventory_total?: number | null
          otro_total?: number | null
          period_end: string
          period_start: string
          procedimientos_count?: number | null
          procedimientos_total?: number | null
          tarjeta_total?: number | null
          total_collected?: number
          total_discounts?: number | null
          total_invoiced?: number
          total_pending?: number
          transferencia_total?: number | null
        }
        Update: {
          branch_id?: string
          cheque_total?: number | null
          cirugias_count?: number | null
          cirugias_total?: number | null
          closed_by?: string | null
          closure_date?: string
          consultas_count?: number | null
          consultas_total?: number | null
          created_at?: string | null
          detailed_data?: Json | null
          efectivo_total?: number | null
          estudios_count?: number | null
          estudios_total?: number | null
          id?: string
          inventory_count?: number | null
          inventory_total?: number | null
          otro_total?: number | null
          period_end?: string
          period_start?: string
          procedimientos_count?: number | null
          procedimientos_total?: number | null
          tarjeta_total?: number | null
          total_collected?: number
          total_discounts?: number | null
          total_invoiced?: number
          total_pending?: number
          transferencia_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_closures_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activity_log: {
        Row: {
          activity_type: string
          branch_id: string
          created_at: string
          created_by: string | null
          from_stage: string | null
          id: string
          pipeline_id: string
          reason: string | null
          to_stage: string | null
        }
        Insert: {
          activity_type: string
          branch_id: string
          created_at?: string
          created_by?: string | null
          from_stage?: string | null
          id?: string
          pipeline_id: string
          reason?: string | null
          to_stage?: string | null
        }
        Update: {
          activity_type?: string
          branch_id?: string
          created_at?: string
          created_by?: string | null
          from_stage?: string | null
          id?: string
          pipeline_id?: string
          reason?: string | null
          to_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_activity_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activity_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_activity_log_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activity_read: {
        Row: {
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_pipeline_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string
          pipeline_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          pipeline_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          pipeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_notes_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipeline_stages: {
        Row: {
          amount: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          pipeline_id: string
          stage_name: string
          stage_order: number
          status: string
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          pipeline_id: string
          stage_name: string
          stage_order?: number
          status?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          pipeline_id?: string
          stage_name?: string
          stage_order?: number
          status?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          branch_id: string
          cancellation_reason: string | null
          created_at: string
          created_by: string | null
          current_stage: string
          doctor_id: string | null
          eye_side: Database["public"]["Enums"]["eye_side"]
          id: string
          notes: string | null
          patient_id: string
          priority: string
          procedure_type_id: string
          status: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          doctor_id?: string | null
          eye_side?: Database["public"]["Enums"]["eye_side"]
          id?: string
          notes?: string | null
          patient_id: string
          priority?: string
          procedure_type_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          doctor_id?: string | null
          eye_side?: Database["public"]["Enums"]["eye_side"]
          id?: string
          notes?: string | null
          patient_id?: string
          priority?: string
          procedure_type_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_pipelines_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_pipelines_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_pipelines_procedure_type_id_fkey"
            columns: ["procedure_type_id"]
            isOneToOne: false
            referencedRelation: "crm_procedure_types"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_procedure_types: {
        Row: {
          active: boolean | null
          color: string
          created_at: string
          default_stages: Json
          display_order: number | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          color?: string
          created_at?: string
          default_stages?: Json
          display_order?: number | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          color?: string
          created_at?: string
          default_stages?: Json
          display_order?: number | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      diagnoses: {
        Row: {
          code: string | null
          created_at: string | null
          deleted_at: string | null
          encounter_id: string | null
          id: string
          label: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          encounter_id?: string | null
          id?: string
          label: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          encounter_id?: string | null
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnoses_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          created_by: string | null
          encounter_id: string
          file_path: string
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          encounter_id: string
          file_path: string
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          encounter_id?: string
          file_path?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "documents_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_function_settings: {
        Row: {
          created_at: string | null
          disabled_at: string | null
          disabled_by: string | null
          disabled_reason: string | null
          enabled: boolean
          function_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          enabled?: boolean
          function_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          enabled?: boolean
          function_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edge_function_settings_disabled_by_fkey"
            columns: ["disabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      encounters: {
        Row: {
          appointment_id: string | null
          cirugias: string | null
          created_at: string | null
          date: string | null
          deleted_at: string | null
          doctor_id: string | null
          estudios: string | null
          excursiones_od: string | null
          excursiones_os: string | null
          id: string
          interpretacion_resultados: string | null
          motivo_consulta: string | null
          patient_id: string | null
          plan_tratamiento: string | null
          proxima_cita: string | null
          summary: string | null
          type: Database["public"]["Enums"]["encounter_type"]
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          cirugias?: string | null
          created_at?: string | null
          date?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          estudios?: string | null
          excursiones_od?: string | null
          excursiones_os?: string | null
          id?: string
          interpretacion_resultados?: string | null
          motivo_consulta?: string | null
          patient_id?: string | null
          plan_tratamiento?: string | null
          proxima_cita?: string | null
          summary?: string | null
          type?: Database["public"]["Enums"]["encounter_type"]
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          cirugias?: string | null
          created_at?: string | null
          date?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          estudios?: string | null
          excursiones_od?: string | null
          excursiones_os?: string | null
          id?: string
          interpretacion_resultados?: string | null
          motivo_consulta?: string | null
          patient_id?: string | null
          plan_tratamiento?: string | null
          proxima_cita?: string | null
          summary?: string | null
          type?: Database["public"]["Enums"]["encounter_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encounters_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_eye: {
        Row: {
          av_cc: string | null
          av_sc: string | null
          created_at: string | null
          deleted_at: string | null
          encounter_id: string | null
          fundus: string | null
          id: string
          iop: number | null
          plan: string | null
          prescription_notes: string | null
          ref_axis: number | null
          ref_cyl: number | null
          ref_sphere: number | null
          ref_subj_av: string | null
          ref_subj_axis: number | null
          ref_subj_cyl: number | null
          ref_subj_sphere: number | null
          rx_add: number | null
          rx_axis: number | null
          rx_cyl: number | null
          rx_sphere: number | null
          side: Database["public"]["Enums"]["eye_side"]
          slit_lamp: string | null
          updated_at: string | null
        }
        Insert: {
          av_cc?: string | null
          av_sc?: string | null
          created_at?: string | null
          deleted_at?: string | null
          encounter_id?: string | null
          fundus?: string | null
          id?: string
          iop?: number | null
          plan?: string | null
          prescription_notes?: string | null
          ref_axis?: number | null
          ref_cyl?: number | null
          ref_sphere?: number | null
          ref_subj_av?: string | null
          ref_subj_axis?: number | null
          ref_subj_cyl?: number | null
          ref_subj_sphere?: number | null
          rx_add?: number | null
          rx_axis?: number | null
          rx_cyl?: number | null
          rx_sphere?: number | null
          side: Database["public"]["Enums"]["eye_side"]
          slit_lamp?: string | null
          updated_at?: string | null
        }
        Update: {
          av_cc?: string | null
          av_sc?: string | null
          created_at?: string | null
          deleted_at?: string | null
          encounter_id?: string | null
          fundus?: string | null
          id?: string
          iop?: number | null
          plan?: string | null
          prescription_notes?: string | null
          ref_axis?: number | null
          ref_cyl?: number | null
          ref_sphere?: number | null
          ref_subj_av?: string | null
          ref_subj_axis?: number | null
          ref_subj_cyl?: number | null
          ref_subj_sphere?: number | null
          rx_add?: number | null
          rx_axis?: number | null
          rx_cyl?: number | null
          rx_sphere?: number | null
          side?: Database["public"]["Enums"]["eye_side"]
          slit_lamp?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_eye_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          active: boolean
          branch_id: string
          category: string
          code: string | null
          cost_price: number | null
          created_at: string | null
          current_stock: number
          id: string
          min_stock: number | null
          name: string
          notes: string | null
          requires_lot: boolean
          supplier_id: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          branch_id: string
          category: string
          code?: string | null
          cost_price?: number | null
          created_at?: string | null
          current_stock?: number
          id?: string
          min_stock?: number | null
          name: string
          notes?: string | null
          requires_lot?: boolean
          supplier_id?: string | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          branch_id?: string
          category?: string
          code?: string | null
          cost_price?: number | null
          created_at?: string | null
          current_stock?: number
          id?: string
          min_stock?: number | null
          name?: string
          notes?: string | null
          requires_lot?: boolean
          supplier_id?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          cost_price: number | null
          created_at: string | null
          expiry_date: string | null
          id: string
          item_id: string
          lot_number: string
          quantity: number
        }
        Insert: {
          cost_price?: number | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          item_id: string
          lot_number: string
          quantity?: number
        }
        Update: {
          cost_price?: number | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          item_id?: string
          lot_number?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          branch_id: string
          created_at: string | null
          created_by: string | null
          id: string
          item_id: string
          lot_id: string | null
          movement_type: string
          notes: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_id: string
          lot_id?: string | null
          movement_type: string
          notes?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_id?: string
          lot_id?: string | null
          movement_type?: string
          notes?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          invoice_id: string | null
          item_id: string | null
          item_type: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          invoice_id?: string | null
          item_id?: string | null
          item_type: string
          quantity?: number
          subtotal: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          invoice_id?: string | null
          item_id?: string | null
          item_type?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          appointment_id: string | null
          balance_due: number
          branch_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          discount_reason: string | null
          discount_type: string | null
          discount_value: number | null
          id: string
          invoice_number: string
          notes: string | null
          patient_id: string | null
          status: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          balance_due?: number
          branch_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          discount_reason?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          invoice_number: string
          notes?: string | null
          patient_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          balance_due?: number
          branch_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          discount_reason?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          invoice_number?: string
          notes?: string | null
          patient_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          encounter_id: string
          id: string
          kind: Database["public"]["Enums"]["order_kind"]
          notes: string | null
          priority: Database["public"]["Enums"]["order_priority"]
          side: Database["public"]["Enums"]["eye_side"] | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          encounter_id: string
          id?: string
          kind: Database["public"]["Enums"]["order_kind"]
          notes?: string | null
          priority?: Database["public"]["Enums"]["order_priority"]
          side?: Database["public"]["Enums"]["eye_side"] | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          encounter_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["order_kind"]
          notes?: string | null
          priority?: Database["public"]["Enums"]["order_priority"]
          side?: Database["public"]["Enums"]["eye_side"] | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          allergies: string | null
          code: string | null
          created_at: string | null
          deleted_at: string | null
          diabetes: boolean | null
          dob: string | null
          email: string | null
          first_name: string
          hta: boolean | null
          id: string
          last_name: string
          notes: string | null
          occupation: string | null
          ophthalmic_history: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          allergies?: string | null
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          diabetes?: boolean | null
          dob?: string | null
          email?: string | null
          first_name: string
          hta?: boolean | null
          id?: string
          last_name: string
          notes?: string | null
          occupation?: string | null
          ophthalmic_history?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          allergies?: string | null
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          diabetes?: boolean | null
          dob?: string | null
          email?: string | null
          first_name?: string
          hta?: boolean | null
          id?: string
          last_name?: string
          notes?: string | null
          occupation?: string | null
          ophthalmic_history?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_method: string
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_method: string
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_method?: string
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_registrations: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          password_hash: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          specialty: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          password_hash: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          specialty?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          password_hash?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          specialty?: string | null
          status?: string
        }
        Relationships: []
      }
      procedure_types: {
        Row: {
          active: boolean | null
          created_at: string | null
          display_order: number | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      procedures: {
        Row: {
          consentimiento_informado: boolean
          created_at: string
          encounter_id: string
          id: string
          medicacion: string | null
          ojo_operar: Database["public"]["Enums"]["eye_side"]
          tipo_procedimiento: string
          updated_at: string
        }
        Insert: {
          consentimiento_informado?: boolean
          created_at?: string
          encounter_id: string
          id?: string
          medicacion?: string | null
          ojo_operar?: Database["public"]["Enums"]["eye_side"]
          tipo_procedimiento: string
          updated_at?: string
        }
        Update: {
          consentimiento_informado?: boolean
          created_at?: string
          encounter_id?: string
          id?: string
          medicacion?: string | null
          ojo_operar?: Database["public"]["Enums"]["eye_side"]
          tipo_procedimiento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedures_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          is_visible_in_dashboard: boolean
          specialty: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_visible_in_dashboard?: boolean
          specialty?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_visible_in_dashboard?: boolean
          specialty?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      results: {
        Row: {
          created_at: string | null
          extracted_summary: string | null
          file_path: string
          id: string
          mime_type: string | null
          order_id: string
          side: Database["public"]["Enums"]["eye_side"] | null
        }
        Insert: {
          created_at?: string | null
          extracted_summary?: string | null
          file_path: string
          id?: string
          mime_type?: string | null
          order_id: string
          side?: Database["public"]["Enums"]["eye_side"] | null
        }
        Update: {
          created_at?: string | null
          extracted_summary?: string | null
          file_path?: string
          id?: string
          mime_type?: string | null
          order_id?: string
          side?: Database["public"]["Enums"]["eye_side"] | null
        }
        Relationships: [
          {
            foreignKeyName: "results_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      room_inventory_categories: {
        Row: {
          active: boolean | null
          branch_id: string
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          branch_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          branch_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_inventory_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_inventory_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "room_inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      room_inventory_items: {
        Row: {
          active: boolean | null
          branch_id: string
          brand: string | null
          category_id: string
          code: string | null
          created_at: string | null
          current_stock: number
          id: string
          min_stock: number | null
          name: string
          notes: string | null
          specification: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          branch_id: string
          brand?: string | null
          category_id: string
          code?: string | null
          created_at?: string | null
          current_stock?: number
          id?: string
          min_stock?: number | null
          name: string
          notes?: string | null
          specification?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          branch_id?: string
          brand?: string | null
          category_id?: string
          code?: string | null
          created_at?: string | null
          current_stock?: number
          id?: string
          min_stock?: number | null
          name?: string
          notes?: string | null
          specification?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_inventory_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "room_inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      room_inventory_movements: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          item_id: string
          movement_type: string
          notes: string | null
          quantity: number
          user_id: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          item_id: string
          movement_type: string
          notes?: string | null
          quantity: number
          user_id?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          item_id?: string
          movement_type?: string
          notes?: string | null
          quantity?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_inventory_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "room_inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          active: boolean | null
          branch_id: string
          created_at: string | null
          id: string
          kind: Database["public"]["Enums"]["room_kind"]
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          branch_id: string
          created_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["room_kind"]
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          branch_id?: string
          created_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["room_kind"]
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          doctor_id: string | null
          ends_at: string
          id: string
          reason: string | null
          room_id: string | null
          starts_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          ends_at: string
          id?: string
          reason?: string | null
          room_id?: string | null
          starts_at: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          ends_at?: string
          id?: string
          reason?: string | null
          room_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      service_prices: {
        Row: {
          active: boolean
          created_at: string | null
          id: string
          price: number
          requires_deposit: boolean
          service_name: string
          service_type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          id?: string
          price: number
          requires_deposit?: boolean
          service_name: string
          service_type: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          id?: string
          price?: number
          requires_deposit?: boolean
          service_name?: string
          service_type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      referring_doctors: {
        Row: {
          id: string
          name: string
          is_internal: boolean | null
          internal_profile_id: string | null
          created_at: string | null
          active: boolean | null
        }
        Insert: {
          id?: string
          name: string
          is_internal?: boolean | null
          internal_profile_id?: string | null
          created_at?: string | null
          active?: boolean | null
        }
        Update: {
          id?: string
          name?: string
          is_internal?: boolean | null
          internal_profile_id?: string | null
          created_at?: string | null
          active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "referring_doctors_internal_profile_id_fkey"
            columns: ["internal_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      studies: {
        Row: {
          appointment_id: string | null
          comments: string | null
          created_at: string
          eye_side: Database["public"]["Enums"]["eye_side"]
          id: string
          patient_id: string
          referring_doctor_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          comments?: string | null
          created_at?: string
          eye_side?: Database["public"]["Enums"]["eye_side"]
          id?: string
          patient_id: string
          referring_doctor_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          comments?: string | null
          created_at?: string
          eye_side?: Database["public"]["Enums"]["eye_side"]
          id?: string
          patient_id?: string
          referring_doctor_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studies_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studies_referring_doctor_id_fkey"
            columns: ["referring_doctor_id"]
            isOneToOne: false
            referencedRelation: "referring_doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      study_files: {
        Row: {
          created_at: string
          file_path: string
          id: string
          mime_type: string | null
          study_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          mime_type?: string | null
          study_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_files_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_types: {
        Row: {
          active: boolean | null
          created_at: string | null
          display_order: number | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          contact_person: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      surgeries: {
        Row: {
          consentimiento_informado: boolean
          created_at: string
          encounter_id: string
          id: string
          medicacion: string | null
          nota_operatoria: string | null
          ojo_operar: Database["public"]["Enums"]["eye_side"]
          tipo_cirugia: string
          updated_at: string
        }
        Insert: {
          consentimiento_informado?: boolean
          created_at?: string
          encounter_id: string
          id?: string
          medicacion?: string | null
          nota_operatoria?: string | null
          ojo_operar?: Database["public"]["Enums"]["eye_side"]
          tipo_cirugia: string
          updated_at?: string
        }
        Update: {
          consentimiento_informado?: boolean
          created_at?: string
          encounter_id?: string
          id?: string
          medicacion?: string | null
          nota_operatoria?: string | null
          ojo_operar?: Database["public"]["Enums"]["eye_side"]
          tipo_cirugia?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surgeries_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      surgery_files: {
        Row: {
          created_at: string
          file_path: string
          id: string
          mime_type: string | null
          surgery_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          mime_type?: string | null
          surgery_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          surgery_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "surgery_files_surgery_id_fkey"
            columns: ["surgery_id"]
            isOneToOne: false
            referencedRelation: "surgeries"
            referencedColumns: ["id"]
          },
        ]
      }
      surgery_types: {
        Row: {
          active: boolean | null
          category: string
          created_at: string | null
          display_order: number | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          category: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          category?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          active: boolean | null
          body: Json
          created_at: string | null
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          body: Json
          created_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          body?: Json
          created_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_branches: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_exists: { Args: never; Returns: boolean }
      generate_invoice_number: { Args: never; Returns: string }
      generate_invoice_number_for_branch: {
        Args: { p_branch_id: string }
        Returns: string
      }
      get_clinical_research_data:
        | {
            Args: {
              appointment_type_filter?: Database["public"]["Enums"]["appointment_type"]
              diagnosis_filter?: string
              doctor_filter?: string
              end_date: string
              gender_filter?: string
              has_autorefractor?: boolean
              has_diabetes?: boolean
              has_fundus_photos?: boolean
              has_hta?: boolean
              has_keratometry?: boolean
              has_lensometry?: boolean
              has_pio?: boolean
              has_postop_data?: boolean
              has_preop_data?: boolean
              has_prescription?: boolean
              has_slit_lamp?: boolean
              has_subjective_refraction?: boolean
              has_visual_acuity?: boolean
              max_age?: number
              min_age?: number
              search_field_type?: string
              start_date: string
              surgery_type_filter?: string
            }
            Returns: {
              allergies: string
              appointment_id: string
              appointment_type: string
              autorefractor: string
              av_cc_od: string
              av_cc_os: string
              av_sc_od: string
              av_sc_os: string
              cirugias_recomendadas: string
              diagnosis_summary: string
              doctor_id: string
              doctor_name: string
              encounter_date: string
              encounter_id: string
              encounter_type: string
              estudios_recomendados: string
              excursiones_od: string
              excursiones_os: string
              fundus_od: string
              fundus_os: string
              has_diabetes_flag: boolean
              has_hta_flag: boolean
              has_postop_encounter: boolean
              keratometry_od_k1: string
              keratometry_od_k2: string
              keratometry_os_k1: string
              keratometry_os_k2: string
              lensometry: string
              motivo_consulta: string
              od_text: string
              ophthalmic_history: string
              os_text: string
              patient_age: number
              patient_code: string
              patient_gender: string
              patient_id: string
              patient_notes: string
              patient_occupation: string
              photo_od: string
              photo_oi: string
              pio_exam_od: number
              pio_exam_os: number
              pio_od_preconsult: number
              pio_os_preconsult: number
              plan_od: string
              plan_os: string
              plan_tratamiento: string
              prescription_notes_od: string
              prescription_notes_os: string
              procedure_consent: boolean
              procedure_eye: string
              procedure_id: string
              procedure_type: string
              proxima_cita: string
              ref_subj_av_od: string
              ref_subj_av_os: string
              ref_subj_axis_od: number
              ref_subj_axis_os: number
              ref_subj_cyl_od: number
              ref_subj_cyl_os: number
              ref_subj_sphere_od: number
              ref_subj_sphere_os: number
              rx_add_od: number
              rx_add_os: number
              rx_axis_od: number
              rx_axis_os: number
              rx_cyl_od: number
              rx_cyl_os: number
              rx_sphere_od: number
              rx_sphere_os: number
              slit_lamp_od: string
              slit_lamp_os: string
              studies_list: string
              surgery_consent: boolean
              surgery_eye: string
              surgery_id: string
              surgery_medication: string
              surgery_note: string
              surgery_type: string
            }[]
          }
        | {
            Args: {
              appointment_type_filter?: Database["public"]["Enums"]["appointment_type"]
              diagnosis_filter?: string
              doctor_filter?: string
              end_date: string
              gender_filter?: string
              has_autorefractor?: boolean
              has_diabetes?: boolean
              has_fundus_photos?: boolean
              has_hta?: boolean
              has_keratometry?: boolean
              has_lensometry?: boolean
              has_pio?: boolean
              has_postop_data?: boolean
              has_preop_data?: boolean
              has_prescription?: boolean
              has_slit_lamp?: boolean
              has_subjective_refraction?: boolean
              has_visual_acuity?: boolean
              max_age?: number
              min_age?: number
              start_date: string
              surgery_type_filter?: string
            }
            Returns: {
              allergies: string
              appointment_id: string
              appointment_type: string
              autorefractor: string
              av_cc_od: string
              av_cc_os: string
              av_sc_od: string
              av_sc_os: string
              cirugias_recomendadas: string
              diagnosis_summary: string
              doctor_id: string
              doctor_name: string
              encounter_date: string
              encounter_id: string
              encounter_type: string
              estudios_recomendados: string
              excursiones_od: string
              excursiones_os: string
              fundus_od: string
              fundus_os: string
              has_diabetes_flag: boolean
              has_hta_flag: boolean
              has_postop_encounter: boolean
              keratometry_od_k1: string
              keratometry_od_k2: string
              keratometry_os_k1: string
              keratometry_os_k2: string
              lensometry: string
              motivo_consulta: string
              od_text: string
              ophthalmic_history: string
              os_text: string
              patient_age: number
              patient_code: string
              patient_gender: string
              patient_id: string
              patient_notes: string
              patient_occupation: string
              photo_od: string
              photo_oi: string
              pio_exam_od: number
              pio_exam_os: number
              pio_od_preconsult: number
              pio_os_preconsult: number
              plan_od: string
              plan_os: string
              plan_tratamiento: string
              prescription_notes_od: string
              prescription_notes_os: string
              procedure_consent: boolean
              procedure_eye: string
              procedure_id: string
              procedure_type: string
              proxima_cita: string
              ref_subj_av_od: string
              ref_subj_av_os: string
              ref_subj_axis_od: number
              ref_subj_axis_os: number
              ref_subj_cyl_od: number
              ref_subj_cyl_os: number
              ref_subj_sphere_od: number
              ref_subj_sphere_os: number
              rx_add_od: number
              rx_add_os: number
              rx_axis_od: number
              rx_axis_os: number
              rx_cyl_od: number
              rx_cyl_os: number
              rx_sphere_od: number
              rx_sphere_os: number
              slit_lamp_od: string
              slit_lamp_os: string
              studies_list: string
              surgery_consent: boolean
              surgery_eye: string
              surgery_id: string
              surgery_medication: string
              surgery_note: string
              surgery_type: string
            }[]
          }
      get_clinical_research_data_by_patient:
        | {
            Args: {
              appointment_type_filter?: Database["public"]["Enums"]["appointment_type"]
              diagnosis_filter?: string
              doctor_filter?: string
              end_date: string
              gender_filter?: string
              has_autorefractor?: boolean
              has_diabetes?: boolean
              has_fundus_photos?: boolean
              has_hta?: boolean
              has_keratometry?: boolean
              has_lensometry?: boolean
              has_pio?: boolean
              has_postop_data?: boolean
              has_preop_data?: boolean
              has_prescription?: boolean
              has_slit_lamp?: boolean
              has_subjective_refraction?: boolean
              has_visual_acuity?: boolean
              max_age?: number
              min_age?: number
              search_field_type?: string
              start_date: string
              surgery_type_filter?: string
            }
            Returns: {
              allergies: string
              has_diabetes_flag: boolean
              has_hta_flag: boolean
              ophthalmic_history: string
              patient_age: number
              patient_code: string
              patient_gender: string
              patient_id: string
              patient_notes: string
              patient_occupation: string
              visits: Json
            }[]
          }
        | {
            Args: {
              appointment_type_filter?: Database["public"]["Enums"]["appointment_type"]
              diagnosis_filter?: string
              doctor_filter?: string
              end_date: string
              gender_filter?: string
              has_autorefractor?: boolean
              has_diabetes?: boolean
              has_fundus_photos?: boolean
              has_hta?: boolean
              has_keratometry?: boolean
              has_lensometry?: boolean
              has_pio?: boolean
              has_postop_data?: boolean
              has_preop_data?: boolean
              has_prescription?: boolean
              has_slit_lamp?: boolean
              has_subjective_refraction?: boolean
              has_visual_acuity?: boolean
              max_age?: number
              min_age?: number
              start_date: string
              surgery_type_filter?: string
            }
            Returns: {
              allergies: string
              has_diabetes_flag: boolean
              has_hta_flag: boolean
              ophthalmic_history: string
              patient_age: number
              patient_code: string
              patient_gender: string
              patient_id: string
              patient_notes: string
              patient_occupation: string
              visits: Json
            }[]
          }
      get_clinical_stats_with_revenue: {
        Args: { doctor_filter?: string; end_date: string; start_date: string }
        Returns: {
          cantidad: number
          doctor_id: string
          doctor_name: string
          pacientes_unicos: number
          revenue_estimado: number
          revenue_real: number
          revenue_total: number
          tipo_cita: string
        }[]
      }
      get_clinical_stats_with_revenue_v2: {
        Args: {
          branch_filter?: string
          doctor_filter?: string
          end_date: string
          start_date: string
        }
        Returns: {
          cantidad: number
          doctor_id: string
          doctor_name: string
          pacientes_unicos: number
          revenue_estimado: number
          revenue_real: number
          revenue_total: number
          tipo_cita: string
        }[]
      }
      get_doctor_activity_detail: {
        Args: {
          appointment_type_filter?: Database["public"]["Enums"]["appointment_type"]
          doctor_filter?: string
          end_date: string
          start_date: string
        }
        Returns: {
          appointment_date: string
          appointment_id: string
          appointment_type: string
          doctor_id: string
          doctor_name: string
          estimated_price: number
          invoice_amount: number
          invoice_id: string
          is_invoiced: boolean
          patient_code: string
          patient_id: string
          patient_name: string
          surgery_type: string
          total_revenue: number
        }[]
      }
      get_doctor_activity_detail_v2: {
        Args: {
          appointment_type_filter?: Database["public"]["Enums"]["appointment_type"]
          doctor_filter?: string
          end_date: string
          start_date: string
        }
        Returns: {
          appointment_date: string
          appointment_id: string
          appointment_type: string
          doctor_id: string
          doctor_name: string
          estimated_price: number
          invoice_amount: number
          invoice_id: string
          is_invoiced: boolean
          patient_code: string
          patient_id: string
          patient_name: string
          procedure_type: string
          surgery_type: string
          total_revenue: number
        }[]
      }
      get_doctor_activity_detail_v3:
        | {
            Args: {
              p_doctor_id: string
              p_end_date: string
              p_start_date: string
            }
            Returns: {
              appointment_date: string
              appointment_id: string
              appointment_status: string
              appointment_time: string
              appointment_type: string
              invoice_amount: number
              is_courtesy: boolean
              is_invoiced: boolean
              patient_code: string
              patient_name: string
            }[]
          }
        | {
            Args: {
              appointment_type_filter?: Database["public"]["Enums"]["appointment_type"]
              doctor_filter?: string
              end_date: string
              start_date: string
            }
            Returns: {
              appointment_date: string
              appointment_id: string
              appointment_type: string
              doctor_id: string
              doctor_name: string
              estimated_price: number
              invoice_amount: number
              invoice_id: string
              is_courtesy: boolean
              is_invoiced: boolean
              patient_code: string
              patient_id: string
              patient_name: string
              procedure_type: string
              surgery_type: string
              total_revenue: number
            }[]
          }
      get_doctor_activity_detail_v4: {
        Args: {
          branch_filter?: string
          doctor_filter?: string
          end_date: string
          start_date: string
        }
        Returns: {
          appointment_date: string
          appointment_id: string
          appointment_type: string
          invoice_amount: number
          is_courtesy: boolean
          is_invoiced: boolean
          patient_code: string
          patient_name: string
          procedure_type: string
          surgery_type: string
        }[]
      }
      get_inventory_details:
        | {
            Args: {
              branch_filter?: string
              end_date: string
              start_date: string
            }
            Returns: {
              cantidad: number
              category: string
              product_name: string
              total: number
            }[]
          }
        | {
            Args: { end_date: string; start_date: string }
            Returns: {
              cantidad: number
              category: string
              product_name: string
              total: number
            }[]
          }
        | {
            Args: {
              branch_filter?: string
              end_date: string
              start_date: string
            }
            Returns: {
              cantidad: number
              category: string
              product_name: string
              total: number
            }[]
          }
      get_inventory_details_v2: {
        Args: { branch_filter?: string; end_date: string; start_date: string }
        Returns: {
          item_id: string
          item_name: string
          total_quantity: number
          total_revenue: number
        }[]
      }
      get_inventory_details_v3: {
        Args: { branch_filter?: string; end_date: string; start_date: string }
        Returns: {
          cantidad: number
          category: string
          product_name: string
          total: number
        }[]
      }
      get_inventory_sales:
        | {
            Args: {
              branch_filter?: string
              end_date: string
              start_date: string
            }
            Returns: {
              cantidad: number
              category: string
              total: number
            }[]
          }
        | {
            Args: { end_date: string; start_date: string }
            Returns: {
              cantidad: number
              category: string
              total: number
            }[]
          }
      get_inventory_sales_v3: {
        Args: { branch_filter?: string; end_date: string; start_date: string }
        Returns: {
          cantidad: number
          category: string
          total: number
        }[]
      }
      get_payment_methods:
        | {
            Args: { end_date: string; start_date: string }
            Returns: {
              cantidad: number
              payment_method: string
              total: number
            }[]
          }
        | {
            Args: {
              branch_filter?: string
              end_date: string
              start_date: string
            }
            Returns: {
              cantidad: number
              payment_method: string
              total: number
            }[]
          }
      get_service_details:
        | {
            Args: { end_date: string; start_date: string }
            Returns: {
              cantidad: number
              service_name: string
              service_type: string
              total: number
            }[]
          }
        | {
            Args: {
              branch_filter?: string
              end_date: string
              start_date: string
            }
            Returns: {
              cantidad: number
              service_name: string
              service_type: string
              total: number
            }[]
          }
      get_service_details_v2: {
        Args: { branch_filter?: string; end_date: string; start_date: string }
        Returns: {
          item_id: string
          item_name: string
          total_quantity: number
          total_revenue: number
        }[]
      }
      get_service_sales: {
        Args: { branch_filter?: string; end_date: string; start_date: string }
        Returns: {
          cantidad: number
          service_type: string
          total: number
        }[]
      }
      get_storage_stats: { Args: never; Returns: Json }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_crm_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "doctor"
        | "nurse"
        | "reception"
        | "estudios"
        | "diagnostico"
        | "caja"
        | "contabilidad"
      appointment_status:
        | "scheduled"
        | "checked_in"
        | "done"
        | "cancelled"
        | "no_show"
        | "preconsulta_ready"
      appointment_type:
        | "consulta"
        | "diagnostico"
        | "cirugia"
        | "control"
        | "nueva_consulta"
        | "reconsulta_menos_3m"
        | "reconsulta_mas_3m"
        | "post_operado"
        | "lectura_resultados"
        | "cortesia"
        | "procedimiento"
        | "estudio"
      branch_code: "central" | "santa_lucia"
      document_kind: "receta" | "receta_lentes" | "orden_estudio"
      encounter_type: "consulta" | "posop" | "urgencia" | "quirurgico"
      eye_side: "OD" | "OI" | "OU"
      order_kind: "topografia" | "OCT" | "campovisual" | "biometria" | "otro"
      order_priority: "normal" | "alta" | "urgente"
      order_status: "ordered" | "done" | "reported" | "cancelled"
      room_kind: "consultorio" | "diagnostico" | "quirofano"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "doctor",
        "nurse",
        "reception",
        "estudios",
        "diagnostico",
        "caja",
        "contabilidad",
      ],
      appointment_status: [
        "scheduled",
        "checked_in",
        "done",
        "cancelled",
        "no_show",
        "preconsulta_ready",
      ],
      appointment_type: [
        "consulta",
        "diagnostico",
        "cirugia",
        "control",
        "nueva_consulta",
        "reconsulta_menos_3m",
        "reconsulta_mas_3m",
        "post_operado",
        "lectura_resultados",
        "cortesia",
        "procedimiento",
        "estudio",
      ],
      branch_code: ["central", "santa_lucia"],
      document_kind: ["receta", "receta_lentes", "orden_estudio"],
      encounter_type: ["consulta", "posop", "urgencia", "quirurgico"],
      eye_side: ["OD", "OI", "OU"],
      order_kind: ["topografia", "OCT", "campovisual", "biometria", "otro"],
      order_priority: ["normal", "alta", "urgente"],
      order_status: ["ordered", "done", "reported", "cancelled"],
      room_kind: ["consultorio", "diagnostico", "quirofano"],
    },
  },
} as const
