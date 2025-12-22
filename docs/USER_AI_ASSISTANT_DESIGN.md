# User-Facing AI Assistant Design

## Vision

Non-technical users interact with a **unified AI assistant** that:
- Connects to their email with one click
- Automatically monitors PO communications
- Combines email + inventory + vendor data
- Presents actionable insights in plain language

## User Experience

### 1. Simple Email Connection

```
┌─────────────────────────────────────────────────────┐
│  📧 Connect Your Email                              │
│                                                     │
│  We'll monitor your inbox for:                      │
│  • Shipping confirmations                           │
│  • Tracking numbers                                 │
│  • Vendor responses                                 │
│  • Invoice attachments                              │
│                                                     │
│  ┌─────────────────────────────────────────┐       │
│  │  🔵 Connect with Google                 │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  We only read emails related to your POs.           │
│  Your data stays private and secure.                │
└─────────────────────────────────────────────────────┘
```

User clicks → Google OAuth popup → Done. No technical setup.

### 2. AI Assistant Interface

```
┌─────────────────────────────────────────────────────┐
│  🤖 MuRP Assistant                           [?]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  👤 "What's happening with my open orders?"        │
│                                                     │
│  🤖 I checked your 12 open POs and recent emails:  │
│                                                     │
│  📦 **Shipped Today** (3)                          │
│  • PO-2024-0892 from ABC Supply                    │
│    Tracking: 1Z999AA10123456784                    │
│    ETA: Dec 23                                     │
│                                                     │
│  ⚠️ **Needs Attention** (2)                        │
│  • PO-2024-0856 - Vendor asking about qty change   │
│    → [View Email] [Reply]                          │
│                                                     │
│  ⏳ **Awaiting Response** (4)                       │
│  • Sent 3 days ago, no reply yet                   │
│                                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  💬 Ask me anything...                      [Send]  │
└─────────────────────────────────────────────────────┘
```

### 3. Proactive Notifications

```
┌─────────────────────────────────────────────────────┐
│  🔔 New from MuRP Assistant                         │
│                                                     │
│  📧 New email from ABC Supply about PO-2024-0892   │
│                                                     │
│  "Your order shipped! Tracking: 1Z999AA10123456784 │
│   Expected delivery: Monday, Dec 23"               │
│                                                     │
│  I've updated the PO with this tracking info.      │
│                                                     │
│  [View PO] [Mark as Read] [Ask Follow-up]          │
└─────────────────────────────────────────────────────┘
```

## Technical Implementation

### Email Connection Flow

```typescript
// pages/Settings/EmailConnection.tsx

function EmailConnectionCard() {
  const { isConnected, connect, disconnect } = useEmailConnection();

  return (
    <Card>
      <CardHeader>
        <Mail className="w-6 h-6" />
        <h3>Email Monitoring</h3>
      </CardHeader>

      {isConnected ? (
        <div className="space-y-4">
          <Badge variant="success">Connected</Badge>
          <p className="text-sm text-gray-600">
            Monitoring inbox for PO-related emails
          </p>
          <div className="text-sm">
            <p>Last checked: 2 minutes ago</p>
            <p>Emails processed today: 14</p>
          </div>
          <Button variant="outline" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p>Connect your email to automatically track:</p>
          <ul className="text-sm space-y-1">
            <li>✓ Shipping confirmations</li>
            <li>✓ Tracking numbers</li>
            <li>✓ Vendor responses</li>
          </ul>
          <Button onClick={connect}>
            <GoogleIcon /> Connect with Google
          </Button>
        </div>
      )}
    </Card>
  );
}
```

### OAuth Flow (Behind the Scenes)

```typescript
// services/emailConnectionService.ts

export async function initiateGoogleOAuth(): Promise<string> {
  // 1. Generate OAuth URL with proper scopes
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',  // Read emails
    'https://www.googleapis.com/auth/gmail.labels'     // Manage labels
  ];

  const authUrl = generateGoogleAuthUrl({
    client_id: process.env.VITE_GOOGLE_CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/google/callback`,
    scope: scopes.join(' '),
    access_type: 'offline',  // Get refresh token
    prompt: 'consent'
  });

  return authUrl;
}

export async function completeOAuthFlow(code: string): Promise<void> {
  // 2. Exchange code for tokens (via edge function - never expose secrets)
  const { data } = await supabaseFunctions.invoke('google-oauth-callback', {
    body: { code }
  });

  // 3. Store refresh token in user's inbox config
  await supabase.from('email_inbox_configs').insert({
    user_id: currentUser.id,
    inbox_type: 'gmail',
    gmail_refresh_token: data.refresh_token,  // Encrypted at rest
    oauth_expires_at: data.expires_at,
    is_active: true
  });

  // 4. Start Gmail watch for real-time notifications
  await startGmailWatch(data.access_token);
}
```

### AI Assistant Component

```typescript
// components/AIAssistant/AssistantChat.tsx

