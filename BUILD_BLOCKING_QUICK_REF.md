# Build Blocking Feature - Quick Reference

## What Was Added

Build orders are now **blocked** when a BOM has pending approvals. Users see a clear modal explaining why they can't build, and can click to view the pending approvals.

## Where to Find the Code

### Core Logic
- **Service Layer**: `services/approvalService.ts` - Contains `checkBuildBlockers()` function
  - Checks if BOM has pending revisions
  - Checks if artwork is not approved for print-ready
  - Returns structured `BuildBlockReason` with user-facing messaging

### UI Components
- **Modal**: `components/BuildBlockerModal.tsx` - Shows blockers to user
  - Lists pending revisions with details
  - Lists unapproved artwork files
  - Action buttons to view approvals or close

### Integration Points
- **App.tsx**:
  - `handleCreateBuildOrder()` (lines ~1290-1345) - Calls `checkBuildBlockers()` before creating build
  - State management for modal (lines ~175-179)
  - Modal rendering (lines ~2047-2057)

- **useSupabaseMutations.ts**:
  - `approveArtworkForPrintReady()` - Marks artwork as approved
  - `rejectArtworkApproval()` - Rejects artwork, reverts to draft

## How It Works

### Build Order Creation Flow
```
User clicks "Schedule Build"
    ↓
App.handleCreateBuildOrder() called
    ↓
checkBuildBlockers(bom) called
    ↓
Has pending revisions or unapproved artwork?
    ├─ YES → Show BuildBlockerModal, stop
    └─ NO → Create build order, navigate to Production
```

### Blocker Detection
```javascript
// In checkBuildBlockers():
const blockReason = {
  blocked: bom.revision_status === 'pending_approval' || 
           bom.artwork?.some(art => art.status !== 'approved'),
  reason: `BOM revision #X awaiting approval + Y artwork files not approved`,
  blockingRevisions: [...],
  missingApprovals: [...]
}
```

### User-Facing Messages
```
"Cannot Create Build Order"
"This product has pending approvals"

Pending BOM Revision #5
Description: Updated component quantities for cost optimization
Status: Awaiting Ops Review
Submitted: 11/15/2024

Artwork Not Print-Ready
circuit_diagram.pdf - Design Review
pcb_layout.svg - Ops Verification
```

## How to Test

### Manual Test 1: Block with Pending Revision
1. Open BOMs page
2. Create/edit a BOM and choose "Save & Request Ops Approval"
3. Open Production page
4. Click "Schedule Build" for that product
5. **Expect**: BuildBlockerModal appears showing the pending revision

### Manual Test 2: Block with Unapproved Artwork
1. Open BOMs page → Edit a BOM
2. Upload artwork file with status "draft" (not "approved")
3. Open Production page
4. Click "Schedule Build"
5. **Expect**: BuildBlockerModal appears showing unapproved artwork file

### Manual Test 3: Allow When No Blockers
1. Complete all pending approvals for a BOM
2. Approve all artwork files (status = "approved")
3. Open Production page
4. Click "Schedule Build"
5. **Expect**: Build order created immediately, no modal

## Future Enhancements

### Phase 2 (Planned)
1. **ScheduleBuildModal Enhancement**
   - Show warning icon if blockers detected before modal opens
   - Disable "Create" button if fully blocked
   - Show "View Approvals" button right in modal

2. **BomEditModal Enhancement**
   - Call `analyzeChanges()` to detect multi-component edits
   - If >1 component changed, show "This requires approval" warning
   - Force user to select reviewer before saving

3. **SystemAlerts Integration**
   - Create alerts when revision submitted for approval
   - Alert designated approvers (Ops, Design team)
   - Auto-resolve alerts when approved

4. **Approval Dashboard**
   - New dashboard showing pending revisions
   - Pending artwork approvals
   - Quick-approve buttons for Ops/Design teams

## Code Examples

### Check if Build Can Proceed
```typescript
import { checkBuildBlockers } from './services/approvalService';

const bom = bomMap.get(sku);
const blockReason = checkBuildBlockers(bom);

if (blockReason.blocked) {
  // Show modal to user
  setPendingBuildBlockReason(blockReason);
  setShowBuildBlockerModal(true);
} else {
  // Proceed with build
  await createBuildOrder(order);
}
```

### Approve Artwork
```typescript
import { approveArtworkForPrintReady } from './hooks/useSupabaseMutations';

const result = await approveArtworkForPrintReady(
  bomId,
  artworkId,
  approverId,
  'Approved for print-ready status'
);

if (result.success) {
  // Artwork now approved, builds can proceed
  // Trigger refetch of BOM
  refetchBoms();
}
```

### Reject Artwork
```typescript
import { rejectArtworkApproval } from './hooks/useSupabaseMutations';

const result = await rejectArtworkApproval(
  bomId,
  artworkId,
  'Design revisions needed - DPI too low for print',
  approverId
);

if (result.success) {
  // Artwork reverted to draft, user can resubmit after fixes
  refetchBoms();
}
```

## Types Reference

### BuildBlockReason
```typescript
interface BuildBlockReason {
  blocked: boolean;
  reason: string;  // User-facing: "BOM revision #X awaiting approval: description"
  severity: 'error' | 'warning';
  blockingRevisions?: {
    revisionNumber: number;
    description: string;
    status: string;
    submittedAt: string;
  }[];
  missingApprovals?: {
    fileId: string;
    fileName: string;
    approvalType: string;
    requiredBy: string;
  }[];
}
```

### Artwork Status Values
```typescript
type ArtworkStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'archived';

// printReady flag determines if builds can use this artwork
artwork.printReady === true  // Only when status === 'approved'
```

## Common Issues & Solutions

### Issue: BuildBlockerModal doesn't appear
**Solution**: 
1. Check that `bom.revision_status === 'pending_approval'` is set correctly
2. Verify artwork.status field contains correct values
3. Check browser console for errors in `checkBuildBlockers()`
4. Ensure `setShowBuildBlockerModal(true)` is being called

### Issue: Modal shows but with wrong reasons
**Solution**:
1. Check BOM data returned from `bomMap.get(sku)`
2. Verify `bom.artwork` array is populated correctly
3. Check revision_status field on BOM record

### Issue: After approving artwork, modal still shows
**Solution**:
1. Artwork approval must call `refetchBoms()` to reload data
2. Check that artwork.status was actually updated in database
3. Verify `approveArtworkForPrintReady()` mutation completed successfully

## Related Files

- `REVISION_APPROVAL_ANALYSIS.md` - Original analysis of approval system
- `approvalService.ts` - Core approval logic (build blockers, routing, state machines)
- `BomEditModal.tsx` - Where revisions are submitted for approval
- `Artwork.tsx` - Where artwork files are managed and approved
- `Production.tsx` - Where "Schedule Build" button triggers the flow

## Questions?

See `BUILD_BLOCKING_IMPLEMENTATION.md` for detailed implementation notes and design decisions.
