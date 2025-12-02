# Revision Approval System Analysis

**Current Implementation Status:** December 1, 2025

---

## 1. BOM REVISION APPROVAL FLOW

### 1.1 Current Architecture

**Triggering Updates:**
- User edits BOM in `BomEditModal.tsx`
- User adds artwork, components, or adjusts packaging
- Submits with optional change summary and reviewer designation

**Flow:**
```
User Edit → BomEditModal → handleSaveChanges() 
  → onSave(editedBom, options) 
  → App.tsx: handleUpdateBom(updatedBom, options) 
  → updateBOM() mutation (useSupabaseMutations.ts)
  → Supabase boms + bom_revisions tables
```

### 1.2 Key Functions & Implementation

**Location:** `/hooks/useSupabaseMutations.ts` (Lines 468-555)

#### `updateBOM(bom, options)`
Creates a new revision record with decision logic:

```typescript
export async function updateBOM(
  bom: BillOfMaterials,
  options: BomRevisionRequestOptions & { requestedBy?: string } = {}
): Promise<{ success: boolean; error?: string }>

// Parameters:
// - bom: Complete BillOfMaterials with changes
// - options.requestedBy: User making the change
// - options.reviewerId: Designated ops reviewer
// - options.summary: Change description
// - options.changeType: 'components'|'artwork'|'packaging'|'compliance'|'metadata'
// - options.autoApprove: boolean (auto-approves if currentUser is Ops/Admin)
```

**Database Operations:**
1. **Create bom_revisions record** (snapshot + metadata)
   - `revision_number`: Auto-incremented from current
   - `status`: 'approved' if autoApprove=true, else 'pending'
   - `created_by`: requestedBy (user ID)
   - `reviewer_id`: Designated ops reviewer
   - `approved_by`: requestedBy if auto-approved, else null
   - `approved_at`: ISO timestamp if auto-approved, else null

2. **Update boms record** (live BOM)
   - Updates all fields from editedBom
   - Sets revision metadata:
     - `revision_number`: nextRevisionNumber
     - `revision_status`: 'approved'|'pending'
     - `revision_requested_by`: requestedBy
     - `revision_reviewer_id`: reviewerId
     - `revision_approved_by`: requestedBy if auto-approved

#### `approveBomRevision(bom, approverId)`
Admin/Ops approves a pending revision:

```typescript
export async function approveBomRevision(
  bom: BillOfMaterials,
  approverId: string
): Promise<{ success: boolean; error?: string }>
```

**Database Operations:**
1. Update `bom_revisions` record
   - `status`: 'approved'
   - `approved_by`: approverId
   - `approved_at`: now()

2. Update `boms` record
   - `revision_status`: 'approved'
   - `revision_approved_by`: approverId
   - `revision_approved_at`: now()
   - `last_approved_at`: now()
   - `last_approved_by`: approverId

#### `revertBomToRevision(bom, targetRevisionNumber, userId)`
Rolls back to an earlier approved revision:

```typescript
export async function revertBomToRevision(
  bom: BillOfMaterials,
  targetRevisionNumber: number,
  userId: string
): Promise<{ success: boolean; error?: string }>
```

**Creates new revision:**
- Fetches snapshot from target revision
- Creates new revision record marked 'approved' (auto-approved revert)
- Sets `reverted_from_revision_id` for audit trail
- Updates BOM to snapshot state
- All fields marked as reverted by userId

---

### 1.3 User Interface Flow (BomEditModal)

**Location:** `/components/BomEditModal.tsx` (Lines 1-694)

#### Change Summary & Reviewer Selection
```typescript
// State Management
const [changeSummary, setChangeSummary] = useState('');
const [selectedReviewerId, setSelectedReviewerId] = useState<string | null>(null);

// Filter available reviewers (Ops only)
const opsReviewers = useMemo(
  () => reviewers.filter(user => user.department === 'Operations' || user.role === 'Admin'),
  [reviewers]
);

// Check if current user can auto-approve
const canAutoApprove = currentUser.department === 'Operations' || currentUser.role === 'Admin';
```

#### Save Buttons
```typescript
const handleSaveChanges = (autoApprove = false) => {
  onSave(editedBom, {
    summary: changeSummary.trim() || 'BOM updated',
    reviewerId: selectedReviewerId ?? undefined,
    changeType: 'components',
    autoApprove,
  });
  onClose();
};
```

**Two Save Paths:**
1. **"Save & Request Ops Approval"** - `autoApprove=false`
   - Submission goes to pending state
   - Designated reviewer notified (via system alert/notification)
   - Change awaits Ops approval

2. **"Save & Auto-Approve"** - `autoApprove=true` (visible only to Ops/Admin)
   - Immediately marks revision as approved
   - Skips notification flow
   - No reviewer required

---

### 1.4 Approval Status Display

**Location:** `/components/EnhancedBomCard.tsx` (removed revision badge per recent changes)

**Previous Logic (now removed):**
- Displayed revision pill on card
- Showed color: red (pending) / green (approved)
- Approve button for Ops users

**Current State:**
- No revision UI on card face
- Approval workflow moved to BomEditModal only
- Approval/review happens in dedicated edit screen

