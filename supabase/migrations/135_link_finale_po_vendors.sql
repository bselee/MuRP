-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 135: Link Finale Purchase Orders to Finale Vendors
-- ════════════════════════════════════════════════════════════════════════════
--
-- Problem: finale_purchase_orders has vendor_name but vendor_id is NULL
-- This prevents vendor engagement scoring from working.
--
-- Solution: Match finale_vendors by party_name and populate vendor_id FK
-- Note: finale_purchase_orders.vendor_id references finale_vendors.id
-- ════════════════════════════════════════════════════════════════════════════

-- Update finale_purchase_orders to link vendor_id based on vendor_name match
-- Using finale_vendors table (party_name column)
UPDATE finale_purchase_orders fpo
SET vendor_id = fv.id
FROM finale_vendors fv
WHERE fpo.vendor_id IS NULL
  AND fpo.vendor_name IS NOT NULL
  AND LOWER(TRIM(fpo.vendor_name)) = LOWER(TRIM(fv.party_name));

-- Log how many were linked
DO $$
DECLARE
  linked_count INTEGER;
  unlinked_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO linked_count FROM finale_purchase_orders WHERE vendor_id IS NOT NULL;
  SELECT COUNT(*) INTO unlinked_count FROM finale_purchase_orders WHERE vendor_id IS NULL AND vendor_name IS NOT NULL;

  RAISE NOTICE 'Finale POs with vendor_id linked: %', linked_count;
  RAISE NOTICE 'Finale POs still unlinked (no matching finale_vendor): %', unlinked_count;
END $$;

-- Create a function to auto-link vendors on insert/update
CREATE OR REPLACE FUNCTION link_finale_po_vendor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only try to link if vendor_id is null and vendor_name is provided
  IF NEW.vendor_id IS NULL AND NEW.vendor_name IS NOT NULL THEN
    SELECT id INTO NEW.vendor_id
    FROM finale_vendors
    WHERE LOWER(TRIM(party_name)) = LOWER(TRIM(NEW.vendor_name))
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to auto-link vendors on finale PO insert/update
DROP TRIGGER IF EXISTS tr_link_finale_po_vendor ON finale_purchase_orders;
CREATE TRIGGER tr_link_finale_po_vendor
  BEFORE INSERT OR UPDATE ON finale_purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION link_finale_po_vendor();

-- Create index for faster vendor name lookups
CREATE INDEX IF NOT EXISTS idx_finale_vendors_name_lower ON finale_vendors (LOWER(TRIM(party_name)));
CREATE INDEX IF NOT EXISTS idx_finale_po_vendor_name_lower ON finale_purchase_orders (LOWER(TRIM(vendor_name)));

-- Log final status
DO $$
DECLARE
  linked_count INTEGER;
  unlinked_count INTEGER;
  unlinked_vendors TEXT;
BEGIN
  SELECT COUNT(*) INTO linked_count FROM finale_purchase_orders WHERE vendor_id IS NOT NULL;
  SELECT COUNT(*) INTO unlinked_count FROM finale_purchase_orders WHERE vendor_id IS NULL AND vendor_name IS NOT NULL;

  RAISE NOTICE 'FINAL - Finale POs with vendor_id linked: %', linked_count;
  RAISE NOTICE 'FINAL - Finale POs still unlinked: %', unlinked_count;

  -- List unlinked vendor names for debugging
  SELECT string_agg(DISTINCT vendor_name, ', ') INTO unlinked_vendors
  FROM finale_purchase_orders
  WHERE vendor_id IS NULL AND vendor_name IS NOT NULL
  LIMIT 10;

  IF unlinked_vendors IS NOT NULL THEN
    RAISE NOTICE 'Sample unlinked vendor names: %', unlinked_vendors;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Also update vendor_engagement_events to reference finale_vendors
-- ════════════════════════════════════════════════════════════════════════════

-- Drop the old FK constraint if it exists (referencing vendors table)
ALTER TABLE vendor_engagement_events
DROP CONSTRAINT IF EXISTS vendor_engagement_events_vendor_id_fkey;

-- Add FK constraint to finale_vendors instead
-- Note: vendor_engagement_events.vendor_id should reference finale_vendors.id
-- for Finale PO engagement tracking
ALTER TABLE vendor_engagement_events
ADD CONSTRAINT vendor_engagement_events_vendor_id_fkey
FOREIGN KEY (vendor_id) REFERENCES finale_vendors(id) ON DELETE CASCADE;
