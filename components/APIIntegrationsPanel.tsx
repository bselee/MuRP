import React, { useState } from 'react';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection } from '../types';
import {
  GmailIcon,
  KeyIcon,
  ClipboardCopyIcon,
  TrashIcon,
  ServerStackIcon,
  LinkIcon,
} from './icons';
import FinaleSetupPanel from './FinaleSetupPanel';

interface APIIntegrationsPanelProps {
  apiKey: string | null;
  onGenerateApiKey: () => void;
  onRevokeApiKey: () => void;
  showApiKey: boolean;
  onToggleShowApiKey: (show: boolean) => void;
  gmailConnection: GmailConnection;
  onGmailConnect: () => void;
  onGmailDisconnect: () => void;
  externalConnections: ExternalConnection[];
  onSetExternalConnections: (connections: ExternalConnection[]) => void;
  setCurrentPage: (page: Page) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * API & Integrations Panel
 * Manages:
 * - Our API credentials (inbound connections)
 * - External integrations (outbound connections)
 * - Finale inventory integration
 * - Gmail integration
 */
const APIIntegrationsPanel: React.FC<APIIntegrationsPanelProps> = ({
  apiKey,
  onGenerateApiKey,
  onRevokeApiKey,
  showApiKey,
  onToggleShowApiKey,
  gmailConnection,
  onGmailConnect,
  onGmailDisconnect,
  externalConnections,
  onSetExternalConnections,
  setCurrentPage,
  addToast,
}) => {
  const [newConnection, setNewConnection] = useState({ name: '', apiUrl: '', apiKey: '' });

  const handleCopyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      addToast('API Key copied to clipboard.', 'success');
    }
  };

  const handleNewConnectionChange = (field: keyof typeof newConnection, value: string) => {
    setNewConnection((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddNewConnection = () => {
    if (!newConnection.name || !newConnection.apiUrl || !newConnection.apiKey) {
      addToast('All fields are required to add a connection.', 'error');
      return;
    }
    const newConnectionWithId: ExternalConnection = {
      id: `conn-${Date.now()}`,
      ...newConnection,
    };
    onSetExternalConnections([...externalConnections, newConnectionWithId]);
    setNewConnection({ name: '', apiUrl: '', apiKey: '' }); // Reset form
    addToast(`Connection "${newConnection.name}" added successfully.`, 'success');
  };

  const handleDeleteConnection = (id: string) => {
    onSetExternalConnections(externalConnections.filter((c) => c.id !== id));
    addToast('Connection removed.', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Our API Credentials (Inbound) */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white">Our API Credentials</h3>
        <p className="text-sm text-gray-400 mt-1">
          Allow external services to connect to this MRP instance.
        </p>
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          {apiKey ? (
            <div className="space-y-3">
              <div className="flex items-center bg-gray-900/50 rounded-md p-2">
                <KeyIcon className="w-5 h-5 text-yellow-400 mr-3" />
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  readOnly
                  className="flex-1 bg-transparent text-gray-300 font-mono text-sm focus:outline-none"
                />
                <button
                  onClick={handleCopyApiKey}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <ClipboardCopyIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showApiKey}
                    onChange={(e) => onToggleShowApiKey(e.target.checked)}
                    className="mr-2"
                  />
                  Show Key
                </label>
                <div>
                  <button
                    onClick={onGenerateApiKey}
                    className="text-sm text-indigo-400 hover:underline mr-4"
                  >
                    Regenerate
                  </button>
                  <button onClick={onRevokeApiKey} className="text-sm text-red-400 hover:underline">
                    Revoke Key
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400 mb-3">No API key is currently active.</p>
              <button
                onClick={onGenerateApiKey}
                className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
              >
                Generate API Key
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700/50 flex justify-end">
          <button
            onClick={() => setCurrentPage('API Documentation')}
            className="text-sm font-semibold text-indigo-400 hover:text-indigo-300"
          >
            View API Documentation &rarr;
          </button>
        </div>
      </div>

      {/* External Integrations (Outbound) */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white">External Integrations</h3>
        <p className="text-sm text-gray-400 mt-1">
          Connect to external services like supplier portals or shipping APIs.
        </p>

        <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-4">
          {externalConnections.length > 0 && (
            <div className="space-y-3">
              {externalConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md"
                >
                  <div>
                    <p className="font-semibold text-white">{conn.name}</p>
                    <p className="text-xs text-gray-400">{conn.apiUrl}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteConnection(conn.id)}
                    className="p-2 text-red-500 hover:text-red-400"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-gray-700/50">
            <h4 className="text-md font-semibold text-gray-200 mb-3">Add New Connection</h4>
            <div className="space-y-3">
              <div className="relative">
                <ServerStackIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Service Name (e.g., Supplier Portal)"
                  value={newConnection.name}
                  onChange={(e) => handleNewConnectionChange('name', e.target.value)}
                  className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"
                />
              </div>
              <div className="relative">
                <LinkIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="API URL"
                  value={newConnection.apiUrl}
                  onChange={(e) => handleNewConnectionChange('apiUrl', e.target.value)}
                  className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"
                />
              </div>
              <div className="relative">
                <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="API Key / Bearer Token"
                  value={newConnection.apiKey}
                  onChange={(e) => handleNewConnectionChange('apiKey', e.target.value)}
                  className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleAddNewConnection}
                  className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Add Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Finale Inventory Integration */}
      <FinaleSetupPanel addToast={addToast} />

      {/* Gmail Integration */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-4">
          <GmailIcon className="w-8 h-8 text-gray-300" />
          <div>
            <h3 className="text-lg font-semibold text-white">Gmail Integration</h3>
            <p className="text-sm text-gray-400 mt-1">
              Connect your Gmail account to send Purchase Orders directly to vendors from within the
              app.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center justify-between">
          {gmailConnection.isConnected ? (
            <div className="text-sm">
              <span className="text-gray-400">Connected as: </span>
              <span className="font-semibold text-green-400">{gmailConnection.email}</span>
            </div>
          ) : (
            <div className="text-sm text-yellow-400">Gmail account is not connected.</div>
          )}
          {gmailConnection.isConnected ? (
            <button
              onClick={onGmailDisconnect}
              className="bg-red-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onGmailConnect}
              className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
            >
              Connect Gmail Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default APIIntegrationsPanel;
