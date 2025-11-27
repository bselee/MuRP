/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📬 VENDOR RESPONSE WORKBENCH - Intelligent Response Management UI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Inbox-style interface for triaging vendor communications, reviewing AI insights,
 * editing draft responses, and managing the approval workflow.
 *
 * Features:
 * - Queue list with category badges and urgency indicators
 * - Detail pane with AI-extracted insights
 * - Draft response editor with template suggestions
 * - Approve/Edit/Dismiss/Escalate actions
 *
 * @module components/VendorResponseWorkbench
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Button from '@/components/ui/Button';
import {
  getResponseQueue,
  getCommunicationDetails,
  generateDraftReply,
  updateDraft,
  approveDraft,
  discardDraft,
  dismissCommunication,
  markActionTaken,
  type VendorCommunicationQueueItem,
  type VendorResponseDraft,
  type VendorResponseCategory,
  type VendorSuggestedAction,
} from '../services/vendorResponseService';
import {
  InboxIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  XMarkIcon,
  ArrowPathIcon,
  SparklesIcon,
  CurrencyDollarIcon,
  TruckIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
} from './icons';

interface VendorResponseWorkbenchProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onSendEmail?: (to: string, subject: string, body: string, threadId?: string) => Promise<{ success: boolean; messageId?: string }>;
}

// Category display configuration
const CATEGORY_CONFIG: Record<VendorResponseCategory, { label: string; icon: React.ReactNode; color: string }> = {
  shipment_confirmation: { label: 'Shipped', icon: <TruckIcon className="w-4 h-4" />, color: 'bg-blue-500/20 text-blue-300' },
  delivery_update: { label: 'In Transit', icon: <TruckIcon className="w-4 h-4" />, color: 'bg-blue-500/20 text-blue-300' },
  delivery_exception: { label: 'Exception', icon: <ExclamationTriangleIcon className="w-4 h-4" />, color: 'bg-red-500/20 text-red-300' },
  price_change: { label: 'Pricing', icon: <CurrencyDollarIcon className="w-4 h-4" />, color: 'bg-amber-500/20 text-amber-300' },
  out_of_stock: { label: 'Out of Stock', icon: <ExclamationTriangleIcon className="w-4 h-4" />, color: 'bg-orange-500/20 text-orange-300' },
  substitution_offer: { label: 'Substitution', icon: <ArrowPathIcon className="w-4 h-4" />, color: 'bg-purple-500/20 text-purple-300' },
  invoice_attached: { label: 'Invoice', icon: <DocumentTextIcon className="w-4 h-4" />, color: 'bg-emerald-500/20 text-emerald-300' },
  order_confirmation: { label: 'Confirmed', icon: <CheckCircleIcon className="w-4 h-4" />, color: 'bg-emerald-500/20 text-emerald-300' },
  lead_time_update: { label: 'Lead Time', icon: <ClockIcon className="w-4 h-4" />, color: 'bg-yellow-500/20 text-yellow-300' },
  general_inquiry: { label: 'Inquiry', icon: <QuestionMarkCircleIcon className="w-4 h-4" />, color: 'bg-gray-500/20 text-gray-300' },
  thank_you: { label: 'Thank You', icon: <CheckCircleIcon className="w-4 h-4" />, color: 'bg-gray-500/20 text-gray-300' },
  other: { label: 'Other', icon: <InboxIcon className="w-4 h-4" />, color: 'bg-gray-500/20 text-gray-300' },
};

// Suggested action labels
const ACTION_LABELS: Record<VendorSuggestedAction, string> = {
  acknowledge_receipt: 'Acknowledge Receipt',
  confirm_acceptance: 'Confirm Acceptance',
  request_clarification: 'Request Clarification',
  approve_pricing: 'Approve Pricing',
  reject_pricing: 'Reject Pricing',
  update_inventory: 'Update Inventory',
  escalate_to_manager: 'Escalate to Manager',
  forward_to_ap: 'Forward to AP',
  update_po_tracking: 'Update Tracking',
  create_backorder: 'Create Backorder',
  no_action_required: 'No Action Needed',
  review_required: 'Review Required',
};

