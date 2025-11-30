import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from './Modal';

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: { id: string; name?: string; email?: string };
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  defaultCategory?: string;
}

const ticketStorageKey = 'murp::supportTickets';

interface TicketFormState {
  category: string;
  urgency: 'low' | 'normal' | 'high';
  message: string;
}

export const SupportTicketModal: React.FC<SupportTicketModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  addToast,
  defaultCategory = 'access_request',
}) => {
  const [form, setForm] = useState<TicketFormState>({
    category: defaultCategory,
    urgency: 'normal',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!form.message.trim()) {
      addToast('Please add a short note before sending.', 'error');
      return;
    }

    setIsSubmitting(true);
    const ticket = {
      id: `ticket-${Date.now()}`,
      createdAt: new Date().toISOString(),
      requester: currentUser?.name || currentUser?.email || 'Unknown user',
      requesterEmail: currentUser?.email ?? 'unknown',
      ...form,
    };

    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(ticketStorageKey) : null;
      const parsed = stored ? JSON.parse(stored) as typeof ticket[] : [];
      parsed.unshift(ticket);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ticketStorageKey, JSON.stringify(parsed.slice(0, 50)));
      }
      addToast('Request sent to leadership. We will loop you in via email.', 'success');
      setForm({ category: defaultCategory, urgency: 'normal', message: '' });
      onClose();
    } catch (error) {
      console.error('[SupportTicketModal] Failed to store ticket:', error);
      addToast('Unable to save your request locally. Please ping Ops manually.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Contact Ops / Upper Management">
      <div className="space-y-4">
        <p className="text-sm text-gray-300">
          Need a new folder, DAM tier, or BOM edit privileges? Drop a quick note and Ops will receive a service ticket with your request.
        </p>
        <div>
          <label className="text-xs uppercase tracking-wide text-gray-400">Request Type</label>
          <select
            value={form.category}
            onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
            className="mt-1 w-full bg-gray-900/60 border border-gray-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-accent-400"
          >
            <option value="access_request">Folder / DAM Access</option>
            <option value="tier_upgrade">Need DAM Upgrade</option>
            <option value="bom_edit">BOM Edit Permissions</option>
            <option value="support">General Support Ticket</option>
          </select>
        </div>
        <div className="flex gap-3">
          {(['low', 'normal', 'high'] as const).map(level => (
            <button
              key={level}
              type="button"
              onClick={() => setForm(prev => ({ ...prev, urgency: level }))}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                form.urgency === level ? 'bg-accent-500 text-white border-accent-500' : 'border-gray-700 text-gray-300'
              }`}
            >
              {level === 'high' ? 'Urgent' : level === 'normal' ? 'Standard' : 'Chill'}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-gray-400">Details</label>
          <textarea
            value={form.message}
            onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
            rows={4}
            placeholder="Example: Need access to the Compost folder & BOM edits before Friday."
            className="mt-1 w-full bg-gray-900/60 border border-gray-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-accent-400"
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isSubmitting}>
            Send Ticket
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default SupportTicketModal;
