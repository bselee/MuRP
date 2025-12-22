# Agent, Skill, and MCP Architecture

## Overview

MuRP uses a **standardized agent/skill/MCP architecture** that works across multiple AI platforms (Claude, ChatGPT, etc.) and can be invoked both from the CLI and within the app.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    CONSUMERS                                 │
│  Claude Code CLI │ ChatGPT │ In-App AI Chat │ Automations   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP PROTOCOL                              │
│  Standard interface for tool/resource access                 │
│  Works with any AI that supports MCP                         │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   MCP SERVERS   │ │   AGENTS        │ │   SKILLS        │
│                 │ │                 │ │                 │
│ compliance-mcp  │ │ Stock Intel     │ │ /deploy         │
│ email-mcp (new) │ │ Email Tracking  │ │ /code-review    │
│ inventory-mcp   │ │ Schema Expert   │ │ /security-review│
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVICES                                  │
│  aiGatewayService │ emailInboxManager │ finaleIngestion     │
│  complianceService │ forecastingService │ etc.              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                │
│  Supabase │ Gmail API │ Finale API │ Google Sheets          │
└─────────────────────────────────────────────────────────────┘
```

## MCP Servers (Interoperable Tools)

MCP (Model Context Protocol) provides **standardized tool access** that works with any AI platform.

### Existing: Compliance MCP Server

Location: `mcp-server/src/index.ts`

**Tools:**
- `search_state_regulations` - Search .gov sites for regulations
- `extract_regulation_from_url` - Parse regulation PDFs/HTML
- `update_regulation_database` - Store extracted regulations
- `check_label_compliance` - Check products against regulations
- `get_regulation_changes` - Monitor regulation updates

### Proposed: Email MCP Server

Would expose email intelligence tools to any AI:

```typescript
// mcp-server/src/email-server.ts
const tools: Tool[] = [
  {
    name: 'get_po_email_threads',
    description: 'Get email threads associated with a purchase order',
    inputSchema: {
      type: 'object',
      properties: {
        po_id: { type: 'string', description: 'Purchase order ID' },
        limit: { type: 'number', default: 10 }
      },
      required: ['po_id']
    }
  },
  {
    name: 'extract_tracking_from_email',
    description: 'Extract tracking numbers, ETAs, and status from email content',
    inputSchema: {
      type: 'object',
      properties: {
        email_content: { type: 'string' },
        sender_domain: { type: 'string' }
      },
      required: ['email_content']
    }
  },
  {
    name: 'correlate_email_to_po',
    description: 'Find which PO an email belongs to',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        sender: { type: 'string' },
        body: { type: 'string' }
      },
      required: ['subject', 'sender']
    }
  }
];
```

### Proposed: Inventory MCP Server

```typescript
// mcp-server/src/inventory-server.ts
const tools: Tool[] = [
  {
    name: 'get_reorder_recommendations',
    description: 'Get items that need reordering based on ROP calculations',
    inputSchema: { ... }
  },
  {
    name: 'calculate_velocity',
    description: 'Calculate sales velocity for SKUs',
    inputSchema: { ... }
  },
  {
    name: 'forecast_demand',
    description: 'Forecast demand for next N days',
    inputSchema: { ... }
  }
];
```

## Claude Code Skills (CLI Automation)

Skills are **Claude Code specific** but follow patterns that could be adapted for other platforms.

### Directory Structure

```
.claude/
├── skills/
│   ├── deploy/
│   │   └── SKILL.md          # Deploy workflow
│   ├── code-review/
│   │   └── SKILL.md          # Code quality review
│   └── security-review/
│       └── SKILL.md          # Security audit
├── agents/
│   ├── stock-intelligence-analyst.md
│   ├── email-tracking-specialist.md
│   └── schema-transformer-expert.md
└── settings.local.json       # Permissions
```

### Skill Format (Official Standard)

```yaml
---
name: skill-name
description: When to use this skill (triggers model to invoke it)
allowed-tools: Tool1, Tool2, Tool3
---

# Skill Name

Instructions in markdown format...
```

## In-App Agent Integration

To use agents **inside the MuRP React app**, we can create an agent orchestration layer.

### Agent Definition Schema

```typescript
// types/agents.ts
interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  mcpTools?: string[];           // MCP tools this agent can use
  systemPrompt: string;
  triggerPatterns: string[];     // Phrases that invoke this agent
}

// Example
const stockIntelAgent: AgentDefinition = {
  id: 'stock-intelligence',
  name: 'Stock Intelligence Analyst',
  description: 'Inventory forecasting and ROP calculations',
  capabilities: ['forecast', 'reorder-recommendations', 'velocity-analysis'],
  mcpTools: ['get_reorder_recommendations', 'calculate_velocity'],
  systemPrompt: `You are an inventory specialist...`,
  triggerPatterns: ['reorder', 'stock level', 'forecast', 'velocity']
};
```

### Agent Orchestrator Service

```typescript
// services/agentOrchestrator.ts
import { generateAIResponse } from './aiGatewayService';
import { mcpClient } from './mcpClient';

interface AgentContext {
  agent: AgentDefinition;
  tools: Map<string, Function>;
  history: Message[];
}

