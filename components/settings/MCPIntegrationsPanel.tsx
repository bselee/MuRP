/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔌 MCP INTEGRATIONS PANEL - Unified MCP Configuration
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Consolidated panel for all MCP (Model Context Protocol) integrations:
 * - Rube MCP (external tools: Gmail, Slack, recipes)
 * - Compliance MCP Server (localhost AI-powered compliance)
 * - User access controls (admin can enable/disable for specific users)
 *
 * Admin-only: Manages MCP features across the organization
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import Button from '@/components/ui/Button';
import {
  ServerStackIcon,
  LinkIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshIcon,
  PlayIcon,
  ClockIcon,
  ZapIcon,
  MailIcon,
  SlackIcon,
  UserIcon,
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon,
  UsersIcon,
} from '@/components/icons';
import {
  isRubeConfigured,
  checkConnection,
  listTools,
  getRecentExecutions,
  type RubeTool,
  type RubeConnectionStatus,
} from '@/services/rubeService';
import { supabase } from '@/lib/supabase/client';

interface MCPIntegrationsPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Compliance MCP tool definitions
interface MCPTool {
  name: string;
  displayName: string;
  description: string;
  requiresAI: boolean;
}

const COMPLIANCE_TOOLS: MCPTool[] = [
  { name: 'onboard_user', displayName: 'Onboard User', description: 'Initialize compliance profile for a new user', requiresAI: false },
  { name: 'add_regulatory_source', displayName: 'Add Regulatory Source', description: 'Add state or federal regulatory data source', requiresAI: false },
  { name: 'basic_compliance_check', displayName: 'Basic Compliance Check', description: 'Quick rule-based compliance verification', requiresAI: false },
  { name: 'extract_label_text', displayName: 'Extract Label Text', description: 'OCR text extraction from label images', requiresAI: false },
  { name: 'full_ai_compliance_check', displayName: 'Full AI Compliance Check', description: 'Deep AI-powered compliance analysis', requiresAI: true },
  { name: 'scrape_state_regulation', displayName: 'Scrape State Regulation', description: 'Fetch live regulatory data from state websites', requiresAI: false },
  { name: 'research_ingredient_regulations', displayName: 'Research Ingredient Regulations', description: 'Research state-by-state regulations using Perplexity AI', requiresAI: true },
  { name: 'research_ingredient_sds', displayName: 'Research Ingredient SDS', description: 'Discover SDS hazard data using Perplexity AI', requiresAI: true },
];

// User MCP access record
interface UserMCPAccess {
  user_id: string;
  user_email: string;
  user_name: string;
  rube_enabled: boolean;
  compliance_mcp_enabled: boolean;
  updated_at: string;
}

