/**
 * Supabase Database Types
 * 
 * TypeScript types generated from Supabase schema
 * This file maps our application types to Supabase table structures
 */

import type {
  BillOfMaterials,
  InventoryItem,
  Vendor,
  PurchaseOrder,
  BuildOrder,
  InternalRequisition,
  ArtworkFolder,
  User
} from '../types';

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
          role: string
          department: string
          onboarding_complete: boolean
          created_at?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          role: string
          department: string
          onboarding_complete?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          email?: string
          role?: string
          department?: string
          onboarding_complete?: boolean
          updated_at?: string
        }
      }
      vendors: {
        Row: {
          id: string
          name: string
          contact_emails: string[]
          phone: string
          address: string
          website: string
          lead_time_days: number
          // Enhanced schema fields (from 002_enhance_vendor_schema.sql)
          address_line1: string
          address_line2: string
          city: string
          state: string
          postal_code: string
          country: string
          notes: string
          data_source: 'manual' | 'csv' | 'api'
          last_sync_at?: string
          sync_status: 'synced' | 'pending' | 'error'
          created_at?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          name: string
          contact_emails?: string[]
          phone?: string
          address?: string
          website?: string
          lead_time_days?: number
          // Enhanced schema fields
          address_line1?: string
          address_line2?: string
          city?: string
          state?: string
          postal_code?: string
          country?: string
          notes?: string
          data_source?: 'manual' | 'csv' | 'api'
          last_sync_at?: string
          sync_status?: 'synced' | 'pending' | 'error'
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          contact_emails?: string[]
          phone?: string
          address?: string
          website?: string
          lead_time_days?: number
          // Enhanced schema fields
          address_line1?: string
          address_line2?: string
          city?: string
          state?: string
          postal_code?: string
          country?: string
          notes?: string
          data_source?: 'manual' | 'csv' | 'api'
          last_sync_at?: string
          sync_status?: 'synced' | 'pending' | 'error'
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
          moq: number
          // Enhanced fields from migration 003
          description?: string
          status?: 'active' | 'inactive' | 'discontinued'
          unit_cost?: number
          unit_price?: number
          currency?: string
          units_in_stock?: number
          units_on_order?: number
          units_reserved?: number
          reorder_variance?: number
          qty_to_order?: number
          sales_velocity_consolidated?: number
          sales_last_30_days?: number
          sales_last_90_days?: number
          warehouse_location?: string
          bin_location?: string
          facility_id?: string
          supplier_sku?: string
          last_purchase_date?: string
          weight?: number
          weight_unit?: string
          dimensions?: string
          upc?: string
          lot_tracking?: boolean
          data_source?: 'manual' | 'csv' | 'api'
          last_sync_at?: string
          sync_status?: 'synced' | 'pending' | 'error'
          sync_errors?: string
          created_at?: string
          updated_at?: string
        }
        Insert: {
          sku: string
          name: string
          category?: string
          stock?: number
          on_order?: number
          reorder_point?: number
          vendor_id?: string
          moq?: number
          // Enhanced fields
          description?: string
          status?: 'active' | 'inactive' | 'discontinued'
          unit_cost?: number
          unit_price?: number
          currency?: string
          units_in_stock?: number
          units_on_order?: number
          units_reserved?: number
          reorder_variance?: number
          qty_to_order?: number
          sales_velocity_consolidated?: number
          sales_last_30_days?: number
          sales_last_90_days?: number
          warehouse_location?: string
          bin_location?: string
          facility_id?: string
          supplier_sku?: string
          last_purchase_date?: string
          weight?: number
          weight_unit?: string
          dimensions?: string
          upc?: string
          lot_tracking?: boolean
          data_source?: 'manual' | 'csv' | 'api'
          last_sync_at?: string
          sync_status?: 'synced' | 'pending' | 'error'
          sync_errors?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          category?: string
          stock?: number
          on_order?: number
          reorder_point?: number
          vendor_id?: string
          moq?: number
          // Enhanced fields
          description?: string
          status?: 'active' | 'inactive' | 'discontinued'
          unit_cost?: number
          unit_price?: number
          currency?: string
          units_in_stock?: number
          units_on_order?: number
          units_reserved?: number
          reorder_variance?: number
          qty_to_order?: number
          sales_velocity_consolidated?: number
          sales_last_30_days?: number
          sales_last_90_days?: number
          warehouse_location?: string
          bin_location?: string
          facility_id?: string
          supplier_sku?: string
          last_purchase_date?: string
          weight?: number
          weight_unit?: string
          dimensions?: string
          upc?: string
          lot_tracking?: boolean
          data_source?: 'manual' | 'csv' | 'api'
          last_sync_at?: string
          sync_status?: 'synced' | 'pending' | 'error'
          sync_errors?: string
          updated_at?: string
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
          barcode?: string
          created_at?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          finished_sku: string
          name: string
          components: Json
          artwork?: Json
          packaging: Json
          barcode?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          finished_sku?: string
          name?: string
          components?: Json
          artwork?: Json
          packaging?: Json
          barcode?: string
          updated_at?: string
        }
      }
      purchase_orders: {
        Row: {
          id: string
          vendor_id: string
          status: string
          created_at: string
          items: Json
          expected_date?: string
          notes?: string
          requisition_ids: string[]
          updated_at?: string
        }
        Insert: {
          id?: string
          vendor_id: string
          status?: string
          created_at?: string
          items: Json
          expected_date?: string
          notes?: string
          requisition_ids?: string[]
          updated_at?: string
        }
        Update: {
          vendor_id?: string
          status?: string
          items?: Json
          expected_date?: string
          notes?: string
          requisition_ids?: string[]
          updated_at?: string
        }
      }
      requisitions: {
        Row: {
          id: string
          requested_by: string
          department: string
          status: string
          created_at: string
          items: Json
          notes?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          requested_by: string
          department: string
          status?: string
          created_at?: string
          items: Json
          notes?: string
          updated_at?: string
        }
        Update: {
          requested_by?: string
          department?: string
          status?: string
          items?: Json
          notes?: string
          updated_at?: string
        }
      }
      build_orders: {
        Row: {
          id: string
          finished_sku: string
          name: string
          quantity: number
          status: string
          created_at: string
          completed_at?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          finished_sku: string
          name: string
          quantity: number
          status?: string
          created_at?: string
          completed_at?: string
          updated_at?: string
        }
        Update: {
          finished_sku?: string
          name?: string
          quantity?: number
          status?: string
          completed_at?: string
          updated_at?: string
        }
      }
      artwork_folders: {
        Row: {
          id: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
