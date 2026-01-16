import React, { useState, useEffect } from 'react';
import { useTheme } from '../ThemeProvider';
import { useAuth } from '../../lib/auth/AuthContext';
import { isDevelopment } from '../../lib/auth/guards';
import { isFeatureEnabled } from '../../lib/featureFlags';
import type { SettingsSectionId, SettingsPageProps } from './settingsConfig';
import Button from '../ui/Button';
import {
  SettingsCard,
  SettingsInput,
  SettingsToggle,
  SettingsButtonGroup,
} from './ui';

// Panel imports
import UserPersonalizationPanel from '../UserPersonalizationPanel';
import BillingPanel from '../BillingPanel';
import UserManagementPanel from '../UserManagementPanel';
import AdminUsersPanel from '../AdminUsersPanel';
import RolePermissionMatrix from '../RolePermissionMatrix';
import DelegationSettingsPanel from '../DelegationSettingsPanel';
import NotificationPreferencesPanel from '../NotificationPreferencesPanel';
import CompanyIntegrationsPanel from '../CompanyIntegrationsPanel';
import APIIntegrationsPanel from '../APIIntegrationsPanel';
import GlobalDataFilterPanel from './GlobalDataFilterPanel';
import FollowUpSettingsPanel from '../FollowUpSettingsPanel';
import VendorsManagementPanel from '../VendorsManagementPanel';
import VendorTrustScoreLog from './VendorTrustScoreLog';
import CarrierTrackingSettingsPanel from '../CarrierTrackingSettingsPanel';
import ComponentSwapSettingsPanel from '../ComponentSwapSettingsPanel';
import BOMApprovalSettingsPanel from '../BOMApprovalSettingsPanel';
import SemanticSearchSettings from '../SemanticSearchSettings';
import SOPSettingsPanel from '../SOPSettingsPanel';
import EmailTrackingSettingsPanel from '../EmailTrackingSettingsPanel';
import EmailProcessingLog from './EmailProcessingLog';
import EmailBrandingPanel from './EmailBrandingPanel';
import DocumentTemplatesPanel from '../DocumentTemplatesPanel';
import SlackIntegrationPanel from './SlackIntegrationPanel';
import AiSettingsPanel from '../AiSettingsPanel';
import AIProviderPanel from '../AIProviderPanel';
import MCPIntegrationsPanel from './MCPIntegrationsPanel';
import WorkflowHistoryLog from './WorkflowHistoryLog';
import ShopifyIntegrationPanel from '../ShopifyIntegrationPanel';
import RegulatoryAgreementPanel from '../RegulatoryAgreementPanel';
import ModulesSettingsPanel from './ModulesSettingsPanel';
import SettingsSubNav from './SettingsSubNav';
import TermsOfServiceModal from '../TermsOfServiceModal';
import termsUrl from '../../docs/TERMS_OF_SERVICE.md?url';

interface SettingsContentProps extends SettingsPageProps {
  activeSection: SettingsSectionId;
}