---

## 2. MULTI-INGREDIENT APPROVAL LOGIC

### 2.1 Change Detection Requirements

**Current Implementation:** Manual summary entry by user
- No automatic diff detection
- User must describe changes in text field

**Needed Enhancement:** Automatic multi-component change detection

```typescript
// What should trigger approval requirement:
- More than one ingredient/component altered (quantity, sku, addition/removal)
- Cost implications > threshold
- Artwork changes
- Compliance-related updates
```

**Suggested Implementation:**

```typescript
interface ChangeMetadata {
  componentsChanged: number;
  artworkChanged: boolean;
  packagingChanged: boolean;
  costDelta: number;
  requiresApproval: boolean; // true if >1 component changed
}

function analyzeChanges(original: BillOfMaterials, edited: BillOfMaterials): ChangeMetadata {
  let componentsChanged = 0;
  
  // Detect component changes
  const originalSkus = new Set(original.components.map(c => c.sku));
  const editedSkus = new Set(edited.components.map(c => c.sku));
  
  // Additions/removals
  const added = editedSkus.size - originalSkus.size;
  const removed = originalSkus.size - editedSkus.size;
  
  // Quantity changes
  let quantityChanges = 0;
  edited.components.forEach(ec => {
    const oc = original.components.find(c => c.sku === ec.sku);
    if (oc && oc.quantity !== ec.quantity) quantityChanges++;
  });
  
  componentsChanged = Math.abs(added) + Math.abs(removed) + quantityChanges;
  
  return {
    componentsChanged,
    artworkChanged: original.artwork.length !== edited.artwork.length,
    packagingChanged: JSON.stringify(original.packaging) !== JSON.stringify(edited.packaging),
    costDelta: calculateCostDelta(original, edited),
    requiresApproval: componentsChanged > 1 || (componentsChanged === 1 && original.artwork.length > 0)
  };
}
```

---

## 3. ARTWORK APPROVAL FLOW

### 3.1 Current Implementation

**Artwork Status Field:**
```typescript
export interface Artwork {
  id: string;
  fileName: string;
  revision: number;
  status?: 'draft' | 'approved' | 'archived'; // <-- Approval state
  approvedBy?: string;
  approvedDate?: string;
  
  // Verification fields
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}
```

**Current Gaps:**
- Status field exists but NOT wired into approval flows
- No approval logic in ArtworkEditor or Artwork.tsx
- No reviewer assignment mechanism
- No alert/notification system for approvers

### 3.2 Missing Components

**What's Needed:**

1. **Artwork Approval Modal**
   - Display artwork preview
   - Show verification status (extracted data, ingredients)
   - Reviewer name (dropdown of Ops users)
   - Approval button + notes field
   - Rejection option

2. **Approval State Machine**
   ```typescript
   draft → pending approval → approved | rejected
   ```

3. **Notification Flow**
   - Alert designated approver when artwork uploaded
   - Show in approver dashboard
   - Toast notification to uploader on approval/rejection

4. **Database Mutations**
   ```typescript
   export async function approveArtwork(
     bomId: string,
     artworkId: string,
     approverId: string,
     notes?: string
   ): Promise<{ success: boolean; error?: string }>
   ```

---

## 4. ALERT & NOTIFICATION SYSTEM

### 4.1 Current Architecture

**Location:** `/lib/systemAlerts/SystemAlertContext.tsx`

**Alert Structure:**
```typescript
export interface SystemAlert {
  source: string; // e.g., 'po:missing-details', 'sync:inventory', 'revision:pending'
  severity?: 'warning' | 'critical' | 'info';
  message: string;
  details?: string;
  dismissible?: boolean;
}
```

**Available Methods:**
- `upsertAlert()` - Create or update
- `resolveAlert()` - Mark as resolved
- `dismissAlert()` - Dismiss for session

### 4.2 Revision Alert Integration (Not Yet Implemented)

**What Should Happen:**

```typescript
// When revision submitted for approval:
upsertAlert({
  source: 'revision:pending',
  severity: 'warning',
  message: `BOM revision pending approval: ${bom.name} (${bom.finishedSku})`,
  details: `Requestor: ${user.name}\nReviewer: ${reviewer.name}\nChanges: ${summary}`,
  dismissible: true
});

// When revision approved:
resolveAlert(`revision:pending:${bom.id}`);
```

**Current Usage Examples:**
- PO tracking alerts (`po:missing-details`)
- Sync health alerts (`sync:inventory`, `sync:vendors`)
- Should extend to: `revision:pending:${bomId}`, `revision:pending:${bomId}:${revisionNumber}`

---

## 5. DESIGNER APPROVAL PATTERNS

### 5.1 Simple Team Designations

**Users with Approval Authority:**
```typescript
// In BomEditModal:
const opsReviewers = reviewers.filter(
  user => user.department === 'Operations' || user.role === 'Admin'
);

// Can extend to other departments:
const designReviewers = reviewers.filter(
  user => user.department === 'Design' || user.role === 'Admin'
);
```

