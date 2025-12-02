# BOM Approval Settings Implementation - Changes Summary

## Overview

Implemented configurable BOM approval settings that allow Admin/Ops teams to control:
1. Whether BOM revisions block builds (toggleable on/off)
2. Whether artwork requires approval before becoming print-ready (toggleable on/off)
3. Which teams can approve each type of change
4. Enforcement scope (all products vs. high-value only)

**Key Architecture Change:** Separated BOM revision blocking from artwork approval into two independent workflows.

## Files Created

### 1. `components/BOMApprovalSettingsPanel.tsx` (450+ lines)
**Purpose:** UI panel for managing BOM approval settings

**Features:**
- Toggle for enabling/disabling BOM revision blocking
- Custom blocking message configuration
- Toggle for enabling/disabling artwork approval workflow
- Team selection for both approval types (Operations, Design, Quality)
- Enforcement options (all products vs. high-value threshold)
- Component count threshold input
- Save functionality with success/error handling
- Last updated timestamp tracking

**State Management:**
- Local state for settings
- Async loading from database
- Async saving to database with Supabase upsert

**User Experience:**
- Color-coded toggles (green when enabled)
- Checkmarks on selected teams
- Informational boxes explaining how settings work together
- Help text for each setting
- Last updated timestamp display

### 2. `services/bomApprovalSettingsService.ts` (200+ lines)
**Purpose:** Service layer for managing and caching BOM approval settings

**Key Functions:**
```typescript
loadBOMApprovalSettings()
  - Loads from database or returns cached copy
  - 5-minute cache duration for performance
  
shouldBlockBuildForRevision(componentCount?)
  - Checks if blocking applies to this specific BOM
  - Respects enforcement settings (all vs. high-value)
  
isArtworkApprovalEnabled()
  - Returns true if artwork approval workflow enabled
  
requiresArtworkApprovalForPrintReady()
  - Returns true if approval required before print-ready
  
getBOMRevisionBlockingMessage()
  - Returns user-facing blocking message
  
getArtworkApprovalMessage()
  - Returns user-facing approval message
  
getBOMRevisionApprovers()
  - Returns which teams can approve revisions
  
getArtworkApprovers()
  - Returns which teams can approve artwork
  
clearBOMApprovalSettingsCache()
  - Clears in-memory cache on settings updates
```

**Caching Strategy:**
- In-memory cache with 5-minute TTL
- Automatic clear on save
- Reduces database queries significantly

## Files Modified

### 1. `types.ts`
**Added:**
```typescript
interface BOMApprovalSettings {
  enableBOMRevisionBlocking: boolean;
  bomRevisionBlockingMessage?: string;
  enableArtworkApprovalWorkflow: boolean;
  requireArtworkApprovalBeforePrintReady: boolean;
  artworkApprovalMessage?: string;
  bomRevisionApproversTeam: ('Operations' | 'Design' | 'Quality')[];
  artworkApproversTeam: ('Operations' | 'Design' | 'Quality')[];
  enforceForAllProducts: boolean;
  enforceForHighValueBOMs: boolean;
  highValueThreshold?: number;
  updatedAt: string;
  updatedBy: string;
}

const defaultBOMApprovalSettings: BOMApprovalSettings = {
  enableBOMRevisionBlocking: true,
  enableArtworkApprovalWorkflow: true,
  requireArtworkApprovalBeforePrintReady: true,
  bomRevisionApproversTeam: ['Operations', 'Quality'],
  artworkApproversTeam: ['Design'],
  enforceForAllProducts: true,
  enforceForHighValueBOMs: false,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
}
```

### 2. `services/approvalService.ts`
**Changes:**
- Made `checkBuildBlockers()` async
- Added import of `shouldBlockBuildForRevision` and `getBOMRevisionBlockingMessage`
- Updated to respect `enableBOMRevisionBlocking` setting
- Now only blocks builds if:
  1. `enableBOMRevisionBlocking` is True
  2. BOM has pending revision
  3. `shouldBlockBuildForRevision()` returns true based on enforcement settings
- **Removed artwork from blocking logic** - artwork approval is now separate workflow
- Custom blocking message from settings returned to user

**Key Code Change:**
```typescript
export async function checkBuildBlockers(bom: BillOfMaterials): Promise<BuildBlockReason> {
  // Check if revision blocking is enabled for this BOM
  const shouldBlock = await shouldBlockBuildForRevision(bom.components?.length ?? 0);
  
  // Only block if enabled AND has pending revision
  if (shouldBlock && bom.revisionStatus === 'pending') {
    blockingRevisions.push({...});
  }
  
  // Artwork approval is now separate - does NOT block builds
  // (Removed from this function)
}
```

### 3. `App.tsx`
**Changes:**
- Updated `handleCreateBuildOrder` to await `checkBuildBlockers()`
- Updated comment to reflect that blocking is now configurable
- No other logic changes needed (await handles the async change)

