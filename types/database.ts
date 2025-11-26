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
  User,
  Label,
  ProductDataSheet,
  ComplianceRecord
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
      user_profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: 'Admin' | 'Manager' | 'Staff'
          department: 'Purchasing' | 'Operations' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV'
          onboarding_complete: boolean
          agreements: Json | null
          metadata: Json | null
          is_active: boolean
          last_login_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          full_name?: string | null
          role?: 'Admin' | 'Manager' | 'Staff'
          department?: 'Purchasing' | 'Operations' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV'
          onboarding_complete?: boolean
          agreements?: Json | null
          metadata?: Json | null
          is_active?: boolean
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          full_name?: string | null
          role?: 'Admin' | 'Manager' | 'Staff'
          department?: 'Purchasing' | 'Operations' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV'
          onboarding_complete?: boolean
          agreements?: Json | null
          metadata?: Json | null
          is_active?: boolean
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_profiles_id_fkey'
            columns: ['id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      bom_revisions: {
        Row: {
          id: string
          bom_id: string
          revision_number: number
          status: string
          summary?: string | null
          change_summary?: string | null
          change_diff?: Json | null
          snapshot: Json
          created_by?: string | null
          created_at: string
          reviewer_id?: string | null
          approved_by?: string | null
          approved_at?: string | null
          reverted_from_revision_id?: string | null
          approval_notes?: string | null
          metadata?: Json | null
        }
        Insert: {
          id?: string
          bom_id: string
          revision_number: number
          status?: string
          summary?: string | null
          change_summary?: string | null
          change_diff?: Json | null
          snapshot: Json
          created_by?: string | null
          created_at?: string
          reviewer_id?: string | null
          approved_by?: string | null
          approved_at?: string | null
          reverted_from_revision_id?: string | null
          approval_notes?: string | null
          metadata?: Json | null
        }
        Update: {
          bom_id?: string
          revision_number?: number
          status?: string
          summary?: string | null
          change_summary?: string | null
          change_diff?: Json | null
          snapshot?: Json
          created_by?: string | null
          created_at?: string
          reviewer_id?: string | null
          approved_by?: string | null
          approved_at?: string | null
          reverted_from_revision_id?: string | null
          approval_notes?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'bom_revisions_bom_id_fkey'
            columns: ['bom_id']
            referencedRelation: 'boms'
            referencedColumns: ['id']
          }
        ]
      }
      artwork_assets: {
        Row: {
          id: string
          legacy_id?: string | null
          file_name: string
          file_type: string
          status: string
          revision: number
          storage_path?: string | null
          download_url?: string | null
          preview_url?: string | null
          barcode?: string | null
          notes?: string | null
          metadata?: Json | null
          rtp_flag?: boolean
          uploaded_by?: string | null
          uploaded_at: string
          updated_at: string
          last_edited_by?: string | null
          last_edited_at?: string | null
          approved_by?: string | null
          approved_at?: string | null
          approval_notes?: string | null
          is_archived?: boolean
        }
        Insert: {
          id?: string
          legacy_id?: string | null
          file_name: string
          file_type?: string
          status?: string
          revision?: number
          storage_path?: string | null
          download_url?: string | null
          preview_url?: string | null
          barcode?: string | null
          notes?: string | null
          metadata?: Json | null
          rtp_flag?: boolean
          uploaded_by?: string | null
          uploaded_at?: string
          updated_at?: string
          last_edited_by?: string | null
          last_edited_at?: string | null
          approved_by?: string | null
          approved_at?: string | null
          approval_notes?: string | null
          is_archived?: boolean
        }
        Update: {
          legacy_id?: string | null
          file_name?: string
          file_type?: string
          status?: string
          revision?: number
          storage_path?: string | null
          download_url?: string | null
          preview_url?: string | null
          barcode?: string | null
          notes?: string | null
          metadata?: Json | null
          rtp_flag?: boolean
          uploaded_by?: string | null
          uploaded_at?: string
          updated_at?: string
          last_edited_by?: string | null
          last_edited_at?: string | null
          approved_by?: string | null
          approved_at?: string | null
          approval_notes?: string | null
          is_archived?: boolean
        }
        Relationships: []
      }
      bom_artwork_assets: {
        Row: {
          id: string
          bom_id: string
          asset_id: string
          usage_type: string
          workflow_state: string
          is_primary: boolean
          attached_at: string
          attached_by?: string | null
          notes?: string | null
        }
        Insert: {
          id?: string
          bom_id: string
          asset_id: string
          usage_type?: string
          workflow_state?: string
          is_primary?: boolean
          attached_at?: string
          attached_by?: string | null
          notes?: string | null
        }
        Update: {
          bom_id?: string
          asset_id?: string
          usage_type?: string
          workflow_state?: string
          is_primary?: boolean
          attached_at?: string
          attached_by?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'bom_artwork_assets_asset_id_fkey'
            columns: ['asset_id']
            referencedRelation: 'artwork_assets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bom_artwork_assets_bom_id_fkey'
            columns: ['bom_id']
            referencedRelation: 'boms'
            referencedColumns: ['id']
          }
        ]
      }
      asset_compliance_checks: {
        Row: {
          id: string
          asset_id: string
          check_type: string
          jurisdiction?: string | null
          status: string
          findings?: Json | null
          created_at: string
          checked_at?: string | null
          checked_by?: string | null
          metadata?: Json | null
        }
        Insert: {
          id?: string
          asset_id: string
          check_type: string
          jurisdiction?: string | null
          status?: string
          findings?: Json | null
          created_at?: string
          checked_at?: string | null
          checked_by?: string | null
          metadata?: Json | null
        }
        Update: {
          asset_id?: string
          check_type?: string
          jurisdiction?: string | null
          status?: string
          findings?: Json | null
          created_at?: string
          checked_at?: string | null
          checked_by?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'asset_compliance_checks_asset_id_fkey'
            columns: ['asset_id']
            referencedRelation: 'artwork_assets'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: []
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
        Relationships: []
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
          description?: string
          category?: string
          yield_quantity?: number
          potential_build_qty?: number
          average_cost?: number
          notes?: string
          data_source?: 'manual' | 'csv' | 'api'
          last_sync_at?: string
          sync_status?: 'synced' | 'pending' | 'error'
          primary_label_id?: string
          primary_data_sheet_id?: string
          compliance_status?: string
          total_state_registrations?: number
          expiring_registrations_count?: number
          compliance_last_checked?: string
          created_at?: string
          updated_at?: string
          revision_number?: number
          revision_status?: string
          revision_summary?: string | null
          revision_requested_by?: string | null
          revision_requested_at?: string | null
          revision_reviewer_id?: string | null
          revision_approved_by?: string | null
          revision_approved_at?: string | null
          last_approved_at?: string | null
          last_approved_by?: string | null
        }
        Insert: {
          id?: string
          finished_sku: string
          name: string
          components: Json
          artwork?: Json
          packaging: Json
          barcode?: string
          description?: string
          category?: string
          yield_quantity?: number
          potential_build_qty?: number
          average_cost?: number
          notes?: string
          data_source?: 'manual' | 'csv' | 'api'
          last_sync_at?: string
          sync_status?: 'synced' | 'pending' | 'error'
          primary_label_id?: string
          primary_data_sheet_id?: string
          compliance_status?: string
          total_state_registrations?: number
          expiring_registrations_count?: number
          compliance_last_checked?: string
          created_at?: string
          updated_at?: string
          revision_number?: number
          revision_status?: string
          revision_summary?: string | null
          revision_requested_by?: string | null
          revision_requested_at?: string | null
          revision_reviewer_id?: string | null
          revision_approved_by?: string | null
          revision_approved_at?: string | null
          last_approved_at?: string | null
          last_approved_by?: string | null
        }
        Update: {
          finished_sku?: string
          name?: string
          components?: Json
          artwork?: Json
          packaging?: Json
          barcode?: string
          description?: string
          category?: string
          yield_quantity?: number
          potential_build_qty?: number
          average_cost?: number
          notes?: string
          data_source?: 'manual' | 'csv' | 'api'
          last_sync_at?: string
          sync_status?: 'synced' | 'pending' | 'error'
          primary_label_id?: string
          primary_data_sheet_id?: string
          compliance_status?: string
          total_state_registrations?: number
          expiring_registrations_count?: number
          compliance_last_checked?: string
          updated_at?: string
          revision_number?: number
          revision_status?: string
          revision_summary?: string | null
          revision_requested_by?: string | null
          revision_requested_at?: string | null
          revision_reviewer_id?: string | null
          revision_approved_by?: string | null
          revision_approved_at?: string | null
          last_approved_at?: string | null
          last_approved_by?: string | null
        }
        Relationships: []
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
          // Migration 030: PO Tracking
          order_id?: string
          tracking_number?: string
          tracking_status?: string
          tracking_carrier?: string
          tracking_last_checked_at?: string
          tracking_last_exception?: string
          tracking_estimated_delivery?: string
          tracking_events?: Json
          // Migration 033: PO Follow-up Automation
          last_follow_up_stage?: number
          last_follow_up_sent_at?: string
          follow_up_required?: boolean
          follow_up_status?: string
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
          // Migration 030: PO Tracking
          order_id?: string
          tracking_number?: string
          tracking_status?: string
          tracking_carrier?: string
          tracking_last_checked_at?: string
          tracking_last_exception?: string
          tracking_estimated_delivery?: string
          tracking_events?: Json
          // Migration 033: PO Follow-up Automation
          last_follow_up_stage?: number
          last_follow_up_sent_at?: string
          follow_up_required?: boolean
          follow_up_status?: string
        }
        Update: {
          vendor_id?: string
          status?: string
          items?: Json
          expected_date?: string
          notes?: string
          requisition_ids?: string[]
          updated_at?: string
          // Migration 030: PO Tracking
          order_id?: string
          tracking_number?: string
          tracking_status?: string
          tracking_carrier?: string
          tracking_last_checked_at?: string
          tracking_last_exception?: string
          tracking_estimated_delivery?: string
          tracking_events?: Json
          // Migration 033: PO Follow-up Automation
          last_follow_up_stage?: number
          last_follow_up_sent_at?: string
          follow_up_required?: boolean
          follow_up_status?: string
        }
        Relationships: []
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
          // Migration 032: Requisition Enhancements
          request_type?: string
          priority?: string
          need_by_date?: string
          alert_only?: boolean
          auto_po?: boolean
          notify_requester?: boolean
          context?: string
          metadata?: Json
          manager_approved_by?: string | null
          manager_approved_at?: string | null
          ops_approval_required?: boolean
          ops_approved_by?: string | null
          ops_approved_at?: string | null
          forwarded_to_purchasing_at?: string | null
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
          // Migration 032: Requisition Enhancements
          request_type?: string
          priority?: string
          need_by_date?: string
          alert_only?: boolean
          auto_po?: boolean
          notify_requester?: boolean
          context?: string
          metadata?: Json
          manager_approved_by?: string | null
          manager_approved_at?: string | null
          ops_approval_required?: boolean
          ops_approved_by?: string | null
          ops_approved_at?: string | null
          forwarded_to_purchasing_at?: string | null
        }
        Update: {
          requested_by?: string
          department?: string
          status?: string
          items?: Json
          notes?: string
          updated_at?: string
          // Migration 032: Requisition Enhancements
          request_type?: string
          priority?: string
          need_by_date?: string
          alert_only?: boolean
          auto_po?: boolean
          notify_requester?: boolean
          context?: string
          metadata?: Json
          manager_approved_by?: string | null
          manager_approved_at?: string | null
          ops_approval_required?: boolean
          ops_approved_by?: string | null
          ops_approved_at?: string | null
          forwarded_to_purchasing_at?: string | null
        }
        Relationships: []
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
          // Migration 027: Production Calendar Integration
          scheduled_date?: string
          due_date?: string
          calendar_event_id?: string
          notes?: string
          estimated_duration_hours?: number
          assigned_user_id?: string
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
          // Migration 027: Production Calendar Integration
          scheduled_date?: string
          due_date?: string
          calendar_event_id?: string
          notes?: string
          estimated_duration_hours?: number
          assigned_user_id?: string
        }
        Update: {
          finished_sku?: string
          name?: string
          quantity?: number
          status?: string
          completed_at?: string
          updated_at?: string
          // Migration 027: Production Calendar Integration
          scheduled_date?: string
          due_date?: string
          calendar_event_id?: string
          notes?: string
          estimated_duration_hours?: number
          assigned_user_id?: string
        }
        Relationships: []
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
        Relationships: []
      }
      labels: {
        Row: {
          id: string
          file_name: string
          file_url: string
          file_size?: number
          mime_type?: string
          barcode?: string
          product_name?: string
          net_weight?: string
          revision?: number
          bom_id?: string
          scan_status: string
          scan_completed_at?: string
          scan_error?: string
          extracted_data?: Json
          ingredient_comparison?: Json
          verified: boolean
          verified_by?: string
          verified_at?: string
          file_type?: string
          status?: string
          approved_by?: string
          approved_date?: string
          notes?: string
          uploaded_by?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          file_name: string
          file_url: string
          file_size?: number
          mime_type?: string
          barcode?: string
          product_name?: string
          net_weight?: string
          revision?: number
          bom_id?: string
          scan_status?: string
          scan_completed_at?: string
          scan_error?: string
          extracted_data?: Json
          ingredient_comparison?: Json
          verified?: boolean
          verified_by?: string
          verified_at?: string
          file_type?: string
          status?: string
          approved_by?: string
          approved_date?: string
          notes?: string
          uploaded_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          file_name?: string
          file_url?: string
          file_size?: number
          mime_type?: string
          barcode?: string
          product_name?: string
          net_weight?: string
          revision?: number
          bom_id?: string
          scan_status?: string
          scan_completed_at?: string
          scan_error?: string
          extracted_data?: Json
          ingredient_comparison?: Json
          verified?: boolean
          verified_by?: string
          verified_at?: string
          file_type?: string
          status?: string
          approved_by?: string
          approved_date?: string
          notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_data_sheets: {
        Row: {
          id: string
          bom_id: string
          label_id?: string
          document_type: string
          title: string
          version: number
          description?: string
          content: Json
          pdf_url?: string
          pdf_generated_at?: string
          pdf_file_size?: number
          status: string
          approved_by?: string
          approved_at?: string
          approval_notes?: string
          is_ai_generated: boolean
          ai_model_used?: string
          generation_prompt?: string
          last_edited_by?: string
          edit_count: number
          edit_history?: Json
          published_at?: string
          published_version?: number
          tags?: string[]
          notes?: string
          created_by?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bom_id: string
          label_id?: string
          document_type: string
          title: string
          version?: number
          description?: string
          content: Json
          pdf_url?: string
          pdf_generated_at?: string
          pdf_file_size?: number
          status?: string
          approved_by?: string
          approved_at?: string
          approval_notes?: string
          is_ai_generated?: boolean
          ai_model_used?: string
          generation_prompt?: string
          last_edited_by?: string
          edit_count?: number
          edit_history?: Json
          published_at?: string
          published_version?: number
          tags?: string[]
          notes?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          bom_id?: string
          label_id?: string
          document_type?: string
          title?: string
          version?: number
          description?: string
          content?: Json
          pdf_url?: string
          pdf_generated_at?: string
          pdf_file_size?: number
          status?: string
          approved_by?: string
          approved_at?: string
          approval_notes?: string
          is_ai_generated?: boolean
          ai_model_used?: string
          generation_prompt?: string
          last_edited_by?: string
          edit_count?: number
          edit_history?: Json
          published_at?: string
          published_version?: number
          tags?: string[]
          notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      compliance_records: {
        Row: {
          id: string
          bom_id: string
          label_id?: string
          compliance_type: string
          category?: string
          issuing_authority?: string
          state_code?: string
          state_name?: string
          registration_number: string
          license_number?: string
          registered_date?: string
          effective_date?: string
          expiration_date?: string
          renewal_date?: string
          last_renewed_date?: string
          status: string
          days_until_expiration?: number
          registration_fee?: number
          renewal_fee?: number
          late_fee?: number
          currency?: string
          payment_status?: string
          certificate_url?: string
          certificate_file_name?: string
          certificate_file_size?: number
          additional_documents?: Json
          due_soon_alert_sent: boolean
          urgent_alert_sent: boolean
          expiration_alert_sent: boolean
          alert_email_addresses?: string[]
          requirements?: string
          restrictions?: string
          conditions?: Json
          contact_person?: string
          contact_email?: string
          contact_phone?: string
          authority_website?: string
          assigned_to?: string
          priority?: string
          notes?: string
          internal_notes?: string
          created_by?: string
          created_at: string
          updated_at: string
          last_verified_at?: string
          last_verified_by?: string
        }
        Insert: {
          id?: string
          bom_id: string
          label_id?: string
          compliance_type: string
          category?: string
          issuing_authority?: string
          state_code?: string
          state_name?: string
          registration_number: string
          license_number?: string
          registered_date?: string
          effective_date?: string
          expiration_date?: string
          renewal_date?: string
          last_renewed_date?: string
          status?: string
          days_until_expiration?: number
          registration_fee?: number
          renewal_fee?: number
          late_fee?: number
          currency?: string
          payment_status?: string
          certificate_url?: string
          certificate_file_name?: string
          certificate_file_size?: number
          additional_documents?: Json
          due_soon_alert_sent?: boolean
          urgent_alert_sent?: boolean
          expiration_alert_sent?: boolean
          alert_email_addresses?: string[]
          requirements?: string
          restrictions?: string
          conditions?: Json
          contact_person?: string
          contact_email?: string
          contact_phone?: string
          authority_website?: string
          assigned_to?: string
          priority?: string
          notes?: string
          internal_notes?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          last_verified_at?: string
          last_verified_by?: string
        }
        Update: {
          bom_id?: string
          label_id?: string
          compliance_type?: string
          category?: string
          issuing_authority?: string
          state_code?: string
          state_name?: string
          registration_number?: string
          license_number?: string
          registered_date?: string
          effective_date?: string
          expiration_date?: string
          renewal_date?: string
          last_renewed_date?: string
          status?: string
          days_until_expiration?: number
          registration_fee?: number
          renewal_fee?: number
          late_fee?: number
          currency?: string
          payment_status?: string
          certificate_url?: string
          certificate_file_name?: string
          certificate_file_size?: number
          additional_documents?: Json
          due_soon_alert_sent?: boolean
          urgent_alert_sent?: boolean
          expiration_alert_sent?: boolean
          alert_email_addresses?: string[]
          requirements?: string
          restrictions?: string
          conditions?: Json
          contact_person?: string
          contact_email?: string
          contact_phone?: string
          authority_website?: string
          assigned_to?: string
          priority?: string
          notes?: string
          internal_notes?: string
          updated_at?: string
          last_verified_at?: string
          last_verified_by?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          setting_key: string
          setting_category: string
          setting_value: Json
          display_name?: string
          description?: string
          is_sensitive: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          setting_key: string
          setting_category: string
          setting_value: Json
          display_name?: string
          description?: string
          is_sensitive?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          setting_key?: string
          setting_category?: string
          setting_value?: Json
          display_name?: string
          description?: string
          is_sensitive?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      mcp_server_configs: {
        Row: {
          id: string
          server_name: string
          server_type: string
          display_name: string
          is_local: boolean
          server_url: string
          api_key?: string
          anthropic_api_key?: string
          is_enabled: boolean
          health_status: string
          last_health_check?: string
          available_tools?: Json
          tool_permissions?: Json
          rate_limit_per_hour: number
          timeout_seconds: number
          retry_attempts: number
          notes?: string
          created_by?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          server_name: string
          server_type?: string
          display_name: string
          is_local?: boolean
          server_url: string
          api_key?: string
          anthropic_api_key?: string
          is_enabled?: boolean
          health_status?: string
          last_health_check?: string
          available_tools?: Json
          tool_permissions?: Json
          rate_limit_per_hour?: number
          timeout_seconds?: number
          retry_attempts?: number
          notes?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          server_name?: string
          server_type?: string
          display_name?: string
          is_local?: boolean
          server_url?: string
          api_key?: string
          anthropic_api_key?: string
          is_enabled?: boolean
          health_status?: string
          last_health_check?: string
          available_tools?: Json
          tool_permissions?: Json
          rate_limit_per_hour?: number
          timeout_seconds?: number
          retry_attempts?: number
          notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_compliance_profiles: {
        Row: {
          id: string
          user_id: string
          email: string
          profile_type: string
          onboarded_at: string
          regulatory_sources: Json
          compliance_level: string
          upgrade_requested_at?: string
          upgraded_at?: string
          last_compliance_check?: string
          total_checks_performed: number
          failed_checks_count: number
          is_active: boolean
          notes?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email: string
          profile_type?: string
          onboarded_at?: string
          regulatory_sources?: Json
          compliance_level?: string
          upgrade_requested_at?: string
          upgraded_at?: string
          last_compliance_check?: string
          total_checks_performed?: number
          failed_checks_count?: number
          is_active?: boolean
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          profile_type?: string
          regulatory_sources?: Json
          compliance_level?: string
          upgrade_requested_at?: string
          upgraded_at?: string
          last_compliance_check?: string
          total_checks_performed?: number
          failed_checks_count?: number
          is_active?: boolean
          notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_tool_calls: {
        Row: {
          id: string
          server_name: string
          tool_name: string
          user_id?: string
          session_id?: string
          input_params?: Json
          output_result?: Json
          status: string
          error_message?: string
          execution_time_ms?: number
          tokens_used?: number
          cost_usd?: number
          called_at: string
          created_at: string
        }
        Insert: {
          id?: string
          server_name: string
          tool_name: string
          user_id?: string
          session_id?: string
          input_params?: Json
          output_result?: Json
          status: string
          error_message?: string
          execution_time_ms?: number
          tokens_used?: number
          cost_usd?: number
          called_at?: string
          created_at?: string
        }
        Update: {
          server_name?: string
          tool_name?: string
          user_id?: string
          session_id?: string
          input_params?: Json
          output_result?: Json
          status?: string
          error_message?: string
          execution_time_ms?: number
          tokens_used?: number
          cost_usd?: number
          called_at?: string
        }
        Relationships: []
      }
      scraping_configs: {
        Row: {
          id: string
          config_name: string
          base_url: string
          selectors: Json
          rate_limit_ms: number
          user_agent?: string
          headers?: Json
          is_enabled: boolean
          last_successful_scrape?: string
          total_scrapes: number
          failed_scrapes: number
          notes?: string
          created_by?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          config_name: string
          base_url: string
          selectors: Json
          rate_limit_ms?: number
          user_agent?: string
          headers?: Json
          is_enabled?: boolean
          last_successful_scrape?: string
          total_scrapes?: number
          failed_scrapes?: number
          notes?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          config_name?: string
          base_url?: string
          selectors?: Json
          rate_limit_ms?: number
          user_agent?: string
          headers?: Json
          is_enabled?: boolean
          last_successful_scrape?: string
          total_scrapes?: number
          failed_scrapes?: number
          notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      scraping_jobs: {
        Row: {
          id: string
          config_id?: string
          job_type: string
          url: string
          status: string
          started_at?: string
          completed_at?: string
          duration_ms?: number
          scraped_data?: Json
          error_message?: string
          retry_count: number
          triggered_by?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          config_id?: string
          job_type: string
          url: string
          status?: string
          started_at?: string
          completed_at?: string
          duration_ms?: number
          scraped_data?: Json
          error_message?: string
          retry_count?: number
          triggered_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          config_id?: string
          job_type?: string
          url?: string
          status?: string
          started_at?: string
          completed_at?: string
          duration_ms?: number
          scraped_data?: Json
          error_message?: string
          retry_count?: number
          triggered_by?: string
          updated_at?: string
        }
        Relationships: []
      }
      build_order_material_requirements: {
        Row: {
          id: string
          build_order_id: string
          sku: string
          name: string
          required_quantity: number
          available_quantity: number
          shortfall: number
          vendor_id?: string
          vendor_name?: string
          lead_time_days?: number
          estimated_cost?: number
          sourced: boolean
          sourced_at?: string
          notes?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          build_order_id: string
          sku: string
          name: string
          required_quantity: number
          available_quantity?: number
          vendor_id?: string
          vendor_name?: string
          lead_time_days?: number
          estimated_cost?: number
          sourced?: boolean
          sourced_at?: string
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          build_order_id?: string
          sku?: string
          name?: string
          required_quantity?: number
          available_quantity?: number
          vendor_id?: string
          vendor_name?: string
          lead_time_days?: number
          estimated_cost?: number
          sourced?: boolean
          sourced_at?: string
          notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_calendar_settings: {
        Row: {
          id: string
          user_id: string
          google_calendar_id?: string
          default_duration_hours: number
          default_time_zone: string
          email_reminders_enabled: boolean
          reminder_hours_before: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          google_calendar_id?: string
          default_duration_hours?: number
          default_time_zone?: string
          email_reminders_enabled?: boolean
          reminder_hours_before?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          google_calendar_id?: string
          default_duration_hours?: number
          default_time_zone?: string
          email_reminders_enabled?: boolean
          reminder_hours_before?: number
          updated_at?: string
        }
        Relationships: []
      }
      po_tracking_events: {
        Row: {
          id: string
          po_id: string
          status: string
          carrier?: string
          tracking_number?: string
          description?: string
          raw_payload?: Json
          created_at: string
        }
        Insert: {
          id?: string
          po_id: string
          status: string
          carrier?: string
          tracking_number?: string
          description?: string
          raw_payload?: Json
          created_at?: string
        }
        Update: {
          po_id?: string
          status?: string
          carrier?: string
          tracking_number?: string
          description?: string
          raw_payload?: Json
        }
        Relationships: []
      }
      po_email_tracking: {
        Row: {
          id: string
          po_id?: string
          vendor_email?: string
          gmail_message_id?: string
          gmail_thread_id?: string
          gmail_history_id?: string
          gmail_label_ids?: string[]
          metadata?: Json
          sent_at: string
          last_reply_at?: string
          last_reply_message_id?: string
          created_at: string
        }
        Insert: {
          id?: string
          po_id?: string
          vendor_email?: string
          gmail_message_id?: string
          gmail_thread_id?: string
          gmail_history_id?: string
          gmail_label_ids?: string[]
          metadata?: Json
          sent_at?: string
          last_reply_at?: string
          last_reply_message_id?: string
          created_at?: string
        }
        Update: {
          po_id?: string
          vendor_email?: string
          gmail_message_id?: string
          gmail_thread_id?: string
          gmail_history_id?: string
          gmail_label_ids?: string[]
          metadata?: Json
          sent_at?: string
          last_reply_at?: string
          last_reply_message_id?: string
        }
        Relationships: []
      }
      po_followup_rules: {
        Row: {
          id: string
          stage: number
          wait_hours: number
          subject_template: string
          body_template: string
          instructions?: string
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          stage: number
          wait_hours: number
          subject_template: string
          body_template: string
          instructions?: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          stage?: number
          wait_hours?: number
          subject_template?: string
          body_template?: string
          instructions?: string
          active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      vendor_followup_events: {
        Row: {
          id: string
          po_id: string
          vendor_id: string
          stage: number
          sent_at: string
          subject: string
          body_preview?: string
          recipient_email: string
          gmail_message_id?: string
          gmail_thread_id?: string
          opened: boolean
          opened_at?: string
          replied: boolean
          replied_at?: string
          reply_message_id?: string
          reply_body_preview?: string
          status: string
          notes?: string
          created_at: string
        }
        Insert: {
          id?: string
          po_id: string
          vendor_id: string
          stage: number
          sent_at: string
          subject: string
          body_preview?: string
          recipient_email: string
          gmail_message_id?: string
          gmail_thread_id?: string
          opened?: boolean
          opened_at?: string
          replied?: boolean
          replied_at?: string
          reply_message_id?: string
          reply_body_preview?: string
          status?: string
          notes?: string
          created_at?: string
        }
        Update: {
          po_id?: string
          vendor_id?: string
          stage?: number
          sent_at?: string
          subject?: string
          body_preview?: string
          recipient_email?: string
          gmail_message_id?: string
          gmail_thread_id?: string
          opened?: boolean
          opened_at?: string
          replied?: boolean
          replied_at?: string
          reply_message_id?: string
          reply_body_preview?: string
          status?: string
          notes?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_upcoming_renewals: {
        Args: {
          p_days_ahead: number
        }
        Returns: {
          id: string
          bom_id: string
          compliance_type: string
          state_name: string | null
          registration_number: string
          expiration_date: string | null
          days_until_expiration: number | null
          status: string
          assigned_to: string | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
