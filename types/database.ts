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
          barcode: string | null
          components: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          finished_sku: string
          id: string
          is_deleted: boolean
          name: string
          packaging: Json
          production_notes: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          artwork?: Json
          barcode?: string | null
          components?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finished_sku: string
          id?: string
          is_deleted?: boolean
          name: string
          packaging?: Json
          production_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          artwork?: Json
          barcode?: string | null
          components?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finished_sku?: string
          id?: string
          is_deleted?: boolean
          name?: string
          packaging?: Json
          production_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
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
            referencedRelation: "inventory_items"
            referencedColumns: ["sku"]
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
            referencedRelation: "inventory_items"
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
      inventory_items: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          external_id: string | null
          is_deleted: boolean
          last_synced_at: string | null
          location: string | null
          moq: number
          name: string
          notes: string | null
          on_order: number
          reorder_point: number
          sku: string
          source_system: string | null
          stock: number
          unit_of_measure: string | null
          unit_price: number | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_id?: string | null
          is_deleted?: boolean
          last_synced_at?: string | null
          location?: string | null
          moq?: number
          name: string
          notes?: string | null
          on_order?: number
          reorder_point?: number
          sku: string
          source_system?: string | null
          stock?: number
          unit_of_measure?: string | null
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_id?: string | null
          is_deleted?: boolean
          last_synced_at?: string | null
          location?: string | null
          moq?: number
          name?: string
          notes?: string | null
          on_order?: number
          reorder_point?: number
          sku?: string
          source_system?: string | null
          stock?: number
          unit_of_measure?: string | null
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          version?: number
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
      purchase_orders: {
        Row: {
          actual_delivery_date: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expected_delivery_date: string | null
          external_id: string | null
          id: string
          is_deleted: boolean
          items: Json
          last_synced_at: string | null
          notes: string | null
          po_number: string
          requisition_ids: string[] | null
          shipping_cost: number
          source_system: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          updated_by: string | null
          vendor_id: string
          version: number
        }
        Insert: {
          actual_delivery_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_delivery_date?: string | null
          external_id?: string | null
          id?: string
          is_deleted?: boolean
          items?: Json
          last_synced_at?: string | null
          notes?: string | null
          po_number: string
          requisition_ids?: string[] | null
          shipping_cost?: number
          source_system?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
          version?: number
        }
        Update: {
          actual_delivery_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_delivery_date?: string | null
          external_id?: string | null
          id?: string
          is_deleted?: boolean
          items?: Json
          last_synced_at?: string | null
          notes?: string | null
          po_number?: string
          requisition_ids?: string[] | null
          shipping_cost?: number
          source_system?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
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
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          id: string
          is_deleted: boolean
          items: Json
          po_id: string | null
          reason: string | null
          rejection_reason: string | null
          requester_id: string
          requisition_number: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          id?: string
          is_deleted?: boolean
          items?: Json
          po_id?: string | null
          reason?: string | null
          rejection_reason?: string | null
          requester_id: string
          requisition_number: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          id?: string
          is_deleted?: boolean
          items?: Json
          po_id?: string | null
          reason?: string | null
          rejection_reason?: string | null
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
            foreignKeyName: "requisitions_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
      vendors: {
        Row: {
          address: string | null
          contact_emails: string[]
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          external_id: string | null
          id: string
          is_deleted: boolean
          last_synced_at: string | null
          lead_time_days: number | null
          name: string
          notes: string | null
          payment_terms: string | null
          source_system: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          address?: string | null
          contact_emails?: string[]
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          is_deleted?: boolean
          last_synced_at?: string | null
          lead_time_days?: number | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          source_system?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          address?: string | null
          contact_emails?: string[]
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          is_deleted?: boolean
          last_synced_at?: string | null
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          source_system?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
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
      [_ in never]: never
    }
    Functions: {
      calculate_buildability: {
        Args: { p_finished_sku: string }
        Returns: Json
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
      fulfill_purchase_order: {
        Args: { p_actual_delivery_date?: string; p_po_id: string }
        Returns: Json
      }
      generate_po_from_requisitions: {
        Args: { p_requisition_ids: string[]; p_vendor_id: string }
        Returns: Json
      }
      get_external_source_credentials: {
        Args: { source_id: string }
        Returns: Json
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
      increment_rate_limit: { Args: { source_id: string }; Returns: undefined }
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