// Section header component
const SectionHeader: React.FC<{ title: string; description?: string }> = ({ title, description }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="mb-6">
      <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {title}
      </h1>
      {description && (
        <p className={`mt-1 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {description}
        </p>
      )}
    </div>
  );
};

// Note: SettingsCard is now imported from ./ui for consistency

const SettingsContent: React.FC<SettingsContentProps> = ({
  activeSection,
  currentUser,
  aiConfig,
  setAiConfig,
  aiSettings,
  onUpdateAiSettings,
  gmailConnection,
  onGmailConnect,
  onGmailDisconnect,
  apiKey,
  onGenerateApiKey,
  onRevokeApiKey,
  addToast,
  setCurrentPage,
  externalConnections,
  onSetExternalConnections,
  users,
  onInviteUser,
  onUpdateUser,
  onDeleteUser,
  inventory,
  boms,
  vendors,
  companyEmailSettings,
  onUpdateCompanyEmailSettings,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { godMode, setGodMode, session } = useAuth();

  const isOpsAdmin = currentUser.role === 'Admin' || currentUser.department === 'Operations';
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [emailPolicyDraft, setEmailPolicyDraft] = useState(companyEmailSettings);

  useEffect(() => {
    setEmailPolicyDraft(companyEmailSettings);
  }, [companyEmailSettings]);

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

  switch (activeSection) {
    case 'personalization':
      return (
        <>
          <SectionHeader title="Personalization" description="Customize your account preferences and display settings" />
          <UserPersonalizationPanel
            currentUser={currentUser}
            onUpdateUser={onUpdateUser}
            addToast={addToast}
          />
        </>
      );

    case 'billing':
      return (
        <>
          <SectionHeader title="Billing & Subscription" description="Manage your subscription and billing information" />
          <BillingPanel currentUser={currentUser} addToast={addToast} />
        </>
      );

    case 'team':
      return (
        <>
          <SectionHeader title="Team & Permissions" description="Manage users, roles, and permissions" />
          <SettingsSubNav
            items={[
              { id: 'users', label: 'User Management' },
              { id: 'roles', label: 'Roles & Permissions' },
              { id: 'matrix', label: 'Permission Matrix' },
              { id: 'delegation', label: 'Delegation' },
              { id: 'notifications', label: 'Notifications' },
            ]}
          >
            <div className="space-y-6">
              <div id="subsection-users">
                <SettingsCard title="User Management">
                  <UserManagementPanel
                    currentUser={currentUser}
                    users={users}
                    onInviteUser={onInviteUser}
                    onUpdateUser={onUpdateUser}
                    onDeleteUser={onDeleteUser}
                  />
                </SettingsCard>
              </div>

              <div id="subsection-roles">
                <SettingsCard title="User Roles & Permissions">
                  <AdminUsersPanel currentUserId={currentUser.id} />
                </SettingsCard>
              </div>

              <div id="subsection-matrix">
                <SettingsCard title="Role Permissions Overview">
                  <RolePermissionMatrix />
                </SettingsCard>
              </div>

              <div id="subsection-delegation">
                <SettingsCard title="Task Delegation">
                  <DelegationSettingsPanel addToast={addToast} />
                </SettingsCard>
              </div>

              <div id="subsection-notifications">
                <SettingsCard title="Notification Preferences">
                  <NotificationPreferencesPanel currentUser={currentUser} addToast={addToast} />
                </SettingsCard>
              </div>
            </div>
          </SettingsSubNav>
        </>
      );

    case 'modules':
      return (
        <>
          <SectionHeader title="Modules" description="Enable or disable modules in the sidebar" />
          <SettingsCard>
            <ModulesSettingsPanel setCurrentPage={setCurrentPage} />
          </SettingsCard>
        </>
      );

    case 'integrations':
      return (
        <>
          <SectionHeader
            title="Company Integrations"
            description="Configure data sources, production calendar, and email inboxes"
          />
          <CompanyIntegrationsPanel addToast={addToast} />
        </>
      );

    case 'api-keys':
      return (
        <>
          <SectionHeader title="API Keys & Connections" description="Manage API keys and external connections" />
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
        </>
      );

    case 'data-filters':
      return (
        <>
          <SectionHeader title="Global Data Filters" description="Configure category, vendor, and SKU exclusion rules" />
          <GlobalDataFilterPanel
            allCategories={[...new Set(inventory.map(i => i.category).filter(Boolean) as string[])]}
            allVendors={vendors.map(v => v.name).filter(Boolean)}
            allSkus={[...new Set(inventory.map(i => i.sku).filter(Boolean) as string[])]}
            addToast={addToast}
          />
        </>
      );

    case 'purchasing':
      return (
        <>
          <SectionHeader title="Purchasing & Vendors" description="Configure purchase order automation and vendor settings" />
          <SettingsSubNav
            items={[
              { id: 'automation', label: 'PO Automation' },
              { id: 'vendors', label: 'Vendors' },
              { id: 'trust-scores', label: 'Trust Scores' },
              { id: 'carrier-apis', label: 'Carrier APIs' },
            ]}
          >
            <div className="space-y-6">
              <div id="subsection-automation">
                <SettingsCard title="Purchase Order Automation">
                  <FollowUpSettingsPanel addToast={addToast} />
                </SettingsCard>
              </div>

              <div id="subsection-vendors">
                <SettingsCard title="Vendor Management">
                  <VendorsManagementPanel vendors={vendors} addToast={addToast} />
                </SettingsCard>
              </div>

              <div id="subsection-trust-scores">
                <SettingsCard title="Vendor Trust Score History">
                  <VendorTrustScoreLog addToast={addToast} />
                </SettingsCard>
              </div>

              <div id="subsection-carrier-apis">
                <SettingsCard title="Carrier Tracking APIs">
                  <CarrierTrackingSettingsPanel addToast={addToast} />
                </SettingsCard>
              </div>
            </div>
          </SettingsSubNav>
        </>
      );

    case 'bom':
      return (
        <>
          <SectionHeader title="BOM Management" description="Configure bill of materials settings" />
          <div className="space-y-6">
            <SettingsCard title="Component Swap Suggestions">
              <ComponentSwapSettingsPanel addToast={addToast} />
            </SettingsCard>

            <SettingsCard title="BOM Approval Workflow">
              <BOMApprovalSettingsPanel addToast={addToast} />
            </SettingsCard>
          </div>
        </>
      );

    case 'search':
      return (
        <>
          <SectionHeader title="Search & Indexing" description="Configure inventory search and semantic indexing" />
          <SemanticSearchSettings
            inventory={inventory}
            boms={boms}
            vendors={vendors}
            addToast={addToast}
          />
        </>
      );

    case 'sops':
      return (
        <>
          <SectionHeader title="SOPs & Job Descriptions" description="Manage standard operating procedures" />
          <SOPSettingsPanel addToast={addToast} />
        </>
      );

    case 'email-policy':
      return (
        <>
          <SectionHeader title="Email Policy" description="Configure company email settings and delivery preferences" />
          <SettingsCard
            description={
              <>Define a company-wide sender address (e.g., <span className={`font-mono ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>purchasing@yourdomain.com</span>) for all automated compliance and artwork emails.</>
            }
          >
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <SettingsInput
                  label="Company From Address"
                  type="email"
                  value={emailPolicyDraft.fromAddress}
                  onChange={e => setEmailPolicyDraft(prev => ({ ...prev, fromAddress: e.target.value }))}
                  placeholder="purchasing@yourdomain.com"
                />

                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Delivery Provider
                  </label>
                  <div className="space-y-2">
                    {[
                      { value: 'resend' as const, label: 'Resend (recommended)', description: 'Send through the built-in Resend integration.' },
                      { value: 'gmail' as const, label: 'Workspace Gmail', description: 'Require each user to connect Google Workspace before sending.' },
                    ].map(option => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          emailPolicyDraft.provider === option.value
                            ? isDark
                              ? 'border-accent-400 bg-accent-400/5'
                              : 'border-accent-500 bg-accent-50'
                            : isDark
                              ? 'border-gray-700 bg-gray-900/40'
                              : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="email-provider"
                          checked={emailPolicyDraft.provider === option.value}
                          onChange={() => setEmailPolicyDraft(prev => ({ ...prev, provider: option.value }))}
                          className="mt-1 text-accent-500 focus:ring-accent-500"
                        />
                        <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                          <span className="font-semibold">{option.label}</span>
                          <span className={`block text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{option.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <SettingsToggle
                checked={emailPolicyDraft.enforceCompanySender}
                onChange={(checked) => setEmailPolicyDraft(prev => ({ ...prev, enforceCompanySender: checked }))}
                label="Enforce company sender on Artwork emails"
                description="Users will no longer send from personal accounts."
              />

              <SettingsButtonGroup>
                <Button
                  onClick={() => setEmailPolicyDraft(companyEmailSettings)}
                  className={`px-4 py-2 rounded-lg ${
                    isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  Reset
                </Button>
                <Button onClick={handleSaveEmailPolicy}>
                  Save Policy
                </Button>
              </SettingsButtonGroup>
            </div>
          </SettingsCard>
        </>
      );

    case 'email-monitoring':
      return (
        <>
          <SectionHeader title="Inbox Monitoring" description="Configure email inbox monitoring for PO tracking" />
          <EmailTrackingSettingsPanel addToast={addToast} />
        </>
      );

    case 'email-branding':
      return (
        <>
          <SectionHeader title="Email Branding" description="Customize your company's email templates and branding" />
          <EmailBrandingPanel addToast={addToast} />
        </>
      );

    case 'email-log':
      return (
        <>
          <SectionHeader title="Email Activity Log" description="View email processing history and events" />
          <EmailProcessingLog addToast={addToast} />
        </>
      );

    case 'templates':
      return (
        <>
          <SectionHeader title="Document Templates" description="Manage email and document templates" />
          <DocumentTemplatesPanel addToast={addToast} />
        </>
      );

    case 'slack':
      return (
        <>
          <SectionHeader title="Slack Integration" description="Configure Slack notifications, channels, and quality gates" />
          <SlackIntegrationPanel addToast={addToast} />
        </>
      );

    case 'ai-assistant':
      return (
        <>
          <SectionHeader title="AI Assistant" description="Configure AI behavior and provider settings" />
          <div className="space-y-6">
            <SettingsCard title="AI Assistant Behavior">
              <AiSettingsPanel aiSettings={aiSettings} onUpdateSettings={onUpdateAiSettings} />
            </SettingsCard>

            {isOpsAdmin && (
              <SettingsCard title="Provider & Model Settings">
                <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Configure AI provider, models, and advanced parameters
                </p>
                <AIProviderPanel
                  aiConfig={aiConfig}
                  setAiConfig={setAiConfig}
                  addToast={addToast}
                />
              </SettingsCard>
            )}
          </div>
        </>
      );

    case 'mcp-integrations':
      return (
        <>
          <SectionHeader title="MCP Integrations" description="Configure Rube tools, compliance MCP, and user access" />
          <MCPIntegrationsPanel addToast={addToast} />
        </>
      );

    case 'workflow-log':
      return (
        <>
          <SectionHeader title="Workflow History" description="View agent and workflow execution history" />
          <WorkflowHistoryLog addToast={addToast} />
        </>
      );

    case 'shopify':
      return (
        <>
          <SectionHeader title="Shopify Integration" description="Connect and configure your Shopify store" />
          <ShopifyIntegrationPanel currentUser={currentUser} inventory={inventory} boms={boms} />
        </>
      );

    case 'dev-tools':
      return (
        <>
          <SectionHeader title="Developer Tools" description="Debug tools and development settings" />
          <div className="space-y-4">
            <SettingsCard>
              <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <p><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Session User:</span> {session?.user?.email ?? 'None'}</p>
                <p><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>User ID:</span> {session?.user?.id ?? 'N/A'}</p>
                <p><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>God Mode:</span> {godMode ? 'Enabled' : 'Disabled'}</p>
              </div>
            </SettingsCard>

            <SettingsCard>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Dev God Mode</p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Bypasses auth and RLS (local only).
                  </p>
                </div>
                <Button
                  className={`px-4 py-2 rounded-lg font-semibold ${
                    godMode
                      ? 'bg-red-500/20 text-red-200 border border-red-400/40'
                      : isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'
                  }`}
                  onClick={() => setGodMode(!godMode)}
                >
                  {godMode ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </SettingsCard>
          </div>
        </>
      );

    case 'help':
      return (
        <>
          <SectionHeader title="Help & Compliance" description="Terms of service, support, and compliance information" />
          <SettingsSubNav
            items={[
              { id: 'terms', label: 'Terms' },
              { id: 'support', label: 'Help Desk' },
              { id: 'playbook', label: 'Playbook' },
              { id: 'compliance', label: 'Compliance' },
            ]}
          >
            <div className="space-y-6">
              <div id="subsection-terms">
                <SettingsCard title="Terms & Controls">
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Keep auditors, plant owners, and investors aligned with the current Terms.
                  </p>
                  <ul className={`mt-3 space-y-1 text-sm list-disc list-inside ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    <li>Section 14 covers data retention + deletion requests.</li>
                    <li>Section 16 clarifies compliance responsibilities.</li>
                    <li>Section 12 reminds teams AI output is not legal advice.</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => setIsTermsModalOpen(true)}
                    className="inline-flex items-center gap-2 mt-3 text-sm font-semibold text-accent-400 hover:text-accent-300 underline decoration-dotted"
                  >
                    View Terms of Service
                  </button>
                </SettingsCard>
              </div>

              <div id="subsection-support">
                <SettingsCard title="Help Desk Workflow">
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Send everything to{' '}
                    <a href="mailto:support@murp.app" className="text-accent-400 hover:text-accent-300 underline decoration-dotted">
                      support@murp.app
                    </a>{' '}
                    with logs, impact, and stakeholders copied.
                  </p>
                  <Button
                    type="button"
                    className="mt-4 bg-accent-500 hover:bg-accent-600 text-white px-4 py-2 rounded-md"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.open(helpTicketMailto, '_blank');
                      }
                    }}
                  >
                    Create Help Ticket
                  </Button>
                </SettingsCard>
              </div>

              <div id="subsection-playbook">
                <SettingsCard title="Support Playbook">
                  <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    What each audience should include when escalating.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {supportPlaybook.map((group) => (
                      <div
                        key={group.title}
                        className={`rounded-lg p-4 ${
                          isDark ? 'border border-gray-700/70 bg-gray-900/40' : 'border border-gray-200 bg-gray-50'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{group.title}</p>
                        <ul className={`mt-2 space-y-1 text-sm list-disc list-inside ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                          {group.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </SettingsCard>
              </div>

              <div id="subsection-compliance">
                <SettingsCard title="Compliance Agreement">
                  <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Capture acknowledgements that MuRP&apos;s regulatory intel is advisory only.
                  </p>
                  <RegulatoryAgreementPanel
                    currentUser={currentUser}
                    onUpdateUser={onUpdateUser}
                    addToast={addToast}
                  />
                </SettingsCard>
              </div>
            </div>
          </SettingsSubNav>
          <TermsOfServiceModal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} />
        </>
      );

    default:
      return (
        <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <p>Section not found</p>
        </div>
      );
  }
};

export default SettingsContent;
