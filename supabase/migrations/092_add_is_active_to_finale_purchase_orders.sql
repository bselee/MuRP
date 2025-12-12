-- Migration: 092_add_is_active_to_finale_purchase_orders.sql
-- Description: Add is_active field to finale_purchase_orders for proper data lifecycle management
-- Author: System
-- Date: 2025-12-12

-- This migration adds an is_active field to track which purchase orders should be
-- displayed in the app. POs older than 18 months will be marked as inactive to
-- prevent stale data from appearing in the UI.

BEGIN;

-- ============================================================================
-- ADD COLUMN: is_active to finale_purchase_orders
-- ============================================================================
ALTER TABLE finale_purchase_orders
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ============================================================================
-- BACKFILL: Mark POs older than 18 months as inactive
-- ============================================================================
-- This will mark historical POs as inactive to clean up the initial state
DO $$
DECLARE
  cutoff_date DATE;
  marked_inactive_count INTEGER;
BEGIN
  -- Calculate 18 months ago from today
  cutoff_date := CURRENT_DATE - INTERVAL '18 months';

  -- Mark old POs as inactive
  UPDATE finale_purchase_orders
  SET is_active = false
  WHERE order_date < cutoff_date
    OR order_date IS NULL;

  GET DIAGNOSTICS marked_inactive_count = ROW_COUNT;

  RAISE NOTICE 'Marked % purchase orders as inactive (older than %)',
    marked_inactive_count, cutoff_date;
END$$;

-- ============================================================================
-- ADD INDEX: Speed up queries filtering by is_active
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_finale_purchase_orders_active
ON finale_purchase_orders (is_active, order_date DESC)
WHERE is_active = true;

-- ============================================================================
-- VERIFICATION: Log counts
-- ============================================================================
DO $$
DECLARE
  total_pos INTEGER;
  active_pos INTEGER;
  inactive_pos INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_pos FROM finale_purchase_orders;
  SELECT COUNT(*) INTO active_pos FROM finale_purchase_orders WHERE is_active = true;
  SELECT COUNT(*) INTO inactive_pos FROM finale_purchase_orders WHERE is_active = false;

  RAISE NOTICE 'PURCHASE ORDERS SUMMARY:';
  RAISE NOTICE '  - Total POs: %', total_pos;
  RAISE NOTICE '  - Active POs: %', active_pos;
  RAISE NOTICE '  - Inactive POs: %', inactive_pos;
END$$;

COMMIT;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- This migration:
-- 1. Adds is_active field (default true) to finale_purchase_orders
-- 2. Marks POs older than 18 months as inactive
-- 3. Adds an index for efficient active-only queries
--
-- The sync functions should:
-- - Set is_active = true for all newly synced/updated POs
-- - Periodically mark POs older than 18 months as inactive
--
-- The frontend should:
-- - Query only is_active = true POs by default
-- - Allow "Show All History" to include inactive POs
