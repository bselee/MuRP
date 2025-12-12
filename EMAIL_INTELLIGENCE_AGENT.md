# Email Intelligence Agent

An autonomous AI agent that monitors vendor email communications to extract purchase order tracking information, analyze tone, draft responses, and parse PDF attachments.

## Features

✅ **Automatic Data Extraction**
- PO numbers from email text and PDFs
- Tracking numbers (FedEx, UPS, USPS)
- ETA dates and delivery promises
- Quantities, prices, and other structured data

✅ **Intelligent Analysis**
- Tone detection (professional, urgent, frustrated, apologetic)
- Sentiment scoring (-1.0 to 1.0)
- Response urgency classification
- Context-aware confidence scoring

✅ **Email Response Drafting**
- Auto-generates professional responses
- Requests missing tracking information
- Acknowledges vendor communications
- Escalates urgent issues to humans

✅ **PDF Attachment Processing**
- Parses packing slips, invoices, PO confirmations
- Extracts text from PDF documents
- Classifies document types
- Links attachments to purchase orders

✅ **Conversation Threading**
- Groups related emails into threads
- Tracks vendor communication history
- Maintains sentiment over time
- Links threads to POs and vendors

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `email_threads` | Groups related email conversations |
| `email_communications` | Individual email messages with AI analysis |
| `email_extracted_data` | Structured data pulled from emails |
| `email_attachments` | PDF files and parsed content |
| `email_drafts` | AI-generated response drafts for approval |
| `email_monitoring_rules` | Rules for what to monitor and how |
| `email_agent_performance` | Daily performance metrics |

### Key Relationships

```
email_threads
  ↓ has many
email_communications
  ↓ has many
  ├── email_extracted_data (PO#, tracking, dates)
  ├── email_attachments (PDFs, parsed text)
  └── email_drafts (AI responses)
```

---

## Setup & Integration

### Step 1: Run the Migration

```bash
# Apply the database schema
psql -f supabase/migrations/091_email_intelligence_agent.sql
```

This creates all tables and configures the agent in `agent_configs`.

### Step 2: Set Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Email provider credentials (choose one or more)
SENDGRID_API_KEY=your_sendgrid_key
SENDGRID_WEBHOOK_PUBLIC_KEY=your_webhook_verification_key

MAILGUN_API_KEY=your_mailgun_key
MAILGUN_DOMAIN=your_domain

GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_secret
GMAIL_REFRESH_TOKEN=your_refresh_token
```

### Step 3: Configure Email Webhook

Your email provider needs to forward incoming emails to your webhook endpoint:

**Webhook URL**: `https://yourdomain.com/api/email-webhook`

---

## Email Provider Integration

### Option 1: SendGrid Inbound Parse

**Best for**: Dedicated email address for vendor communications

1. **Setup Parse Webhook**
   - Go to SendGrid → Settings → Inbound Parse
   - Add your domain (e.g., `vendors.murp.com`)
   - Set destination URL: `https://yourdomain.com/api/email-webhook`
   - Add header: `X-Email-Provider: sendgrid`

2. **Configure MX Records**
   ```
   MX Record: mx.sendgrid.net (Priority 10)
   ```

3. **Create Email Address**
   - `orders@vendors.murp.com` → All vendor PO emails
   - `tracking@vendors.murp.com` → Shipping notifications

**Pros**: Dedicated inbox, reliable, scalable
**Cons**: Requires DNS configuration

---

### Option 2: Mailgun Routes

**Best for**: Multiple email addresses with routing rules

1. **Create Route**
   ```bash
   curl -s --user 'api:YOUR_API_KEY' \
     https://api.mailgun.net/v3/routes \
     -F priority=0 \
     -F description='Forward to MuRP Email Agent' \
     -F expression='match_recipient("orders@yourdomain.com")' \
     -F action='forward("https://yourdomain.com/api/email-webhook")' \
     -F action='store()'
   ```

2. **Add Webhook Header**
   - Add `X-Email-Provider: mailgun` in route configuration

**Pros**: Flexible routing, email storage
**Cons**: Requires Mailgun account

---

### Option 3: Gmail API with Push Notifications

**Best for**: Existing Gmail/Google Workspace account

1. **Enable Gmail API**
   - Go to Google Cloud Console
   - Enable Gmail API
   - Create OAuth 2.0 credentials

2. **Set Up Pub/Sub Topic**
   ```bash
   gcloud pubsub topics create gmail-murp-webhook
   gcloud pubsub subscriptions create gmail-murp-sub \
     --topic=gmail-murp-webhook \
     --push-endpoint=https://yourdomain.com/api/email-webhook
   ```

