# BOM Approval Settings - Admin Configuration Guide

## Overview

The BOM Approval Settings feature allows Admin/Ops teams to configure whether and how BOM revisions block builds, and whether artwork requires approval before becoming print-ready. Both workflows can be toggled on/off independently.

**Key Distinction:**
- **BOM Revision Blocking** (configurable): When enabled, pending BOM revisions BLOCK builds from being created
- **Artwork Approval** (configurable): Does NOT block builds - it's a separate quality control workflow

## Location

**Settings Page** → **BOM Approval Workflow** section

## Configuration Options

### BOM Revision Blocking Section

#### Enable Revision Blocking
- **Toggle:** On/Off
- **Default:** Enabled (On)
- **Effect:** When enabled, pending BOM revisions prevent build orders from being created

#### Blocking Message
- **Type:** Text field
- **Usage:** Custom message shown to users when build is blocked
- **Example:** "BOM revisions must be approved by Operations before builds can proceed"
- **Default:** "BOM revisions must be approved before builds can proceed"

#### Approvers (BOM Revisions)
- **Type:** Multi-select (Operations, Design, Quality)
- **Default:** Operations, Quality
- **Effect:** Only selected teams can approve pending BOM revisions

#### Enforcement Options

##### Enforce for All Products
- **Toggle:** On/Off
- **Default:** Enabled (On)
- **Effect:** When On, blocking applies to every product BOM
- **Effect:** When Off, only high-value BOMs are subject to blocking (if enabled)

##### Enforce for High-Value BOMs
- **Toggle:** On/Off
- **Default:** Disabled (Off)
- **Dependency:** Only appears if "Enforce for All Products" is Off
- **Effect:** Apply blocking only to BOMs that meet component count threshold

##### Component Count Threshold
- **Type:** Number input
- **Default:** (empty)
- **Visibility:** Only appears if "Enforce for High-Value BOMs" is On
- **Example:** 20 (only block BOMs with 20+ components)

### Artwork Approval Workflow Section

#### Enable Artwork Approval Workflow
- **Toggle:** On/Off
- **Default:** Enabled (On)
- **Effect:** When enabled, staff must get approval before marking artwork as print-ready
- **Important:** This does NOT block builds - it's a separate quality workflow

#### Require Approval Before Print Ready
- **Toggle:** On/Off
- **Default:** Enabled (On)
- **Visibility:** Only appears if "Enable Artwork Approval Workflow" is On
- **Effect:** Staff cannot change artwork status to print-ready without approval

#### Approval Message
- **Type:** Text field
- **Usage:** Custom message shown to users when artwork needs approval
- **Example:** "Design team must review artwork files for print quality"
- **Default:** "Artwork must be approved by the design team before marking as print-ready"

#### Approvers (Artwork)
- **Type:** Multi-select (Operations, Design, Quality)
- **Default:** Design
- **Effect:** Only selected teams can approve artwork for print-ready status

## How Settings Are Stored

Settings are stored in the `app_settings` database table with:
- **Key:** `bom_approval_settings`
- **Category:** `bom`
- **Value:** Full JSON object with all configuration

Settings are cached in memory for 5 minutes to reduce database queries.

## How It Affects Users

### Build Creation with BOM Revision Blocking Enabled

1. User attempts to create build order in Production page
2. System checks if BOM has pending revisions
3. If `enableBOMRevisionBlocking` is True:
   - Build is **BLOCKED**
   - BuildBlockerModal appears with:
     - Custom blocking message
     - Pending revision details
     - Action button to view approvals
4. If `enableBOMRevisionBlocking` is False:
   - Build proceeds normally regardless of revision status

### Artwork Approval Workflow

1. Staff creates or modifies artwork file in Artwork page
2. Artwork status defaults to "draft"
3. If `requireArtworkApprovalBeforePrintReady` is True:
   - Staff cannot change status to "print-ready"
   - Must submit for approval to designated team
   - Designated team reviews and approves/rejects
4. Once approved, staff can mark as print-ready
5. If `requireArtworkApprovalBeforePrintReady` is False:
   - Staff can mark as print-ready immediately after creation

## Service Integration

### bomApprovalSettingsService.ts

Service functions for loading and checking settings:

