# PO Email Monitoring System

## Overview

Automated system that monitors vendor email responses after POs are sent and intelligently routes them to appropriate agentic workflows for handling.

## Architecture

```
┌──────────────────┐
│   PO Sent        │  User sends PO via email
│   (sent_at set)  │  Triggers agentic monitoring
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│  Gmail Webhook (Real-time)                           │
│  - Receives vendor responses via Gmail push          │
│  - Creates po_vendor_communications record           │
│  - Sets response_category via AI analysis            │
│  - Marks processed_by_monitor = false                │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│  PO Email Monitor (Every 5 minutes)                  │
│  - Scans unprocessed communications                  │
│  - Classifies response type                          │
│  - Routes to appropriate agent                       │
│  - Updates processing status                         │
└────────┬─────────────────────────────────────────────┘
         │
         ├─────────────────────────┬───────────────────┬────────────────────┐
         ▼                         ▼                   ▼                    ▼
┌────────────────┐  ┌──────────────────┐  ┌────────────────┐  ┌────────────────────┐
│ Air Traffic    │  │ Document         │  │ Vendor         │  │ Human Review       │
│ Controller     │  │ Analyzer         │  │ Watchdog       │  │                    │
├────────────────┤  ├──────────────────┤  ├────────────────┤  ├────────────────────┤
│ • Tracking     │  │ • Invoices       │  │ • Backorders   │  │ • Price changes    │
│   updates      │  │ • Packing slips  │  │ • Delays       │  │ • Cancellations    │
│ • Carrier info │  │ • Cost recon     │  │ • Performance  │  │ • Clarifications   │
└────────────────┘  └──────────────────┘  └────────────────┘  └────────────────────┘
```

## Components

### 1. Gmail Webhook (`supabase/functions/gmail-webhook/`)
**Purpose:** Real-time processing of vendor emails

**Workflow:**
1. Receives push notification from Gmail API
2. Fetches email content and attachments
3. Resolves PO via thread ID or subject matching
4. Creates `po_vendor_communications` record
5. Uses AI to analyze content and set `response_category`
6. Marks `processed_by_monitor = false` for routing

**Response Categories Set:**
- `confirmation` - Order confirmed/accepted
- `tracking_provided` - Tracking number provided
- `invoice_attached` - Invoice document
- `packing_slip` - Packing slip document
- `backorder_notice` - Items on backorder
- `delay_notice` - Shipment delayed
- `price_change` - Price adjustment
- `cancellation` - Order cancelled
- `question_raised` - Vendor has questions
- `other` - Unclassified

### 2. PO Email Monitor (`supabase/functions/po-email-monitor/`)
**Purpose:** Scheduled processing and agent routing

**Workflow:**
1. Runs every 5 minutes via pg_cron
2. Queries unprocessed communications (`processed_by_monitor = false`)
3. Queries POs awaiting responses (`sent_at NOT NULL`, status in sent/confirmed/committed)
4. Routes based on `response_category`:
   - **tracking_provided** → Air Traffic Controller
   - **invoice_attached, packing_slip** → Document Analyzer
   - **backorder_notice, delay_notice** → Vendor Watchdog
   - **price_change, cancellation, question_raised** → Human Review
   - **confirmation** → Auto-logged (no agent action)
5. Updates `processed_by_monitor = true`, sets `monitor_handoff_to`
6. Updates `last_monitor_check` on PO

**Database Updates:**
```sql
-- Mark communication as processed
UPDATE po_vendor_communications 
SET processed_by_monitor = true,
    monitor_processed_at = NOW(),
    monitor_handoff_to = 'air_traffic_controller'
WHERE id = ?;

-- Update PO last check
UPDATE purchase_orders 
SET last_monitor_check = NOW()
WHERE id = ?;
```

### 3. Database Schema (`migrations/085_po_email_monitoring.sql`)

**New Fields Added:**

**po_vendor_communications table:**
- `processed_by_monitor` (boolean) - Indicates if monitor has processed this
- `monitor_processed_at` (timestamptz) - When monitor processed
- `monitor_handoff_to` (text) - Which agent it was routed to
- `response_category` (text) - Category for routing logic

