import React, { useState } from 'react';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiPrompt } from '../types';
import { defaultAiConfig } from '../types';
import AiPromptEditModal from '../components/AiPromptEditModal';
import { GmailIcon, KeyIcon, ClipboardCopyIcon, RefreshIcon, TrashIcon, ServerStackIcon, LinkIcon, BotIcon, ChevronDownIcon, PencilIcon, UsersIcon } from '../components/icons';
import UserManagementPanel from '../components/UserManagementPanel';
import FinaleSetupPanel from '../components/FinaleSetupPanel';

interface SettingsProps {
    currentUser: User;
    aiConfig: AiConfig;
    setAiConfig: (config: AiConfig) => void;
    gmailConnection: GmailConnection;
    onGmailConnect: () => void;
    onGmailDisconnect: () => void;
    apiKey: string | null;
    onGenerateApiKey: () => void;
    onRevokeApiKey: () => void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    setCurrentPage: (page: Page) => void;
    externalConnections: ExternalConnection[];
    onSetExternalConnections: (connections: ExternalConnection[]) => void;
    users: User[];
    onInviteUser: (email: string, role: User['role'], department: User['department']) => void;
    onUpdateUser: (updatedUser: User) => void;
    onDeleteUser: (userId: string) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
    currentUser, aiConfig, setAiConfig,
    gmailConnection, onGmailConnect, onGmailDisconnect,
    apiKey, onGenerateApiKey, onRevokeApiKey, addToast,
    setCurrentPage, externalConnections, onSetExternalConnections,
    users, onInviteUser, onUpdateUser, onDeleteUser
}) => {
    const [showApiKey, setShowApiKey] = useState(false);
    const [isDevSettingsOpen, setIsDevSettingsOpen] = useState(false);
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [selectedPrompt, setSelectedPrompt] = useState<AiPrompt | null>(null);
    
    // State for the "Add New Connection" form
    const [newConnection, setNewConnection] = useState({ name: '', apiUrl: '', apiKey: '' });

    const handleCopyApiKey = () => {
        if (apiKey) {
            navigator.clipboard.writeText(apiKey);
            addToast('API Key copied to clipboard.', 'success');
        }
    };

    const handleNewConnectionChange = (field: keyof typeof newConnection, value: string) => {
        setNewConnection(prev => ({ ...prev, [field]: value }));
    };

    const handleAddNewConnection = () => {
        if (!newConnection.name || !newConnection.apiUrl || !newConnection.apiKey) {
            addToast('All fields are required to add a connection.', 'error');
            return;
        }
        const newConnectionWithId: ExternalConnection = {
            id: `conn-${Date.now()}`,
            ...newConnection
        };
        onSetExternalConnections([...externalConnections, newConnectionWithId]);
        setNewConnection({ name: '', apiUrl: '', apiKey: '' }); // Reset form
        addToast(`Connection "${newConnection.name}" added successfully.`, 'success');
    };

    const handleDeleteConnection = (id: string) => {
        onSetExternalConnections(externalConnections.filter(c => c.id !== id));
        addToast('Connection removed.', 'info');
    };

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setAiConfig({ ...aiConfig, model: e.target.value });
        addToast('AI Model updated successfully.', 'success');
    };

    const handleEditPrompt = (prompt: AiPrompt) => {
        setSelectedPrompt(prompt);
        setIsPromptModalOpen(true);
    };

    const handleSavePrompt = (updatedPrompt: AiPrompt) => {
        const newPrompts = aiConfig.prompts.map(p => p.id === updatedPrompt.id ? updatedPrompt : p);
        setAiConfig({ ...aiConfig, prompts: newPrompts });
        addToast(`Prompt "${updatedPrompt.name}" updated successfully.`, 'success');
    };
    
    const handleResetPrompts = () => {
        setAiConfig({ ...aiConfig, prompts: defaultAiConfig.prompts });
        addToast('All prompts have been reset to their default values.', 'info');
    };

  return (
    <>
        <div className="space-y-12 max-w-4xl mx-auto">
          <header>
            <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
            <p className="text-gray-400 mt-1">Manage users, integrations, API keys, and application preferences.</p>
          </header>
          
          {/* User Management Section */}
          {(currentUser.role === 'Admin' || currentUser.role === 'Manager') && (
            <section>
                <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex items-center gap-2">
                    <UsersIcon className="w-6 h-6" />
                    User Management
                </h2>
                <UserManagementPanel
                    currentUser={currentUser}
                    users={users}
                    onInviteUser={onInviteUser}
                    onUpdateUser={onUpdateUser}
                    onDeleteUser={onDeleteUser}
                />
            </section>
          )}

          {/* API & Integrations Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">API & Integrations</h2>
            <div className="space-y-6">

              {/* Finale Inventory Integration - See "Finale Setup" tab for configuration */}

              {/* Our API Credentials (Inbound) */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white">Our API Credentials</h3>
                <p className="text-sm text-gray-400 mt-1">Allow external services to connect to this MRP instance.</p>
                <div className="mt-4 pt-4 border-t border-gray-700/50">
                  {apiKey ? (
                    <div className="space-y-3">
                      <div className="flex items-center bg-gray-900/50 rounded-md p-2">
                        <KeyIcon className="w-5 h-5 text-yellow-400 mr-3"/>
                        <input type={showApiKey ? 'text' : 'password'} value={apiKey} readOnly className="flex-1 bg-transparent text-gray-300 font-mono text-sm focus:outline-none"/>
                        <button onClick={handleCopyApiKey} className="p-2 text-gray-400 hover:text-white"><ClipboardCopyIcon className="w-5 h-5"/></button>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                          <input type="checkbox" checked={showApiKey} onChange={() => setShowApiKey(!showApiKey)} className="mr-2"/>
                          Show Key
                        </label>
                        <div>
                          <button onClick={onGenerateApiKey} className="text-sm text-indigo-400 hover:underline mr-4">Regenerate</button>
                          <button onClick={onRevokeApiKey} className="text-sm text-red-400 hover:underline">Revoke Key</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                     <div className="text-center py-4">
                        <p className="text-gray-400 mb-3">No API key is currently active.</p>
                        <button onClick={onGenerateApiKey} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                          Generate API Key
                        </button>
                     </div>
                  )}
                </div>
                 <div className="mt-4 pt-4 border-t border-gray-700/50 flex justify-end">
                    <button onClick={() => setCurrentPage('API Documentation')} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300">
                        View API Documentation &rarr;
                    </button>
                </div>
              </div>
              
              {/* External Integrations (Outbound) */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white">External Integrations</h3>
                <p className="text-sm text-gray-400 mt-1">Connect to external services like supplier portals or shipping APIs.</p>
                
                <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-4">
                    {externalConnections.length > 0 && (
                        <div className="space-y-3">
                            {externalConnections.map(conn => (
                                <div key={conn.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md">
                                    <div>
                                        <p className="font-semibold text-white">{conn.name}</p>
                                        <p className="text-xs text-gray-400">{conn.apiUrl}</p>
                                    </div>
                                    <button onClick={() => handleDeleteConnection(conn.id)} className="p-2 text-red-500 hover:text-red-400"><TrashIcon className="w-5 h-5"/></button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <div className="pt-4 border-t border-gray-700/50">
                        <h4 className="text-md font-semibold text-gray-200 mb-3">Add New Connection</h4>
                        <div className="space-y-3">
                            <div className="relative">
                                <ServerStackIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                                <input type="text" placeholder="Service Name (e.g., Supplier Portal)" value={newConnection.name} onChange={e => handleNewConnectionChange('name', e.target.value)} className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"/>
                            </div>
                            <div className="relative">
                                <LinkIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                                <input type="text" placeholder="API URL" value={newConnection.apiUrl} onChange={e => handleNewConnectionChange('apiUrl', e.target.value)} className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"/>
                            </div>
                            <div className="relative">
                                <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                                <input type="password" placeholder="API Key / Bearer Token" value={newConnection.apiKey} onChange={e => handleNewConnectionChange('apiKey', e.target.value)} className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"/>
                            </div>
                            <div className="flex justify-end">
                                <button onClick={handleAddNewConnection} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">Save Connection</button>
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
                    <p className="text-sm text-gray-400 mt-1">Connect your Gmail account to send Purchase Orders directly to vendors from within the app.</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center justify-between">
                  {gmailConnection.isConnected ? (
                    <div className="text-sm">
                      <span className="text-gray-400">Connected as: </span>
                      <span className="font-semibold text-green-400">{gmailConnection.email}</span>
                    </div>
                  ) : (
                    <div className="text-sm text-yellow-400">
                      Gmail account is not connected.
                    </div>
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
          </section>

           {/* Developer Settings Section (Admin only) */}
           {currentUser.role === 'Admin' && (
             <section>
                <button onClick={() => setIsDevSettingsOpen(!isDevSettingsOpen)} className="w-full flex justify-between items-center text-left">
                    <h2 className="text-xl font-semibold text-gray-300">Developer Settings</h2>
                    <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform ${isDevSettingsOpen ? 'rotate-180' : ''}`} />
                </button>
                 {isDevSettingsOpen && (
                    <div className="mt-4 border-t border-gray-700 pt-4 space-y-6">
                        {/* AI Model Configuration */}
                         <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                            <div className="flex items-center gap-4">
                              <BotIcon className="w-8 h-8 text-indigo-400" />
                              <div>
                                <h3 className="text-lg font-semibold text-white">AI Model Configuration</h3>
                                <p className="text-sm text-gray-400 mt-1">Select the base Gemini model for all AI features.</p>
                              </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-700/50">
                                <label htmlFor="ai-model-select" className="block text-sm font-medium text-gray-300">Active Model</label>
                                <select 
                                    id="ai-model-select"
                                    value={aiConfig.model}
                                    onChange={handleModelChange}
                                    className="mt-1 block w-full md:w-1/2 bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                >
                                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast & Cost-Effective)</option>
                                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Advanced Reasoning)</option>
                                </select>
                            </div>
                        </div>

                        {/* AI Prompt Management */}
                        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                             <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">AI Prompt Management</h3>
                                    <p className="text-sm text-gray-400 mt-1">Customize the system prompts used by the AI assistant.</p>
                                </div>
                                <button onClick={handleResetPrompts} className="text-sm font-semibold text-gray-400 hover:text-white">Reset all to default</button>
                             </div>
                             <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-2">
                                {aiConfig.prompts.map(prompt => (
                                    <div key={prompt.id} className="flex justify-between items-center p-3 bg-gray-900/50 rounded-md">
                                        <div>
                                            <p className="font-semibold text-white">{prompt.name}</p>
                                            <p className="text-xs text-gray-400">{prompt.description}</p>
                                        </div>
                                        <button onClick={() => handleEditPrompt(prompt)} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-colors">
                                            <PencilIcon className="w-4 h-4" /> Edit
                                        </button>
                                    </div>
                                ))}
                             </div>
                        </div>
                    </div>
                )}
             </section>
           )}
        </div>
        <AiPromptEditModal 
            isOpen={isPromptModalOpen}
            onClose={() => setIsPromptModalOpen(false)}
            prompt={selectedPrompt}
            onSave={handleSavePrompt}
        />
    </>
  );
};

export default Settings;