/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔧 MCP TOOLS PANEL - Rube & External Tool Integrations
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Central hub for managing MCP (Model Context Protocol) integrations:
 * - Rube connection status and tool discovery
 * - Recipe monitoring
 * - Tool execution history
 * - Agent tool configuration
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import Button from '@/components/ui/Button';
import {
  LinkIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshIcon,
  PlayIcon,
  ClockIcon,
  ZapIcon,
  MailIcon,
  SlackIcon,
} from '@/components/icons';
import {
  isRubeConfigured,
  checkConnection,
  listTools,
  getRecentExecutions,
  type RubeTool,
  type RubeConnectionStatus,
} from '@/services/rubeService';

interface MCPToolsPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const MCPToolsPanel: React.FC<MCPToolsPanelProps> = ({ addToast }) => {
  const { isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<RubeConnectionStatus | null>(null);
  const [tools, setTools] = useState<RubeTool[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<Array<{
    tool_name: string;
    success: boolean;
    executed_at: string;
    execution_time_ms?: number;
  }>>([]);
  const [activeTab, setActiveTab] = useState<'status' | 'tools' | 'history'>('status');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      if (isRubeConfigured()) {
        const [status, toolList, executions] = await Promise.all([
          checkConnection(),
          listTools(),
          getRecentExecutions(20),
        ]);
        setConnectionStatus(status);
        setTools(toolList);
        setRecentExecutions(executions);
      } else {
        setConnectionStatus({
          connected: false,
          toolCount: 0,
          lastChecked: new Date().toISOString(),
          error: 'Not configured',
        });
      }
    } catch (error) {
      console.error('Failed to load MCP data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    addToast?.('Refreshed MCP status', 'success');
  };

  // Styles
  const cardClass = `rounded-lg p-6 ${isDark ? 'bg-gray-800/50 border border-gray-700' : 'bg-white border border-gray-200 shadow-sm'}`;
  const tabClass = (active: boolean) => `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    active
      ? isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'
      : isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700/50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
  }`;

  // Get icon for tool based on name
  const getToolIcon = (toolName: string) => {
    const name = toolName.toLowerCase();
    if (name.includes('gmail') || name.includes('email')) {
      return <MailIcon className="w-4 h-4" />;
    }
    if (name.includes('slack')) {
      return <SlackIcon className="w-4 h-4" />;
    }
    return <ZapIcon className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className={cardClass}>
        <div className="flex items-center justify-center py-12">
          <RefreshIcon className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            MCP Tools & Rube Integration
          </h2>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Connect AI agents to external tools via Model Context Protocol
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="secondary" size="sm">
          <RefreshIcon className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Connection Status Card */}
      <div className={`rounded-lg p-4 ${
        connectionStatus?.connected
          ? isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'
          : isDark ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              connectionStatus?.connected
                ? isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'
                : isDark ? 'bg-amber-500/20' : 'bg-amber-100'
            }`}>
              {connectionStatus?.connected ? (
                <CheckCircleIcon className={`w-5 h-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              ) : (
                <AlertCircleIcon className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
              )}
            </div>
            <div>
              <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {connectionStatus?.connected ? 'Rube MCP Connected' : 'Rube MCP Not Connected'}
              </p>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {connectionStatus?.connected
                  ? `${connectionStatus.toolCount} tools available`
                  : connectionStatus?.error || 'Configure environment variables to connect'}
              </p>
            </div>
          </div>
          {connectionStatus?.connected && connectionStatus.mcpUrl && (
            <code className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
              {connectionStatus.mcpUrl}
            </code>
          )}
        </div>
      </div>

      {/* Setup Instructions (if not connected) */}
      {!connectionStatus?.connected && (
        <div className={cardClass}>
          <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Setup Instructions
          </h3>
          <ol className={`space-y-3 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            <li className="flex gap-3">
              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}>1</span>
              <div>
                <p>Go to <a href="https://rube.app/mcp" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline font-medium">rube.app/mcp</a></p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}>2</span>
              <div>
                <p>Copy the MCP URL and Authorization token</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}>3</span>
              <div>
                <p>Add to your <code className={`px-1 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>.env.local</code>:</p>
                <pre className={`mt-2 p-3 rounded text-xs ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
{`VITE_RUBE_MCP_URL=https://rube.app/mcp
VITE_RUBE_AUTH_TOKEN=eyJhb...your-token`}
                </pre>
              </div>
            </li>
            <li className="flex gap-3">
              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}>4</span>
              <div>
                <p>Restart the application and refresh this page</p>
              </div>
            </li>
          </ol>
        </div>
      )}

      {/* Tabs (only show if connected) */}
      {connectionStatus?.connected && (
        <>
          <div className="flex gap-2 border-b border-gray-700 pb-2">
            <button className={tabClass(activeTab === 'status')} onClick={() => setActiveTab('status')}>
              <LinkIcon className="w-4 h-4 inline mr-2" />
              Overview
            </button>
            <button className={tabClass(activeTab === 'tools')} onClick={() => setActiveTab('tools')}>
              <ZapIcon className="w-4 h-4 inline mr-2" />
              Available Tools ({tools.length})
            </button>
            <button className={tabClass(activeTab === 'history')} onClick={() => setActiveTab('history')}>
              <ClockIcon className="w-4 h-4 inline mr-2" />
              Execution History
            </button>
          </div>

          {/* Overview Tab */}
          {activeTab === 'status' && (
            <div className={cardClass}>
              <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                What AI Agents Can Do with Rube
              </h3>

              <div className="grid md:grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <MailIcon className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                    <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Gmail Integration</h4>
                  </div>
                  <ul className={`text-sm space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <li>• Parse vendor emails for PO status</li>
                    <li>• Extract tracking numbers automatically</li>
                    <li>• Detect shipping delays and exceptions</li>
                    <li>• Send follow-up emails</li>
                  </ul>
                </div>

                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <SlackIcon className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                    <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Slack Integration</h4>
                  </div>
                  <ul className={`text-sm space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <li>• Post PO summaries to channels</li>
                    <li>• Send alerts for overdue orders</li>
                    <li>• Auto-acknowledge mentions</li>
                    <li>• Interactive message buttons</li>
                  </ul>
                </div>

                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <PlayIcon className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                    <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Scheduled Recipes</h4>
                  </div>
                  <ul className={`text-sm space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <li>• Daily Request Summary (5 PM)</li>
                    <li>• PO Summary Friday/Monday (8 AM)</li>
                    <li>• Auto-acknowledge Slack (30 min)</li>
                    <li>• Custom workflows via rube.app</li>
                  </ul>
                </div>

                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ZapIcon className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                    <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>On-Demand Actions</h4>
                  </div>
                  <ul className={`text-sm space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <li>• Trigger recipes from MuRP</li>
                    <li>• Agent-initiated tool calls</li>
                    <li>• Data sync workflows</li>
                    <li>• Custom integrations</li>
                  </ul>
                </div>
              </div>

              <div className={`mt-4 p-3 rounded-lg ${isDark ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-cyan-50 border border-cyan-200'}`}>
                <p className={`text-sm ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>
                  <strong>Tip:</strong> Create new recipes at{' '}
                  <a href="https://rube.app" target="_blank" rel="noopener noreferrer" className="underline">rube.app</a>
                  {' '}and they'll automatically be available to MuRP's AI agents.
                </p>
              </div>
            </div>
          )}

          {/* Tools Tab */}
          {activeTab === 'tools' && (
            <div className={cardClass}>
              <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Available MCP Tools
              </h3>

              {tools.length === 0 ? (
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  No tools discovered. Check your Rube configuration.
                </p>
              ) : (
                <div className="space-y-2">
                  {tools.map((tool) => (
                    <div
                      key={tool.name}
                      className={`p-3 rounded-lg ${isDark ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded ${isDark ? 'bg-gray-700' : 'bg-white'}`}>
                          {getToolIcon(tool.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {tool.name}
                          </p>
                          {tool.description && (
                            <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                              {tool.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className={cardClass}>
              <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Recent Tool Executions
              </h3>

              {recentExecutions.length === 0 ? (
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  No tool executions recorded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentExecutions.map((exec, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg flex items-center justify-between ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${exec.success ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {exec.tool_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        {exec.execution_time_ms && (
                          <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                            {exec.execution_time_ms}ms
                          </span>
                        )}
                        <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                          {new Date(exec.executed_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MCPToolsPanel;
