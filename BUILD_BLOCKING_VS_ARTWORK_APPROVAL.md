# Build Blocking vs. Artwork Approval - Architecture Guide

## Key Distinction

This implementation separates two workflows that were previously combined:

| Aspect | BOM Revision Blocking | Artwork Approval |
|--------|----------------------|------------------|
| **Purpose** | Prevent builds when BOM changes pending approval | Ensure artwork quality before print production |
| **Blocks Builds?** | ✅ YES (when enabled) | ❌ NO |
| **Workflow Type** | Compliance/Process | Quality Control |
| **Approvers** | Operations, Quality | Design, Quality |
| **When Happens** | During build order creation | During artwork status change |
| **User Frustration** | High if too strict | Low - doesn't block critical work |
| **Configurable** | ✅ YES (on/off, scope, teams) | ✅ YES (on/off, teams) |

## BOM Revision Blocking Flow

```
Product Team edits BOM
         ↓
Multiple components changed
         ↓
Mark as "Save & Request Approval"
         ↓
BOM revision_status = 'pending'
         ↓
Production Manager attempts build
         ↓
checkBuildBlockers() called
         ↓
if (enableBOMRevisionBlocking && revisionPending)
    → BuildBlockerModal shown
    → Build creation STOPPED
else
    → Build proceeds normally
```

**When This Matters:**
- You want to prevent builds using untested ingredient combinations
- Regulatory compliance requires approval before manufacturing
- Quality gate: only approved BOMs can go to production
- You need organizational control: "nothing builds without permission"

**Configuration:**
```
Settings → BOM Approval Workflow → BOM Revision Blocking
- Enable/Disable toggle
- Custom message to users
- Select approver teams
- All products or high-value only
```

**User Experience:**
```
Manager clicks "Schedule Build"
       ↓
System checks: "Does this BOM have pending revision?"
       ↓
YES → Modal pops up: "Cannot build - revision awaiting Operations approval"
      Action: "View Revision Approvals" button
      Manager goes to BOMs page to approve revision first
      ↓
      Approval complete
      ↓
      Returns to Production, clicks "Schedule Build" again
      ↓
      Build created successfully
```

## Artwork Approval Workflow Flow

```
Designer creates/updates artwork
              ↓
Artwork status = "draft"
              ↓
Cannot mark as print-ready yet
              ↓
Submit for approval to Design team
              ↓
Artwork status = "pending_approval"
              ↓
Design Manager reviews and approves
              ↓
Artwork status = "approved"
              ↓
printReady = true
              ↓
Staff can now send to printer
```

**When This Matters:**
- Quality control: file format, resolution, colors look correct
- Prevents printing artwork with typos or design issues
- Formal sign-off: "someone approved this goes to print"
- Doesn't affect production schedules (separate workflow)

**Configuration:**
```
Settings → BOM Approval Workflow → Artwork Approval Workflow
- Enable/Disable toggle
- Custom message to users
- Select approver teams
- Require approval before print-ready toggle
```

**User Experience:**
```
Designer uploads artwork file
     ↓
Creates "label_v2.pdf"
     ↓
Marks status as "draft" (ready for review)
     ↓
Tries to mark as "print-ready"
     ↓
System checks: "Is artwork approval required?"
     ↓
YES → Cannot change status directly
      Action: "Submit for Approval" button
      ↓
      Design team gets notified (Phase 2)
      ↓
      Design Manager reviews and approves
      ↓
      Artwork status → "approved"
      ↓
      Designer can now mark as "print-ready"
      ↓
      printReady = true

[IMPORTANT: Build orders still proceed normally during this entire process]
```

## Why This Separation Matters

### Problem with Old Approach
If artwork blocking was combined with BOM revision blocking:
- One artwork issue blocks entire build pipeline
- Production delays waiting for design approval
- Creates unnecessary friction between teams
- Not everyone needs full BOM approval

### Solution: Two Independent Workflows
Each team handles their own approval:
- **Operations:** Reviews BOM changes before builds start
- **Design:** Reviews artwork quality before printing (separate process)
- **No blocking:** Builds proceed independently of artwork status
- **Both optional:** Can enable/disable each workflow independently

### Real-World Scenario

**Company A - Manufacturing Focus:**
- BOM Revision Blocking: **ENABLED** (strict process control)
- Artwork Approval: **DISABLED** (design team will handle offline)
- Result: Builds must have approved BOMs, but artwork handled separately

**Company B - Quality Critical:**
- BOM Revision Blocking: **ENABLED** (regulatory requirement)
- Artwork Approval: **ENABLED** (quality gate before print)
- Result: Strictest control - everything must be approved

**Company C - Fast Moving:**
- BOM Revision Blocking: **DISABLED** (agile methodology)
- Artwork Approval: **ENABLED** (just quality control on design)
- Result: No build delays, but artwork quality still checked

**Company D - No Approval Culture:**
- BOM Revision Blocking: **DISABLED**
- Artwork Approval: **DISABLED**
- Result: Full operational freedom - no approval gates

## Code Architecture

### checkBuildBlockers() Function