3. **Watch Gmail Inbox**
   ```javascript
   // Run this once to start watching
   const { google } = require('googleapis');
   const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

   await gmail.users.watch({
     userId: 'me',
     requestBody: {
       topicName: 'projects/YOUR_PROJECT/topics/gmail-murp-webhook',
       labelIds: ['INBOX']
     }
   });
   ```

**Pros**: Works with existing Gmail, free
**Cons**: More complex setup, requires Google Cloud

---

### Option 4: Microsoft 365 / Outlook

**Best for**: Organizations using Microsoft 365

1. **Register App in Azure**
   - Azure Portal → App Registrations
   - Add Microsoft Graph API permissions: `Mail.Read`

2. **Create Subscription**
   ```bash
   POST https://graph.microsoft.com/v1.0/subscriptions
   {
     "changeType": "created",
     "notificationUrl": "https://yourdomain.com/api/email-webhook",
     "resource": "me/mailFolders('Inbox')/messages",
     "expirationDateTime": "2024-12-31T18:23:45.935Z",
     "clientState": "secretClientValue"
   }
   ```

**Pros**: Native Microsoft integration
**Cons**: Requires Azure AD setup

---

### Option 5: IMAP Polling (Fallback)

**Best for**: Any email provider with IMAP access

Create a cron job that polls IMAP:

```javascript
// supabase/functions/email-imap-poller/index.ts
import Imap from 'imap';

const imap = new Imap({
  user: 'orders@yourdomain.com',
  password: process.env.EMAIL_PASSWORD,
  host: 'imap.gmail.com',
  port: 993,
  tls: true
});

imap.once('ready', () => {
  imap.openBox('INBOX', false, (err, box) => {
    // Fetch unread emails
    const fetch = imap.seq.fetch('1:*', {
      bodies: '',
      markSeen: true
    });

    fetch.on('message', async (msg) => {
      // Parse email and send to webhook
      await fetch('/api/email-webhook', {
        method: 'POST',
        body: JSON.stringify(emailData)
      });
    });
  });
});
```

**Schedule**: Every 5-15 minutes via cron

**Pros**: Works with any email provider
**Cons**: Not real-time, requires polling

---

## Usage Examples

### Processing an Email

```typescript
import { processIncomingEmail } from '../services/emailIntelligenceAgent';

const result = await processIncomingEmail({
  messageId: 'msg_12345',
  threadId: 'thread_67890',
  from: { email: 'vendor@supplier.com', name: 'John Vendor' },
  to: [{ email: 'orders@murp.com' }],
  subject: 'PO#1234 - Shipment Update',
  bodyText: 'Your order PO#1234 has shipped via FedEx tracking 123456789012. ETA: 12/15/2024',
  receivedAt: new Date(),
});

console.log(result);
// {
//   success: true,
//   emailId: 'email_uuid',
// }
```

### Reviewing Pending Drafts

```typescript
import { getPendingDrafts, approveDraft } from '../services/emailIntelligenceAgent';

// Get all drafts awaiting approval
const drafts = await getPendingDrafts();

drafts.forEach(draft => {
  console.log(`
    From: ${draft.in_reply_to.from_email}
    Subject: ${draft.subject}
    Priority: ${draft.priority}
    Draft: ${draft.body_text}
    Reason: ${draft.draft_reason}
  `);
});

// Approve a draft
await approveDraft('draft_uuid', 'user_uuid');
```

### Getting Performance Report

```typescript
import { getPerformanceReport } from '../services/emailIntelligenceAgent';

const report = await getPerformanceReport(7); // Last 7 days

console.log(`
  Emails Processed: ${report.totalEmailsProcessed}
  Data Points Extracted: ${report.totalDataExtracted}
  Extraction Accuracy: ${report.extractionAccuracy}%
  Draft Approval Rate: ${report.draftApprovalRate}%
`);
```

---

## Data Extraction Examples

### PO Number Extraction

**Input Email**:
```
Subject: Order Confirmation - PO#12345

Thank you for your order PO#12345. We have received your
purchase order and will ship within 3 business days.
```

**Extracted Data**:
```json
{
  "type": "po_number",
  "value": "PO#12345",
  "normalizedValue": "PO#12345",
  "context": "...Order Confirmation - PO#12345. We have received...",
  "confidence": 0.95
}
```

### Tracking Number Extraction

**Input Email**:
```
Your shipment has been picked up by FedEx.
Tracking: 123456789012
Expected delivery: December 15, 2024
```

