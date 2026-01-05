-- Add dropship vendor flag to vendors table
-- When a vendor is marked as dropship, all their products are excluded from stock intelligence

ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS is_dropship_vendor BOOLEAN DEFAULT false;

COMMENT ON COLUMN vendors.is_dropship_vendor IS 'When true, all products from this vendor are dropshipped and excluded from stock intelligence';

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_vendors_dropship ON vendors(is_dropship_vendor) WHERE is_dropship_vendor = true;
