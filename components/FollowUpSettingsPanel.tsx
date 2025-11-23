import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import Button from '@/components/ui/Button';
import type { FollowUpRule } from '../types';
import { BotIcon, SaveIcon, TrashIcon, PlusCircleIcon } from './icons';

interface FollowUpSettingsPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const defaultSubject = 'Quick check-in on PO #{{po_number}}';
const defaultBody = `Hi {{vendor_name}},

We sent Purchase Order #{{po_number}} on {{order_date}} for {{item_count}} line items totaling {{total_amount}}.

We still need confirmation and tracking so our production schedule stays on track.`;
const defaultInstructions =
  'Please reply directly to this thread with the carrier and tracking number as soon as it is available. This keeps everything linked in our system.';

const FollowUpSettingsPanel: React.FC<FollowUpSettingsPanelProps> = ({ addToast }) => {
  const [rules, setRules] = useState<FollowUpRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.stage - b.stage),
    [rules]
  );

  const loadRules = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('po_followup_rules')
        .select('*')
        .order('stage', { ascending: true });
      if (error) throw error;
      setRules(
        (data || []).map(rule => ({
          id: rule.id,
          stage: rule.stage,
          waitHours: rule.wait_hours,
          subjectTemplate: rule.subject_template,
          bodyTemplate: rule.body_template,
          instructions: rule.instructions,
          active: rule.active,
          updatedAt: rule.updated_at,
        }))
      );
    } catch (error) {
      console.error('[FollowUpSettingsPanel] load error', error);
      addToast?.('Failed to load follow-up rules', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleFieldChange = (id: string, field: keyof FollowUpRule, value: any) => {
    setRules(prev => prev.map(rule => (rule.id === id ? { ...rule, [field]: value } : rule)));
  };

  const handleSaveRule = async (rule: FollowUpRule) => {
    try {
      setSavingId(rule.id);
      const { error } = await supabase
        .from('po_followup_rules')
        .update({
          stage: rule.stage,
          wait_hours: rule.waitHours,
          subject_template: rule.subjectTemplate,
          body_template: rule.bodyTemplate,
          instructions: rule.instructions,
          active: rule.active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rule.id);
      if (error) throw error;
      addToast?.(`Follow-up stage ${rule.stage} saved`, 'success');
      loadRules();
    } catch (error) {
      console.error('[FollowUpSettingsPanel] save error', error);
      addToast?.('Failed to save follow-up rule', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateRule = async () => {
    try {
      setCreating(true);
      const nextStage = rules.length ? Math.max(...rules.map(r => r.stage)) + 1 : 1;
      const { error } = await supabase.from('po_followup_rules').insert({
        stage: nextStage,
        wait_hours: 72,
        subject_template: defaultSubject,
        body_template: defaultBody,
        instructions: defaultInstructions,
        active: true,
      });
      if (error) throw error;
      addToast?.('Follow-up stage added', 'success');
      loadRules();
    } catch (error) {
      console.error('[FollowUpSettingsPanel] create error', error);
      addToast?.('Failed to add follow-up stage', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Remove this follow-up stage?')) return;
    try {
      const { error } = await supabase.from('po_followup_rules').delete().eq('id', id);
      if (error) throw error;
      addToast?.('Follow-up stage removed', 'success');
      setRules(prev => prev.filter(rule => rule.id !== id));
    } catch (error) {
      console.error('[FollowUpSettingsPanel] delete error', error);
      addToast?.('Failed to delete stage', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-gray-300">
          Define the cadence for automatic “We still need tracking” reminders. Each stage waits a set number of hours after the last email (or original send) before nudging the vendor in the same Gmail thread.
        </p>
        <Button
          onClick={handleCreateRule}
          disabled={creating}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md bg-indigo-600/80 hover:bg-indigo-500 text-white max-w-fit disabled:opacity-60"
        >
          <PlusCircleIcon className="w-4 h-4" />
          Add Stage
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading follow-up rules…</p>
      ) : sortedRules.length === 0 ? (
        <div className="border border-dashed border-gray-600 rounded-lg p-6 text-sm text-gray-400">
          No follow-up stages configured. Add one to start nudging vendors automatically.
        </div>
      ) : (
        <div className="space-y-4">
          {sortedRules.map(rule => (
            <div key={rule.id} className="border border-gray-700 rounded-lg bg-gray-900/60 p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Stage</label>
                  <input
                    type="number"
                    min={1}
                    value={rule.stage}
                    onChange={(e) => handleFieldChange(rule.id, 'stage', parseInt(e.target.value, 10) || 1)}
                    className="w-20 bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Wait (hours)
                  </label>
                  <input
                    type="number"
                    min={12}
                    value={rule.waitHours}
                    onChange={(e) => handleFieldChange(rule.id, 'waitHours', parseInt(e.target.value, 10) || 1)}
                    className="w-24 bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-200 mt-5 sm:mt-6">
                  <input
                    type="checkbox"
                    checked={rule.active}
                    onChange={(e) => handleFieldChange(rule.id, 'active', e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                  />
                  Active
                </label>
                <div className="flex-1" />
                <Button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="text-sm text-red-300 hover:text-red-100 flex items-center gap-1"
                >
                  <TrashIcon className="w-4 h-4" />
                  Remove
                </Button>
                <Button
                  onClick={() => handleSaveRule(rule)}
                  disabled={savingId === rule.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60"
                >
                  <SaveIcon className="w-4 h-4" />
                  {savingId === rule.id ? 'Saving…' : 'Save'}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Subject
                  </label>
                  <input
                    value={rule.subjectTemplate}
                    onChange={(e) => handleFieldChange(rule.id, 'subjectTemplate', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Instructions
                  </label>
                  <input
                    value={rule.instructions ?? ''}
                    onChange={(e) => handleFieldChange(rule.id, 'instructions', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                    placeholder="e.g. Reply on this thread with tracking info only."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Body
                </label>
                <textarea
                  value={rule.bodyTemplate}
                  onChange={(e) => handleFieldChange(rule.id, 'bodyTemplate', e.target.value)}
                  rows={5}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Merge fields: <code className="text-indigo-300">{"{{po_number}}"}</code>,{' '}
                  <code className="text-indigo-300">{"{{vendor_name}}"}</code>,{' '}
                  <code className="text-indigo-300">{"{{order_date}}"}</code>,{' '}
                  <code className="text-indigo-300">{"{{total_amount}}"}</code>,{' '}
                  <code className="text-indigo-300">{"{{item_count}}"}</code>,{' '}
                  <code className="text-indigo-300">{"{{order_age_days}}"}</code>
                </p>
              </div>

              {rule.updatedAt && (
                <p className="text-xs text-gray-500">
                  Last updated {new Date(rule.updatedAt).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-900/40 border border-dashed border-gray-700 rounded-lg p-4 text-sm text-gray-400 flex gap-3">
        <BotIcon className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
        <p>
          Follow-up emails always include a summary of the PO and your instruction block to keep vendors replying in-thread.
          Use stages to escalate tone or include routing info.
        </p>
      </div>
    </div>
  );
};

export default FollowUpSettingsPanel;
