import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import Button from '@/components/ui/Button';
import type { FollowUpCampaign, FollowUpRule } from '../types';
import { BotIcon, SaveIcon, TrashIcon, PlusCircleIcon, MailIcon } from './icons';

interface FollowUpSettingsPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const DEFAULT_SUBJECT = 'Quick check-in on PO #{{po_number}}';
const DEFAULT_BODY = `Hi {{vendor_name}},

We sent Purchase Order #{{po_number}} on {{order_date}} for {{item_count}} line items totaling {{total_amount}}.

We still need confirmation and tracking so our production schedule stays on track.`;
const DEFAULT_INSTRUCTIONS =
  'Please reply directly to this thread with the carrier and tracking number as soon as it is available. This keeps everything linked in our system.';

const INVOICE_SUBJECT = 'Invoice request for PO #{{po_number}}';
const INVOICE_BODY = `Hi {{vendor_name}},

Thanks again for fulfilling PO #{{po_number}}. We have received the goods and simply need the invoice PDF to close out accounting.

Could you reply with the invoice or confirm when it will be available?`;
const INVOICE_INSTRUCTIONS =
  'Reply on this thread with the invoice attachment or email ap@murp.app and include the PO number so we can auto-match it.';

const triggerOptions = [
  { value: 'tracking_missing', label: 'Missing tracking / no vendor response' },
  { value: 'invoice_missing', label: 'Invoice collection after receipt' },
  { value: 'custom', label: 'Custom campaign (manual criteria)' },
];

const stageDefaults = {
  tracking_missing: {
    subject_template: DEFAULT_SUBJECT,
    body_template: DEFAULT_BODY,
    instructions: DEFAULT_INSTRUCTIONS,
  },
  invoice_missing: {
    subject_template: INVOICE_SUBJECT,
    body_template: INVOICE_BODY,
    instructions: INVOICE_INSTRUCTIONS,
  },
  custom: {
    subject_template: 'Follow-up on PO #{{po_number}}',
    body_template: 'Hi {{vendor_name}},\n\nFollowing up on PO #{{po_number}}.',
    instructions: '',
  },
};

