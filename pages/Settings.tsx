import React, { useState } from 'react';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiPrompt, AiSettings, InventoryItem, BillOfMaterials, Vendor } from '../types';
import type { RegulatoryUserAgreement } from '../types/userAgreements';
import { defaultAiConfig } from '../types';
import AiPromptEditModal from '../components/AiPromptEditModal';
import RegulatoryAgreementModal from '../components/RegulatoryAgreementModal';
import { GmailIcon, KeyIcon, ClipboardCopyIcon, RefreshIcon, TrashIcon, ServerStackIcon, LinkIcon, BotIcon, ChevronDownIcon, PencilIcon, UsersIcon, ShieldCheckIcon, ExclamationCircleIcon, CheckCircleIcon } from '../components/icons';
import UserManagementPanel from '../components/UserManagementPanel';
import FinaleSetupPanel from '../components/FinaleSetupPanel';
import AiSettingsPanel from '../components/AiSettingsPanel';
import SemanticSearchSettings from '../components/SemanticSearchSettings';

interface SettingsProps {
    currentUser: User;
    aiConfig: AiConfig;
    setAiConfig: (config: AiConfig) => void;
    aiSettings: AiSettings;
    onUpdateAiSettings: (settings: AiSettings) => void;
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
    inventory: InventoryItem[];
    boms: BillOfMaterials[];
    vendors: Vendor[];
}

const Settings: React.FC<SettingsProps> = ({
    currentUser, aiConfig, setAiConfig, aiSettings, onUpdateAiSettings,
    gmailConnection, onGmailConnect, onGmailDisconnect,
    apiKey, onGenerateApiKey, onRevokeApiKey, addToast,
    setCurrentPage, externalConnections, onSetExternalConnections,
    users, onInviteUser, onUpdateUser, onDeleteUser,
    inventory, boms, vendors
}) => {
    const [showApiKey, setShowApiKey] = useState(false);
    const [isDevSettingsOpen, setIsDevSettingsOpen] = useState(false);
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [selectedPrompt, setSelectedPrompt] = useState<AiPrompt | null>(null);
    const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);

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

    const handleAcceptAgreement = (agreement: Omit<RegulatoryUserAgreement, 'userId'>) => {
        const updatedUser: User = {
            ...currentUser,
            regulatoryAgreement: {
                accepted: true,
                acceptedAt: agreement.acceptedAt,
                version: agreement.version,
                fullName: agreement.fullName,
                title: agreement.title,
                companyName: agreement.companyName,
                electronicSignature: agreement.electronicSignature,
            },
        };
        onUpdateUser(updatedUser);
        setIsAgreementModalOpen(false);
        addToast('Regulatory Compliance Agreement accepted. You can now access compliance features.', 'success');
    };

    const handleDeclineAgreement = () => {
        setIsAgreementModalOpen(false);
        addToast('You must accept the agreement to use regulatory compliance features.', 'info');
    };

    const handleRevokeAgreement = () => {
        const updatedUser: User = {
            ...currentUser,
            regulatoryAgreement: {
                accepted: false,
            },
        };
        onUpdateUser(updatedUser);
        addToast('Regulatory Compliance Agreement revoked. Compliance features are now disabled.', 'info');
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

          {/* AI Assistant Settings Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">AI Assistant</h2>
            <AiSettingsPanel aiSettings={aiSettings} onUpdateSettings={onUpdateAiSettings} />
          </section>

          {/* Semantic Search Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">Semantic Search</h2>
            <SemanticSearchSettings
              inventory={inventory}
              boms={boms}
              vendors={vendors}
              addToast={addToast}
            />
          </section>

          {/* Regulatory Compliance Agreement Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex items-center gap-2">
              <ShieldCheckIcon className="w-6 h-6" />
              Regulatory Compliance Agreement
            </h2>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
              <div className="flex items-start gap-4 mb-4">
                {currentUser.regulatoryAgreement?.accepted ? (
                  <CheckCircleIcon className="w-8 h-8 text-green-400 flex-shrink-0" />
                ) : (
                  <ExclamationCircleIcon className="w-8 h-8 text-yellow-500 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">
                    {currentUser.regulatoryAgreement?.accepted ? 'Agreement Accepted' : 'Agreement Required'}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {currentUser.regulatoryAgreement?.accepted
                      ? 'You have accepted the Regulatory Compliance Agreement and can use compliance features.'
                      : 'You must accept the Regulatory Compliance Agreement to use state regulatory research, compliance scanning, and letter drafting features.'}
                  </p>
                </div>
              </div>

              {currentUser.regulatoryAgreement?.accepted ? (
                <div className="space-y-4">
                  {/* Agreement Details */}
                  <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Accepted By:</span>
                        <span className="ml-2 text-white font-semibold">{currentUser.regulatoryAgreement.fullName}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Title:</span>
                        <span className="ml-2 text-white">{currentUser.regulatoryAgreement.title}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Company:</span>
                        <span className="ml-2 text-white">{currentUser.regulatoryAgreement.companyName}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Date:</span>
                        <span className="ml-2 text-white">
                          {currentUser.regulatoryAgreement.acceptedAt
                            ? new Date(currentUser.regulatoryAgreement.acceptedAt).toLocaleDateString()
                            : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Version:</span>
                        <span className="ml-2 text-white">{currentUser.regulatoryAgreement.version || '1.0'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Status:</span>
                        <span className="ml-2 text-green-400 font-semibold">Active</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                    <button
                      onClick={() => setIsAgreementModalOpen(true)}
                      className="text-sm text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      View Full Agreement
                    </button>
                    <button
                      onClick={handleRevokeAgreement}
                      className="text-sm bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
                    >
                      Revoke Agreement
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Warning Box */}
                  <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-yellow-400 mb-2">⚠️ Legal Agreement Required</h4>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      Our regulatory compliance features provide AI-generated research and guidance about
                      state-level agriculture regulations. This is <strong>NOT legal advice</strong> and
                      requires careful verification. You must read and accept the full agreement to proceed.
                    </p>
                  </div>

                  {/* Features Covered */}
                  <div className="bg-gray-900/50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-300 mb-3">Features Covered by This Agreement:</h4>
                    <ul className="space-y-2 text-xs text-gray-400">
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-400 mt-1">•</span>
                        <span>AI-powered state regulatory research (all 50 states)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-400 mt-1">•</span>
                        <span>Proactive BOM compliance scanning</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-400 mt-1">•</span>
                        <span>State agency contact database and research</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-400 mt-1">•</span>
                        <span>Letter upload and AI analysis</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-400 mt-1">•</span>
                        <span>AI-assisted draft letter generation</span>
                      </li>
                    </ul>
                  </div>

                  {/* Accept Button */}
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setIsAgreementModalOpen(true)}
                      className="bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700 transition-colors font-semibold"
                    >
                      Review and Accept Agreement
                    </button>
                  </div>
                </div>
              )}
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
        <RegulatoryAgreementModal
            isOpen={isAgreementModalOpen}
            onAccept={handleAcceptAgreement}
            onDecline={handleDeclineAgreement}
            currentUser={currentUser}
        />
    </>
  );
};

export default Settings;