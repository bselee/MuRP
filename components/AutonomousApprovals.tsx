import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { autonomousPOService } from '../services/autonomousPOService';
import { CheckCircleIcon, XCircleIcon, ClockIcon, EyeIcon, TruckIcon, CurrencyDollarIcon } from './icons';

interface ApprovalRequest {
  id: string;
  po_id: string;
  update_type: 'shipping' | 'pricing';
  changes: any;
  source: string;
  confidence: number;
  status: string;
  requested_at: string;
  purchase_orders?: {
    id: string;
    order_id: string;
    vendor_name: string;
  };
}

interface AutonomousApprovalsProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AutonomousApprovals: React.FC<AutonomousApprovalsProps> = ({ addToast }) => {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadApprovals = async () => {
    try {
      setLoading(true);
      const data = await autonomousPOService.getPendingApprovals();
      setApprovals(data);
    } catch (error) {
      console.error('Failed to load approvals:', error);
      addToast('Failed to load approval requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approvalId: string, approved: boolean, notes?: string) => {
    setProcessing(approvalId);
    try {
      await autonomousPOService.processApproval(approvalId, approved, 'current_user', notes);

      addToast(
        approved ? 'Autonomous update approved and applied' : 'Autonomous update rejected',
        approved ? 'success' : 'info'
      );

      // Refresh the list
      await loadApprovals();
    } catch (error) {
      console.error('Failed to process approval:', error);
      addToast('Failed to process approval', 'error');
    } finally {
      setProcessing(null);
    }
  };

  const formatChanges = (approval: ApprovalRequest) => {
    if (approval.update_type === 'shipping') {
      const changes = approval.changes;
      return (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <TruckIcon className="w-4 h-4 text-blue-400" />
            <span>Status: <span className="font-medium">{changes.trackingStatus}</span></span>
          </div>
          {changes.carrier && <div>Carrier: {changes.carrier}</div>}
          {changes.trackingNumber && <div>Tracking: {changes.trackingNumber}</div>}
          {changes.estimatedDelivery && (
            <div>ETA: {new Date(changes.estimatedDelivery).toLocaleDateString()}</div>
          )}
        </div>
      );
    } else if (approval.update_type === 'pricing') {
      const changes = approval.changes;
      return (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <CurrencyDollarIcon className="w-4 h-4 text-green-400" />
            <span>Total Change: <span className="font-medium">${changes.totalPriceChange?.toFixed(2)}</span></span>
          </div>
          <div className="text-xs text-gray-400">
            {changes.itemPriceUpdates?.length} item(s) affected
          </div>
        </div>
      );
    }
    return <div className="text-sm text-gray-400">Unknown change type</div>;
  };

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-3">
          <ClockIcon className="w-5 h-5 animate-spin text-accent-400" />
          <p className="text-gray-400">Loading approval requests...</p>
        </div>
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-3">
          <CheckCircleIcon className="w-5 h-5 text-green-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">No Pending Approvals</h3>
            <p className="text-sm text-gray-400">All autonomous updates are being processed automatically.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <EyeIcon className="w-5 h-5 text-accent-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Autonomous Update Approvals</h2>
            <p className="text-sm text-gray-400">{approvals.length} request{approvals.length === 1 ? '' : 's'} pending</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-700">
        {approvals.map((approval) => (
          <div key={approval.id} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-white">
                    PO #{approval.purchase_orders?.order_id || approval.po_id}
                  </h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    approval.update_type === 'shipping'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-green-500/20 text-green-300 border border-green-500/30'
                  }`}>
                    {approval.update_type === 'shipping' ? 'Shipping' : 'Pricing'}
                  </span>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                    {Math.round(approval.confidence * 100)}% confidence
                  </span>
                </div>

                <div className="text-sm text-gray-400">
                  {approval.purchase_orders?.vendor_name && (
                    <span>Vendor: {approval.purchase_orders.vendor_name} • </span>
                  )}
                  Requested {new Date(approval.requested_at).toLocaleString()} •
                  Source: {approval.source}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleApproval(approval.id, true)}
                  disabled={processing === approval.id}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-md disabled:opacity-50"
                >
                  {processing === approval.id ? (
                    <ClockIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircleIcon className="w-4 h-4" />
                  )}
                  Approve
                </Button>
                <Button
                  onClick={() => handleApproval(approval.id, false)}
                  disabled={processing === approval.id}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-md disabled:opacity-50"
                >
                  <XCircleIcon className="w-4 h-4" />
                  Reject
                </Button>
              </div>
            </div>

            <div className="bg-gray-900/40 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Proposed Changes</h4>
              {formatChanges(approval)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AutonomousApprovals;