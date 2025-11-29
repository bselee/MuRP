import React, { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiSettings, InventoryItem, BillOfMaterials, Vendor, CompanyEmailSettings } from '../types';
import { UsersIcon, LinkIcon, BotIcon, ShieldCheckIcon, SearchIcon, ServerStackIcon, DocumentTextIcon, KeyIcon, MailIcon, LightBulbIcon, SparklesIcon, BellIcon, ClipboardCopyIcon, TrashIcon } from '../components/icons';
import CollapsibleSection from '../components/CollapsibleSection';
import UserManagementPanel from '../components/UserManagementPanel';
import AIProviderPanel from '../components/AIProviderPanel';
import APIIntegrationsPanel from '../components/APIIntegrationsPanel';
import ShopifyIntegrationPanel from '../components/ShopifyIntegrationPanel';
import RegulatoryAgreementPanel from '../components/RegulatoryAgreementPanel';
import AiSettingsPanel from '../components/AiSettingsPanel';
import SemanticSearchSettings from '../components/SemanticSearchSettings';
import { MCPServerPanel } from '../components/MCPServerPanel';
import DocumentTemplatesPanel from '../components/DocumentTemplatesPanel';
import FollowUpSettingsPanel from '../components/FollowUpSettingsPanel';
import DataPipelineGuide from '../components/DataPipelineGuide';
import GoogleDataPanel from '../components/GoogleDataPanel';
import GoogleWorkspaceStatusCard from '../components/GoogleWorkspaceStatusCard';
import termsUrl from '../docs/TERMS_OF_SERVICE.md?url';
import googleOAuthDocUrl from '../docs/GOOGLE_OAUTH_SETUP.md?url';
import googleSheetsDocUrl from '../GOOGLE_SHEETS_INTEGRATION.md?url';
import apiIngestionDocUrl from '../API_INGESTION_SETUP.md?url';
import { useAuth } from '../lib/auth/AuthContext';
import { isDevelopment } from '../lib/auth/guards';
import { useTheme, type ThemePreference } from '../components/ThemeProvider';
import { useUserPreferences, type RowDensity, type FontScale } from '../components/UserPreferencesProvider';
import TwoFactorSettings from '../components/TwoFactorSettings';
import { isFeatureEnabled } from '../lib/featureFlags';
import TermsOfServiceModal from '../components/TermsOfServiceModal';
import ComponentSwapSettingsPanel from '../components/ComponentSwapSettingsPanel';
import DelegationSettingsPanel from '../components/DelegationSettingsPanel';
import BillingPanel from '../components/BillingPanel';
import NotificationPreferencesPanel from '../components/NotificationPreferencesPanel';
import RolePermissionMatrix from '../components/RolePermissionMatrix';
import UserPersonalizationPanel from '../components/UserPersonalizationPanel';

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
    companyEmailSettings: CompanyEmailSettings;
    onUpdateCompanyEmailSettings: (settings: CompanyEmailSettings) => void;
}