const FollowUpSettingsPanel: React.FC<FollowUpSettingsPanelProps> = ({ addToast }) => {
  const [campaigns, setCampaigns] = useState<FollowUpCampaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [rules, setRules] = useState<FollowUpRule[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingRules, setLoadingRules] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [creatingStage, setCreatingStage] = useState(false);
  const [savingStageId, setSavingStageId] = useState<string | null>(null);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    triggerType: 'tracking_missing' as FollowUpCampaign['triggerType'],
  });

  const activeCampaign = campaigns.find((campaign) => campaign.id === activeCampaignId) ?? null;
  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.stage - b.stage),
    [rules],
  );

  useEffect(() => {
    void loadCampaigns();
  }, []);

  useEffect(() => {
    if (activeCampaignId) {
      void loadRules(activeCampaignId);
    } else {
      setRules([]);
    }
  }, [activeCampaignId]);

  const loadCampaigns = async () => {
    try {
      setLoadingCampaigns(true);
      const { data, error } = await supabase
        .from('po_followup_campaigns')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const mapped =
        data?.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          triggerType: row.trigger_type as FollowUpCampaign['triggerType'],
          active: row.active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })) ?? [];
      setCampaigns(mapped);
      if (mapped.length > 0) {
        setActiveCampaignId((prev) => prev ?? mapped[0].id);
      }
    } catch (error) {
      console.error('[FollowUpSettingsPanel] failed to load campaigns', error);
      addToast?.('Failed to load follow-up campaigns', 'error');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const loadRules = async (campaignId: string) => {
    try {
      setLoadingRules(true);
      const { data, error } = await supabase
        .from('po_followup_rules')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('stage', { ascending: true });
      if (error) throw error;
      setRules(
        (data || []).map((rule) => ({
          id: rule.id,
          campaignId: rule.campaign_id,
          stage: rule.stage,
          waitHours: rule.wait_hours,
          subjectTemplate: rule.subject_template,
          bodyTemplate: rule.body_template,
          instructions: rule.instructions,
          active: rule.active,
          updatedAt: rule.updated_at,
        })),
      );
    } catch (error) {
      console.error('[FollowUpSettingsPanel] failed to load rules', error);
      addToast?.('Failed to load follow-up stages', 'error');
    } finally {
      setLoadingRules(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!newCampaign.name.trim()) {
      addToast?.('Campaign name is required', 'error');
      return;
    }
    try {
      setCreatingCampaign(true);
      const { data, error } = await supabase
        .from('po_followup_campaigns')
        .insert({
          name: newCampaign.name.trim(),
          description: newCampaign.description.trim(),
          trigger_type: newCampaign.triggerType,
          active: true,
        })
        .select('*')
        .single();
      if (error) throw error;
      const mapped: FollowUpCampaign = {
        id: data.id,
        name: data.name,
        description: data.description,
        triggerType: data.trigger_type,
        active: data.active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      setCampaigns((prev) => [...prev, mapped]);
      setNewCampaign({ name: '', description: '', triggerType: 'tracking_missing' });
      setActiveCampaignId(mapped.id);
      addToast?.('Campaign created', 'success');
    } catch (error) {
      console.error('[FollowUpSettingsPanel] campaign create error', error);
      addToast?.('Failed to create campaign', 'error');
    } finally {
      setCreatingCampaign(false);
    }
  };

  const handleSaveCampaign = async () => {
    if (!activeCampaign) return;
    try {
      setSavingCampaign(true);
      const { error } = await supabase
        .from('po_followup_campaigns')
        .update({
          name: activeCampaign.name,
          description: activeCampaign.description,
          trigger_type: activeCampaign.triggerType,
          active: activeCampaign.active,
        })
        .eq('id', activeCampaign.id);
      if (error) throw error;
      addToast?.('Campaign updated', 'success');
    } catch (error) {
      console.error('[FollowUpSettingsPanel] campaign save error', error);
      addToast?.('Failed to update campaign', 'error');
    } finally {
      setSavingCampaign(false);
    }
  };

  const updateActiveCampaignField = <K extends keyof FollowUpCampaign>(field: K, value: FollowUpCampaign[K]) => {
    setCampaigns((prev) =>
      prev.map((campaign) => (campaign.id === activeCampaignId ? { ...campaign, [field]: value } : campaign)),
    );
  };

  const handleCreateRule = async () => {
    if (!activeCampaign) {
      addToast?.('Select a campaign before adding stages', 'error');
      return;
    }
    try {
      setCreatingStage(true);
      const nextStage = rules.length ? Math.max(...rules.map((rule) => rule.stage)) + 1 : 1;
      const defaults = stageDefaults[activeCampaign.triggerType] ?? stageDefaults.custom;
      const { error } = await supabase.from('po_followup_rules').insert({
        campaign_id: activeCampaign.id,
        stage: nextStage,
        wait_hours: activeCampaign.triggerType === 'invoice_missing' ? 72 : 48,
        subject_template: defaults.subject_template,
        body_template: defaults.body_template,
        instructions: defaults.instructions,
        active: true,
      });
      if (error) throw error;
      addToast?.('Stage added', 'success');
      await loadRules(activeCampaign.id);
    } catch (error) {
      console.error('[FollowUpSettingsPanel] create rule error', error);
      addToast?.('Failed to add stage', 'error');
    } finally {
      setCreatingStage(false);
    }
  };

  const handleSaveRule = async (rule: FollowUpRule) => {
    try {
      setSavingStageId(rule.id);
      const { error } = await supabase
        .from('po_followup_rules')
        .update({
          stage: rule.stage,
          wait_hours: rule.waitHours,
          subject_template: rule.subjectTemplate,
          body_template: rule.bodyTemplate,
          instructions: rule.instructions,
          active: rule.active,
        })
        .eq('id', rule.id);
      if (error) throw error;
      addToast?.(`Stage ${rule.stage} saved`, 'success');
      await loadRules(rule.campaignId);
    } catch (error) {
      console.error('[FollowUpSettingsPanel] save rule error', error);
      addToast?.('Failed to save stage', 'error');
    } finally {
      setSavingStageId(null);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Remove this follow-up stage?')) return;
    try {
      const { error } = await supabase.from('po_followup_rules').delete().eq('id', id);
      if (error) throw error;
      setRules((prev) => prev.filter((rule) => rule.id !== id));
      addToast?.('Stage removed', 'success');
    } catch (error) {
      console.error('[FollowUpSettingsPanel] delete rule error', error);
      addToast?.('Failed to delete stage', 'error');
    }
  };

  const campaignInfo = useMemo(() => {
    if (!activeCampaign) {
      return null;
    }
    const trigger = triggerOptions.find((option) => option.value === activeCampaign.triggerType);
    return trigger?.label ?? 'Custom trigger';
  }, [activeCampaign]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-300">
              Group follow-up rules into campaigns. Each campaign runs its own email chain and timing.
            </p>
            <p className="text-xs text-gray-500">
              Examples: at-risk tracking reminders, invoice collection flows, or custom escalation sequences.
            </p>
          </div>
          <Button
            onClick={handleCreateCampaign}
            disabled={creatingCampaign || !newCampaign.name.trim()}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md bg-indigo-600/80 hover:bg-indigo-500 text-white disabled:opacity-60"
          >
            <PlusCircleIcon className="w-4 h-4" />
            New campaign
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
            placeholder="Campaign name"
            value={newCampaign.name}
            onChange={(event) => setNewCampaign((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
            placeholder="Description (optional)"
            value={newCampaign.description}
            onChange={(event) => setNewCampaign((prev) => ({ ...prev, description: event.target.value }))}
          />
          <select
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
            value={newCampaign.triggerType}
            onChange={(event) =>
              setNewCampaign((prev) => ({ ...prev, triggerType: event.target.value as FollowUpCampaign['triggerType'] }))
            }
          >
            {triggerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {loadingCampaigns ? (
          <p className="text-sm text-gray-400">Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-600 p-6 text-sm text-gray-400">
            No campaigns yet. Create your first one above.
          </div>
        ) : (
          campaigns.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              onClick={() => setActiveCampaignId(campaign.id)}
              className={`text-left rounded-2xl border ${
                campaign.id === activeCampaignId
                  ? 'border-indigo-500/60 bg-indigo-500/10'
                  : 'border-white/5 bg-gray-900/40 hover:border-white/20'
              } p-4 transition-colors`}
            >
              <div className="flex items-center gap-2">
                <MailIcon className="w-4 h-4 text-indigo-300" />
                <p className="text-sm font-semibold text-white">{campaign.name}</p>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {triggerOptions.find((option) => option.value === campaign.triggerType)?.label ?? 'Custom trigger'}
              </p>
              {campaign.description && <p className="mt-2 text-xs text-gray-500">{campaign.description}</p>}
              <p className="mt-3 text-xs text-gray-500">
                {campaign.active ? 'Active' : 'Paused'} • {campaign.id === activeCampaignId ? rules.length : '—'} stage(s)
              </p>
            </button>
          ))
        )}
      </div>

      {activeCampaign && (
        <>
          <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-base font-semibold text-white">{activeCampaign.name}</h3>
              <span className="text-xs text-gray-400">{campaignInfo}</span>
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input
                  type="checkbox"
                  checked={activeCampaign.active}
                  onChange={(event) => updateActiveCampaignField('active', event.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                />
                Active
              </label>
            </div>
            <input
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
              value={activeCampaign.description ?? ''}
              placeholder="One-line description"
              onChange={(event) => updateActiveCampaignField('description', event.target.value)}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Trigger type
                </label>
                <select
                  value={activeCampaign.triggerType}
                  onChange={(event) =>
                    updateActiveCampaignField('triggerType', event.target.value as FollowUpCampaign['triggerType'])
                  }
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {triggerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end justify-end">
                <Button
                  onClick={handleSaveCampaign}
                  disabled={savingCampaign}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500"
                >
                  <SaveIcon className="w-4 h-4" />
                  {savingCampaign ? 'Saving…' : 'Save campaign'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-400">
              Stages wait a set number of hours, then send the template in the same Gmail thread.
            </p>
            <Button
              onClick={handleCreateRule}
              disabled={creatingStage}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600/80 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
            >
              <PlusCircleIcon className="w-4 h-4" />
              Add stage
            </Button>
          </div>

          {loadingRules ? (
            <p className="text-sm text-gray-400">Loading stages…</p>
          ) : sortedRules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-600 p-6 text-sm text-gray-400">
              No stages yet. Add your first follow-up above.
            </div>
          ) : (
            <div className="space-y-4">
              {sortedRules.map((rule) => (
                <div key={rule.id} className="border border-gray-700 rounded-lg bg-gray-900/60 p-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Stage</label>
                      <input
                        type="number"
                        min={1}
                        value={rule.stage}
                        onChange={(event) =>
                          setRules((prev) =>
                            prev.map((item) =>
                              item.id === rule.id ? { ...item, stage: parseInt(event.target.value, 10) || 1 } : item,
                            ),
                          )
                        }
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
                        onChange={(event) =>
                          setRules((prev) =>
                            prev.map((item) =>
                              item.id === rule.id ? { ...item, waitHours: parseInt(event.target.value, 10) || 1 } : item,
                            ),
                          )
                        }
                        className="w-24 bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white"
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-200 mt-5 sm:mt-6">
                      <input
                        type="checkbox"
                        checked={rule.active}
                        onChange={(event) =>
                          setRules((prev) =>
                            prev.map((item) =>
                              item.id === rule.id ? { ...item, active: event.target.checked } : item,
                            ),
                          )
                        }
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
                      disabled={savingStageId === rule.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60"
                    >
                      <SaveIcon className="w-4 h-4" />
                      {savingStageId === rule.id ? 'Saving…' : 'Save'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        Subject
                      </label>
                      <input
                        value={rule.subjectTemplate}
                        onChange={(event) =>
                          setRules((prev) =>
                            prev.map((item) =>
                              item.id === rule.id ? { ...item, subjectTemplate: event.target.value } : item,
                            ),
                          )
                        }
                        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        Instructions
                      </label>
                      <input
                        value={rule.instructions ?? ''}
                        onChange={(event) =>
                          setRules((prev) =>
                            prev.map((item) =>
                              item.id === rule.id ? { ...item, instructions: event.target.value } : item,
                            ),
                          )
                        }
                        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                        placeholder="E.g. reply with tracking only."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                      Body
                    </label>
                    <textarea
                      value={rule.bodyTemplate}
                      onChange={(event) =>
                        setRules((prev) =>
                          prev.map((item) =>
                            item.id === rule.id ? { ...item, bodyTemplate: event.target.value } : item,
                          ),
                        )
                      }
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
        </>
      )}

      <div className="bg-gray-900/40 border border-dashed border-gray-700 rounded-lg p-4 text-sm text-gray-400 flex gap-3">
        <BotIcon className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
        <p>
          Follow-up emails include the PO summary and instructions so vendors keep everything inside a single Gmail
          thread. Use different campaigns for different business scenarios (tracking, invoices, receiving confirmations).
        </p>
      </div>
    </div>
  );
};

export default FollowUpSettingsPanel;
