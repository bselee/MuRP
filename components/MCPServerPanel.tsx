import Button from '@/components/ui/Button';
/**
 * MCP Server Configuration Panel
 * 
 * Admin-only panel for configuring Model Context Protocol (MCP) server
 * connection, API keys, and compliance tool management.
 */

import React, { useState, useEffect } from 'react';
import {
  ServerStackIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  RefreshIcon,
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon,
} from './icons';
import { supabase } from '../lib/supabase/client';

interface MCPTool {
  name: string;
  displayName: string;
  description: string;
  requiresAI: boolean;
}

const AVAILABLE_TOOLS: MCPTool[] = [
  {
    name: 'onboard_user',
    displayName: 'Onboard User',
    description: 'Initialize compliance profile for a new user',
    requiresAI: false,
  },
  {
    name: 'add_regulatory_source',
    displayName: 'Add Regulatory Source',
    description: 'Add state or federal regulatory data source',
    requiresAI: false,
  },
  {
    name: 'basic_compliance_check',
    displayName: 'Basic Compliance Check',
    description: 'Quick rule-based compliance verification',
    requiresAI: false,
  },
  {
    name: 'extract_label_text',
    displayName: 'Extract Label Text',
    description: 'OCR text extraction from label images',
    requiresAI: false,
  },
  {
    name: 'full_ai_compliance_check',
    displayName: 'Full AI Compliance Check',
    description: 'Deep AI-powered compliance analysis',
    requiresAI: true,
  },
  {
    name: 'scrape_state_regulation',
    displayName: 'Scrape State Regulation',
    description: 'Fetch live regulatory data from state websites',
    requiresAI: false,
  },
  {
    name: 'upgrade_to_full_ai',
    displayName: 'Upgrade to Full AI',
    description: 'Switch user from basic to AI compliance mode',
    requiresAI: false,
  },
  {
    name: 'get_compliance_summary',
    displayName: 'Get Compliance Summary',
    description: 'Retrieve overview of compliance status',
    requiresAI: false,
  },
];

export const MCPServerPanel: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  
  // Configuration state
  const [serverUrl, setServerUrl] = useState('http://localhost:8000');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'unhealthy' | 'unknown'>('unknown');
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');

  // Feedback state
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('mcp_server_configs')
        .select('*')
        .eq('server_name', 'compliance_mcp')
        .single();
      
      if (error) throw error;
      
      if (data) {
        setServerUrl(data.server_url);
        setAnthropicApiKey(data.anthropic_api_key || '');
        setIsEnabled(data.is_enabled);
        setHealthStatus(data.health_status as 'healthy' | 'unhealthy' | 'unknown');
        setLastHealthCheck(data.last_health_check ? new Date(data.last_health_check) : null);
        setNotes(data.notes || '');
      }
    } catch (error) {
      console.error('Failed to load MCP configuration:', error);
      setErrorMessage('Failed to load configuration. Using defaults.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      const { error } = await supabase
        .from('mcp_server_configs')
        .update({
          server_url: serverUrl,
          anthropic_api_key: anthropicApiKey,
          is_enabled: isEnabled,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq('server_name', 'compliance_mcp');

      if (error) throw error;

      setSuccessMessage('MCP server configuration saved successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save MCP configuration:', error);
      setErrorMessage('Failed to save configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setErrorMessage('');
      setSuccessMessage('');

      // Test connection to MCP server
      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const newHealthStatus = 'healthy';
        const now = new Date().toISOString();
        
        setHealthStatus(newHealthStatus);
        setLastHealthCheck(new Date());
        
        // Update health status in database
        await supabase
          .from('mcp_server_configs')
          .update({
            health_status: newHealthStatus,
            last_health_check: now,
          })
          .eq('server_name', 'compliance_mcp');
        
        setSuccessMessage('Connection successful! MCP server is responsive.');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setHealthStatus('unhealthy');
        setErrorMessage(`Connection failed: ${response.statusText}`);
      }
    } catch (error) {
      setHealthStatus('unhealthy');
      setErrorMessage('Connection test failed. Please check the server URL and ensure the MCP server is running.');
      console.error('MCP connection test error:', error);
    } finally {
      setIsTesting(false);
    }
  };

  const getHealthStatusIcon = () => {
    switch (healthStatus) {
      case 'healthy':
        return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case 'unhealthy':
        return <ExclamationCircleIcon className="w-5 h-5 text-red-600" />;
      default:
        return <InformationCircleIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getHealthStatusText = () => {
    switch (healthStatus) {
      case 'healthy':
        return <span className="text-green-600 font-medium">Healthy</span>;
      case 'unhealthy':
        return <span className="text-red-600 font-medium">Unhealthy</span>;
      default:
        return <span className="text-gray-500">Unknown</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-center">
          <RefreshIcon className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-600">Loading MCP configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <ServerStackIcon className="w-5 h-5 mr-2 text-blue-600" />
            MCP Server Configuration
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Configure the Model Context Protocol (MCP) server for AI-powered compliance checks.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {getHealthStatusIcon()}
          {getHealthStatusText()}
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Server Connection Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h4 className="font-medium text-gray-900">Server Connection</h4>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Server URL
          </label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:8000"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500">
            URL of the MCP server (default: http://localhost:8000)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Anthropic API Key
            <span className="ml-1 text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showAnthropicKey ? 'text' : 'password'}
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <Button
              type="button"
              onClick={() => setShowAnthropicKey(!showAnthropicKey)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showAnthropicKey ? (
                <EyeSlashIcon className="w-5 h-5" />
              ) : (
                <EyeIcon className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Required for AI-powered compliance checks (full_ai_compliance_check tool)
          </p>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="mcp-enabled"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="mcp-enabled" className="ml-2 text-sm text-gray-700">
            Enable MCP server integration
          </label>
        </div>

        {lastHealthCheck && (
          <div className="text-xs text-gray-500">
            Last health check: {lastHealthCheck.toLocaleString()}
          </div>
        )}
      </div>

      {/* Available Tools */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 mb-4">Available Tools ({AVAILABLE_TOOLS.length})</h4>
        <div className="space-y-3">
          {AVAILABLE_TOOLS.map((tool) => (
            <div
              key={tool.name}
              className="flex items-start p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-medium text-gray-900">{tool.displayName}</h5>
                  {tool.requiresAI && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                      AI Required
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1">{tool.description}</p>
                <code className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded mt-1 inline-block">
                  {tool.name}
                </code>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Configuration Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Add any notes about this MCP configuration..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4">
        <Button
          onClick={handleTestConnection}
          disabled={isTesting || !serverUrl}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          <RefreshIcon className={`w-4 h-4 mr-2 ${isTesting ? 'animate-spin' : ''}`} />
          {isTesting ? 'Testing...' : 'Test Connection'}
        </Button>
        
        <Button
          onClick={handleSave}
          disabled={isSaving || !serverUrl}
          className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <InformationCircleIcon className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">MCP Server Setup Instructions</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Ensure the Python MCP server is running (check /mcp-server directory)</li>
              <li>Start the server: <code className="bg-white px-1 rounded">python main.py</code></li>
              <li>Enter the server URL (typically http://localhost:8000)</li>
              <li>Add your Anthropic API key for AI-powered compliance checks</li>
              <li>Test the connection to verify server availability</li>
              <li>Enable the integration and save the configuration</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
