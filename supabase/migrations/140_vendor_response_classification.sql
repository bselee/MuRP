-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 140: Vendor Response Classification
-- ════════════════════════════════════════════════════════════════════════════
--
-- When vendor responds, classify the response type:
-- 1. confirmation - Order confirmed, no action needed
-- 2. tracking_provided - Shipping/tracking info provided
-- 3. question - Vendor asked us something, ACTION REQUIRED
-- 4. delay_notice - Delay/backorder reported, FLAG
-- 5. acknowledgment - Simple "thank you", no action
-- 6. issue - Problem reported, needs attention
-- 7. unknown - Needs manual review
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ADD RESPONSE CLASSIFICATION COLUMNS
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE email_threads
ADD COLUMN IF NOT EXISTS last_response_type TEXT CHECK (last_response_type IN (
  'confirmation',       -- Order confirmed/acknowledged
  'tracking_provided',  -- Tracking number or shipping info
  'question',           -- Vendor asked us something - ACTION REQUIRED
  'delay_notice',       -- Delay or backorder notice
  'acknowledgment',     -- Simple "thank you" or receipt
  'issue',             -- Problem reported
  'info_request',      -- Vendor needs more info from us
  'price_quote',       -- Price quote or invoice
  'unknown'            -- Needs manual review
)),
ADD COLUMN IF NOT EXISTS response_requires_action BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS response_action_type TEXT,
ADD COLUMN IF NOT EXISTS response_action_due_by TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS response_classified_at TIMESTAMPTZ;

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Classify vendor response based on email content
-- Returns the response type and whether action is required
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION classify_vendor_response(
  p_subject TEXT,
  p_body TEXT,
  p_has_tracking BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  response_type TEXT,
  requires_action BOOLEAN,
  action_type TEXT,
  confidence DECIMAL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_subject TEXT;
  v_body TEXT;
  v_response_type TEXT := 'unknown';
  v_requires_action BOOLEAN := FALSE;
  v_action_type TEXT := NULL;
  v_confidence DECIMAL := 0.5;
BEGIN
  -- Normalize text for comparison
  v_subject := LOWER(COALESCE(p_subject, ''));
  v_body := LOWER(COALESCE(p_body, ''));

  -- Priority 1: TRACKING PROVIDED (highest priority if tracking detected)
  IF p_has_tracking OR
     v_body ~ 'tracking\s*(number|#|:)' OR
     v_body ~ '(ups|fedex|usps|dhl)\s*:\s*\d' OR
     v_body ~ 'shipped\s*(via|with|by)' OR
     v_body ~ 'tracking\s*info' OR
     v_subject ~ 'shipped|tracking' THEN
    v_response_type := 'tracking_provided';
    v_requires_action := FALSE;
    v_confidence := 0.9;

  -- Priority 2: DELAY/BACKORDER NOTICE (important flag)
  ELSIF v_body ~ 'delay|delayed|push(ed)?\s*back|backorder|back\s*order|out\s*of\s*stock' OR
        v_body ~ 'unfortunately|regret|apologize.*delay' OR
        v_body ~ 'eta.*changed|new\s*eta|revised.*date' OR
        v_subject ~ 'delay|backorder|stock' THEN
    v_response_type := 'delay_notice';
    v_requires_action := TRUE;
    v_action_type := 'Review delay impact and adjust planning';
    v_confidence := 0.85;

  -- Priority 3: QUESTION FROM VENDOR (action required)
  ELSIF v_body ~ '\?\s*$' OR  -- Ends with question mark
        v_body ~ 'please\s*(confirm|advise|let\s*(me|us)\s*know)' OR
        v_body ~ 'can\s*you\s*(confirm|provide|send)' OR
        v_body ~ 'do\s*you\s*(want|need|have)' OR
        v_body ~ 'which\s*(one|option|size|color)' OR
        v_body ~ 'what\s*(is|are|would)' OR
        v_body ~ 'need.*from\s*(you|your)' THEN
    v_response_type := 'question';
    v_requires_action := TRUE;
    v_action_type := 'Respond to vendor question';
    v_confidence := 0.8;

  -- Priority 4: INFO REQUEST (vendor needs something from us)
  ELSIF v_body ~ 'need.*(po|purchase\s*order|shipping\s*address|payment)' OR
        v_body ~ 'please\s*(send|provide|attach)' OR
        v_body ~ 'missing.*(info|information|document)' OR
        v_body ~ 'require.*(from\s*you|additional)' THEN
    v_response_type := 'info_request';
    v_requires_action := TRUE;
    v_action_type := 'Provide requested information';
    v_confidence := 0.75;

  -- Priority 5: ISSUE REPORTED
  ELSIF v_body ~ 'problem|issue|error|incorrect|wrong|damage' OR
        v_body ~ 'cannot\s*(fulfill|process|ship)' OR
        v_body ~ 'discontinued|no\s*longer\s*available' THEN
    v_response_type := 'issue';
    v_requires_action := TRUE;
    v_action_type := 'Address reported issue';
    v_confidence := 0.8;

  -- Priority 6: PRICE QUOTE
  ELSIF v_body ~ 'quote|pricing|price\s*list|invoice|total.*\$' OR
        v_subject ~ 'quote|invoice|pricing' THEN
    v_response_type := 'price_quote';
    v_requires_action := TRUE;
    v_action_type := 'Review and approve pricing';
    v_confidence := 0.7;

  -- Priority 7: CONFIRMATION (positive response, no action needed)
  ELSIF v_body ~ 'confirm|confirmed|received\s*your\s*(order|po)' OR
        v_body ~ 'processing|will\s*ship|scheduled' OR
        v_body ~ 'order\s*(is\s*)?(in|being)\s*process' OR
        v_body ~ 'got\s*it|noted|acknowledged' OR
        v_subject ~ 'confirm|received|acknowledged' THEN
    v_response_type := 'confirmation';
    v_requires_action := FALSE;
    v_confidence := 0.85;

  -- Priority 8: SIMPLE ACKNOWLEDGMENT (no action needed)
  ELSIF v_body ~ '^(thank|thanks|thx|ty|received|got\s*it|ok|okay|sounds\s*good)' OR
        LENGTH(v_body) < 100 AND v_body ~ '(thank|thanks|received)' THEN
    v_response_type := 'acknowledgment';
    v_requires_action := FALSE;
    v_confidence := 0.7;

  -- Default: Unknown - needs manual review
  ELSE
    v_response_type := 'unknown';
    v_requires_action := TRUE;
    v_action_type := 'Review and classify manually';
    v_confidence := 0.3;
  END IF;

  RETURN QUERY SELECT v_response_type, v_requires_action, v_action_type, v_confidence;
END;
$$;

COMMENT ON FUNCTION classify_vendor_response IS
'Classifies vendor email response to determine if follow-up action is needed.
Returns response_type, requires_action flag, action_type, and confidence score.';

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-classify responses when vendor replies
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_classify_vendor_response()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_classification RECORD;
  v_latest_message RECORD;
BEGIN
  -- Only process when last_inbound_at changes (new vendor message)
  IF NEW.last_inbound_at IS NOT NULL AND
     (OLD.last_inbound_at IS NULL OR NEW.last_inbound_at != OLD.last_inbound_at) THEN

    -- Get the latest inbound message for classification
    SELECT subject, body_preview, extracted_tracking_number
    INTO v_latest_message
    FROM email_thread_messages
    WHERE thread_id = NEW.id
      AND direction = 'inbound'
    ORDER BY COALESCE(sent_at, received_at) DESC
    LIMIT 1;

    IF v_latest_message IS NOT NULL THEN
      -- Classify the response
      SELECT * INTO v_classification
      FROM classify_vendor_response(
        v_latest_message.subject,
        v_latest_message.body_preview,
        v_latest_message.extracted_tracking_number IS NOT NULL
      );

      -- Update the thread with classification
      NEW.last_response_type := v_classification.response_type;
      NEW.response_requires_action := v_classification.requires_action;
      NEW.response_action_type := v_classification.action_type;
      NEW.response_classified_at := NOW();

      -- Set action due date if action required (24 hours for questions, 48 for others)
      IF v_classification.requires_action THEN
        NEW.response_action_due_by := CASE
          WHEN v_classification.response_type IN ('question', 'info_request')
          THEN NOW() + INTERVAL '24 hours'
          ELSE NOW() + INTERVAL '48 hours'
        END;
      ELSE
        NEW.response_action_due_by := NULL;
      END IF;

      -- Clear follow-up flags if vendor responded (unless action needed)
      IF NOT v_classification.requires_action THEN
        NEW.needs_followup := FALSE;
        NEW.vendor_response_status := 'responded';
      ELSE
        -- Keep tracking but note action needed
        NEW.vendor_response_status := 'responded';
        NEW.needs_followup := TRUE; -- Still needs attention
        NEW.followup_due_at := NEW.response_action_due_by;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_classify_vendor_response ON email_threads;
CREATE TRIGGER tr_classify_vendor_response
  BEFORE UPDATE ON email_threads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_classify_vendor_response();

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW: Responses Requiring Action
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW vendor_responses_needing_action AS
SELECT
  et.id as thread_id,
  et.finale_po_id,
  fpo.order_id as po_number,
  fpo.vendor_name,
  et.subject,
  et.last_response_type,
  et.response_action_type,
  et.response_action_due_by,
  et.last_inbound_at as response_received_at,
  EXTRACT(EPOCH FROM (NOW() - et.last_inbound_at)) / 3600 as hours_since_response,
  CASE
    WHEN et.response_action_due_by < NOW() THEN 'overdue'
    WHEN et.response_action_due_by < NOW() + INTERVAL '4 hours' THEN 'urgent'
    WHEN et.response_action_due_by < NOW() + INTERVAL '24 hours' THEN 'today'
    ELSE 'upcoming'
  END as urgency,
  CASE et.last_response_type
    WHEN 'question' THEN 'high'
    WHEN 'info_request' THEN 'high'
    WHEN 'issue' THEN 'critical'
    WHEN 'delay_notice' THEN 'medium'
    WHEN 'price_quote' THEN 'medium'
    ELSE 'low'
  END as priority
FROM email_threads et
LEFT JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
WHERE et.response_requires_action = TRUE
  AND et.last_response_type IS NOT NULL
  AND (fpo.id IS NULL OR fpo.status NOT IN ('RECEIVED', 'CLOSED', 'CANCELED', 'COMPLETED'))
ORDER BY
  CASE et.last_response_type
    WHEN 'issue' THEN 1
    WHEN 'question' THEN 2
    WHEN 'info_request' THEN 3
    WHEN 'delay_notice' THEN 4
    ELSE 5
  END,
  et.response_action_due_by ASC NULLS LAST;

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Mark response action as completed
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION complete_response_action(
  p_thread_id UUID,
  p_action_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE email_threads
  SET response_requires_action = FALSE,
      response_action_type = COALESCE(p_action_notes, 'Completed: ' || response_action_type),
      needs_followup = FALSE,
      updated_at = NOW()
  WHERE id = p_thread_id;

  RETURN FOUND;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- BACKFILL: Classify existing threads with vendor responses
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_thread RECORD;
  v_message RECORD;
  v_classification RECORD;
  v_classified_count INTEGER := 0;
BEGIN
  -- Process threads that have inbound messages but no classification
  FOR v_thread IN
    SELECT id, last_inbound_at
    FROM email_threads
    WHERE last_inbound_at IS NOT NULL
      AND last_response_type IS NULL
      AND finale_po_id IS NOT NULL
  LOOP
    -- Get latest inbound message
    SELECT subject, body_preview, extracted_tracking_number
    INTO v_message
    FROM email_thread_messages
    WHERE thread_id = v_thread.id
      AND direction = 'inbound'
    ORDER BY COALESCE(sent_at, received_at) DESC
    LIMIT 1;

    IF v_message IS NOT NULL THEN
      -- Classify
      SELECT * INTO v_classification
      FROM classify_vendor_response(
        v_message.subject,
        v_message.body_preview,
        v_message.extracted_tracking_number IS NOT NULL
      );

      -- Update thread
      UPDATE email_threads
      SET last_response_type = v_classification.response_type,
          response_requires_action = v_classification.requires_action,
          response_action_type = v_classification.action_type,
          response_classified_at = NOW(),
          response_action_due_by = CASE
            WHEN v_classification.requires_action THEN NOW() + INTERVAL '24 hours'
            ELSE NULL
          END
      WHERE id = v_thread.id;

      v_classified_count := v_classified_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Classified % existing vendor responses', v_classified_count;
END $$;

-- Log classification stats
DO $$
DECLARE
  v_stats RECORD;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE last_response_type = 'confirmation') as confirmations,
    COUNT(*) FILTER (WHERE last_response_type = 'tracking_provided') as tracking,
    COUNT(*) FILTER (WHERE last_response_type = 'question') as questions,
    COUNT(*) FILTER (WHERE last_response_type = 'delay_notice') as delays,
    COUNT(*) FILTER (WHERE last_response_type = 'acknowledgment') as acks,
    COUNT(*) FILTER (WHERE last_response_type = 'issue') as issues,
    COUNT(*) FILTER (WHERE last_response_type = 'unknown') as unknown,
    COUNT(*) FILTER (WHERE response_requires_action) as requiring_action
  INTO v_stats
  FROM email_threads
  WHERE last_response_type IS NOT NULL;

  RAISE NOTICE 'Response Classification Stats:';
  RAISE NOTICE '  Confirmations: %', v_stats.confirmations;
  RAISE NOTICE '  Tracking provided: %', v_stats.tracking;
  RAISE NOTICE '  Questions (action needed): %', v_stats.questions;
  RAISE NOTICE '  Delay notices: %', v_stats.delays;
  RAISE NOTICE '  Simple acknowledgments: %', v_stats.acks;
  RAISE NOTICE '  Issues: %', v_stats.issues;
  RAISE NOTICE '  Unknown (needs review): %', v_stats.unknown;
  RAISE NOTICE '  Total requiring action: %', v_stats.requiring_action;
END $$;
