import React, { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import type { PurchaseOrder, Vendor, GmailConnection } from '../types';
import Modal from './Modal';
import { fetchPoEmailTimeline, type PoEmailTimelineEntry } from '../services/poEmailService';
import { getGoogleGmailService } from '../services/googleGmailService';
import { logPoEmailTracking } from '../hooks/useSupabaseMutations';
import { ArrowDownTrayIcon, MailIcon, RefreshCcwIcon } from './icons';

interface PoCommunicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder | null;
  vendor: Vendor | null;
  gmailConnection: GmailConnection;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const PoCommunicationModal: React.FC<PoCommunicationModalProps> = ({
  isOpen,
  onClose,
  purchaseOrder,
  vendor,
  gmailConnection,
  addToast,
}) => {
  const [timeline, setTimeline] = useState<PoEmailTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);

  const refreshTimeline = async () => {
    if (!purchaseOrder) return;
    setLoading(true);
    try {
      const data = await fetchPoEmailTimeline(purchaseOrder.id);
      setTimeline(data);
    } catch (error) {
      console.error('[PoCommunicationModal] failed to load timeline', error);
      addToast('Unable to load email timeline.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && purchaseOrder) {
      setReplySubject(`Re: ${purchaseOrder.orderId || purchaseOrder.id}`);
      setReplyBody('');
      refreshTimeline();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, purchaseOrder?.id]);

  const handleSendReply = async () => {
    if (!purchaseOrder || !vendor) return;
    if (!gmailConnection.isConnected) {
      addToast('Connect Gmail in Settings to send replies.', 'error');
      return;
    }
    if (!replyBody.trim()) {
      addToast('Reply body cannot be empty.', 'error');
      return;
    }

    const gmailService = getGoogleGmailService();
    const threadId = timeline.find(entry => entry.gmailThreadId)?.gmailThreadId ?? undefined;
    const to = vendor.contactEmails?.[0] || vendor.email || '';

    setSending(true);
    try {
      const sendResult = await gmailService.sendEmail({
        to,
        subject: replySubject,
        body: replyBody,
        from: gmailConnection.email ?? undefined,
        threadId,
      });

      await logPoEmailTracking(purchaseOrder.id, {
        gmailMessageId: sendResult.id,
        gmailThreadId: sendResult.threadId,
        vendorEmail: to,
        metadata: {
          subject: replySubject,
          bodyPreview: replyBody.slice(0, 280),
          via: 'reply_modal',
        },
      });

      setReplyBody('');
      addToast('Reply sent successfully.', 'success');
      await refreshTimeline();
    } catch (error) {
      console.error('[PoCommunicationModal] failed to send reply', error);
      addToast('Failed to send reply via Gmail.', 'error');
    } finally {
      setSending(false);
    }
  };

  const renderEntry = (entry: PoEmailTimelineEntry) => {
    const metadata = entry.metadata || {};
    const subject = metadata.subject || 'Purchase Order Update';
    const preview = metadata.bodyPreview || metadata.notes || 'No preview available.';
    const labelIds: string[] = metadata.labelIds || [];
    const sentAt = entry.sentAt ? new Date(entry.sentAt).toLocaleString() : null;
    const repliedAt = entry.lastReplyAt ? new Date(entry.lastReplyAt).toLocaleString() : null;

    return (
      <div key={entry.id} className="p-4 bg-gray-800/60 border border-gray-700 rounded-lg space-y-2">
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span className="font-semibold text-white">{subject}</span>
          {sentAt && <span>{sentAt}</span>}
        </div>
        <p className="text-sm text-gray-300 whitespace-pre-line">{preview}</p>
        <div className="flex flex-wrap gap-2 text-xs text-gray-400">
          {labelIds.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-600 bg-gray-700/50">
              Labels: {labelIds.join(', ')}
            </span>
          )}
          {entry.vendorEmail && <span>To: {entry.vendorEmail}</span>}
          {entry.gmailMessageId && (
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${entry.gmailMessageId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-100"
            >
              <MailIcon className="w-4 h-4" /> Open in Gmail
            </a>
          )}
          {repliedAt && (
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <ArrowDownTrayIcon className="w-4 h-4" /> Reply received {repliedAt}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Vendor Thread${purchaseOrder ? ` · ${purchaseOrder.orderId || purchaseOrder.id}` : ''}`}
    >
      {purchaseOrder && vendor ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Vendor</p>
              <p className="text-lg font-semibold text-white">{vendor.name}</p>
            </div>
            <Button
              onClick={refreshTimeline}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-gray-600 text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            >
              <RefreshCcwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {loading ? (
              <p className="text-sm text-gray-400">Loading timeline…</p>
            ) : timeline.length === 0 ? (
              <div className="text-sm text-gray-400 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg p-6">
                No email history logged for this PO yet. When you send POs or replies through Gmail, we’ll keep the thread here.
              </div>
            ) : (
              timeline.map(renderEntry)
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Reply via Gmail</p>
            <input
              type="text"
              value={replySubject}
              onChange={(e) => setReplySubject(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="Subject"
            />
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={5}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="Type your reply…"
            />
            <Button
              onClick={handleSendReply}
              disabled={sending || !replyBody.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              <MailIcon className="w-5 h-5" />
              {sending ? 'Sending…' : 'Send Reply'}
            </Button>
            {!gmailConnection.isConnected && (
              <p className="text-xs text-yellow-300">
                Gmail isn’t connected. Connect in Settings to send replies from MuRP.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400">Select a purchase order to view the thread.</p>
      )}
    </Modal>
  );
};

export default PoCommunicationModal;
