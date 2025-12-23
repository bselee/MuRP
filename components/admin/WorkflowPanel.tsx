/**
 * Workflow Panel Component
 *
 * Visual workflow designer showing agent chains with configurable parameters.
 * Displays logical flow diagrams and allows users to tweak workflow settings.
 */

import React, { useState, useEffect } from 'react';
import {
  runMorningBriefing,
  runEmailProcessingWorkflow,
  runPOCreationWorkflow,
  executePendingAction,
  type WorkflowResult,
  type PendingAction,
} from '../../services/workflowOrchestrator';
import {
  queueAction,
  getPendingActions,
  approveAction,
  rejectAction,
  type PendingAction as DBPendingAction,
} from '../../services/actionExecutors';
import {
  SunIcon,
  MailIcon,
  ShoppingCartIcon,
  PlayIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  AlertTriangleIcon,
  RefreshIcon,
  DatabaseIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CogIcon,
  ArrowRightIcon,
  BotIcon,
  PackageIcon,
  TruckIcon,
  ShieldCheckIcon,
} from '../icons';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Workflow Step Definitions
// ═══════════════════════════════════════════════════════════════════════════

interface WorkflowStep {
  agentId: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  configurable?: {
    key: string;
    label: string;
    type: 'number' | 'boolean' | 'select';
    options?: { value: string; label: string }[];
    default: any;
  }[];
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  schedule?: string;
  steps: WorkflowStep[];
  runner: (userId: string, options?: any) => Promise<WorkflowResult>;
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  'stockout-prevention': <PackageIcon className="w-4 h-4" />,
  'po-intelligence': <ShoppingCartIcon className="w-4 h-4" />,
  'email-tracking-specialist': <MailIcon className="w-4 h-4" />,
  'air-traffic-controller': <TruckIcon className="w-4 h-4" />,
  'inventory-guardian': <ShieldCheckIcon className="w-4 h-4" />,
  'vendor-watchdog': <BotIcon className="w-4 h-4" />,
};

const WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'morning_briefing',
    name: 'Morning Briefing',
    description: 'Daily priority check across stock, POs, and vendor emails',
    icon: <SunIcon className="w-5 h-5 text-amber-400" />,
    schedule: 'Daily at 6 AM',
    steps: [
      {
        agentId: 'stockout-prevention',
        name: 'Stockout Prevention',
        description: 'Check inventory for critical stock levels',
        icon: <PackageIcon className="w-4 h-4 text-red-400" />,
        configurable: [
          { key: 'criticalThreshold', label: 'Critical Days', type: 'number', default: 7 },
          { key: 'includeSeasonalItems', label: 'Include Seasonal', type: 'boolean', default: true },
        ],
      },
      {
        agentId: 'po-intelligence',
        name: 'PO Intelligence',
        description: 'Review open and overdue purchase orders',
        icon: <ShoppingCartIcon className="w-4 h-4 text-green-400" />,
        configurable: [
          { key: 'maxOpenPOs', label: 'Max POs to Show', type: 'number', default: 20 },
        ],
      },
      {
        agentId: 'email-tracking-specialist',
        name: 'Email Tracking',
        description: 'Scan for unprocessed vendor emails',
        icon: <MailIcon className="w-4 h-4 text-blue-400" />,
        configurable: [
          { key: 'lookbackHours', label: 'Lookback Hours', type: 'number', default: 24 },
        ],
      },
      {
        agentId: 'air-traffic-controller',
        name: 'Air Traffic Controller',
        description: 'Prioritize alerts and consolidate findings',
        icon: <TruckIcon className="w-4 h-4 text-purple-400" />,
      },
    ],
    runner: runMorningBriefing,
  },
  {
    id: 'email_processing',
    name: 'Process Vendor Emails',
    description: 'Extract tracking numbers and ETAs from vendor communications',
    icon: <MailIcon className="w-5 h-5 text-blue-400" />,
    schedule: 'Every 15 minutes',
    steps: [
      {
        agentId: 'email-tracking-specialist',
        name: 'Email Scanner',
        description: 'Scan inbox for new vendor emails',
        icon: <MailIcon className="w-4 h-4 text-blue-400" />,
        configurable: [
          { key: 'maxEmails', label: 'Max Emails', type: 'number', default: 50 },
        ],
      },
      {
        agentId: 'email-tracking-specialist',
        name: 'Tracking Extractor',
        description: 'Parse tracking numbers (UPS, FedEx, USPS)',
        icon: <TruckIcon className="w-4 h-4 text-amber-400" />,
      },
      {
        agentId: 'po-intelligence',
        name: 'PO Updater',
        description: 'Link tracking to purchase orders',
        icon: <ShoppingCartIcon className="w-4 h-4 text-green-400" />,
        configurable: [
          { key: 'autoUpdatePO', label: 'Auto-Update POs', type: 'boolean', default: false },
        ],
      },
    ],
    runner: runEmailProcessingWorkflow,
  },
  {
    id: 'po_creation',
    name: 'Generate Purchase Orders',
    description: 'Create POs for items below reorder point, grouped by vendor',
    icon: <ShoppingCartIcon className="w-5 h-5 text-green-400" />,
    schedule: 'On demand',
    steps: [
      {
        agentId: 'stockout-prevention',
        name: 'Reorder Analysis',
        description: 'Identify items below ROP',
        icon: <PackageIcon className="w-4 h-4 text-red-400" />,
        configurable: [
          { key: 'severityFilter', label: 'Severity', type: 'select', default: 'high', options: [
            { value: 'critical', label: 'Critical Only' },
            { value: 'high', label: 'High + Critical' },
            { value: 'all', label: 'All Alerts' },
          ]},
        ],
      },
      {
        agentId: 'vendor-watchdog',
        name: 'Vendor Selection',
        description: 'Match items to preferred vendors',
        icon: <BotIcon className="w-4 h-4 text-cyan-400" />,
        configurable: [
          { key: 'preferReliable', label: 'Prefer Reliable Vendors', type: 'boolean', default: true },
        ],
      },
      {
        agentId: 'po-intelligence',
        name: 'PO Generator',
        description: 'Create grouped purchase orders',
        icon: <ShoppingCartIcon className="w-4 h-4 text-green-400" />,
        configurable: [
          { key: 'autoSubmit', label: 'Auto-Submit POs', type: 'boolean', default: false },
          { key: 'minOrderValue', label: 'Min Order Value ($)', type: 'number', default: 100 },
        ],
      },
    ],
    runner: runPOCreationWorkflow,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 Workflow Step Component
// ═══════════════════════════════════════════════════════════════════════════

interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  parameters: Record<string, any>;
  onParameterChange: (key: string, value: any) => void;
  status?: 'pending' | 'running' | 'completed' | 'error';
}

