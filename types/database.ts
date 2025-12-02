export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      ai_usage_tracking: {
        Row: {
          completion_tokens: number
          compliance_tier: string
          created_at: string | null
          estimated_cost: number
          feature_type: string
          id: string
          metadata: Json | null
          model_used: string
          prompt_tokens: number
          total_tokens: number
          user_id: string
        }
        Insert: {
          completion_tokens?: number
          compliance_tier: string
          created_at?: string | null
          estimated_cost?: number
          feature_type: string
          id?: string
          metadata?: Json | null
          model_used: string
          prompt_tokens?: number
          total_tokens?: number
          user_id: string
        }
        Update: {
          completion_tokens?: number
          compliance_tier?: string
          created_at?: string | null
          estimated_cost?: number
          feature_type?: string
          id?: string
          metadata?: Json | null
          model_used?: string
          prompt_tokens?: number
          total_tokens?: number
          user_id?: string
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
      api_audit_log: {
        Row: {
          action: string
          error_message: string | null
          estimated_cost_usd: number | null
          execution_time_ms: number
          id: number
          ip_address: unknown
          request_id: string
          response_size_bytes: number | null
          service: string
          success: boolean
          timestamp: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          execution_time_ms: number
          id?: number
          ip_address?: unknown
          request_id: string
          response_size_bytes?: number | null
          service: string
          success: boolean
          timestamp?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          execution_time_ms?: number
          id?: number
          ip_address?: unknown
          request_id?: string
          response_size_bytes?: number | null
          service?: string
          success?: boolean
          timestamp?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      api_rate_limit_tracking: {
        Row: {
          created_at: string
          id: number
          limit_hit_count: number
          request_count: number
          service: string
          updated_at: string
          user_id: string
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string
          id?: number
          limit_hit_count?: number
          request_count?: number
          service: string
          updated_at?: string
          user_id: string
          window_end: string
          window_start: string
        }
        Update: {
          created_at?: string
          id?: number
          limit_hit_count?: number
          request_count?: number
          service?: string
          updated_at?: string
          user_id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          change_reason: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_name: string | null
          editable_by: string[] | null
          id: string
          is_required: boolean | null
          is_secret: boolean | null
          previous_value: Json | null
          setting_category: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
          validation_schema: Json | null
          visible_to: string[] | null
        }
        Insert: {
          change_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name?: string | null
          editable_by?: string[] | null
          id?: string
          is_required?: boolean | null
          is_secret?: boolean | null
          previous_value?: Json | null
          setting_category: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
          validation_schema?: Json | null
          visible_to?: string[] | null
        }
        Update: {
          change_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name?: string | null
          editable_by?: string[] | null
          id?: string
          is_required?: boolean | null
          is_secret?: boolean | null
          previous_value?: Json | null
          setting_category?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
          validation_schema?: Json | null
          visible_to?: string[] | null
        }
        Relationships: []
      }
      app_variance_thresholds: {
        Row: {
          absolute_threshold: number | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          percentage_threshold: number | null
          severity_level: string
          special_rules: Json | null
          threshold_type: string
          updated_at: string | null
        }
        Insert: {
          absolute_threshold?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          percentage_threshold?: number | null
          severity_level: string
          special_rules?: Json | null
          threshold_type: string
          updated_at?: string | null
        }
        Update: {
          absolute_threshold?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          percentage_threshold?: number | null
          severity_level?: string
          special_rules?: Json | null
          threshold_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      artwork_assets: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          barcode: string | null
          download_url: string | null
          file_name: string
          file_type: string
          id: string
          is_archived: boolean
          last_edited_at: string | null
          last_edited_by: string | null
          legacy_id: string | null
          metadata: Json
          notes: string | null
          preview_url: string | null
          revision: number
          rtp_flag: boolean
          status: string
          storage_path: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          barcode?: string | null
          download_url?: string | null
          file_name: string
          file_type?: string
          id?: string
          is_archived?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          legacy_id?: string | null
          metadata?: Json
          notes?: string | null
          preview_url?: string | null
          revision?: number
          rtp_flag?: boolean
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          barcode?: string | null
          download_url?: string | null
          file_name?: string
          file_type?: string
          id?: string
          is_archived?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          legacy_id?: string | null
          metadata?: Json
          notes?: string | null
          preview_url?: string | null
          revision?: number
          rtp_flag?: boolean
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artwork_assets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artwork_assets_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artwork_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_compliance_checks: {
        Row: {
          asset_id: string
          check_type: string
          checked_at: string | null
          checked_by: string | null
          created_at: string
          findings: Json | null
          id: string
          jurisdiction: string | null
          metadata: Json
          status: string
        }
        Insert: {
          asset_id: string
          check_type: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          findings?: Json | null
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          status?: string
        }
        Update: {
          asset_id?: string
          check_type?: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          findings?: Json | null
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_compliance_checks_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "artwork_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_compliance_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomous_po_settings: {
        Row: {
          auto_approve_below_threshold: number
          autonomous_pricing_enabled: boolean
          autonomous_shipping_enabled: boolean
          created_at: string | null
          id: string
          require_approval_for_pricing: boolean
          require_approval_for_shipping: boolean
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          auto_approve_below_threshold?: number
          autonomous_pricing_enabled?: boolean
          autonomous_shipping_enabled?: boolean
          created_at?: string | null
          id?: string
          require_approval_for_pricing?: boolean
          require_approval_for_shipping?: boolean
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          auto_approve_below_threshold?: number
          autonomous_pricing_enabled?: boolean
          autonomous_shipping_enabled?: boolean
          created_at?: string | null
          id?: string
          require_approval_for_pricing?: boolean
          require_approval_for_shipping?: boolean
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      autonomous_update_approvals: {
        Row: {
          changes: Json
          confidence: number
          created_at: string | null
          id: string
          po_id: string
          requested_at: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          update_type: string
        }
        Insert: {
          changes: Json
          confidence: number
          created_at?: string | null
          id?: string
          po_id: string
          requested_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          status?: string
          update_type: string
        }
        Update: {
          changes?: Json
          confidence?: number
          created_at?: string | null
          id?: string
          po_id?: string
          requested_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          update_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomous_update_approvals_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autonomous_update_approvals_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autonomous_update_approvals_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomous_update_log: {
        Row: {
          applied_at: string | null
          applied_by: string
          approval_id: string | null
          changes: Json
          confidence: number
          created_at: string | null
          id: string
          po_id: string
          source: string
          update_type: string
        }
        Insert: {
          applied_at?: string | null
          applied_by: string
          approval_id?: string | null
          changes: Json
          confidence: number
          created_at?: string | null
          id?: string
          po_id: string
          source: string
          update_type: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string
          approval_id?: string | null
          changes?: Json
          confidence?: number
          created_at?: string | null
          id?: string
          po_id?: string
          source?: string
          update_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomous_update_log_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "autonomous_update_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autonomous_update_log_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autonomous_update_log_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autonomous_update_log_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          is_addon: boolean
          marketing_name: string
          metadata: Json
          plan_id: string
          price_monthly: number
          price_unit: string
          price_yearly: number
          seat_increment: number
          seat_min: number
          stripe_price_monthly_key: string | null
          stripe_price_yearly_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          is_addon?: boolean
          marketing_name: string
          metadata?: Json
          plan_id: string
          price_monthly?: number
          price_unit?: string
          price_yearly?: number
          seat_increment?: number
          seat_min?: number
          stripe_price_monthly_key?: string | null
          stripe_price_yearly_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          is_addon?: boolean
          marketing_name?: string
          metadata?: Json
          plan_id?: string
          price_monthly?: number
          price_unit?: string
          price_yearly?: number
          seat_increment?: number
          seat_min?: number
          stripe_price_monthly_key?: string | null
          stripe_price_yearly_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bom_artwork_assets: {
        Row: {
          asset_id: string
          attached_at: string
          attached_by: string | null
          bom_id: string
          id: string
          is_primary: boolean
          notes: string | null
          usage_type: string
          workflow_state: string
        }
        Insert: {
          asset_id: string
          attached_at?: string
          attached_by?: string | null
          bom_id: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          usage_type?: string
          workflow_state?: string
        }
        Update: {
          asset_id?: string
          attached_at?: string
          attached_by?: string | null
          bom_id?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          usage_type?: string
          workflow_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_artwork_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "artwork_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_artwork_assets_attached_by_fkey"
            columns: ["attached_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_artwork_assets_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_artwork_assets_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms_with_compliance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_artwork_assets_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "compliance_dashboard"
            referencedColumns: ["bom_id"]
          },
        ]
      }
      bom_components: {
        Row: {
          bom_id: string | null
          component_sku: string | null
          created_at: string | null
          id: string
          quantity: number
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          bom_id?: string | null
          component_sku?: string | null
          created_at?: string | null
          id?: string
          quantity: number
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          bom_id?: string | null
          component_sku?: string | null
          created_at?: string | null
          id?: string
          quantity?: number
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_components_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_components_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms_with_compliance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_components_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "compliance_dashboard"
            referencedColumns: ["bom_id"]
          },
        ]
      }
      bom_revisions: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          bom_id: string
          change_diff: Json | null
          change_summary: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          reverted_from_revision_id: string | null
          reviewer_id: string | null
          revision_number: number
          snapshot: Json
          status: string
          summary: string | null
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bom_id: string
          change_diff?: Json | null
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          reverted_from_revision_id?: string | null
          reviewer_id?: string | null
          revision_number: number
          snapshot: Json
          status?: string
          summary?: string | null
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bom_id?: string
          change_diff?: Json | null
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          reverted_from_revision_id?: string | null
          reviewer_id?: string | null
          revision_number?: number
          snapshot?: Json
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_revisions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_revisions_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_revisions_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms_with_compliance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_revisions_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "compliance_dashboard"
            referencedColumns: ["bom_id"]
          },
          {
            foreignKeyName: "bom_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_revisions_reverted_from_revision_id_fkey"
            columns: ["reverted_from_revision_id"]
            isOneToOne: false
            referencedRelation: "bom_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_revisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boms: {
        Row: {
          barcode: string | null
          build_time_minutes: number | null
          compliance_last_checked: string | null
          compliance_status: string | null
          created_at: string | null
          expiring_registrations_count: number | null
          finished_sku: string | null
          id: string
          labor_cost_per_hour: number | null
          last_approved_at: string | null
          last_approved_by: string | null
          name: string
          primary_data_sheet_id: string | null
          primary_label_id: string | null
          revision_approved_at: string | null
          revision_approved_by: string | null
          revision_number: number
          revision_requested_at: string | null
          revision_requested_by: string | null
          revision_reviewer_id: string | null
          revision_status: string
          revision_summary: string | null
          total_state_registrations: number | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          build_time_minutes?: number | null
          compliance_last_checked?: string | null
          compliance_status?: string | null
          created_at?: string | null
          expiring_registrations_count?: number | null
          finished_sku?: string | null
          id?: string
          labor_cost_per_hour?: number | null
          last_approved_at?: string | null
          last_approved_by?: string | null
          name: string
          primary_data_sheet_id?: string | null
          primary_label_id?: string | null
          revision_approved_at?: string | null
          revision_approved_by?: string | null
          revision_number?: number
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          revision_reviewer_id?: string | null
          revision_status?: string
          revision_summary?: string | null
          total_state_registrations?: number | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          build_time_minutes?: number | null
          compliance_last_checked?: string | null
          compliance_status?: string | null
          created_at?: string | null
          expiring_registrations_count?: number | null
          finished_sku?: string | null
          id?: string
          labor_cost_per_hour?: number | null
          last_approved_at?: string | null
          last_approved_by?: string | null
          name?: string
          primary_data_sheet_id?: string | null
          primary_label_id?: string | null
          revision_approved_at?: string | null
          revision_approved_by?: string | null
          revision_number?: number
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          revision_reviewer_id?: string | null
          revision_status?: string
          revision_summary?: string | null
          total_state_registrations?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boms_last_approved_by_fkey"
            columns: ["last_approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
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
            foreignKeyName: "boms_revision_approved_by_fkey"
            columns: ["revision_approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_revision_requested_by_fkey"
            columns: ["revision_requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_revision_reviewer_id_fkey"
            columns: ["revision_reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
            foreignKeyName: "fk_compliance_label_id"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      data_backup_logs: {
        Row: {
          backup_name: string
          backup_size_bytes: number | null
          backup_table: string
          created_at: string | null
          id: string
          last_rollback_at: string | null
          rollback_count: number | null
          rollback_reason: string | null
          row_count: number | null
          source_table: string
          trigger_reason: string | null
          triggered_by: string | null
        }
        Insert: {
          backup_name: string
          backup_size_bytes?: number | null
          backup_table: string
          created_at?: string | null
          id?: string
          last_rollback_at?: string | null
          rollback_count?: number | null
          rollback_reason?: string | null
          row_count?: number | null
          source_table: string
          trigger_reason?: string | null
          triggered_by?: string | null
        }
        Update: {
          backup_name?: string
          backup_size_bytes?: number | null
          backup_table?: string
          created_at?: string | null
          id?: string
          last_rollback_at?: string | null
          rollback_count?: number | null
          rollback_reason?: string | null
          row_count?: number | null
          source_table?: string
          trigger_reason?: string | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      delegation_settings: {
        Row: {
          approval_chain: string[] | null
          assignable_to_roles: string[] | null
          auto_escalate_hours: number | null
          can_assign_roles: string[] | null
          can_create_roles: string[] | null
          created_at: string | null
          created_by: string | null
          escalation_target_role: string | null
          id: string
          notify_on_assign: boolean | null
          notify_on_complete: boolean | null
          notify_on_create: boolean | null
          requires_approval: boolean | null
          restricted_to_departments: string[] | null
          task_type: string
          updated_at: string | null
        }
        Insert: {
          approval_chain?: string[] | null
          assignable_to_roles?: string[] | null
          auto_escalate_hours?: number | null
          can_assign_roles?: string[] | null
          can_create_roles?: string[] | null
          created_at?: string | null
          created_by?: string | null
          escalation_target_role?: string | null
          id?: string
          notify_on_assign?: boolean | null
          notify_on_complete?: boolean | null
          notify_on_create?: boolean | null
          requires_approval?: boolean | null
          restricted_to_departments?: string[] | null
          task_type: string
          updated_at?: string | null
        }
        Update: {
          approval_chain?: string[] | null
          assignable_to_roles?: string[] | null
          auto_escalate_hours?: number | null
          can_assign_roles?: string[] | null
          can_create_roles?: string[] | null
          created_at?: string | null
          created_by?: string | null
          escalation_target_role?: string | null
          id?: string
          notify_on_assign?: boolean | null
          notify_on_complete?: boolean | null
          notify_on_create?: boolean | null
          requires_approval?: boolean | null
          restricted_to_departments?: string[] | null
          task_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      department_notifications: {
        Row: {
          affected_department: string
          created_at: string | null
          id: string
          message: string
          notification_type: string
          notifying_department: string
          requires_response: boolean | null
          responded_at: string | null
          responded_by: string | null
          response_comments: string | null
          response_deadline: string | null
          response_status: string | null
          sop_id: string | null
          submission_id: string | null
          updated_at: string | null
        }
        Insert: {
          affected_department: string
          created_at?: string | null
          id?: string
          message: string
          notification_type: string
          notifying_department: string
          requires_response?: boolean | null
          responded_at?: string | null
          responded_by?: string | null
          response_comments?: string | null
          response_deadline?: string | null
          response_status?: string | null
          sop_id?: string | null
          submission_id?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_department?: string
          created_at?: string | null
          id?: string
          message?: string
          notification_type?: string
          notifying_department?: string
          requires_response?: boolean | null
          responded_at?: string | null
          responded_by?: string | null
          response_comments?: string | null
          response_deadline?: string | null
          response_status?: string | null
          sop_id?: string | null
          submission_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_notifications_affected_department_fkey"
            columns: ["affected_department"]
            isOneToOne: false
            referencedRelation: "sop_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_notifications_notifying_department_fkey"
            columns: ["notifying_department"]
            isOneToOne: false
            referencedRelation: "sop_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_notifications_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sop_repository"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_notifications_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sop_submissions"
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
          layout_config: Json | null
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
          layout_config?: Json | null
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
          layout_config?: Json | null
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
      external_document_servers: {
        Row: {
          config: Json
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          config: Json
          created_at?: string
          created_by: string
          id: string
          is_active?: boolean
          last_synced_at?: string | null
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          name?: string
          type?: string
          updated_at?: string
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
      google_sheets_configs: {
        Row: {
          auto_backup_enabled: boolean | null
          backup_sheet_name: string | null
          backup_spreadsheet_id: string | null
          created_at: string | null
          default_spreadsheet_id: string | null
          export_sheet_name: string | null
          id: string
          import_sheet_name: string | null
          last_backup_at: string | null
          last_export_at: string | null
          last_import_at: string | null
          settings_metadata: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_backup_enabled?: boolean | null
          backup_sheet_name?: string | null
          backup_spreadsheet_id?: string | null
          created_at?: string | null
          default_spreadsheet_id?: string | null
          export_sheet_name?: string | null
          id?: string
          import_sheet_name?: string | null
          last_backup_at?: string | null
          last_export_at?: string | null
          last_import_at?: string | null
          settings_metadata?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_backup_enabled?: boolean | null
          backup_sheet_name?: string | null
          backup_spreadsheet_id?: string | null
          created_at?: string | null
          default_spreadsheet_id?: string | null
          export_sheet_name?: string | null
          id?: string
          import_sheet_name?: string | null
          last_backup_at?: string | null
          last_export_at?: string | null
          last_import_at?: string | null
          settings_metadata?: Json | null
          updated_at?: string | null
          user_id?: string
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
      inventory_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_stock: number | null
          notes: string | null
          performed_at: string | null
          performed_by: string | null
          previous_stock: number | null
          quantity_change: number
          reference_id: string | null
          reference_type: string | null
          sku: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_stock?: number | null
          notes?: string | null
          performed_at?: string | null
          performed_by?: string | null
          previous_stock?: number | null
          quantity_change: number
          reference_id?: string | null
          reference_type?: string | null
          sku: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_stock?: number | null
          notes?: string | null
          performed_at?: string | null
          performed_by?: string | null
          previous_stock?: number | null
          quantity_change?: number
          reference_id?: string | null
          reference_type?: string | null
          sku?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          bin_location: string | null
          category: string | null
          created_at: string | null
          currency: string | null
          data_source: string | null
          description: string | null
          dimensions: string | null
          facility_id: string | null
          id: string
          last_purchase_date: string | null
          last_sync_at: string | null
          lot_tracking: boolean | null
          moq: number | null
          name: string
          on_order: number | null
          qty_to_order: number | null
          reorder_point: number | null
          reorder_variance: number | null
          sales_last_30_days: number | null
          sales_last_60_days: number | null
          sales_last_90_days: number | null
          sales_velocity_consolidated: number | null
          sku: string
          status: string | null
          stock: number | null
          supplier_sku: string | null
          sync_errors: string | null
          sync_status: string | null
          unit_cost: number | null
          unit_price: number | null
          units_available: number | null
          units_in_stock: number | null
          units_on_order: number | null
          units_reserved: number | null
          upc: string | null
          updated_at: string | null
          vendor_id: string | null
          warehouse_location: string | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          bin_location?: string | null
          category?: string | null
          created_at?: string | null
          currency?: string | null
          data_source?: string | null
          description?: string | null
          dimensions?: string | null
          facility_id?: string | null
          id?: string
          last_purchase_date?: string | null
          last_sync_at?: string | null
          lot_tracking?: boolean | null
          moq?: number | null
          name: string
          on_order?: number | null
          qty_to_order?: number | null
          reorder_point?: number | null
          reorder_variance?: number | null
          sales_last_30_days?: number | null
          sales_last_60_days?: number | null
          sales_last_90_days?: number | null
          sales_velocity_consolidated?: number | null
          sku: string
          status?: string | null
          stock?: number | null
          supplier_sku?: string | null
          sync_errors?: string | null
          sync_status?: string | null
          unit_cost?: number | null
          unit_price?: number | null
          units_available?: number | null
          units_in_stock?: number | null
          units_on_order?: number | null
          units_reserved?: number | null
          upc?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          warehouse_location?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          bin_location?: string | null
          category?: string | null
          created_at?: string | null
          currency?: string | null
          data_source?: string | null
          description?: string | null
          dimensions?: string | null
          facility_id?: string | null
          id?: string
          last_purchase_date?: string | null
          last_sync_at?: string | null
          lot_tracking?: boolean | null
          moq?: number | null
          name?: string
          on_order?: number | null
          qty_to_order?: number | null
          reorder_point?: number | null
          reorder_variance?: number | null
          sales_last_30_days?: number | null
          sales_last_60_days?: number | null
          sales_last_90_days?: number | null
          sales_velocity_consolidated?: number | null
          sku?: string
          status?: string | null
          stock?: number | null
          supplier_sku?: string | null
          sync_errors?: string | null
          sync_status?: string | null
          unit_cost?: number | null
          unit_price?: number | null
          units_available?: number | null
          units_in_stock?: number | null
          units_on_order?: number | null
          units_reserved?: number | null
          upc?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          warehouse_location?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: [
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
      inventory_items_backup: {
        Row: {
          backup_at: string | null
          backup_id: string
          backup_reason: string | null
          backup_source: string | null
          category: string | null
          created_at: string | null
          custom_fields: Json | null
          description: string | null
          dimensions: Json | null
          finale_id: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          location: string | null
          name: string | null
          quantity_on_hand: number | null
          reorder_point: number | null
          reorder_quantity: number | null
          sku: string | null
          supplier_id: string | null
          supplier_name: string | null
          unit_cost: number | null
          unit_price: number | null
          upc: string | null
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          backup_at?: string | null
          backup_id?: string
          backup_reason?: string | null
          backup_source?: string | null
          category?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          description?: string | null
          dimensions?: Json | null
          finale_id?: string | null
          id: string
          is_active?: boolean | null
          last_synced_at?: string | null
          location?: string | null
          name?: string | null
          quantity_on_hand?: number | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          sku?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost?: number | null
          unit_price?: number | null
          upc?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          backup_at?: string | null
          backup_id?: string
          backup_reason?: string | null
          backup_source?: string | null
          category?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          description?: string | null
          dimensions?: Json | null
          finale_id?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          location?: string | null
          name?: string | null
          quantity_on_hand?: number | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          sku?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost?: number | null
          unit_price?: number | null
          upc?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: []
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
        ]
      }
      mcp_server_configs: {
        Row: {
          ai_provider_config: Json | null
          anthropic_api_key: string | null
          api_key: string | null
          auto_start: boolean | null
          available_tools: Json | null
          average_response_time_ms: number | null
          command: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_name: string
          endpoint_url: string | null
          environment_vars: Json | null
          error_message: string | null
          failed_requests: number | null
          health_status: string | null
          id: string
          is_enabled: boolean | null
          is_local: boolean | null
          last_health_check: string | null
          max_restart_attempts: number | null
          notes: string | null
          override_ai_provider: boolean | null
          rate_limit_per_hour: number | null
          restart_on_failure: boolean | null
          retry_attempts: number | null
          server_name: string
          server_type: string
          server_url: string
          settings: Json | null
          status: string | null
          successful_requests: number | null
          timeout_seconds: number | null
          tool_permissions: Json | null
          total_requests: number | null
          updated_at: string | null
          updated_by: string | null
          working_directory: string | null
        }
        Insert: {
          ai_provider_config?: Json | null
          anthropic_api_key?: string | null
          api_key?: string | null
          auto_start?: boolean | null
          available_tools?: Json | null
          average_response_time_ms?: number | null
          command?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name: string
          endpoint_url?: string | null
          environment_vars?: Json | null
          error_message?: string | null
          failed_requests?: number | null
          health_status?: string | null
          id?: string
          is_enabled?: boolean | null
          is_local?: boolean | null
          last_health_check?: string | null
          max_restart_attempts?: number | null
          notes?: string | null
          override_ai_provider?: boolean | null
          rate_limit_per_hour?: number | null
          restart_on_failure?: boolean | null
          retry_attempts?: number | null
          server_name: string
          server_type?: string
          server_url: string
          settings?: Json | null
          status?: string | null
          successful_requests?: number | null
          timeout_seconds?: number | null
          tool_permissions?: Json | null
          total_requests?: number | null
          updated_at?: string | null
          updated_by?: string | null
          working_directory?: string | null
        }
        Update: {
          ai_provider_config?: Json | null
          anthropic_api_key?: string | null
          api_key?: string | null
          auto_start?: boolean | null
          available_tools?: Json | null
          average_response_time_ms?: number | null
          command?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name?: string
          endpoint_url?: string | null
          environment_vars?: Json | null
          error_message?: string | null
          failed_requests?: number | null
          health_status?: string | null
          id?: string
          is_enabled?: boolean | null
          is_local?: boolean | null
          last_health_check?: string | null
          max_restart_attempts?: number | null
          notes?: string | null
          override_ai_provider?: boolean | null
          rate_limit_per_hour?: number | null
          restart_on_failure?: boolean | null
          retry_attempts?: number | null
          server_name?: string
          server_type?: string
          server_url?: string
          settings?: Json | null
          status?: string | null
          successful_requests?: number | null
          timeout_seconds?: number | null
          tool_permissions?: Json | null
          total_requests?: number | null
          updated_at?: string | null
          updated_by?: string | null
          working_directory?: string | null
        }
        Relationships: []
      }
      mcp_tool_calls: {
        Row: {
          ai_cost_usd: number | null
          ai_model: string | null
          ai_provider: string | null
          ai_tokens_used: number | null
          arguments: Json | null
          called_at: string | null
          called_by: string | null
          completed_at: string | null
          context: string | null
          cost_usd: number | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          error_stack: string | null
          execution_time_ms: number | null
          id: string
          input_params: Json | null
          output_result: Json | null
          result: Json | null
          server_name: string
          session_id: string | null
          started_at: string | null
          status: string
          tokens_used: number | null
          tool_name: string
          user_id: string | null
        }
        Insert: {
          ai_cost_usd?: number | null
          ai_model?: string | null
          ai_provider?: string | null
          ai_tokens_used?: number | null
          arguments?: Json | null
          called_at?: string | null
          called_by?: string | null
          completed_at?: string | null
          context?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          execution_time_ms?: number | null
          id?: string
          input_params?: Json | null
          output_result?: Json | null
          result?: Json | null
          server_name: string
          session_id?: string | null
          started_at?: string | null
          status: string
          tokens_used?: number | null
          tool_name: string
          user_id?: string | null
        }
        Update: {
          ai_cost_usd?: number | null
          ai_model?: string | null
          ai_provider?: string | null
          ai_tokens_used?: number | null
          arguments?: Json | null
          called_at?: string | null
          called_by?: string | null
          completed_at?: string | null
          context?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          execution_time_ms?: number | null
          id?: string
          input_params?: Json | null
          output_result?: Json | null
          result?: Json | null
          server_name?: string
          session_id?: string | null
          started_at?: string | null
          status?: string
          tokens_used?: number | null
          tool_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      multi_state_compliance_reports: {
        Row: {
          ai_model_used: string | null
          bom_id: string | null
          critical_issues: number | null
          estimated_compliance_cost: string | null
          estimated_timeline: string | null
          expires_at: string | null
          generated_at: string | null
          generated_by: string | null
          high_priority_issues: number | null
          id: string
          overall_compliance_status: string
          product_id: string | null
          report_name: string
          required_changes: Json[] | null
          reviewed: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
          state_results: Json
          states_included: string[]
          strictest_state: string | null
          total_issues_found: number | null
          user_id: string
        }
        Insert: {
          ai_model_used?: string | null
          bom_id?: string | null
          critical_issues?: number | null
          estimated_compliance_cost?: string | null
          estimated_timeline?: string | null
          expires_at?: string | null
          generated_at?: string | null
          generated_by?: string | null
          high_priority_issues?: number | null
          id?: string
          overall_compliance_status: string
          product_id?: string | null
          report_name: string
          required_changes?: Json[] | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state_results: Json
          states_included: string[]
          strictest_state?: string | null
          total_issues_found?: number | null
          user_id: string
        }
        Update: {
          ai_model_used?: string | null
          bom_id?: string | null
          critical_issues?: number | null
          estimated_compliance_cost?: string | null
          estimated_timeline?: string | null
          expires_at?: string | null
          generated_at?: string | null
          generated_by?: string | null
          high_priority_issues?: number | null
          id?: string
          overall_compliance_status?: string
          product_id?: string | null
          report_name?: string
          required_changes?: Json[] | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state_results?: Json
          states_included?: string[]
          strictest_state?: string | null
          total_issues_found?: number | null
          user_id?: string
        }
        Relationships: []
      }
      new_product_alerts: {
        Row: {
          alert_type: string
          category: string
          created_at: string | null
          created_by: string | null
          details: Json | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          priority: string
          product_name: string
          read_at: string | null
          read_by: string | null
          sku: string
          updated_at: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          alert_type: string
          category: string
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          priority?: string
          product_name: string
          read_at?: string | null
          read_by?: string | null
          sku: string
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          alert_type?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          priority?: string
          product_name?: string
          read_at?: string | null
          read_by?: string | null
          sku?: string
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          category: string
          created_at: string | null
          default_priority: string | null
          email_html_template: string | null
          id: string
          message_template: string
          requires_action: boolean | null
          slack_blocks_template: Json | null
          template_key: string
          title_template: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          default_priority?: string | null
          email_html_template?: string | null
          id?: string
          message_template: string
          requires_action?: boolean | null
          slack_blocks_template?: Json | null
          template_key: string
          title_template: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          default_priority?: string | null
          email_html_template?: string | null
          id?: string
          message_template?: string
          requires_action?: boolean | null
          slack_blocks_template?: Json | null
          template_key?: string
          title_template?: string
          updated_at?: string | null
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
          layout_config: Json | null
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
          layout_config?: Json | null
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
          layout_config?: Json | null
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
      po_followup_campaign_state: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          last_sent_at: string | null
          last_stage: number
          po_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          last_sent_at?: string | null
          last_stage?: number
          po_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          last_sent_at?: string | null
          last_stage?: number
          po_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_followup_campaign_state_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "po_followup_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_followup_campaign_state_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_followup_campaign_state_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_followup_campaign_state_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_followup_campaigns: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      po_followup_rules: {
        Row: {
          active: boolean
          body_template: string
          campaign_id: string
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
          campaign_id: string
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
          campaign_id?: string
          created_at?: string
          id?: string
          instructions?: string | null
          stage?: number
          subject_template?: string
          updated_at?: string
          wait_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_followup_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "po_followup_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      po_invoice_data: {
        Row: {
          ap_email_address: string | null
          ap_reference_number: string | null
          confidence_score: number | null
          created_at: string | null
          currency: string | null
          extracted_at: string | null
          extraction_method: string | null
          forwarded_at: string | null
          forwarded_to_ap: boolean | null
          id: string
          invoice_date: string | null
          invoice_due_date: string | null
          invoice_number: string | null
          line_items: Json | null
          po_id: string
          raw_extracted_data: Json | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          ship_to_address: string | null
          ship_to_name: string | null
          shipping_amount: number | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string | null
          vendor_address: string | null
          vendor_contact: string | null
          vendor_name: string | null
        }
        Insert: {
          ap_email_address?: string | null
          ap_reference_number?: string | null
          confidence_score?: number | null
          created_at?: string | null
          currency?: string | null
          extracted_at?: string | null
          extraction_method?: string | null
          forwarded_at?: string | null
          forwarded_to_ap?: boolean | null
          id?: string
          invoice_date?: string | null
          invoice_due_date?: string | null
          invoice_number?: string | null
          line_items?: Json | null
          po_id: string
          raw_extracted_data?: Json | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          ship_to_address?: string | null
          ship_to_name?: string | null
          shipping_amount?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_address?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Update: {
          ap_email_address?: string | null
          ap_reference_number?: string | null
          confidence_score?: number | null
          created_at?: string | null
          currency?: string | null
          extracted_at?: string | null
          extraction_method?: string | null
          forwarded_at?: string | null
          forwarded_to_ap?: boolean | null
          id?: string
          invoice_date?: string | null
          invoice_due_date?: string | null
          invoice_number?: string | null
          line_items?: Json | null
          po_id?: string
          raw_extracted_data?: Json | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          ship_to_address?: string | null
          ship_to_name?: string | null
          shipping_amount?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_address?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_invoice_data_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_data_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_data_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_invoice_variances: {
        Row: {
          approval_rule: string | null
          auto_approved: boolean | null
          created_at: string | null
          id: string
          internal_sku: string | null
          invoice_amount: number | null
          invoice_data_id: string | null
          invoice_sku: string | null
          item_description: string | null
          po_amount: number | null
          po_id: string
          po_item_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string | null
          threshold_amount: number | null
          threshold_percentage: number | null
          updated_at: string | null
          variance_amount: number | null
          variance_percentage: number | null
          variance_type: string
        }
        Insert: {
          approval_rule?: string | null
          auto_approved?: boolean | null
          created_at?: string | null
          id?: string
          internal_sku?: string | null
          invoice_amount?: number | null
          invoice_data_id?: string | null
          invoice_sku?: string | null
          item_description?: string | null
          po_amount?: number | null
          po_id: string
          po_item_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string | null
          threshold_amount?: number | null
          threshold_percentage?: number | null
          updated_at?: string | null
          variance_amount?: number | null
          variance_percentage?: number | null
          variance_type: string
        }
        Update: {
          approval_rule?: string | null
          auto_approved?: boolean | null
          created_at?: string | null
          id?: string
          internal_sku?: string | null
          invoice_amount?: number | null
          invoice_data_id?: string | null
          invoice_sku?: string | null
          item_description?: string | null
          po_amount?: number | null
          po_id?: string
          po_item_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string | null
          threshold_amount?: number | null
          threshold_percentage?: number | null
          updated_at?: string | null
          variance_amount?: number | null
          variance_percentage?: number | null
          variance_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_invoice_variances_invoice_data_id_fkey"
            columns: ["invoice_data_id"]
            isOneToOne: false
            referencedRelation: "active_invoice_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_variances_invoice_data_id_fkey"
            columns: ["invoice_data_id"]
            isOneToOne: false
            referencedRelation: "po_invoice_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_variances_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_variances_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_variances_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_variances_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
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
      po_shipment_data: {
        Row: {
          actual_delivery_date: string | null
          ai_confidence: number | null
          ai_extraction: Json
          carrier: string | null
          carrier_confidence: number | null
          created_at: string
          estimated_delivery_date: string | null
          extracted_at: string
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          manual_override: boolean
          notes: string | null
          po_id: string
          requires_review: boolean
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          ship_date: string | null
          shipment_number: string | null
          status: string
          status_updated_at: string
          total_quantity_ordered: number | null
          total_quantity_shipped: number | null
          tracking_numbers: string[]
          updated_at: string
        }
        Insert: {
          actual_delivery_date?: string | null
          ai_confidence?: number | null
          ai_extraction?: Json
          carrier?: string | null
          carrier_confidence?: number | null
          created_at?: string
          estimated_delivery_date?: string | null
          extracted_at?: string
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          manual_override?: boolean
          notes?: string | null
          po_id: string
          requires_review?: boolean
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          ship_date?: string | null
          shipment_number?: string | null
          status?: string
          status_updated_at?: string
          total_quantity_ordered?: number | null
          total_quantity_shipped?: number | null
          tracking_numbers?: string[]
          updated_at?: string
        }
        Update: {
          actual_delivery_date?: string | null
          ai_confidence?: number | null
          ai_extraction?: Json
          carrier?: string | null
          carrier_confidence?: number | null
          created_at?: string
          estimated_delivery_date?: string | null
          extracted_at?: string
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          manual_override?: boolean
          notes?: string | null
          po_id?: string
          requires_review?: boolean
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          ship_date?: string | null
          shipment_number?: string | null
          status?: string
          status_updated_at?: string
          total_quantity_ordered?: number | null
          total_quantity_shipped?: number | null
          tracking_numbers?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_shipment_data_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_shipment_data_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_shipment_data_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_shipment_items: {
        Row: {
          carrier: string | null
          created_at: string
          id: string
          internal_sku: string | null
          item_description: string | null
          po_item_id: string | null
          quantity_ordered: number | null
          quantity_shipped: number
          shipment_id: string
          status: string
          tracking_number: string | null
          updated_at: string
          vendor_sku: string | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          id?: string
          internal_sku?: string | null
          item_description?: string | null
          po_item_id?: string | null
          quantity_ordered?: number | null
          quantity_shipped: number
          shipment_id: string
          status?: string
          tracking_number?: string | null
          updated_at?: string
          vendor_sku?: string | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          id?: string
          internal_sku?: string | null
          item_description?: string | null
          po_item_id?: string | null
          quantity_ordered?: number | null
          quantity_shipped?: number
          shipment_id?: string
          status?: string
          tracking_number?: string | null
          updated_at?: string
          vendor_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_shipment_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "po_shipment_data"
            referencedColumns: ["id"]
          },
        ]
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
      po_vendor_communications: {
        Row: {
          action_reasoning: string | null
          ai_confidence: number | null
          ai_cost_usd: number | null
          ai_extracted: boolean | null
          attachments: Json | null
          body_preview: string | null
          communication_type: string
          correlation_confidence: number | null
          created_at: string | null
          direction: string
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          extracted_data: Json | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          metadata: Json | null
          po_id: string
          received_at: string | null
          recipient_email: string | null
          requires_user_action: boolean | null
          response_category:
            | Database["public"]["Enums"]["vendor_response_category"]
            | null
          sender_email: string | null
          sent_at: string | null
          stage: number | null
          subject: string | null
          suggested_action:
            | Database["public"]["Enums"]["vendor_suggested_action"]
            | null
          user_action_taken_at: string | null
          user_action_taken_by: string | null
          user_action_type: string | null
        }
        Insert: {
          action_reasoning?: string | null
          ai_confidence?: number | null
          ai_cost_usd?: number | null
          ai_extracted?: boolean | null
          attachments?: Json | null
          body_preview?: string | null
          communication_type: string
          correlation_confidence?: number | null
          created_at?: string | null
          direction: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          extracted_data?: Json | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          metadata?: Json | null
          po_id: string
          received_at?: string | null
          recipient_email?: string | null
          requires_user_action?: boolean | null
          response_category?:
            | Database["public"]["Enums"]["vendor_response_category"]
            | null
          sender_email?: string | null
          sent_at?: string | null
          stage?: number | null
          subject?: string | null
          suggested_action?:
            | Database["public"]["Enums"]["vendor_suggested_action"]
            | null
          user_action_taken_at?: string | null
          user_action_taken_by?: string | null
          user_action_type?: string | null
        }
        Update: {
          action_reasoning?: string | null
          ai_confidence?: number | null
          ai_cost_usd?: number | null
          ai_extracted?: boolean | null
          attachments?: Json | null
          body_preview?: string | null
          communication_type?: string
          correlation_confidence?: number | null
          created_at?: string | null
          direction?: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          extracted_data?: Json | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          metadata?: Json | null
          po_id?: string
          received_at?: string | null
          recipient_email?: string | null
          requires_user_action?: boolean | null
          response_category?:
            | Database["public"]["Enums"]["vendor_response_category"]
            | null
          sender_email?: string | null
          sent_at?: string | null
          stage?: number | null
          subject?: string | null
          suggested_action?:
            | Database["public"]["Enums"]["vendor_suggested_action"]
            | null
          user_action_taken_at?: string | null
          user_action_taken_by?: string | null
          user_action_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_vendor_communications_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_vendor_communications_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_vendor_communications_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pricelist_changes: {
        Row: {
          absolute_change: number | null
          category: string | null
          change_type: string
          created_at: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          percentage_change: number | null
          previous_pricelist_id: string | null
          pricelist_id: string | null
          product_description: string | null
          severity: string | null
          sku: string | null
        }
        Insert: {
          absolute_change?: number | null
          category?: string | null
          change_type: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          percentage_change?: number | null
          previous_pricelist_id?: string | null
          pricelist_id?: string | null
          product_description?: string | null
          severity?: string | null
          sku?: string | null
        }
        Update: {
          absolute_change?: number | null
          category?: string | null
          change_type?: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          percentage_change?: number | null
          previous_pricelist_id?: string | null
          pricelist_id?: string | null
          product_description?: string | null
          severity?: string | null
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricelist_changes_previous_pricelist_id_fkey"
            columns: ["previous_pricelist_id"]
            isOneToOne: false
            referencedRelation: "vendor_pricelists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelist_changes_pricelist_id_fkey"
            columns: ["pricelist_id"]
            isOneToOne: false
            referencedRelation: "vendor_pricelists"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_audit_log: {
        Row: {
          change_reason: string | null
          change_source: string | null
          change_type: string
          changed_at: string | null
          changed_by: string | null
          id: string
          internal_sku: string | null
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          pricing_change_proposal_id: string | null
          product_pricing_id: string | null
          session_id: string | null
          user_agent: string | null
          vendor_id: string | null
          vendor_sku: string | null
        }
        Insert: {
          change_reason?: string | null
          change_source?: string | null
          change_type: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          internal_sku?: string | null
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          pricing_change_proposal_id?: string | null
          product_pricing_id?: string | null
          session_id?: string | null
          user_agent?: string | null
          vendor_id?: string | null
          vendor_sku?: string | null
        }
        Update: {
          change_reason?: string | null
          change_source?: string | null
          change_type?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          internal_sku?: string | null
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          pricing_change_proposal_id?: string | null
          product_pricing_id?: string | null
          session_id?: string | null
          user_agent?: string | null
          vendor_id?: string | null
          vendor_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_audit_log_pricing_change_proposal_id_fkey"
            columns: ["pricing_change_proposal_id"]
            isOneToOne: false
            referencedRelation: "pricing_change_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_audit_log_pricing_change_proposal_id_fkey"
            columns: ["pricing_change_proposal_id"]
            isOneToOne: false
            referencedRelation: "pricing_management_view"
            referencedColumns: ["pending_proposal_id"]
          },
          {
            foreignKeyName: "pricing_audit_log_pricing_change_proposal_id_fkey"
            columns: ["pricing_change_proposal_id"]
            isOneToOne: false
            referencedRelation: "pricing_proposals_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_audit_log_product_pricing_id_fkey"
            columns: ["product_pricing_id"]
            isOneToOne: false
            referencedRelation: "pricing_management_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_audit_log_product_pricing_id_fkey"
            columns: ["product_pricing_id"]
            isOneToOne: false
            referencedRelation: "product_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_change_proposals: {
        Row: {
          change_impact: string | null
          change_reason: string | null
          cost_change_amount: number | null
          cost_change_percentage: number | null
          created_at: string | null
          created_by: string | null
          id: string
          implemented_at: string | null
          implemented_by: string | null
          price_change_amount: number | null
          price_change_percentage: number | null
          pricelist_item_data: Json | null
          product_pricing_id: string
          proposed_currency: string | null
          proposed_effective_date: string | null
          proposed_unit_cost: number | null
          proposed_unit_price: number | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string | null
          vendor_pricelist_id: string
          vendor_product_name: string | null
          vendor_sku: string | null
        }
        Insert: {
          change_impact?: string | null
          change_reason?: string | null
          cost_change_amount?: number | null
          cost_change_percentage?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          implemented_at?: string | null
          implemented_by?: string | null
          price_change_amount?: number | null
          price_change_percentage?: number | null
          pricelist_item_data?: Json | null
          product_pricing_id: string
          proposed_currency?: string | null
          proposed_effective_date?: string | null
          proposed_unit_cost?: number | null
          proposed_unit_price?: number | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_pricelist_id: string
          vendor_product_name?: string | null
          vendor_sku?: string | null
        }
        Update: {
          change_impact?: string | null
          change_reason?: string | null
          cost_change_amount?: number | null
          cost_change_percentage?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          implemented_at?: string | null
          implemented_by?: string | null
          price_change_amount?: number | null
          price_change_percentage?: number | null
          pricelist_item_data?: Json | null
          product_pricing_id?: string
          proposed_currency?: string | null
          proposed_effective_date?: string | null
          proposed_unit_cost?: number | null
          proposed_unit_price?: number | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_pricelist_id?: string
          vendor_product_name?: string | null
          vendor_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_change_proposals_product_pricing_id_fkey"
            columns: ["product_pricing_id"]
            isOneToOne: false
            referencedRelation: "pricing_management_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_change_proposals_product_pricing_id_fkey"
            columns: ["product_pricing_id"]
            isOneToOne: false
            referencedRelation: "product_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_change_proposals_vendor_pricelist_id_fkey"
            columns: ["vendor_pricelist_id"]
            isOneToOne: false
            referencedRelation: "vendor_pricelists"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_revisions: {
        Row: {
          change_reason: string | null
          change_type: string
          changed_at: string | null
          changed_by: string | null
          currency: string | null
          effective_date: string | null
          id: string
          margin_percentage: number | null
          markup_percentage: number | null
          pricing_strategy: string | null
          product_pricing_id: string
          revision_notes: string | null
          revision_number: number
          unit_cost: number | null
          unit_price: number | null
        }
        Insert: {
          change_reason?: string | null
          change_type: string
          changed_at?: string | null
          changed_by?: string | null
          currency?: string | null
          effective_date?: string | null
          id?: string
          margin_percentage?: number | null
          markup_percentage?: number | null
          pricing_strategy?: string | null
          product_pricing_id: string
          revision_notes?: string | null
          revision_number: number
          unit_cost?: number | null
          unit_price?: number | null
        }
        Update: {
          change_reason?: string | null
          change_type?: string
          changed_at?: string | null
          changed_by?: string | null
          currency?: string | null
          effective_date?: string | null
          id?: string
          margin_percentage?: number | null
          markup_percentage?: number | null
          pricing_strategy?: string | null
          product_pricing_id?: string
          revision_notes?: string | null
          revision_number?: number
          unit_cost?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_revisions_product_pricing_id_fkey"
            columns: ["product_pricing_id"]
            isOneToOne: false
            referencedRelation: "pricing_management_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_revisions_product_pricing_id_fkey"
            columns: ["product_pricing_id"]
            isOneToOne: false
            referencedRelation: "product_pricing"
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
            foreignKeyName: "fk_pds_label_id"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      product_pricing: {
        Row: {
          approval_notes: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          current_currency: string | null
          current_effective_date: string | null
          current_unit_cost: number | null
          current_unit_price: number | null
          id: string
          internal_sku: string
          margin_percentage: number | null
          markup_percentage: number | null
          pricing_strategy: string | null
          updated_at: string | null
          updated_by: string | null
          vendor_id: string | null
          vendor_pricelist_id: string | null
          vendor_sku_mapping_id: string | null
        }
        Insert: {
          approval_notes?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          current_currency?: string | null
          current_effective_date?: string | null
          current_unit_cost?: number | null
          current_unit_price?: number | null
          id?: string
          internal_sku: string
          margin_percentage?: number | null
          markup_percentage?: number | null
          pricing_strategy?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          vendor_pricelist_id?: string | null
          vendor_sku_mapping_id?: string | null
        }
        Update: {
          approval_notes?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          current_currency?: string | null
          current_effective_date?: string | null
          current_unit_cost?: number | null
          current_unit_price?: number | null
          id?: string
          internal_sku?: string
          margin_percentage?: number | null
          markup_percentage?: number | null
          pricing_strategy?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          vendor_pricelist_id?: string | null
          vendor_sku_mapping_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_pricing_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_details"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_pricing_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_pricing_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_trends"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_pricing_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "product_pricing_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pricing_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pricing_vendor_pricelist_id_fkey"
            columns: ["vendor_pricelist_id"]
            isOneToOne: false
            referencedRelation: "vendor_pricelists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pricing_vendor_sku_mapping_id_fkey"
            columns: ["vendor_sku_mapping_id"]
            isOneToOne: false
            referencedRelation: "vendor_sku_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_end_date: string | null
          board_columns: Json | null
          code: string | null
          created_at: string | null
          default_assignee_id: string | null
          delegate_id: string
          department: string | null
          description: string | null
          id: string
          metadata: Json | null
          name: string
          owner_id: string
          project_type: string | null
          start_date: string
          status: string | null
          tags: string[] | null
          target_end_date: string
          updated_at: string | null
        }
        Insert: {
          actual_end_date?: string | null
          board_columns?: Json | null
          code?: string | null
          created_at?: string | null
          default_assignee_id?: string | null
          delegate_id: string
          department?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          name: string
          owner_id: string
          project_type?: string | null
          start_date: string
          status?: string | null
          tags?: string[] | null
          target_end_date: string
          updated_at?: string | null
        }
        Update: {
          actual_end_date?: string | null
          board_columns?: Json | null
          code?: string | null
          created_at?: string | null
          default_assignee_id?: string | null
          delegate_id?: string
          department?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          owner_id?: string
          project_type?: string | null
          start_date?: string
          status?: string | null
          tags?: string[] | null
          target_end_date?: string
          updated_at?: string | null
        }
        Relationships: []
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
          escalation_level: number | null
          expected_date: string | null
          finale_po_id: string | null
          finale_status: string | null
          follow_up_required: boolean | null
          follow_up_status:
            | Database["public"]["Enums"]["vendor_response_status"]
            | null
          generation_reason: string | null
          id: string
          internal_notes: string | null
          invoice_ap_email: string | null
          invoice_ap_reference: string | null
          invoice_data: Json | null
          invoice_detected_at: string | null
          invoice_forwarded_to_ap: boolean | null
          invoice_gmail_message_id: string | null
          invoice_summary: Json | null
          invoice_variance_alerts: Json | null
          last_finale_sync: string | null
          last_follow_up_sent_at: string | null
          last_follow_up_stage: number | null
          next_follow_up_due_at: string | null
          order_date: string
          order_id: string
          payment_terms: string | null
          pricelist_gmail_message_id: string | null
          pricelist_received_at: string | null
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
          vendor_response_email_id: string | null
          vendor_response_received_at: string | null
          vendor_response_status:
            | Database["public"]["Enums"]["vendor_response_status"]
            | null
          vendor_response_summary: Json | null
          vendor_response_thread_id: string | null
          verification_notes: string | null
          verification_required: boolean | null
          verified_at: string | null
          verified_by: string | null
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
          escalation_level?: number | null
          expected_date?: string | null
          finale_po_id?: string | null
          finale_status?: string | null
          follow_up_required?: boolean | null
          follow_up_status?:
            | Database["public"]["Enums"]["vendor_response_status"]
            | null
          generation_reason?: string | null
          id?: string
          internal_notes?: string | null
          invoice_ap_email?: string | null
          invoice_ap_reference?: string | null
          invoice_data?: Json | null
          invoice_detected_at?: string | null
          invoice_forwarded_to_ap?: boolean | null
          invoice_gmail_message_id?: string | null
          invoice_summary?: Json | null
          invoice_variance_alerts?: Json | null
          last_finale_sync?: string | null
          last_follow_up_sent_at?: string | null
          last_follow_up_stage?: number | null
          next_follow_up_due_at?: string | null
          order_date?: string
          order_id: string
          payment_terms?: string | null
          pricelist_gmail_message_id?: string | null
          pricelist_received_at?: string | null
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
          vendor_response_email_id?: string | null
          vendor_response_received_at?: string | null
          vendor_response_status?:
            | Database["public"]["Enums"]["vendor_response_status"]
            | null
          vendor_response_summary?: Json | null
          vendor_response_thread_id?: string | null
          verification_notes?: string | null
          verification_required?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
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
          escalation_level?: number | null
          expected_date?: string | null
          finale_po_id?: string | null
          finale_status?: string | null
          follow_up_required?: boolean | null
          follow_up_status?:
            | Database["public"]["Enums"]["vendor_response_status"]
            | null
          generation_reason?: string | null
          id?: string
          internal_notes?: string | null
          invoice_ap_email?: string | null
          invoice_ap_reference?: string | null
          invoice_data?: Json | null
          invoice_detected_at?: string | null
          invoice_forwarded_to_ap?: boolean | null
          invoice_gmail_message_id?: string | null
          invoice_summary?: Json | null
          invoice_variance_alerts?: Json | null
          last_finale_sync?: string | null
          last_follow_up_sent_at?: string | null
          last_follow_up_stage?: number | null
          next_follow_up_due_at?: string | null
          order_date?: string
          order_id?: string
          payment_terms?: string | null
          pricelist_gmail_message_id?: string | null
          pricelist_received_at?: string | null
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
          vendor_response_email_id?: string | null
          vendor_response_received_at?: string | null
          vendor_response_status?:
            | Database["public"]["Enums"]["vendor_response_status"]
            | null
          vendor_response_summary?: Json | null
          vendor_response_thread_id?: string | null
          verification_notes?: string | null
          verification_required?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
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
      scraping_configs: {
        Row: {
          ai_extraction_prompt: string | null
          base_url: string
          config_name: string
          created_at: string | null
          created_by: string | null
          data_transformations: Json | null
          description: string | null
          domain: string | null
          exclude_patterns: string[] | null
          failed_scrapes: number | null
          field_mappings: Json | null
          headers: Json | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          last_success_at: string | null
          last_successful_scrape: string | null
          min_content_length: number | null
          next_run_at: string | null
          notes: string | null
          pagination: Json | null
          rate_limit_ms: number | null
          required_keywords: string[] | null
          save_to_table: string | null
          schedule_cron: string | null
          selectors: Json
          success_rate: number | null
          total_scrapes: number | null
          updated_at: string | null
          updated_by: string | null
          url_pattern: string | null
          use_ai_extraction: boolean | null
          user_agent: string | null
          validate_json_schema: Json | null
        }
        Insert: {
          ai_extraction_prompt?: string | null
          base_url: string
          config_name: string
          created_at?: string | null
          created_by?: string | null
          data_transformations?: Json | null
          description?: string | null
          domain?: string | null
          exclude_patterns?: string[] | null
          failed_scrapes?: number | null
          field_mappings?: Json | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          last_success_at?: string | null
          last_successful_scrape?: string | null
          min_content_length?: number | null
          next_run_at?: string | null
          notes?: string | null
          pagination?: Json | null
          rate_limit_ms?: number | null
          required_keywords?: string[] | null
          save_to_table?: string | null
          schedule_cron?: string | null
          selectors: Json
          success_rate?: number | null
          total_scrapes?: number | null
          updated_at?: string | null
          updated_by?: string | null
          url_pattern?: string | null
          use_ai_extraction?: boolean | null
          user_agent?: string | null
          validate_json_schema?: Json | null
        }
        Update: {
          ai_extraction_prompt?: string | null
          base_url?: string
          config_name?: string
          created_at?: string | null
          created_by?: string | null
          data_transformations?: Json | null
          description?: string | null
          domain?: string | null
          exclude_patterns?: string[] | null
          failed_scrapes?: number | null
          field_mappings?: Json | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          last_success_at?: string | null
          last_successful_scrape?: string | null
          min_content_length?: number | null
          next_run_at?: string | null
          notes?: string | null
          pagination?: Json | null
          rate_limit_ms?: number | null
          required_keywords?: string[] | null
          save_to_table?: string | null
          schedule_cron?: string | null
          selectors?: Json
          success_rate?: number | null
          total_scrapes?: number | null
          updated_at?: string | null
          updated_by?: string | null
          url_pattern?: string | null
          use_ai_extraction?: boolean | null
          user_agent?: string | null
          validate_json_schema?: Json | null
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
      semantic_embeddings: {
        Row: {
          created_at: string
          embedding: Json
          entity_id: string
          entity_type: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedding: Json
          entity_id: string
          entity_type: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedding?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipment_tracking_events: {
        Row: {
          ai_confidence: number | null
          carrier: string | null
          carrier_location: string | null
          carrier_timestamp: string | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          raw_data: Json
          shipment_id: string
          shipment_item_id: string | null
          source: string
          source_id: string | null
          status: string
          tracking_number: string | null
        }
        Insert: {
          ai_confidence?: number | null
          carrier?: string | null
          carrier_location?: string | null
          carrier_timestamp?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          raw_data?: Json
          shipment_id: string
          shipment_item_id?: string | null
          source?: string
          source_id?: string | null
          status: string
          tracking_number?: string | null
        }
        Update: {
          ai_confidence?: number | null
          carrier?: string | null
          carrier_location?: string | null
          carrier_timestamp?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          raw_data?: Json
          shipment_id?: string
          shipment_item_id?: string | null
          source?: string
          source_id?: string | null
          status?: string
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_tracking_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "po_shipment_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_tracking_events_shipment_item_id_fkey"
            columns: ["shipment_item_id"]
            isOneToOne: false
            referencedRelation: "po_shipment_items"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_credentials: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          scope: string
          shop_domain: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          scope: string
          shop_domain: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          scope?: string
          shop_domain?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      shopify_inventory_verification: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          difference: number
          id: string
          internal_qty: number
          issue_type: string | null
          notes: string | null
          resolution_action: string | null
          shopify_qty: number
          sku: string
          status: string | null
          verified_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          difference: number
          id?: string
          internal_qty: number
          issue_type?: string | null
          notes?: string | null
          resolution_action?: string | null
          shopify_qty: number
          sku: string
          status?: string | null
          verified_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          difference?: number
          id?: string
          internal_qty?: number
          issue_type?: string | null
          notes?: string | null
          resolution_action?: string | null
          shopify_qty?: number
          sku?: string
          status?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      shopify_orders: {
        Row: {
          billing_address: Json | null
          cancelled_date: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_amount: number | null
          financial_status: string | null
          fulfillment_status: string | null
          id: string
          line_items: Json
          order_date: string
          order_number: string
          raw_data: Json | null
          shipping_address: Json | null
          shipping_amount: number | null
          shopify_order_id: string
          subtotal_amount: number
          sync_source: string | null
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
          updated_date: string | null
        }
        Insert: {
          billing_address?: Json | null
          cancelled_date?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          line_items: Json
          order_date: string
          order_number: string
          raw_data?: Json | null
          shipping_address?: Json | null
          shipping_amount?: number | null
          shopify_order_id: string
          subtotal_amount: number
          sync_source?: string | null
          tax_amount?: number | null
          total_amount: number
          updated_at?: string | null
          updated_date?: string | null
        }
        Update: {
          billing_address?: Json | null
          cancelled_date?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          line_items?: Json
          order_date?: string
          order_number?: string
          raw_data?: Json | null
          shipping_address?: Json | null
          shipping_amount?: number | null
          shopify_order_id?: string
          subtotal_amount?: number
          sync_source?: string | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
          updated_date?: string | null
        }
        Relationships: []
      }
      shopify_sync_log: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          errors: Json | null
          id: string
          inventory_checked: number | null
          last_sync_at: string | null
          orders_inserted: number | null
          orders_skipped: number | null
          orders_updated: number | null
          products_synced: number | null
          started_at: string | null
          status: string | null
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          inventory_checked?: number | null
          last_sync_at?: string | null
          orders_inserted?: number | null
          orders_skipped?: number | null
          orders_updated?: number | null
          products_synced?: number | null
          started_at?: string | null
          status?: string | null
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          inventory_checked?: number | null
          last_sync_at?: string | null
          orders_inserted?: number | null
          orders_skipped?: number | null
          orders_updated?: number | null
          products_synced?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string
        }
        Relationships: []
      }
      shopify_webhook_log: {
        Row: {
          headers: Json | null
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
          processing_error: string | null
          received_at: string | null
          shop_domain: string
          signature_valid: boolean | null
          topic: string
          webhook_id: string | null
        }
        Insert: {
          headers?: Json | null
          id?: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string | null
          shop_domain: string
          signature_valid?: boolean | null
          topic: string
          webhook_id?: string | null
        }
        Update: {
          headers?: Json | null
          id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string | null
          shop_domain?: string
          signature_valid?: boolean | null
          topic?: string
          webhook_id?: string | null
        }
        Relationships: []
      }
      sop_approvals: {
        Row: {
          approval_level: string
          approved_at: string | null
          approver_id: string
          comments: string | null
          created_at: string | null
          department_id: string | null
          id: string
          status: string | null
          submission_id: string
        }
        Insert: {
          approval_level: string
          approved_at?: string | null
          approver_id: string
          comments?: string | null
          created_at?: string | null
          department_id?: string | null
          id?: string
          status?: string | null
          submission_id: string
        }
        Update: {
          approval_level?: string
          approved_at?: string | null
          approver_id?: string
          comments?: string | null
          created_at?: string | null
          department_id?: string | null
          id?: string
          status?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_approvals_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "sop_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_approvals_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sop_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_attachments: {
        Row: {
          id: string
          name: string
          sop_id: string
          type: string
          uploaded_at: string
          url: string
        }
        Insert: {
          id: string
          name: string
          sop_id: string
          type: string
          uploaded_at?: string
          url: string
        }
        Update: {
          id?: string
          name?: string
          sop_id?: string
          type?: string
          uploaded_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_attachments_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sop_repository"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_change_history: {
        Row: {
          affected_departments: string[] | null
          change_reason: string | null
          change_summary: string | null
          change_type: string
          changed_by: string
          created_at: string | null
          id: string
          new_content: string | null
          previous_content: string | null
          sop_id: string
          submission_id: string | null
        }
        Insert: {
          affected_departments?: string[] | null
          change_reason?: string | null
          change_summary?: string | null
          change_type: string
          changed_by: string
          created_at?: string | null
          id?: string
          new_content?: string | null
          previous_content?: string | null
          sop_id: string
          submission_id?: string | null
        }
        Update: {
          affected_departments?: string[] | null
          change_reason?: string | null
          change_summary?: string | null
          change_type?: string
          changed_by?: string
          created_at?: string | null
          id?: string
          new_content?: string | null
          previous_content?: string | null
          sop_id?: string
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_change_history_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sop_repository"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_change_history_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sop_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_departments: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sop_learning_data: {
        Row: {
          created_at: string
          failure_patterns: Json | null
          id: string
          improvement_suggestions: Json | null
          process_type: string
          sop_id: string
          success_patterns: Json | null
          updated_at: string
          user_feedback: Json | null
        }
        Insert: {
          created_at?: string
          failure_patterns?: Json | null
          id: string
          improvement_suggestions?: Json | null
          process_type: string
          sop_id: string
          success_patterns?: Json | null
          updated_at?: string
          user_feedback?: Json | null
        }
        Update: {
          created_at?: string
          failure_patterns?: Json | null
          id?: string
          improvement_suggestions?: Json | null
          process_type?: string
          sop_id?: string
          success_patterns?: Json | null
          updated_at?: string
          user_feedback?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_learning_data_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sop_repository"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_recommendations: {
        Row: {
          applied: boolean
          bom_id: string
          confidence: number
          created_at: string
          id: string
          reasoning: string
          sop_id: string
          suggested_by: string
        }
        Insert: {
          applied?: boolean
          bom_id: string
          confidence: number
          created_at?: string
          id: string
          reasoning: string
          sop_id: string
          suggested_by?: string
        }
        Update: {
          applied?: boolean
          bom_id?: string
          confidence?: number
          created_at?: string
          id?: string
          reasoning?: string
          sop_id?: string
          suggested_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_recommendations_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sop_repository"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_repository: {
        Row: {
          ai_confidence: number | null
          applicable_roles: string[] | null
          category: string
          content: string
          created_at: string
          created_by: string
          department_id: string | null
          description: string
          difficulty: string
          estimated_time_minutes: number
          google_doc_id: string | null
          google_doc_url: string | null
          id: string
          is_ai_generated: boolean
          last_synced_at: string | null
          last_used_at: string | null
          status: string
          tags: string[] | null
          template_data: Json | null
          template_id: string | null
          title: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          ai_confidence?: number | null
          applicable_roles?: string[] | null
          category?: string
          content: string
          created_at?: string
          created_by: string
          department_id?: string | null
          description: string
          difficulty?: string
          estimated_time_minutes?: number
          google_doc_id?: string | null
          google_doc_url?: string | null
          id: string
          is_ai_generated?: boolean
          last_synced_at?: string | null
          last_used_at?: string | null
          status?: string
          tags?: string[] | null
          template_data?: Json | null
          template_id?: string | null
          title: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          ai_confidence?: number | null
          applicable_roles?: string[] | null
          category?: string
          content?: string
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string
          difficulty?: string
          estimated_time_minutes?: number
          google_doc_id?: string | null
          google_doc_url?: string | null
          id?: string
          is_ai_generated?: boolean
          last_synced_at?: string | null
          last_used_at?: string | null
          status?: string
          tags?: string[] | null
          template_data?: Json | null
          template_id?: string | null
          title?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_repository_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "sop_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_repository_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "sop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_reviews: {
        Row: {
          comments: string | null
          created_at: string | null
          id: string
          review_type: string
          reviewed_at: string | null
          reviewer_id: string
          status: string | null
          submission_id: string
          suggested_changes: Json | null
        }
        Insert: {
          comments?: string | null
          created_at?: string | null
          id?: string
          review_type: string
          reviewed_at?: string | null
          reviewer_id: string
          status?: string | null
          submission_id: string
          suggested_changes?: Json | null
        }
        Update: {
          comments?: string | null
          created_at?: string | null
          id?: string
          review_type?: string
          reviewed_at?: string | null
          reviewer_id?: string
          status?: string | null
          submission_id?: string
          suggested_changes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_reviews_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sop_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_roles: {
        Row: {
          created_at: string | null
          department_id: string | null
          description: string | null
          hierarchy_level: number | null
          id: string
          is_active: boolean
          name: string
          permissions: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          hierarchy_level?: number | null
          id?: string
          is_active?: boolean
          name: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          hierarchy_level?: number | null
          id?: string
          is_active?: boolean
          name?: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "sop_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_submissions: {
        Row: {
          affected_departments: string[] | null
          content: string | null
          created_at: string | null
          department_id: string | null
          description: string | null
          id: string
          priority: string | null
          role_id: string | null
          sop_id: string
          status: string | null
          submission_type: string
          submitted_at: string | null
          submitted_by: string
          title: string
          updated_at: string | null
        }
        Insert: {
          affected_departments?: string[] | null
          content?: string | null
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          role_id?: string | null
          sop_id: string
          status?: string | null
          submission_type: string
          submitted_at?: string | null
          submitted_by: string
          title: string
          updated_at?: string | null
        }
        Update: {
          affected_departments?: string[] | null
          content?: string | null
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          role_id?: string | null
          sop_id?: string
          status?: string | null
          submission_type?: string
          submitted_at?: string | null
          submitted_by?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_submissions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "sop_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_submissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "sop_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_submissions_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sop_repository"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_templates: {
        Row: {
          applicable_roles: string[] | null
          category: string
          created_at: string
          created_by: string
          department: string
          description: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          template_structure: Json
          updated_at: string
        }
        Insert: {
          applicable_roles?: string[] | null
          category?: string
          created_at?: string
          created_by: string
          department?: string
          description: string
          id: string
          is_active?: boolean
          is_default?: boolean
          name: string
          template_structure: Json
          updated_at?: string
        }
        Update: {
          applicable_roles?: string[] | null
          category?: string
          created_at?: string
          created_by?: string
          department?: string
          description?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          template_structure?: Json
          updated_at?: string
        }
        Relationships: []
      }
      sop_usage_logs: {
        Row: {
          build_order_id: string | null
          completed_at: string | null
          id: string
          issues_encountered: string[] | null
          notes: string | null
          sop_id: string
          started_at: string
          success_rating: number | null
          time_spent_minutes: number | null
          user_id: string
          user_name: string
        }
        Insert: {
          build_order_id?: string | null
          completed_at?: string | null
          id: string
          issues_encountered?: string[] | null
          notes?: string | null
          sop_id: string
          started_at?: string
          success_rating?: number | null
          time_spent_minutes?: number | null
          user_id: string
          user_name: string
        }
        Update: {
          build_order_id?: string | null
          completed_at?: string | null
          id?: string
          issues_encountered?: string[] | null
          notes?: string | null
          sop_id?: string
          started_at?: string
          success_rating?: number | null
          time_spent_minutes?: number | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_usage_logs_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sop_repository"
            referencedColumns: ["id"]
          },
        ]
      }
      state_compliance_profiles: {
        Row: {
          agency_contact_email: string | null
          agency_contact_phone: string | null
          created_at: string | null
          data_completeness: number | null
          enforcement_level: string | null
          enforcement_notes: string | null
          fertilizer_notes: string | null
          fertilizer_strictness: number | null
          id: string
          key_labeling_requirements: string[] | null
          labeling_strictness: number | null
          last_major_update: string | null
          last_verified_at: string | null
          last_verified_by: string | null
          next_expected_update: string | null
          organic_notes: string | null
          organic_strictness: number | null
          overall_strictness: number
          primary_agency: string
          primary_agency_url: string | null
          prohibited_claims: string[] | null
          region: string | null
          registration_fee_range: string | null
          registration_strictness: number | null
          regulation_update_frequency: string | null
          requires_certification: boolean | null
          requires_registration: boolean | null
          requires_testing: boolean | null
          soil_amendment_notes: string | null
          special_warnings_required: string[] | null
          state_code: string
          state_name: string
          testing_frequency: string | null
          testing_strictness: number | null
          typical_penalty_range: string | null
          unique_requirements: string | null
          updated_at: string | null
        }
        Insert: {
          agency_contact_email?: string | null
          agency_contact_phone?: string | null
          created_at?: string | null
          data_completeness?: number | null
          enforcement_level?: string | null
          enforcement_notes?: string | null
          fertilizer_notes?: string | null
          fertilizer_strictness?: number | null
          id?: string
          key_labeling_requirements?: string[] | null
          labeling_strictness?: number | null
          last_major_update?: string | null
          last_verified_at?: string | null
          last_verified_by?: string | null
          next_expected_update?: string | null
          organic_notes?: string | null
          organic_strictness?: number | null
          overall_strictness: number
          primary_agency: string
          primary_agency_url?: string | null
          prohibited_claims?: string[] | null
          region?: string | null
          registration_fee_range?: string | null
          registration_strictness?: number | null
          regulation_update_frequency?: string | null
          requires_certification?: boolean | null
          requires_registration?: boolean | null
          requires_testing?: boolean | null
          soil_amendment_notes?: string | null
          special_warnings_required?: string[] | null
          state_code: string
          state_name: string
          testing_frequency?: string | null
          testing_strictness?: number | null
          typical_penalty_range?: string | null
          unique_requirements?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_contact_email?: string | null
          agency_contact_phone?: string | null
          created_at?: string | null
          data_completeness?: number | null
          enforcement_level?: string | null
          enforcement_notes?: string | null
          fertilizer_notes?: string | null
          fertilizer_strictness?: number | null
          id?: string
          key_labeling_requirements?: string[] | null
          labeling_strictness?: number | null
          last_major_update?: string | null
          last_verified_at?: string | null
          last_verified_by?: string | null
          next_expected_update?: string | null
          organic_notes?: string | null
          organic_strictness?: number | null
          overall_strictness?: number
          primary_agency?: string
          primary_agency_url?: string | null
          prohibited_claims?: string[] | null
          region?: string | null
          registration_fee_range?: string | null
          registration_strictness?: number | null
          regulation_update_frequency?: string | null
          requires_certification?: boolean | null
          requires_registration?: boolean | null
          requires_testing?: boolean | null
          soil_amendment_notes?: string | null
          special_warnings_required?: string[] | null
          state_code?: string
          state_name?: string
          testing_frequency?: string | null
          testing_strictness?: number | null
          typical_penalty_range?: string | null
          unique_requirements?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      state_compliance_ratings: {
        Row: {
          created_at: string | null
          id: string
          key_focus_areas: string[] | null
          labeling_requirements: string | null
          last_updated: string | null
          notes: string | null
          registration_required: boolean | null
          regulatory_agencies: string[] | null
          state_code: string
          state_name: string
          strictness_level: string
          strictness_score: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_focus_areas?: string[] | null
          labeling_requirements?: string | null
          last_updated?: string | null
          notes?: string | null
          registration_required?: boolean | null
          regulatory_agencies?: string[] | null
          state_code: string
          state_name: string
          strictness_level: string
          strictness_score: number
        }
        Update: {
          created_at?: string | null
          id?: string
          key_focus_areas?: string[] | null
          labeling_requirements?: string | null
          last_updated?: string | null
          notes?: string | null
          registration_required?: boolean | null
          regulatory_agencies?: string[] | null
          state_code?: string
          state_name?: string
          strictness_level?: string
          strictness_score?: number
        }
        Relationships: []
      }
      state_compliance_updates: {
        Row: {
          action_deadline: string | null
          affects_industries: string[] | null
          created_at: string | null
          description: string
          effective_date: string
          guidance_document_url: string | null
          id: string
          notification_sent_at: string | null
          official_notice_url: string | null
          requires_action: boolean | null
          severity: string
          state_code: string
          title: string
          update_type: string
          users_notified: number | null
        }
        Insert: {
          action_deadline?: string | null
          affects_industries?: string[] | null
          created_at?: string | null
          description: string
          effective_date: string
          guidance_document_url?: string | null
          id?: string
          notification_sent_at?: string | null
          official_notice_url?: string | null
          requires_action?: boolean | null
          severity: string
          state_code: string
          title: string
          update_type: string
          users_notified?: number | null
        }
        Update: {
          action_deadline?: string | null
          affects_industries?: string[] | null
          created_at?: string | null
          description?: string
          effective_date?: string
          guidance_document_url?: string | null
          id?: string
          notification_sent_at?: string | null
          official_notice_url?: string | null
          requires_action?: boolean | null
          severity?: string
          state_code?: string
          title?: string
          update_type?: string
          users_notified?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "state_compliance_updates_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "state_compliance_profiles"
            referencedColumns: ["state_code"]
          },
        ]
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
      subscription_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          plan_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload: Json
          plan_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          plan_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["plan_id"]
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
      sync_audit_log: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          items_affected: number | null
          operation: string
          started_at: string | null
          success: boolean | null
          sync_metadata: Json | null
          sync_type: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_affected?: number | null
          operation: string
          started_at?: string | null
          success?: boolean | null
          sync_metadata?: Json | null
          sync_type: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_affected?: number | null
          operation?: string
          started_at?: string | null
          success?: boolean | null
          sync_metadata?: Json | null
          sync_type?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sync_connection_health: {
        Row: {
          consecutive_failures: number | null
          created_at: string | null
          data_type: string
          error_message: string | null
          item_count: number | null
          last_check_time: string
          last_failure_time: string | null
          last_success_time: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          consecutive_failures?: number | null
          created_at?: string | null
          data_type: string
          error_message?: string | null
          item_count?: number | null
          last_check_time: string
          last_failure_time?: string | null
          last_success_time?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          consecutive_failures?: number | null
          created_at?: string | null
          data_type?: string
          error_message?: string | null
          item_count?: number | null
          last_check_time?: string
          last_failure_time?: string | null
          last_success_time?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_failure_logs: {
        Row: {
          auto_recovery_attempted: boolean | null
          backup_available: boolean | null
          backup_table_name: string | null
          created_at: string | null
          data_type: string
          duration_ms: number | null
          error_code: string | null
          error_details: Json | null
          error_message: string
          id: string
          operation: string
          record_count: number | null
          recovery_successful: boolean | null
          triggered_by: string | null
        }
        Insert: {
          auto_recovery_attempted?: boolean | null
          backup_available?: boolean | null
          backup_table_name?: string | null
          created_at?: string | null
          data_type: string
          duration_ms?: number | null
          error_code?: string | null
          error_details?: Json | null
          error_message: string
          id?: string
          operation: string
          record_count?: number | null
          recovery_successful?: boolean | null
          triggered_by?: string | null
        }
        Update: {
          auto_recovery_attempted?: boolean | null
          backup_available?: boolean | null
          backup_table_name?: string | null
          created_at?: string | null
          data_type?: string
          duration_ms?: number | null
          error_code?: string | null
          error_details?: Json | null
          error_message?: string
          id?: string
          operation?: string
          record_count?: number | null
          recovery_successful?: boolean | null
          triggered_by?: string | null
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
      sync_retry_queue: {
        Row: {
          backoff_multiplier: number | null
          backup_table_name: string | null
          consecutive_failures: number | null
          context_data: Json | null
          created_at: string | null
          created_by: string | null
          data_type: string
          id: string
          last_error_at: string | null
          last_error_message: string | null
          lock_expires_at: string | null
          lock_token: string | null
          max_retries: number | null
          next_retry_at: string | null
          operation: string
          priority: number | null
          requires_rollback: boolean | null
          retry_count: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          backoff_multiplier?: number | null
          backup_table_name?: string | null
          consecutive_failures?: number | null
          context_data?: Json | null
          created_at?: string | null
          created_by?: string | null
          data_type: string
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          lock_expires_at?: string | null
          lock_token?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          operation: string
          priority?: number | null
          requires_rollback?: boolean | null
          retry_count?: number | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          backoff_multiplier?: number | null
          backup_table_name?: string | null
          consecutive_failures?: number | null
          context_data?: Json | null
          created_at?: string | null
          created_by?: string | null
          data_type?: string
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          lock_expires_at?: string | null
          lock_token?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          operation?: string
          priority?: number | null
          requires_rollback?: boolean | null
          retry_count?: number | null
          status?: string
          updated_at?: string | null
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
      ticket_activity: {
        Row: {
          action: string
          actor_id: string
          comment: string | null
          created_at: string | null
          field_name: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          ticket_id: string
        }
        Insert: {
          action: string
          actor_id: string
          comment?: string | null
          created_at?: string | null
          field_name?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          ticket_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          comment?: string | null
          created_at?: string | null
          field_name?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_activity_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          attachments: Json | null
          author_id: string
          comment_type: string | null
          content: string
          created_at: string | null
          edited_at: string | null
          id: string
          mentioned_user_ids: string[] | null
          parent_comment_id: string | null
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          author_id: string
          comment_type?: string | null
          content: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string
          comment_type?: string | null
          content?: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "ticket_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          actual_hours: number | null
          assignee_id: string | null
          board_column: string | null
          board_position: number | null
          completed_at: string | null
          created_at: string | null
          department: string | null
          description: string | null
          directed_to_id: string | null
          directed_to_role: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          metadata: Json | null
          parent_ticket_id: string | null
          priority: string | null
          project_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          reporter_id: string
          started_at: string | null
          status: string | null
          tags: string[] | null
          ticket_number: number
          ticket_type: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          assignee_id?: string | null
          board_column?: string | null
          board_position?: number | null
          completed_at?: string | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          directed_to_id?: string | null
          directed_to_role?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          metadata?: Json | null
          parent_ticket_id?: string | null
          priority?: string | null
          project_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          reporter_id: string
          started_at?: string | null
          status?: string | null
          tags?: string[] | null
          ticket_number?: number
          ticket_type?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          assignee_id?: string | null
          board_column?: string | null
          board_position?: number | null
          completed_at?: string | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          directed_to_id?: string | null
          directed_to_role?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          metadata?: Json | null
          parent_ticket_id?: string | null
          priority?: string | null
          project_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          reporter_id?: string
          started_at?: string | null
          status?: string | null
          tags?: string[] | null
          ticket_number?: number
          ticket_type?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_parent_ticket_id_fkey"
            columns: ["parent_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          chat_messages_this_month: number | null
          checks_this_month: number | null
          compliance_level: string | null
          compliance_tier: string
          created_at: string | null
          email: string
          failed_checks_count: number | null
          id: string
          industry: string
          is_active: boolean | null
          last_chat_reset_date: string | null
          last_check_at: string | null
          last_compliance_check: string | null
          monthly_check_limit: number | null
          notes: string | null
          onboarded_at: string | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          product_types: string[] | null
          profile_type: string
          regulatory_sources: Json | null
          stripe_customer_id: string | null
          subscription_renewal_date: string | null
          subscription_start_date: string | null
          subscription_status: string | null
          target_states: string[]
          total_checks_lifetime: number | null
          total_checks_performed: number | null
          trial_checks_remaining: number | null
          updated_at: string | null
          upgrade_requested_at: string | null
          upgraded_at: string | null
          user_id: string
        }
        Insert: {
          certifications_held?: string[] | null
          chat_messages_this_month?: number | null
          checks_this_month?: number | null
          compliance_level?: string | null
          compliance_tier?: string
          created_at?: string | null
          email: string
          failed_checks_count?: number | null
          id?: string
          industry?: string
          is_active?: boolean | null
          last_chat_reset_date?: string | null
          last_check_at?: string | null
          last_compliance_check?: string | null
          monthly_check_limit?: number | null
          notes?: string | null
          onboarded_at?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          product_types?: string[] | null
          profile_type?: string
          regulatory_sources?: Json | null
          stripe_customer_id?: string | null
          subscription_renewal_date?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          target_states?: string[]
          total_checks_lifetime?: number | null
          total_checks_performed?: number | null
          trial_checks_remaining?: number | null
          updated_at?: string | null
          upgrade_requested_at?: string | null
          upgraded_at?: string | null
          user_id: string
        }
        Update: {
          certifications_held?: string[] | null
          chat_messages_this_month?: number | null
          checks_this_month?: number | null
          compliance_level?: string | null
          compliance_tier?: string
          created_at?: string | null
          email?: string
          failed_checks_count?: number | null
          id?: string
          industry?: string
          is_active?: boolean | null
          last_chat_reset_date?: string | null
          last_check_at?: string | null
          last_compliance_check?: string | null
          monthly_check_limit?: number | null
          notes?: string | null
          onboarded_at?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          product_types?: string[] | null
          profile_type?: string
          regulatory_sources?: Json | null
          stripe_customer_id?: string | null
          subscription_renewal_date?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          target_states?: string[]
          total_checks_lifetime?: number | null
          total_checks_performed?: number | null
          trial_checks_remaining?: number | null
          updated_at?: string | null
          upgrade_requested_at?: string | null
          upgraded_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_department_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          department_id: string
          id: string
          is_active: boolean
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          department_id: string
          id?: string
          is_active?: boolean
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          department_id?: string
          id?: string
          is_active?: boolean
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_department_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "sop_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_department_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "sop_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_prefs: {
        Row: {
          approvals: boolean | null
          created_at: string | null
          email_digest_frequency: string | null
          email_enabled: boolean | null
          email_include_comments: boolean | null
          id: string
          in_app_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          slack_channel_override: string | null
          slack_enabled: boolean | null
          slack_mention_me: boolean | null
          slack_webhook_url: string | null
          system_alerts: boolean | null
          ticket_assignments: boolean | null
          ticket_deadlines: boolean | null
          ticket_escalations: boolean | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approvals?: boolean | null
          created_at?: string | null
          email_digest_frequency?: string | null
          email_enabled?: boolean | null
          email_include_comments?: boolean | null
          id?: string
          in_app_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          slack_channel_override?: string | null
          slack_enabled?: boolean | null
          slack_mention_me?: boolean | null
          slack_webhook_url?: string | null
          system_alerts?: boolean | null
          ticket_assignments?: boolean | null
          ticket_deadlines?: boolean | null
          ticket_escalations?: boolean | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approvals?: boolean | null
          created_at?: string | null
          email_digest_frequency?: string | null
          email_enabled?: boolean | null
          email_include_comments?: boolean | null
          id?: string
          in_app_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          slack_channel_override?: string | null
          slack_enabled?: boolean | null
          slack_mention_me?: boolean | null
          slack_webhook_url?: string | null
          system_alerts?: boolean | null
          ticket_assignments?: boolean | null
          ticket_deadlines?: boolean | null
          ticket_escalations?: boolean | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string | null
          scopes: string[] | null
          token_metadata: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          provider: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_metadata?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_metadata?: Json | null
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
      user_settings: {
        Row: {
          calendar_id: string | null
          calendar_name: string | null
          calendar_push_enabled: boolean | null
          calendar_sources: Json | null
          calendar_sync_enabled: boolean | null
          calendar_timezone: string | null
          created_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_id?: string | null
          calendar_name?: string | null
          calendar_push_enabled?: boolean | null
          calendar_sources?: Json | null
          calendar_sync_enabled?: boolean | null
          calendar_timezone?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_id?: string | null
          calendar_name?: string | null
          calendar_push_enabled?: boolean | null
          calendar_sources?: Json | null
          calendar_sync_enabled?: boolean | null
          calendar_timezone?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          billing_interval: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          plan_id: string
          seat_quantity: number
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_interval?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan_id: string
          seat_quantity?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_interval?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan_id?: string
          seat_quantity?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      vault: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          name: string
          secret: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          name: string
          secret: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          name?: string
          secret?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendor_confidence_history: {
        Row: {
          communication_status:
            | Database["public"]["Enums"]["vendor_communication_status"]
            | null
          completeness_score: number | null
          confidence_score: number
          id: string
          invoice_accuracy_score: number | null
          lead_time_score: number | null
          recorded_at: string
          response_latency_score: number | null
          threading_score: number | null
          vendor_id: string
        }
        Insert: {
          communication_status?:
            | Database["public"]["Enums"]["vendor_communication_status"]
            | null
          completeness_score?: number | null
          confidence_score: number
          id?: string
          invoice_accuracy_score?: number | null
          lead_time_score?: number | null
          recorded_at?: string
          response_latency_score?: number | null
          threading_score?: number | null
          vendor_id: string
        }
        Update: {
          communication_status?:
            | Database["public"]["Enums"]["vendor_communication_status"]
            | null
          completeness_score?: number | null
          confidence_score?: number
          id?: string
          invoice_accuracy_score?: number | null
          lead_time_score?: number | null
          recorded_at?: string
          response_latency_score?: number | null
          threading_score?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_confidence_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_confidence_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_confidence_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_confidence_profiles: {
        Row: {
          alert_suppressed_until: string | null
          communication_status: Database["public"]["Enums"]["vendor_communication_status"]
          completeness_score: number
          confidence_score: number
          created_at: string
          id: string
          interactions_count: number
          invoice_accuracy_score: number
          last_recalculated_at: string | null
          lead_time_score: number
          recommended_lead_time_buffer_days: number
          response_latency_score: number
          score_30_days_ago: number | null
          template_strictness: string
          threading_score: number
          trend: Database["public"]["Enums"]["vendor_confidence_trend"]
          updated_at: string
          vendor_id: string
        }
        Insert: {
          alert_suppressed_until?: string | null
          communication_status?: Database["public"]["Enums"]["vendor_communication_status"]
          completeness_score?: number
          confidence_score?: number
          created_at?: string
          id?: string
          interactions_count?: number
          invoice_accuracy_score?: number
          last_recalculated_at?: string | null
          lead_time_score?: number
          recommended_lead_time_buffer_days?: number
          response_latency_score?: number
          score_30_days_ago?: number | null
          template_strictness?: string
          threading_score?: number
          trend?: Database["public"]["Enums"]["vendor_confidence_trend"]
          updated_at?: string
          vendor_id: string
        }
        Update: {
          alert_suppressed_until?: string | null
          communication_status?: Database["public"]["Enums"]["vendor_communication_status"]
          completeness_score?: number
          confidence_score?: number
          created_at?: string
          id?: string
          interactions_count?: number
          invoice_accuracy_score?: number
          last_recalculated_at?: string | null
          lead_time_score?: number
          recommended_lead_time_buffer_days?: number
          response_latency_score?: number
          score_30_days_ago?: number | null
          template_strictness?: string
          threading_score?: number
          trend?: Database["public"]["Enums"]["vendor_confidence_trend"]
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_confidence_profiles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_confidence_profiles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_confidence_profiles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_followup_events: {
        Row: {
          campaign_id: string | null
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
          campaign_id?: string | null
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
          campaign_id?: string | null
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
            foreignKeyName: "vendor_followup_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "po_followup_campaigns"
            referencedColumns: ["id"]
          },
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
      vendor_interaction_events: {
        Row: {
          created_at: string
          delivered_on_time: boolean | null
          event_type: string
          extraction_confidence: number | null
          id: string
          invoice_variance_percent: number | null
          is_threaded: boolean | null
          occurred_at: string
          payload: Json | null
          po_id: string | null
          response_latency_minutes: number | null
          trigger_source: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          delivered_on_time?: boolean | null
          event_type: string
          extraction_confidence?: number | null
          id?: string
          invoice_variance_percent?: number | null
          is_threaded?: boolean | null
          occurred_at?: string
          payload?: Json | null
          po_id?: string | null
          response_latency_minutes?: number | null
          trigger_source?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          delivered_on_time?: boolean | null
          event_type?: string
          extraction_confidence?: number | null
          id?: string
          invoice_variance_percent?: number | null
          is_threaded?: boolean | null
          occurred_at?: string
          payload?: Json | null
          po_id?: string | null
          response_latency_minutes?: number | null
          trigger_source?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_interaction_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_interaction_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_interaction_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_interaction_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_interaction_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_interaction_events_vendor_id_fkey"
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
      vendor_pricelists: {
        Row: {
          archived_at: string | null
          changes_summary: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          effective_date: string
          extracted_items_count: number | null
          extraction_confidence: number | null
          extraction_error: string | null
          extraction_status:
            | Database["public"]["Enums"]["pricelist_status"]
            | null
          id: string
          is_current: boolean | null
          items: Json | null
          name: string
          previous_version_id: string | null
          source: Database["public"]["Enums"]["pricelist_source"] | null
          source_message_id: string | null
          updated_at: string | null
          updated_by: string | null
          vendor_id: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          changes_summary?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          effective_date?: string
          extracted_items_count?: number | null
          extraction_confidence?: number | null
          extraction_error?: string | null
          extraction_status?:
            | Database["public"]["Enums"]["pricelist_status"]
            | null
          id?: string
          is_current?: boolean | null
          items?: Json | null
          name: string
          previous_version_id?: string | null
          source?: Database["public"]["Enums"]["pricelist_source"] | null
          source_message_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          changes_summary?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          effective_date?: string
          extracted_items_count?: number | null
          extraction_confidence?: number | null
          extraction_error?: string | null
          extraction_status?:
            | Database["public"]["Enums"]["pricelist_status"]
            | null
          id?: string
          is_current?: boolean | null
          items?: Json | null
          name?: string
          previous_version_id?: string | null
          source?: Database["public"]["Enums"]["pricelist_source"] | null
          source_message_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_pricelists_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "vendor_pricelists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_pricelists_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_pricelists_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_pricelists_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_response_drafts: {
        Row: {
          ai_confidence: number | null
          ai_cost_usd: number | null
          ai_generated: boolean | null
          ai_model: string | null
          approved_at: string | null
          approved_by: string | null
          body: string
          communication_id: string
          created_at: string | null
          edited_at: string | null
          edited_by: string | null
          generation_context: Json | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          original_body: string | null
          po_id: string
          sent_at: string | null
          sent_by: string | null
          signature: string | null
          status: string | null
          subject: string
          template_id: string | null
          template_type: string | null
          updated_at: string | null
          user_edited: boolean | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_cost_usd?: number | null
          ai_generated?: boolean | null
          ai_model?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body: string
          communication_id: string
          created_at?: string | null
          edited_at?: string | null
          edited_by?: string | null
          generation_context?: Json | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          original_body?: string | null
          po_id: string
          sent_at?: string | null
          sent_by?: string | null
          signature?: string | null
          status?: string | null
          subject: string
          template_id?: string | null
          template_type?: string | null
          updated_at?: string | null
          user_edited?: boolean | null
        }
        Update: {
          ai_confidence?: number | null
          ai_cost_usd?: number | null
          ai_generated?: boolean | null
          ai_model?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          communication_id?: string
          created_at?: string | null
          edited_at?: string | null
          edited_by?: string | null
          generation_context?: Json | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          original_body?: string | null
          po_id?: string
          sent_at?: string | null
          sent_by?: string | null
          signature?: string | null
          status?: string | null
          subject?: string
          template_id?: string | null
          template_type?: string | null
          updated_at?: string | null
          user_edited?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_response_drafts_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "po_vendor_communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_response_drafts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_response_drafts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_response_drafts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_response_drafts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_sku_mappings: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          internal_sku: string
          is_active: boolean | null
          mapping_confidence: number | null
          mapping_notes: string | null
          mapping_source: string | null
          updated_at: string | null
          updated_by: string | null
          vendor_description: string | null
          vendor_id: string
          vendor_product_name: string | null
          vendor_sku: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          internal_sku: string
          is_active?: boolean | null
          mapping_confidence?: number | null
          mapping_notes?: string | null
          mapping_source?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_description?: string | null
          vendor_id: string
          vendor_product_name?: string | null
          vendor_sku: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          internal_sku?: string
          is_active?: boolean | null
          mapping_confidence?: number | null
          mapping_notes?: string | null
          mapping_source?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_description?: string | null
          vendor_id?: string
          vendor_product_name?: string | null
          vendor_sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_sku_mappings_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_details"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "vendor_sku_mappings_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "vendor_sku_mappings_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_trends"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "vendor_sku_mappings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_sku_mappings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_sku_mappings_vendor_id_fkey"
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
          contact_emails: string[] | null
          country: string | null
          created_at: string | null
          data_source: string | null
          id: string
          is_recurring_vendor: boolean | null
          last_sync_at: string | null
          lead_time_days: number | null
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          sync_status: string | null
          updated_at: string | null
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
          contact_emails?: string[] | null
          country?: string | null
          created_at?: string | null
          data_source?: string | null
          id?: string
          is_recurring_vendor?: boolean | null
          last_sync_at?: string | null
          lead_time_days?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          sync_status?: string | null
          updated_at?: string | null
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
          contact_emails?: string[] | null
          country?: string | null
          created_at?: string | null
          data_source?: string | null
          id?: string
          is_recurring_vendor?: boolean | null
          last_sync_at?: string | null
          lead_time_days?: number | null
          name?: string
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
      vendors_backup: {
        Row: {
          address: string | null
          backup_at: string | null
          backup_id: string
          backup_reason: string | null
          backup_source: string | null
          city: string | null
          contact_name: string | null
          country: string | null
          created_at: string | null
          email: string | null
          finale_id: string | null
          id: string
          is_active: boolean | null
          lead_time_days: number | null
          minimum_order_value: number | null
          name: string | null
          notes: string | null
          payment_terms: string | null
          phone: string | null
          state: string | null
          updated_at: string | null
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          backup_at?: string | null
          backup_id?: string
          backup_reason?: string | null
          backup_source?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          finale_id?: string | null
          id: string
          is_active?: boolean | null
          lead_time_days?: number | null
          minimum_order_value?: number | null
          name?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          backup_at?: string | null
          backup_id?: string
          backup_reason?: string | null
          backup_source?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          finale_id?: string | null
          id?: string
          is_active?: boolean | null
          lead_time_days?: number | null
          minimum_order_value?: number | null
          name?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      active_invoice_reviews: {
        Row: {
          confidence_score: number | null
          critical_variances: number | null
          extracted_at: string | null
          id: string | null
          invoice_number: string | null
          invoice_total: number | null
          order_id: string | null
          po_id: string | null
          po_total: number | null
          status: string | null
          supplier_name: string | null
          variance_count: number | null
          warning_variances: number | null
        }
        Relationships: [
          {
            foreignKeyName: "po_invoice_data_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_data_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_data_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
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
      api_cost_summary: {
        Row: {
          avg_execution_time_ms: number | null
          date: string | null
          failed_requests: number | null
          service: string | null
          successful_requests: number | null
          total_cost_usd: number | null
          total_requests: number | null
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
        Relationships: []
      }
      inventory_details: {
        Row: {
          bin_location: string | null
          category: string | null
          created_at: string | null
          currency: string | null
          data_source: string | null
          days_of_stock_remaining: number | null
          description: string | null
          dimensions: string | null
          facility_id: string | null
          id: string | null
          last_purchase_date: string | null
          last_sync_at: string | null
          lead_time_days: number | null
          lot_tracking: boolean | null
          moq: number | null
          name: string | null
          on_order: number | null
          qty_to_order: number | null
          recommended_order_qty: number | null
          reorder_point: number | null
          reorder_variance: number | null
          sales_last_30_days: number | null
          sales_last_90_days: number | null
          sales_velocity_consolidated: number | null
          sku: string | null
          status: string | null
          stock: number | null
          stock_status: string | null
          supplier_sku: string | null
          sync_errors: string | null
          sync_status: string | null
          total_inventory_value: number | null
          unit_cost: number | null
          unit_price: number | null
          units_available: number | null
          units_in_stock: number | null
          units_on_order: number | null
          units_reserved: number | null
          upc: string | null
          updated_at: string | null
          vendor_city: string | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_state: string | null
          warehouse_location: string | null
          weight: number | null
          weight_unit: string | null
        }
        Relationships: [
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
      invoice_variance_summary: {
        Row: {
          detected_at: string | null
          id: string | null
          invoice_amount: number | null
          invoice_number: string | null
          invoice_status: string | null
          order_id: string | null
          po_amount: number | null
          po_id: string | null
          severity: string | null
          supplier_name: string | null
          variance_amount: number | null
          variance_percentage: number | null
          variance_status: string | null
          variance_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_invoice_variances_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "active_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_variances_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_tracking_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_invoice_variances_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
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
      pricing_management_view: {
        Row: {
          approval_notes: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          change_impact: string | null
          change_reason: string | null
          cost_change_percentage: number | null
          current_currency: string | null
          current_effective_date: string | null
          current_margin_pct: number | null
          current_unit_cost: number | null
          current_unit_price: number | null
          id: string | null
          internal_sku: string | null
          mapping_confidence: number | null
          margin_percentage: number | null
          markup_percentage: number | null
          pending_proposal_id: string | null
          price_change_percentage: number | null
          pricing_strategy: string | null
          product_description: string | null
          product_name: string | null
          proposal_created_at: string | null
          proposed_margin_pct: number | null
          proposed_unit_cost: number | null
          proposed_unit_price: number | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_product_name: string | null
          vendor_sku: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_pricing_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_details"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_pricing_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_pricing_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_trends"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_pricing_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_automation_summary"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "product_pricing_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pricing_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_proposals_queue: {
        Row: {
          change_impact: string | null
          change_reason: string | null
          cost_change_amount: number | null
          cost_change_percentage: number | null
          created_at: string | null
          created_by: string | null
          id: string | null
          implemented_at: string | null
          implemented_by: string | null
          internal_sku: string | null
          mapping_vendor_sku: string | null
          price_change_amount: number | null
          price_change_percentage: number | null
          pricelist_item_data: Json | null
          priority_score: number | null
          product_name: string | null
          product_pricing_id: string | null
          proposal_vendor_sku: string | null
          proposed_currency: string | null
          proposed_effective_date: string | null
          proposed_unit_cost: number | null
          proposed_unit_price: number | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string | null
          vendor_name: string | null
          vendor_pricelist_id: string | null
          vendor_product_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_change_proposals_product_pricing_id_fkey"
            columns: ["product_pricing_id"]
            isOneToOne: false
            referencedRelation: "pricing_management_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_change_proposals_product_pricing_id_fkey"
            columns: ["product_pricing_id"]
            isOneToOne: false
            referencedRelation: "product_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_change_proposals_vendor_pricelist_id_fkey"
            columns: ["vendor_pricelist_id"]
            isOneToOne: false
            referencedRelation: "vendor_pricelists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pricing_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_details"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_pricing_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_pricing_internal_sku_fkey"
            columns: ["internal_sku"]
            isOneToOne: false
            referencedRelation: "inventory_trends"
            referencedColumns: ["sku"]
          },
        ]
      }
      shopify_sales_summary: {
        Row: {
          avg_order_value: number | null
          financial_status: string | null
          fulfillment_status: string | null
          sale_date: string | null
          total_orders: number | null
          total_revenue: number | null
          total_tax: number | null
          unique_customers: number | null
        }
        Relationships: []
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
      user_api_usage: {
        Row: {
          avg_execution_time_ms: number | null
          failed_requests: number | null
          last_request_at: string | null
          service: string | null
          successful_requests: number | null
          total_requests: number | null
          user_id: string | null
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
      approve_pricing_change: {
        Args: {
          p_approval_notes?: string
          p_approved_by: string
          p_proposal_id: string
        }
        Returns: boolean
      }
      backup_before_sync: {
        Args: {
          p_data_type: string
          p_table_name: string
          p_triggered_by?: string
        }
        Returns: string
      }
      backup_inventory_items: {
        Args: { p_backup_reason?: string; p_backup_source?: string }
        Returns: {
          backup_id: string
          backup_timestamp: string
          items_backed_up: number
        }[]
      }
      backup_table: {
        Args: {
          p_backup_suffix?: string
          p_source_table: string
          p_triggered_by?: string
        }
        Returns: {
          backup_table_name: string
          rows_backed_up: number
        }[]
      }
      backup_vendors: {
        Args: { p_backup_reason?: string; p_backup_source?: string }
        Returns: {
          backup_id: string
          backup_timestamp: string
          items_backed_up: number
        }[]
      }
      calculate_days_until_stockout: {
        Args: { p_consumption_daily: number; p_current_stock: number }
        Returns: number
      }
      calculate_invoice_variances: {
        Args: { p_invoice_data: Json; p_po_id: string }
        Returns: {
          invoice_amount: number
          po_amount: number
          severity: string
          threshold_amount: number
          threshold_percentage: number
          variance_amount: number
          variance_percentage: number
          variance_type: string
        }[]
      }
      calculate_pricelist_changes: {
        Args: { new_pricelist_id: string }
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
      calculate_vendor_confidence_factors: {
        Args: { _vendor_id: string }
        Returns: {
          completeness_score: number
          interactions: number
          invoice_accuracy_score: number
          lead_time_score: number
          response_latency_score: number
          threading_score: number
        }[]
      }
      cleanup_expired_retry_locks: { Args: never; Returns: number }
      cleanup_old_audit_logs: {
        Args: { days_to_keep?: number }
        Returns: number
      }
      cleanup_old_backups: {
        Args: { p_days_to_keep?: number }
        Returns: {
          deleted_at: string
          deleted_backup: string
        }[]
      }
      cleanup_old_retry_queue: {
        Args: { p_days_to_keep?: number }
        Returns: number
      }
      complete_retry: {
        Args: {
          p_error_message?: string
          p_retry_id: string
          p_success: boolean
        }
        Returns: boolean
      }
      count_open_tickets_for_user: {
        Args: { user_id: string }
        Returns: number
      }
      create_notification_with_prefs: {
        Args: {
          p_message: string
          p_metadata?: Json
          p_priority?: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_pricing_proposal_from_pricelist: {
        Args: {
          p_change_reason?: string
          p_internal_sku: string
          p_proposed_cost: number
          p_proposed_price?: number
          p_vendor_pricelist_id: string
          p_vendor_sku: string
        }
        Returns: string
      }
      current_user_department: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      decrement_trial_checks: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      enqueue_sync_retry: {
        Args: {
          p_backup_table_name?: string
          p_context_data?: Json
          p_data_type: string
          p_error_message: string
          p_max_retries?: number
          p_operation: string
          p_priority?: number
          p_requires_rollback?: boolean
        }
        Returns: string
      }
      ensure_user_profile: { Args: never; Returns: Json }
      generate_sop_learning_insights: {
        Args: { sop_id_param: string }
        Returns: {
          confidence: number
          insight_data: Json
          insight_type: string
        }[]
      }
      generate_sop_recommendations: {
        Args: { bom_id_param: string }
        Returns: {
          confidence: number
          reasoning: string
          sop_id: string
        }[]
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
      get_applicable_sop_templates: {
        Args: { user_department?: string; user_role?: string }
        Returns: {
          applicable_roles: string[]
          category: string
          department: string
          description: string
          id: string
          is_default: boolean
          name: string
          template_structure: Json
        }[]
      }
      get_communication_status_from_score: {
        Args: { score: number }
        Returns: Database["public"]["Enums"]["vendor_communication_status"]
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
      get_cost_by_feature: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: {
          avg_cost_per_request: number
          feature_type: string
          request_count: number
          total_cost: number
        }[]
      }
      get_current_pricelist: {
        Args: { vendor_id: string }
        Returns: {
          changes_summary: Json
          effective_date: string
          extracted_items_count: number
          id: string
          items: Json
          name: string
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
      get_monthly_usage_summary: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: {
          chat_requests: number
          compliance_requests: number
          embedding_requests: number
          total_cost: number
          total_requests: number
          total_tokens: number
          vision_requests: number
        }[]
      }
      get_my_tickets: {
        Args: { user_id: string }
        Returns: {
          actual_hours: number | null
          assignee_id: string | null
          board_column: string | null
          board_position: number | null
          completed_at: string | null
          created_at: string | null
          department: string | null
          description: string | null
          directed_to_id: string | null
          directed_to_role: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          metadata: Json | null
          parent_ticket_id: string | null
          priority: string | null
          project_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          reporter_id: string
          started_at: string | null
          status: string | null
          tags: string[] | null
          ticket_number: number
          ticket_type: string | null
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_po_shipment_data: {
        Args: { po_id: string }
        Returns: {
          actual_delivery: string
          ai_confidence: number
          carrier: string
          estimated_delivery: string
          item_count: number
          requires_review: boolean
          ship_date: string
          shipment_id: string
          shipment_number: string
          status: string
          total_quantity_ordered: number
          total_quantity_shipped: number
          tracking_numbers: string[]
        }[]
      }
      get_pricelist_insights: {
        Args: { vendor_id: string }
        Returns: {
          avg_price_change_percentage: number
          current_version: number
          last_updated: string
          price_changes_last_version: number
          significant_changes: number
          total_products: number
          total_versions: number
        }[]
      }
      get_pricing_dashboard_data: {
        Args: never
        Returns: {
          approved_today: number
          avg_margin_percentage: number
          critical_changes: number
          pending_proposals: number
          total_inventory_value: number
          total_products: number
        }[]
      }
      get_rate_limit_status: {
        Args: {
          p_service: string
          p_user_id: string
          p_window_minutes?: number
        }
        Returns: {
          limit_remaining: number
          request_count: number
          window_reset_at: string
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
      get_shipment_alerts: {
        Args: never
        Returns: {
          alert_message: string
          alert_type: string
          days_overdue: number
          po_id: string
          po_number: string
          severity: string
          shipment_id: string
        }[]
      }
      get_sop_usage_stats: {
        Args: { sop_id_param: string }
        Returns: {
          avg_completion_time: unknown
          common_issues: string[]
          success_rate: number
          total_usage: number
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
      get_sync_system_health: {
        Args: never
        Returns: {
          consecutive_failures: number
          data_type: string
          item_count: number
          last_check_time: string
          overall_health: string
          status: string
        }[]
      }
      get_template_strictness_from_score: {
        Args: { score: number }
        Returns: string
      }
      get_unread_notification_count: {
        Args: { user_id: string }
        Returns: number
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
      has_role: { Args: { required_role: string }; Returns: boolean }
      increment_chat_messages: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      increment_compliance_checks: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      list_backups:
        | {
            Args: { p_source_table: string }
            Returns: {
              backup_table: string
              created_at: string
              row_count: number
              triggered_by: string
            }[]
          }
        | {
            Args: { p_limit?: number; p_table_name: string }
            Returns: {
              backup_at: string
              backup_id: string
              backup_reason: string
              backup_source: string
              items_count: number
            }[]
          }
      mark_stale_insights: { Args: never; Returns: number }
      process_next_retry: {
        Args: never
        Returns: {
          backup_table_name: string
          context_data: Json
          data_type: string
          operation: string
          retry_id: string
        }[]
      }
      process_vendor_pricelist: {
        Args: {
          p_pricelist_data: Json
          p_source?: string
          p_source_message_id?: string
          p_vendor_id: string
        }
        Returns: {
          id: string
          is_current: boolean
          version: number
        }[]
      }
      publish_data_sheet: {
        Args: { p_data_sheet_id: string; p_user_id: string }
        Returns: string
      }
      recalculate_vendor_confidence: {
        Args: { _trigger?: string; _vendor_id: string }
        Returns: undefined
      }
      refresh_inventory_trends: { Args: never; Returns: undefined }
      refresh_shopify_sales_summary: { Args: never; Returns: undefined }
      refresh_vendor_confidence_profile: {
        Args: { trigger_source?: string; vendor_id: string }
        Returns: undefined
      }
      restore_from_backup: {
        Args: { p_backup_id: string; p_table_name: string }
        Returns: {
          restore_timestamp: string
          rows_restored: number
        }[]
      }
      rollback_from_backup: {
        Args: { p_backup_table: string; p_target_table: string }
        Returns: {
          rows_deleted: number
          rows_restored: number
        }[]
      }
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
      trigger_empty_data_rollback: {
        Args: {
          p_data_type: string
          p_error_message?: string
          p_table_name: string
        }
        Returns: string
      }
      update_all_boms_compliance: { Args: never; Returns: number }
      update_all_compliance_statuses: { Args: never; Returns: number }
      update_bom_compliance_summary: {
        Args: { p_bom_id: string }
        Returns: undefined
      }
      update_connection_health_status: {
        Args: {
          p_data_type: string
          p_error_message?: string
          p_item_count?: number
          p_status: string
        }
        Returns: boolean
      }
      validate_sop_template: {
        Args: { sop_data: Json; template_id: string }
        Returns: {
          is_valid: boolean
          validation_errors: string[]
        }[]
      }
    }
    Enums: {
      pricelist_source: "upload" | "email" | "google_docs" | "api"
      pricelist_status: "pending" | "extracted" | "error"
      vendor_communication_status:
        | "fully_automatic"
        | "automatic_with_review"
        | "needs_review"
        | "needs_full_review"
        | "suspended"
      vendor_confidence_trend: "improving" | "stable" | "declining"
      vendor_response_category:
        | "shipment_confirmation"
        | "delivery_update"
        | "delivery_exception"
        | "price_change"
        | "out_of_stock"
        | "substitution_offer"
        | "invoice_attached"
        | "order_confirmation"
        | "lead_time_update"
        | "general_inquiry"
        | "thank_you"
        | "other"
      vendor_response_status:
        | "pending_response"
        | "vendor_responded"
        | "verified_confirmed"
        | "verified_with_issues"
        | "requires_clarification"
        | "vendor_non_responsive"
        | "cancelled"
      vendor_suggested_action:
        | "acknowledge_receipt"
        | "confirm_acceptance"
        | "request_clarification"
        | "approve_pricing"
        | "reject_pricing"
        | "update_inventory"
        | "escalate_to_manager"
        | "forward_to_ap"
        | "update_po_tracking"
        | "create_backorder"
        | "no_action_required"
        | "review_required"
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
      pricelist_source: ["upload", "email", "google_docs", "api"],
      pricelist_status: ["pending", "extracted", "error"],
      vendor_communication_status: [
        "fully_automatic",
        "automatic_with_review",
        "needs_review",
        "needs_full_review",
        "suspended",
      ],
      vendor_confidence_trend: ["improving", "stable", "declining"],
      vendor_response_category: [
        "shipment_confirmation",
        "delivery_update",
        "delivery_exception",
        "price_change",
        "out_of_stock",
        "substitution_offer",
        "invoice_attached",
        "order_confirmation",
        "lead_time_update",
        "general_inquiry",
        "thank_you",
        "other",
      ],
      vendor_response_status: [
        "pending_response",
        "vendor_responded",
        "verified_confirmed",
        "verified_with_issues",
        "requires_clarification",
        "vendor_non_responsive",
        "cancelled",
      ],
      vendor_suggested_action: [
        "acknowledge_receipt",
        "confirm_acceptance",
        "request_clarification",
        "approve_pricing",
        "reject_pricing",
        "update_inventory",
        "escalate_to_manager",
        "forward_to_ap",
        "update_po_tracking",
        "create_backorder",
        "no_action_required",
        "review_required",
      ],
    },
  },
} as const