const MCPIntegrationsPanel: React.FC<MCPIntegrationsPanelProps> = ({ addToast }) => {
  const { isDark } = useTheme();

  // Tab state
  const [activeTab, setActiveTab] = useState<'rube' | 'compliance' | 'users'>('rube');

  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testingCompliance, setTestingCompliance] = useState(false);

  // Rube state
  const [rubeStatus, setRubeStatus] = useState<RubeConnectionStatus | null>(null);
  const [rubeTools, setRubeTools] = useState<RubeTool[]>([]);
  const [rubeExecutions, setRubeExecutions] = useState<Array<{
    tool_name: string;
    success: boolean;
    executed_at: string;
    execution_time_ms?: number;
  }>>([]);

  // Compliance MCP state
  const [complianceServerUrl, setComplianceServerUrl] = useState('http://localhost:8000');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [perplexityApiKey, setPerplexityApiKey] = useState('');
  const [complianceEnabled, setComplianceEnabled] = useState(false);
  const [complianceHealthy, setComplianceHealthy] = useState<boolean | null>(null);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showPerplexityKey, setShowPerplexityKey] = useState(false);

  // User access state
  const [users, setUsers] = useState<UserMCPAccess[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      loadRubeData(),
      loadComplianceConfig(),
      loadUserAccess(),
    ]);
    setLoading(false);
  };

  const loadRubeData = async () => {
    try {
      if (isRubeConfigured()) {
        const [status, toolList, executions] = await Promise.all([
          checkConnection(),
          listTools(),
          getRecentExecutions(10),
        ]);
        setRubeStatus(status);
        setRubeTools(toolList);
        setRubeExecutions(executions);
      } else {
        setRubeStatus({
          connected: false,
          toolCount: 0,
          lastChecked: new Date().toISOString(),
          error: 'Environment variables not configured',
        });
      }
    } catch (error) {
      console.error('Failed to load Rube data:', error);
    }
  };

  const loadComplianceConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('mcp_server_configs')
        .select('*')
        .eq('server_name', 'compliance_mcp')
        .single();

      if (!error && data) {
        setComplianceServerUrl(data.server_url || 'http://localhost:8000');
        setAnthropicApiKey(data.anthropic_api_key || '');
        setPerplexityApiKey(data.perplexity_api_key || '');
        setComplianceEnabled(data.is_enabled || false);
        setComplianceHealthy(data.health_status === 'healthy');
      }
    } catch (error) {
      console.error('Failed to load compliance config:', error);
    }
  };

  const loadUserAccess = async () => {
    setLoadingUsers(true);
    try {
      // Get all users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email, full_name')
        .order('full_name');

      if (usersError) throw usersError;

      // Get MCP access settings
      const { data: accessData } = await supabase
        .from('user_mcp_access')
        .select('*');

      const accessMap = new Map(accessData?.map(a => [a.user_id, a]) || []);

      const userAccess: UserMCPAccess[] = (usersData || []).map(user => ({
        user_id: user.id,
        user_email: user.email,
        user_name: user.full_name || user.email,
        rube_enabled: accessMap.get(user.id)?.rube_enabled ?? false,
        compliance_mcp_enabled: accessMap.get(user.id)?.compliance_mcp_enabled ?? false,
        updated_at: accessMap.get(user.id)?.updated_at || '',
      }));

      setUsers(userAccess);
    } catch (error) {
      console.error('Failed to load user access:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
    addToast?.('MCP status refreshed', 'success');
  };

  const handleSaveComplianceConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('mcp_server_configs')
        .upsert({
          server_name: 'compliance_mcp',
          server_url: complianceServerUrl,
          anthropic_api_key: anthropicApiKey,
          perplexity_api_key: perplexityApiKey,
          is_enabled: complianceEnabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'server_name' });

      if (error) throw error;
      addToast?.('Compliance MCP configuration saved', 'success');
    } catch (error) {
      console.error('Failed to save compliance config:', error);
      addToast?.('Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestComplianceConnection = async () => {
    setTestingCompliance(true);
    try {
      const response = await fetch(`${complianceServerUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setComplianceHealthy(true);
        await supabase
          .from('mcp_server_configs')
          .update({
            health_status: 'healthy',
            last_health_check: new Date().toISOString(),
          })
          .eq('server_name', 'compliance_mcp');
        addToast?.('Compliance MCP server is healthy', 'success');
      } else {
        setComplianceHealthy(false);
        addToast?.(`Connection failed: ${response.statusText}`, 'error');
      }
    } catch (error) {
      setComplianceHealthy(false);
      addToast?.('Connection test failed - is the server running?', 'error');
    } finally {
      setTestingCompliance(false);
    }
  };

  const handleToggleUserAccess = async (userId: string, field: 'rube_enabled' | 'compliance_mcp_enabled', value: boolean) => {
    try {
      const { error } = await supabase
        .from('user_mcp_access')
        .upsert({
          user_id: userId,
          [field]: value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setUsers(prev => prev.map(u =>
        u.user_id === userId ? { ...u, [field]: value } : u
      ));
      addToast?.(`User access updated`, 'success');
    } catch (error) {
      console.error('Failed to update user access:', error);
      addToast?.('Failed to update user access', 'error');
    }
  };

  // Styles
  const cardClass = `rounded-lg p-6 ${isDark ? 'bg-gray-800/50 border border-gray-700' : 'bg-white border border-gray-200 shadow-sm'}`;
  const inputClass = `w-full px-3 py-2 rounded-lg border ${isDark
    ? 'bg-gray-900 border-gray-700 text-white focus:border-gray-500'
    : 'bg-white border-gray-300 text-gray-900 focus:border-gray-500'
  } focus:outline-none`;
  const tabClass = (active: boolean) => `px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
    active
      ? isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'
      : isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700/50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
  }`;

  const getToolIcon = (toolName: string) => {
    const name = toolName.toLowerCase();
    if (name.includes('gmail') || name.includes('email')) return <MailIcon className="w-4 h-4" />;
    if (name.includes('slack')) return <SlackIcon className="w-4 h-4" />;
    return <ZapIcon className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className={cardClass}>
        <div className="flex items-center justify-center py-12">
          <RefreshIcon className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-400">Loading MCP integrations...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ServerStackIcon className={`w-8 h-8 ${isDark ? 'text-white' : 'text-gray-800'}`} />
          <div>
            <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              MCP Integrations
            </h2>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Model Context Protocol tools and external integrations
            </p>
          </div>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="secondary" size="sm">
          <RefreshIcon className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Quick Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`p-4 rounded-lg ${
          rubeStatus?.connected
            ? isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'
            : isDark ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            {rubeStatus?.connected ? (
              <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircleIcon className={`w-5 h-5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            )}
            <div>
              <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Rube MCP</p>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {rubeStatus?.connected ? `${rubeStatus.toolCount} tools` : 'Not configured'}
              </p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-lg ${
          complianceHealthy
            ? isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'
            : isDark ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            {complianceHealthy ? (
              <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircleIcon className={`w-5 h-5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            )}
            <div>
              <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Compliance MCP</p>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {complianceHealthy ? 'Server healthy' : complianceEnabled ? 'Server offline' : 'Not enabled'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        <button className={tabClass(activeTab === 'rube')} onClick={() => setActiveTab('rube')}>
          <LinkIcon className="w-4 h-4" />
          Rube Tools
        </button>
        <button className={tabClass(activeTab === 'compliance')} onClick={() => setActiveTab('compliance')}>
          <ServerStackIcon className="w-4 h-4" />
          Compliance Server
        </button>
        <button className={tabClass(activeTab === 'users')} onClick={() => setActiveTab('users')}>
          <UsersIcon className="w-4 h-4" />
          User Access
        </button>
      </div>

      {/* Rube Tab */}
      {activeTab === 'rube' && (
        <div className="space-y-6">
          {!rubeStatus?.connected ? (
            <div className={cardClass}>
              <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Setup Rube MCP
              </h3>
              <ol className={`space-y-3 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <li className="flex gap-3">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                  }`}>1</span>
                  <span>Go to <a href="https://rube.app/mcp" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">rube.app/mcp</a></span>
                </li>
                <li className="flex gap-3">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                  }`}>2</span>
                  <span>Copy the MCP URL and JWT token</span>
                </li>
                <li className="flex gap-3">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                  }`}>3</span>
                  <div>
                    <span>Add to <code className={`px-1 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>.env.local</code>:</span>
                    <pre className={`mt-2 p-3 rounded text-xs ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
{`VITE_RUBE_MCP_URL=https://rube.app/mcp
VITE_RUBE_AUTH_TOKEN=your-jwt-token`}
                    </pre>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                  }`}>4</span>
                  <span>Restart the application</span>
                </li>
              </ol>
            </div>
          ) : (
            <>
              {/* Rube capabilities */}
              <div className={cardClass}>
                <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Rube Capabilities
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <MailIcon className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                      <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Gmail</h4>
                    </div>
                    <ul className={`text-sm space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      <li>Parse vendor emails for PO status</li>
                      <li>Extract tracking numbers</li>
                      <li>Send follow-up emails</li>
                    </ul>
                  </div>
                  <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <SlackIcon className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                      <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Slack</h4>
                    </div>
                    <ul className={`text-sm space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      <li>Post PO summaries</li>
                      <li>Send alerts for overdue orders</li>
                      <li>Interactive buttons</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Available tools */}
              <div className={cardClass}>
                <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Available Tools ({rubeTools.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {rubeTools.map((tool) => (
                    <div key={tool.name} className={`p-3 rounded-lg flex items-center gap-3 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                      <div className={`p-2 rounded ${isDark ? 'bg-gray-700' : 'bg-white'}`}>
                        {getToolIcon(tool.name)}
                      </div>
                      <div>
                        <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{tool.name}</p>
                        {tool.description && (
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{tool.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Compliance MCP Tab */}
      {activeTab === 'compliance' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Compliance MCP Server
            </h3>
            <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Configure the local Python MCP server for AI-powered compliance checks.
            </p>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Server URL
                </label>
                <input
                  type="text"
                  value={complianceServerUrl}
                  onChange={(e) => setComplianceServerUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Anthropic API Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showAnthropicKey ? 'text' : 'password'}
                    value={anthropicApiKey}
                    onChange={(e) => setAnthropicApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showAnthropicKey ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Perplexity API Key <span className="text-purple-500 text-xs">(Regulatory Research)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPerplexityKey ? 'text' : 'password'}
                    value={perplexityApiKey}
                    onChange={(e) => setPerplexityApiKey(e.target.value)}
                    placeholder="pplx-..."
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPerplexityKey(!showPerplexityKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPerplexityKey ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <input
                  type="checkbox"
                  checked={complianceEnabled}
                  onChange={(e) => setComplianceEnabled(e.target.checked)}
                  className="rounded border-gray-600"
                />
                <span className="text-sm">Enable Compliance MCP integration</span>
              </label>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleTestComplianceConnection}
                  disabled={testingCompliance || !complianceServerUrl}
                  variant="secondary"
                >
                  <RefreshIcon className={`w-4 h-4 mr-2 ${testingCompliance ? 'animate-spin' : ''}`} />
                  {testingCompliance ? 'Testing...' : 'Test Connection'}
                </Button>
                <Button onClick={handleSaveComplianceConfig} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </div>
          </div>

          {/* Compliance tools list */}
          <div className={cardClass}>
            <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Available Compliance Tools ({COMPLIANCE_TOOLS.length})
            </h3>
            <div className="space-y-2">
              {COMPLIANCE_TOOLS.map((tool) => (
                <div key={tool.name} className={`p-3 rounded-lg flex items-start gap-3 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{tool.displayName}</p>
                      {tool.requiresAI && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400 rounded">
                          AI Required
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{tool.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* User Access Tab */}
      {activeTab === 'users' && (
        <div className={cardClass}>
          <h3 className={`font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            User MCP Access
          </h3>
          <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Control which users can access MCP features. Disabled users won't see MCP tools in their interface.
          </p>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <RefreshIcon className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : users.length === 0 ? (
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              No users found. User access table may not be configured.
            </p>
          ) : (
            <div className="space-y-2">
              <div className={`grid grid-cols-4 gap-4 text-xs font-medium pb-2 border-b ${isDark ? 'text-gray-400 border-gray-700' : 'text-gray-500 border-gray-200'}`}>
                <span>User</span>
                <span>Email</span>
                <span className="text-center">Rube</span>
                <span className="text-center">Compliance</span>
              </div>
              {users.map((user) => (
                <div key={user.user_id} className={`grid grid-cols-4 gap-4 items-center py-2 ${isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'} rounded-lg px-2 -mx-2`}>
                  <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {user.user_name}
                  </span>
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {user.user_email}
                  </span>
                  <div className="flex justify-center">
                    <button
                      onClick={() => handleToggleUserAccess(user.user_id, 'rube_enabled', !user.rube_enabled)}
                      className={`w-8 h-5 rounded-full transition-colors ${
                        user.rube_enabled
                          ? 'bg-emerald-500'
                          : isDark ? 'bg-gray-600' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                        user.rube_enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <button
                      onClick={() => handleToggleUserAccess(user.user_id, 'compliance_mcp_enabled', !user.compliance_mcp_enabled)}
                      className={`w-8 h-5 rounded-full transition-colors ${
                        user.compliance_mcp_enabled
                          ? 'bg-emerald-500'
                          : isDark ? 'bg-gray-600' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                        user.compliance_mcp_enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={`mt-4 p-3 rounded-lg ${isDark ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
            <div className="flex items-start gap-2">
              <InformationCircleIcon className={`w-4 h-4 mt-0.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                MCP features are developer tools. Only enable for users who need AI-assisted workflows.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MCPIntegrationsPanel;
