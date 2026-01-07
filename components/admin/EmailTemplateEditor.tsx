/**
 * Email Template Editor
 *
 * Allows admins to view and edit follow-up email templates in-app.
 * Templates use placeholders like {{po_number}}, {{vendor_name}}, etc.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase/client';
import Button from '@/components/ui/Button';
import {
  DocumentTextIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  XMarkIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
  MailIcon,
} from '../icons';

interface FollowupCampaign {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  active: boolean;
  priority: number;
}

interface FollowupRule {
  id: string;
  campaign_id: string;
  stage: number;
  wait_hours: number;
  subject_template: string;
  body_template: string;
  instructions: string | null;
  active: boolean;
  escalate_after_stage: number | null;
}

interface EmailTemplateEditorProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Available template placeholders
const PLACEHOLDERS = [
  { key: '{{po_number}}', description: 'Purchase order number' },
  { key: '{{vendor_name}}', description: 'Vendor company name' },
  { key: '{{order_date}}', description: 'Date PO was placed' },
  { key: '{{order_age_days}}', description: 'Days since order placed' },
  { key: '{{expected_date}}', description: 'Expected delivery date' },
  { key: '{{total_amount}}', description: 'PO total amount' },
];

const EmailTemplateEditor: React.FC<EmailTemplateEditorProps> = ({ addToast }) => {
  const [campaigns, setCampaigns] = useState<FollowupCampaign[]>([]);
  const [rules, setRules] = useState<FollowupRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    subject_template: string;
    body_template: string;
    instructions: string;
    wait_hours: number;
  }>({ subject_template: '', body_template: '', instructions: '', wait_hours: 48 });
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Load campaigns and rules
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [campaignsRes, rulesRes] = await Promise.all([
        supabase
          .from('po_followup_campaigns')
          .select('*')
          .order('priority', { ascending: true }),
        supabase
          .from('po_followup_rules')
          .select('*')
          .order('stage', { ascending: true }),
      ]);

      if (campaignsRes.error) throw campaignsRes.error;
      if (rulesRes.error) throw rulesRes.error;

      setCampaigns(campaignsRes.data || []);
      setRules(rulesRes.data || []);
    } catch (error) {
      console.error('[EmailTemplateEditor] Error loading data:', error);
      addToast?.('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Start editing a rule
  const handleEdit = (rule: FollowupRule) => {
    setEditingRule(rule.id);
    setEditForm({
      subject_template: rule.subject_template,
      body_template: rule.body_template.replace(/\\n/g, '\n'),
      instructions: rule.instructions || '',
      wait_hours: rule.wait_hours,
    });
    setShowPreview(false);
  };

  // Cancel editing
  const handleCancel = () => {
    setEditingRule(null);
    setEditForm({ subject_template: '', body_template: '', instructions: '', wait_hours: 48 });
    setShowPreview(false);
  };

  // Save changes
  const handleSave = async () => {
    if (!editingRule) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('po_followup_rules')
        .update({
          subject_template: editForm.subject_template,
          body_template: editForm.body_template,
          instructions: editForm.instructions || null,
          wait_hours: editForm.wait_hours,
        })
        .eq('id', editingRule);

      if (error) throw error;

      addToast?.('Template saved successfully', 'success');
      setEditingRule(null);
      loadData();
    } catch (error) {
      console.error('[EmailTemplateEditor] Error saving:', error);
      addToast?.('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Insert placeholder at cursor
  const insertPlaceholder = (placeholder: string) => {
    setEditForm(prev => ({
      ...prev,
      body_template: prev.body_template + placeholder,
    }));
  };

  // Preview with sample data
  const getPreview = (template: string) => {
    return template
      .replace(/\{\{po_number\}\}/g, '124282')
      .replace(/\{\{vendor_name\}\}/g, 'American Extracts')
      .replace(/\{\{order_date\}\}/g, 'Jan 6, 2026')
      .replace(/\{\{order_age_days\}\}/g, '3')
      .replace(/\{\{expected_date\}\}/g, 'Jan 15, 2026')
      .replace(/\{\{total_amount\}\}/g, '$1,234.56');
  };

  // Get rules for a campaign
  const getCampaignRules = (campaignId: string) => {
    return rules.filter(r => r.campaign_id === campaignId);
  };

  // Get stage label
  const getStageLabel = (stage: number) => {
    if (stage === 1) return 'Initial';
    if (stage === 2) return 'Follow-up';
    if (stage === 3) return 'Urgent';
    return `Stage ${stage}`;
  };

  // Get trigger type badge color
  const getTriggerColor = (type: string) => {
    switch (type) {
      case 'tracking_missing': return 'bg-amber-500/20 text-amber-300';
      case 'no_confirmation': return 'bg-blue-500/20 text-blue-300';
      case 'invoice_missing': return 'bg-purple-500/20 text-purple-300';
      case 'overdue': return 'bg-red-500/20 text-red-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MailIcon className="w-5 h-5 text-cyan-400" />
            Email Templates
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Edit automated follow-up email templates
          </p>
        </div>
      </div>

      {/* Campaigns */}
      <div className="space-y-3">
        {campaigns.map(campaign => (
          <div
            key={campaign.id}
            className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden"
          >
            {/* Campaign Header */}
            <button
              onClick={() => setExpandedCampaign(
                expandedCampaign === campaign.id ? null : campaign.id
              )}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                {expandedCampaign === campaign.id ? (
                  <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                )}
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{campaign.name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getTriggerColor(campaign.trigger_type)}`}>
                      {campaign.trigger_type.replace(/_/g, ' ')}
                    </span>
                    {!campaign.active && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-600 text-gray-300">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{campaign.description}</p>
                </div>
              </div>
              <span className="text-sm text-gray-500">
                {getCampaignRules(campaign.id).length} stages
              </span>
            </button>

            {/* Rules (Expanded) */}
            {expandedCampaign === campaign.id && (
              <div className="border-t border-gray-700/50">
                {getCampaignRules(campaign.id).map(rule => (
                  <div
                    key={rule.id}
                    className="border-b border-gray-700/30 last:border-b-0"
                  >
                    {editingRule === rule.id ? (
                      /* Edit Mode */
                      <div className="p-4 bg-gray-900/50 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-white flex items-center gap-2">
                            <PencilSquareIcon className="w-4 h-4 text-cyan-400" />
                            Editing {getStageLabel(rule.stage)}
                          </h4>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowPreview(!showPreview)}
                              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                showPreview
                                  ? 'bg-cyan-600 text-white'
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              <SparklesIcon className="w-3 h-3 inline mr-1" />
                              Preview
                            </button>
                          </div>
                        </div>

                        {/* Wait Hours */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            Wait Time (hours before sending)
                          </label>
                          <input
                            type="number"
                            value={editForm.wait_hours}
                            onChange={(e) => setEditForm(prev => ({
                              ...prev,
                              wait_hours: parseInt(e.target.value) || 0
                            }))}
                            className="w-32 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
                          />
                        </div>

                        {/* Subject */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            Subject Line
                          </label>
                          {showPreview ? (
                            <div className="px-3 py-2 bg-gray-800 rounded-lg text-white text-sm">
                              {getPreview(editForm.subject_template)}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={editForm.subject_template}
                              onChange={(e) => setEditForm(prev => ({
                                ...prev,
                                subject_template: e.target.value
                              }))}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
                            />
                          )}
                        </div>

                        {/* Body */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            Email Body
                          </label>
                          {showPreview ? (
                            <div className="px-3 py-3 bg-gray-800 rounded-lg text-white text-sm whitespace-pre-wrap min-h-[150px]">
                              {getPreview(editForm.body_template)}
                            </div>
                          ) : (
                            <textarea
                              value={editForm.body_template}
                              onChange={(e) => setEditForm(prev => ({
                                ...prev,
                                body_template: e.target.value
                              }))}
                              rows={6}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none resize-y"
                            />
                          )}
                        </div>

                        {/* Placeholders */}
                        {!showPreview && (
                          <div>
                            <label className="block text-xs text-gray-400 mb-2">
                              Insert Placeholder
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {PLACEHOLDERS.map(p => (
                                <button
                                  key={p.key}
                                  onClick={() => insertPlaceholder(p.key)}
                                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-cyan-400 rounded transition-colors"
                                  title={p.description}
                                >
                                  {p.key}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Instructions */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            Instructions (added at bottom)
                          </label>
                          {showPreview ? (
                            editForm.instructions && (
                              <div className="px-3 py-2 bg-gray-800 rounded-lg text-gray-400 text-sm italic">
                                {editForm.instructions}
                              </div>
                            )
                          ) : (
                            <input
                              type="text"
                              value={editForm.instructions}
                              onChange={(e) => setEditForm(prev => ({
                                ...prev,
                                instructions: e.target.value
                              }))}
                              placeholder="Optional instructions for vendor"
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
                            />
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-2">
                          <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white"
                          >
                            {saving ? 'Saving...' : 'Save Changes'}
                          </Button>
                          <Button
                            onClick={handleCancel}
                            variant="outline"
                            className="border-gray-600 text-gray-300"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div className="px-4 py-3 hover:bg-gray-700/20 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                rule.stage === 1 ? 'bg-blue-500/20 text-blue-300' :
                                rule.stage === 2 ? 'bg-amber-500/20 text-amber-300' :
                                'bg-red-500/20 text-red-300'
                              }`}>
                                {getStageLabel(rule.stage)}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <ClockIcon className="w-3 h-3" />
                                {rule.wait_hours}h wait
                              </span>
                              {!rule.active && (
                                <span className="px-2 py-0.5 text-xs rounded bg-gray-600 text-gray-400">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-white truncate">
                              {rule.subject_template}
                            </p>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {rule.body_template.replace(/\\n/g, ' ').slice(0, 120)}...
                            </p>
                          </div>
                          <button
                            onClick={() => handleEdit(rule)}
                            className="flex-shrink-0 p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600 text-gray-300 transition-colors"
                            title="Edit template"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {campaigns.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <MailIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No email campaigns configured</p>
        </div>
      )}
    </div>
  );
};

export default EmailTemplateEditor;