const VendorResponseWorkbench: React.FC<VendorResponseWorkbenchProps> = ({
  addToast,
  onSendEmail,
}) => {
  // State
  const [queue, setQueue] = useState<VendorCommunicationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<{
    communication: VendorCommunicationQueueItem;
    draft?: VendorResponseDraft;
    poDetails?: any;
    relatedCommunications?: any[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [editedBody, setEditedBody] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Load queue
  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getResponseQueue();
      setQueue(data);
    } catch (error) {
      console.error('[VendorResponseWorkbench] Error loading queue:', error);
      addToast?.('Failed to load response queue', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Load details when selecting an item
  const handleSelectItem = useCallback(async (item: VendorCommunicationQueueItem) => {
    setSelectedId(item.id);
    setLoadingDetails(true);
    setIsEditing(false);

    try {
      const details = await getCommunicationDetails(item.id);
      setSelectedDetails(details);

      if (details?.draft) {
        setEditedSubject(details.draft.subject);
        setEditedBody(details.draft.body + (details.draft.signature ? `\n\n${details.draft.signature}` : ''));
      } else {
        setEditedSubject('');
        setEditedBody('');
      }
    } catch (error) {
      console.error('[VendorResponseWorkbench] Error loading details:', error);
      addToast?.('Failed to load communication details', 'error');
    } finally {
      setLoadingDetails(false);
    }
  }, [addToast]);

  // Generate draft
  const handleGenerateDraft = useCallback(async () => {
    if (!selectedId) return;

    setGeneratingDraft(true);
    try {
      const draft = await generateDraftReply(selectedId);
      if (draft) {
        setSelectedDetails((prev) =>
          prev ? { ...prev, draft } : null
        );
        setEditedSubject(draft.subject);
        setEditedBody(draft.body + (draft.signature ? `\n\n${draft.signature}` : ''));
        addToast?.('Draft generated successfully', 'success');
      } else {
        addToast?.('Failed to generate draft', 'error');
      }
    } catch (error) {
      console.error('[VendorResponseWorkbench] Error generating draft:', error);
      addToast?.('Failed to generate draft', 'error');
    } finally {
      setGeneratingDraft(false);
    }
  }, [selectedId, addToast]);

  // Save edits
  const handleSaveEdits = useCallback(async () => {
    if (!selectedDetails?.draft) return;

    try {
      const updated = await updateDraft(selectedDetails.draft.id, {
        subject: editedSubject,
        body: editedBody,
      });

      if (updated) {
        setSelectedDetails((prev) =>
          prev ? { ...prev, draft: updated } : null
        );
        setIsEditing(false);
        addToast?.('Draft saved', 'success');
      }
    } catch (error) {
      console.error('[VendorResponseWorkbench] Error saving draft:', error);
      addToast?.('Failed to save draft', 'error');
    }
  }, [selectedDetails?.draft, editedSubject, editedBody, addToast]);

  // Send response
  const handleSendResponse = useCallback(async () => {
    if (!selectedDetails?.draft || !selectedDetails?.communication || !onSendEmail) return;

    setSending(true);
    try {
      // Approve draft first
      await approveDraft(selectedDetails.draft.id);

      // Send email
      const result = await onSendEmail(
        selectedDetails.communication.vendorEmail || '',
        editedSubject,
        editedBody,
        selectedDetails.communication.gmailThreadId
      );

      if (result.success) {
        // Mark as sent - moved to vendorResponseService
        addToast?.('Response sent successfully', 'success');
        setSelectedId(null);
        setSelectedDetails(null);
        loadQueue();
      } else {
        addToast?.('Failed to send response', 'error');
      }
    } catch (error) {
      console.error('[VendorResponseWorkbench] Error sending response:', error);
      addToast?.('Failed to send response', 'error');
    } finally {
      setSending(false);
    }
  }, [selectedDetails, editedSubject, editedBody, onSendEmail, addToast, loadQueue]);

  // Dismiss
  const handleDismiss = useCallback(async (reason: string) => {
    if (!selectedId) return;

    try {
      await dismissCommunication(selectedId, reason);
      addToast?.('Communication dismissed', 'success');
      setSelectedId(null);
      setSelectedDetails(null);
      loadQueue();
    } catch (error) {
      console.error('[VendorResponseWorkbench] Error dismissing:', error);
      addToast?.('Failed to dismiss', 'error');
    }
  }, [selectedId, addToast, loadQueue]);

  // Mark action taken
  const handleMarkComplete = useCallback(async (actionType: string) => {
    if (!selectedId) return;

    try {
      await markActionTaken(selectedId, actionType);
      addToast?.('Marked as complete', 'success');
      setSelectedId(null);
      setSelectedDetails(null);
      loadQueue();
    } catch (error) {
      console.error('[VendorResponseWorkbench] Error marking complete:', error);
      addToast?.('Failed to mark complete', 'error');
    }
  }, [selectedId, addToast, loadQueue]);

  // Format date
  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Render category badge
  const renderCategoryBadge = (category?: VendorResponseCategory) => {
    const config = category ? CATEGORY_CONFIG[category] : CATEGORY_CONFIG.other;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.icon}
        {config.label}
      </span>
    );
  };

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[500px] bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
      {/* Queue List */}
      <div className="w-1/3 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Response Queue</h2>
            <p className="text-xs text-gray-400">{queue.length} pending</p>
          </div>
          <Button
            onClick={loadQueue}
            disabled={loading}
            className="p-2 hover:bg-gray-700 rounded-lg"
          >
            <ArrowPathIcon className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <ArrowPathIcon className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          ) : queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <InboxIcon className="w-8 h-8 mb-2" />
              <p>All caught up!</p>
            </div>
          ) : (
            queue.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelectItem(item)}
                className={`w-full text-left p-4 border-b border-gray-800 hover:bg-gray-800/50 transition-colors ${
                  selectedId === item.id ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate flex-1">
                    {item.vendorName}
                  </span>
                  {renderCategoryBadge(item.responseCategory)}
                </div>
                <p className="text-xs text-gray-400 truncate mb-1">{item.subject || 'No subject'}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{item.poNumber}</span>
                  <span className="text-gray-500">{formatDate(item.receivedAt)}</span>
                </div>
                {item.hasDraft && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-emerald-400">
                    <PencilSquareIcon className="w-3 h-3" />
                    Draft ready
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail Pane */}
      <div className="flex-1 flex flex-col">
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <InboxIcon className="w-12 h-12 mb-4" />
            <p>Select a communication to view details</p>
          </div>
        ) : loadingDetails ? (
          <div className="flex-1 flex items-center justify-center">
            <ArrowPathIcon className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        ) : selectedDetails ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {selectedDetails.communication.vendorName}
                  </h3>
                  <p className="text-sm text-gray-400">{selectedDetails.communication.subject}</p>
                </div>
                <div className="flex items-center gap-2">
                  {renderCategoryBadge(selectedDetails.communication.responseCategory)}
                  <a
                    href={`/purchase-orders?po=${selectedDetails.communication.poId}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    {selectedDetails.communication.poNumber}
                    <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* AI Insights */}
              {selectedDetails.communication.suggestedAction && (
                <div className="bg-gray-800/50 rounded-lg p-3 mt-3">
                  <div className="flex items-start gap-2">
                    <SparklesIcon className="w-4 h-4 text-purple-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-purple-300">
                        AI Recommendation: {ACTION_LABELS[selectedDetails.communication.suggestedAction]}
                      </p>
                      {selectedDetails.communication.actionReasoning && (
                        <p className="text-xs text-gray-400 mt-1">
                          {selectedDetails.communication.actionReasoning}
                        </p>
                      )}
                      {selectedDetails.communication.aiConfidence && (
                        <p className="text-xs text-gray-500 mt-1">
                          Confidence: {(selectedDetails.communication.aiConfidence * 100).toFixed(0)}%
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Extracted Data Summary */}
              {selectedDetails.communication.extractedData && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {(selectedDetails.communication.extractedData as any).trackingNumber && (
                    <div className="bg-blue-500/10 rounded px-2 py-1">
                      <span className="text-gray-400">Tracking:</span>{' '}
                      <span className="text-blue-300">{(selectedDetails.communication.extractedData as any).trackingNumber}</span>
                    </div>
                  )}
                  {(selectedDetails.communication.extractedData as any).carrier && (
                    <div className="bg-blue-500/10 rounded px-2 py-1">
                      <span className="text-gray-400">Carrier:</span>{' '}
                      <span className="text-blue-300">{(selectedDetails.communication.extractedData as any).carrier}</span>
                    </div>
                  )}
                  {(selectedDetails.communication.extractedData as any).expectedDelivery && (
                    <div className="bg-emerald-500/10 rounded px-2 py-1">
                      <span className="text-gray-400">ETA:</span>{' '}
                      <span className="text-emerald-300">{(selectedDetails.communication.extractedData as any).expectedDelivery}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Original Email Preview */}
            <div className="p-4 border-b border-gray-700 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 mb-1">Original Message</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">
                {selectedDetails.communication.bodyPreview || 'No preview available'}
              </p>
            </div>

            {/* Draft Editor */}
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-300">
                  {selectedDetails.draft ? 'Draft Response' : 'Response'}
                </p>
                {!selectedDetails.draft && (
                  <Button
                    onClick={handleGenerateDraft}
                    disabled={generatingDraft}
                    className="text-xs bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 px-3 py-1 rounded-lg flex items-center gap-1"
                  >
                    <SparklesIcon className={`w-3 h-3 ${generatingDraft ? 'animate-pulse' : ''}`} />
                    {generatingDraft ? 'Generating...' : 'Generate Draft'}
                  </Button>
                )}
              </div>

              {(selectedDetails.draft || isEditing) && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Subject</label>
                    <input
                      type="text"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      disabled={!isEditing}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Body</label>
                    <textarea
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      disabled={!isEditing}
                      rows={8}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60 font-mono"
                    />
                  </div>

                  {selectedDetails.draft?.aiGenerated && !selectedDetails.draft?.userEdited && (
                    <p className="text-xs text-purple-400 flex items-center gap-1">
                      <SparklesIcon className="w-3 h-3" />
                      AI-generated draft • Review before sending
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-700 flex items-center gap-2">
              {selectedDetails.draft && !isEditing ? (
                <>
                  <Button
                    onClick={handleSendResponse}
                    disabled={sending || !onSendEmail}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg flex items-center justify-center gap-2"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                    {sending ? 'Sending...' : 'Send Response'}
                  </Button>
                  <Button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                  </Button>
                </>
              ) : isEditing ? (
                <>
                  <Button
                    onClick={handleSaveEdits}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg"
                  >
                    Save Changes
                  </Button>
                  <Button
                    onClick={() => {
                      setIsEditing(false);
                      if (selectedDetails?.draft) {
                        setEditedSubject(selectedDetails.draft.subject);
                        setEditedBody(selectedDetails.draft.body + (selectedDetails.draft.signature ? `\n\n${selectedDetails.draft.signature}` : ''));
                      }
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleGenerateDraft}
                    disabled={generatingDraft}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg flex items-center justify-center gap-2"
                  >
                    <SparklesIcon className="w-4 h-4" />
                    {generatingDraft ? 'Generating...' : 'Generate Response'}
                  </Button>
                </>
              )}

              <Button
                onClick={() => handleMarkComplete('no_response_needed')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
                title="Mark as complete without responding"
              >
                <CheckCircleIcon className="w-4 h-4" />
              </Button>

              <Button
                onClick={() => handleDismiss('Not relevant')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
                title="Dismiss"
              >
                <XMarkIcon className="w-4 h-4" />
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default VendorResponseWorkbench;