**Extracted Data**:
```json
[
  {
    "type": "tracking_number",
    "value": "123456789012",
    "normalizedValue": "123456789012",
    "context": "...picked up by FedEx. Tracking: 123456789012...",
    "confidence": 0.80
  },
  {
    "type": "eta_date",
    "value": "December 15, 2024",
    "normalizedValue": "2024-12-15",
    "context": "...Expected delivery: December 15, 2024",
    "confidence": 0.75
  }
]
```

---

## Tone & Sentiment Analysis

### Example 1: Apologetic Delay

**Email**: "We apologize for the delay in shipping your order PO#1234. Due to unforeseen circumstances, we expect to ship by Friday."

**Analysis**:
```json
{
  "tone": "apologetic",
  "sentiment": -0.3,
  "requiresResponse": false,
  "urgency": "medium",
  "suggestedAction": "acknowledge_delay"
}
```

### Example 2: Urgent Request

**Email**: "URGENT: We need confirmation on PO#5678 ASAP. Our production line is waiting."

**Analysis**:
```json
{
  "tone": "urgent",
  "sentiment": -0.1,
  "requiresResponse": true,
  "urgency": "critical",
  "suggestedAction": "escalate_to_human"
}
```

### Example 3: Positive Confirmation

**Email**: "Great news! Your order PO#9999 has shipped and will arrive ahead of schedule."

**Analysis**:
```json
{
  "tone": "positive",
  "sentiment": 0.7,
  "requiresResponse": false,
  "urgency": "low",
  "suggestedAction": "acknowledge_receipt"
}
```

---

## Email Response Drafting

### Scenario 1: Missing Tracking

**Incoming Email**:
```
Subject: PO#1234 Shipped
We've shipped your order PO#1234 today.
```

**AI-Drafted Response**:
```
Subject: Re: PO#1234 Shipped

Thank you for your email regarding PO#1234.

Could you please provide the tracking number(s) for this shipment?
This will help us ensure timely receipt and inventory planning.

Best regards
```

**Status**: `pending` (awaits human approval)

### Scenario 2: Tracking Received

**Incoming Email**:
```
Subject: Tracking for PO#5678
FedEx Tracking: 987654321098
```

**AI-Drafted Response**:
```
Subject: Re: Tracking for PO#5678

Thank you for providing the tracking information.

We have updated our system with tracking number: 987654321098.

We'll monitor the shipment and reach out if any issues arise.

Best regards
```

---

## PDF Attachment Processing

### Supported Document Types

- **Packing Slips**: Extract item quantities, PO numbers
- **Invoices**: Extract totals, line items, payment terms
- **PO Confirmations**: Extract confirmed quantities, dates
- **Tracking Labels**: Extract carrier, tracking number
- **Quotes**: Extract pricing, lead times

### Integration (Requires PDF Library)

```typescript
// Install pdf-parse
npm install pdf-parse

// Update parsePDFAttachment in emailIntelligenceAgent.ts
import pdf from 'pdf-parse';

async function parsePDFAttachment(attachmentId, attachment) {
  const buffer = Buffer.from(attachment.content, 'base64');
  const data = await pdf(buffer);

  // Extract structured data from PDF text
  const extractedData = await extractStructuredData(data.text, '');

  await supabase
    .from('email_attachments')
    .update({
      parsed_text: data.text,
      is_parsed: true,
      parsed_at: new Date(),
    })
    .eq('id', attachmentId);

  // Store extracted data
  for (const item of extractedData) {
    await storeExtractedData(emailId, item);
  }
}
```

---

## Monitoring Rules

Create custom rules for specific vendors or scenarios:

```sql
INSERT INTO email_monitoring_rules (
  rule_name,
  description,
  sender_patterns,
  subject_keywords,
  auto_extract_data,
  auto_draft_response,
  notify_users
) VALUES (
  'Critical Vendor - Acme Corp',
  'High-priority monitoring for Acme shipments',
  ARRAY['%@acmecorp.com'],
  ARRAY['urgent', 'delay', 'backorder'],
  true,
  false, -- Don't auto-draft for this vendor
  ARRAY['user_uuid_1', 'user_uuid_2']
);
```

---

## Agent Configuration

The agent is configured in `agent_configs`:

```sql
SELECT * FROM agent_configs WHERE agent_identifier = 'email_intelligence';
```

### Key Parameters

```json
{
  "auto_parse_pdfs": true,
  "auto_extract_tracking": true,
  "auto_link_pos": true,
  "draft_responses": true,
  "sentiment_analysis": true,
  "max_drafts_per_day": 50,
  "response_delay_hours": 2,
  "monitored_domains": ["vendors", "suppliers", "shipping"]
}
```

