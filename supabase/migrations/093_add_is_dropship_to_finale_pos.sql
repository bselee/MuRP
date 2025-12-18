-- Migration: 093_add_is_dropship_to_finale_pos.sql
-- Description: Add is_dropship flag to finale_purchase_orders for proper filtering
-- Author: System
-- Date: 2025-12-12

BEGIN;

-- Add is_dropship field to finale_purchase_orders
ALTER TABLE finale_purchase_orders
ADD COLUMN IF NOT EXISTS is_dropship BOOLEAN DEFAULT false;

-- Backfill: Mark existing POs as dropship if they have dropship indicators
UPDATE finale_purchase_orders
SET is_dropship = true
WHERE
  (public_notes ILIKE '%dropship%' OR public_notes ILIKE '%drop ship%' OR public_notes ILIKE '%drop-ship%')
  OR (private_notes ILIKE '%dropship%' OR private_notes ILIKE '%drop ship%' OR private_notes ILIKE '%drop-ship%');

-- Add index for efficient dropship filtering
CREATE INDEX IF NOT EXISTS idx_finale_purchase_orders_dropship
ON finale_purchase_orders (is_dropship, is_active)
WHERE is_dropship = false AND is_active = true;

COMMIT;

-- Usage: Frontend can now filter by is_dropship flag instead of text searching notes
