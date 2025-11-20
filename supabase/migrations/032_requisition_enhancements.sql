-- 032_requisition_enhancements.sql
-- Extend requisitions table with richer metadata for quick requests/alerts.

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'consumable';

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS need_by_date DATE;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS alert_only BOOLEAN DEFAULT FALSE;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS auto_po BOOLEAN DEFAULT FALSE;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS notify_requester BOOLEAN DEFAULT TRUE;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS context TEXT;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_requisitions_request_type
  ON public.requisitions (request_type);

CREATE INDEX IF NOT EXISTS idx_requisitions_priority
  ON public.requisitions (priority);
