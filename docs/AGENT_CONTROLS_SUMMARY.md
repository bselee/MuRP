# Agent Command Center - Interactive Controls

## Overview
Enhanced the Agent Command Center dashboard widget with individual agent controls, allowing users to run, configure, and view output for each of the 7 autonomous agents independently.

## Features Added

### 1. Individual Agent Run Controls
- **Run Button**: Each agent now has its own "▶ Run" button
- **Independent Execution**: Test individual agents without running full analysis
- **Real-time Status**: Visual indicators (running/success/alert/idle) with animations
- **Success Confirmation**: Green checkmark icon appears when agent completes successfully

### 2. Expandable Output Display
- **Accordion-style Output**: Click chevron icon to expand/collapse agent results
- **Color-coded Results**: 
  - ✓ Green: Success messages
  - ⚠🟡 Yellow: Warnings and medium-priority alerts
  - 🔴❌ Red: Critical alerts and errors
  - 💰 Blue: Financial/invoice-related findings
- **Monospace Font**: Easy-to-read output format for technical details
- **Scrollable Sections**: Long outputs don't clutter the interface

### 3. Configuration Modal
- **Per-agent Settings**: Cog icon opens configuration dialog for each agent
- **Dynamic Form Fields**: Auto-generated inputs based on agent parameters
- **Type-aware Inputs**: Number fields with appropriate step values (0.1 for decimals, 1 for integers)
- **Parameter Labels**: Human-readable names from snake_case config keys
- **Save/Cancel Actions**: Persistent configuration changes (TODO: implement save logic)

### 4. Agent-specific Implementations

#### Vendor Watchdog
- **Live Data**: Calls `getFlaggedVendors()` service
- **Output**: Vendor name, issue description, performance metrics
- **Config**: `threshold_days: 30`, `min_orders: 3`

#### PO Intelligence
- **Live Data**: Calls `getPesterAlerts()` and `getInvoiceVariances()` services
- **Output**: PO numbers, vendor names, variance amounts, reasons for attention
- **Config**: `pester_days: 7`, `invoice_variance: 5`

#### Stockout Prevention
- **Live Data**: Calls `getCriticalStockoutAlerts()` service
- **Output**: Product names, severity levels (CRITICAL/HIGH), stock status messages
- **Config**: `safety_buffer: 1.5`, `forecast_days: 30`

#### Other Agents (Mock Data Ready)
- Inventory Guardian: `reorder_threshold: 0.2`, `check_interval: 3600`
- Price Hunter: `variance_threshold: 10`, `compare_window: 90`
- Air Traffic Controller: `critical_threshold: 3`, `priority_weight: 0.7`
- Trust Score: `target_accuracy: 0.95`, `review_period: 7`

## Technical Implementation

### State Management
```typescript
interface AgentStatus {
  id: string;
  name: string;
  icon: React.ComponentType;
  color: string;
  status: 'idle' | 'running' | 'alert' | 'success';
  message: string;
  lastRun: Date;
  output?: string[];        // NEW: Agent execution results
  config?: Record<string, any>;  // NEW: Configuration parameters
}

const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
const [configModalOpen, setConfigModalOpen] = useState(false);
const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);
```

### Execution Flow
1. User clicks "▶ Run" on an agent
2. Agent status changes to 'running' with animated pulse
3. Service function called based on agent ID
4. Results formatted and added to `output` array
5. Status updates to 'success' or 'alert' based on findings
6. Output appears in expandable section
7. Last run timestamp updated

### UI Components
- **Run Button**: Blue text, hover effect, disabled during execution
- **Config Button**: Gray gear icon, hover effect
- **Expand/Collapse**: Chevron icons (down when expanded, right when collapsed)
- **Output Section**: Dark background, border separator, color-coded text
- **Configuration Modal**: Standard Modal component with dynamic form fields

## Usage Example

```typescript
// To run an individual agent:
const runSingleAgent = async (agentId: string) => {
  // Set running state
  setAgents(prev => prev.map(a => 
    a.id === agentId ? { ...a, status: 'running', output: [] } : a
  ));
  
  // Execute agent logic
  const output = await executorAgentLogic(agentId);
  
  // Update with results
  setAgents(prev => prev.map(a =>
    a.id === agentId ? { ...a, status: 'success', output, lastRun: new Date() } : a
  ));
};
```

## Files Modified
- `components/AgentCommandWidget.tsx`: +253 lines, -25 lines
  - Added individual run function
  - Enhanced UI with control buttons
  - Added expandable output sections
  - Implemented configuration modal

## Dependencies
- Existing agent services: `vendorWatchdogAgent.ts`, `poIntelligenceAgent.ts`, `stockoutPreventionAgent.ts`
- UI components: `Modal.tsx`, `Button.tsx`, `Card.tsx`
- Icons: `CogIcon`, `ChevronDownIcon`, `ChevronRightIcon`, `CheckCircleIcon`

## Next Steps
1. Implement configuration persistence (save to localStorage or database)
2. Add agent scheduling (auto-run on intervals)
3. Add output export (download as JSON/CSV)
4. Add agent history/logs (view past executions)
5. Wire up remaining 4 agents with live data

## Testing
- Build: ✅ Success (8.68s, 2,957.53 kB)
- TypeScript: ✅ No errors
- Git: ✅ Committed (b42cf0b) and pushed to main

## User Benefits
- **Individual Testing**: Run specific agents without full system analysis
- **Debugging**: See exactly what each agent found
- **Configuration**: Adjust agent behavior to organizational needs
- **Transparency**: Full visibility into AI decision-making process
- **Efficiency**: Only run relevant agents when needed