const Settings: React.FC<SettingsProps> = ({
    currentUser, aiConfig, setAiConfig, aiSettings, onUpdateAiSettings,
    gmailConnection, onGmailConnect, onGmailDisconnect,
    apiKey, onGenerateApiKey, onRevokeApiKey, addToast,
    setCurrentPage, externalConnections, onSetExternalConnections,
    users, onInviteUser, onUpdateUser, onDeleteUser,
    inventory, boms, vendors,
    companyEmailSettings, onUpdateCompanyEmailSettings
}) => {
    // Collapsible section states (reordered by usage frequency)
    const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
    const [isBillingOpen, setIsBillingOpen] = useState(true);
    const [isRoleMatrixOpen, setIsRoleMatrixOpen] = useState(true);
    const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
    const [isDataIntegrationsOpen, setIsDataIntegrationsOpen] = useState(false);
    const [isSemanticSearchOpen, setIsSemanticSearchOpen] = useState(false);
    const [isDocumentTemplatesOpen, setIsDocumentTemplatesOpen] = useState(false);
    const [isVendorAdminOpen, setIsVendorAdminOpen] = useState(false);
    const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
    const [isMcpServerOpen, setIsMcpServerOpen] = useState(false);
    const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
    const [isSupportComplianceOpen, setIsSupportComplianceOpen] = useState(false);
    const [isComponentSwapOpen, setIsComponentSwapOpen] = useState(false);
    const [isShopifyPanelOpen, setIsShopifyPanelOpen] = useState(false);
    const [isDelegationSettingsOpen, setIsDelegationSettingsOpen] = useState(false);
    const [isNotificationPrefsOpen, setIsNotificationPrefsOpen] = useState(false);
    const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
    const [isEmailPolicyOpen, setIsEmailPolicyOpen] = useState(false);
    const [isUserPersonalizationOpen, setIsUserPersonalizationOpen] = useState(false);
    const [isSopSettingsOpen, setIsSopSettingsOpen] = useState(false);
    const [newConnection, setNewConnection] = useState({ name: '', apiUrl: '', apiKey: '' });
    
    // API key visibility state
    const [showApiKey, setShowApiKey] = useState(false);
    const [emailPolicyDraft, setEmailPolicyDraft] = useState<CompanyEmailSettings>(companyEmailSettings);

    useEffect(() => {
      setEmailPolicyDraft(companyEmailSettings);
    }, [companyEmailSettings]);

    const { godMode, setGodMode, session } = useAuth();

    const helpTicketSubject = encodeURIComponent('MuRP Help Ticket');
    const helpTicketBody = encodeURIComponent(
      `Support team,

We need assistance with:
- Environment (prod / staging / dev):
- Module (AfterShip, Finale sync, compliance, etc.):
- Impact summary:
- Owners/approvers looped in:

Reference Terms: ${termsUrl}

Thank you!`
    );
    const helpTicketMailto = `mailto:support@murp.app?subject=${helpTicketSubject}&body=${helpTicketBody}`;

    const isOpsAdmin = currentUser.role === 'Admin' || currentUser.department === 'Operations';
    const scrollToGooglePanel = useCallback(() => {
      if (typeof document === 'undefined') return;
      const target = document.getElementById('google-data-panel-root');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, []);

    const supportPlaybook = [
      {
        title: 'Plant Owners & Ops Leads',
        notes: [
          'Track regulatory acknowledgements for every facility before enabling AI output.',
          'Document any production hold or recall inside the help ticket — ties back to ToS §16.',
          'Share build IDs when escalating so deletion / retention windows (ToS §14) are clear.',
        ],
      },
      {
        title: 'Developers & Integrators',
        notes: [
          'Keep API keys rotated and scoped; reference the API docs tab when inviting vendors.',
          'Log AfterShip / Finale sync failures with timestamps so support can replay jobs.',
          'Attach Supabase run IDs or log excerpts to speed up RCA for compliance tooling.',
        ],
      },
    ];

    const handleSaveEmailPolicy = () => {
      if (emailPolicyDraft.enforceCompanySender && !emailPolicyDraft.fromAddress.trim()) {
        addToast('Enter a company sender email before enforcing policy.', 'error');
        return;
      }
      onUpdateCompanyEmailSettings({
        ...emailPolicyDraft,
        fromAddress: emailPolicyDraft.fromAddress.trim(),
      });
      addToast('Company email policy updated.', 'success');
    };

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
    <>
        <div className="space-y-8 max-w-4xl mx-auto">
          <header>
            <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
            <p className="text-gray-400 mt-1">Manage company settings, users, integrations, and administrative controls.</p>
          </header>

          <h2 className="text-2xl font-bold text-white mt-8 mb-4">Compliance & Billing</h2>

          <CollapsibleSection
            title="Billing & Subscription"
            icon={<SparklesIcon className="w-6 h-6 text-indigo-300" />}
            isOpen={isBillingOpen}
            onToggle={() => setIsBillingOpen(!isBillingOpen)}
          >
            <BillingPanel currentUser={currentUser} addToast={addToast} />
          </CollapsibleSection>

          <h2 className="text-2xl font-bold text-white mt-8 mb-4">Company Administration</h2>

          <CollapsibleSection
            title="Role Permissions Overview"
            icon={<ShieldCheckIcon className="w-6 h-6 text-indigo-300" />}
            isOpen={isRoleMatrixOpen}
            onToggle={() => setIsRoleMatrixOpen(!isRoleMatrixOpen)}
          >
            <RolePermissionMatrix />
          </CollapsibleSection>

          <CollapsibleSection
            title="User Personalization"
            icon={<UsersIcon className="w-6 h-6 text-green-400" />}
            isOpen={isUserPersonalizationOpen}
            onToggle={() => setIsUserPersonalizationOpen(!isUserPersonalizationOpen)}
          >
            <UserPersonalizationPanel
              currentUser={currentUser}
              onUpdateUser={onUpdateUser}
              addToast={addToast}
            />
          </CollapsibleSection>



          
          {/* 1. User Management Section (Admin/Manager only) */}
          {(isOpsAdmin || currentUser.role === 'Manager') && (
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

          {/* Delegation Settings (Admin/Ops only) */}
          {isOpsAdmin && (
            <CollapsibleSection
              title="Task Delegation Settings"
              icon={<UsersIcon className="w-6 h-6 text-purple-400" />}
              isOpen={isDelegationSettingsOpen}
              onToggle={() => setIsDelegationSettingsOpen(!isDelegationSettingsOpen)}
            >
              <DelegationSettingsPanel addToast={addToast} />
            </CollapsibleSection>
          )}

          {/* Notification Preferences (Admin/Ops only) */}
          {isOpsAdmin && (
            <CollapsibleSection
              title="Notification Preferences"
              icon={<BellIcon className="w-6 h-6 text-orange-400" />}
              isOpen={isNotificationPrefsOpen}
              onToggle={() => setIsNotificationPrefsOpen(!isNotificationPrefsOpen)}
            >
              <NotificationPreferencesPanel addToast={addToast} />
            </CollapsibleSection>
          )}

          <h2 className="text-2xl font-bold text-white mt-8 mb-4">Developer Tools</h2>

          {isDevelopment() && isOpsAdmin && (
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
                  <Button
                    className={`px-4 py-2 rounded-lg font-semibold ${godMode ? 'bg-red-500/20 text-red-200 border border-red-400/40' : 'bg-gray-700 text-gray-200'}`}
                    onClick={() => setGodMode(!godMode)}
                  >
                    {godMode ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            </CollapsibleSection>
          )}

          <h2 className="text-2xl font-bold text-white mt-8 mb-4">Operations & Workflow</h2>

          {/* 2. AI Configuration (Consolidated) */}
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
              {isOpsAdmin && (
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

          <h2 className="text-2xl font-bold text-white mt-8 mb-4">API Integrations & Documentation</h2>

          {/* API Integrations & Documentation */}
          <CollapsibleSection
            title="API Integrations & Documentation"
            icon={<ServerStackIcon className="w-6 h-6 text-indigo-400" />}
            isOpen={true}
          >
            <div className="space-y-8">
              {/* Hero Section */}
              <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-xl border border-indigo-500/30 p-8 text-center">
                <ServerStackIcon className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-2">Connect Your Apps</h3>
                <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
                  Seamlessly integrate MuRP with your existing tools. Generate secure API keys, connect external services,
                  and access comprehensive documentation to build powerful workflows.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <div className="bg-gray-800/60 rounded-lg px-4 py-2">
                    <span className="text-sm font-semibold text-indigo-300">🔐 Secure API Keys</span>
                  </div>
                  <div className="bg-gray-800/60 rounded-lg px-4 py-2">
                    <span className="text-sm font-semibold text-purple-300">📚 Full Documentation</span>
                  </div>
                  <div className="bg-gray-800/60 rounded-lg px-4 py-2">
                    <span className="text-sm font-semibold text-green-300">🔗 External Integrations</span>
                  </div>
                </div>
              </div>

              {/* API Credentials Section */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <div className="flex items-center gap-4 mb-6">
                  <KeyIcon className="w-8 h-8 text-yellow-400" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">API Credentials</h4>
                    <p className="text-sm text-gray-400">Generate and manage secure API keys for external integrations</p>
                  </div>
                </div>

                {apiKey ? (
                  <div className="space-y-4">
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-gray-300">Your API Key</span>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={handleCopyApiKey}
                            className="p-2 text-gray-400 hover:text-white transition-colors"
                            title="Copy API Key"
                          >
                            <ClipboardCopyIcon className="w-4 h-4" />
                          </Button>
                          <label className="flex items-center text-xs text-gray-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showApiKey}
                              onChange={(e) => onToggleShowApiKey(e.target.checked)}
                              className="mr-2"
                            />
                            Show
                          </label>
                        </div>
                      </div>
                      <div className="font-mono text-sm bg-gray-800/50 p-3 rounded border border-gray-700">
                        {showApiKey ? apiKey : '••••••••••••••••••••••••••••••••'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500">
                        Keep this key secure. Regenerate if compromised.
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={onGenerateApiKey}
                          className="text-sm text-indigo-400 hover:text-indigo-300"
                        >
                          Regenerate
                        </Button>
                        <Button
                          onClick={onRevokeApiKey}
                          className="text-sm text-red-400 hover:text-red-300"
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <KeyIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h5 className="text-lg font-semibold text-gray-400 mb-2">No API Key Generated</h5>
                    <p className="text-gray-500 mb-6">Generate a secure API key to allow external applications to connect to MuRP.</p>
                    <Button
                      onClick={onGenerateApiKey}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg"
                    >
                      Generate API Key
                    </Button>
                  </div>
                )}
              </div>

              {/* API Documentation Section */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <div className="flex items-center gap-4 mb-6">
                  <DocumentTextIcon className="w-8 h-8 text-blue-400" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">API Documentation</h4>
                    <p className="text-sm text-gray-400">Complete reference for integrating with MuRP's API</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-600 hover:border-blue-500/50 transition-colors">
                    <h5 className="font-semibold text-white mb-2">Getting Started</h5>
                    <p className="text-sm text-gray-400 mb-3">Quick start guide for API integration</p>
                    <Button
                      onClick={() => setCurrentPage('API Documentation')}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      View Guide →
                    </Button>
                  </div>

                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-600 hover:border-blue-500/50 transition-colors">
                    <h5 className="font-semibold text-white mb-2">Authentication</h5>
                    <p className="text-sm text-gray-400 mb-3">API key setup and security best practices</p>
                    <Button
                      onClick={() => setCurrentPage('API Documentation')}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Learn More →
                    </Button>
                  </div>

                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-600 hover:border-blue-500/50 transition-colors">
                    <h5 className="font-semibold text-white mb-2">Endpoints</h5>
                    <p className="text-sm text-gray-400 mb-3">Complete API reference and examples</p>
                    <Button
                      onClick={() => setCurrentPage('API Documentation')}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Browse API →
                    </Button>
                  </div>
                </div>
              </div>

              {/* External Connections Section */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <div className="flex items-center gap-4 mb-6">
                  <LinkIcon className="w-8 h-8 text-green-400" />
                  <div>
                    <h4 className="text-lg font-semibold text-white">External Connections</h4>
                    <p className="text-sm text-gray-400">Connect MuRP to your existing business tools and services</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {externalConnections.length > 0 ? (
                    <div className="space-y-3">
                      {externalConnections.map((conn) => (
                        <div
                          key={conn.id}
                          className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-600"
                        >
                          <div className="flex items-center gap-3">
                            <ServerStackIcon className="w-6 h-6 text-gray-400" />
                            <div>
                              <p className="font-semibold text-white">{conn.name}</p>
                              <p className="text-xs text-gray-400">{conn.apiUrl}</p>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleDeleteConnection(conn.id)}
                            className="p-2 text-red-500 hover:text-red-400"
                            title="Remove connection"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-gray-900/30 rounded-lg border border-dashed border-gray-600">
                      <LinkIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <h5 className="text-lg font-semibold text-gray-400 mb-2">No External Connections</h5>
                      <p className="text-gray-500 mb-6">Add connections to integrate with supplier portals, shipping APIs, and other business tools.</p>
                    </div>
                  )}

                  {/* Add New Connection Form */}
                  <div className="pt-6 border-t border-gray-700">
                    <h5 className="text-md font-semibold text-white mb-4">Add New Connection</h5>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Service Name</label>
                        <input
                          type="text"
                          placeholder="e.g., Supplier Portal"
                          value={newConnection.name}
                          onChange={(e) => handleNewConnectionChange('name', e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">API URL</label>
                        <input
                          type="url"
                          placeholder="https://api.example.com"
                          value={newConnection.apiUrl}
                          onChange={(e) => handleNewConnectionChange('apiUrl', e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">API Key</label>
                        <input
                          type="password"
                          placeholder="Enter API key"
                          value={newConnection.apiKey}
                          onChange={(e) => handleNewConnectionChange('apiKey', e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mt-4">
                      <Button
                        onClick={handleAddNewConnection}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg"
                      >
                        Add Connection
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <h2 className="text-2xl font-bold text-white mt-8 mb-4">Integrations & Data</h2>

          {/* 3. Data Inputs & Integrations */}
          <CollapsibleSection
            title="Data Inputs & Integrations"
            icon={<LinkIcon className="w-6 h-6 text-blue-400" />}
            isOpen={isDataIntegrationsOpen}
            onToggle={() => setIsDataIntegrationsOpen(!isDataIntegrationsOpen)}
          >
            <div className="space-y-8">
              <GoogleWorkspaceStatusCard
                userId={currentUser.id}
                addToast={addToast}
                onNavigateToPanel={scrollToGooglePanel}
              />
              <DataPipelineGuide
                defaultCollapsed
                items={[
                  {
                    label: 'Connect Google Workspace',
                    description: 'Authenticate Calendar + Sheets scopes once, then reuse the token for Gmail, Docs, and integrations.',
                    checklist: [
                      'Click "Connect Google Workspace" below to launch OAuth.',
                      'Approve calendar, drive, sheets scopes with the ops/admin account.',
                      'Refresh the status card to confirm token + expiry time.',
                    ],
                    docHref: googleOAuthDocUrl,
                    docLabel: 'Google OAuth setup',
                  },
                  {
                    label: 'Sync Finale / Sheets',
                    description: 'Pull curated data from Finale or a Sheet, then keep nightly backups in Google Drive.',
                    checklist: [
                      'Choose import strategy (update, add-only, or replace) before running.',
                      'Use "Create Backup" after each major Finale sync to snapshot inventory.',
                      'Store sheet IDs in the panel so everyone uses the same source.',
                    ],
                    docHref: googleSheetsDocUrl,
                    docLabel: 'Sheets integration guide',
                  },
                  {
                    label: 'Custom APIs',
                    description: 'Share data with ERPs/vendors via API keys and the ingestion proxy.',
                    checklist: [
                      'Generate an API key, store it in the vendor portal, and limit the scopes.',
                      'Document the payload format in the linked guide before handing off.',
                      'Use the external connections list below to track every webhook.',
                    ],
                    docHref: apiIngestionDocUrl,
                    docLabel: 'API ingestion playbook',
                  },
                ]}
              />
              <div id="google-data-panel-root">
                <GoogleDataPanel userId={currentUser.id} gmailConnection={gmailConnection} addToast={addToast} />
              </div>
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

          <CollapsibleSection
            title="Email Sender Policy"
            icon={<MailIcon className="w-6 h-6 text-emerald-300" />}
            isOpen={isEmailPolicyOpen}
            onToggle={() => setIsEmailPolicyOpen(!isEmailPolicyOpen)}
          >
            <div className="space-y-6">
              <p className="text-sm text-gray-400">
                Define a company-wide sender address (e.g., <span className="text-gray-200 font-mono">purchasing@yourdomain.com</span>) for all
                automated compliance and artwork emails. When enforcement is enabled, users will send via this channel unless the policy is disabled.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase">Company From Address</label>
                  <input
                    type="email"
                    value={emailPolicyDraft.fromAddress}
                    onChange={e => setEmailPolicyDraft(prev => ({ ...prev, fromAddress: e.target.value }))}
                    placeholder="purchasing@yourdomain.com"
                    aria-label="Company from address"
                    className="w-full bg-gray-900/60 border border-gray-700 rounded-md p-3 text-sm text-white focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  />
                  <p className="text-xs text-gray-500 mt-1">Used as the visible sender on enforced emails.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase">Delivery Provider</label>
                  <div className="mt-2 space-y-2">
                    {[
                      { value: 'resend' as const, label: 'Resend (recommended)', description: 'Send through the built-in Resend integration.' },
                      { value: 'gmail' as const, label: 'Workspace Gmail', description: 'Require each user to connect Google Workspace before sending.' },
                    ].map(option => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 p-3 border rounded-md cursor-pointer ${
                          emailPolicyDraft.provider === option.value ? 'border-emerald-400 bg-emerald-400/5' : 'border-gray-700 bg-gray-900/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="email-provider"
                          checked={emailPolicyDraft.provider === option.value}
                          onChange={() => setEmailPolicyDraft(prev => ({ ...prev, provider: option.value }))}
                          aria-label={option.label}
                          className="mt-1 text-emerald-400 focus:ring-emerald-400"
                        />
                        <span className="text-sm text-gray-200">
                          <span className="font-semibold">{option.label}</span>
                          <span className="block text-xs text-gray-400">{option.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {emailPolicyDraft.provider === 'gmail' && (
                    <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-100">
                      {emailPolicyDraft.workspaceMailbox?.email ? (
                        <>
                          Workspace mailbox <span className="font-semibold text-white">{emailPolicyDraft.workspaceMailbox.email}</span> connected
                          by {emailPolicyDraft.workspaceMailbox.connectedBy || 'an admin'} on{' '}
                          {emailPolicyDraft.workspaceMailbox.connectedAt
                            ? new Date(emailPolicyDraft.workspaceMailbox.connectedAt).toLocaleString()
                            : '—'}
                          .
                        </>
                      ) : gmailConnection.isConnected ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <span>Use your current Workspace login ({gmailConnection.email ?? 'unknown'}) as the managed mailbox.</span>
                          <Button
                            onClick={() =>
                              setEmailPolicyDraft(prev => ({
                                ...prev,
                                workspaceMailbox: {
                                  email: gmailConnection.email || prev.fromAddress || '',
                                  connectedBy: currentUser.name || currentUser.email,
                                  connectedAt: new Date().toISOString(),
                                },
                              }))
                            }
                            className="bg-sky-500 hover:bg-sky-400 text-white px-3 py-1.5 rounded-md"
                          >
                            Assign Workspace Mailbox
                          </Button>
                        </div>
                      ) : (
                        <span>
                          Connect Google Workspace (top of Integrations) with the account you want to dedicate, then assign it here.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between bg-gray-900/40 border border-gray-800 rounded-lg p-4">
                <div>
                  <p className="text-sm text-gray-200 font-semibold">Enforce company sender on Artwork emails</p>
                  <p className="text-xs text-gray-400">
                    Users will no longer send from personal accounts. Messages route through the selected channel and are logged for audit.
                  </p>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailPolicyDraft.enforceCompanySender}
                    onChange={e => setEmailPolicyDraft(prev => ({ ...prev, enforceCompanySender: e.target.checked }))}
                    aria-label="Enforce company sender on artwork emails"
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-400 rounded-full peer peer-checked:bg-emerald-500 transition-all"></div>
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  onClick={() => setEmailPolicyDraft(companyEmailSettings)}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md"
                >
                  Reset
                </Button>
                <Button
                  onClick={handleSaveEmailPolicy}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md"
                >
                  Save Policy
                </Button>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="BOM Swap Suggestions"
            icon={<SparklesIcon className="w-6 h-6 text-amber-300" />}
            isOpen={isComponentSwapOpen}
            onToggle={() => setIsComponentSwapOpen(!isComponentSwapOpen)}
          >
            <ComponentSwapSettingsPanel addToast={addToast} />
          </CollapsibleSection>

          {isFeatureEnabled('shopify') && (
            <CollapsibleSection
              title="Sales Channels · Shopify Preview"
              icon={<ServerStackIcon className="w-6 h-6 text-emerald-300" />}
              isOpen={isShopifyPanelOpen}
              onToggle={() => setIsShopifyPanelOpen(!isShopifyPanelOpen)}
            >
              <ShopifyIntegrationPanel currentUser={currentUser} inventory={inventory} boms={boms} />
            </CollapsibleSection>
          )}

          {/* 4. Semantic Search */}
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

          {/* 5. Document Templates (Admin only) */}
          {isOpsAdmin && (
            <CollapsibleSection
              title="Document Templates"
              icon={<DocumentTextIcon className="w-6 h-6 text-yellow-400" />}
              isOpen={isDocumentTemplatesOpen}
              onToggle={() => setIsDocumentTemplatesOpen(!isDocumentTemplatesOpen)}
            >
              <div id="document-templates-panel">
                <DocumentTemplatesPanel addToast={addToast} />
              </div>
            </CollapsibleSection>
          )}

          {/* Vendor Administration (Admin only) */}
          {isOpsAdmin && (
            <CollapsibleSection
              title="Vendor Administration"
              icon={<UsersIcon className="w-6 h-6 text-sky-400" />}
              isOpen={isVendorAdminOpen}
              onToggle={() => setIsVendorAdminOpen(!isVendorAdminOpen)}
            >
              <div className="space-y-3 bg-gray-900/40 border border-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-300">
                  Everyone can see vendor info inside purchase orders and requisitions, but only admins can edit vendor
                  records. Use the button below when you need to add, deactivate, or update a supplier profile.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => setCurrentPage('Vendors')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors"
                  >
                    Manage Vendors
                  </Button>
                  <p className="text-xs text-gray-500 flex items-center">
                    Vendor data remains visible elsewhere for job duties, but modifications stay locked to admins.
                  </p>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {isOpsAdmin && (
            <CollapsibleSection
              title="PO Follow-up Automation"
              icon={<MailIcon className="w-6 h-6 text-sky-400" />}
              isOpen={isFollowUpOpen}
              onToggle={() => setIsFollowUpOpen(!isFollowUpOpen)}
            >
              <FollowUpSettingsPanel addToast={addToast} />
            </CollapsibleSection>
          )}

          {/* 6. Support & Compliance */}
          <CollapsibleSection
            title="Support & Compliance"
            icon={<ShieldCheckIcon className="w-6 h-6 text-emerald-400" />}
            isOpen={isSupportComplianceOpen}
            onToggle={() => setIsSupportComplianceOpen(!isSupportComplianceOpen)}
          >
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-white">Terms & Controls</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Keep auditors, plant owners, and investors aligned with the current Terms (v1.0, Nov 20 2025). Versioned in git for full traceability.
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-gray-300 list-disc list-inside">
                    <li>Section 14 covers data retention + deletion requests.</li>
                    <li>Section 16 clarifies compliance responsibilities.</li>
                    <li>Section 12 reminds teams AI output is not legal advice.</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => setIsTermsModalOpen(true)}
                    className="inline-flex items-center gap-2 mt-3 text-sm font-semibold text-indigo-300 hover:text-indigo-100 underline decoration-dotted"
                  >
                    View Terms of Service &rarr;
                  </button>
                </div>
                <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Help Desk Workflow</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Send everything to{' '}
                      <a href="mailto:support@murp.app" className="text-indigo-300 hover:text-indigo-100 underline decoration-dotted">
                        support@murp.app
                      </a>{' '}
                      with logs, impact, and stakeholders copied. We turn this into a tracked ticket internally.
                    </p>
                    <p className="text-sm text-gray-400 mt-3">
                      Include environment, modules affected (Finale, AfterShip, MCP), and which owners/devs have already approved changes.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="mt-4 inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.open(helpTicketMailto, '_blank');
                      }
                    }}
                  >
                    Create Help Ticket
                  </Button>
                </div>
              </div>

              <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-white">Support Playbook</h3>
                <p className="text-sm text-gray-400 mt-1">What each audience should include when escalating.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {supportPlaybook.map((group) => (
                    <div key={group.title} className="rounded-lg border border-gray-700/70 bg-gray-900/40 p-4">
                      <p className="text-sm font-semibold text-white">{group.title}</p>
                      <ul className="mt-2 space-y-1 text-sm text-gray-300 list-disc list-inside">
                        {group.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-white">Compliance Agreement</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Capture acknowledgements that MuRP&apos;s regulatory intel is advisory only and must be verified by qualified counsel before shipping product.
                </p>
                <div className="mt-4">
                  <RegulatoryAgreementPanel
                    currentUser={currentUser}
                    onUpdateUser={onUpdateUser}
                    addToast={addToast}
                  />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* 7. MCP Server Configuration (Admin only) */}
          {isOpsAdmin && (
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
        <TermsOfServiceModal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} />
    </>
  );
};

export default Settings;
