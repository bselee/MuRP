import React, { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import type { ComponentSwapRule } from '../types';
import {
  InformationCircleIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon
} from './icons';
import { fetchComponentSwapRules, saveComponentSwapRules } from '../services/componentSwapService';

interface ComponentSwapSettingsPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const blankRule = (): ComponentSwapRule => ({
  sku: '',
  reason: '',
  suggestions: [
    {
      sku: '',
      description: '',
      note: ''
    }
  ]
});

const ComponentSwapSettingsPanel: React.FC<ComponentSwapSettingsPanelProps> = ({ addToast }) => {
  const [rules, setRules] = useState<ComponentSwapRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    void loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const { rules: fetchedRules, updatedAt } = await fetchComponentSwapRules();
      setRules(fetchedRules.length > 0 ? fetchedRules : [blankRule()]);
      setLastUpdated(updatedAt);
    } catch (error) {
      console.error('[ComponentSwapSettings] load error', error);
      addToast('Failed to load component swap settings.', 'error');
      setRules([blankRule()]);
    } finally {
      setLoading(false);
    }
  };

  const updateRule = (index: number, updates: Partial<ComponentSwapRule>) => {
    setRules(prev =>
      prev.map((rule, i) => (i === index ? { ...rule, ...updates } : rule))
    );
  };

  const updateSuggestion = (
    ruleIndex: number,
    suggestionIndex: number,
    field: 'sku' | 'description' | 'note' | 'similarityTag',
    value: string
  ) => {
    setRules(prev =>
      prev.map((rule, idx) => {
        if (idx !== ruleIndex) return rule;
        const suggestions = rule.suggestions ?? [];
        const updated = suggestions.map((suggestion, sIdx) =>
          sIdx === suggestionIndex ? { ...suggestion, [field]: value } : suggestion
        );
        return { ...rule, suggestions: updated };
      })
    );
  };

  const addSuggestion = (ruleIndex: number) => {
    setRules(prev =>
      prev.map((rule, idx) => {
        if (idx !== ruleIndex) return rule;
        return {
          ...rule,
          suggestions: [
            ...(rule.suggestions ?? []),
            { sku: '', description: '', note: '' }
          ]
        };
      })
    );
  };

  const removeSuggestion = (ruleIndex: number, suggestionIndex: number) => {
    setRules(prev =>
      prev.map((rule, idx) => {
        if (idx !== ruleIndex) return rule;
        return {
          ...rule,
          suggestions: (rule.suggestions ?? []).filter((_, i) => i !== suggestionIndex)
        };
      })
    );
  };

  const removeRule = (index: number) => {
    setRules(prev => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [blankRule()];
    });
  };

  const addRule = () => {
    setRules(prev => [...prev, blankRule()]);
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Not saved yet';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveComponentSwapRules(rules);
      addToast('Component swap suggestions saved.', 'success');
      setLastUpdated(new Date().toISOString());
    } catch (error) {
      console.error('[ComponentSwapSettings] save error', error);
      addToast('Unable to save swap suggestions.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100 flex gap-3">
        <SparklesIcon className="w-5 h-5 flex-shrink-0 text-amber-300" />
        <div>
          <p className="font-semibold text-white">Flag go-to substitutions</p>
          <p className="text-amber-100/80">
            Store lightweight swap guidance (SKU, description, why it works). We surface these in the BOM
            component panel so planners can swap or requisition faster.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-700 px-3 py-1">
          <ArrowsRightLeftIcon className="w-4 h-4 text-indigo-300" />
          {loading ? 'Loading swaps…' : `${rules.filter(rule => rule.sku?.trim()).length} flagged components`}
        </div>
        <div className="inline-flex items-center gap-1 text-gray-500">
          <InformationCircleIcon className="w-4 h-4" />
          Last saved: {formatTimestamp(lastUpdated)}
        </div>
      </div>

      <div className="space-y-4">
        {rules.map((rule, ruleIndex) => (
          <div
            key={`component-swap-rule-${ruleIndex}`}
            className="rounded-2xl border border-gray-800 bg-gray-900/50 p-4 shadow-inner"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <label className="text-xs uppercase tracking-wide text-gray-500">Flagged Component SKU</label>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 font-mono text-sm text-white focus:border-indigo-400 focus:outline-none"
                  placeholder="SGK119"
                  value={rule.sku}
                  onChange={(e) => updateRule(ruleIndex, { sku: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 self-start md:self-auto">
                <Button variant="ghost" onClick={() => removeRule(ruleIndex)} className="text-xs text-red-300 hover:text-red-200">
                  <TrashIcon className="w-4 h-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs uppercase tracking-wide text-gray-500">Why is this flagged?</label>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-100 focus:border-indigo-400 focus:outline-none"
                placeholder="Pumice shipment delayed — use fine-grain sgf112 instead."
                rows={2}
                value={rule.reason ?? ''}
                onChange={(e) => updateRule(ruleIndex, { reason: e.target.value })}
              />
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Alternates</span>
                <Button
                  variant="ghost"
                  onClick={() => addSuggestion(ruleIndex)}
                  className="text-xs text-indigo-300 hover:text-indigo-200"
                >
                  <PlusIcon className="w-4 h-4 mr-1" />
                  Add alternate
                </Button>
              </div>

              {(rule.suggestions ?? []).map((suggestion, suggestionIndex) => (
                <div
                  key={`component-swap-suggestion-${ruleIndex}-${suggestionIndex}`}
                  className="rounded-xl border border-gray-800 bg-gray-900/60 p-3"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="text-[11px] uppercase text-gray-500">Alt SKU</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 font-mono text-sm text-white focus:border-emerald-400 focus:outline-none"
                        placeholder="SGF112"
                        value={suggestion.sku}
                        onChange={(e) => updateSuggestion(ruleIndex, suggestionIndex, 'sku', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase text-gray-500">Description</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-100 focus:border-emerald-400 focus:outline-none"
                        placeholder="Fine Pumice - similar texture"
                        value={suggestion.description ?? ''}
                        onChange={(e) => updateSuggestion(ruleIndex, suggestionIndex, 'description', e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-1">
                      <label className="text-[11px] uppercase text-gray-500">Note / reason</label>
                      <div className="flex items-center gap-2">
                        <input
                          className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-100 focus:border-emerald-400 focus:outline-none"
                          placeholder="Swap when SGK119 out"
                          value={suggestion.note ?? ''}
                          onChange={(e) => updateSuggestion(ruleIndex, suggestionIndex, 'note', e.target.value)}
                        />
                        <Button
                          variant="ghost"
                          onClick={() => removeSuggestion(ruleIndex, suggestionIndex)}
                          className="text-xs text-red-300 hover:text-red-200"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {(rule.suggestions?.length ?? 0) === 0 && (
                <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-3 text-xs text-gray-500">
                  No alternates recorded yet — add at least one SKU to surface guidance in BOM cards.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={addRule}
          className="inline-flex items-center gap-2 bg-gray-800 text-gray-100 hover:bg-gray-700"
          variant="ghost"
        >
          <PlusIcon className="w-4 h-4" />
          Flag another component
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save swap suggestions'}
        </Button>
      </div>
    </div>
  );
};

export default ComponentSwapSettingsPanel;
