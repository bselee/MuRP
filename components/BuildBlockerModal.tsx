import React from 'react';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';

interface BlockingRevision {
  revisionNumber: number;
  description: string;
  status: string;
  submittedAt: string;
}

interface MissingApproval {
  fileId: string;
  fileName: string;
  approvalType: string;
  requiredBy: string;
}

interface BuildBlockReason {
  blocked: boolean;
  reason: string;
  severity: 'error' | 'warning';
  blockingRevisions?: BlockingRevision[];
  missingApprovals?: MissingApproval[];
}

interface BuildBlockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockReason: BuildBlockReason | null;
  pendingBuildOrder: any;
  onViewApprovalFlow?: () => void;
}

export const BuildBlockerModal: React.FC<BuildBlockerModalProps> = ({
  isOpen,
  onClose,
  blockReason,
  pendingBuildOrder,
  onViewApprovalFlow,
}) => {
  if (!isOpen || !blockReason) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200 px-6 py-4 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Cannot Create Build Order
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {pendingBuildOrder?.sku || 'This product'} has pending approvals
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Main Reason */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-gray-800 font-medium">{blockReason.reason}</p>
          </div>

          {/* Blocking Revisions */}
          {blockReason.blockingRevisions && blockReason.blockingRevisions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
                  {blockReason.blockingRevisions.length}
                </span>
                Pending BOM Revision{blockReason.blockingRevisions.length !== 1 ? 's' : ''}
              </h3>
              <div className="space-y-2">
                {blockReason.blockingRevisions.map((rev, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          Revision #{rev.revisionNumber}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {rev.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Submitted {new Date(rev.submittedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                          {rev.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={onViewApprovalFlow}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                View Revision Approval
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Missing Artwork Approvals */}
          {blockReason.missingApprovals && blockReason.missingApprovals.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">
                  {blockReason.missingApprovals.length}
                </span>
                Artwork Not Print-Ready
              </h3>
              <div className="space-y-2">
                {blockReason.missingApprovals.map((approval, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {approval.fileName}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Approval Type: {approval.approvalType}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Required by: {approval.requiredBy}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded">
                          Pending
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  onViewApprovalFlow?.();
                  onClose();
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Review Artwork Approvals
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Build Order Details */}
          {pendingBuildOrder && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                Requested Build Order
              </h4>
              <div className="space-y-1 text-sm">
                <p className="text-gray-700">
                  <span className="font-medium">Product:</span> {pendingBuildOrder.name}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium">SKU:</span> {pendingBuildOrder.sku}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium">Quantity:</span> {pendingBuildOrder.quantity}
                </p>
                {pendingBuildOrder.scheduledDate && (
                  <p className="text-gray-700">
                    <span className="font-medium">Scheduled:</span>{' '}
                    {new Date(pendingBuildOrder.scheduledDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <strong>Next Steps:</strong> Please complete the pending approvals above, then you'll be able to create this build order.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3 justify-end sticky bottom-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => {
              onViewApprovalFlow?.();
              onClose();
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Approvals
          </button>
        </div>
      </div>
    </div>
  );
};

export default BuildBlockerModal;
