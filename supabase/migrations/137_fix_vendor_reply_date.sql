-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 137: Fix Vendor Reply Date to Use Actual Send Time
-- ════════════════════════════════════════════════════════════════════════════
--
-- Problem: last_inbound_at was using received_at (when we processed the email)
-- instead of sent_at (when vendor actually sent it)
--
-- User requirement: "vendor reply notes on PO need to be the actual reply date"
-- ════════════════════════════════════════════════════════════════════════════

-- Fix the trigger to use sent_at first for inbound messages
CREATE OR REPLACE FUNCTION update_email_thread_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update parent thread stats when a message is added
    UPDATE email_threads SET
        message_count = message_count + 1,
        inbound_count = inbound_count + CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END,
        outbound_count = outbound_count + CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
        last_message_at = COALESCE(NEW.sent_at, NEW.received_at, now()),
        -- FIXED: Use sent_at FIRST for inbound (vendor's actual send time)
        last_inbound_at = CASE
            WHEN NEW.direction = 'inbound'
            THEN COALESCE(NEW.sent_at, NEW.received_at, now())  -- sent_at first!
            ELSE last_inbound_at
        END,
        last_outbound_at = CASE
            WHEN NEW.direction = 'outbound'
            THEN COALESCE(NEW.sent_at, now())
            ELSE last_outbound_at
        END,
        first_message_at = COALESCE(
            first_message_at,
            NEW.sent_at,
            NEW.received_at,
            now()
        ),
        -- Update tracking info if found in this message
        has_tracking_info = has_tracking_info OR (
            NEW.extracted_tracking_number IS NOT NULL
        ),
        tracking_numbers = CASE
            WHEN NEW.extracted_tracking_number IS NOT NULL
            THEN array_append(
                COALESCE(tracking_numbers, ARRAY[]::TEXT[]),
                NEW.extracted_tracking_number
            )
            ELSE tracking_numbers
        END,
        carriers = CASE
            WHEN NEW.extracted_carrier IS NOT NULL
            THEN array_append(
                COALESCE(carriers, ARRAY[]::TEXT[]),
                NEW.extracted_carrier
            )
            ELSE carriers
        END,
        -- Update ETA if found
        latest_eta = COALESCE(NEW.extracted_eta, latest_eta),
        -- Sentiment tracking
        sentiment = CASE
            WHEN NEW.sentiment_score IS NOT NULL THEN
                CASE
                    WHEN NEW.sentiment_score > 0.3 THEN 'positive'
                    WHEN NEW.sentiment_score < -0.3 THEN 'negative'
                    ELSE 'neutral'
                END
            ELSE sentiment
        END,
        sentiment_score = COALESCE(NEW.sentiment_score, sentiment_score),
        -- Update flags
        is_delay_notice = is_delay_notice OR (
            LOWER(NEW.subject) LIKE '%delay%' OR
            LOWER(NEW.body_preview) LIKE '%delayed%' OR
            LOWER(NEW.body_preview) LIKE '%pushed back%'
        ),
        is_backorder_notice = is_backorder_notice OR (
            LOWER(NEW.subject) LIKE '%backorder%' OR
            LOWER(NEW.body_preview) LIKE '%back order%' OR
            LOWER(NEW.body_preview) LIKE '%out of stock%'
        ),
        -- Check if response is required (vendor asked a question)
        requires_response = requires_response OR (
            NEW.direction = 'inbound' AND (
                NEW.body_preview LIKE '%?%' OR
                LOWER(NEW.body_preview) LIKE '%please confirm%' OR
                LOWER(NEW.body_preview) LIKE '%let us know%' OR
                LOWER(NEW.body_preview) LIKE '%please advise%'
            )
        ),
        updated_at = now()
    WHERE id = NEW.thread_id;

    RETURN NEW;
END;
$$;

-- Backfill: Update existing threads to use sent_at from their messages
-- Using explicit column list to avoid generated column issues
WITH actual_dates AS (
    SELECT
        thread_id,
        MAX(CASE WHEN direction = 'inbound' THEN COALESCE(sent_at, received_at) END) as actual_last_inbound
    FROM email_thread_messages
    GROUP BY thread_id
)
UPDATE email_threads
SET last_inbound_at = ad.actual_last_inbound
FROM actual_dates ad
WHERE email_threads.id = ad.thread_id
  AND ad.actual_last_inbound IS NOT NULL
  AND (email_threads.last_inbound_at IS NULL OR email_threads.last_inbound_at != ad.actual_last_inbound);

-- Log how many threads exist with inbound messages
DO $$
DECLARE
  thread_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO thread_count
  FROM email_threads
  WHERE last_inbound_at IS NOT NULL;

  RAISE NOTICE 'Email threads with last_inbound_at set: %', thread_count;
END $$;
