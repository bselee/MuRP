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
