import React, { useState } from 'react';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiSettings, InventoryItem, BillOfMaterials, Vendor } from '../types';
import { UsersIcon, LinkIcon, BotIcon, ShieldCheckIcon, SearchIcon, ServerStackIcon, DocumentTextIcon } from '../components/icons';
import CollapsibleSection from '../components/CollapsibleSection';
import UserManagementPanel from '../components/UserManagementPanel';
import AIProviderPanel from '../components/AIProviderPanel';
import APIIntegrationsPanel from '../components/APIIntegrationsPanel';
import RegulatoryAgreementPanel from '../components/RegulatoryAgreementPanel';
import AiSettingsPanel from '../components/AiSettingsPanel';
import SemanticSearchSettings from '../components/SemanticSearchSettings';
import { MCPServerPanel } from '../components/MCPServerPanel';
import DocumentTemplatesPanel from '../components/DocumentTemplatesPanel';

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
    const [isUserManagementOpen, setIsUserManagementOpen] = useState(true);
    const [isRegulatoryOpen, setIsRegulatoryOpen] = useState(false);
    const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
    const [isApiIntegrationsOpen, setIsApiIntegrationsOpen] = useState(false);
    const [isSemanticSearchOpen, setIsSemanticSearchOpen] = useState(false);
    const [isDocumentTemplatesOpen, setIsDocumentTemplatesOpen] = useState(false);
    const [isMcpServerOpen, setIsMcpServerOpen] = useState(false);
    
    // API key visibility state
    const [showApiKey, setShowApiKey] = useState(false);

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

          {/* 4. API & Integrations */}
          <CollapsibleSection
            title="API & Integrations"
            icon={<LinkIcon className="w-6 h-6 text-blue-400" />}
            isOpen={isApiIntegrationsOpen}
            onToggle={() => setIsApiIntegrationsOpen(!isApiIntegrationsOpen)}
          >
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

          {/* 7. MCP Server Configuration (Admin only) */}
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