**OLD (Combined Logic):**
```typescript
function checkBuildBlockers(bom) {
  // Check revisions - blocks builds
  if (bom.revisionStatus === 'pending') block = true;
  
  // Check artwork - also blocks builds (PROBLEM!)
  if (unapprovedArtwork.length > 0) block = true;
  
  return { blocked: true, reason: "..." };
}
```

**NEW (Separated Logic):**
```typescript
async function checkBuildBlockers(bom) {
  // Only check revisions - AND respects configuration
  const shouldBlock = await shouldBlockBuildForRevision(bom.componentCount);
  
  if (shouldBlock && bom.revisionStatus === 'pending') {
    block = true;
  }
  
  // Artwork approval is completely separate - does NOT affect builds
  // (Removed from this function entirely)
  
  return { blocked: true/false, reason: "..." };
}
```

### Approving Workflows

**Approving BOM Revision:**
```typescript
// In BomEditModal or BOM approval page
await approveBomRevision(bomId, approverId, notes);
// Sets: revision_status = 'approved'
// Effect: Builds can now proceed
```

**Approving Artwork:**
```typescript
// In Artwork approval page (future)
await approveArtworkForPrintReady(bomId, artworkId, approverId, notes);
// Sets: artwork.status = 'approved', printReady = true
// Effect: Artwork can be sent to printer
// Does NOT affect build orders
```

## Integration Points

### Where BOM Blocking Checked
```
Production.tsx → ScheduleBuildModal
              ↓
              → onClick handler calls handleCreateBuildOrder()
              ↓
              App.tsx → handleCreateBuildOrder()
              ↓
              checkBuildBlockers(bom)  ← HERE
              ↓
              if (blocked) → Show BuildBlockerModal
              else → Create build order
```

### Where Artwork Approval Checked
```
Artwork.tsx → Artwork page
         ↓
         → Try to mark as "print-ready"
         ↓
         checkArtworkApprovalRequired()  ← HERE
         ↓
         if (required && not approved) → Cannot change status
         else → Change to print-ready
```

## Settings Storage

Both settings in same place for admin convenience:

```
Database: app_settings table
  ↓
setting_key: "bom_approval_settings"
  ↓
setting_value: {
  // BOM Revision Blocking
  enableBOMRevisionBlocking: true,
  bomRevisionBlockingMessage: "...",
  bomRevisionApproversTeam: ["Operations", "Quality"],
  enforceForAllProducts: true,
  enforceForHighValueBOMs: false,
  highValueThreshold: null,
  
  // Artwork Approval (separate)
  enableArtworkApprovalWorkflow: true,
  requireArtworkApprovalBeforePrintReady: true,
  artworkApprovalMessage: "...",
  artworkApproversTeam: ["Design"],
}
```

## Service Functions

### For Checking Build Blocking
```typescript
// Check if THIS BOM should be blocked
await shouldBlockBuildForRevision(componentCount)
  ↓ Returns boolean based on settings

// Get the message to show user
await getBOMRevisionBlockingMessage()
  ↓ Returns custom message from settings

// Get who can approve revisions
await getBOMRevisionApprovers()
  ↓ Returns ["Operations", "Quality", ...]
```

### For Checking Artwork Approval
```typescript
// Is workflow enabled?
await isArtworkApprovalEnabled()
  ↓ Returns boolean

// Is approval required before print-ready?
await requiresArtworkApprovalForPrintReady()
  ↓ Returns boolean

// Get the message to show user
await getArtworkApprovalMessage()
  ↓ Returns custom message from settings

// Get who can approve artwork
await getArtworkApprovers()
  ↓ Returns ["Design", "Quality", ...]
```

## Testing Scenarios

### Test 1: BOM Blocking Enabled, Artwork Approval Disabled
```
Setup:
- enableBOMRevisionBlocking: true
- enableArtworkApprovalWorkflow: false

Expected:
- Builds blocked if revision pending ✓
- Artwork can be marked print-ready anytime ✓
- Artwork doesn't affect builds ✓
```

### Test 2: BOM Blocking Disabled, Artwork Approval Enabled
```
Setup:
- enableBOMRevisionBlocking: false
- enableArtworkApprovalWorkflow: true

Expected:
- Builds proceed even with pending revision ✓
- Artwork cannot be print-ready without approval ✓
- Build doesn't wait for artwork approval ✓
```

### Test 3: Both Enabled
```
Setup:
- enableBOMRevisionBlocking: true
- enableArtworkApprovalWorkflow: true

Expected:
- Builds blocked if revision pending ✓
- Artwork must be approved before print-ready ✓
- Both workflows independent ✓
```

### Test 4: Both Disabled
```
Setup:
- enableBOMRevisionBlocking: false
- enableArtworkApprovalWorkflow: false

Expected:
- Builds proceed anytime ✓
- Artwork can be print-ready anytime ✓
- No approval requirements ✓
```

## Phase 2 Enhancement

Current state: Two independent workflows, configured in Settings

Future enhancement ideas:
1. **Combined Approval Dashboard** - See all pending approvals (both types) in one place
2. **Approval Chains** - Could require revision approval before artwork approval, etc.
3. **Conditional Logic** - Different rules for different product categories
4. **Notification System** - Alert approvers when changes submitted
5. **Analytics** - Track approval times, bottlenecks, patterns

But core separation stays: **BOM blocking ≠ Artwork approval**