```typescript
// Load settings (cached for 5 minutes)
await loadBOMApprovalSettings(): Promise<BOMApprovalSettings>

// Check if revision blocking applies to this BOM
await shouldBlockBuildForRevision(componentCount?: number): Promise<boolean>

// Check if artwork approval is enabled
await isArtworkApprovalEnabled(): Promise<boolean>

// Check if approval required before print-ready
await requiresArtworkApprovalForPrintReady(): Promise<boolean>

// Get messages and approver lists
await getBOMRevisionBlockingMessage(): Promise<string>
await getArtworkApprovalMessage(): Promise<string>
await getBOMRevisionApprovers(): Promise<string[]>
await getArtworkApprovers(): Promise<string[]>
```

### approvalService.ts

Updated to respect settings:

```typescript
// Now async and respects settings
await checkBuildBlockers(bom: BillOfMaterials): Promise<BuildBlockReason>
// Only blocks if:
// 1. enableBOMRevisionBlocking is True
// 2. BOM has pending revision
// 3. shouldBlockBuildForRevision() returns true
```

## Use Cases

### Scenario 1: Strict Approval Workflow
- **Enable:** Both BOM Revision Blocking AND Artwork Approval
- **Enforcement:** All products
- **Approvers:**
  - BOM revisions: Operations, Quality
  - Artwork: Design, Quality
- **Effect:** Nothing can proceed without multiple approvals

### Scenario 2: High-Value Products Only
- **Enable:** BOM Revision Blocking (high-value threshold)
- **Threshold:** 50 components
- **Approvers:** Operations
- **Effect:** Only complex BOMs require revision approval; simple ones can build anytime

### Scenario 3: Quality Control Only
- **Disable:** BOM Revision Blocking
- **Enable:** Artwork Approval
- **Effect:** Builds proceed immediately, but artwork must be approved before print

### Scenario 4: No Approvals
- **Disable:** Both BOM Revision Blocking and Artwork Approval
- **Effect:** Full operational freedom - no blocking or approval requirements

## Administration

### Viewing Current Settings

1. Go to Settings → BOM Approval Workflow
2. All current settings displayed
3. Last update timestamp shown at bottom

### Modifying Settings

1. Toggle or modify desired settings
2. Click "Save Settings" button
3. Settings update immediately in database
4. Cache cleared automatically
5. Success toast confirms save
6. Settings take effect on next BOM check

### Best Practices

1. **Test Before Enforcement:** Start with just one enforcement option
2. **Communicate Changes:** Notify teams when enabling/disabling approvals
3. **Review Regularly:** Check settings quarterly to ensure they still fit workflow
4. **Document Decisions:** Note why blocking is enabled/disabled and for which teams
5. **Gradual Rollout:** Start with Design team artwork approval, then expand if successful

## Troubleshooting

### Settings Not Saving
- Check browser console for errors
- Verify you have Admin role
- Check database connectivity
- Try refreshing the page

### Build Blocking Not Working
- Verify `enableBOMRevisionBlocking` is True
- Check that enforcement is set to "All Products" or threshold is met
- Verify BOM actually has pending revision status
- Check that pending revision exists in database

### Approvers Not Receiving Notifications
- Artwork approval workflow does not currently send emails
- Phase 2 will wire SystemAlerts and notifications
- For now, approvers must check Artwork page for pending approvals

## Related Files

- **Component:** `components/BOMApprovalSettingsPanel.tsx` (UI)
- **Service:** `services/bomApprovalSettingsService.ts` (Settings management)
- **Integration:** `services/approvalService.ts` (Uses settings)
- **Usage:** `App.tsx` handleCreateBuildOrder() (Respects settings)
- **Types:** `types.ts` BOMApprovalSettings interface

## Future Enhancements (Phase 2)

1. **Email Notifications:** Auto-email approvers when revision/artwork submitted
2. **Approval Dashboard:** Central place to see all pending approvals
3. **Approval Analytics:** Track approval times, bottlenecks, trends
4. **Escalation Rules:** Auto-escalate if not approved within X days
5. **Audit Trail:** Log all approvals with timestamp and approver
6. **Conditional Enforcement:** Different rules based on product category, value, etc.
