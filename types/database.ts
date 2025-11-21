Initialising login role...
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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_anomaly_logs: {
        Row: {
          alert_recipients: string[] | null
          alerts_sent: boolean | null
          cost_usd: number | null
          created_at: string | null
          critical_anomalies: Json | null
          critical_count: number
          detected_at: string
          detection_type: string
          execution_time_ms: number | null
          id: string
          info_anomalies: Json | null
          info_count: number
          items_analyzed: number
          model_used: string | null
          tokens_used: number | null
          updated_at: string | null
          warning_anomalies: Json | null
          warning_count: number
        }
        Insert: {
          alert_recipients?: string[] | null
          alerts_sent?: boolean | null
          cost_usd?: number | null
          created_at?: string | null
          critical_anomalies?: Json | null
          critical_count?: number
          detected_at?: string
          detection_type?: string
          execution_time_ms?: number | null
          id?: string
          info_anomalies?: Json | null
          info_count?: number
          items_analyzed?: number
          model_used?: string | null
          tokens_used?: number | null
          updated_at?: string | null
          warning_anomalies?: Json | null
          warning_count?: number
        }
        Update: {
          alert_recipients?: string[] | null
          alerts_sent?: boolean | null
          cost_usd?: number | null
          created_at?: string | null
          critical_anomalies?: Json | null
          critical_count?: number
          detected_at?: string
          detection_type?: string
          execution_time_ms?: number | null
          id?: string
          info_anomalies?: Json | null
          info_count?: number
          items_analyzed?: number
          model_used?: string | null
          tokens_used?: number | null
          updated_at?: string | null
          warning_anomalies?: Json | null
          warning_count?: number
        }
        Relationships: []
      }
      ai_consolidation_opportunities: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          confidence_score: number | null
          cost_usd: number | null
          created_at: string | null
          current_order_total: number | null
          id: string
          identified_at: string
          model_used: string | null
          opportunity_type: string
          potential_savings: number
          recommended_items: Json | null
          rejection_reason: string | null
          shipping_threshold: number | null
          status: string | null
          updated_at: string | null
          urgency: string | null
          valid_until: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          confidence_score?: number | null
          cost_usd?: number | null
          created_at?: string | null
          current_order_total?: number | null
          id?: string
          identified_at?: string
          model_used?: string | null
          opportunity_type: string
          potential_savings: number
          recommended_items?: Json | null
          rejection_reason?: string | null
          shipping_threshold?: number | null
          status?: string | null
          updated_at?: string | null
          urgency?: string | null
          valid_until?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          confidence_score?: number | null
          cost_usd?: number | null
          created_at?: string | null
          current_order_total?: number | null
          id?: string
          identified_at?: string
          model_used?: string | null
          opportunity_type?: string
          potential_savings?: number
          recommended_items?: Json | null
          rejection_reason?: string | null
          shipping_threshold?: number | null
          status?: string | null
          updated_at?: string | null
          urgency?: string | null
          valid_until?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_consolidation_opportunities_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "ai_consolidation_opportunities_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_consolidation_opportunities_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_job_logs: {
        Row: {
          completed_at: string | null
          cost_breakdown: Json | null
          created_at: string | null
          error_message: string | null
          error_stack: string | null
          execution_time_ms: number | null
          id: string
          job_name: string
          job_type: string
          jobs_completed: number | null
          started_at: string
          status: string
          total_cost_usd: number | null
          triggered_by: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          cost_breakdown?: Json | null
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          execution_time_ms?: number | null
          id?: string
          job_name: string
          job_type: string
          jobs_completed?: number | null
          started_at?: string
          status?: string
          total_cost_usd?: number | null
          triggered_by?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          cost_breakdown?: Json | null
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          execution_time_ms?: number | null
          id?: string
          job_name?: string
          job_type?: string
          jobs_completed?: number | null
          started_at?: string
          status?: string
          total_cost_usd?: number | null
          triggered_by?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_purchasing_costs: {
        Row: {
          calls_count: number | null
          cost_usd: number
          created_at: string | null
          date: string
          error_message: string | null
          execution_time_ms: number | null
          id: string
          input_tokens: number
          model_name: string
          output_tokens: number
          provider: string | null
          service_name: string
          success: boolean | null
          total_tokens: number
        }
        Insert: {
          calls_count?: number | null
          cost_usd?: number
          created_at?: string | null
          date?: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_tokens?: number
          model_name: string
          output_tokens?: number
          provider?: string | null
          service_name: string
          success?: boolean | null
          total_tokens?: number
        }
        Update: {
          calls_count?: number | null
          cost_usd?: number
          created_at?: string | null
          date?: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_tokens?: number
          model_name?: string
          output_tokens?: number
          provider?: string | null
          service_name?: string
          success?: boolean | null
          total_tokens?: number
        }
        Relationships: []
      }
      ai_purchasing_insights: {
        Row: {
          affected_pos: string[] | null
          affected_skus: string[] | null
          affected_vendors: string[] | null
          category: string | null
          confidence_score: number | null
          cost_usd: number | null
          created_at: string | null
          detailed_analysis: Json | null
          dismissed: boolean | null
          dismissed_at: string | null
          dismissed_reason: string | null
          estimated_impact_usd: number | null
          generated_at: string
          id: string
          impact_type: string | null
          input_data_hash: string | null
          insight_type: string
          model_used: string | null
          priority: string | null
          recommendations: Json | null
          stale: boolean | null
          summary: string
          title: string
          updated_at: string | null
          valid_until: string | null
          viewed: boolean | null
          viewed_at: string | null
          viewed_by: string | null
        }
        Insert: {
          affected_pos?: string[] | null
          affected_skus?: string[] | null
          affected_vendors?: string[] | null
          category?: string | null
          confidence_score?: number | null
          cost_usd?: number | null
          created_at?: string | null
          detailed_analysis?: Json | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          dismissed_reason?: string | null
          estimated_impact_usd?: number | null
          generated_at?: string
          id?: string
          impact_type?: string | null
          input_data_hash?: string | null
          insight_type: string
          model_used?: string | null
          priority?: string | null
          recommendations?: Json | null
          stale?: boolean | null
          summary: string
          title: string
          updated_at?: string | null
          valid_until?: string | null
          viewed?: boolean | null
          viewed_at?: string | null
          viewed_by?: string | null
        }
        Update: {
          affected_pos?: string[] | null
          affected_skus?: string[] | null
          affected_vendors?: string[] | null
          category?: string | null
          confidence_score?: number | null
          cost_usd?: number | null
          created_at?: string | null
          detailed_analysis?: Json | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          dismissed_reason?: string | null
          estimated_impact_usd?: number | null
          generated_at?: string
          id?: string
          impact_type?: string | null
          input_data_hash?: string | null
          insight_type?: string
          model_used?: string | null
          priority?: string | null
          recommendations?: Json | null
          stale?: boolean | null
          summary?: string
          title?: string
          updated_at?: string | null
          valid_until?: string | null
          viewed?: boolean | null
          viewed_at?: string | null
          viewed_by?: string | null
        }
        Relationships: []
      }
      ai_vendor_email_cache: {
        Row: {
          applied_to_po: boolean | null
          backorder_skus: string[] | null
          carrier: string | null
          cost_usd: number | null
          created_at: string | null
          email_body: string | null
          email_from: string
          email_subject: string | null
          expected_delivery: string | null
          extracted: boolean | null
          extraction_confidence: number | null
          id: string
          model_used: string | null
          po_id: string | null
          po_number: string | null
          received_at: string
          tracking_number: string | null
          updated_at: string | null
          vendor_notes: string | null
        }
        Insert: {
          applied_to_po?: boolean | null
          backorder_skus?: string[] | null
          carrier?: string | null
          cost_usd?: number | null
          created_at?: string | null
          email_body?: string | null
          email_from: string
          email_subject?: string | null
          expected_delivery?: string | null
          extracted?: boolean | null
          extraction_confidence?: number | null
          id?: string
          model_used?: string | null
          po_id?: string | null
          po_number?: string | null
          received_at?: string
          tracking_number?: string | null
          updated_at?: string | null
          vendor_notes?: string | null
        }
        Update: {
          applied_to_po?: boolean | null
          backorder_skus?: string[] | null
          carrier?: string | null
          cost_usd?: number | null
          created_at?: string | null
          email_body?: string | null
          email_from?: string
          email_subject?: string | null
          expected_delivery?: string | null
          extracted?: boolean | null
          extraction_confidence?: number | null
          id?: string
          model_used?: string | null
          po_id?: string | null
          po_number?: string | null
          received_at?: string
          tracking_number?: string | null
          updated_at?: string | null
          vendor_notes?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string | null
          description: string | null
          display_name: string | null
          id: string
          is_sensitive: boolean | null
          setting_category: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          is_sensitive?: boolean | null
          setting_category: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          is_sensitive?: boolean | null
          setting_category?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      artwork_folders: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          name: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "artwork_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artwork_folders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_fields: string[] | null
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string
          session_id: string | null
          table_name: string
          timestamp: string
          transaction_id: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          session_id?: string | null
          table_name: string
          timestamp?: string
          transaction_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          session_id?: string | null
          table_name?: string
          timestamp?: string
          transaction_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      boms: {
        Row: {
          artwork: Json
          average_cost: number | null
          barcode: string | null
          build_time_minutes: number | null
          category: string | null
          compliance_last_checked: string | null
          compliance_status: string | null
          components: Json
          created_at: string
          created_by: string | null
          data_source: string | null
          deleted_at: string | null
          description: string | null
          expiring_registrations_count: number | null
          finished_sku: string
          id: string
          is_deleted: boolean
          labor_cost_per_hour: number | null
          last_sync_at: string | null
          name: string
          packaging: Json
          potential_build_qty: number | null
          primary_data_sheet_id: string | null
          primary_label_id: string | null
          production_notes: string | null
          sync_status: string | null
          total_state_registrations: number | null
          updated_at: string
          updated_by: string | null
          version: number
          yield_quantity: number | null
        }
        Insert: {
          artwork?: Json
          average_cost?: number | null
          barcode?: string | null
          build_time_minutes?: number | null
          category?: string | null
          compliance_last_checked?: string | null
          compliance_status?: string | null
          components?: Json
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          deleted_at?: string | null
          description?: string | null
          expiring_registrations_count?: number | null
          finished_sku: string
          id?: string
          is_deleted?: boolean
          labor_cost_per_hour?: number | null
          last_sync_at?: string | null
          name: string
          packaging?: Json
          potential_build_qty?: number | null
          primary_data_sheet_id?: string | null
          primary_label_id?: string | null
          production_notes?: string | null
          sync_status?: string | null
          total_state_registrations?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          yield_quantity?: number | null
        }
        Update: {
          artwork?: Json
          average_cost?: number | null
          barcode?: string | null
          build_time_minutes?: number | null
          category?: string | null
          compliance_last_checked?: string | null
          compliance_status?: string | null
          components?: Json
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          deleted_at?: string | null
          description?: string | null
          expiring_registrations_count?: number | null
          finished_sku?: string
          id?: string
          is_deleted?: boolean
          labor_cost_per_hour?: number | null
          last_sync_at?: string | null
          name?: string
          packaging?: Json
          potential_build_qty?: number | null
          primary_data_sheet_id?: string | null
          primary_label_id?: string | null
          production_notes?: string | null
          sync_status?: string | null
          total_state_registrations?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          yield_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "boms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: true
            referencedRelation: "inventory_details"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "boms_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "boms_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: true
            referencedRelation: "inventory_trends"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "boms_primary_data_sheet_id_fkey"
            columns: ["primary_data_sheet_id"]
            isOneToOne: false
            referencedRelation: "product_data_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_primary_label_id_fkey"
            columns: ["primary_label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      build_order_status_transitions: {
        Row: {
          from_status: string
          requires_role: string | null
          to_status: string
        }
        Insert: {
          from_status: string
          requires_role?: string | null
          to_status: string
        }
        Update: {
          from_status?: string
          requires_role?: string | null
          to_status?: string
        }
        Relationships: []
      }
      build_orders: {
        Row: {
          assigned_to: string | null
          bom_id: string
          build_number: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          finished_sku: string
          id: string
          is_deleted: boolean
          notes: string | null
          quantity: number
          scheduled_date: string | null
          started_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          assigned_to?: string | null
          bom_id: string
          build_number: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finished_sku: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          quantity: number
          scheduled_date?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          assigned_to?: string | null
          bom_id?: string
          build_number?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finished_sku?: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          quantity?: number
          scheduled_date?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "build_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms_with_compliance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "compliance_dashboard"
            referencedColumns: ["bom_id"]
          },
          {
            foreignKeyName: "build_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_orders_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: false
            referencedRelation: "inventory_details"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "build_orders_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "build_orders_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: false
            referencedRelation: "inventory_trends"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "build_orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          id: string
          logo_url: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          tax_rate: number | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tax_rate?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tax_rate?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      compliance_checks: {
        Row: {
          action_items: Json[] | null
          action_items_completed: boolean | null
          ai_analysis_notes: string | null
          ai_confidence_score: number | null
          ai_model_used: string | null
          artwork_id: string | null
          bom_id: string | null
          categories_checked: string[] | null
          check_date: string | null
          check_tier: string | null
          compliance_score: number | null
          created_at: string | null
          created_by: string | null
          extracted_claims: string[] | null
          extracted_ingredients: string[] | null
          extracted_text: Json | null
          extracted_warnings: string[] | null
          id: string
          industry: string | null
          label_id: string | null
          net_weight: string | null
          overall_status: string
          product_name: string | null
          product_type: string | null
          prompt_template_used: string | null
          recommendations: Json[] | null
          resolved_at: string | null
          resolved_by: string | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string | null
          states_checked: string[]
          updated_at: string | null
          user_id: string | null
          violations: Json[] | null
          warnings: Json[] | null
        }
        Insert: {
          action_items?: Json[] | null
          action_items_completed?: boolean | null
          ai_analysis_notes?: string | null
          ai_confidence_score?: number | null
          ai_model_used?: string | null
          artwork_id?: string | null
          bom_id?: string | null
          categories_checked?: string[] | null
          check_date?: string | null
          check_tier?: string | null
          compliance_score?: number | null
          created_at?: string | null
          created_by?: string | null
          extracted_claims?: string[] | null
          extracted_ingredients?: string[] | null
          extracted_text?: Json | null
          extracted_warnings?: string[] | null
          id?: string
          industry?: string | null
          label_id?: string | null
          net_weight?: string | null
          overall_status: string
          product_name?: string | null
          product_type?: string | null
          prompt_template_used?: string | null
          recommendations?: Json[] | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          states_checked: string[]
          updated_at?: string | null
          user_id?: string | null
          violations?: Json[] | null
          warnings?: Json[] | null
        }
        Update: {
          action_items?: Json[] | null
          action_items_completed?: boolean | null
          ai_analysis_notes?: string | null
          ai_confidence_score?: number | null
          ai_model_used?: string | null
          artwork_id?: string | null
          bom_id?: string | null
          categories_checked?: string[] | null
          check_date?: string | null
          check_tier?: string | null
          compliance_score?: number | null
          created_at?: string | null
          created_by?: string | null
          extracted_claims?: string[] | null
          extracted_ingredients?: string[] | null
          extracted_text?: Json | null
          extracted_warnings?: string[] | null
          id?: string
          industry?: string | null
          label_id?: string | null
          net_weight?: string | null
          overall_status?: string
          product_name?: string | null
          product_type?: string | null
          prompt_template_used?: string | null
          recommendations?: Json[] | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          states_checked?: string[]
          updated_at?: string | null
          user_id?: string | null
          violations?: Json[] | null
          warnings?: Json[] | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checks_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_records: {
        Row: {
          additional_documents: Json | null
          alert_email_addresses: string[] | null
          assigned_to: string | null
          authority_website: string | null
          bom_id: string
          category: string | null
          certificate_file_name: string | null
          certificate_file_size: number | null
          certificate_url: string | null
          compliance_type: string
          conditions: Json | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          days_until_expiration: number | null
          due_soon_alert_sent: boolean | null
          effective_date: string | null
          expiration_alert_sent: boolean | null
          expiration_date: string | null
          id: string
          internal_notes: string | null
          issuing_authority: string | null
          label_id: string | null
          last_renewed_date: string | null
          last_verified_at: string | null
          last_verified_by: string | null
          late_fee: number | null
          license_number: string | null
          notes: string | null
          payment_status: string | null
          priority: string | null
          registered_date: string | null
          registration_fee: number | null
          registration_number: string
          renewal_date: string | null
          renewal_fee: number | null
          requirements: string | null
          restrictions: string | null
          state_code: string | null
          state_name: string | null
          status: string | null
          updated_at: string | null
          urgent_alert_sent: boolean | null
        }
        Insert: {
          additional_documents?: Json | null
          alert_email_addresses?: string[] | null
          assigned_to?: string | null
          authority_website?: string | null
          bom_id: string
          category?: string | null
          certificate_file_name?: string | null
          certificate_file_size?: number | null
          certificate_url?: string | null
          compliance_type: string
          conditions?: Json | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          days_until_expiration?: number | null
          due_soon_alert_sent?: boolean | null
          effective_date?: string | null
          expiration_alert_sent?: boolean | null
          expiration_date?: string | null
          id?: string
          internal_notes?: string | null
          issuing_authority?: string | null
          label_id?: string | null
          last_renewed_date?: string | null
          last_verified_at?: string | null
          last_verified_by?: string | null
          late_fee?: number | null
          license_number?: string | null
          notes?: string | null
          payment_status?: string | null
          priority?: string | null
          registered_date?: string | null
          registration_fee?: number | null
          registration_number: string
          renewal_date?: string | null
          renewal_fee?: number | null
          requirements?: string | null
          restrictions?: string | null
          state_code?: string | null
          state_name?: string | null
          status?: string | null
          updated_at?: string | null
          urgent_alert_sent?: boolean | null
        }
        Update: {
          additional_documents?: Json | null
          alert_email_addresses?: string[] | null
          assigned_to?: string | null
          authority_website?: string | null
          bom_id?: string
          category?: string | null
          certificate_file_name?: string | null
          certificate_file_size?: number | null
          certificate_url?: string | null
          compliance_type?: string
          conditions?: Json | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          days_until_expiration?: number | null
          due_soon_alert_sent?: boolean | null
          effective_date?: string | null
          expiration_alert_sent?: boolean | null
          expiration_date?: string | null
          id?: string
          internal_notes?: string | null
          issuing_authority?: string | null
          label_id?: string | null
          last_renewed_date?: string | null
          last_verified_at?: string | null
          last_verified_by?: string | null
          late_fee?: number | null
          license_number?: string | null
          notes?: string | null
          payment_status?: string | null
          priority?: string | null
          registered_date?: string | null
          registration_fee?: number | null
          registration_number?: string
          renewal_date?: string | null
          renewal_fee?: number | null
          requirements?: string | null
          restrictions?: string | null
          state_code?: string | null
          state_name?: string | null
          status?: string | null
          updated_at?: string | null
          urgent_alert_sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_compliance_assigned_to"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compliance_bom_id"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compliance_bom_id"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms_with_compliance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compliance_bom_id"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "compliance_dashboard"
            referencedColumns: ["bom_id"]
          },
          {
            foreignKeyName: "fk_compliance_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compliance_label_id"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compliance_last_verified_by"
            columns: ["last_verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          ai_generated: boolean | null
          approved_at: string | null
          approved_by: string | null
          body_template: string
          created_at: string | null
          id: string
          is_default: boolean | null
          signature: string | null
          subject_line: string
          template_name: string
          template_type: string
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          body_template: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          signature?: string | null
          subject_line: string
          template_name: string
          template_type: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          body_template?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          signature?: string | null
          subject_line?: string
          template_name?: string
          template_type?: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "email_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      external_data_sources: {
        Row: {
          created_at: string | null
          credentials: Json
          description: string | null
          display_name: string
          field_mappings: Json | null
          id: string
          is_deleted: boolean | null
          last_request_at: string | null
          last_sync_at: string | null
          last_sync_duration_ms: number | null
          requests_this_hour: number | null
          requests_this_minute: number | null
          source_type: Database["public"]["Enums"]["source_type"]
          sync_enabled: boolean | null
          sync_error: string | null
          sync_frequency: Database["public"]["Enums"]["sync_frequency"] | null
          sync_status: Database["public"]["Enums"]["sync_status"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credentials: Json
          description?: string | null
          display_name: string
          field_mappings?: Json | null
          id?: string
          is_deleted?: boolean | null
          last_request_at?: string | null
          last_sync_at?: string | null
          last_sync_duration_ms?: number | null
          requests_this_hour?: number | null
          requests_this_minute?: number | null
          source_type: Database["public"]["Enums"]["source_type"]
          sync_enabled?: boolean | null
          sync_error?: string | null
          sync_frequency?: Database["public"]["Enums"]["sync_frequency"] | null
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credentials?: Json
          description?: string | null
          display_name?: string
          field_mappings?: Json | null
          id?: string
          is_deleted?: boolean | null
          last_request_at?: string | null
          last_sync_at?: string | null
          last_sync_duration_ms?: number | null
          requests_this_hour?: number | null
          requests_this_minute?: number | null
          source_type?: Database["public"]["Enums"]["source_type"]
          sync_enabled?: boolean | null
          sync_error?: string | null
          sync_frequency?: Database["public"]["Enums"]["sync_frequency"] | null
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      extraction_prompts: {
        Row: {
          average_confidence: number | null
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          example_urls: string[] | null
          id: string
          is_active: boolean | null
          last_tested_at: string | null
          last_used_at: string | null
          max_tokens: number | null
          name: string
          prompt_template: string
          recommended_model: string | null
          search_keywords: string[] | null
          success_rate: number | null
          supersedes: string | null
          system_message: string | null
          target_category: string | null
          target_state: string | null
          temperature: number | null
          test_results: Json | null
          times_used: number | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          average_confidence?: number | null
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          example_urls?: string[] | null
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          last_used_at?: string | null
          max_tokens?: number | null
          name: string
          prompt_template: string
          recommended_model?: string | null
          search_keywords?: string[] | null
          success_rate?: number | null
          supersedes?: string | null
          system_message?: string | null
          target_category?: string | null
          target_state?: string | null
          temperature?: number | null
          test_results?: Json | null
          times_used?: number | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          average_confidence?: number | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          example_urls?: string[] | null
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          last_used_at?: string | null
          max_tokens?: number | null
          name?: string
          prompt_template?: string
          recommended_model?: string | null
          search_keywords?: string[] | null
          success_rate?: number | null
          supersedes?: string | null
          system_message?: string | null
          target_category?: string | null
          target_state?: string | null
          temperature?: number | null
          test_results?: Json | null
          times_used?: number | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_prompts_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "extraction_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      finale_sync_log: {
        Row: {
          completed_at: string | null
          direction: string
          duration_ms: number | null
          entity_id: string | null
          entity_type: string
          error_details: Json | null
          error_message: string | null
          id: string
          operation: string
          records_processed: number | null
          request_data: Json | null
          response_data: Json | null
          started_at: string
          status: string
          sync_source: string | null
          sync_type: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          direction: string
          duration_ms?: number | null
          entity_id?: string | null
          entity_type: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          operation: string
          records_processed?: number | null
          request_data?: Json | null
          response_data?: Json | null
          started_at?: string
          status: string
          sync_source?: string | null
          sync_type: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          direction?: string
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          operation?: string
          records_processed?: number | null
          request_data?: Json | null
          response_data?: Json | null
          started_at?: string
          status?: string
          sync_source?: string | null
          sync_type?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      forecast_accuracy: {
        Row: {
          absolute_error: number | null
          actual_quantity: number | null
          actual_recorded_at: string | null
          confidence_score: number | null
          created_at: string | null
          forecast_date: string
          forecast_method: string | null
          forecast_quantity: number
          id: string
          inventory_sku: string
          percentage_error: number | null
          target_date: string
          updated_at: string | null
        }
        Insert: {
          absolute_error?: number | null
          actual_quantity?: number | null
          actual_recorded_at?: string | null
          confidence_score?: number | null
          created_at?: string | null
          forecast_date: string
          forecast_method?: string | null
          forecast_quantity: number
          id?: string
          inventory_sku: string
          percentage_error?: number | null
          target_date: string
          updated_at?: string | null
        }
        Update: {
          absolute_error?: number | null
          actual_quantity?: number | null
          actual_recorded_at?: string | null
          confidence_score?: number | null
          created_at?: string | null
          forecast_date?: string
          forecast_method?: string | null
          forecast_quantity?: number
          id?: string
          inventory_sku?: string
          percentage_error?: number | null
          target_date?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      industry_settings: {
        Row: {
          common_certifications: string[]
          created_at: string | null
          default_product_types: string[]
          description: string | null
          display_name: string
          example_violations: string[] | null
          focus_areas: string[]
          icon: string | null
          id: string
          industry: string
          industry_prompt_context: string
          search_keywords: string[]
        }
        Insert: {
          common_certifications: string[]
          created_at?: string | null
          default_product_types: string[]
          description?: string | null
          display_name: string
          example_violations?: string[] | null
          focus_areas: string[]
          icon?: string | null
          id?: string
          industry: string
          industry_prompt_context: string
          search_keywords: string[]
        }
        Update: {
          common_certifications?: string[]
          created_at?: string | null
          default_product_types?: string[]
          description?: string | null
          display_name?: string
          example_violations?: string[] | null
          focus_areas?: string[]
          icon?: string | null
          id?: string
          industry?: string
          industry_prompt_context?: string
          search_keywords?: string[]
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          bin_location: string | null
          category: string
          created_at: string
          created_by: string | null
          currency: string | null
          data_source: string | null
          deleted_at: string | null
          description: string | null
          dimensions: string | null
          external_id: string | null
          facility_id: string | null
          is_deleted: boolean
          last_purchase_date: string | null
          last_sync_at: string | null
          last_synced_at: string | null
          location: string | null
          lot_tracking: boolean | null
          moq: number
          name: string
          notes: string | null
          on_order: number
          qty_to_order: number | null
          reorder_point: number
          reorder_variance: number | null
          sales_last_30_days: number | null
          sales_last_60_days: number | null
          sales_last_90_days: number | null
          sales_velocity_consolidated: number | null
          sku: string
          source_system: string | null
          status: string | null
          stock: number
          supplier_sku: string | null
          sync_errors: string | null
          sync_status: string | null
          unit_cost: number | null
          unit_of_measure: string | null
          unit_price: number | null
          units_available: number | null
          units_in_stock: number | null
          units_on_order: number | null
          units_reserved: number | null
          upc: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
          version: number
          warehouse_location: string | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          bin_location?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          data_source?: string | null
          deleted_at?: string | null
          description?: string | null
          dimensions?: string | null
          external_id?: string | null
          facility_id?: string | null
          is_deleted?: boolean
          last_purchase_date?: string | null
          last_sync_at?: string | null
          last_synced_at?: string | null
          location?: string | null
          lot_tracking?: boolean | null
          moq?: number
          name: string
          notes?: string | null
          on_order?: number
          qty_to_order?: number | null
          reorder_point?: number
          reorder_variance?: number | null
          sales_last_30_days?: number | null
          sales_last_60_days?: number | null
          sales_last_90_days?: number | null
          sales_velocity_consolidated?: number | null
          sku: string
          source_system?: string | null
          status?: string | null
          stock?: number
          supplier_sku?: string | null
          sync_errors?: string | null
          sync_status?: string | null
          unit_cost?: number | null
          unit_of_measure?: string | null
          unit_price?: number | null
          units_available?: number | null
          units_in_stock?: number | null
          units_on_order?: number | null
          units_reserved?: number | null
          upc?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          version?: number
          warehouse_location?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          bin_location?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          data_source?: string | null
          deleted_at?: string | null
          description?: string | null
          dimensions?: string | null
          external_id?: string | null
          facility_id?: string | null
          is_deleted?: boolean
          last_purchase_date?: string | null
          last_sync_at?: string | null
          last_synced_at?: string | null
          location?: string | null
          lot_tracking?: boolean | null
          moq?: number
          name?: string
          notes?: string | null
          on_order?: number
          qty_to_order?: number | null
          reorder_point?: number
          reorder_variance?: number | null
          sales_last_30_days?: number | null
          sales_last_60_days?: number | null
          sales_last_90_days?: number | null
          sales_velocity_consolidated?: number | null
          sku?: string
          source_system?: string | null
          status?: string | null
          stock?: number
          supplier_sku?: string | null
          sync_errors?: string | null
          sync_status?: string | null
          unit_cost?: number | null
          unit_of_measure?: string | null
          unit_price?: number | null
          units_available?: number | null
          units_in_stock?: number | null
          units_on_order?: number | null
          units_reserved?: number | null
          upc?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          version?: number
          warehouse_location?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "inventory_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          approved_by: string | null
          approved_date: string | null
          barcode: string | null
          bom_id: string | null
          created_at: string | null
          extracted_data: Json | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          ingredient_comparison: Json | null
          mime_type: string | null
          net_weight: string | null
          notes: string | null
          product_name: string | null
          revision: number | null
          scan_completed_at: string | null
          scan_error: string | null
          scan_status: string | null
          status: string | null
          updated_at: string | null
          uploaded_by: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          approved_by?: string | null
          approved_date?: string | null
          barcode?: string | null
          bom_id?: string | null
          created_at?: string | null
          extracted_data?: Json | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          ingredient_comparison?: Json | null
          mime_type?: string | null
          net_weight?: string | null
          notes?: string | null
          product_name?: string | null
          revision?: number | null
          scan_completed_at?: string | null
          scan_error?: string | null
          scan_status?: string | null
          status?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          approved_by?: string | null
          approved_date?: string | null
          barcode?: string | null
          bom_id?: string | null
          created_at?: string | null
          extracted_data?: Json | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          ingredient_comparison?: Json | null
          mime_type?: string | null
          net_weight?: string | null
          notes?: string | null
          product_name?: string | null
          revision?: number | null
          scan_completed_at?: string | null
          scan_error?: string | null
          scan_status?: string | null
          status?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_labels_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_labels_bom_id"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_labels_bom_id"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms_with_compliance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_labels_bom_id"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "compliance_dashboard"
            referencedColumns: ["bom_id"]
          },
          {
            foreignKeyName: "fk_labels_uploaded_by"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_labels_verified_by"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_server_configs: {
        Row: {
          anthropic_api_key: string | null
          api_key: string | null
          available_tools: Json | null
          created_at: string | null
          created_by: string | null
          display_name: string
          health_status: string | null
          id: string
          is_enabled: boolean | null
          is_local: boolean | null
          last_health_check: string | null
          notes: string | null
          rate_limit_per_hour: number | null
          retry_attempts: number | null
          server_name: string
          server_type: string
          server_url: string
          timeout_seconds: number | null
          tool_permissions: Json | null
          updated_at: string | null
        }
        Insert: {
          anthropic_api_key?: string | null
          api_key?: string | null
          available_tools?: Json | null
          created_at?: string | null
          created_by?: string | null
          display_name: string
          health_status?: string | null
          id?: string
          is_enabled?: boolean | null
          is_local?: boolean | null
          last_health_check?: string | null
          notes?: string | null
          rate_limit_per_hour?: number | null
          retry_attempts?: number | null
          server_name: string
          server_type?: string
          server_url: string
          timeout_seconds?: number | null
          tool_permissions?: Json | null
          updated_at?: string | null
        }
        Update: {
          anthropic_api_key?: string | null
          api_key?: string | null
          available_tools?: Json | null
          created_at?: string | null
          created_by?: string | null
          display_name?: string
          health_status?: string | null
          id?: string
          is_enabled?: boolean | null
          is_local?: boolean | null
          last_health_check?: string | null
          notes?: string | null
          rate_limit_per_hour?: number | null
          retry_attempts?: number | null
          server_name?: string
          server_type?: string
          server_url?: string
          timeout_seconds?: number | null
          tool_permissions?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      mcp_tool_calls: {
        Row: {
          called_at: string | null
          cost_usd: number | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          input_params: Json | null
          output_result: Json | null
          server_name: string
          session_id: string | null
          status: string
          tokens_used: number | null
          tool_name: string
          user_id: string | null
        }
        Insert: {
          called_at?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_params?: Json | null
          output_result?: Json | null
          server_name: string
          session_id?: string | null
          status: string
          tokens_used?: number | null
          tool_name: string
          user_id?: string | null
        }
        Update: {
          called_at?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_params?: Json | null
          output_result?: Json | null
          server_name?: string
          session_id?: string | null
          status?: string
          tokens_used?: number | null
          tool_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          data: Json | null
          dismissed: boolean | null
          dismissed_at: string | null
          expires_at: string | null
          id: string
          message: string
          read: boolean | null
          read_at: string | null
          role: string | null
          severity: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          data?: Json | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          read_at?: string | null
          role?: string | null
          severity?: string
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          data?: Json | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          read_at?: string | null
          role?: string | null
          severity?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pdf_templates: {
        Row: {
          ai_generated: boolean | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          font_family: string | null
          footer_text: string | null
          header_color: string | null
          header_text: string | null
          id: string
          is_default: boolean | null
          show_company_info: boolean | null
          show_logo: boolean | null
          show_tax: boolean | null
          template_name: string
          template_type: string
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          font_family?: string | null
          footer_text?: string | null
          header_color?: string | null
          header_text?: string | null
          id?: string
          is_default?: boolean | null
          show_company_info?: boolean | null
          show_logo?: boolean | null
          show_tax?: boolean | null
          template_name: string
          template_type: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          font_family?: string | null
          footer_text?: string | null
          header_color?: string | null
          header_text?: string | null
          id?: string
          is_default?: boolean | null
          show_company_info?: boolean | null
          show_logo?: boolean | null
          show_tax?: boolean | null
          template_name?: string
          template_type?: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdf_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "pdf_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      po_email_tracking: {
        Row: {
          created_at: string | null
          gmail_history_id: string | null
          gmail_label_ids: string[] | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          last_reply_at: string | null
          last_reply_message_id: string | null
          metadata: Json | null
          po_id: string | null
          sent_at: string | null
          vendor_email: string | null
        }
        Insert: {
          created_at?: string | null
          gmail_history_id?: string | null
          gmail_label_ids?: string[] | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          last_reply_at?: string | null
          last_reply_message_id?: string | null
          metadata?: Json | null
          po_id?: string | null
          sent_at?: string | null
          vendor_email?: string | null
        }
        Update: {
          created_at?: string | null
          gmail_history_id?: string | null
          gmail_label_ids?: string[] | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          last_reply_at?: string | null
          last_reply_message_id?: string | null
          metadata?: Json | null
          po_id?: string | null
          sent_at?: string | null
          vendor_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_email_tracking_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_email_tracking_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_email_tracking_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_followup_rules: {
        Row: {
          active: boolean
          body_template: string
          created_at: string
          id: string
          instructions: string | null
          stage: number
          subject_template: string
          updated_at: string
          wait_hours: number
        }
        Insert: {
          active?: boolean
          body_template: string
          created_at?: string
          id?: string
          instructions?: string | null
          stage: number
          subject_template: string
          updated_at?: string
          wait_hours: number
        }
        Update: {
          active?: boolean
          body_template?: string
          created_at?: string
          id?: string
          instructions?: string | null
          stage?: number
          subject_template?: string
          updated_at?: string
          wait_hours?: number
        }
        Relationships: []
      }
      po_patterns: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          frequency_days: number | null
          id: string
          is_recurring: boolean | null
          item_skus: string[] | null
          last_order_date: string | null
          order_count: number | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          frequency_days?: number | null
          id?: string
          is_recurring?: boolean | null
          item_skus?: string[] | null
          last_order_date?: string | null
          order_count?: number | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          frequency_days?: number | null
          id?: string
          is_recurring?: boolean | null
          item_skus?: string[] | null
          last_order_date?: string | null
          order_count?: number | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_patterns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "po_patterns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_patterns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      po_status_transitions: {
        Row: {
          from_status: string
          requires_role: string | null
          to_status: string
        }
        Insert: {
          from_status: string
          requires_role?: string | null
          to_status: string
        }
        Update: {
          from_status?: string
          requires_role?: string | null
          to_status?: string
        }
        Relationships: []
      }
      po_tracking_events: {
        Row: {
          carrier: string | null
          created_at: string
          description: string | null
          id: string
          po_id: string | null
          raw_payload: Json | null
          status: string
          tracking_number: string | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          description?: string | null
          id?: string
          po_id?: string | null
          raw_payload?: Json | null
          status: string
          tracking_number?: string | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          description?: string | null
          id?: string
          po_id?: string | null
          raw_payload?: Json | null
          status?: string
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_tracking_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_tracking_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_tracking_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_data_sheets: {
        Row: {
          ai_model_used: string | null
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          bom_id: string
          content: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          document_type: string
          edit_count: number | null
          edit_history: Json | null
          generation_prompt: string | null
          id: string
          is_ai_generated: boolean | null
          label_id: string | null
          last_edited_by: string | null
          notes: string | null
          pdf_file_size: number | null
          pdf_generated_at: string | null
          pdf_url: string | null
          published_at: string | null
          published_version: number | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          ai_model_used?: string | null
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bom_id: string
          content: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type: string
          edit_count?: number | null
          edit_history?: Json | null
          generation_prompt?: string | null
          id?: string
          is_ai_generated?: boolean | null
          label_id?: string | null
          last_edited_by?: string | null
          notes?: string | null
          pdf_file_size?: number | null
          pdf_generated_at?: string | null
          pdf_url?: string | null
          published_at?: string | null
          published_version?: number | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          ai_model_used?: string | null
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bom_id?: string
          content?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type?: string
          edit_count?: number | null
          edit_history?: Json | null
          generation_prompt?: string | null
          id?: string
          is_ai_generated?: boolean | null
          label_id?: string | null
          last_edited_by?: string | null
          notes?: string | null
          pdf_file_size?: number | null
          pdf_generated_at?: string | null
          pdf_url?: string | null
          published_at?: string | null
          published_version?: number | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pds_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pds_bom_id"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pds_bom_id"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms_with_compliance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pds_bom_id"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "compliance_dashboard"
            referencedColumns: ["bom_id"]
          },
          {
            foreignKeyName: "fk_pds_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pds_label_id"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pds_last_edited_by"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          actual_delivery: string | null
          consumption_30day: number | null
          consumption_90day: number | null
          created_at: string | null
          days_of_stock_at_order: number | null
          discount_amount: number | null
          discount_percent: number | null
          expected_delivery: string | null
          id: string
          inventory_sku: string
          item_description: string | null
          item_name: string
          line_notes: string | null
          line_number: number | null
          line_status: string | null
          line_total: number | null
          po_id: string
          quantity_ordered: number
          quantity_pending: number | null
          quantity_received: number | null
          reorder_reason: string | null
          safety_stock_target: number | null
          supplier_sku: string | null
          unit_cost: number
          unit_of_measure: string | null
          updated_at: string | null
        }
        Insert: {
          actual_delivery?: string | null
          consumption_30day?: number | null
          consumption_90day?: number | null
          created_at?: string | null
          days_of_stock_at_order?: number | null
          discount_amount?: number | null
          discount_percent?: number | null
          expected_delivery?: string | null
          id?: string
          inventory_sku: string
          item_description?: string | null
          item_name: string
          line_notes?: string | null
          line_number?: number | null
          line_status?: string | null
          line_total?: number | null
          po_id: string
          quantity_ordered: number
          quantity_pending?: number | null
          quantity_received?: number | null
          reorder_reason?: string | null
          safety_stock_target?: number | null
          supplier_sku?: string | null
          unit_cost: number
          unit_of_measure?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_delivery?: string | null
          consumption_30day?: number | null
          consumption_90day?: number | null
          created_at?: string | null
          days_of_stock_at_order?: number | null
          discount_amount?: number | null
          discount_percent?: number | null
          expected_delivery?: string | null
          id?: string
          inventory_sku?: string
          item_description?: string | null
          item_name?: string
          line_notes?: string | null
          line_number?: number | null
          line_status?: string | null
          line_total?: number | null
          po_id?: string
          quantity_ordered?: number
          quantity_pending?: number | null
          quantity_received?: number | null
          reorder_reason?: string | null
          safety_stock_target?: number | null
          supplier_sku?: string | null
          unit_cost?: number
          unit_of_measure?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          actual_receive_date: string | null
          approved_at: string | null
          approved_by: string | null
          auto_approved: boolean | null
          auto_generated: boolean | null
          cancellation_reason: string | null
          cancelled_at: string | null
          carrier: string | null
          confirmed_at: string | null
          created_by: string | null
          currency: string | null
          expected_date: string | null
          finale_po_id: string | null
          finale_status: string | null
          follow_up_required: boolean | null
          follow_up_status: string | null
          generation_reason: string | null
          id: string
          internal_notes: string | null
          invoice_detected_at: string | null
          invoice_gmail_message_id: string | null
          invoice_summary: Json | null
          last_finale_sync: string | null
          last_follow_up_sent_at: string | null
          last_follow_up_stage: number | null
          order_date: string
          order_id: string
          payment_terms: string | null
          priority: string | null
          received_at: string | null
          record_created: string | null
          record_last_updated: string | null
          requisition_ids: string[] | null
          reviewed_at: string | null
          reviewed_by: string | null
          sent_at: string | null
          shipments: string | null
          shipping_cost: number | null
          source: string | null
          special_instructions: string | null
          status: string
          subtotal: number | null
          supplier_code: string | null
          supplier_contact: string | null
          supplier_email: string | null
          supplier_name: string
          supplier_phone: string | null
          tax_amount: number | null
          total_amount: number | null
          tracking_carrier: string | null
          tracking_estimated_delivery: string | null
          tracking_events: Json | null
          tracking_last_checked_at: string | null
          tracking_last_exception: string | null
          tracking_link: string | null
          tracking_number: string | null
          tracking_status: string | null
          updated_by: string | null
          vendor_id: string | null
          vendor_notes: string | null
        }
        Insert: {
          actual_receive_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_approved?: boolean | null
          auto_generated?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          confirmed_at?: string | null
          created_by?: string | null
          currency?: string | null
          expected_date?: string | null
          finale_po_id?: string | null
          finale_status?: string | null
          follow_up_required?: boolean | null
          follow_up_status?: string | null
          generation_reason?: string | null
          id?: string
          internal_notes?: string | null
          invoice_detected_at?: string | null
          invoice_gmail_message_id?: string | null
          invoice_summary?: Json | null
          last_finale_sync?: string | null
          last_follow_up_sent_at?: string | null
          last_follow_up_stage?: number | null
          order_date?: string
          order_id: string
          payment_terms?: string | null
          priority?: string | null
          received_at?: string | null
          record_created?: string | null
          record_last_updated?: string | null
          requisition_ids?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          shipments?: string | null
          shipping_cost?: number | null
          source?: string | null
          special_instructions?: string | null
          status?: string
          subtotal?: number | null
          supplier_code?: string | null
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name: string
          supplier_phone?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          tracking_carrier?: string | null
          tracking_estimated_delivery?: string | null
          tracking_events?: Json | null
          tracking_last_checked_at?: string | null
          tracking_last_exception?: string | null
          tracking_link?: string | null
          tracking_number?: string | null
          tracking_status?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          vendor_notes?: string | null
        }
        Update: {
          actual_receive_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_approved?: boolean | null
          auto_generated?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          confirmed_at?: string | null
          created_by?: string | null
          currency?: string | null
          expected_date?: string | null
          finale_po_id?: string | null
          finale_status?: string | null
          follow_up_required?: boolean | null
          follow_up_status?: string | null
          generation_reason?: string | null
          id?: string
          internal_notes?: string | null
          invoice_detected_at?: string | null
          invoice_gmail_message_id?: string | null
          invoice_summary?: Json | null
          last_finale_sync?: string | null
          last_follow_up_sent_at?: string | null
          last_follow_up_stage?: number | null
          order_date?: string
          order_id?: string
          payment_terms?: string | null
          priority?: string | null
          received_at?: string | null
          record_created?: string | null
          record_last_updated?: string | null
          requisition_ids?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          shipments?: string | null
          shipping_cost?: number | null
          source?: string | null
          special_instructions?: string | null
          status?: string
          subtotal?: number | null
          supplier_code?: string | null
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name?: string
          supplier_phone?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          tracking_carrier?: string | null
          tracking_estimated_delivery?: string | null
          tracking_events?: Json | null
          tracking_last_checked_at?: string | null
          tracking_last_exception?: string | null
          tracking_link?: string | null
          tracking_number?: string | null
          tracking_status?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          vendor_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      regulation_changes: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          action_taken: string | null
          alert_recipients: string[] | null
          alert_sent: boolean | null
          alert_sent_at: string | null
          change_summary: string | null
          change_type: string
          created_at: string | null
          detected_by: string | null
          detection_method: string | null
          field_changed: string | null
          id: string
          new_value: string | null
          old_value: string | null
          regulation_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action_taken?: string | null
          alert_recipients?: string[] | null
          alert_sent?: boolean | null
          alert_sent_at?: string | null
          change_summary?: string | null
          change_type: string
          created_at?: string | null
          detected_by?: string | null
          detection_method?: string | null
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          regulation_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action_taken?: string | null
          alert_recipients?: string[] | null
          alert_sent?: boolean | null
          alert_sent_at?: string | null
          change_summary?: string | null
          change_type?: string
          created_at?: string | null
          detected_by?: string | null
          detection_method?: string | null
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          regulation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulation_changes_regulation_id_fkey"
            columns: ["regulation_id"]
            isOneToOne: false
            referencedRelation: "state_regulations"
            referencedColumns: ["id"]
          },
        ]
      }
      regulation_update_jobs: {
        Row: {
          approved_changes: Json | null
          categories_to_update: string[] | null
          changes_detected: number | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_details: Json | null
          error_message: string | null
          execution_logs: Json | null
          id: string
          job_type: string
          mcp_server_used: string | null
          next_run_at: string | null
          regulations_created: number | null
          regulations_found: number | null
          regulations_updated: number | null
          requires_review: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
          schedule_cron: string | null
          scheduled_by: string | null
          started_at: string | null
          states_to_update: string[] | null
          status: string
        }
        Insert: {
          approved_changes?: Json | null
          categories_to_update?: string[] | null
          changes_detected?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_details?: Json | null
          error_message?: string | null
          execution_logs?: Json | null
          id?: string
          job_type: string
          mcp_server_used?: string | null
          next_run_at?: string | null
          regulations_created?: number | null
          regulations_found?: number | null
          regulations_updated?: number | null
          requires_review?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_cron?: string | null
          scheduled_by?: string | null
          started_at?: string | null
          states_to_update?: string[] | null
          status?: string
        }
        Update: {
          approved_changes?: Json | null
          categories_to_update?: string[] | null
          changes_detected?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_details?: Json | null
          error_message?: string | null
          execution_logs?: Json | null
          id?: string
          job_type?: string
          mcp_server_used?: string | null
          next_run_at?: string | null
          regulations_created?: number | null
          regulations_found?: number | null
          regulations_updated?: number | null
          requires_review?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_cron?: string | null
          scheduled_by?: string | null
          started_at?: string | null
          states_to_update?: string[] | null
          status?: string
        }
        Relationships: []
      }
      reorder_queue: {
        Row: {
          ai_confidence: number | null
          ai_recommendation: string | null
          available_stock: number | null
          consumption_30day: number | null
          consumption_90day: number | null
          consumption_daily: number | null
          consumption_variance: number | null
          created_at: string | null
          current_stock: number
          days_until_stockout: number | null
          estimated_cost: number | null
          estimated_stockout_risk_usd: number | null
          id: string
          identified_at: string
          inventory_sku: string
          item_name: string
          lead_time_days: number | null
          moq: number | null
          notes: string | null
          on_order: number | null
          po_created_at: string | null
          po_id: string | null
          priority_score: number | null
          recommended_quantity: number
          reorder_point: number
          resolution_type: string | null
          resolved_at: string | null
          safety_stock: number | null
          seasonal_factor: number | null
          status: string
          updated_at: string | null
          urgency: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_recommendation?: string | null
          available_stock?: number | null
          consumption_30day?: number | null
          consumption_90day?: number | null
          consumption_daily?: number | null
          consumption_variance?: number | null
          created_at?: string | null
          current_stock: number
          days_until_stockout?: number | null
          estimated_cost?: number | null
          estimated_stockout_risk_usd?: number | null
          id?: string
          identified_at?: string
          inventory_sku: string
          item_name: string
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          on_order?: number | null
          po_created_at?: string | null
          po_id?: string | null
          priority_score?: number | null
          recommended_quantity: number
          reorder_point: number
          resolution_type?: string | null
          resolved_at?: string | null
          safety_stock?: number | null
          seasonal_factor?: number | null
          status?: string
          updated_at?: string | null
          urgency?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_recommendation?: string | null
          available_stock?: number | null
          consumption_30day?: number | null
          consumption_90day?: number | null
          consumption_daily?: number | null
          consumption_variance?: number | null
          created_at?: string | null
          current_stock?: number
          days_until_stockout?: number | null
          estimated_cost?: number | null
          estimated_stockout_risk_usd?: number | null
          id?: string
          identified_at?: string
          inventory_sku?: string
          item_name?: string
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          on_order?: number | null
          po_created_at?: string | null
          po_id?: string | null
          priority_score?: number | null
          recommended_quantity?: number
          reorder_point?: number
          resolution_type?: string | null
          resolved_at?: string | null
          safety_stock?: number | null
          seasonal_factor?: number | null
          status?: string
          updated_at?: string | null
          urgency?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reorder_queue_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_queue_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_queue_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_queue_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "reorder_queue_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_queue_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_status_transitions: {
        Row: {
          from_status: string
          requires_role: string | null
          to_status: string
        }
        Insert: {
          from_status: string
          requires_role?: string | null
          to_status: string
        }
        Update: {
          from_status?: string
          requires_role?: string | null
          to_status?: string
        }
        Relationships: []
      }
      requisitions: {
        Row: {
          alert_only: boolean | null
          approved_at: string | null
          approved_by: string | null
          auto_po: boolean | null
          context: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          id: string
          is_deleted: boolean
          items: Json
          metadata: Json | null
          need_by_date: string | null
          notify_requester: boolean | null
          po_id: string | null
          priority: string | null
          reason: string | null
          rejection_reason: string | null
          request_type: string | null
          requester_id: string
          requisition_number: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          alert_only?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          auto_po?: boolean | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          id?: string
          is_deleted?: boolean
          items?: Json
          metadata?: Json | null
          need_by_date?: string | null
          notify_requester?: boolean | null
          po_id?: string | null
          priority?: string | null
          reason?: string | null
          rejection_reason?: string | null
          request_type?: string | null
          requester_id: string
          requisition_number: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          alert_only?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          auto_po?: boolean | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          id?: string
          is_deleted?: boolean
          items?: Json
          metadata?: Json | null
          need_by_date?: string | null
          notify_requester?: boolean | null
          po_id?: string | null
          priority?: string | null
          reason?: string | null
          rejection_reason?: string | null
          request_type?: string | null
          requester_id?: string
          requisition_number?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scraping_configs: {
        Row: {
          base_url: string
          config_name: string
          created_at: string | null
          created_by: string | null
          failed_scrapes: number | null
          headers: Json | null
          id: string
          is_enabled: boolean | null
          last_successful_scrape: string | null
          notes: string | null
          rate_limit_ms: number | null
          selectors: Json
          total_scrapes: number | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          base_url: string
          config_name: string
          created_at?: string | null
          created_by?: string | null
          failed_scrapes?: number | null
          headers?: Json | null
          id?: string
          is_enabled?: boolean | null
          last_successful_scrape?: string | null
          notes?: string | null
          rate_limit_ms?: number | null
          selectors: Json
          total_scrapes?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          base_url?: string
          config_name?: string
          created_at?: string | null
          created_by?: string | null
          failed_scrapes?: number | null
          headers?: Json | null
          id?: string
          is_enabled?: boolean | null
          last_successful_scrape?: string | null
          notes?: string | null
          rate_limit_ms?: number | null
          selectors?: Json
          total_scrapes?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      scraping_jobs: {
        Row: {
          completed_at: string | null
          config_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          job_type: string
          retry_count: number | null
          scraped_data: Json | null
          started_at: string | null
          status: string
          triggered_by: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          completed_at?: string | null
          config_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_type: string
          retry_count?: number | null
          scraped_data?: Json | null
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          completed_at?: string | null
          config_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_type?: string
          retry_count?: number | null
          scraped_data?: Json | null
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraping_jobs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "scraping_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_factors: {
        Row: {
          confidence: number
          created_at: string | null
          historical_data_points: number | null
          id: string
          inventory_sku: string
          last_calculated_at: string | null
          month: number
          seasonal_factor: number
          updated_at: string | null
          yoy_growth_rate: number | null
        }
        Insert: {
          confidence?: number
          created_at?: string | null
          historical_data_points?: number | null
          id?: string
          inventory_sku: string
          last_calculated_at?: string | null
          month: number
          seasonal_factor?: number
          updated_at?: string | null
          yoy_growth_rate?: number | null
        }
        Update: {
          confidence?: number
          created_at?: string | null
          historical_data_points?: number | null
          id?: string
          inventory_sku?: string
          last_calculated_at?: string | null
          month?: number
          seasonal_factor?: number
          updated_at?: string | null
          yoy_growth_rate?: number | null
        }
        Relationships: []
      }
      state_regulations: {
        Row: {
          agency_contact_email: string | null
          agency_contact_phone: string | null
          agency_name: string | null
          category: string
          confidence_score: number | null
          created_at: string | null
          created_by: string | null
          effective_date: string | null
          expiration_date: string | null
          extraction_method: string | null
          extraction_model: string | null
          extraction_notes: string | null
          extraction_prompt_id: string | null
          id: string
          keywords: string[] | null
          last_verified_at: string | null
          last_verified_by: string | null
          regulation_code: string | null
          rule_summary: string | null
          rule_text: string
          rule_title: string
          search_vector: unknown
          source_type: string | null
          source_url: string
          state: string
          state_name: string | null
          status: string | null
          statute_reference: string | null
          subcategory: string | null
          superseded_by: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          agency_contact_email?: string | null
          agency_contact_phone?: string | null
          agency_name?: string | null
          category: string
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          extraction_method?: string | null
          extraction_model?: string | null
          extraction_notes?: string | null
          extraction_prompt_id?: string | null
          id?: string
          keywords?: string[] | null
          last_verified_at?: string | null
          last_verified_by?: string | null
          regulation_code?: string | null
          rule_summary?: string | null
          rule_text: string
          rule_title: string
          search_vector?: unknown
          source_type?: string | null
          source_url: string
          state: string
          state_name?: string | null
          status?: string | null
          statute_reference?: string | null
          subcategory?: string | null
          superseded_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          agency_contact_email?: string | null
          agency_contact_phone?: string | null
          agency_name?: string | null
          category?: string
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          extraction_method?: string | null
          extraction_model?: string | null
          extraction_notes?: string | null
          extraction_prompt_id?: string | null
          id?: string
          keywords?: string[] | null
          last_verified_at?: string | null
          last_verified_by?: string | null
          regulation_code?: string | null
          rule_summary?: string | null
          rule_text?: string
          rule_title?: string
          search_vector?: unknown
          source_type?: string | null
          source_url?: string
          state?: string
          state_name?: string | null
          status?: string | null
          statute_reference?: string | null
          subcategory?: string | null
          superseded_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "state_regulations_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "state_regulations"
            referencedColumns: ["id"]
          },
        ]
      }
      suggested_regulations: {
        Row: {
          agency_name: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          industry: string
          is_official: boolean | null
          regulation_type: string
          relevance_score: number | null
          state_code: string
          title: string
          url: string
        }
        Insert: {
          agency_name?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          industry: string
          is_official?: boolean | null
          regulation_type: string
          relevance_score?: number | null
          state_code: string
          title: string
          url: string
        }
        Update: {
          agency_name?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          industry?: string
          is_official?: boolean | null
          regulation_type?: string
          relevance_score?: number | null
          state_code?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      sync_metadata: {
        Row: {
          created_at: string
          data_type: string
          item_count: number
          last_sync_time: string
          success: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_type: string
          item_count?: number
          last_sync_time: string
          success?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_type?: string
          item_count?: number
          last_sync_time?: string
          success?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      template_variables: {
        Row: {
          applies_to: string[] | null
          created_at: string | null
          description: string | null
          example_value: string | null
          id: string
          variable_key: string
          variable_name: string
        }
        Insert: {
          applies_to?: string[] | null
          created_at?: string | null
          description?: string | null
          example_value?: string | null
          id?: string
          variable_key: string
          variable_name: string
        }
        Update: {
          applies_to?: string[] | null
          created_at?: string | null
          description?: string | null
          example_value?: string | null
          id?: string
          variable_key?: string
          variable_name?: string
        }
        Relationships: []
      }
      usage_analytics: {
        Row: {
          compliance_tier: string
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          page_location: string | null
          user_id: string
        }
        Insert: {
          compliance_tier: string
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          page_location?: string | null
          user_id: string
        }
        Update: {
          compliance_tier?: string
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          page_location?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_analytics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_compliance_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_compliance_profiles: {
        Row: {
          certifications_held: string[] | null
          checks_this_month: number | null
          compliance_tier: string
          created_at: string | null
          email: string
          id: string
          industry: string
          is_active: boolean | null
          last_check_at: string | null
          monthly_check_limit: number | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          product_types: string[] | null
          stripe_customer_id: string | null
          subscription_renewal_date: string | null
          subscription_start_date: string | null
          subscription_status: string | null
          target_states: string[]
          total_checks_lifetime: number | null
          trial_checks_remaining: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          certifications_held?: string[] | null
          checks_this_month?: number | null
          compliance_tier?: string
          created_at?: string | null
          email: string
          id?: string
          industry: string
          is_active?: boolean | null
          last_check_at?: string | null
          monthly_check_limit?: number | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          product_types?: string[] | null
          stripe_customer_id?: string | null
          subscription_renewal_date?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          target_states: string[]
          total_checks_lifetime?: number | null
          trial_checks_remaining?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          certifications_held?: string[] | null
          checks_this_month?: number | null
          compliance_tier?: string
          created_at?: string | null
          email?: string
          id?: string
          industry?: string
          is_active?: boolean | null
          last_check_at?: string | null
          monthly_check_limit?: number | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          product_types?: string[] | null
          stripe_customer_id?: string | null
          subscription_renewal_date?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          target_states?: string[]
          total_checks_lifetime?: number | null
          trial_checks_remaining?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          agreements: Json
          created_at: string
          department: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          metadata: Json
          onboarding_complete: boolean
          role: string
          updated_at: string
        }
        Insert: {
          agreements?: Json
          created_at?: string
          department?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          last_login_at?: string | null
          metadata?: Json
          onboarding_complete?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          agreements?: Json
          created_at?: string
          department?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          metadata?: Json
          onboarding_complete?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_regulatory_sources: {
        Row: {
          added_at: string | null
          id: string
          is_favorite: boolean | null
          key_requirements: string | null
          last_accessed_at: string | null
          regulation_type: string
          source_description: string | null
          source_title: string
          source_url: string
          state_code: string
          tags: string[] | null
          updated_at: string | null
          user_id: string
          user_notes: string | null
        }
        Insert: {
          added_at?: string | null
          id?: string
          is_favorite?: boolean | null
          key_requirements?: string | null
          last_accessed_at?: string | null
          regulation_type: string
          source_description?: string | null
          source_title: string
          source_url: string
          state_code: string
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
          user_notes?: string | null
        }
        Update: {
          added_at?: string | null
          id?: string
          is_favorite?: boolean | null
          key_requirements?: string | null
          last_accessed_at?: string | null
          regulation_type?: string
          source_description?: string | null
          source_title?: string
          source_url?: string
          state_code?: string
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
          user_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_regulatory_sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_compliance_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          department: string | null
          email: string
          id: string
          is_deleted: boolean
          name: string
          role: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email: string
          id: string
          is_deleted?: boolean
          name: string
          role?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string
          id?: string
          is_deleted?: boolean
          name?: string
          role?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      vendor_followup_events: {
        Row: {
          id: string
          metadata: Json
          notes: string | null
          po_id: string
          responded_at: string | null
          response_latency: unknown
          sent_at: string
          stage: number
          vendor_id: string | null
        }
        Insert: {
          id?: string
          metadata?: Json
          notes?: string | null
          po_id: string
          responded_at?: string | null
          response_latency?: unknown
          sent_at?: string
          stage: number
          vendor_id?: string | null
        }
        Update: {
          id?: string
          metadata?: Json
          notes?: string | null
          po_id?: string
          responded_at?: string | null
          response_latency?: unknown
          sent_at?: string
          stage?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_followup_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_followup_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_followup_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_followup_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_followup_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_followup_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_performance_metrics: {
        Row: {
          average_lead_time_days: number | null
          average_order_value: number | null
          calculated_at: string | null
          created_at: string | null
          estimated_lead_time_days: number | null
          id: string
          late_deliveries: number | null
          lead_time_variance: number | null
          on_time_deliveries: number | null
          on_time_rate: number | null
          period_end: string
          period_start: string
          price_variance_percentage: number | null
          quality_issues: number | null
          reliability_score: number | null
          returns: number | null
          total_orders: number | null
          total_spend: number | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          average_lead_time_days?: number | null
          average_order_value?: number | null
          calculated_at?: string | null
          created_at?: string | null
          estimated_lead_time_days?: number | null
          id?: string
          late_deliveries?: number | null
          lead_time_variance?: number | null
          on_time_deliveries?: number | null
          on_time_rate?: number | null
          period_end: string
          period_start: string
          price_variance_percentage?: number | null
          quality_issues?: number | null
          reliability_score?: number | null
          returns?: number | null
          total_orders?: number | null
          total_spend?: number | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          average_lead_time_days?: number | null
          average_order_value?: number | null
          calculated_at?: string | null
          created_at?: string | null
          estimated_lead_time_days?: number | null
          id?: string
          late_deliveries?: number | null
          lead_time_variance?: number | null
          on_time_deliveries?: number | null
          on_time_rate?: number | null
          period_end?: string
          period_start?: string
          price_variance_percentage?: number | null
          quality_issues?: number | null
          reliability_score?: number | null
          returns?: number | null
          total_orders?: number | null
          total_spend?: number | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_performance_metrics_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_performance_metrics_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_performance_metrics_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          address_line1: string | null
          address_line2: string | null
          auto_po_enabled: boolean | null
          auto_po_threshold: string | null
          auto_send_email: boolean | null
          automation_notes: string | null
          city: string | null
          contact_emails: string[]
          contact_phone: string | null
          country: string | null
          created_at: string
          created_by: string | null
          data_source: string | null
          deleted_at: string | null
          external_id: string | null
          id: string
          is_deleted: boolean
          is_recurring_vendor: boolean | null
          last_sync_at: string | null
          last_synced_at: string | null
          lead_time_days: number | null
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          postal_code: string | null
          source_system: string | null
          state: string | null
          sync_status: string | null
          updated_at: string
          updated_by: string | null
          version: number
          website: string | null
        }
        Insert: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          auto_po_enabled?: boolean | null
          auto_po_threshold?: string | null
          auto_send_email?: boolean | null
          automation_notes?: string | null
          city?: string | null
          contact_emails?: string[]
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          is_deleted?: boolean
          is_recurring_vendor?: boolean | null
          last_sync_at?: string | null
          last_synced_at?: string | null
          lead_time_days?: number | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          source_system?: string | null
          state?: string | null
          sync_status?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          website?: string | null
        }
        Update: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          auto_po_enabled?: boolean | null
          auto_po_threshold?: string | null
          auto_send_email?: boolean | null
          automation_notes?: string | null
          city?: string | null
          contact_emails?: string[]
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          is_deleted?: boolean
          is_recurring_vendor?: boolean | null
          last_sync_at?: string | null
          last_synced_at?: string | null
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          source_system?: string | null
          state?: string | null
          sync_status?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_purchase_orders: {
        Row: {
          expected_date: string | null
          id: string | null
          line_item_count: number | null
          order_date: string | null
          order_id: string | null
          pending_items: number | null
          received_items: number | null
          status: string | null
          supplier_name: string | null
          total_amount: number | null
        }
        Relationships: []
      }
      ai_active_insights: {
        Row: {
          insight_type: string | null
          priority: string | null
          total_estimated_impact: number | null
          total_insights: number | null
          unviewed_count: number | null
        }
        Relationships: []
      }
      ai_purchasing_daily_costs: {
        Row: {
          avg_cost_per_call: number | null
          date: string | null
          service_name: string | null
          total_calls: number | null
          total_cost: number | null
          total_tokens: number | null
        }
        Relationships: []
      }
      ai_purchasing_monthly_costs: {
        Row: {
          avg_cost_per_call: number | null
          month: string | null
          service_name: string | null
          total_calls: number | null
          total_cost: number | null
          total_tokens: number | null
        }
        Relationships: []
      }
      boms_with_compliance: {
        Row: {
          barcode: string | null
          compliance_last_checked: string | null
          compliance_status: string | null
          created_at: string | null
          expiring_registrations_count: number | null
          finished_sku: string | null
          id: string | null
          label_barcode: string | null
          name: string | null
          primary_data_sheet_id: string | null
          primary_data_sheet_pdf_url: string | null
          primary_data_sheet_title: string | null
          primary_data_sheet_type: string | null
          primary_label_file_name: string | null
          primary_label_id: string | null
          total_state_registrations: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boms_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: true
            referencedRelation: "inventory_details"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "boms_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "boms_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: true
            referencedRelation: "inventory_trends"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "boms_primary_data_sheet_id_fkey"
            columns: ["primary_data_sheet_id"]
            isOneToOne: false
            referencedRelation: "product_data_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_primary_label_id_fkey"
            columns: ["primary_label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_dashboard: {
        Row: {
          bom_id: string | null
          compliance_status: string | null
          current_registrations: number | null
          due_soon_registrations: number | null
          expired_registrations: number | null
          finished_sku: string | null
          next_expiration_days: number | null
          product_name: string | null
          registered_states: string[] | null
          total_registrations: number | null
          urgent_registrations: number | null
        }
        Relationships: [
          {
            foreignKeyName: "boms_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: true
            referencedRelation: "inventory_details"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "boms_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "boms_finished_sku_fkey"
            columns: ["finished_sku"]
            isOneToOne: true
            referencedRelation: "inventory_trends"
            referencedColumns: ["sku"]
          },
        ]
      }
      inventory_details: {
        Row: {
          bin_location: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          data_source: string | null
          days_of_stock_remaining: number | null
          deleted_at: string | null
          description: string | null
          dimensions: string | null
          external_id: string | null
          facility_id: string | null
          is_deleted: boolean | null
          last_purchase_date: string | null
          last_sync_at: string | null
          last_synced_at: string | null
          lead_time_days: number | null
          location: string | null
          lot_tracking: boolean | null
          moq: number | null
          name: string | null
          notes: string | null
          on_order: number | null
          qty_to_order: number | null
          recommended_order_qty: number | null
          reorder_point: number | null
          reorder_variance: number | null
          sales_last_30_days: number | null
          sales_last_90_days: number | null
          sales_velocity_consolidated: number | null
          sku: string | null
          source_system: string | null
          status: string | null
          stock: number | null
          stock_status: string | null
          supplier_sku: string | null
          sync_errors: string | null
          sync_status: string | null
          total_inventory_value: number | null
          unit_cost: number | null
          unit_of_measure: string | null
          unit_price: number | null
          units_available: number | null
          units_in_stock: number | null
          units_on_order: number | null
          units_reserved: number | null
          upc: string | null
          updated_at: string | null
          updated_by: string | null
          vendor_city: string | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_state: string | null
          version: number | null
          warehouse_location: string | null
          weight: number | null
          weight_unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "inventory_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_trends: {
        Row: {
          avg_daily_30d: number | null
          avg_daily_90d: number | null
          calculated_at: string | null
          current_stock: number | null
          days_until_stockout: number | null
          growth_rate_pct: number | null
          name: string | null
          sales_last_30_days: number | null
          sales_last_90_days: number | null
          sku: string | null
          trend_direction: string | null
        }
        Relationships: []
      }
      po_tracking_overview: {
        Row: {
          id: string | null
          last_event_at: string | null
          order_id: string | null
          tracking_carrier: string | null
          tracking_estimated_delivery: string | null
          tracking_last_checked_at: string | null
          tracking_last_exception: string | null
          tracking_number: string | null
          tracking_status: string | null
          vendor_id: string | null
        }
        Insert: {
          id?: string | null
          last_event_at?: never
          order_id?: string | null
          tracking_carrier?: string | null
          tracking_estimated_delivery?: string | null
          tracking_last_checked_at?: string | null
          tracking_last_exception?: string | null
          tracking_number?: string | null
          tracking_status?: string | null
          vendor_id?: string | null
        }
        Update: {
          id?: string | null
          last_event_at?: never
          order_id?: string | null
          tracking_carrier?: string | null
          tracking_estimated_delivery?: string | null
          tracking_last_checked_at?: string | null
          tracking_last_exception?: string | null
          tracking_number?: string | null
          tracking_status?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      urgent_reorders: {
        Row: {
          current_stock: number | null
          days_until_stockout: number | null
          estimated_cost: number | null
          id: string | null
          identified_at: string | null
          inventory_sku: string | null
          item_name: string | null
          priority_score: number | null
          recommended_quantity: number | null
          urgency: string | null
          vendor_name: string | null
        }
        Insert: {
          current_stock?: number | null
          days_until_stockout?: number | null
          estimated_cost?: number | null
          id?: string | null
          identified_at?: string | null
          inventory_sku?: string | null
          item_name?: string | null
          priority_score?: number | null
          recommended_quantity?: number | null
          urgency?: string | null
          vendor_name?: string | null
        }
        Update: {
          current_stock?: number | null
          days_until_stockout?: number | null
          estimated_cost?: number | null
          id?: string | null
          identified_at?: string | null
          inventory_sku?: string | null
          item_name?: string | null
          priority_score?: number | null
          recommended_quantity?: number | null
          urgency?: string | null
          vendor_name?: string | null
        }
        Relationships: []
      }
      vendor_automation_summary: {
        Row: {
          auto_po_enabled: boolean | null
          auto_po_threshold: string | null
          auto_pos_created: number | null
          auto_pos_discarded: number | null
          auto_pos_sent: number | null
          auto_send_email: boolean | null
          avg_order_frequency: number | null
          is_recurring_vendor: boolean | null
          last_auto_po_date: string | null
          recurring_confidence: number | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: []
      }
      vendor_details: {
        Row: {
          address_display: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_emails: string[] | null
          country: string | null
          created_at: string | null
          data_source: string | null
          email_count: number | null
          has_complete_address: boolean | null
          id: string | null
          last_sync_at: string | null
          lead_time_days: number | null
          name: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          sync_status: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address_display?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_emails?: string[] | null
          country?: string | null
          created_at?: string | null
          data_source?: string | null
          email_count?: never
          has_complete_address?: never
          id?: string | null
          last_sync_at?: string | null
          lead_time_days?: number | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          sync_status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address_display?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_emails?: string[] | null
          country?: string | null
          created_at?: string | null
          data_source?: string | null
          email_count?: never
          has_complete_address?: never
          id?: string | null
          last_sync_at?: string | null
          lead_time_days?: number | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          sync_status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_buildability: {
        Args: { p_finished_sku: string }
        Returns: Json
      }
      calculate_days_until_stockout: {
        Args: { p_consumption_daily: number; p_current_stock: number }
        Returns: number
      }
      calculate_reorder_quantity: {
        Args: { p_sku: string }
        Returns: {
          current_stock: number
          days_until_stockout: number
          moq: number
          recommended_qty: number
          reorder_point: number
          sku: string
        }[]
      }
      calculate_seasonal_factors: {
        Args: { p_sku: string }
        Returns: undefined
      }
      cleanup_old_audit_logs: {
        Args: { days_to_keep?: number }
        Returns: number
      }
      complete_build_order: {
        Args: { p_build_order_id: string }
        Returns: Json
      }
      create_purchase_order: {
        Args: {
          p_expected_delivery_date?: string
          p_items: Json
          p_notes?: string
          p_requisition_ids?: string[]
          p_vendor_id: string
        }
        Returns: Json
      }
      current_user_department: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      ensure_user_profile: { Args: never; Returns: Json }
      fulfill_purchase_order: {
        Args: { p_actual_delivery_date?: string; p_po_id: string }
        Returns: Json
      }
      generate_po_from_requisitions: {
        Args: { p_requisition_ids: string[]; p_vendor_id: string }
        Returns: Json
      }
      get_ai_budget_status: {
        Args: { p_budget_limit?: number; p_month?: string }
        Returns: {
          budget_limit: number
          month: string
          over_budget: boolean
          percent_used: number
          remaining: number
          service_breakdown: Json
          total_spent: number
        }[]
      }
      get_compliance_by_bom: {
        Args: { p_bom_id: string }
        Returns: {
          compliance_type: string
          days_until_expiration: number
          expiration_date: string
          id: string
          registration_number: string
          state_name: string
          status: string
        }[]
      }
      get_data_sheets_by_bom: {
        Args: { p_bom_id: string }
        Returns: {
          created_at: string
          document_type: string
          id: string
          pdf_url: string
          status: string
          title: string
          version: number
        }[]
      }
      get_expired_compliance: {
        Args: never
        Returns: {
          bom_id: string
          compliance_type: string
          days_overdue: number
          expiration_date: string
          id: string
          registration_number: string
          state_name: string
        }[]
      }
      get_external_source_credentials: {
        Args: { source_id: string }
        Returns: Json
      }
      get_labels_by_bom: {
        Args: { p_bom_id: string }
        Returns: {
          barcode: string
          created_at: string
          file_name: string
          id: string
          product_name: string
          scan_status: string
          verified: boolean
        }[]
      }
      get_latest_data_sheet: {
        Args: { p_bom_id: string; p_document_type: string }
        Returns: {
          content: Json
          id: string
          pdf_url: string
          status: string
          version: number
        }[]
      }
      get_reorder_queue_summary: {
        Args: never
        Returns: {
          avg_days_to_stockout: number
          critical_items: number
          high_priority_items: number
          total_estimated_cost: number
          total_items: number
        }[]
      }
      get_sync_health: {
        Args: never
        Returns: {
          data_type: string
          expected_interval_minutes: number
          is_stale: boolean
          item_count: number
          last_sync_time: string
          minutes_since_sync: number
          success: boolean
        }[]
      }
      get_upcoming_renewals: {
        Args: { p_days_ahead?: number }
        Returns: {
          assigned_to: string
          bom_id: string
          compliance_type: string
          days_until_expiration: number
          expiration_date: string
          id: string
          registration_number: string
          state_name: string
          status: string
        }[]
      }
      get_user_department: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      get_valid_next_statuses: {
        Args: { p_current_status: string; p_table_type: string }
        Returns: {
          requires_role: string
          to_status: string
        }[]
      }
      has_role: { Args: { required_role: string }; Returns: boolean }
      increment_rate_limit: { Args: { source_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      mark_stale_insights: { Args: never; Returns: number }
      publish_data_sheet: {
        Args: { p_data_sheet_id: string; p_user_id: string }
        Returns: string
      }
      refresh_inventory_trends: { Args: never; Returns: undefined }
      search_labels_by_barcode: {
        Args: { p_barcode: string }
        Returns: {
          bom_id: string
          created_at: string
          file_name: string
          id: string
          product_name: string
          scan_status: string
        }[]
      }
      update_all_boms_compliance: { Args: never; Returns: number }
      update_all_compliance_statuses: { Args: never; Returns: number }
      update_bom_compliance_summary: {
        Args: { p_bom_id: string }
        Returns: undefined
      }
      update_sync_status: {
        Args: {
          duration_ms?: number
          error_msg?: string
          new_status: Database["public"]["Enums"]["sync_status"]
          source_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      source_type:
        | "finale_inventory"
        | "quickbooks"
        | "csv_api"
        | "json_api"
        | "custom_webhook"
      sync_frequency:
        | "realtime"
        | "every_15_minutes"
        | "hourly"
        | "daily"
        | "manual"
      sync_status: "never_synced" | "syncing" | "success" | "failed" | "paused"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      source_type: [
        "finale_inventory",
        "quickbooks",
        "csv_api",
        "json_api",
        "custom_webhook",
      ],
      sync_frequency: [
        "realtime",
        "every_15_minutes",
        "hourly",
        "daily",
        "manual",
      ],
      sync_status: ["never_synced", "syncing", "success", "failed", "paused"],
    },
  },
} as const
A new version of Supabase CLI is available: v2.58.5 (currently installed v2.54.11)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
