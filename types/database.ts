/**
 * Database Types - Supabase Schema
 * 
 * This file contains TypeScript types that mirror the Supabase database schema.
 * These types are used by the Supabase client for type-safe queries.
 * 
 * Generated from the database schema defined in:
 * - supabase/migrations/001_api_audit_log.sql
 * - Backend documentation (backend_documentation.md)
 */

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
      users: {
        Row: {
          id: string
          name: string
          email: string
          password_hash: string
          role: 'Admin' | 'Manager' | 'Staff'
          department: 'Purchasing' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV'
          onboarding_complete: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          password_hash: string
          role: 'Admin' | 'Manager' | 'Staff'
          department: 'Purchasing' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV'
          onboarding_complete?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          password_hash?: string
          role?: 'Admin' | 'Manager' | 'Staff'
          department?: 'Purchasing' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV'
          onboarding_complete?: boolean
          created_at?: string
          updated_at?: string
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
          vendor_id: string
          moq: number | null
          is_deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          sku: string
          name: string
          category: string
          stock?: number
          on_order?: number
          reorder_point: number
          vendor_id: string
          moq?: number | null
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          sku?: string
          name?: string
          category?: string
          stock?: number
          on_order?: number
          reorder_point?: number
          vendor_id?: string
          moq?: number | null
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      vendors: {
        Row: {
          id: string
          name: string
          contact_emails: Json
          phone: string
          address: string
          website: string
          lead_time_days: number
          is_deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          contact_emails: Json
          phone: string
          address: string
          website: string
          lead_time_days: number
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          contact_emails?: Json
          phone?: string
          address?: string
          website?: string
          lead_time_days?: number
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      bills_of_materials: {
        Row: {
          id: string
          finished_sku: string
          name: string
          components: Json
          artwork: Json
          packaging: Json
          barcode: string | null
          is_deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          finished_sku: string
          name: string
          components: Json
          artwork: Json
          packaging: Json
          barcode?: string | null
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          finished_sku?: string
          name?: string
          components?: Json
          artwork?: Json
          packaging?: Json
          barcode?: string | null
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      artwork_folders: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
      }
      purchase_orders: {
        Row: {
          id: string
          vendor_id: string
          status: 'Pending' | 'Submitted' | 'Fulfilled'
          items: Json
          expected_date: string | null
          notes: string | null
          requisition_ids: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vendor_id: string
          status?: 'Pending' | 'Submitted' | 'Fulfilled'
          items: Json
          expected_date?: string | null
          notes?: string | null
          requisition_ids?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vendor_id?: string
          status?: 'Pending' | 'Submitted' | 'Fulfilled'
          items?: Json
          expected_date?: string | null
          notes?: string | null
          requisition_ids?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      internal_requisitions: {
        Row: {
          id: string
          requester_id: string
          status: 'Pending' | 'Approved' | 'Rejected' | 'Fulfilled'
          items: Json
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          requester_id: string
          status?: 'Pending' | 'Approved' | 'Rejected' | 'Fulfilled'
          items: Json
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          requester_id?: string
          status?: 'Pending' | 'Approved' | 'Rejected' | 'Fulfilled'
          items?: Json
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      build_orders: {
        Row: {
          id: string
          finished_sku: string
          name: string
          quantity: number
          status: 'Pending' | 'In Progress' | 'Completed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          finished_sku: string
          name: string
          quantity: number
          status?: 'Pending' | 'In Progress' | 'Completed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          finished_sku?: string
          name?: string
          quantity?: number
          status?: 'Pending' | 'In Progress' | 'Completed'
          created_at?: string
          updated_at?: string
        }
      }
      api_audit_log: {
        Row: {
          id: number
          request_id: string
          timestamp: string
          user_id: string
          service: string
          action: string
          success: boolean
          execution_time_ms: number
          error_message: string | null
          response_size_bytes: number | null
          estimated_cost_usd: number | null
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          id?: number
          request_id: string
          timestamp?: string
          user_id: string
          service: string
          action: string
          success: boolean
          execution_time_ms: number
          error_message?: string | null
          response_size_bytes?: number | null
          estimated_cost_usd?: number | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: number
          request_id?: string
          timestamp?: string
          user_id?: string
          service?: string
          action?: string
          success?: boolean
          execution_time_ms?: number
          error_message?: string | null
          response_size_bytes?: number | null
          estimated_cost_usd?: number | null
          ip_address?: string | null
          user_agent?: string | null
        }
      }
      api_rate_limit_tracking: {
        Row: {
          id: number
          user_id: string
          service: string
          window_start: string
          window_end: string
          request_count: number
          limit_hit_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id: string
          service: string
          window_start: string
          window_end: string
          request_count?: number
          limit_hit_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          service?: string
          window_start?: string
          window_end?: string
          request_count?: number
          limit_hit_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      vault: {
        Row: {
          id: number
          name: string
          secret: string
          description: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: number
          name: string
          secret: string
          description?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: number
          name?: string
          secret?: string
          description?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
      }
    }
    Views: {
      api_cost_summary: {
        Row: {
          date: string
          service: string
          total_requests: number
          successful_requests: number
          failed_requests: number
          avg_execution_time_ms: number
          total_cost_usd: number
        }
      }
      user_api_usage: {
        Row: {
          user_id: string
          service: string
          total_requests: number
          successful_requests: number
          failed_requests: number
          avg_execution_time_ms: number
          last_request_at: string
        }
      }
    }
    Functions: {
      cleanup_old_audit_logs: {
        Args: {
          retention_days?: number
        }
        Returns: number
      }
      get_rate_limit_status: {
        Args: {
          p_user_id: string
          p_service: string
          p_window_minutes?: number
        }
        Returns: {
          request_count: number
          limit_remaining: number
          window_reset_at: string
        }[]
      }
    }
  }
}