const WorkflowStepCard: React.FC<WorkflowStepCardProps> = ({
  step,
  index,
  isLast,
  isExpanded,
  onToggle,
  parameters,
  onParameterChange,
  status = 'pending',
}) => {
  const statusColors = {
    pending: 'border-gray-600 bg-gray-800/50',
    running: 'border-blue-500 bg-blue-900/20 animate-pulse',
    completed: 'border-green-500 bg-green-900/20',
    error: 'border-red-500 bg-red-900/20',
  };

  const statusIcons = {
    pending: <div className="w-2 h-2 rounded-full bg-gray-500" />,
    running: <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />,
    completed: <CheckCircleIcon className="w-4 h-4 text-green-400" />,
    error: <XCircleIcon className="w-4 h-4 text-red-400" />,
  };

  return (
    <div className="flex items-start">
      {/* Step indicator */}
      <div className="flex flex-col items-center mr-3">
        <div className={`
          w-8 h-8 rounded-full flex items-center justify-center
          ${status === 'completed' ? 'bg-green-600' : status === 'running' ? 'bg-blue-600' : 'bg-gray-700'}
          text-white text-sm font-bold
        `}>
          {index + 1}
        </div>
        {!isLast && (
          <div className={`w-0.5 h-8 ${status === 'completed' ? 'bg-green-600' : 'bg-gray-600'}`} />
        )}
      </div>

      {/* Step content */}
      <div className={`flex-1 rounded-lg border p-3 mb-2 ${statusColors[status]}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step.icon}
            <span className="font-medium text-white text-sm">{step.name}</span>
            {statusIcons[status]}
          </div>
          {step.configurable && step.configurable.length > 0 && (
            <button
              onClick={onToggle}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700/50"
            >
              <CogIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">{step.description}</p>

        {/* Configurable parameters */}
        {isExpanded && step.configurable && (
          <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
            {step.configurable.map((config) => (
              <div key={config.key} className="flex items-center justify-between">
                <label className="text-xs text-gray-300">{config.label}</label>
                {config.type === 'number' && (
                  <input
                    type="number"
                    value={parameters[config.key] ?? config.default}
                    onChange={(e) => onParameterChange(config.key, parseInt(e.target.value))}
                    className="w-20 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
                  />
                )}
                {config.type === 'boolean' && (
                  <button
                    onClick={() => onParameterChange(config.key, !(parameters[config.key] ?? config.default))}
                    className={`
                      px-2 py-1 text-xs rounded transition-colors
                      ${(parameters[config.key] ?? config.default)
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-600 text-gray-300'
                      }
                    `}
                  >
                    {(parameters[config.key] ?? config.default) ? 'On' : 'Off'}
                  </button>
                )}
                {config.type === 'select' && config.options && (
                  <select
                    value={parameters[config.key] ?? config.default}
                    onChange={(e) => onParameterChange(config.key, e.target.value)}
                    className="px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
                  >
                    {config.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Workflow Card Component
// ═══════════════════════════════════════════════════════════════════════════

interface WorkflowCardProps {
  workflow: WorkflowDefinition;
  userId: string;
  onComplete: (result: WorkflowResult) => void;
}

const WorkflowCard: React.FC<WorkflowCardProps> = ({ workflow, userId, onComplete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [stepStatus, setStepStatus] = useState<Map<number, 'pending' | 'running' | 'completed' | 'error'>>(new Map());
  const [parameters, setParameters] = useState<Record<string, any>>({});

  const toggleStep = (index: number) => {
    const newSet = new Set(expandedSteps);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setExpandedSteps(newSet);
  };

  const handleParameterChange = (key: string, value: any) => {
    setParameters((prev) => ({ ...prev, [key]: value }));
  };

  const runWorkflow = async () => {
    setIsRunning(true);
    setResult(null);
    setIsExpanded(true);

    // Simulate step-by-step progress
    for (let i = 0; i < workflow.steps.length; i++) {
      setStepStatus((prev) => new Map(prev).set(i, 'running'));
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));
      setStepStatus((prev) => new Map(prev).set(i, 'completed'));
    }

    try {
      const workflowResult = await workflow.runner(userId, parameters);
      setResult(workflowResult);
      onComplete(workflowResult);
    } catch (err: any) {
      console.error('Workflow failed:', err);
      setStepStatus((prev) => new Map(prev).set(workflow.steps.length - 1, 'error'));
    }

    setIsRunning(false);
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
            >
              {isExpanded
                ? <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                : <ChevronRightIcon className="w-5 h-5 text-gray-400" />
              }
            </button>
            <div className="p-2 bg-gray-900 rounded-lg">
              {workflow.icon}
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">{workflow.name}</h3>
              <p className="text-xs text-gray-400">{workflow.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Flow preview */}
            {!isExpanded && (
              <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
                {workflow.steps.slice(0, 4).map((step, i) => (
                  <React.Fragment key={step.agentId + i}>
                    <div className="p-1 bg-gray-700 rounded" title={step.name}>
                      {step.icon}
                    </div>
                    {i < Math.min(workflow.steps.length - 1, 3) && (
                      <ArrowRightIcon className="w-3 h-3 text-gray-600" />
                    )}
                  </React.Fragment>
                ))}
                {workflow.steps.length > 4 && (
                  <span className="text-gray-500">+{workflow.steps.length - 4}</span>
                )}
              </div>
            )}

            {workflow.schedule && (
              <span className="text-xs text-gray-500 hidden md:flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                {workflow.schedule}
              </span>
            )}

            <button
              onClick={runWorkflow}
              disabled={isRunning}
              className={`
                px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2
                ${isRunning
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-accent-500 hover:bg-accent-600 text-white'
                }
              `}
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Running
                </>
              ) : (
                <>
                  <PlayIcon className="w-4 h-4" />
                  Run
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded content with flow diagram */}
      {isExpanded && (
        <div className="border-t border-gray-700 p-4 bg-gray-900/30">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Flow diagram */}
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                <BotIcon className="w-4 h-4" />
                Agent Flow
              </h4>
              <div className="space-y-0">
                {workflow.steps.map((step, index) => (
                  <WorkflowStepCard
                    key={`${step.agentId}-${index}`}
                    step={step}
                    index={index}
                    isLast={index === workflow.steps.length - 1}
                    isExpanded={expandedSteps.has(index)}
                    onToggle={() => toggleStep(index)}
                    parameters={parameters}
                    onParameterChange={handleParameterChange}
                    status={stepStatus.get(index) || 'pending'}
                  />
                ))}
              </div>
            </div>

            {/* Results panel */}
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                {result ? (
                  result.success
                    ? <CheckCircleIcon className="w-4 h-4 text-green-400" />
                    : <AlertTriangleIcon className="w-4 h-4 text-red-400" />
                ) : (
                  <ClockIcon className="w-4 h-4 text-gray-400" />
                )}
                Results
              </h4>
              {result ? (
                <div className="space-y-3">
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-gray-800 p-3 rounded-lg border border-gray-700">
                    {result.summary}
                  </pre>

                  {result.autoExecutedActions.length > 0 && (
                    <div className="bg-green-900/20 border border-green-800 rounded-lg p-3">
                      <p className="text-xs font-medium text-green-400 mb-2">
                        Auto-Executed ({result.autoExecutedActions.length})
                      </p>
                      <ul className="space-y-1">
                        {result.autoExecutedActions.slice(0, 5).map((action) => (
                          <li key={action.id} className="text-xs text-green-300 flex items-center gap-2">
                            <CheckCircleIcon className="w-3 h-3" />
                            {action.description}
                          </li>
                        ))}
                        {result.autoExecutedActions.length > 5 && (
                          <li className="text-xs text-green-400">
                            +{result.autoExecutedActions.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {result.pendingActions.length > 0 && (
                    <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-3">
                      <p className="text-xs font-medium text-amber-400 mb-2">
                        Needs Approval ({result.pendingActions.length})
                      </p>
                      <ul className="space-y-1">
                        {result.pendingActions.slice(0, 5).map((action) => (
                          <li key={action.id} className="text-xs text-amber-300 flex items-center gap-2">
                            <AlertTriangleIcon className="w-3 h-3" />
                            {action.description}
                          </li>
                        ))}
                        {result.pendingActions.length > 5 && (
                          <li className="text-xs text-amber-400">
                            +{result.pendingActions.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {result.errors.length > 0 && (
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
                      <p className="text-xs font-medium text-red-400 mb-2">Errors</p>
                      <ul className="text-xs text-red-300 space-y-1">
                        {result.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-400">
                    {isRunning ? 'Workflow in progress...' : 'Run workflow to see results'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 Main Workflow Panel
// ═══════════════════════════════════════════════════════════════════════════

export const WorkflowPanel: React.FC<{ userId: string }> = ({ userId }) => {
  const [dbPendingActions, setDbPendingActions] = useState<DBPendingAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);

  // Load persistent pending actions from database
  const loadPendingActions = async () => {
    setLoadingActions(true);
    try {
      const actions = await getPendingActions(userId);
      setDbPendingActions(actions);
    } catch (err) {
      console.error('Failed to load pending actions:', err);
    }
    setLoadingActions(false);
  };

  useEffect(() => {
    loadPendingActions();
  }, [userId]);

  const handleWorkflowComplete = (result: WorkflowResult) => {
    // Refresh pending actions after workflow completes
    loadPendingActions();
  };

  // Handle approval of database-persisted actions
  const handleApproveDBAction = async (action: DBPendingAction) => {
    setExecutingAction(action.id);
    try {
      const result = await approveAction(action.id, userId);
      if (result.success) {
        setDbPendingActions((prev) => prev.filter((a) => a.id !== action.id));
      }
    } catch (err) {
      console.error('Failed to approve action:', err);
    }
    setExecutingAction(null);
  };

  // Handle rejection of database-persisted actions
  const handleRejectDBAction = async (action: DBPendingAction, reason?: string) => {
    setExecutingAction(action.id);
    try {
      await rejectAction(action.id, userId, reason);
      setDbPendingActions((prev) => prev.filter((a) => a.id !== action.id));
    } catch (err) {
      console.error('Failed to reject action:', err);
    }
    setExecutingAction(null);
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500/20 text-red-400 border-red-800';
      case 'high':
        return 'bg-amber-500/20 text-amber-400 border-amber-800';
      case 'normal':
        return 'bg-blue-500/20 text-blue-400 border-blue-800';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlayIcon className="w-5 h-5 text-accent-400" />
          <h2 className="text-lg font-bold text-white">Workflows</h2>
          <span className="text-xs text-gray-500">({WORKFLOWS.length} available)</span>
        </div>
        {dbPendingActions.length > 0 && (
          <span className="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-full">
            {dbPendingActions.length} pending
          </span>
        )}
      </div>

      {/* Persistent Pending Actions Queue (collapsed by default) */}
      {dbPendingActions.length > 0 && (
        <details className="bg-amber-900/20 border border-amber-700 rounded-xl">
          <summary className="p-3 cursor-pointer flex items-center justify-between">
            <span className="font-medium text-amber-400 flex items-center gap-2">
              <DatabaseIcon className="w-4 h-4" />
              Pending Actions ({dbPendingActions.length})
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                loadPendingActions();
              }}
              disabled={loadingActions}
              className="text-amber-400 hover:text-amber-300 p-1 rounded"
            >
              <RefreshIcon className={`w-4 h-4 ${loadingActions ? 'animate-spin' : ''}`} />
            </button>
          </summary>
          <div className="p-3 pt-0 space-y-2">
            {dbPendingActions.map((action) => (
              <div key={action.id} className={`p-3 rounded-lg border ${getPriorityColor(action.priority)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={`
                        text-xs px-2 py-0.5 rounded uppercase font-bold
                        ${
                          action.priority === 'urgent'
                            ? 'bg-red-500/30 text-red-300'
                            : action.priority === 'high'
                              ? 'bg-amber-500/30 text-amber-300'
                              : 'bg-gray-600/30 text-gray-300'
                        }
                      `}
                      >
                        {action.priority}
                      </span>
                      <span className="text-xs text-gray-500 truncate">
                        {action.agentIdentifier || 'Unknown Agent'}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium truncate">{action.actionLabel}</p>
                    {action.reasoning && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{action.reasoning}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRejectDBAction(action, 'Skipped by user')}
                      disabled={executingAction === action.id}
                      className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => handleApproveDBAction(action)}
                      disabled={executingAction === action.id}
                      className="px-2 py-1 text-xs bg-accent-500 hover:bg-accent-600 text-white rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      {executingAction === action.id ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Execute'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Workflow Cards */}
      <div className="space-y-3">
        {WORKFLOWS.map((workflow) => (
          <WorkflowCard
            key={workflow.id}
            workflow={workflow}
            userId={userId}
            onComplete={handleWorkflowComplete}
          />
        ))}
      </div>
    </div>
  );
};

export default WorkflowPanel;
