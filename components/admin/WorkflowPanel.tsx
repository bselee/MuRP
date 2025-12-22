/**
 * Workflow Panel Component
 *
 * Displays available workflows with run buttons and results.
 * Integrates with the workflow orchestrator service.
 */

import React, { useState } from 'react';
import {
  runMorningBriefing,
  runEmailProcessingWorkflow,
  runPOCreationWorkflow,
  executePendingAction,
  type WorkflowResult,
  type PendingAction,
} from '../../services/workflowOrchestrator';
import { SunIcon, MailIcon, ShoppingCartIcon, PlayIcon, CheckCircleIcon, XCircleIcon, ClockIcon, AlertTriangleIcon } from '../icons';

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  schedule?: string;
  runner: (userId: string) => Promise<WorkflowResult>;
}

const WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'morning_briefing',
    name: 'Morning Briefing',
    description: 'Check stockouts, open POs, and vendor emails. Get your daily priority list.',
    icon: <SunIcon className="w-5 h-5 text-amber-400" />,
    schedule: 'Daily at 6 AM',
    runner: runMorningBriefing,
  },
  {
    id: 'email_processing',
    name: 'Process Vendor Emails',
    description: 'Scan inbox for tracking numbers, ETAs, and vendor updates. Auto-update POs.',
    icon: <MailIcon className="w-5 h-5 text-blue-400" />,
    schedule: 'Every 15 minutes',
    runner: runEmailProcessingWorkflow,
  },
  {
    id: 'po_creation',
    name: 'Generate Purchase Orders',
    description: 'Create POs for items below reorder point, grouped by vendor.',
    icon: <ShoppingCartIcon className="w-5 h-5 text-green-400" />,
    schedule: 'On demand',
    runner: runPOCreationWorkflow,
  },
];

export const WorkflowPanel: React.FC<{ userId: string }> = ({ userId }) => {
  const [activeWorkflow, setActiveWorkflow] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, WorkflowResult>>(new Map());
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);

  const runWorkflow = async (workflow: WorkflowDefinition) => {
    setActiveWorkflow(workflow.id);
    try {
      const result = await workflow.runner(userId);
      setResults(prev => new Map(prev).set(workflow.id, result));
      setExpandedWorkflow(workflow.id);
    } catch (err: any) {
      console.error('Workflow failed:', err);
    }
    setActiveWorkflow(null);
  };

  const handleApproveAction = async (action: PendingAction, workflowId: string) => {
    const result = await executePendingAction(action.id, action, userId);
    if (result.success) {
      // Remove the action from pending list
      const workflowResult = results.get(workflowId);
      if (workflowResult) {
        const updatedResult = {
          ...workflowResult,
          pendingActions: workflowResult.pendingActions.filter(a => a.id !== action.id),
          autoExecutedActions: [
            ...workflowResult.autoExecutedActions,
            {
              id: action.id,
              agent: action.agent,
              type: action.type,
              description: action.description,
              executedAt: new Date(),
              result: result.result,
            }
          ]
        };
        setResults(prev => new Map(prev).set(workflowId, updatedResult));
      }
    }
  };

  const handleDismissAction = (actionId: string, workflowId: string) => {
    const workflowResult = results.get(workflowId);
    if (workflowResult) {
      const updatedResult = {
        ...workflowResult,
        pendingActions: workflowResult.pendingActions.filter(a => a.id !== actionId),
      };
      setResults(prev => new Map(prev).set(workflowId, updatedResult));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <PlayIcon className="w-5 h-5 text-accent-400" />
            Workflows
          </h2>
          <p className="text-sm text-gray-400">
            Run automated workflows that chain agents together
          </p>
        </div>
      </div>

      {/* Workflow Cards */}
      <div className="space-y-4">
        {WORKFLOWS.map(workflow => {
          const result = results.get(workflow.id);
          const isRunning = activeWorkflow === workflow.id;
          const isExpanded = expandedWorkflow === workflow.id;

          return (
            <div
              key={workflow.id}
              className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
            >
              {/* Workflow Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gray-900 rounded-lg">
                    {workflow.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{workflow.name}</h3>
                    <p className="text-sm text-gray-400">{workflow.description}</p>
                    {workflow.schedule && (
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" />
                        {workflow.schedule}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {result && (
                    <button
                      onClick={() => setExpandedWorkflow(isExpanded ? null : workflow.id)}
                      className="text-gray-400 hover:text-white px-3 py-1 text-sm"
                    >
                      {isExpanded ? 'Hide' : 'Show'} Results
                    </button>
                  )}
                  <button
                    onClick={() => runWorkflow(workflow)}
                    disabled={isRunning}
                    className={`
                      px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2
                      ${isRunning
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-accent-500 hover:bg-accent-600 text-white'
                      }
                    `}
                  >
                    {isRunning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <PlayIcon className="w-4 h-4" />
                        Run Now
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Results Panel */}
              {result && isExpanded && (
                <div className="border-t border-gray-700 p-4 bg-gray-900/50">
                  {/* Summary */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      {result.success ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-400" />
                      ) : (
                        <XCircleIcon className="w-5 h-5 text-red-400" />
                      )}
                      <span className="font-medium text-white">
                        {result.success ? 'Completed' : 'Completed with errors'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(result.completedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800 p-3 rounded-lg">
                      {result.summary}
                    </pre>
                  </div>

                  {/* Auto-executed Actions */}
                  {result.autoExecutedActions.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-green-400" />
                        Auto-Executed ({result.autoExecutedActions.length})
                      </h4>
                      <div className="space-y-2">
                        {result.autoExecutedActions.map(action => (
                          <div key={action.id} className="flex items-center gap-2 text-sm text-gray-300 bg-green-900/20 px-3 py-2 rounded">
                            <CheckCircleIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
                            {action.description}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending Actions */}
                  {result.pendingActions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2">
                        <AlertTriangleIcon className="w-4 h-4 text-amber-400" />
                        Needs Your Approval ({result.pendingActions.length})
                      </h4>
                      <div className="space-y-2">
                        {result.pendingActions.map(action => (
                          <div
                            key={action.id}
                            className={`
                              p-3 rounded-lg border
                              ${action.priority === 'critical'
                                ? 'bg-red-900/20 border-red-800'
                                : action.priority === 'high'
                                  ? 'bg-amber-900/20 border-amber-800'
                                  : 'bg-gray-800 border-gray-700'
                              }
                            `}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`
                                    text-xs px-2 py-0.5 rounded uppercase font-bold
                                    ${action.priority === 'critical'
                                      ? 'bg-red-500/20 text-red-400'
                                      : action.priority === 'high'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-gray-600/20 text-gray-400'
                                    }
                                  `}>
                                    {action.priority}
                                  </span>
                                  <span className="text-xs text-gray-500">{action.agent}</span>
                                </div>
                                <p className="text-white font-medium">{action.description}</p>
                                <p className="text-sm text-gray-400 mt-1">{action.suggestedAction}</p>
                              </div>
                              <div className="flex gap-2 flex-shrink-0">
                                <button
                                  onClick={() => handleDismissAction(action.id, workflow.id)}
                                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                                >
                                  Skip
                                </button>
                                <button
                                  onClick={() => handleApproveAction(action, workflow.id)}
                                  className="px-3 py-1.5 text-sm bg-accent-500 hover:bg-accent-600 text-white rounded transition-colors"
                                >
                                  Approve
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Errors */}
                  {result.errors.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-bold text-red-400 mb-2">Errors</h4>
                      <ul className="text-sm text-red-300 space-y-1">
                        {result.errors.map((error, i) => (
                          <li key={i}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkflowPanel;