**purchase_orders table:**
- `last_monitor_check` (timestamptz) - Last time monitor checked this PO

**Indexes:**
```sql
-- Find unprocessed communications efficiently
CREATE INDEX idx_po_vendor_comms_unprocessed 
ON po_vendor_communications(direction, processed_by_monitor) 
WHERE processed_by_monitor IS NULL OR processed_by_monitor = false;

-- Find POs needing monitoring
CREATE INDEX idx_purchase_orders_monitoring 
ON purchase_orders(sent_at, status) 
WHERE sent_at IS NOT NULL;
```

**pg_cron Schedule:**
```sql
-- Runs every 5 minutes
SELECT cron.schedule(
  'po-email-monitor-scan',
  '*/5 * * * *',
  $$ [invokes edge function] $$
);
```

## Agent Routing Logic

### Air Traffic Controller
**Triggered by:** `tracking_provided`

**Actions:**
- Updates `tracking_number`, `carrier` fields on PO
- Updates PO status to `shipped`
- Creates `po_vendor_communications` entry
- Monitors delivery timeline against inventory needs
- Assesses delivery delays based on inventory health

**Example:**
```typescript
await supabase.from('purchase_orders').update({
  tracking_number: 'UPS123456789',
  carrier: 'UPS',
  status: 'shipped',
  vendor_response_status: 'verified_confirmed'
}).eq('id', poId);
```

### Document Analyzer
**Triggered by:** `invoice_attached`, `packing_slip`

**Actions:**
- Queues document in `ai_vendor_email_cache` for processing
- Sets `processing_status = 'queued_for_analysis'`
- Later: Extracts invoice data, reconciles costs, updates landed costs
- Updates `vendor_response_status = 'verified_confirmed'`

**Example:**
```typescript
await supabase.from('ai_vendor_email_cache').insert({
  po_id: poId,
  email_subject: subject,
  email_body: bodyText,
  attachments_metadata: attachments,
  processing_status: 'queued_for_analysis',
  priority: 'normal'
});
```

### Vendor Watchdog
**Triggered by:** `backorder_notice`, `delay_notice`

**Actions:**
- Creates `vendor_performance_incidents` record
- Sets severity based on impact
- Learns actual lead times vs. estimated
- Updates vendor reliability scores
- Flags patterns of delays/backorders

**Example:**
```typescript
await supabase.from('vendor_performance_incidents').insert({
  vendor_id: vendorId,
  po_id: poId,
  incident_type: 'backorder',
  severity: 'medium',
  description: 'Items backordered: SKU123, SKU456',
  reported_at: new Date().toISOString(),
  metadata: { backorderedItems, estimatedRestockDate }
});
```

### Human Review
**Triggered by:** `price_change`, `cancellation`, `question_raised`

**Actions:**
- Creates `po_alert_log` entry with high priority
- Sets `action_description` for user guidance
- Displays in alerts dashboard
- Blocks automated actions until resolved

**Example:**
```typescript
await supabase.from('po_alert_log').insert({
  po_id: poId,
  alert_type: 'price_change',
  severity: 'high',
  title: 'Vendor Changed Price',
  message: 'Vendor increased price by 15% - requires approval',
  action_description: 'Review price change and approve/reject PO',
  created_at: new Date().toISOString()
});
```

### Auto-Logged (No Agent)
**Triggered by:** `confirmation`

**Actions:**
- Updates `vendor_response_status = 'verified_confirmed'`
- Creates communication log entry
- No further agentic action needed

**Example:**
```typescript
await supabase.from('po_vendor_communications').insert({
  po_id: poId,
  direction: 'inbound',
  communication_type: 'vendor_confirmation',
  body_preview: 'Order confirmed - processing...',
  received_at: new Date().toISOString()
});

await supabase.from('purchase_orders').update({
  vendor_response_status: 'verified_confirmed'
}).eq('id', poId);
```

## Monitoring & Observability

