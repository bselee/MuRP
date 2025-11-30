import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { JobDescription, User } from '../types';
import { useJobDescriptions } from '../hooks/useJobDescriptions';
import { generateJobTemplate } from '../services/jobDescriptionTemplateService';
import { getGoogleDocsService } from '../services/googleDocsService';

interface JobDescriptionPanelProps {
  currentUser: User;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const statusStyles: Record<JobDescription['status'], string> = {
  approved: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/40',
  draft: 'bg-gray-500/15 text-gray-200 border border-gray-500/40',
  pending_review: 'bg-amber-500/15 text-amber-200 border border-amber-500/40',
};

const JobDescriptionPanel: React.FC<JobDescriptionPanelProps> = ({ currentUser, addToast }) => {
  const isOpsAdmin = currentUser.role === 'Admin' || currentUser.department === 'Operations';
  const { jobDescriptions, upsertJobDescription, submitDraftUpdate, formatUpdatedAt } = useJobDescriptions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState<JobDescription | null>(null);
  const [exporting, setExporting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const filtered = useMemo(() => {
    if (isOpsAdmin) return jobDescriptions;
    return jobDescriptions.filter((jd) => jd.role === currentUser.role && jd.department === currentUser.department);
  }, [currentUser.department, currentUser.role, isOpsAdmin, jobDescriptions]);

  useEffect(() => {
    if (!formState && filtered.length > 0) {
      setSelectedId(filtered[0].id);
      setFormState(filtered[0]);
    }
  }, [filtered, formState]);

  useEffect(() => {
    if (selectedId) {
      const next = jobDescriptions.find((jd) => jd.id === selectedId);
      if (next) setFormState(next);
    }
  }, [jobDescriptions, selectedId]);

  if (!formState) {
    return <p className="text-sm text-gray-400">No job descriptions available yet for this combination.</p>;
  }

  const handleFieldChange = (key: keyof JobDescription, value: any) => {
    setFormState((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateSopSection = (index: number, updater: Partial<JobDescription['sopSections'][number]>) => {
    setFormState((prev) => {
      if (!prev) return prev;
      const nextSections = [...prev.sopSections];
      nextSections[index] = { ...nextSections[index], ...updater };
      return { ...prev, sopSections: nextSections };
    });
  };

  const updateSopSteps = (index: number, raw: string) => {
    const steps = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    updateSopSection(index, { steps });
  };

  const handleSave = (status: JobDescription['status']) => {
    if (!formState) return;
    const payload: JobDescription = {
      ...formState,
      status,
      lastUpdatedBy: currentUser.name,
      updatedAt: new Date().toISOString(),
    };
    upsertJobDescription(payload);
    addToast?.(status === 'approved' ? 'Job description updated' : 'Draft saved for review', 'success');
  };

  const handleAiGenerate = async () => {
    setAiLoading(true);
    try {
      const suggestion = await generateJobTemplate({
        role: formState.role,
        department: formState.department,
      });
      setFormState((prev) =>
        prev
          ? {
              ...prev,
              overview: suggestion.overview,
              mission: suggestion.mission,
              successMetrics: suggestion.successMetrics,
              keyTools: suggestion.keyTools,
              sopSections: suggestion.sopSections,
              automationIdeas: suggestion.automationIdeas,
            }
          : prev,
      );
      addToast?.('Generated outline with AI suggestions. Review before saving.', 'info');
    } catch (error) {
      console.error('[JobDescriptionPanel] AI generation failed', error);
      addToast?.('Unable to generate outline. Ensure AI settings are configured.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleExport = async () => {
    if (!formState) return;
    setExporting(true);
    try {
      const docs = getGoogleDocsService();
      const body = [
        `# ${formState.role} — ${formState.department}`,
        '',
        `## Overview`,
        formState.overview,
        '',
        `## Mission`,
        formState.mission,
        '',
        `## Success Metrics`,
        ...formState.successMetrics.map((metric) => `- ${metric}`),
        '',
        `## Tools`,
        ...formState.keyTools.map((tool) => `- ${tool}`),
        '',
        `## SOP Sections`,
        ...formState.sopSections.flatMap((section) => [
          `### ${section.title}`,
          `Trigger: ${section.trigger}`,
          `Owner: ${section.owner}`,
          ...section.steps.map((step, idx) => `${idx + 1}. ${step}`),
          '',
        ]),
        formState.automationIdeas && formState.automationIdeas.length > 0 ? '## Automation Ideas' : '',
        ...(formState.automationIdeas || []).map((idea) => `- ${idea}`),
      ]
        .filter(Boolean)
        .join('\n');

      const doc = await docs.createDocument({
        title: `${formState.role}-${formState.department}-SOP`,
        body,
      });

      upsertJobDescription({ ...formState, googleDocUrl: doc.documentUrl });
      addToast?.('Exported to Google Docs', 'success');
    } catch (error) {
      console.error('[JobDescriptionPanel] export failed', error);
      addToast?.('Google Docs export failed. Connect Workspace in Settings.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const canEdit = isOpsAdmin;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-xs uppercase text-gray-500">Role</label>
          <select
            className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {filtered.map((jd) => (
              <option key={jd.id} value={jd.id}>
                {jd.role} — {jd.department}
              </option>
            ))}
          </select>
        </div>
        <div className={`text-xs font-semibold px-3 py-1 rounded-full ${statusStyles[formState.status]}`}>
          {formState.status.replace('_', ' ')} · Last updated {formatUpdatedAt(formState)}
        </div>
        {formState.googleDocUrl && (
          <a
            href={formState.googleDocUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent-300 hover:text-accent-100"
          >
            View Google Doc →
          </a>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs uppercase text-gray-500">Overview</label>
          <textarea
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white min-h-[90px]"
            value={formState.overview}
            onChange={(e) => handleFieldChange('overview', e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="text-xs uppercase text-gray-500">Mission</label>
          <textarea
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white min-h-[90px]"
            value={formState.mission}
            onChange={(e) => handleFieldChange('mission', e.target.value)}
            disabled={!canEdit}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs uppercase text-gray-500">Success Metrics (one per line)</label>
          <textarea
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white min-h-[120px]"
            value={formState.successMetrics.join('\n')}
            onChange={(e) =>
              handleFieldChange(
                'successMetrics',
                e.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean),
              )
            }
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="text-xs uppercase text-gray-500">Primary Tools</label>
          <textarea
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white min-h-[120px]"
            value={formState.keyTools.join('\n')}
            onChange={(e) =>
              handleFieldChange(
                'keyTools',
                e.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean),
              )
            }
            disabled={!canEdit}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">SOP Sections</p>
          {canEdit && (
            <Button
              onClick={() =>
                handleFieldChange('sopSections', [
                  ...formState.sopSections,
                  { title: 'New SOP', trigger: '', owner: `${formState.department} ${formState.role}`, steps: [] },
                ])
              }
              className="text-xs text-accent-200 border border-accent-500/40 rounded-md px-2 py-1 hover:bg-accent-500/10"
            >
              Add Section
            </Button>
          )}
        </div>
        {formState.sopSections.map((section, index) => (
          <div key={index} className="border border-gray-700 rounded-lg p-4 space-y-3 bg-gray-900/50">
            <input
              className="w-full bg-transparent border-b border-gray-700 text-white text-sm font-semibold pb-1 focus:border-accent-500"
              value={section.title}
              onChange={(e) => updateSopSection(index, { title: e.target.value })}
              disabled={!canEdit}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase text-gray-500">Trigger</label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                  value={section.trigger}
                  onChange={(e) => updateSopSection(index, { trigger: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="text-xs uppercase text-gray-500">Owner</label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                  value={section.owner}
                  onChange={(e) => updateSopSection(index, { owner: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase text-gray-500">Steps (one per line)</label>
              <textarea
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white min-h-[100px]"
                value={section.steps.join('\n')}
                onChange={(e) => updateSopSteps(index, e.target.value)}
                disabled={!canEdit}
              />
            </div>
            {canEdit && formState.sopSections.length > 1 && (
              <Button
                onClick={() =>
                  handleFieldChange(
                    'sopSections',
                    formState.sopSections.filter((_, idx) => idx !== index),
                  )
                }
                className="text-xs text-red-300 hover:text-red-100"
              >
                Remove section
              </Button>
            )}
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs uppercase text-gray-500">Automation Ideas / Prompts</label>
        <textarea
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white min-h-[100px]"
          value={(formState.automationIdeas || []).join('\n')}
          onChange={(e) =>
            handleFieldChange(
              'automationIdeas',
              e.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            )
          }
          disabled={!canEdit}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleAiGenerate}
            disabled={aiLoading}
            className="text-xs text-accent-200 border border-accent-500/40 rounded-md px-3 py-1 hover:bg-accent-500/10 disabled:opacity-50"
          >
            {aiLoading ? 'Generating…' : 'Generate outline with AI'}
          </Button>
          {isOpsAdmin && (
            <Button
              onClick={handleExport}
              disabled={exporting}
              className="text-xs text-emerald-200 border border-emerald-500/40 rounded-md px-3 py-1 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export to Google Docs'}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isOpsAdmin ? (
            <>
              <Button
                onClick={() => handleSave('draft')}
                className="text-sm text-gray-200 border border-gray-500/40 rounded-md px-4 py-2 hover:bg-gray-600/40"
              >
                Save Draft
              </Button>
              <Button
                onClick={() => handleSave('approved')}
                className="text-sm bg-accent-500 text-white px-4 py-2 rounded-md hover:bg-accent-500"
              >
                Publish
              </Button>
            </>
          ) : (
            <Button
              onClick={() => submitDraftUpdate(formState, currentUser)}
              className="text-sm bg-accent-500 text-white px-4 py-2 rounded-md hover:bg-accent-500"
            >
              Submit for Ops review
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default JobDescriptionPanel;
