import Button from '@/components/ui/Button';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🤖 VENDOR AUTOMATION SETTINGS MODAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Configure vendor-specific purchase order automation.
 *
 * Settings:
 * - Auto-PO enabled (on/off)
 * - Urgency threshold (critical, high, normal, low)
 * - Auto-send email (future feature)
 * - Recurring vendor flag
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import Modal from './Modal';
import type { Vendor } from '../types';

interface VendorAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor | null;
  onSave?: () => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const VendorAutomationModal: React.FC<VendorAutomationModalProps> = ({
  isOpen,
  onClose,
  vendor,
  onSave,
  addToast
}) => {
  const [autoPoEnabled, setAutoPoEnabled] = useState(false);
  const [autoPoThreshold, setAutoPoThreshold] = useState<'critical' | 'high' | 'normal' | 'low'>('critical');
  const [autoSendEmail, setAutoSendEmail] = useState(false);
  const [isRecurringVendor, setIsRecurringVendor] = useState(false);
  const [automationNotes, setAutomationNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load current settings when vendor changes
  useEffect(() => {
    if (!vendor || !isOpen) return;

    const loadSettings = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('vendors')
          .select('auto_po_enabled, auto_po_threshold, auto_send_email, is_recurring_vendor, automation_notes')
          .eq('id', vendor.id)
          .single();

        if (error) throw error;

        if (data) {
          setAutoPoEnabled(data.auto_po_enabled || false);
          setAutoPoThreshold(data.auto_po_threshold || 'critical');
          setAutoSendEmail(data.auto_send_email || false);
          setIsRecurringVendor(data.is_recurring_vendor || false);
          setAutomationNotes(data.automation_notes || '');
        }
      } catch (error) {
        console.error('Error loading automation settings:', error);
        addToast?.('Failed to load automation settings', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [vendor, isOpen, addToast]);

  const handleSave = async () => {
    if (!vendor) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          auto_po_enabled: autoPoEnabled,
          auto_po_threshold: autoPoThreshold,
          auto_send_email: autoSendEmail,
          is_recurring_vendor: isRecurringVendor,
          automation_notes: automationNotes,
        })
        .eq('id', vendor.id);

      if (error) throw error;

      addToast?.('Automation settings saved successfully', 'success');
      onSave?.();
      onClose();
    } catch (error) {
      console.error('Error saving automation settings:', error);
      addToast?.('Failed to save automation settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!vendor) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Auto-PO Settings: ${vendor.name}`}>
      {loading ? (
        <div className="py-8 text-center text-gray-400">Loading settings...</div>
      ) : (
        <div className="space-y-6">
          {/* Main Toggle */}
          <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <h3 className="text-lg font-semibold text-white">Enable Auto-PO Draft Creation</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Automatically create draft purchase orders for this vendor based on reorder queue
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoPoEnabled}
                onChange={(e) => setAutoPoEnabled(e.target.checked)}
                className="w-6 h-6 rounded text-accent-500 focus:ring-accent-500 focus:ring-offset-gray-900"
              />
            </label>
          </div>

          {/* Settings (only show if enabled) */}
          {autoPoEnabled && (
            <>
              {/* Urgency Threshold */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Urgency Threshold
                </label>
                <p className="text-xs text-gray-400 mb-3">
                  Only auto-create POs for items at or above this urgency level
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(['critical', 'high', 'normal', 'low'] as const).map((level) => (
                    <Button
                      key={level}
                      onClick={() => setAutoPoThreshold(level)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        autoPoThreshold === level
                          ? 'border-accent-500 bg-accent-500/20 text-white'
                          : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="text-sm font-semibold capitalize">{level}</div>
                      <div className="text-xs mt-1">
                        {level === 'critical' && '🔴 Only critical items'}
                        {level === 'high' && '🟠 High + critical'}
                        {level === 'normal' && '🔵 Normal + high + critical'}
                        {level === 'low' && '⚪ All items'}
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Additional Options */}
              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:bg-gray-800">
                  <div>
                    <div className="text-sm font-medium text-white">Auto-send via Email</div>
                    <div className="text-xs text-gray-400">
                      Automatically send PO to vendor (requires Gmail setup)
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSendEmail}
                    onChange={(e) => setAutoSendEmail(e.target.checked)}
                    disabled
                    className="w-5 h-5 rounded text-accent-500 focus:ring-accent-500"
                    title="Coming soon - requires email integration"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:bg-gray-800">
                  <div>
                    <div className="text-sm font-medium text-white">Recurring Vendor</div>
                    <div className="text-xs text-gray-400">
                      Orders to this vendor follow predictable patterns
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isRecurringVendor}
                    onChange={(e) => setIsRecurringVendor(e.target.checked)}
                    className="w-5 h-5 rounded text-accent-500 focus:ring-accent-500"
                  />
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Automation Notes (Optional)
                </label>
                <textarea
                  value={automationNotes}
                  onChange={(e) => setAutomationNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g., 'Contact John before sending large orders' or 'Only auto-order during growing season'"
                  className="w-full bg-gray-700 border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-accent-500 focus:border-accent-500 p-3 text-sm"
                />
              </div>
            </>
          )}

          {/* Info Box */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-300 mb-2">How Auto-PO Works</h4>
            <ul className="text-xs text-blue-200 space-y-1">
              <li>• Daily scan identifies items below reorder point</li>
              <li>• System creates <strong>draft</strong> POs for items meeting urgency threshold</li>
              <li>• You review and approve/discard drafts before sending to vendor</li>
              <li>• All auto-POs are clearly labeled for easy identification</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <Button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default VendorAutomationModal;
