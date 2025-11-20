import React, { useState } from 'react';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiSettings, InventoryItem, BillOfMaterials, Vendor } from '../types';
import { UsersIcon, LinkIcon, BotIcon, ShieldCheckIcon, SearchIcon, ServerStackIcon, DocumentTextIcon, KeyIcon, MailIcon } from '../components/icons';
import CollapsibleSection from '../components/CollapsibleSection';
import UserManagementPanel from '../components/UserManagementPanel';
import AIProviderPanel from '../components/AIProviderPanel';
import APIIntegrationsPanel from '../components/APIIntegrationsPanel';
import RegulatoryAgreementPanel from '../components/RegulatoryAgreementPanel';
import AiSettingsPanel from '../components/AiSettingsPanel';
import SemanticSearchSettings from '../components/SemanticSearchSettings';
import { MCPServerPanel } from '../components/MCPServerPanel';
import DocumentTemplatesPanel from '../components/DocumentTemplatesPanel';
import FollowUpSettingsPanel from '../components/FollowUpSettingsPanel';
import DataPipelineGuide from '../components/DataPipelineGuide';
import GoogleDataPanel from '../components/GoogleDataPanel';
import termsUrl from '../docs/TERMS_OF_SERVICE.md?url';
import { useAuth } from '../lib/auth/AuthContext';
import { isDevelopment } from '../lib/auth/guards';

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
    // Collapsible section states (reordered by usage frequency)
    const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
    const [isRegulatoryOpen, setIsRegulatoryOpen] = useState(false);
    const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
    const [isDataIntegrationsOpen, setIsDataIntegrationsOpen] = useState(false);
    const [isSemanticSearchOpen, setIsSemanticSearchOpen] = useState(false);
    const [isDocumentTemplatesOpen, setIsDocumentTemplatesOpen] = useState(false);
    const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
    const [isMcpServerOpen, setIsMcpServerOpen] = useState(false);
    const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
    const [isLegalOpen, setIsLegalOpen] = useState(false);
    
    // API key visibility state
    const [showApiKey, setShowApiKey] = useState(false);

    const { godMode, setGodMode, session } = useAuth();

  return (
    <>
        <div className="space-y-8 max-w-4xl mx-auto">
          <header>
            <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
            <p className="text-gray-400 mt-1">Manage users, integrations, API keys, and application preferences.</p>
          </header>
          
          {/* 1. User Management Section (Admin/Manager only) */}
          {(currentUser.role === 'Admin' || currentUser.role === 'Manager') && (
            <CollapsibleSection
              title="User Management"
              icon={<UsersIcon className="w-6 h-6 text-indigo-400" />}
              isOpen={isUserManagementOpen}
              onToggle={() => setIsUserManagementOpen(!isUserManagementOpen)}
            >
              <UserManagementPanel
                currentUser={currentUser}
                users={users}
                onInviteUser={onInviteUser}
                onUpdateUser={onUpdateUser}
                onDeleteUser={onDeleteUser}
              />
            </CollapsibleSection>
          )}

          {isDevelopment() && currentUser.role === 'Admin' && (
            <CollapsibleSection
              title="Developer Tools"
              icon={<KeyIcon className="w-6 h-6 text-amber-300" />}
              isOpen={isDevToolsOpen}
              onToggle={() => setIsDevToolsOpen(!isDevToolsOpen)}
            >
              <div className="space-y-4">
                <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 text-sm text-gray-300">
                  <p><span className="text-gray-400">Session User:</span> {session?.user?.email ?? 'None'}</p>
                  <p><span className="text-gray-400">User ID:</span> {session?.user?.id ?? 'N/A'}</p>
                  <p><span className="text-gray-400">God Mode:</span> {godMode ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-900/60 p-4">
                  <div>
                    <p className="text-white font-semibold">Dev God Mode</p>
                    <p className="text-xs text-gray-400">Bypasses auth and RLS (local only).</p>
                  </div>
                  <button
                    className={`px-4 py-2 rounded-lg font-semibold ${godMode ? 'bg-red-500/20 text-red-200 border border-red-400/40' : 'bg-gray-700 text-gray-200'}`}
                    onClick={() => setGodMode(!godMode)}
                  >
                    {godMode ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* 2. Regulatory Compliance Agreement */}
          <CollapsibleSection
            title="Regulatory Compliance Agreement"
            icon={<ShieldCheckIcon className="w-6 h-6 text-green-400" />}
            isOpen={isRegulatoryOpen}
            onToggle={() => setIsRegulatoryOpen(!isRegulatoryOpen)}
          >
            <RegulatoryAgreementPanel
              currentUser={currentUser}
              onUpdateUser={onUpdateUser}
              addToast={addToast}
            />
          </CollapsibleSection>

          {/* 3. AI Configuration (Consolidated) */}
          <CollapsibleSection
            title="AI Configuration"
            icon={<BotIcon className="w-6 h-6 text-purple-400" />}
            isOpen={isAiConfigOpen}
            onToggle={() => setIsAiConfigOpen(!isAiConfigOpen)}
          >
            <div className="space-y-6">
              {/* AI Assistant Settings */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">AI Assistant Behavior</h3>
                <AiSettingsPanel aiSettings={aiSettings} onUpdateSettings={onUpdateAiSettings} />
              </div>

              {/* AI Provider Configuration (Admin only) */}
              {currentUser.role === 'Admin' && (
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-4">Provider & Model Settings</h3>
                  <p className="text-sm text-gray-400 mb-4">Configure AI provider, models, and advanced parameters (Admin only)</p>
                  <AIProviderPanel
                    aiConfig={aiConfig}
                    onUpdateAiConfig={setAiConfig}
                    addToast={addToast}
                  />
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* 4. Data Inputs & Integrations */}
          <CollapsibleSection
            title="Data Inputs & Integrations"
            icon={<LinkIcon className="w-6 h-6 text-blue-400" />}
            isOpen={isDataIntegrationsOpen}
            onToggle={() => setIsDataIntegrationsOpen(!isDataIntegrationsOpen)}
          >
            <div className="space-y-8">
              <DataPipelineGuide
                items={[
                  {
                    label: 'Connect Google',
                    description: 'Grant Calendar + Sheets scopes once and reuse everywhere.',
                  },
                  {
                    label: 'Sync Finale',
                    description: 'Monitor the auto-sync function and run manual jobs on demand.',
                  },
                  {
                    label: 'Custom APIs',
                    description: 'Issue API keys and register vendor or ERP webhooks.',
                  },
                ]}
              />
              <GoogleDataPanel userId={currentUser.id} addToast={addToast} />
              <APIIntegrationsPanel
                apiKey={apiKey}
                onGenerateApiKey={onGenerateApiKey}
                onRevokeApiKey={onRevokeApiKey}
                showApiKey={showApiKey}
                onToggleShowApiKey={setShowApiKey}
                gmailConnection={gmailConnection}
                onGmailConnect={onGmailConnect}
                onGmailDisconnect={onGmailDisconnect}
                externalConnections={externalConnections}
                onSetExternalConnections={onSetExternalConnections}
                setCurrentPage={setCurrentPage}
                addToast={addToast}
              />
            </div>
          </CollapsibleSection>

          {/* 5. Semantic Search */}
          <CollapsibleSection
            title="Semantic Search"
            icon={<SearchIcon className="w-6 h-6 text-amber-400" />}
            isOpen={isSemanticSearchOpen}
            onToggle={() => setIsSemanticSearchOpen(!isSemanticSearchOpen)}
          >
            <SemanticSearchSettings
              inventory={inventory}
              boms={boms}
              vendors={vendors}
              addToast={addToast}
            />
          </CollapsibleSection>

          {/* 6. Document Templates (Admin only) */}
          {currentUser.role === 'Admin' && (
            <CollapsibleSection
              title="Document Templates"
              icon={<DocumentTextIcon className="w-6 h-6 text-yellow-400" />}
              isOpen={isDocumentTemplatesOpen}
              onToggle={() => setIsDocumentTemplatesOpen(!isDocumentTemplatesOpen)}
            >
              <DocumentTemplatesPanel addToast={addToast} />
            </CollapsibleSection>
          )}

          {currentUser.role === 'Admin' && (
            <CollapsibleSection
              title="PO Follow-up Automation"
              icon={<MailIcon className="w-6 h-6 text-sky-400" />}
              isOpen={isFollowUpOpen}
              onToggle={() => setIsFollowUpOpen(!isFollowUpOpen)}
            >
              <FollowUpSettingsPanel addToast={addToast} />
            </CollapsibleSection>
          )}

          {/* 7. Legal & Support */}
          <CollapsibleSection
            title="Legal & Support"
            icon={<ShieldCheckIcon className="w-6 h-6 text-emerald-400" />}
            isOpen={isLegalOpen}
            onToggle={() => setIsLegalOpen(!isLegalOpen)}
          >
            <div className="space-y-4">
              <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white">Terms of Service</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Keep this accessible for auditors and internal users. The document lives in the repo so it can be versioned with code.
                </p>
                <a
                  href={termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-3 text-sm font-semibold text-indigo-300 hover:text-indigo-100"
                >
                  View Terms of Service &rarr;
                </a>
              </div>

              <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white">Support</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Need to escalate an issue or request data deletion? Email{' '}
                  <a href="mailto:support@murp.app" className="text-indigo-300 hover:text-indigo-100 underline decoration-dotted">
                    support@murp.app
                  </a>{' '}
                  and reference the build ID or production order.
                </p>
              </div>
            </div>
          </CollapsibleSection>

          {/* 8. MCP Server Configuration (Admin only) */}
          {currentUser.role === 'Admin' && (
            <CollapsibleSection
              title="MCP Server Configuration"
              icon={<ServerStackIcon className="w-6 h-6 text-cyan-400" />}
              isOpen={isMcpServerOpen}
              onToggle={() => setIsMcpServerOpen(!isMcpServerOpen)}
            >
              <MCPServerPanel />
            </CollapsibleSection>
          )}
        </div>
    </>
  );
};

export default Settings;
