-- Migration: Add missing sales_last_60_days column
-- Date: November 12, 2025
-- Purpose: Fix missing 60-day sales tracking column

-- Add the missing sales_last_60_days column
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS sales_last_60_days INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN inventory_items.sales_last_60_days IS 'Sales units in last 60 days (from Finale)';
