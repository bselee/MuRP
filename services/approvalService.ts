/**
 * Approval Service
 * 
 * Centralized approval logic for:
 * - Artwork print-ready status
 * - BOM revision blocking for builds (configurable)
 * - Approval routing by change type
 */

import type { BillOfMaterials, Artwork, User, BomRevisionStatus } from '../types';
import { shouldBlockBuildForRevision, getBOMRevisionBlockingMessage } from './bomApprovalSettingsService';

// ============================================================================
// BUILD BLOCKING RULES
// ============================================================================

export interface BuildBlockReason {
  blocked: boolean;
  reason: string; // User-facing explanation
  severity: 'error' | 'warning'; // error = cannot proceed, warning = confirm
  blockingRevisions: {
    revisionNumber: number;
    status: BomRevisionStatus;
    summary?: string;
  }[];
  missingApprovals: {
    type: 'artwork' | 'component' | 'compliance';
    count: number;
    details: string[];
  }[];
}

/**
 * Check if a BOM can be built (revision approval blocking)
 * 
 * Now respects BOM approval settings - build blocking can be toggled on/off
 * 
 * Block scenarios (if enabled):
 * - BOM has pending revisions
 * 
 * Note: Artwork approval is a separate workflow and does NOT block builds
 */
export async function checkBuildBlockers(bom: BillOfMaterials): Promise<BuildBlockReason> {
  const blockingRevisions: BuildBlockReason['blockingRevisions'] = [];
  const missingApprovals: BuildBlockReason['missingApprovals'] = [];
  
  // Check if revision blocking is enabled for this BOM
  const shouldBlock = await shouldBlockBuildForRevision(bom.components?.length ?? 0);
  
  // Check revision status - only block if setting is enabled
  if (shouldBlock && bom.revisionStatus === 'pending') {
    blockingRevisions.push({
      revisionNumber: bom.revisionNumber ?? 1,
      status: 'pending',
      summary: bom.revisionSummary ?? 'Awaiting approval',
    });
  }
  
  // NOTE: Artwork approval is a separate workflow and does NOT block builds
  // Artwork must still be approved before becoming print-ready, but this doesn't prevent builds
  
  const hasBlockers = blockingRevisions.length > 0;
  
  if (hasBlockers) {
    const message = await getBOMRevisionBlockingMessage();
    const reasons: string[] = [message];
    
    if (blockingRevisions.length > 0) {
      reasons.push(
        `BOM revision #${blockingRevisions[0].revisionNumber} awaiting approval: "${blockingRevisions[0].summary}"`
      );
    }
    
    return {
      blocked: true,
      reason: reasons.join(' - '),
      severity: 'error',
      blockingRevisions,
      missingApprovals,
    };
  }
  
  return {
    blocked: false,
    reason: 'All required approvals complete',
    severity: 'warning',
    blockingRevisions: [],
    missingApprovals: [],
  };
}

// ============================================================================
// APPROVAL ROUTING
// ============================================================================

export interface ApprovalRoute {
  department: string[];
  roles: string[];
  description: string;
}

/**
 * Get approval routing rules by change type
 * Determines which team(s) should approve the change
 */
export function getApprovalRoute(
  changeType: 'components' | 'artwork' | 'packaging' | 'compliance' | 'metadata'
): ApprovalRoute {
  switch (changeType) {
    case 'artwork':
      return {
        department: ['Design', 'Operations'],
        roles: ['Admin'],
        description: 'Design or Operations team',
      };
    
    case 'compliance':
      return {
        department: ['Operations', 'Quality'],
        roles: ['Admin'],
        description: 'Operations or Quality team',
      };
    
    case 'components':
    case 'packaging':
    case 'metadata':
    default:
      return {
        department: ['Operations'],
        roles: ['Admin'],
        description: 'Operations team',
      };
  }
}

/**
 * Filter users eligible to approve based on change type
 */
export function getEligibleApprovers(
  changeType: 'components' | 'artwork' | 'packaging' | 'compliance' | 'metadata',
  availableUsers: User[]
): User[] {
  const route = getApprovalRoute(changeType);
  
  return availableUsers.filter(
    user => 
      user.role === 'Admin' ||
      route.department.includes(user.department)
  );
}

// ============================================================================
// ARTWORK APPROVAL STATE MACHINE
// ============================================================================

export interface ArtworkApprovalRequest {
  artworkId: string;
  bomId: string;
  fileName: string;
  revision: number;
  requestedBy: string;
  requestedAt: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  approvalNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  printReady: boolean;
}

/**
 * Transitions for artwork approval state machine
 */
export function getArtworkApprovalTransitions(
  currentStatus: ArtworkApprovalRequest['status']
): string[] {
  switch (currentStatus) {
    case 'draft':
      return ['pending_approval', 'rejected'];
    case 'pending_approval':
      return ['approved', 'rejected'];
    case 'approved':
      return []; // Terminal state
    case 'rejected':
      return ['pending_approval']; // Can resubmit
    default:
      return [];
  }
}

/**
 * Validate artwork can transition to approved state
 */
