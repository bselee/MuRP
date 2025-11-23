import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiSettings, InventoryItem, BillOfMaterials, Vendor } from '../types';
import { UsersIcon, LinkIcon, BotIcon, ShieldCheckIcon, SearchIcon, ServerStackIcon, DocumentTextIcon, KeyIcon, MailIcon, LightBulbIcon } from '../components/icons';
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
import termsUrl from '../docs/TERMS_OF_SERVICE.md?url';
import { useAuth } from '../lib/auth/AuthContext';
import { isDevelopment } from '../lib/auth/guards';
import { useTheme, type ThemePreference } from '../components/ThemeProvider';
import { useUserPreferences, type RowDensity, type FontScale } from '../components/UserPreferencesProvider';
import JobDescriptionPanel from '../components/JobDescriptionPanel';
import TwoFactorSettings from '../components/TwoFactorSettings';
import { isFeatureEnabled } from '../lib/featureFlags';

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
    const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
    const [isDataIntegrationsOpen, setIsDataIntegrationsOpen] = useState(false);
    const [isSemanticSearchOpen, setIsSemanticSearchOpen] = useState(false);
    const [isDocumentTemplatesOpen, setIsDocumentTemplatesOpen] = useState(false);
    const [isVendorAdminOpen, setIsVendorAdminOpen] = useState(false);
    const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
    const [isMcpServerOpen, setIsMcpServerOpen] = useState(false);
    const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
    const [isSupportComplianceOpen, setIsSupportComplianceOpen] = useState(false);
    const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
    const [isTablePrefsOpen, setIsTablePrefsOpen] = useState(false);
    const [isJobDocsOpen, setIsJobDocsOpen] = useState(false);
    const [isTwoFactorOpen, setIsTwoFactorOpen] = useState(false);
    const [isShopifyPanelOpen, setIsShopifyPanelOpen] = useState(false);
    
    // API key visibility state
    const [showApiKey, setShowApiKey] = useState(false);

    const { godMode, setGodMode, session } = useAuth();
    const { theme, resolvedTheme, setTheme } = useTheme();
    const { rowDensity, fontScale, setRowDensity, setFontScale } = useUserPreferences();

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

    const themeOptions: { label: string; value: ThemePreference; description: string }[] = [
      { label: 'System', value: 'system', description: 'Match your OS theme automatically' },
      { label: 'Light', value: 'light', description: 'Bright panels with warm typography' },
      { label: 'Dark', value: 'dark', description: 'Stealth glass surfaces (default)' },
    ];

    const rowDensityOptions: { label: string; value: RowDensity; description: string }[] = [
      { label: 'Comfortable', value: 'comfortable', description: 'Most readable, taller rows' },
      { label: 'Compact', value: 'compact', description: 'Balanced density' },
      { label: 'Ultra', value: 'ultra', description: 'Tight rows to maximize visibility' },
    ];

    const fontScaleOptions: { label: string; value: FontScale; description: string }[] = [
      { label: 'Small', value: 'small', description: 'Fits more data onscreen' },
      { label: 'Medium', value: 'medium', description: 'Default size' },
      { label: 'Large', value: 'large', description: 'Easier reading' },
    ];

  return (
    <>
        <div className="space-y-8 max-w-4xl mx-auto">
          <header>
            <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
            <p className="text-gray-400 mt-1">Manage users, integrations, API keys, and application preferences.</p>
          </header>

          <CollapsibleSection
            title="Appearance & Theme"
            icon={<LightBulbIcon className="w-6 h-6 text-amber-300" />}
            isOpen={isAppearanceOpen}
            onToggle={() => setIsAppearanceOpen(!isAppearanceOpen)}
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Currently rendering in <span className="font-semibold text-gray-200">{resolvedTheme}</span> mode.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {themeOptions.map(option => (
                  <Button
                    key={option.value}
                    variant={theme === option.value ? 'primary' : 'ghost'}
                    className="h-full flex flex-col items-start gap-1"
                    onClick={() => setTheme(option.value)}
                  >
                    <span className="text-sm font-semibold">
                      {option.label}
                      {theme === option.value && <span className="ml-2 text-xs text-emerald-300">Active</span>}
                    </span>
                    <span className="text-xs text-gray-400">{option.description}</span>
                  </Button>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Job Descriptions & SOPs"
            icon={<DocumentTextIcon className="w-6 h-6 text-indigo-300" />}
            isOpen={isJobDocsOpen}
            onToggle={() => setIsJobDocsOpen(!isJobDocsOpen)}
          >
            <JobDescriptionPanel currentUser={currentUser} addToast={addToast} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Two-Factor Authentication"
            icon={<ShieldCheckIcon className="w-6 h-6 text-emerald-300" />}
            isOpen={isTwoFactorOpen}
            onToggle={() => setIsTwoFactorOpen(!isTwoFactorOpen)}
          >
            <TwoFactorSettings addToast={addToast} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Data Table Preferences"
            icon={<DocumentTextIcon className="w-6 h-6 text-sky-300" />}
            isOpen={isTablePrefsOpen}
            onToggle={() => setIsTablePrefsOpen(!isTablePrefsOpen)}
          >
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="table-density w-full text-sm">
                <thead className="bg-white/5 text-gray-300">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Setting</th>
                    <th className="text-left px-4 py-3 font-semibold">Preference</th>
                    <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  <tr>
                    <td className="px-4 py-3 font-medium text-gray-200">Row Density</td>
                    <td className="px-4 py-3">
                      <select
                        value={rowDensity}
                        onChange={e => setRowDensity(e.target.value as RowDensity)}
                        className="w-full"
                      >
                        {rowDensityOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                      {rowDensityOptions.find(o => o.value === rowDensity)?.description}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-gray-200">Font Size</td>
                    <td className="px-4 py-3">
                      <select
                        value={fontScale}
                        onChange={e => setFontScale(e.target.value as FontScale)}
                        className="w-full"
                      >
                        {fontScaleOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                      {fontScaleOptions.find(o => o.value === fontScale)?.description}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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

          {/* 3. Data Inputs & Integrations */}
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
              <GoogleDataPanel userId={currentUser.id} gmailConnection={gmailConnection} addToast={addToast} />
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
                  <a
                    href={termsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-3 text-sm font-semibold text-indigo-300 hover:text-indigo-100"
                  >
                    View Terms of Service &rarr;
                  </a>
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
    </>
  );
};

export default Settings;
