/**
 * Agent Command Center
 *
 * Central hub for managing AI agents, skills, and workflows.
 * Supports viewing, editing, creating, and testing agents.
 */

import React, { useState, useEffect } from 'react';
import { AgentDetailDrawer } from './AgentDetailDrawer';
import { WorkflowPanel } from './WorkflowPanel';
import { SkillsPanel } from './SkillsPanel';
import { AgentEditor } from './AgentEditor';
import {
  getAllAgents,
  updateAgent as updateAgentService,
  createAgent,
  cloneAgent,
  exportAgentToMarkdown,
  BUILT_IN_AGENTS,
} from '../../services/agentManagementService';
import { executeAgentByIdentifier, type AgentExecutionResult } from '../../services/agentExecutor';
import type { AgentDefinition } from '../../types/agents';
import {
  CpuChipIcon,
  ShieldCheckIcon,
  TruckIcon,
  MailIcon,
  BotIcon,
  ChartBarIcon,
  PackageIcon,
  DollarSignIcon,
  DocumentTextIcon,
  PhotoIcon,
  CommandLineIcon,
  ZapIcon,
  PlusIcon,
  ClipboardCopyIcon,
  CheckCircleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  PlayIcon,
  XMarkIcon,
  AlertTriangleIcon,
  InformationCircleIcon,
} from '../icons';

interface AgentCommandCenterProps {
  userId?: string;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AgentCommandCenter: React.FC<AgentCommandCenterProps> = ({ userId = 'default-user', addToast }) => {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'agents' | 'workflows' | 'skills'>('agents');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [executingAgentId, setExecutingAgentId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<AgentExecutionResult | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    setLoading(true);
    const allAgents = await getAllAgents();
    setAgents(allAgents);
    setLoading(false);
  };

  const handleUpdateAgent = async (id: string, updates: Partial<AgentDefinition>) => {
    // Optimistic update
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));

