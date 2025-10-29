// types/supabase.ts
// Auto-generated TypeScript types from Supabase schema
// Run: npm run supabase:types to regenerate

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          id: string
          table_name: string
          record_id: string
          action: 'INSERT' | 'UPDATE' | 'DELETE'
          old_values: Json | null
          new_values: Json | null
          changed_fields: string[] | null
          user_id: string | null
          user_email: string | null
          user_role: string | null
          ip_address: string | null
          user_agent: string | null
          timestamp: string
          transaction_id: string | null
          session_id: string | null
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          action: 'INSERT' | 'UPDATE' | 'DELETE'
          old_values?: Json | null
          new_values?: Json | null
          changed_fields?: string[] | null
          user_id?: string | null
          user_email?: string | null
          user_role?: string | null
          ip_address?: string | null
          user_agent?: string | null
          timestamp?: string
          transaction_id?: string | null
          session_id?: string | null
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string
          action?: 'INSERT' | 'UPDATE' | 'DELETE'
          old_values?: Json | null
          new_values?: Json | null
          changed_fields?: string[] | null
          user_id?: string | null
          user_email?: string | null
          user_role?: string | null
          ip_address?: string | null
          user_agent?: string | null
          timestamp?: string
          transaction_id?: string | null
          session_id?: string | null
        }
      }
      users: {
        Row: {
          id: string
          email: string
          name: string
          role: 'Admin' | 'Manager' | 'Staff'
          department: 'Production' | 'Purchasing' | 'Quality' | 'Warehouse' | 'Management' | null
          created_at: string
          updated_at: string
          is_deleted: boolean
          deleted_at: string | null
          version: number
        }
        Insert: {
          id: string
          email: string
          name: string
          role?: 'Admin' | 'Manager' | 'Staff'
          department?: 'Production' | 'Purchasing' | 'Quality' | 'Warehouse' | 'Management' | null
          created_at?: string
          updated_at?: string
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
        Update: {
          id?: string
          email?: string
          name?: string
          role?: 'Admin' | 'Manager' | 'Staff'
          department?: 'Production' | 'Purchasing' | 'Quality' | 'Warehouse' | 'Management' | null
          created_at?: string
          updated_at?: string
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
      }
      vendors: {
        Row: {
          id: string
          name: string
          contact_emails: string[]
          contact_phone: string | null
          address: string | null
          payment_terms: string | null
          lead_time_days: number | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          is_deleted: boolean
          deleted_at: string | null
          version: number
        }
        Insert: {
          id?: string
          name: string
          contact_emails?: string[]
          contact_phone?: string | null
          address?: string | null
          payment_terms?: string | null
          lead_time_days?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
        Update: {
          id?: string
          name?: string
          contact_emails?: string[]
          contact_phone?: string | null
          address?: string | null
          payment_terms?: string | null
          lead_time_days?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
      }
      inventory_items: {
        Row: {
          sku: string
          name: string
          category: string
          stock: number
          on_order: number
          reorder_point: number
          vendor_id: string | null
          moq: number
          unit_price: number | null
          unit_of_measure: string | null
          location: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          is_deleted: boolean
          deleted_at: string | null
          version: number
        }
        Insert: {
          sku: string
          name: string
          category: string
          stock?: number
          on_order?: number
          reorder_point?: number
          vendor_id?: string | null
          moq?: number
          unit_price?: number | null
          unit_of_measure?: string | null
          location?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
        Update: {
          sku?: string
          name?: string
          category?: string
          stock?: number
          on_order?: number
          reorder_point?: number
          vendor_id?: string | null
          moq?: number
          unit_price?: number | null
          unit_of_measure?: string | null
          location?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
      }
      artwork_folders: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          is_deleted: boolean
          deleted_at: string | null
          version: number
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
      }
      boms: {
        Row: {
          id: string
          finished_sku: string
          name: string
          components: Json
          artwork: Json
          packaging: Json
          barcode: string | null
          production_notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          is_deleted: boolean
          deleted_at: string | null
          version: number
        }
        Insert: {
          id?: string
          finished_sku: string
          name: string
          components?: Json
          artwork?: Json
          packaging?: Json
          barcode?: string | null
          production_notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
        Update: {
          id?: string
          finished_sku?: string
          name?: string
          components?: Json
          artwork?: Json
          packaging?: Json
          barcode?: string | null
          production_notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
      }
      purchase_orders: {
        Row: {
          id: string
          po_number: string
          vendor_id: string
          status: 'Pending' | 'Submitted' | 'Fulfilled' | 'Cancelled'
          items: Json
          subtotal: number
          tax_amount: number
          shipping_cost: number
          total_amount: number
          requisition_ids: string[]
          expected_delivery_date: string | null
          actual_delivery_date: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          is_deleted: boolean
          deleted_at: string | null
          version: number
        }
        Insert: {
          id?: string
          po_number: string
          vendor_id: string
          status?: 'Pending' | 'Submitted' | 'Fulfilled' | 'Cancelled'
          items?: Json
          subtotal?: number
          tax_amount?: number
          shipping_cost?: number
          total_amount?: number
          requisition_ids?: string[]
          expected_delivery_date?: string | null
          actual_delivery_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
        Update: {
          id?: string
          po_number?: string
          vendor_id?: string
          status?: 'Pending' | 'Submitted' | 'Fulfilled' | 'Cancelled'
          items?: Json
          subtotal?: number
          tax_amount?: number
          shipping_cost?: number
          total_amount?: number
          requisition_ids?: string[]
          expected_delivery_date?: string | null
          actual_delivery_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
      }
      requisitions: {
        Row: {
          id: string
          requisition_number: string
          requester_id: string
          department: string | null
          status: 'Pending' | 'Approved' | 'Rejected' | 'Processed'
          items: Json
          reason: string | null
          approved_by: string | null
          approved_at: string | null
          rejection_reason: string | null
          po_id: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          is_deleted: boolean
          deleted_at: string | null
          version: number
        }
        Insert: {
          id?: string
          requisition_number: string
          requester_id: string
          department?: string | null
          status?: 'Pending' | 'Approved' | 'Rejected' | 'Processed'
          items?: Json
          reason?: string | null
          approved_by?: string | null
          approved_at?: string | null
          rejection_reason?: string | null
          po_id?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
        Update: {
          id?: string
          requisition_number?: string
          requester_id?: string
          department?: string | null
          status?: 'Pending' | 'Approved' | 'Rejected' | 'Processed'
          items?: Json
          reason?: string | null
          approved_by?: string | null
          approved_at?: string | null
          rejection_reason?: string | null
          po_id?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
      }
      build_orders: {
        Row: {
          id: string
          build_number: string
          bom_id: string
          finished_sku: string
          quantity: number
          status: 'Planned' | 'In Progress' | 'Completed' | 'Cancelled'
          scheduled_date: string | null
          started_at: string | null
          completed_at: string | null
          assigned_to: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
          is_deleted: boolean
          deleted_at: string | null
          version: number
        }
        Insert: {
          id?: string
          build_number: string
          bom_id: string
          finished_sku: string
          quantity: number
          status?: 'Planned' | 'In Progress' | 'Completed' | 'Cancelled'
          scheduled_date?: string | null
          started_at?: string | null
          completed_at?: string | null
          assigned_to?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
        Update: {
          id?: string
          build_number?: string
          bom_id?: string
          finished_sku?: string
          quantity?: number
          status?: 'Planned' | 'In Progress' | 'Completed' | 'Cancelled'
          scheduled_date?: string | null
          started_at?: string | null
          completed_at?: string | null
          assigned_to?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
          is_deleted?: boolean
          deleted_at?: string | null
          version?: number
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_buildability: {
        Args: {
          p_finished_sku: string
        }
        Returns: Json
      }
      complete_build_order: {
        Args: {
          p_build_order_id: string
        }
        Returns: Json
      }
      create_purchase_order: {
        Args: {
          p_vendor_id: string
          p_items: Json
          p_requisition_ids?: string[]
          p_expected_delivery_date?: string
          p_notes?: string
        }
        Returns: Json
      }
      fulfill_purchase_order: {
        Args: {
          p_po_id: string
          p_actual_delivery_date?: string
        }
        Returns: Json
      }
      generate_po_from_requisitions: {
        Args: {
          p_vendor_id: string
          p_requisition_ids: string[]
        }
        Returns: Json
      }
      get_audit_history: {
        Args: {
          p_table_name: string
          p_record_id: string
        }
        Returns: {
          timestamp: string
          action: string
          changed_by: string
          changed_fields: string[]
          old_values: Json
          new_values: Json
        }[]
      }
      get_user_activity: {
        Args: {
          p_user_id: string
          p_limit?: number
        }
        Returns: {
          timestamp: string
          table_name: string
          action: string
          record_id: string
          changed_fields: string[]
        }[]
      }
      get_valid_next_statuses: {
        Args: {
          p_table_type: string
          p_current_status: string
        }
        Returns: {
          to_status: string
          requires_role: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