### Edge Function Logs
```bash
# View monitor logs
supabase functions logs po-email-monitor --tail

# View webhook logs
supabase functions logs gmail-webhook --tail
```

### Query Unprocessed Communications
```sql
SELECT 
  pvc.id,
  pvc.po_id,
  po.order_id,
  pvc.response_category,
  pvc.received_at,
  pvc.subject
FROM po_vendor_communications pvc
JOIN purchase_orders po ON po.id = pvc.po_id
WHERE pvc.direction = 'inbound'
  AND (pvc.processed_by_monitor IS NULL OR pvc.processed_by_monitor = false)
ORDER BY pvc.received_at DESC;
```

### Query POs Awaiting Responses
```sql
SELECT 
  id,
  order_id,
  supplier_name,
  sent_at,
  last_monitor_check,
  vendor_response_status,
  status
FROM purchase_orders
WHERE sent_at IS NOT NULL
  AND status IN ('sent', 'confirmed', 'committed')
  AND (vendor_response_status IS NULL OR vendor_response_status = 'pending_response')
ORDER BY sent_at ASC;
```

### Monitor Processing Stats
```sql
-- Count by handoff type
SELECT 
  monitor_handoff_to,
  COUNT(*) as count
FROM po_vendor_communications
WHERE processed_by_monitor = true
GROUP BY monitor_handoff_to
ORDER BY count DESC;

-- Average processing time
SELECT 
  AVG(EXTRACT(EPOCH FROM (monitor_processed_at - received_at))) as avg_seconds
FROM po_vendor_communications
WHERE processed_by_monitor = true
  AND received_at IS NOT NULL
  AND monitor_processed_at IS NOT NULL;
```

## Configuration

### Settings Panel (Planned)
Location: Settings → Purchasing → Email Monitoring

**Fields:**
- **Purchasing Email Account:** Gmail address to monitor
- **Monitoring Frequency:** 5 minutes (default) / 10 minutes / 15 minutes
- **Auto-Routing Enabled:** Yes/No toggle
- **Alert Preferences:** Which categories trigger user alerts

### Environment Variables
Edge functions use these from Supabase secrets:

```bash
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
GMAIL_WEBHOOK_USER=[purchasing-email@domain.com]
```

## Testing

### Manual Test Workflow
1. **Send a PO:**
   ```typescript
   await markFinalePOAsSent(poId);
   // Sets sent_at timestamp
   ```

2. **Simulate vendor response:**
   - Send test email to purchasing account
   - Include keywords: "tracking", "invoice", "backorder", etc.
   - Gmail webhook processes in real-time

3. **Verify classification:**
   ```sql
   SELECT response_category, processed_by_monitor, monitor_handoff_to
   FROM po_vendor_communications
   WHERE po_id = '[po-id]'
   ORDER BY received_at DESC LIMIT 1;
   ```

4. **Check agent handoff:**
   ```sql
   -- Air Traffic Controller
   SELECT tracking_number, carrier FROM purchase_orders WHERE id = '[po-id]';
   
   -- Document Analyzer
   SELECT * FROM ai_vendor_email_cache WHERE po_id = '[po-id]';
   
   -- Vendor Watchdog
   SELECT * FROM vendor_performance_incidents WHERE po_id = '[po-id]';
   
   -- Human Review
   SELECT * FROM po_alert_log WHERE po_id = '[po-id]';
   ```

### Test Categories
```bash
# Tracking update test
Subject: "RE: PO-2025-001 - Shipment Update"
Body: "Your order has shipped via UPS, tracking: 1Z999AA10123456784"
Expected: Air Traffic Controller

# Invoice test
Subject: "Invoice for PO-2025-001"
Body: "Please find attached invoice #INV-5678"
Attachment: invoice.pdf
Expected: Document Analyzer

# Backorder test
Subject: "RE: PO-2025-001 - Partial Backorder"
Body: "Items SKU123, SKU456 are on backorder, ETA 2 weeks"
Expected: Vendor Watchdog

# Price change test
Subject: "RE: PO-2025-001 - Price Adjustment Required"
Body: "Due to market conditions, price increased 15%"
Expected: Human Review
```

