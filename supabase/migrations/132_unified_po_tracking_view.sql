-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 132: Unified PO Tracking View with Email Intelligence
-- ════════════════════════════════════════════════════════════════════════════
-- 
-- Creates a unified tracking view that combines:
-- 1. Internal purchase_orders tracking data
-- 2. Finale purchase_orders tracking data  
-- 3. Email thread intelligence (vendor responses, confirmations)
-- 4. AI-extracted tracking from email communications
--
-- This enables the POTrackingDashboard to show ALL tracked POs with 
-- intelligent status derived from email analysis.
-- ════════════════════════════════════════════════════════════════════════════

-- Drop old view first
DROP VIEW IF EXISTS po_tracking_overview CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- UNIFIED TRACKING VIEW
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW po_tracking_overview AS
-- Internal POs with tracking
SELECT
  po.id,
  po.order_id,
  COALESCE(v.name, 'Unknown') as vendor_name,
  po.tracking_number,
  po.tracking_carrier,
  po.tracking_status::text,
  po.tracking_estimated_delivery::text,
  po.tracking_last_checked_at,
  po.tracking_last_exception,
  (SELECT e.created_at FROM po_tracking_events e WHERE e.po_id = po.id ORDER BY e.created_at DESC LIMIT 1) AS last_event_at,
  'internal' as source,
  -- Email thread intelligence
  et.id as email_thread_id,
  et.thread_summary as email_summary,
  et.sentiment as email_sentiment,
  et.latest_tracking_status as email_derived_status,
  et.latest_eta as email_derived_eta,
  et.requires_response as awaiting_response,
  et.has_tracking_info as has_email_tracking,
  et.message_count as email_count,
  et.last_inbound_at as last_vendor_reply,
  et.last_outbound_at as last_sent_email
FROM purchase_orders po
LEFT JOIN vendors v ON v.id = po.vendor_id
LEFT JOIN email_threads et ON et.po_id = po.id
WHERE po.tracking_number IS NOT NULL
   OR et.id IS NOT NULL  -- Include POs with email threads even without tracking

UNION ALL

-- Finale POs with tracking
SELECT
  fpo.id,
  fpo.order_id,
  COALESCE(fpo.vendor_name, 'Unknown') as vendor_name,
  fpo.tracking_number,
  fpo.tracking_carrier,
  fpo.tracking_status::text,
  fpo.tracking_estimated_delivery::text,
  fpo.tracking_last_checked_at,
  fpo.tracking_last_exception,
  (SELECT e.created_at FROM finale_po_tracking_events e WHERE e.finale_po_id = fpo.id ORDER BY e.created_at DESC LIMIT 1) AS last_event_at,
  'finale' as source,
  -- Email thread intelligence (match by order_id pattern)
  et.id as email_thread_id,
  et.thread_summary as email_summary,
  et.sentiment as email_sentiment,
  et.latest_tracking_status as email_derived_status,
  et.latest_eta as email_derived_eta,
  et.requires_response as awaiting_response,
  et.has_tracking_info as has_email_tracking,
  et.message_count as email_count,
  et.last_inbound_at as last_vendor_reply,
  et.last_outbound_at as last_sent_email
FROM finale_purchase_orders fpo
LEFT JOIN email_threads et ON (
  et.subject ILIKE '%' || fpo.order_id || '%'
  OR et.correlation_details->>'matched_po_number' = fpo.order_id
)
WHERE fpo.is_active = true
  AND (
    fpo.tracking_number IS NOT NULL 
    OR fpo.tracking_status IS NOT NULL
    OR et.id IS NOT NULL  -- Include POs with email communication
  )
  AND fpo.order_id NOT ILIKE '%DropshipPO%';

COMMENT ON VIEW po_tracking_overview IS 
'Unified tracking view combining internal POs, Finale POs, and email thread intelligence for comprehensive PO status tracking.';

-- ════════════════════════════════════════════════════════════════════════════
-- EMAIL-DERIVED STATUS FUNCTION
-- ════════════════════════════════════════════════════════════════════════════
-- 
-- Analyzes email threads to derive PO status when carrier tracking isn't available.
-- Uses AI-extracted data from vendor responses.