    const result = await updateAgentService(id, updates);
    if (!result.success) {
      addToast?.(result.error || 'Failed to update agent', 'error');
      loadAgents(); // Reload on error
    }
  };

  const handleCreateAgent = async (agent: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>) => {
    const result = await createAgent(agent);
    if (result.success) {
      addToast?.('Agent created successfully!', 'success');
      loadAgents();
    } else {
      throw new Error(result.error);
    }
  };

  const handleCloneAgent = async (sourceId: string) => {
    const source = agents.find(a => a.id === sourceId);
    if (!source) return;

    const result = await cloneAgent(sourceId, `${source.name} (Custom)`);
    if (result.success) {
      addToast?.('Agent cloned! You can now customize it.', 'success');
      loadAgents();
      if (result.data) {
        setEditingAgent(result.data);
      }
    } else {
      addToast?.(result.error || 'Failed to clone agent', 'error');
    }
  };

  const handleExportAgent = (agent: AgentDefinition) => {
    const markdown = exportAgentToMarkdown(agent);
    navigator.clipboard.writeText(markdown);
    setCopiedId(agent.id);
    setTimeout(() => setCopiedId(null), 2000);
    addToast?.('Agent markdown copied to clipboard!', 'success');
  };

  const handleExecuteAgent = async (agent: AgentDefinition) => {
    if (!agent.isActive) {
      addToast?.('Cannot execute paused agent', 'error');
      return;
    }

    setExecutingAgentId(agent.id);
    addToast?.(`Running ${agent.name}...`, 'info');

    try {
      const result = await executeAgentByIdentifier(agent.identifier, {
        userId,
        parameters: agent.parameters || {},
        triggerSource: 'manual',
      });

      if (result) {
        setExecutionResult(result);
        if (result.success) {
          addToast?.(
            `${agent.name} completed: ${result.findings.length} findings, ${result.actionsProposed.length} actions`,
            'success'
          );
        } else {
          addToast?.(`${agent.name} failed: ${result.error}`, 'error');
        }
      } else {
        addToast?.(`Agent ${agent.name} not found`, 'error');
      }
    } catch (error) {
      addToast?.(`Error executing ${agent.name}: ${error}`, 'error');
    } finally {
      setExecutingAgentId(null);
    }
  };

  const systemTrustScore = agents.length > 0
    ? Math.round(agents.reduce((sum, a) => sum + a.trustScore, 0) / agents.length * 100)
    : 0;

  const activeAgentCount = agents.filter(a => a.isActive).length;
  const builtInCount = agents.filter(a => a.isBuiltIn).length;
  const customCount = agents.length - builtInCount;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <CpuChipIcon className="w-8 h-8 text-accent-400" />
            Agent Command Center
          </h1>
          <p className="text-gray-400 mt-2">
            Manage AI agents, configure behavior, and monitor autonomous workflows.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-6">
            <div>
              <p className="text-xs text-gray-500 uppercase font-bold">Trust Score</p>
              <p className={`text-2xl font-bold ${systemTrustScore >= 80 ? 'text-green-400' : systemTrustScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {systemTrustScore}%
              </p>
            </div>
            <div className="h-10 w-[1px] bg-gray-700" />
            <div>
              <p className="text-xs text-gray-500 uppercase font-bold">Active</p>
              <p className="text-2xl font-bold text-white">{activeAgentCount}</p>
            </div>
            <div className="h-10 w-[1px] bg-gray-700" />
            <div>
              <p className="text-xs text-gray-500 uppercase font-bold">Custom</p>
              <p className="text-2xl font-bold text-accent-400">{customCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'agents'
                ? 'text-accent-400 border-accent-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <BotIcon className="w-4 h-4" />
              Agents
              <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded">
                {activeAgentCount}
              </span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('workflows')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'workflows'
                ? 'text-accent-400 border-accent-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <ZapIcon className="w-4 h-4" />
              Workflows
            </span>
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'skills'
                ? 'text-accent-400 border-accent-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <CommandLineIcon className="w-4 h-4" />
              Skills
            </span>
          </button>
        </div>

        {activeTab === 'agents' && (
          <button
            onClick={() => setIsCreatingAgent(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-medium transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Create Agent
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'workflows' ? (
        <WorkflowPanel userId={userId} />
      ) : activeTab === 'skills' ? (
        <SkillsPanel />
      ) : (
        <>
          {/* Agent Categories */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'inventory', 'operations', 'compliance', 'quality', 'custom'].map(cat => (
              <button
                key={cat}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700"
              >
                {cat === 'all' ? 'All Agents' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {/* Agents Grid */}
          {loading ? (
            <div className="text-gray-400 flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Loading agents...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onUpdate={handleUpdateAgent}
                  onEdit={() => setEditingAgent(agent)}
                  onClone={() => handleCloneAgent(agent.id)}
                  onExport={() => handleExportAgent(agent)}
                  onExecute={() => handleExecuteAgent(agent)}
                  isCopied={copiedId === agent.id}
                  isExecuting={executingAgentId === agent.id}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Agent Editor Modal */}
      {(isCreatingAgent || editingAgent) && (
        <AgentEditor
          agent={editingAgent || undefined}
          onSave={handleCreateAgent}
          onClose={() => {
            setIsCreatingAgent(false);
            setEditingAgent(null);
          }}
        />
      )}

      {/* Execution Results Modal */}
      {executionResult && (
        <ExecutionResultsModal
          result={executionResult}
          onClose={() => setExecutionResult(null)}
        />
      )}
    </div>
  );
};

// ============================================================
// EXECUTION RESULTS MODAL
// ============================================================

const ExecutionResultsModal: React.FC<{
  result: AgentExecutionResult;
  onClose: () => void;
}> = ({ result, onClose }) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-900/30 border-red-800';
      case 'high': return 'text-orange-400 bg-orange-900/30 border-orange-800';
      case 'medium': return 'text-amber-400 bg-amber-900/30 border-amber-800';
      case 'low': return 'text-gray-400 bg-gray-800/50 border-gray-700';
      default: return 'text-gray-400 bg-gray-800/50 border-gray-700';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'alert': return <AlertTriangleIcon className="w-4 h-4 text-red-400" />;
      case 'warning': return <AlertTriangleIcon className="w-4 h-4 text-amber-400" />;
      case 'recommendation': return <CheckCircleIcon className="w-4 h-4 text-green-400" />;
      default: return <InformationCircleIcon className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {result.success ? (
                <CheckCircleIcon className="w-6 h-6 text-green-400" />
              ) : (
                <AlertTriangleIcon className="w-6 h-6 text-red-400" />
              )}
              {result.agentName} Results
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Executed in {result.durationMs}ms • {new Date(result.executedAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-white">{result.findings.length}</p>
              <p className="text-sm text-gray-400">Findings</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">{result.actionsProposed.length}</p>
              <p className="text-sm text-gray-400">Actions Proposed</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-green-400">{result.actionsExecuted.length}</p>
              <p className="text-sm text-gray-400">Auto-Executed</p>
            </div>
          </div>

          {/* Findings */}
          {result.findings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Findings</h3>
              <div className="space-y-2">
                {result.findings.map((finding, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${getSeverityColor(finding.severity)}`}
                  >
                    <div className="flex items-start gap-2">
                      {getTypeIcon(finding.type)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white">{finding.title}</p>
                        <p className="text-sm text-gray-300 mt-1">{finding.description}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded bg-gray-900/50 text-gray-400 uppercase">
                        {finding.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Proposed Actions */}
          {result.actionsProposed.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Proposed Actions</h3>
              <div className="space-y-2">
                {result.actionsProposed.map((action, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-gray-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{action.description}</p>
                        <p className="text-xs text-gray-500 mt-1">Type: {action.type}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          action.priority === 'critical' ? 'bg-red-900/50 text-red-400' :
                          action.priority === 'high' ? 'bg-orange-900/50 text-orange-400' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {action.priority}
                        </span>
                        {action.requiresConfirmation && (
                          <span className="text-xs px-2 py-1 rounded bg-blue-900/50 text-blue-400">
                            Needs Approval
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {result.findings.length === 0 && result.actionsProposed.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <CheckCircleIcon className="w-12 h-12 mx-auto mb-3 text-green-400" />
              <p>No issues found. Everything looks good!</p>
            </div>
          )}

          {/* Error Message */}
          {result.error && (
            <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg">
              <p className="text-red-400 font-medium">Error</p>
              <p className="text-sm text-red-300 mt-1">{result.error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// AGENT CARD COMPONENT
// ============================================================

const AgentCard: React.FC<{
  agent: AgentDefinition;
  onUpdate: (id: string, updates: Partial<AgentDefinition>) => void;
  onEdit: () => void;
  onClone: () => void;
  onExport: () => void;
  onExecute: () => void;
  isCopied: boolean;
  isExecuting: boolean;
}> = ({ agent, onUpdate, onEdit, onClone, onExport, onExecute, isCopied, isExecuting }) => {

  const getIcon = () => {
    switch (agent.identifier) {
      case 'stock-intelligence-analyst':
      case 'vendor_watchdog': return <ShieldCheckIcon className="w-6 h-6 text-orange-400" />;
      case 'traffic_controller': return <TruckIcon className="w-6 h-6 text-sky-400" />;
      case 'trust_score': return <ChartBarIcon className="w-6 h-6 text-green-400" />;
      case 'inventory_guardian': return <PackageIcon className="w-6 h-6 text-purple-400" />;
      case 'price_hunter': return <DollarSignIcon className="w-6 h-6 text-emerald-400" />;
      case 'po_intelligence': return <DocumentTextIcon className="w-6 h-6 text-blue-400" />;
      case 'stockout_prevention': return <ZapIcon className="w-6 h-6 text-red-400" />;
      case 'artwork_approval': return <PhotoIcon className="w-6 h-6 text-pink-400" />;
      case 'compliance_validator':
      case 'schema-transformer-expert': return <ShieldCheckIcon className="w-6 h-6 text-amber-400" />;
      case 'email_tracking':
      case 'email-tracking-specialist': return <MailIcon className="w-6 h-6 text-cyan-400" />;
      default: return <CpuChipIcon className="w-6 h-6 text-gray-400" />;
    }
  };

  const trustScorePercent = Math.round(agent.trustScore * 100);

  // Simulate trend based on trust score (in production, this would come from agent_trust_scores view)
  // High trust tends toward stable/improving, low trust toward declining
  const getTrend = (): 'improving' | 'stable' | 'declining' => {
    if (trustScorePercent >= 85) return 'improving';
    if (trustScorePercent >= 70) return 'stable';
    if (trustScorePercent >= 50) return Math.random() > 0.5 ? 'stable' : 'declining';
    return 'declining';
  };
  const trend = getTrend();

  const TrendIcon = trend === 'improving' ? TrendingUpIcon :
                    trend === 'declining' ? TrendingDownIcon : null;

  return (
    <div className={`relative group bg-gray-800 rounded-xl border transition-all duration-300 ${
      agent.isActive ? 'border-gray-700 hover:border-accent-500/50' : 'border-gray-800 opacity-60'
    }`}>
      {/* Built-in badge */}
      {agent.isBuiltIn && (
        <div className="absolute top-3 right-3 text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
          BUILT-IN
        </div>
      )}

      {/* Header */}
      <div className="p-6 pb-4 border-b border-gray-700/50">
        <div className="flex justify-between items-start mb-4">
          <div className="p-3 bg-gray-900 rounded-lg shadow-inner">
            {getIcon()}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-mono text-gray-500">TRUST</span>
            <div className={`flex items-center gap-1 px-2 py-1 rounded border ${
              trustScorePercent >= 80 ? 'bg-green-900/20 border-green-800' :
              trustScorePercent >= 60 ? 'bg-amber-900/20 border-amber-800' :
              'bg-red-900/20 border-red-800'
            }`}>
              <span className={`text-xl font-bold ${
                trustScorePercent >= 80 ? 'text-green-400' :
                trustScorePercent >= 60 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {trustScorePercent}%
              </span>
              {TrendIcon && (
                <TrendIcon className={`w-4 h-4 ${
                  trend === 'improving' ? 'text-green-400' : 'text-red-400'
                }`} />
              )}
            </div>
            <span className={`text-[10px] ${
              trend === 'improving' ? 'text-green-400' :
              trend === 'declining' ? 'text-red-400' : 'text-gray-500'
            }`}>
              {trend === 'improving' ? 'improving' :
               trend === 'declining' ? 'declining' : 'stable'}
            </span>
          </div>
        </div>

        <h3 className="text-xl font-bold text-white mb-2">{agent.name}</h3>
        <p className="text-sm text-gray-400 h-12 line-clamp-2">{agent.description}</p>

        {/* Capabilities badges */}
        {agent.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {agent.capabilities.slice(0, 3).map(cap => (
              <span key={cap.id} className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                {cap.name}
              </span>
            ))}
            {agent.capabilities.length > 3 && (
              <span className="text-[10px] text-gray-500">
                +{agent.capabilities.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Controls Area */}
      <div className="p-6 pt-4 space-y-6">
        {/* Autonomy Slider */}
        <div className="space-y-3">
          <div className="flex justify-between text-xs text-gray-400 uppercase font-semibold">
            <span>Mode</span>
            <span className={`
              ${agent.autonomyLevel === 'autonomous' ? 'text-purple-400' : ''}
              ${agent.autonomyLevel === 'assist' ? 'text-blue-400' : ''}
              ${agent.autonomyLevel === 'monitor' ? 'text-gray-400' : ''}
            `}>
              {agent.autonomyLevel}
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="2"
            step="1"
            value={
              agent.autonomyLevel === 'monitor' ? 0 :
              agent.autonomyLevel === 'assist' ? 1 : 2
            }
            disabled={!agent.isActive}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              const levels: ('monitor' | 'assist' | 'autonomous')[] = ['monitor', 'assist', 'autonomous'];
              onUpdate(agent.id, { autonomyLevel: levels[val] });
            }}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-500"
          />

          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
            <span>MONITOR</span>
            <span>ASSIST</span>
            <span>AUTO</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={agent.isActive}
                onChange={(e) => onUpdate(agent.id, { isActive: e.target.checked })}
              />
              <div className={`block w-10 h-6 rounded-full transition-colors ${
                agent.isActive ? 'bg-green-600' : 'bg-gray-700'
              }`} />
              <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${
                agent.isActive ? 'transform translate-x-4' : ''
              }`} />
            </div>
            <div className="ml-3 text-sm font-medium text-gray-300">
              {agent.isActive ? 'Online' : 'Paused'}
            </div>
          </label>

          <div className="flex items-center gap-1">
            {/* Execute button */}
            <button
              onClick={onExecute}
              disabled={!agent.isActive || isExecuting}
              className={`p-2 rounded transition-colors ${
                !agent.isActive
                  ? 'text-gray-600 cursor-not-allowed'
                  : isExecuting
                    ? 'text-accent-400 animate-pulse'
                    : 'text-green-400 hover:text-green-300 hover:bg-gray-700'
              }`}
              title={!agent.isActive ? 'Enable agent to execute' : isExecuting ? 'Running...' : 'Run agent now'}
            >
              {isExecuting ? (
                <div className="w-5 h-5 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <PlayIcon className="w-5 h-5" />
              )}
            </button>

            {/* Export button */}
            <button
              onClick={onExport}
              className="text-gray-400 hover:text-white p-2 rounded hover:bg-gray-700 transition-colors"
              title="Export as Markdown"
            >
              {isCopied ? (
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
              ) : (
                <ClipboardCopyIcon className="w-5 h-5" />
              )}
            </button>

            {/* Clone button (for built-in) */}
            {agent.isBuiltIn && (
              <button
                onClick={onClone}
                className="text-gray-400 hover:text-white p-2 rounded hover:bg-gray-700 transition-colors"
                title="Clone to customize"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
            )}

            {/* Edit button */}
            <button
              onClick={onEdit}
              className="text-gray-400 hover:text-white p-2 rounded hover:bg-gray-700 transition-colors"
              title={agent.isBuiltIn ? "View agent (read-only)" : "Edit agent"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentCommandCenter;