**Database Model (user_profiles):**
```sql
-- existing columns:
- role: 'Admin' | 'Manager' | 'Staff' | 'Viewer'
- department: 'Operations' | 'Purchasing' | 'Design' | 'Quality'

-- can use for approval routing:
WHERE department IN ('Design', 'Operations') OR role = 'Admin'
```

### 5.2 Approval Routing Logic

**By Department:**
- **Ops Changes** → Route to `department = 'Operations' OR role = 'Admin'`
- **Artwork Changes** → Route to `department = 'Design' OR role = 'Admin'`
- **Compliance Changes** → Route to `department = 'Operations' OR role = 'Admin'`

**Implementation:**
```typescript
function getApproversForChangeType(
  changeType: 'components' | 'artwork' | 'packaging' | 'compliance' | 'metadata',
  availableReviewers: User[]
): User[] {
  switch (changeType) {
    case 'artwork':
      return availableReviewers.filter(
        u => u.department === 'Design' || u.role === 'Admin'
      );
    case 'compliance':
    case 'components':
    case 'packaging':
    default:
      return availableReviewers.filter(
        u => u.department === 'Operations' || u.role === 'Admin'
      );
  }
}
```

---

## 6. CURRENT GAPS & RECOMMENDATIONS

### 6.1 Immediate Gaps

| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| No auto-detection of multi-component changes | Can't enforce approval rules | Medium | High |
| Artwork approval flow incomplete | No control over artwork releases | High | High |
| Alert system not wired to revisions | Approvers don't get notified | Medium | High |
| No approval dashboard | Approvers don't see pending items | Medium | Medium |
| Change log not queryable | Audit trail incomplete | Low | Low |

### 6.2 Recommended Implementation Order

1. **Phase 1: Wire Alerts (1-2 hours)**
   - Extend SystemAlertContext to handle `revision:pending`
   - Show pending revisions in sidebar/dashboard
   - Add alert resolve when approved

2. **Phase 2: Multi-Component Detection (2-3 hours)**
   - Add `analyzeChanges()` function
   - Update BomEditModal to show "Requires Approval" indicator
   - Force reviewer selection when multi-component detected

3. **Phase 3: Artwork Approval (3-4 hours)**
   - Create ArtworkApprovalModal component
   - Wire updateArtwork to set status/approvalBy
   - Add artwork approval to ArtworkEditor flow

4. **Phase 4: Approval Dashboard (4-5 hours)**
   - Create "Pending Approvals" section in Dashboard
   - Show pending revisions + artwork
   - Quick approve/reject buttons
   - Filter by type/user

---

## 7. DATABASE SCHEMA (Current)

### bom_revisions
```sql
CREATE TABLE bom_revisions (
  id UUID PRIMARY KEY,
  bom_id UUID NOT NULL REFERENCES boms(id),
  revision_number INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'draft'|'pending'|'approved'|'rejected'|'reverted'
  summary TEXT,
  change_summary TEXT,
  changeDiff JSONB,
  snapshot JSONB NOT NULL, -- Full BOM state
  created_by UUID,
  created_at TIMESTAMP DEFAULT now(),
  reviewer_id UUID,
  approved_by UUID,
  approved_at TIMESTAMP,
  revertedFromRevisionId UUID,
  approvalNotes TEXT
);
```

### boms
```sql
-- Revision tracking columns:
revision_number INTEGER,
revision_status TEXT,
revision_summary TEXT,
revision_requested_by UUID,
revision_requested_at TIMESTAMP,
revision_reviewer_id UUID,
revision_approved_by UUID,
revision_approved_at TIMESTAMP,
last_approved_at TIMESTAMP,
last_approved_by UUID
```

---

## 8. TYPE DEFINITIONS (Current)

```typescript
export type BomRevisionStatus = 
  | 'draft' 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'reverted' 
  | 'superseded';

export interface BomRevision {
  id: string;
  bomId: string;
  revisionNumber: number;
  status: BomRevisionStatus;
  summary?: string | null;
  changeSummary?: string | null;
  snapshot: BillOfMaterials;
  createdBy?: string | null;
  createdAt: string;
  reviewerId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  revertedFromRevisionId?: string | null;
  approvalNotes?: string | null;
}

export interface BomRevisionRequestOptions {
  summary?: string;
  reviewerId?: string | null;
  autoApprove?: boolean;
  changeType?: 'components' | 'artwork' | 'packaging' | 'compliance' | 'metadata';
}
```

---

## 9. SUMMARY

**Current Approval System:**
- ✅ Revision tracking in database
- ✅ Auto-approve option for Ops/Admin
- ✅ Reviewer assignment (Ops only)
- ✅ Change summary field
- ❌ Alert notifications not wired
- ❌ Artwork approval flow missing
- ❌ Multi-component detection missing
- ❌ Approval dashboard missing
- ❌ No auto-routing by change type

**Team Approvers Are:**
- Anyone with `department = 'Operations'` OR `role = 'Admin'`
- User designates reviewer in modal
- No automatic routing yet
- Simple dropdown selection from available ops users

**Artwork Has Status Field But:**
- Not integrated into any approval flow
- No modal/UI for approving artwork
- Status field exists but unused in logic

