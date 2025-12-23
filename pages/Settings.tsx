import React, { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiSettings, InventoryItem, BillOfMaterials, Vendor, CompanyEmailSettings } from '../types';
import { UsersIcon, LinkIcon, BotIcon, ShieldCheckIcon, SearchIcon, ServerStackIcon, DocumentTextIcon, KeyIcon, MailIcon, SparklesIcon, BellIcon, ClipboardCopyIcon, EyeSlashIcon } from '../components/icons';
import CollapsibleSection from '../components/CollapsibleSection';
import AdminUsersPanel from '../components/AdminUsersPanel';
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
import BillingPanel from '../components/BillingPanel';
import NotificationPreferencesPanel from '../components/NotificationPreferencesPanel';
import SOPSettingsPanel from '../components/SOPSettingsPanel';
import BOMApprovalSettingsPanel from '../components/BOMApprovalSettingsPanel';
import EmailConnectionCard from '../components/settings/EmailConnectionCard';
import GlobalDataFilterPanel from '../components/settings/GlobalDataFilterPanel';
import { useAllCategories } from '../hooks/useSupabaseData';

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
  // Section open states - simplified structure
  const [isAccountOpen, setIsAccountOpen] = useState(true);
  const [isDataFilteringOpen, setIsDataFilteringOpen] = useState(false);
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [isTeamOpen, setIsTeamOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isIntegrationsOpen, setIsIntegrationsOpen] = useState(true);
  const [isOperationsOpen, setIsOperationsOpen] = useState(false);
  const [isBomOpen, setIsBomOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSopOpen, setIsSopOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isShopifyOpen, setIsShopifyOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  // Modals
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  // Local state
  const [showApiKey, setShowApiKey] = useState(false);

  const { godMode, setGodMode, session } = useAuth();
  const { theme, setTheme, isDark } = useTheme();
  const { rowDensity, setRowDensity, fontScale, setFontScale } = useUserPreferences();

  const isOpsAdmin = currentUser.role === 'Admin' || currentUser.department === 'Operations';

  // Fetch ALL categories from database (including excluded ones) for global filter panel
  // This uses a dedicated hook that doesn't apply the global filter
  const { categories: allCategories } = useAllCategories();

  // Consistent card styling used across all sections - theme-aware
  const cardClass = isDark 
    ? "bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
    : "bg-white rounded-xl p-6 border border-gray-200 shadow-sm";
  const labelClass = isDark 
    ? "text-xs font-semibold text-gray-400 uppercase tracking-wide"
    : "text-xs font-semibold text-gray-500 uppercase tracking-wide";
  const inputClass = isDark 
    ? "w-full bg-gray-900/60 border border-gray-700 rounded-lg p-3 text-white text-sm focus:border-accent-400 focus:ring-1 focus:ring-accent-400 transition-colors"
    : "w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 text-sm focus:border-accent-400 focus:ring-1 focus:ring-accent-400 transition-colors";
  const selectClass = isDark 
    ? "w-full bg-gray-900/60 border border-gray-700 rounded-lg p-3 text-white text-sm focus:border-accent-400 focus:ring-1 focus:ring-accent-400 transition-colors"
    : "w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 text-sm focus:border-accent-400 focus:ring-1 focus:ring-accent-400 transition-colors";

  return (
    <>
      <div className="space-y-8 max-w-4xl mx-auto">
        <PageHeader
          title="Settings"
          description="Manage your account, integrations, and system configuration"
          icon={<ShieldCheckIcon className="w-6 h-6" />}
        />

        {/* ============================================================ */}
        {/* ACCOUNT */}
        {/* ============================================================ */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-accent-400" />
            Account
          </h2>

          <CollapsibleSection
            title="Profile & Display"
            icon={<UsersIcon className="w-5 h-5 text-blue-400" />}
            isOpen={isAccountOpen}
            onToggle={() => setIsAccountOpen(!isAccountOpen)}
          >
            <div className="space-y-6">
              {/* Profile Info */}
              <div className={cardClass}>
                <h3 className="text-base font-semibold text-white mb-4">Your Profile</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Name</label>
                    <p className="mt-1 text-white">{currentUser.name}</p>
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <p className="mt-1 text-white">{currentUser.email}</p>
                  </div>
                  <div>
                    <label className={labelClass}>Role</label>
                    <p className="mt-1 text-white">{currentUser.role}</p>
                  </div>
                  <div>
                    <label className={labelClass}>Department</label>
                    <p className="mt-1 text-white">{currentUser.department}</p>
                  </div>
                </div>
              </div>

              {/* Display Preferences */}
              <div className={cardClass}>
                <h3 className="text-base font-semibold text-white mb-4">Display Preferences</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className={labelClass}>Theme</label>
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as ThemePreference)}
                      className={selectClass}
                    >
                      <option value="system">System</option>
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Row Density</label>
                    <select
                      value={rowDensity}
                      onChange={(e) => setRowDensity(e.target.value as RowDensity)}
                      className={selectClass}
                    >
                      <option value="compact">Compact</option>
                      <option value="normal">Normal</option>
                      <option value="comfortable">Comfortable</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Font Scale</label>
                    <select
                      value={fontScale}
                      onChange={(e) => setFontScale(e.target.value as FontScale)}
                      className={selectClass}
                    >
                      <option value="small">Small</option>
                      <option value="normal">Normal</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Two-Factor Auth */}
              {isFeatureEnabled('two_factor') && (
                <div className={cardClass}>
                  <h3 className="text-base font-semibold text-white mb-4">Security</h3>
                  <TwoFactorSettings userId={currentUser.id} addToast={addToast} />
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Billing & Subscription"
            icon={<SparklesIcon className="w-5 h-5 text-amber-400" />}
            isOpen={isBillingOpen}
            onToggle={() => setIsBillingOpen(!isBillingOpen)}
          >
            <BillingPanel currentUser={currentUser} addToast={addToast} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Global Data Filtering"
            icon={<EyeSlashIcon className="w-5 h-5 text-red-400" />}
            isOpen={isDataFilteringOpen}
            onToggle={() => setIsDataFilteringOpen(!isDataFilteringOpen)}
          >
            <GlobalDataFilterPanel
              allCategories={allCategories}
              addToast={addToast}
            />
          </CollapsibleSection>
        </section>

        {/* ============================================================ */}
        {/* TEAM (Admin Only) */}
        {/* ============================================================ */}
        {isOpsAdmin && (
          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <ShieldCheckIcon className="w-5 h-5 text-accent-400" />
              Team Management
              <span className="text-xs font-medium text-amber-300 bg-amber-900/30 px-2 py-0.5 rounded-full">Admin</span>
            </h2>

            <CollapsibleSection
              title="Users & Roles"
              icon={<UsersIcon className="w-5 h-5 text-accent-400" />}
              isOpen={isTeamOpen}
              onToggle={() => setIsTeamOpen(!isTeamOpen)}
            >
              <AdminUsersPanel currentUserId={currentUser.id} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Notification Preferences"
              icon={<BellIcon className="w-5 h-5 text-orange-400" />}
              isOpen={isNotificationsOpen}
              onToggle={() => setIsNotificationsOpen(!isNotificationsOpen)}
            >
              <NotificationPreferencesPanel addToast={addToast} />
            </CollapsibleSection>
          </section>
        )}

        {/* ============================================================ */}
        {/* DATA & INTEGRATIONS */}
        {/* ============================================================ */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-accent-400" />
            Integrations
          </h2>

          <CollapsibleSection
            title="Google Workspace & Finale"
            icon={<LinkIcon className="w-5 h-5 text-blue-400" />}
            isOpen={isIntegrationsOpen}
            onToggle={() => setIsIntegrationsOpen(!isIntegrationsOpen)}
          >
            <div className="space-y-6">
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
              <GoogleDataPanel userId={currentUser.id} gmailConnection={gmailConnection} addToast={addToast} />
              <APIIntegrationsPanel
                apiKey={apiKey}
                onGenerateApiKey={onGenerateApiKey}
                onRevokeApiKey={onRevokeApiKey}
                showApiKey={showApiKey}
                onToggleShowApiKey={setShowApiKey}
                externalConnections={externalConnections}
                onSetExternalConnections={onSetExternalConnections}
                setCurrentPage={setCurrentPage}
                addToast={addToast}
              />
            </div>
          </CollapsibleSection>

          {isFeatureEnabled('shopify') && (
            <CollapsibleSection
              title="Shopify Integration"
              icon={<ServerStackIcon className="w-5 h-5 text-emerald-400" />}
              isOpen={isShopifyOpen}
              onToggle={() => setIsShopifyOpen(!isShopifyOpen)}
            >
              <ShopifyIntegrationPanel currentUser={currentUser} inventory={inventory} boms={boms} />
            </CollapsibleSection>
          )}
        </section>

        {/* ============================================================ */}
        {/* OPERATIONS */}
        {/* ============================================================ */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <ClipboardCopyIcon className="w-5 h-5 text-accent-400" />
            Operations
          </h2>

          {isOpsAdmin && (
            <CollapsibleSection
              title="Purchase Order Automation"
              icon={<MailIcon className="w-5 h-5 text-sky-400" />}
              isOpen={isOperationsOpen}
              onToggle={() => setIsOperationsOpen(!isOperationsOpen)}
            >
              <FollowUpSettingsPanel addToast={addToast} />
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="BOM Settings"
            icon={<SparklesIcon className="w-5 h-5 text-amber-400" />}
            isOpen={isBomOpen}
            onToggle={() => setIsBomOpen(!isBomOpen)}
          >
            <div className="space-y-6">
              <div className={cardClass}>
                <h3 className="text-base font-semibold text-white mb-4">Component Swap Suggestions</h3>
                <ComponentSwapSettingsPanel addToast={addToast} />
              </div>
              <div className={cardClass}>
                <h3 className="text-base font-semibold text-white mb-4">BOM Approval Workflow</h3>
                <BOMApprovalSettingsPanel addToast={addToast} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Inventory Search"
            icon={<SearchIcon className="w-5 h-5 text-amber-400" />}
            isOpen={isSearchOpen}
            onToggle={() => setIsSearchOpen(!isSearchOpen)}
          >
            <SemanticSearchSettings
              inventory={inventory}
              boms={boms}
              vendors={vendors}
              addToast={addToast}
            />
          </CollapsibleSection>

          {(isOpsAdmin || currentUser.role === 'Manager') && (
            <CollapsibleSection
              title="SOPs & Job Descriptions"
              icon={<ClipboardCopyIcon className="w-5 h-5 text-sky-400" />}
              isOpen={isSopOpen}
              onToggle={() => setIsSopOpen(!isSopOpen)}
            >
              <SOPSettingsPanel addToast={addToast} />
            </CollapsibleSection>
          )}
        </section>

        {/* ============================================================ */}
        {/* COMMUNICATION */}
        {/* ============================================================ */}
        <section>
          <h2 className={`text-xl font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            <MailIcon className="w-5 h-5 text-accent-400" />
            Communication
          </h2>

          <CollapsibleSection
            title="Email Inboxes"
            icon={<MailIcon className="w-5 h-5 text-blue-400" />}
            isOpen={isEmailOpen}
            onToggle={() => setIsEmailOpen(!isEmailOpen)}
          >
            <div className="space-y-4">
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Connect your email inboxes for automated vendor tracking and invoice processing.
              </p>
              <EmailConnectionCard
                userId={currentUser.id}
                onConnectionChange={(connected) => {
                  addToast(
                    connected ? 'Email inbox connected!' : 'Email inbox disconnected',
                    connected ? 'success' : 'info'
                  );
                }}
              />
            </div>
          </CollapsibleSection>

          {isOpsAdmin && (
            <CollapsibleSection
              title="Document Templates"
              icon={<DocumentTextIcon className="w-5 h-5 text-yellow-400" />}
              isOpen={isTemplatesOpen}
              onToggle={() => setIsTemplatesOpen(!isTemplatesOpen)}
            >
              <DocumentTemplatesPanel addToast={addToast} />
            </CollapsibleSection>
          )}
        </section>

        {/* ============================================================ */}
        {/* AI & SYSTEM */}
        {/* ============================================================ */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <BotIcon className="w-5 h-5 text-accent-400" />
            AI & System
          </h2>

          <CollapsibleSection
            title="AI Assistant"
            icon={<BotIcon className="w-5 h-5 text-purple-400" />}
            isOpen={isAiOpen}
            onToggle={() => setIsAiOpen(!isAiOpen)}
          >
            <div className="space-y-6">
              <div className={cardClass}>
                <h3 className="text-base font-semibold text-white mb-4">Assistant Behavior</h3>
                <AiSettingsPanel aiSettings={aiSettings} onUpdateSettings={onUpdateAiSettings} />
              </div>

              {isOpsAdmin && (
                <div className={cardClass}>
                  <h3 className="text-base font-semibold text-white mb-4">Provider & Model</h3>
                  <p className="text-sm text-gray-400 mb-4">Configure AI provider, models, and parameters</p>
                  <AIProviderPanel
                    aiConfig={aiConfig}
                    onUpdateAiConfig={setAiConfig}
                    addToast={addToast}
                  />
                </div>
              )}
            </div>
          </CollapsibleSection>

          {isOpsAdmin && (
            <CollapsibleSection
              title="MCP Server (Compliance)"
              icon={<ServerStackIcon className="w-5 h-5 text-cyan-400" />}
              isOpen={isMcpOpen}
              onToggle={() => setIsMcpOpen(!isMcpOpen)}
            >
              <MCPServerPanel />
            </CollapsibleSection>
          )}

          {isDevelopment() && isOpsAdmin && (
            <CollapsibleSection
              title="Developer Tools"
              icon={<KeyIcon className="w-5 h-5 text-red-400" />}
              isOpen={isDevToolsOpen}
              onToggle={() => setIsDevToolsOpen(!isDevToolsOpen)}
            >
              <div className="space-y-4">
                <div className={cardClass}>
                  <p className="text-sm text-gray-300"><span className="text-gray-500">Session:</span> {session?.user?.email ?? 'None'}</p>
                  <p className="text-sm text-gray-300"><span className="text-gray-500">User ID:</span> {session?.user?.id ?? 'N/A'}</p>
                  <p className="text-sm text-gray-300"><span className="text-gray-500">God Mode:</span> {godMode ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-900/60 border border-gray-700 rounded-xl">
                  <div>
                    <p className="text-white font-medium">Dev God Mode</p>
                    <p className="text-xs text-gray-400">Bypasses auth and RLS (local only)</p>
                  </div>
                  <Button
                    variant={godMode ? 'danger' : 'ghost'}
                    onClick={() => setGodMode(!godMode)}
                  >
                    {godMode ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            </CollapsibleSection>
          )}
        </section>

        {/* ============================================================ */}
        {/* HELP & COMPLIANCE */}
        {/* ============================================================ */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-accent-400" />
            Help & Compliance
          </h2>

          <CollapsibleSection
            title="Terms & Support"
            icon={<ShieldCheckIcon className="w-5 h-5 text-emerald-400" />}
            isOpen={isSupportOpen}
            onToggle={() => setIsSupportOpen(!isSupportOpen)}
          >
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className={cardClass}>
                  <h3 className="text-base font-semibold text-white mb-2">Terms of Service</h3>
                  <p className="text-sm text-gray-400 mb-3">
                    Review data retention, compliance responsibilities, and AI output disclaimers.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsTermsModalOpen(true)}
                    className="text-sm font-medium text-accent-300 hover:text-accent-200 underline decoration-dotted"
                  >
                    View Terms &rarr;
                  </button>
                </div>
                <div className={cardClass}>
                  <h3 className="text-base font-semibold text-white mb-2">Get Help</h3>
                  <p className="text-sm text-gray-400 mb-3">
                    Contact <a href="mailto:support@murp.app" className="text-accent-300 hover:text-accent-200">support@murp.app</a> with logs, impact, and stakeholders.
                  </p>
                  <Button
                    onClick={() => window.open(`mailto:support@murp.app?subject=${encodeURIComponent('MuRP Help Ticket')}&body=${encodeURIComponent('Environment:\nModule:\nIssue:\n')}`, '_blank')}
                  >
                    Create Ticket
                  </Button>
                </div>
              </div>

              <div className={cardClass}>
                <h3 className="text-base font-semibold text-white mb-4">Compliance Agreement</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Acknowledge that MuRP's regulatory intel is advisory only and must be verified by qualified counsel.
                </p>
                <RegulatoryAgreementPanel
                  currentUser={currentUser}
                  onUpdateUser={onUpdateUser}
                  addToast={addToast}
                />
              </div>
            </div>
          </CollapsibleSection>
        </section>
      </div>

      <TermsOfServiceModal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} />
    </>
  );
};

export default Settings;