export async function invokeAgent(
  agentId: string,
  userMessage: string,
  context?: Record<string, any>
): Promise<AgentResponse> {
  const agent = getAgentById(agentId);

  // Build tool context from MCP
  const tools = await mcpClient.getTools(agent.mcpTools);

  // Generate response with tools
  const response = await generateAIResponse(
    [...history, { role: 'user', content: userMessage }],
    'agent',
    userTier,
    {
      systemPrompt: agent.systemPrompt,
      tools: tools
    }
  );

  return response;
}
```

### React Hook for Agents

```typescript
// hooks/useAgent.ts
export function useAgent(agentId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const sendMessage = async (content: string) => {
    setIsProcessing(true);
    const response = await invokeAgent(agentId, content, { messages });
    setMessages(prev => [...prev,
      { role: 'user', content },
      { role: 'assistant', content: response.content }
    ]);
    setIsProcessing(false);
    return response;
  };

  return { messages, sendMessage, isProcessing };
}

// Usage in component
function StockIntelChat() {
  const { messages, sendMessage, isProcessing } = useAgent('stock-intelligence');

  return (
    <ChatInterface
      messages={messages}
      onSend={sendMessage}
      loading={isProcessing}
    />
  );
}
```

## Credential Management

### Environment Variables (Secrets)

```bash
# .env.local (never committed)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxx
GMAIL_REFRESH_TOKEN=xxx  # Per-user, stored encrypted in DB
FINALE_API_KEY=xxx
```

### Database-Stored Credentials

For per-user or per-inbox credentials (like email OAuth):

```sql
-- email_inbox_configs table
id                     UUID
user_id                UUID
inbox_name             TEXT
gmail_client_id        TEXT      -- Reference to env var or direct
gmail_refresh_token    TEXT      -- Encrypted, per-user
oauth_expires_at       TIMESTAMP
is_active              BOOLEAN
```

### Credential Flow for Email

1. **Admin Setup**: Configure Gmail OAuth app in Google Cloud Console
2. **User Authorization**: User clicks "Connect Gmail" → OAuth flow
3. **Token Storage**: Refresh token encrypted and stored in `email_inbox_configs`
4. **Token Refresh**: `emailInboxManager.ts` auto-refreshes expired tokens
5. **MCP Access**: Email MCP server uses service account or user tokens

```typescript
// services/gmailCredentialManager.ts
export async function getGmailCredentials(inboxId: string): Promise<OAuth2Credentials> {
  const { data: inbox } = await supabase
    .from('email_inbox_configs')
    .select('gmail_client_id, gmail_refresh_token, oauth_expires_at')
    .eq('id', inboxId)
    .single();

  // Check if token needs refresh
  if (new Date(inbox.oauth_expires_at) < new Date()) {
    return await refreshGmailToken(inbox);
  }

  return decryptCredentials(inbox);
}
```

## Cross-Platform Compatibility

### MCP → OpenAI Function Calling

MCP tools can be converted to OpenAI function format:

```typescript
// utils/mcpToOpenAI.ts
export function convertMCPToOpenAI(mcpTool: MCPTool): OpenAIFunction {
  return {
    name: mcpTool.name,
    description: mcpTool.description,
    parameters: mcpTool.inputSchema
  };
}
```

### MCP → Claude Tools

Already native support via `@modelcontextprotocol/sdk`.

### Agent Definition → Multiple Platforms

```typescript
// Export agent for Claude Code
function exportForClaudeCode(agent: AgentDefinition): string {
  return `---
name: ${agent.id}
description: ${agent.description}
tools: ${agent.mcpTools?.join(', ')}
model: inherit
---

${agent.systemPrompt}
`;
}

// Export agent for OpenAI Assistants
function exportForOpenAI(agent: AgentDefinition): OpenAIAssistant {
  return {
    name: agent.name,
    instructions: agent.systemPrompt,
    tools: agent.mcpTools?.map(t => ({ type: 'function', function: getMCPTool(t) }))
  };
}
```

## Implementation Roadmap

### Phase 1: Consolidate Existing (Now)
- [x] Create `.claude/skills/` with proper SKILL.md format
- [x] Create `.claude/agents/` with domain experts
- [ ] Document existing MCP server tools

### Phase 2: Email MCP Server
- [ ] Create `mcp-server/src/email-server.ts`
- [ ] Expose email intelligence tools via MCP
- [ ] Add credential management for OAuth tokens

### Phase 3: In-App Agent UI
- [ ] Create `AgentOrchestrator` service
- [ ] Create `useAgent` hook
- [ ] Build agent chat component
- [ ] Integrate with existing AI chat

### Phase 4: Inventory MCP Server
- [ ] Create `mcp-server/src/inventory-server.ts`
- [ ] Expose forecasting and ROP tools
- [ ] Connect to Stock Intelligence page

## Related Documentation

- `docs/MCP_SETUP_GUIDE.md` - MCP server configuration
- `docs/AI_GATEWAY_INTEGRATION.md` - AI provider routing
- `.claude/skills/*/SKILL.md` - Individual skill definitions
- `.claude/agents/*.md` - Agent system prompts
