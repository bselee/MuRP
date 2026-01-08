/**
 * Agent Editor Component
 *
 * Full-featured editor for creating and modifying AI agents.
 * Supports system prompts, capabilities, triggers, and parameters.
 */

import React, { useState, useEffect } from 'react';
import type { AgentDefinition, AgentCapability, AgentTrigger, AgentParameter, AgentCategory } from '../../types/agents';
import { AGENT_TEMPLATES } from '../../types/agents';
import {
  CloseIcon,
  SaveIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  CpuChipIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  MailIcon,
  PackageIcon,
  DocumentTextIcon,
} from '../icons';

interface AgentEditorProps {
  agent?: AgentDefinition;
  canEditBuiltIn?: boolean;
  onSave: (agent: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<AgentDefinition>) => void;
  onClose: () => void;
  onTest?: (agent: AgentDefinition) => void;
}

const CATEGORY_OPTIONS: { value: AgentCategory; label: string; icon: React.ReactNode }[] = [
  { value: 'inventory', label: 'Inventory', icon: <PackageIcon className="w-4 h-4" /> },
  { value: 'compliance', label: 'Compliance', icon: <ShieldCheckIcon className="w-4 h-4" /> },
  { value: 'operations', label: 'Operations', icon: <MailIcon className="w-4 h-4" /> },
  { value: 'quality', label: 'Quality', icon: <DocumentTextIcon className="w-4 h-4" /> },
  { value: 'analytics', label: 'Analytics', icon: <ChartBarIcon className="w-4 h-4" /> },
  { value: 'custom', label: 'Custom', icon: <CpuChipIcon className="w-4 h-4" /> },
];

const AUTONOMY_OPTIONS = [
  { value: 'monitor', label: 'Monitor', description: 'Observes and reports, no actions' },
  { value: 'assist', label: 'Assist', description: 'Suggests actions, requires approval' },
  { value: 'autonomous', label: 'Autonomous', description: 'Acts independently within limits' },
];

const ALLOWED_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch'];