CREATE OR REPLACE FUNCTION derive_po_status_from_emails(p_po_id UUID)
RETURNS TABLE (
  derived_status TEXT,
  confidence NUMERIC,
  source_email_id UUID,
  reasoning TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH email_signals AS (
    SELECT
      et.id as thread_id,
      et.latest_tracking_status,
      et.sentiment,
      et.has_tracking_info,
      et.latest_eta,
      et.last_inbound_at,
      -- Count confirmations
      (SELECT COUNT(*) FROM email_thread_messages etm 
       WHERE etm.thread_id = et.gmail_thread_id 
       AND etm.direction = 'inbound'
       AND (etm.body_text ILIKE '%confirm%' OR etm.body_text ILIKE '%shipped%' OR etm.body_text ILIKE '%tracking%')
      ) as confirmation_count,
      -- Count delays
      (SELECT COUNT(*) FROM email_thread_messages etm 
       WHERE etm.thread_id = et.gmail_thread_id 
       AND etm.direction = 'inbound'
       AND (etm.body_text ILIKE '%delay%' OR etm.body_text ILIKE '%backorder%' OR etm.body_text ILIKE '%out of stock%')
      ) as delay_count
    FROM email_threads et
    WHERE et.po_id = p_po_id
    ORDER BY et.last_message_at DESC
    LIMIT 1
  )
  SELECT
    CASE
      WHEN es.latest_tracking_status IS NOT NULL THEN es.latest_tracking_status
      WHEN es.has_tracking_info THEN 'shipped'
      WHEN es.confirmation_count > 0 AND es.delay_count = 0 THEN 'confirmed'
      WHEN es.delay_count > 0 THEN 'exception'
      WHEN es.last_inbound_at IS NOT NULL THEN 'confirmed'
      ELSE 'awaiting_confirmation'
    END as derived_status,
    CASE
      WHEN es.latest_tracking_status IS NOT NULL THEN 0.95
      WHEN es.has_tracking_info THEN 0.85
      WHEN es.confirmation_count > 0 THEN 0.75
      WHEN es.delay_count > 0 THEN 0.80
      WHEN es.last_inbound_at IS NOT NULL THEN 0.60
      ELSE 0.30
    END as confidence,
    es.thread_id as source_email_id,
    CASE
      WHEN es.latest_tracking_status IS NOT NULL THEN 'Tracking status extracted from email'
      WHEN es.has_tracking_info THEN 'Tracking number found in email'
      WHEN es.confirmation_count > 0 THEN 'Vendor confirmed order in email'
      WHEN es.delay_count > 0 THEN 'Vendor mentioned delay/backorder'
      WHEN es.last_inbound_at IS NOT NULL THEN 'Vendor replied to PO email'
      ELSE 'No vendor response received'
    END as reasoning
  FROM email_signals es;
END;
$$;

COMMENT ON FUNCTION derive_po_status_from_emails IS 
'Analyzes email communications to derive PO status when carrier tracking is unavailable. Returns confidence-weighted status based on vendor email responses.';

-- ════════════════════════════════════════════════════════════════════════════
-- AUTO-UPDATE TRACKING FROM EMAIL
-- ════════════════════════════════════════════════════════════════════════════
-- 
-- Trigger function that automatically updates Finale PO tracking when email
-- thread data is updated by the Email Intelligence Agent.

CREATE OR REPLACE FUNCTION sync_email_tracking_to_finale_po()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_finale_po_id UUID;
  v_matched_order_id TEXT;
BEGIN
  -- Only process if tracking info was extracted
  IF NEW.has_tracking_info IS TRUE AND NEW.tracking_numbers IS NOT NULL AND array_length(NEW.tracking_numbers, 1) > 0 THEN
    
    -- Try to find matching Finale PO from correlation
    v_matched_order_id := NEW.correlation_details->>'matched_po_number';
    
    IF v_matched_order_id IS NOT NULL THEN
      SELECT id INTO v_finale_po_id
      FROM finale_purchase_orders
      WHERE order_id = v_matched_order_id
      LIMIT 1;
      
      IF v_finale_po_id IS NOT NULL THEN
        -- Update Finale PO with extracted tracking
        UPDATE finale_purchase_orders
        SET
          tracking_number = COALESCE(NEW.tracking_numbers[1], tracking_number),
          tracking_carrier = COALESCE(NEW.carriers[1], tracking_carrier),
          tracking_status = CASE
            WHEN tracking_status = 'awaiting_confirmation' OR tracking_status IS NULL
            THEN 'shipped'::po_tracking_status
            ELSE tracking_status
          END,
          tracking_estimated_delivery = COALESCE(NEW.latest_eta::date, tracking_estimated_delivery),
          tracking_source = 'email',
          tracking_last_checked_at = NOW(),
          updated_at = NOW()
        WHERE id = v_finale_po_id;
        
        -- Log the event
        INSERT INTO finale_po_tracking_events (
          finale_po_id,
          tracking_number,
          carrier,
          status,
          description,
          source
        ) VALUES (
          v_finale_po_id,
          NEW.tracking_numbers[1],
          NEW.carriers[1],
          'shipped',
          'Tracking extracted by Email Intelligence Agent from thread: ' || COALESCE(NEW.subject, 'Unknown'),
          'email_agent'
        );
        
        RAISE NOTICE 'Synced email tracking to Finale PO %: %', v_matched_order_id, NEW.tracking_numbers[1];
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS tr_sync_email_tracking_to_finale ON email_threads;
CREATE TRIGGER tr_sync_email_tracking_to_finale
  AFTER INSERT OR UPDATE OF has_tracking_info, tracking_numbers, carriers, latest_eta
  ON email_threads
  FOR EACH ROW
  WHEN (NEW.has_tracking_info IS TRUE)
  EXECUTE FUNCTION sync_email_tracking_to_finale_po();

-- ════════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT ON po_tracking_overview TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION derive_po_status_from_emails TO authenticated, service_role;