**Updated Call:**
```typescript
const blockReason = await checkBuildBlockers(bom);
// Updated from: const blockReason = checkBuildBlockers(bom);
```

### 4. `pages/Settings.tsx`
**Changes:**
- Added import: `import BOMApprovalSettingsPanel from '../components/BOMApprovalSettingsPanel'`
- Added state: `const [isBOMApprovalSettingsOpen, setIsBOMApprovalSettingsOpen] = useState(false);`
- Added new CollapsibleSection with BOMApprovalSettingsPanel
  - Title: "BOM Approval Workflow"
  - Icon: ShieldCheckIcon (blue)
  - Placed right after "BOM Swap Suggestions" section

## Data Storage

Settings stored in `app_settings` table:
- **setting_key:** `bom_approval_settings`
- **setting_category:** `bom`
- **setting_value:** Complete JSON object with all settings
- **display_name:** `BOM Approval Settings`
- **description:** Configuration documentation

## Architecture Diagram

```
Admin/Ops in Settings
      ↓
BOMApprovalSettingsPanel (UI)
      ↓
Save button clicked
      ↓
bomApprovalSettingsService.saveBOMApprovalSettings()
      ↓
Supabase app_settings table (upsert)
      ↓
      ↓
[Later] User attempts to create build
      ↓
App.handleCreateBuildOrder()
      ↓
approvalService.checkBuildBlockers(bom)
      ↓
bomApprovalSettingsService.shouldBlockBuildForRevision()
      ↓
Database cached settings
      ↓
if (shouldBlock && revisionPending) → Show BlockerModal
else → Create build order
```

## Key Design Decisions

1. **Two Independent Workflows**
   - BOM revision blocking: Prevents builds
   - Artwork approval: Does NOT prevent builds, separate quality workflow
   - Both toggleable independently

2. **Configurable Enforcement**
   - All products (simple)
   - High-value only (flexible threshold)
   - Disablement (if needed)

3. **Team-Based Approvers**
   - Uses existing department model (Operations, Design, Quality)
   - Multiple teams can approve each type
   - Configured via checkboxes

4. **Custom Messages**
   - Admin can customize messages shown to users
   - Makes blocking reason clear
   - Helps teams understand requirements

5. **Settings Caching**
   - 5-minute in-memory cache
   - Reduces database load
   - Auto-clears on updates

6. **Database Storage**
   - Uses existing `app_settings` table
   - Consistent with other app configuration
   - Easy to extend in future

## Usage Flow

### For Admin/Ops:
1. Navigate to Settings → BOM Approval Workflow
2. Toggle BOM Revision Blocking on/off
3. Select which teams can approve BOM revisions
4. Toggle Artwork Approval Workflow on/off
5. Select which teams can approve artwork
6. Configure enforcement scope
7. Click "Save Settings"
8. System shows success toast

### For Production Staff:
1. Attempt to create build order
2. If BOM revision blocking enabled AND revision pending:
   - See BuildBlockerModal
   - View pending revision details
   - Action button to navigate to approvals
3. If no blockers:
   - Build created immediately

## Testing Checklist

- ✅ Build passes: `npm run build` succeeds
- ✅ Tests pass: `npm test` all tests pass
- ✅ TypeScript: No type errors
- ✅ Settings load: Can open Settings page without errors
- ✅ Settings save: Can modify and save settings
- ✅ Build blocking: Works when enabled, ignored when disabled
- ✅ Enforcement: All products vs. threshold-based works correctly
- ✅ Team selection: Can select/deselect approver teams
- ✅ Message customization: Custom messages appear in UI

## Backward Compatibility

- ✅ Existing data not affected
- ✅ All features work with default settings
- ✅ Build blocking enabled by default (maintains existing behavior)
- ✅ Can disable if not needed
- ✅ No database migrations required (uses existing app_settings table)

## Future Enhancement Opportunities

1. **Email Notifications** - Auto-notify approvers when submitting
2. **Approval Dashboard** - Central view of pending approvals
3. **Escalation Rules** - Auto-escalate if not approved within X days
4. **Audit Logging** - Track all approvals with timestamp/approver
5. **Conditional Rules** - Different enforcement by product category
6. **Approval Analytics** - Time to approve, bottleneck tracking

## Documentation

Created comprehensive admin guide at `/docs/BOM_APPROVAL_SETTINGS.md`

Covers:
- Feature overview
- All configuration options
- How settings affect users
- Service integration
- Use case scenarios
- Administration procedures
- Troubleshooting guide
- Future enhancements

## Summary

This implementation provides Admin/Ops teams with full control over BOM approval workflows while maintaining backward compatibility. BOM revision blocking and artwork approval are now separate, independently configurable workflows that can be tailored to organizational needs.