export const AgentEditor: React.FC<AgentEditorProps> = ({
  agent,
  canEditBuiltIn = false,
  onSave,
  onUpdate,
  onClose,
  onTest,
}) => {
  const isNew = !agent;
  // Allow editing if: new agent, not built-in, OR admin+ can edit built-in
  const canEdit = isNew || !agent?.isBuiltIn || canEditBuiltIn;

  // Form state
  const [name, setName] = useState(agent?.name || '');
  const [identifier, setIdentifier] = useState(agent?.identifier || '');
  const [description, setDescription] = useState(agent?.description || '');
  const [category, setCategory] = useState<AgentCategory>(agent?.category || 'custom');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || '');
  const [autonomyLevel, setAutonomyLevel] = useState(agent?.autonomyLevel || 'assist');
  const [capabilities, setCapabilities] = useState<AgentCapability[]>(agent?.capabilities || []);
  const [triggers, setTriggers] = useState<AgentTrigger[]>(agent?.triggers || []);
  const [parameters, setParameters] = useState<Record<string, AgentParameter>>(agent?.parameters || {});
  const [allowedTools, setAllowedTools] = useState<string[]>(agent?.allowedTools || ['Read', 'Grep', 'Glob']);
  const [isActive, setIsActive] = useState(agent?.isActive ?? true);
  const [trustScore, setTrustScore] = useState(agent?.trustScore ?? 0.7);

  const [activeTab, setActiveTab] = useState<'prompt' | 'capabilities' | 'triggers' | 'parameters' | 'tools'>('prompt');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // AI Assistant state
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiInput, setAIInput] = useState('');
  const [aiSuggestion, setAISuggestion] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);

  // Auto-generate identifier from name
  useEffect(() => {
    if (isNew && name) {
      setIdentifier(name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
    }
  }, [name, isNew]);

  const validate = (): boolean => {
    const newErrors: string[] = [];
    if (!name.trim()) newErrors.push('Name is required');
    if (!identifier.trim()) newErrors.push('Identifier is required');
    if (!systemPrompt.trim()) newErrors.push('System prompt is required');
    if (identifier && !/^[a-z0-9-]+$/.test(identifier)) {
      newErrors.push('Identifier must be lowercase with hyphens only');
    }
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      if (agent && onUpdate) {
        // Update existing agent (including built-in if allowed)
        onUpdate(agent.id, {
          name,
          description,
          category,
          systemPrompt,
          autonomyLevel,
          capabilities,
          triggers,
          parameters,
          allowedTools,
          isActive,
          trustScore,
        });
        onClose();
      } else {
        // Create new agent
        await onSave({
          identifier,
          name,
          description,
          category,
          systemPrompt,
          autonomyLevel,
          capabilities,
          triggers,
          parameters,
          allowedTools,
          isActive,
          trustScore,
          isBuiltIn: false,
          version: agent?.version || '1.0.0',
          mcpTools: [],
        });
        onClose();
      }
    } catch (err) {
      setErrors([String(err)]);
    }
    setIsSaving(false);
  };

  // AI Assistant for prompt improvement
  const handleAIAssist = async () => {
    if (!aiInput.trim()) return;

    setIsAILoading(true);
    try {
      // Build context for the AI
      const context = `
You are helping improve an AI agent's system prompt.

Current agent: ${name}
Category: ${category}
Description: ${description}

Current system prompt:
${systemPrompt}

User request: ${aiInput}

Please provide an improved version of the system prompt that addresses the user's request.
Keep the same overall structure but enhance based on the feedback.
Only output the improved system prompt, no explanations.
      `.trim();

      // Use local AI processing (in production, call aiGatewayService)
      // For now, provide structured suggestions
      let suggestion = systemPrompt;

      if (aiInput.toLowerCase().includes('more specific')) {
        suggestion = `${systemPrompt}\n\n## Specific Guidelines\n- Be precise with data references\n- Include exact thresholds and metrics\n- Reference specific tables and columns`;
      } else if (aiInput.toLowerCase().includes('add error handling')) {
        suggestion = `${systemPrompt}\n\n## Error Handling\n- Always validate input data before processing\n- Log errors with context for debugging\n- Provide fallback behaviors when data is unavailable`;
      } else if (aiInput.toLowerCase().includes('improve clarity')) {
        suggestion = `${systemPrompt}\n\n## Output Formatting\n- Use clear headers for each section\n- Prioritize critical items first\n- Include actionable recommendations`;
      } else {
        // Generic improvement
        suggestion = `${systemPrompt}\n\n## Additional Guidance\n${aiInput}`;
      }

      setAISuggestion(suggestion);
    } catch (err) {
      setErrors([`AI assist failed: ${err}`]);
    }
    setIsAILoading(false);
  };

  const applyAISuggestion = () => {
    if (aiSuggestion) {
      setSystemPrompt(aiSuggestion);
      setAISuggestion('');
      setAIInput('');
      setShowAIAssistant(false);
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = AGENT_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setName(template.name);
      setDescription(template.description);
      setCategory(template.category);
      setSystemPrompt(template.baseSystemPrompt);
      setTriggers(template.suggestedTriggers);
      setParameters(template.suggestedParameters.reduce((acc, p) => ({ ...acc, [p.key]: p }), {}));
    }
  };

  const addCapability = () => {
    setCapabilities([...capabilities, { id: `cap-${Date.now()}`, name: '', description: '' }]);
  };

  const removeCapability = (index: number) => {
    setCapabilities(capabilities.filter((_, i) => i !== index));
  };

  const addTrigger = () => {
    setTriggers([...triggers, { type: 'keyword', value: '' }]);
  };

  const removeTrigger = (index: number) => {
    setTriggers(triggers.filter((_, i) => i !== index));
  };

  const addParameter = () => {
    const key = `param_${Date.now()}`;
    setParameters({
      ...parameters,
      [key]: { key, label: 'New Parameter', type: 'string', value: '' },
    });
  };

  const removeParameter = (key: string) => {
    const { [key]: _, ...rest } = parameters;
    setParameters(rest);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Editor Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-3xl bg-gray-900 border-l border-gray-700 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <CpuChipIcon className="w-6 h-6 text-accent-400" />
            <h2 className="text-xl font-bold text-white">
              {isNew ? 'Create Agent' : `Edit: ${agent.name}`}
            </h2>
            {agent?.isBuiltIn && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                canEdit
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}>
                {canEdit ? 'Built-in (Admin Edit)' : 'Built-in (Read-only)'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg">
            <ul className="text-sm text-red-400 space-y-1">
              {errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          </div>
        )}

        {/* Template Selector (for new agents) */}
        {isNew && (
          <div className="p-4 border-b border-gray-800">
            <label className="block text-sm font-medium text-gray-400 mb-2">Start from template</label>
            <select
              onChange={(e) => e.target.value && handleApplyTemplate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
            >
              <option value="">Blank agent</option>
              {AGENT_TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Basic Info */}
        <div className="p-4 space-y-4 border-b border-gray-800">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Stock Intelligence Analyst"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-accent-500"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Identifier *</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="stock-intelligence-analyst"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-accent-500"
                disabled={!canEdit}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Expert in inventory forecasting and ROP calculations"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-accent-500"
              disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AgentCategory)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white"
                disabled={!canEdit}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Autonomy Level</label>
              <select
                value={autonomyLevel}
                onChange={(e) => setAutonomyLevel(e.target.value as typeof autonomyLevel)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white"
                disabled={!canEdit}
              >
                {AUTONOMY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 px-4">
          {(['prompt', 'capabilities', 'triggers', 'parameters', 'tools'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors ${
                activeTab === tab
                  ? 'text-accent-400 border-accent-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* System Prompt Tab */}
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-400">System Prompt *</label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{systemPrompt.length} chars</span>
                  {canEdit && (
                    <button
                      onClick={() => setShowAIAssistant(!showAIAssistant)}
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
                        showAIAssistant
                          ? 'bg-accent-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                      </svg>
                      AI Assist
                    </button>
                  )}
                </div>
              </div>

              {/* AI Assistant Panel */}
              {showAIAssistant && canEdit && (
                <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-accent-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                    <span className="font-medium">AI Prompt Assistant</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Describe how you want to improve the prompt (e.g., "add error handling", "make more specific", "improve clarity")
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAIInput(e.target.value)}
                      placeholder="e.g., Add more specific threshold values..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-accent-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAIAssist()}
                    />
                    <button
                      onClick={handleAIAssist}
                      disabled={isAILoading || !aiInput.trim()}
                      className="px-4 py-2 bg-accent-500 hover:bg-accent-600 disabled:bg-gray-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      {isAILoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Thinking...
                        </>
                      ) : (
                        'Suggest'
                      )}
                    </button>
                  </div>

                  {/* AI Suggestion Preview */}
                  {aiSuggestion && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-300">Suggested Changes:</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setAISuggestion('')}
                            className="text-xs text-gray-400 hover:text-white"
                          >
                            Dismiss
                          </button>
                          <button
                            onClick={applyAISuggestion}
                            className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded"
                          >
                            Apply Changes
                          </button>
                        </div>
                      </div>
                      <div className="max-h-40 overflow-y-auto bg-gray-900 border border-gray-700 rounded p-3">
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                          {aiSuggestion.slice(-500)}...
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are an AI agent specialized in..."
                rows={showAIAssistant ? 12 : 20}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white font-mono text-sm focus:ring-2 focus:ring-accent-500"
                disabled={!canEdit}
              />
              <p className="text-xs text-gray-500">
                Use Markdown formatting. Include sections for expertise, key data sources, and important rules.
              </p>
            </div>
          )}

          {/* Capabilities Tab */}
          {activeTab === 'capabilities' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">Define what this agent can do</p>
                <button
                  onClick={addCapability}
                  disabled={!canEdit}
                  className="flex items-center gap-1 text-sm text-accent-400 hover:text-accent-300 disabled:opacity-50"
                >
                  <PlusIcon className="w-4 h-4" /> Add Capability
                </button>
              </div>
              {capabilities.map((cap, i) => (
                <div key={cap.id} className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={cap.name}
                      onChange={(e) => {
                        const updated = [...capabilities];
                        updated[i] = { ...cap, name: e.target.value };
                        setCapabilities(updated);
                      }}
                      placeholder="Capability name"
                      className="flex-1 bg-gray-900 border border-gray-700 rounded p-2 text-white"
                      disabled={!canEdit}
                    />
                    <button
                      onClick={() => removeCapability(i)}
                      disabled={!canEdit}
                      className="p-2 text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={cap.description}
                    onChange={(e) => {
                      const updated = [...capabilities];
                      updated[i] = { ...cap, description: e.target.value };
                      setCapabilities(updated);
                    }}
                    placeholder="What this capability does..."
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm"
                    disabled={!canEdit}
                  />
                </div>
              ))}
              {capabilities.length === 0 && (
                <p className="text-center text-gray-500 py-8">No capabilities defined yet</p>
              )}
            </div>
          )}

          {/* Triggers Tab */}
          {activeTab === 'triggers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">When should this agent activate?</p>
                <button
                  onClick={addTrigger}
                  disabled={!canEdit}
                  className="flex items-center gap-1 text-sm text-accent-400 hover:text-accent-300 disabled:opacity-50"
                >
                  <PlusIcon className="w-4 h-4" /> Add Trigger
                </button>
              </div>
              {triggers.map((trigger, i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-4 flex items-center gap-3">
                  <select
                    value={trigger.type}
                    onChange={(e) => {
                      const updated = [...triggers];
                      updated[i] = { ...trigger, type: e.target.value as AgentTrigger['type'] };
                      setTriggers(updated);
                    }}
                    className="bg-gray-900 border border-gray-700 rounded p-2 text-white"
                    disabled={!canEdit}
                  >
                    <option value="keyword">Keyword</option>
                    <option value="schedule">Schedule</option>
                    <option value="event">Event</option>
                    <option value="manual">Manual</option>
                  </select>
                  <input
                    type="text"
                    value={trigger.value}
                    onChange={(e) => {
                      const updated = [...triggers];
                      updated[i] = { ...trigger, value: e.target.value };
                      setTriggers(updated);
                    }}
                    placeholder={trigger.type === 'keyword' ? 'e.g., "stock level"' : trigger.type === 'schedule' ? 'e.g., "0 6 * * *"' : 'e.g., "new_email"'}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded p-2 text-white"
                    disabled={!canEdit}
                  />
                  <button
                    onClick={() => removeTrigger(i)}
                    disabled={!canEdit}
                    className="p-2 text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {triggers.length === 0 && (
                <p className="text-center text-gray-500 py-8">No triggers defined</p>
              )}
            </div>
          )}

          {/* Parameters Tab */}
          {activeTab === 'parameters' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">Configurable parameters for this agent</p>
                <button
                  onClick={addParameter}
                  disabled={!canEdit}
                  className="flex items-center gap-1 text-sm text-accent-400 hover:text-accent-300 disabled:opacity-50"
                >
                  <PlusIcon className="w-4 h-4" /> Add Parameter
                </button>
              </div>
              {Object.entries(parameters).map(([key, param]) => (
                <div key={key} className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={param.label}
                      onChange={(e) => {
                        setParameters({
                          ...parameters,
                          [key]: { ...param, label: e.target.value },
                        });
                      }}
                      placeholder="Parameter label"
                      className="flex-1 bg-gray-900 border border-gray-700 rounded p-2 text-white"
                      disabled={!canEdit}
                    />
                    <select
                      value={param.type}
                      onChange={(e) => {
                        setParameters({
                          ...parameters,
                          [key]: { ...param, type: e.target.value as AgentParameter['type'] },
                        });
                      }}
                      className="bg-gray-900 border border-gray-700 rounded p-2 text-white"
                      disabled={!canEdit}
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                    </select>
                    <button
                      onClick={() => removeParameter(key)}
                      disabled={!canEdit}
                      className="p-2 text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type={param.type === 'number' ? 'number' : 'text'}
                    value={String(param.value)}
                    onChange={(e) => {
                      const value = param.type === 'number' ? Number(e.target.value) : e.target.value;
                      setParameters({
                        ...parameters,
                        [key]: { ...param, value },
                      });
                    }}
                    placeholder="Default value"
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                    disabled={!canEdit}
                  />
                </div>
              ))}
              {Object.keys(parameters).length === 0 && (
                <p className="text-center text-gray-500 py-8">No parameters defined</p>
              )}
            </div>
          )}

          {/* Tools Tab */}
          {activeTab === 'tools' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Select which tools this agent can use</p>
              <div className="grid grid-cols-2 gap-3">
                {ALLOWED_TOOLS.map(tool => (
                  <label
                    key={tool}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      allowedTools.includes(tool)
                        ? 'bg-accent-500/20 border-accent-500'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    } ${agent?.isBuiltIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={allowedTools.includes(tool)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAllowedTools([...allowedTools, tool]);
                        } else {
                          setAllowedTools(allowedTools.filter(t => t !== tool));
                        }
                      }}
                      className="accent-accent-500"
                      disabled={!canEdit}
                    />
                    <span className="text-white font-mono text-sm">{tool}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/95 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="accent-green-500"
                disabled={!canEdit}
              />
              <span className="text-sm text-gray-300">Active</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Trust:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={trustScore * 100}
                onChange={(e) => setTrustScore(Number(e.target.value) / 100)}
                className="w-24 accent-accent-500"
                disabled={!canEdit}
              />
              <span className="text-xs text-gray-400">{Math.round(trustScore * 100)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            {onTest && agent && (
              <button
                onClick={() => onTest(agent)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <PlayIcon className="w-4 h-4" />
                Test
              </button>
            )}
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4" />
                    {agent ? 'Update Agent' : 'Save Agent'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AgentEditor;