### Autonomy Level

**Default**: `assist` (human approval required for sending emails)

**To increase autonomy** (after trust is established):
```sql
UPDATE agent_configs
SET autonomy_level = 'autonomous',
    trust_score = 0.85
WHERE agent_identifier = 'email_intelligence';
```

---

## Performance Metrics

### Daily Tracking

The agent records performance in `email_agent_performance`:

- **Volume**: Emails processed, attachments parsed
- **Accuracy**: Data extractions verified vs. corrected
- **Response**: Draft approval rate, response time
- **Detection**: PO numbers, tracking numbers, dates found

### View Performance Dashboard

```sql
SELECT
  period_date,
  emails_processed,
  data_points_extracted,
  extraction_accuracy_rate,
  draft_approval_rate
FROM email_agent_performance
ORDER BY period_date DESC
LIMIT 7;
```

---

## UI Integration

### Display Pending Drafts

```tsx
import { getPendingDrafts, approveDraft, rejectDraft } from '../services/emailIntelligenceAgent';

export default function EmailDraftsPage() {
  const [drafts, setDrafts] = useState([]);

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    const pending = await getPendingDrafts();
    setDrafts(pending);
  }

  async function handleApprove(draftId) {
    await approveDraft(draftId, userId);
    // TODO: Actually send the email via your email provider
    loadDrafts();
  }

  return (
    <div>
      {drafts.map(draft => (
        <DraftCard
          key={draft.id}
          draft={draft}
          onApprove={() => handleApprove(draft.id)}
          onReject={() => handleReject(draft.id)}
        />
      ))}
    </div>
  );
}
```

### Add to Agent Command Center

The agent will automatically appear in `AgentCommandCenter.tsx` once the database migration runs.

---

## Security Considerations

### 1. Webhook Signature Verification

Always verify webhooks are from your email provider:

```typescript
import crypto from 'crypto';

function verifySendGridSignature(signature, timestamp, payload, publicKey) {
  const data = timestamp + payload;
  const expectedSignature = crypto
    .createVerify('RSA-SHA256')
    .update(data)
    .verify(publicKey, signature, 'base64');
  return expectedSignature;
}
```

### 2. Rate Limiting

Prevent abuse by rate-limiting the webhook:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
});

export default limiter(handler);
```

### 3. Data Privacy

- Email content contains sensitive business information
- Enable RLS (Row Level Security) on all tables ✅ (already configured)
- Only store necessary data
- Consider encryption for email bodies

---

## Troubleshooting

### Issue: Emails not being processed

**Check**:
1. Webhook URL is correct and accessible
2. Email provider is sending to the webhook
3. Check logs: `supabase functions logs email-webhook`
4. Verify environment variables are set

### Issue: Low extraction accuracy

**Solutions**:
- Review `email_extracted_data` for patterns in missed extractions
- Add custom regex patterns to `extractStructuredData()`
- Adjust confidence thresholds
- Manually verify and train on edge cases

### Issue: Too many drafts

**Solutions**:
- Increase `response_delay_hours` parameter
- Set `draft_responses: false` for certain vendors
- Add monitoring rules to filter routine confirmations

---

## Cost Estimate

### Email Volume: 100 emails/day

- Database storage: ~1GB/year = $0.02/month
- Supabase API calls: Minimal (within free tier)
- AI processing (if using Claude for analysis): $5-10/month

### Total: ~$5-10/month

**ROI**:
- Saves 30-60 minutes/day of manual email processing
- Prevents missed tracking updates
- Faster response times = better vendor relationships

---

## Future Enhancements

### Phase 1 (Current)
- ✅ Data extraction (PO, tracking, dates)
- ✅ Tone analysis
- ✅ Draft responses
- ⏳ PDF parsing (requires library)

### Phase 2 (Planned)
- 🔜 Link extracted tracking to `purchase_orders` table
- 🔜 Auto-update PO status when tracking received
- 🔜 Integration with shipping carrier APIs for real-time tracking
- 🔜 Vendor performance scoring based on email responsiveness

### Phase 3 (Future)
- 🔮 Natural language queries ("What did Acme say about PO#1234?")
- 🔮 Automatic vendor onboarding from email introductions
- 🔮 Smart email templates that adapt to vendor communication style
- 🔮 Multi-language support for international vendors

---

## Support

For questions or issues:
1. Check logs in Supabase dashboard
2. Review `email_agent_performance` metrics
3. Examine individual emails in `email_communications` table
4. Contact development team

---

**Last Updated**: 2025-12-12
**Version**: 1.0
**Status**: Production Ready (requires email provider setup)