export function canApproveArtwork(artwork: Artwork): {
  canApprove: boolean;
  reason?: string;
} {
  // Check if artwork has been verified (data extracted and reviewed)
  if (!artwork.verified) {
    return {
      canApprove: false,
      reason: 'Artwork must be verified before approval',
    };
  }
  
  // Check if artwork has extracted data validated
  if (!artwork.extractedData) {
    return {
      canApprove: false,
      reason: 'Label data extraction required before approval',
    };
  }
  
  return {
    canApprove: true,
  };
}

// ============================================================================
// APPROVAL ALERTS & NOTIFICATIONS
// ============================================================================

export interface ApprovalAlert {
  source: string; // 'revision:pending' | 'artwork:pending' | 'build:blocked'
  severity: 'warning' | 'critical' | 'info';
  title: string;
  message: string;
  affectedEntity: {
    type: 'bom' | 'artwork';
    id: string;
    name: string;
  };
  approvalDue?: string; // ISO timestamp
  actionUrl?: string; // Deep link to approval screen
}

/**
 * Generate approval alert when revision submitted
 */
export function createRevisionPendingAlert(
  bom: BillOfMaterials,
  reviewerId: string,
  reviewer: User | undefined,
  summary: string
): ApprovalAlert {
  return {
    source: `revision:pending:${bom.id}:${bom.revisionNumber}`,
    severity: 'warning',
    title: `BOM Revision Pending Approval`,
    message: `${bom.name} (${bom.finishedSku}) revision #${bom.revisionNumber} awaiting approval from ${reviewer?.name ?? 'assigned reviewer'}: "${summary}"`,
    affectedEntity: {
      type: 'bom',
      id: bom.id,
      name: bom.name,
    },
    actionUrl: `/boms?approve=${bom.id}`,
  };
}

/**
 * Generate alert when artwork print-ready approval needed
 */
export function createArtworkApprovalAlert(
  bomId: string,
  bomName: string,
  artwork: Artwork
): ApprovalAlert {
  return {
    source: `artwork:pending:${bomId}:${artwork.id}`,
    severity: 'warning',
    title: `Artwork Print-Ready Approval Needed`,
    message: `${artwork.fileName} (Rev ${artwork.revision}) in ${bomName} awaiting print-ready approval`,
    affectedEntity: {
      type: 'artwork',
      id: artwork.id,
      name: artwork.fileName,
    },
    actionUrl: `/artwork?approve=${artwork.id}`,
  };
}

/**
 * Generate blocking alert when user attempts to build
 */
export function createBuildBlockedAlert(
  bom: BillOfMaterials,
  blockReason: BuildBlockReason
): ApprovalAlert {
  return {
    source: `build:blocked:${bom.id}`,
    severity: 'critical',
    title: `Cannot Build - Approvals Required`,
    message: `${bom.name} cannot be built: ${blockReason.reason}`,
    affectedEntity: {
      type: 'bom',
      id: bom.id,
      name: bom.name,
    },
  };
}

// ============================================================================
// CHANGE ANALYSIS FOR MULTI-COMPONENT DETECTION
// ============================================================================

export interface ChangeAnalysis {
  componentsChanged: number;
  componentsAdded: string[];
  componentsRemoved: string[];
  componentsModified: Array<{
    sku: string;
    oldQuantity: number;
    newQuantity: number;
  }>;
  artworkChanged: boolean;
  packagingChanged: boolean;
  requiresApproval: boolean; // true if >1 component changed
  changeCount: number;
}

/**
 * Analyze BOM changes to detect multi-component edits
 */
export function analyzeChanges(
  original: BillOfMaterials,
  edited: BillOfMaterials
): ChangeAnalysis {
  const originalSkus = new Map(original.components.map(c => [c.sku, c]));
  const editedSkus = new Map(edited.components.map(c => [c.sku, c]));
  
  const componentsAdded: string[] = [];
  const componentsRemoved: string[] = [];
  const componentsModified: ChangeAnalysis['componentsModified'] = [];
  
  // Find additions and modifications
  for (const [sku, component] of editedSkus) {
    const original = originalSkus.get(sku);
    if (!original) {
      componentsAdded.push(sku);
    } else if (original.quantity !== component.quantity) {
      componentsModified.push({
        sku,
        oldQuantity: original.quantity,
        newQuantity: component.quantity,
      });
    }
  }
  
  // Find removals
  for (const [sku] of originalSkus) {
    if (!editedSkus.has(sku)) {
      componentsRemoved.push(sku);
    }
  }
  
  const componentsChanged = componentsAdded.length + componentsRemoved.length + componentsModified.length;
  const artworkChanged = original.artwork.length !== edited.artwork.length;
  const packagingChanged = JSON.stringify(original.packaging) !== JSON.stringify(edited.packaging);
  const changeCount = componentsChanged + (artworkChanged ? 1 : 0) + (packagingChanged ? 1 : 0);
  
  // Require approval if:
  // - More than one component changed, OR
  // - Any component change + artwork change, OR
  // - Compliance-related change
  const requiresApproval = componentsChanged > 1 || 
    (componentsChanged > 0 && artworkChanged) ||
    (componentsChanged > 0 && packagingChanged);
  
  return {
    componentsChanged,
    componentsAdded,
    componentsRemoved,
    componentsModified,
    artworkChanged,
    packagingChanged,
    requiresApproval,
    changeCount,
  };
}