## Troubleshooting

### Communications not being processed
**Check:**
1. Is pg_cron running? `SELECT * FROM cron.job;`
2. Are there errors in function logs?
3. Is `processed_by_monitor` actually `false`?

**Fix:**
```sql
-- Manually trigger monitor
SELECT net.http_post(
  url := current_setting('app.supabase_url') || '/functions/v1/po-email-monitor',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || current_setting('app.service_role_key')
  ),
  body := '{}'::jsonb
);
```

### Wrong agent routing
**Check:**
1. What is `response_category` value?
2. Does it match expected keywords?

**Fix:**
```sql
-- Manually update category and reprocess
UPDATE po_vendor_communications 
SET response_category = 'tracking_provided',
    processed_by_monitor = false
WHERE id = '[comm-id]';
```

### POs stuck in "awaiting response"
**Check:**
1. Was `sent_at` timestamp set?
2. Did vendor actually respond?
3. Is communication linked to PO?

**Fix:**
```sql
-- Check if sent_at is set
SELECT id, order_id, sent_at, vendor_response_status 
FROM purchase_orders WHERE id = '[po-id]';

-- Check for communications
SELECT * FROM po_vendor_communications WHERE po_id = '[po-id]';

-- Manually set sent_at
UPDATE purchase_orders SET sent_at = NOW() WHERE id = '[po-id]';
```

## Performance Considerations

### Indexes
All necessary indexes created in migration 085:
- `idx_po_vendor_comms_unprocessed` - Fast unprocessed queries
- `idx_purchase_orders_monitoring` - Fast PO monitoring queries
- `idx_purchase_orders_vendor_response` - Fast response status queries

### Batch Limits
Monitor processes **50 communications per run** to avoid timeouts.
With 5-minute frequency, handles up to **600 emails/hour**.

### Cost Optimization
- Gmail webhook uses AI only for complex content (invoices, ambiguous emails)
- Monitor uses **keyword-based classification** (no AI cost)
- Simple confirmations handled automatically

### Scaling
If volume increases:
1. Reduce frequency to 3 minutes (800/hour capacity)
2. Increase batch limit to 100 per run
3. Add parallel workers for different response types

## Future Enhancements

### Planned Features
- [ ] **Email Reply Generation:** AI drafts responses to vendor questions
- [ ] **Sentiment Analysis:** Detect vendor frustration, prioritize accordingly
- [ ] **Predictive Alerts:** Predict delays based on vendor patterns
- [ ] **Multi-Language Support:** Handle vendor emails in Spanish, Chinese, etc.
- [ ] **Vendor Portal Integration:** Auto-update vendor portals with PO status

### Integration Opportunities
- **Slack/Teams Alerts:** Notify team of critical responses
- **SMS Alerts:** High-priority issues (cancellations, major delays)
- **Calendar Integration:** Auto-schedule delivery dates from tracking
- **Analytics Dashboard:** Email response time by vendor, category trends

---

## Quick Reference

**Trigger Monitoring Manually:**
```bash
curl -X POST https://[project-ref].supabase.co/functions/v1/po-email-monitor \
  -H "Authorization: Bearer [service-role-key]"
```

**Check Cron Job:**
```sql
SELECT * FROM cron.job WHERE jobname = 'po-email-monitor-scan';
```

**Disable Monitoring:**
```sql
SELECT cron.unschedule('po-email-monitor-scan');
```

**Re-enable Monitoring:**
```sql
SELECT cron.schedule(
  'po-email-monitor-scan',
  '*/5 * * * *',
  $$ [function invocation SQL] $$
);
```

**View Recent Handoffs:**
```sql
SELECT 
  pvc.received_at,
  po.order_id,
  pvc.response_category,
  pvc.monitor_handoff_to,
  pvc.subject
FROM po_vendor_communications pvc
JOIN purchase_orders po ON po.id = pvc.po_id
WHERE pvc.processed_by_monitor = true
ORDER BY pvc.monitor_processed_at DESC
LIMIT 20;
```