function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Pre-built quick actions
  const quickActions = [
    { label: "What's happening with my orders?", icon: Package },
    { label: "Any urgent emails?", icon: AlertTriangle },
    { label: "What should I reorder?", icon: ShoppingCart },
  ];

  const sendMessage = async (content: string) => {
    setIsLoading(true);

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content }]);

    // Call AI with context from multiple sources
    const response = await fetch('/api/assistant', {
      method: 'POST',
      body: JSON.stringify({
        message: content,
        context: {
          includeEmails: true,
          includeOpenPOs: true,
          includeInventory: true
        }
      })
    });

    const data = await response.json();
    setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-gray-500">Hi! I can help you with:</p>
            <div className="grid gap-2">
              {quickActions.map(action => (
                <Button
                  key={action.label}
                  variant="outline"
                  onClick={() => sendMessage(action.label)}
                >
                  <action.icon className="w-4 h-4 mr-2" />
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {isLoading && <TypingIndicator />}
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
            placeholder="Ask me anything..."
          />
          <Button onClick={() => sendMessage(input)}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### Backend: Context Aggregation

```typescript
// supabase/functions/assistant/index.ts

export async function handleAssistantRequest(req: Request) {
  const { message, context } = await req.json();
  const userId = getUserFromAuth(req);

  // Gather context from multiple sources
  const contextData: AssistantContext = {};

  if (context.includeEmails) {
    // Get recent email threads linked to POs
    contextData.emails = await getRecentPOEmails(userId, { limit: 20 });
  }

  if (context.includeOpenPOs) {
    // Get open purchase orders
    contextData.openPOs = await getOpenPurchaseOrders(userId);
  }

  if (context.includeInventory) {
    // Get low stock items
    contextData.lowStock = await getLowStockItems(userId);
  }

  // Build system prompt with context
  const systemPrompt = buildAssistantPrompt(contextData);

  // Call AI
  const response = await generateAIResponse(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
    'assistant',
    getUserTier(userId)
  );

  return new Response(JSON.stringify({ response }));
}

function buildAssistantPrompt(context: AssistantContext): string {
  return `You are a helpful assistant for MuRP inventory management.

## Current Context

### Open Purchase Orders (${context.openPOs?.length || 0})
${context.openPOs?.map(po => `
- ${po.po_number}: ${po.vendor_name}
  Status: ${po.status}
  Items: ${po.items.length}
  Total: $${po.total}
`).join('\n')}

### Recent Email Activity
${context.emails?.map(email => `
- From: ${email.from}
  Subject: ${email.subject}
  Linked to: ${email.po_number || 'Unknown'}
  Key info: ${email.extracted_tracking || email.extracted_eta || 'None'}
`).join('\n')}

### Low Stock Alerts (${context.lowStock?.length || 0})
${context.lowStock?.map(item => `
- ${item.sku}: ${item.name}
  Current: ${item.stock} | Reorder Point: ${item.rop}
`).join('\n')}

## Guidelines
- Speak in plain, friendly language
- Prioritize actionable insights
- When mentioning POs or emails, include links
- If user needs to take action, be specific about what to do
- Format responses with clear sections and bullet points
`;
}
```

### Proactive Notifications

```typescript
// services/proactiveNotificationService.ts

export async function processNewEmail(email: IncomingEmail): Promise<void> {
  // 1. Extract intelligence
  const analysis = await analyzeEmail(email);

  // 2. Correlate to PO
  const poMatch = await correlateToPO(email, analysis);

  // 3. Update PO automatically if high confidence
  if (analysis.trackingNumber && analysis.confidence > 0.9) {
    await updatePOTracking(poMatch.po_id, {
      tracking_number: analysis.trackingNumber,
      carrier: analysis.carrier,
      eta: analysis.eta
    });
  }

  // 4. Generate user notification
  const notification = generateNotification(email, analysis, poMatch);

  // 5. Send via multiple channels
  await sendNotification(poMatch.user_id, notification, {
    inApp: true,
    push: analysis.urgency === 'high',
    email: false  // Don't email about emails :)
  });
}

function generateNotification(email, analysis, poMatch): Notification {
  // Plain language summary
  let title = '';
  let body = '';

  if (analysis.category === 'shipping_confirmation') {
    title = `📦 ${poMatch.vendor_name} shipped your order`;
    body = `Tracking: ${analysis.trackingNumber}\nETA: ${formatDate(analysis.eta)}`;
  } else if (analysis.category === 'question') {
    title = `❓ ${poMatch.vendor_name} has a question`;
    body = `About PO ${poMatch.po_number}: "${truncate(email.subject, 50)}"`;
  } else if (analysis.category === 'delay_notice') {
    title = `⚠️ Delay notice from ${poMatch.vendor_name}`;
    body = `PO ${poMatch.po_number} may be delayed. New ETA: ${analysis.eta || 'Unknown'}`;
  }

  return {
    title,
    body,
    actions: [
      { label: 'View PO', url: `/purchase-orders/${poMatch.po_id}` },
      { label: 'View Email', url: `/emails/${email.id}` }
    ]
  };
}
```

## UI Components Needed

### 1. Email Connection Card
- Settings page component
- Shows connection status
- One-click Google OAuth
- Usage stats

### 2. Assistant Chat Panel
- Floating or sidebar chat
- Quick action buttons
- Message history
- Typing indicator

### 3. Notification Toast
- In-app notifications
- Action buttons
- Dismiss/snooze options

### 4. Email Intelligence Dashboard
- Recent email activity
- Correlation status
- Extraction accuracy

## Security Considerations

1. **OAuth tokens encrypted at rest** in Supabase
2. **Refresh tokens stored server-side only** (edge functions)
3. **Minimal scopes requested** (read-only access)
4. **User can disconnect anytime** with token revocation
5. **PO-related emails only** - keyword filtering before AI processing

## Implementation Priority

### Phase 1: Email Connection
- [ ] Google OAuth flow
- [ ] Settings UI for connection
- [ ] Token storage in `email_inbox_configs`
- [ ] Connection status indicator

### Phase 2: Basic Assistant
- [ ] Chat UI component
- [ ] `/api/assistant` endpoint
- [ ] Context aggregation
- [ ] Quick actions

### Phase 3: Proactive Notifications
- [ ] Email webhook processing
- [ ] Notification service
- [ ] In-app notification UI
- [ ] Auto-update PO tracking

### Phase 4: Advanced Intelligence
- [ ] Learning from corrections
- [ ] Vendor pattern recognition
- [ ] Predictive alerts (delays likely)
