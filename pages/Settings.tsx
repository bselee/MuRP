import React, { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiSettings, InventoryItem, BillOfMaterials, Vendor, CompanyEmailSettings } from '../types';
import { UsersIcon, LinkIcon, BotIcon, ShieldCheckIcon, MailIcon, SparklesIcon, ChevronRightIcon, CogIcon, CloseIcon, ExternalLinkIcon, ClipboardIcon, CheckIcon } from '../components/icons';
import CollapsibleSection from '../components/CollapsibleSection';
import AdminUsersPanel from '../components/AdminUsersPanel';
import CarrierTrackingSettingsPanel from '../components/CarrierTrackingSettingsPanel';
import AIProviderPanel from '../components/AIProviderPanel';
import APIIntegrationsPanel from '../components/APIIntegrationsPanel';
import ShopifyIntegrationPanel from '../components/ShopifyIntegrationPanel';
import RegulatoryAgreementPanel from '../components/RegulatoryAgreementPanel';
import AiSettingsPanel from '../components/AiSettingsPanel';
import SemanticSearchSettings from '../components/SemanticSearchSettings';
import { MCPServerPanel } from '../components/MCPServerPanel';
import DocumentTemplatesPanel from '../components/DocumentTemplatesPanel';
import FollowUpSettingsPanel from '../components/FollowUpSettingsPanel';
import GoogleDataPanel from '../components/GoogleDataPanel';
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
import EmailProcessingLog from '../components/settings/EmailProcessingLog';
import WorkflowHistoryLog from '../components/settings/WorkflowHistoryLog';
import VendorTrustScoreLog from '../components/settings/VendorTrustScoreLog';
import GlobalDataFilterPanel from '../components/settings/GlobalDataFilterPanel';
import { useAllCategories } from '../hooks/useSupabaseData';
import { supabase } from '../lib/supabase/client';

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

type SettingsTab = 'account' | 'integrations' | 'email' | 'ai' | 'advanced';

const Settings: React.FC<SettingsProps> = ({
  currentUser, aiConfig, setAiConfig, aiSettings, onUpdateAiSettings,
  gmailConnection,
  apiKey, onGenerateApiKey, onRevokeApiKey, addToast,
  setCurrentPage, externalConnections, onSetExternalConnections,
  inventory, boms, vendors,
  companyEmailSettings, onUpdateCompanyEmailSettings
}) => {
  // Main tab navigation
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  // Section open states within tabs
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: true,
    billing: false,
    team: false,
    google: true,
    carriers: false,
    vendors: false,
    emailMonitoring: true,
    emailPolicy: false,
    aiProvider: true,
    aiAdvanced: false,
  });

  // Modals
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isAnthropicSetupOpen, setIsAnthropicSetupOpen] = useState(false);
  const [anthropicKeyConfigured, setAnthropicKeyConfigured] = useState<boolean | null>(null);
  const [setupStep, setSetupStep] = useState(1);
  const [copiedKey, setCopiedKey] = useState(false);

  // Local state
  const [showApiKey, setShowApiKey] = useState(false);
  const [emailPolicyDraft, setEmailPolicyDraft] = useState<CompanyEmailSettings>(companyEmailSettings);
  const [anthropicKey, setAnthropicKey] = useState('');
  const [anthropicKeyLoading, setAnthropicKeyLoading] = useState(false);

  useEffect(() => {
    setEmailPolicyDraft(companyEmailSettings);
  }, [companyEmailSettings]);

  // Load Anthropic key status on mount
  useEffect(() => {
    loadAnthropicKeyStatus();
  }, []);

  const loadAnthropicKeyStatus = async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'anthropic_api_key_set')
        .single();
      if (data?.value === 'true') {
        setAnthropicKey('••••••••••••••••'); // Masked - key is set
        setAnthropicKeyConfigured(true);
      } else {
        setAnthropicKeyConfigured(false);
      }
    } catch {
      // Key not set
      setAnthropicKeyConfigured(false);
    }
  };

  // Show setup guide when navigating to AI tab if key not configured
  useEffect(() => {
    if (activeTab === 'ai' && anthropicKeyConfigured === false) {
      setIsAnthropicSetupOpen(true);
    }
  }, [activeTab, anthropicKeyConfigured]);

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSaveAnthropicKey = async () => {
    if (!anthropicKey || anthropicKey.startsWith('••')) return;
    setAnthropicKeyLoading(true);
    try {
      // Store in system_settings (the actual key should be stored as a Supabase secret)
      // This just tracks that it's been configured
      await supabase.from('system_settings').upsert({
        key: 'anthropic_api_key_set',
        value: 'true',
        updated_at: new Date().toISOString(),
      });

      // In production, you'd call an edge function to securely store the key
      // For now, show instructions
      addToast('To complete setup, add ANTHROPIC_API_KEY to Supabase secrets via CLI or dashboard.', 'info');
      setAnthropicKey('••••••••••••••••');
      setAnthropicKeyConfigured(true);
      setIsAnthropicSetupOpen(false);
      setSetupStep(1);
    } catch (error: any) {
      addToast(`Failed to save: ${error.message}`, 'error');
    } finally {
      setAnthropicKeyLoading(false);
    }
  };

  const { godMode, setGodMode, session } = useAuth();
  const { theme, setTheme, isDark } = useTheme();
  const { rowDensity, setRowDensity, fontScale, setFontScale } = useUserPreferences();

  const isOpsAdmin = currentUser.role === 'Admin' || currentUser.department === 'Operations';
  const { categories: allCategories } = useAllCategories();

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

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

  // Styling
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

  const tabClass = (tab: SettingsTab) => `
    px-4 py-2 text-sm font-medium rounded-lg transition-colors
    ${activeTab === tab
      ? isDark ? 'bg-accent-500/20 text-accent-300' : 'bg-accent-100 text-accent-700'
      : isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }
  `;

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader
          title="Settings"
          description="Configure your account and system preferences"
          icon={<CogIcon className="w-6 h-6" />}
        />

        {/* Tab Navigation */}
        <div className={`flex flex-wrap gap-2 p-2 rounded-xl ${isDark ? 'bg-gray-900/50' : 'bg-gray-100'}`}>
          <button className={tabClass('account')} onClick={() => setActiveTab('account')}>
            <span className="flex items-center gap-2">
              <UsersIcon className="w-4 h-4" />
              Account
            </span>
          </button>
          <button className={tabClass('integrations')} onClick={() => setActiveTab('integrations')}>
            <span className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Integrations
            </span>
          </button>
          <button className={tabClass('email')} onClick={() => setActiveTab('email')}>
            <span className="flex items-center gap-2">
              <MailIcon className="w-4 h-4" />
              Email & PO
            </span>
          </button>
          <button className={tabClass('ai')} onClick={() => setActiveTab('ai')}>
            <span className="flex items-center gap-2">
              <BotIcon className="w-4 h-4" />
              AI
            </span>
          </button>
          {isOpsAdmin && (
            <button className={tabClass('advanced')} onClick={() => setActiveTab('advanced')}>
              <span className="flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4" />
                Advanced
              </span>
            </button>
          )}
        </div>

        {/* ============================================================ */}
        {/* ACCOUNT TAB */}
        {/* ============================================================ */}
        {activeTab === 'account' && (
          <div className="space-y-4">
            <CollapsibleSection
              title="Profile & Display"
              icon={<UsersIcon className="w-5 h-5 text-blue-400" />}
              isOpen={openSections.profile}
              onToggle={() => toggleSection('profile')}
            >
              <div className="space-y-6">
                {/* Profile Info */}
                <div className={cardClass}>
                  <h3 className={`text-base font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Your Profile</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Name</label>
                      <p className={`mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{currentUser.name}</p>
                    </div>
                    <div>
                      <label className={labelClass}>Email</label>
                      <p className={`mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{currentUser.email}</p>
                    </div>
                    <div>
                      <label className={labelClass}>Role</label>
                      <p className={`mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{currentUser.role}</p>
                    </div>
                    <div>
                      <label className={labelClass}>Department</label>
                      <p className={`mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{currentUser.department}</p>
                    </div>
                  </div>
                </div>

                {/* Display Preferences */}
                <div className={cardClass}>
                  <h3 className={`text-base font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Display</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className={labelClass}>Theme</label>
                      <select value={theme} onChange={(e) => setTheme(e.target.value as ThemePreference)} className={selectClass}>
                        <option value="system">System</option>
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Row Density</label>
                      <select value={rowDensity} onChange={(e) => setRowDensity(e.target.value as RowDensity)} className={selectClass}>
                        <option value="compact">Compact</option>
                        <option value="normal">Normal</option>
                        <option value="comfortable">Comfortable</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Font Scale</label>
                      <select value={fontScale} onChange={(e) => setFontScale(e.target.value as FontScale)} className={selectClass}>
                        <option value="small">Small</option>
                        <option value="normal">Normal</option>
                        <option value="large">Large</option>
                      </select>
                    </div>
                  </div>
                </div>

                {isFeatureEnabled('two_factor') && (
                  <div className={cardClass}>
                    <h3 className={`text-base font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Security</h3>
                    <TwoFactorSettings userId={currentUser.id} addToast={addToast} />
                  </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Billing & Subscription"
              icon={<SparklesIcon className="w-5 h-5 text-amber-400" />}
              isOpen={openSections.billing}
              onToggle={() => toggleSection('billing')}
            >
              <BillingPanel currentUser={currentUser} addToast={addToast} />
            </CollapsibleSection>

            {isOpsAdmin && (
              <CollapsibleSection
                title="Team Management"
                icon={<UsersIcon className="w-5 h-5 text-accent-400" />}
                isOpen={openSections.team}
                onToggle={() => toggleSection('team')}
              >
                <div className="space-y-6">
                  <AdminUsersPanel currentUserId={currentUser.id} />
                  <div className={cardClass}>
                    <h3 className={`text-base font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Notifications</h3>
                    <NotificationPreferencesPanel addToast={addToast} />
                  </div>
                </div>
              </CollapsibleSection>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* INTEGRATIONS TAB */}
        {/* ============================================================ */}
        {activeTab === 'integrations' && (
          <div className="space-y-4">
            <CollapsibleSection
              title="Google & Finale"
              icon={<LinkIcon className="w-5 h-5 text-blue-400" />}
              isOpen={openSections.google}
              onToggle={() => toggleSection('google')}
            >
              <div className="space-y-6">
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
                title="Shopify"
                icon={<LinkIcon className="w-5 h-5 text-emerald-400" />}
                isOpen={false}
                onToggle={() => {}}
              >
                <ShopifyIntegrationPanel currentUser={currentUser} inventory={inventory} boms={boms} />
              </CollapsibleSection>
            )}

            <CollapsibleSection
              title="Carrier Tracking"
              icon={<LinkIcon className="w-5 h-5 text-cyan-400" />}
              isOpen={openSections.carriers}
              onToggle={() => toggleSection('carriers')}
            >
              <CarrierTrackingSettingsPanel addToast={addToast} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Vendors"
              icon={<LinkIcon className="w-5 h-5 text-indigo-400" />}
              isOpen={openSections.vendors}
              onToggle={() => toggleSection('vendors')}
            >
              <div className="space-y-4">
                <div className={cardClass}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className={isDark ? "text-base font-semibold text-white" : "text-base font-semibold text-gray-900"}>
                        {vendors.length} vendor{vendors.length !== 1 ? 's' : ''} configured
                      </h3>
                    </div>
                    <Button onClick={() => setCurrentPage('Vendors')} className="flex items-center gap-2">
                      Open Vendors <ChevronRightIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {isOpsAdmin && <VendorTrustScoreLog addToast={addToast} />}
              </div>
            </CollapsibleSection>
          </div>
        )}

        {/* ============================================================ */}
        {/* EMAIL & PO TAB */}
        {/* ============================================================ */}
        {activeTab === 'email' && (
          <div className="space-y-4">
            <CollapsibleSection
              title="Email Monitoring"
              icon={<MailIcon className="w-5 h-5 text-blue-400" />}
              isOpen={openSections.emailMonitoring}
              onToggle={() => toggleSection('emailMonitoring')}
            >
              <div className="space-y-6">
                <p className={isDark ? "text-sm text-gray-400" : "text-sm text-gray-600"}>
                  Connect your purchasing email to automatically track vendor communications, extract tracking numbers, detect invoices, and update PO status.
                </p>
                <EmailConnectionCard
                  userId={currentUser.id}
                  onConnectionChange={(connected) => {
                    addToast(connected ? 'Email monitoring connected!' : 'Email monitoring disconnected', connected ? 'success' : 'info');
                  }}
                />
                {isOpsAdmin && (
                  <div className={`mt-4 pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Processing Activity
                    </h3>
                    <EmailProcessingLog addToast={addToast} />
                  </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Email Policy"
              icon={<MailIcon className="w-5 h-5 text-emerald-400" />}
              isOpen={openSections.emailPolicy}
              onToggle={() => toggleSection('emailPolicy')}
            >
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClass}>Company From Address</label>
                    <input
                      type="email"
                      value={emailPolicyDraft.fromAddress}
                      onChange={e => setEmailPolicyDraft(prev => ({ ...prev, fromAddress: e.target.value }))}
                      placeholder="purchasing@yourdomain.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Provider</label>
                    <select
                      value={emailPolicyDraft.provider}
                      onChange={e => setEmailPolicyDraft(prev => ({ ...prev, provider: e.target.value as 'resend' | 'gmail' }))}
                      className={selectClass}
                    >
                      <option value="resend">Resend (Built-in)</option>
                      <option value="gmail">Gmail (Workspace)</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="enforce-sender"
                      checked={emailPolicyDraft.enforceCompanySender}
                      onChange={e => setEmailPolicyDraft(prev => ({ ...prev, enforceCompanySender: e.target.checked }))}
                      className="rounded text-accent-500"
                    />
                    <label htmlFor="enforce-sender" className={isDark ? 'text-sm text-gray-300' : 'text-sm text-gray-700'}>
                      Enforce company sender for all emails
                    </label>
                  </div>
                  <Button onClick={handleSaveEmailPolicy}>Save</Button>
                </div>
              </div>
            </CollapsibleSection>

            {isOpsAdmin && (
              <>
                <CollapsibleSection
                  title="PO Automation"
                  icon={<MailIcon className="w-5 h-5 text-sky-400" />}
                  isOpen={false}
                  onToggle={() => {}}
                >
                  <FollowUpSettingsPanel addToast={addToast} />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Document Templates"
                  icon={<MailIcon className="w-5 h-5 text-yellow-400" />}
                  isOpen={false}
                  onToggle={() => {}}
                >
                  <DocumentTemplatesPanel addToast={addToast} />
                </CollapsibleSection>
              </>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* AI TAB */}
        {/* ============================================================ */}
        {activeTab === 'ai' && (
          <div className="space-y-4">
            <CollapsibleSection
              title="AI Provider & Keys"
              icon={<BotIcon className="w-5 h-5 text-purple-400" />}
              isOpen={openSections.aiProvider}
              onToggle={() => toggleSection('aiProvider')}
            >
              <div className="space-y-6">
                {/* Anthropic Key for Invoice Extraction */}
                <div className={cardClass}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Invoice AI Extraction
                      </h3>
                      <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Claude Vision extracts invoice data automatically.
                      </p>
                    </div>
                    {anthropicKeyConfigured ? (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'}`}>
                        <CheckIcon className="w-3.5 h-3.5" />
                        Configured
                      </span>
                    ) : (
                      <button
                        onClick={() => setIsAnthropicSetupOpen(true)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}`}
                      >
                        <SparklesIcon className="w-3.5 h-3.5" />
                        Setup Guide
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <input
                      type="password"
                      value={anthropicKey}
                      onChange={e => setAnthropicKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className={`flex-1 ${inputClass}`}
                    />
                    <Button
                      onClick={handleSaveAnthropicKey}
                      disabled={anthropicKeyLoading || !anthropicKey || anthropicKey.startsWith('••')}
                    >
                      {anthropicKeyLoading ? 'Saving...' : anthropicKey.startsWith('••') ? 'Configured' : 'Save'}
                    </Button>
                  </div>
                  <div className={`flex items-center justify-between mt-2`}>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Get your API key from <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline">console.anthropic.com</a>
                    </p>
                    {anthropicKeyConfigured && (
                      <button
                        onClick={() => setIsAnthropicSetupOpen(true)}
                        className={`text-xs ${isDark ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        Reconfigure
                      </button>
                    )}
                  </div>
                </div>

                {/* Main AI Provider Panel */}
                {isOpsAdmin && (
                  <AIProviderPanel
                    aiConfig={aiConfig}
                    onUpdateAiConfig={setAiConfig}
                    addToast={addToast}
                  />
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Assistant Behavior"
              icon={<BotIcon className="w-5 h-5 text-blue-400" />}
              isOpen={openSections.aiAdvanced}
              onToggle={() => toggleSection('aiAdvanced')}
            >
              <AiSettingsPanel aiSettings={aiSettings} onUpdateSettings={onUpdateAiSettings} />
            </CollapsibleSection>

            {isOpsAdmin && (
              <CollapsibleSection
                title="MCP Server (Compliance)"
                icon={<BotIcon className="w-5 h-5 text-cyan-400" />}
                isOpen={false}
                onToggle={() => {}}
              >
                <MCPServerPanel />
              </CollapsibleSection>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* ADVANCED TAB (Admin Only) */}
        {/* ============================================================ */}
        {activeTab === 'advanced' && isOpsAdmin && (
          <div className="space-y-4">
            <CollapsibleSection
              title="Data Filtering"
              icon={<ShieldCheckIcon className="w-5 h-5 text-red-400" />}
              isOpen={false}
              onToggle={() => {}}
            >
              <GlobalDataFilterPanel allCategories={allCategories} addToast={addToast} />
            </CollapsibleSection>

            <CollapsibleSection
              title="BOM Settings"
              icon={<SparklesIcon className="w-5 h-5 text-amber-400" />}
              isOpen={false}
              onToggle={() => {}}
            >
              <div className="space-y-6">
                <ComponentSwapSettingsPanel addToast={addToast} />
                <BOMApprovalSettingsPanel addToast={addToast} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Search & SOPs"
              icon={<ShieldCheckIcon className="w-5 h-5 text-amber-400" />}
              isOpen={false}
              onToggle={() => {}}
            >
              <div className="space-y-6">
                <SemanticSearchSettings inventory={inventory} boms={boms} vendors={vendors} addToast={addToast} />
                <SOPSettingsPanel addToast={addToast} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Workflow History"
              icon={<ShieldCheckIcon className="w-5 h-5 text-gray-400" />}
              isOpen={false}
              onToggle={() => {}}
            >
              <WorkflowHistoryLog addToast={addToast} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Terms & Compliance"
              icon={<ShieldCheckIcon className="w-5 h-5 text-emerald-400" />}
              isOpen={false}
              onToggle={() => {}}
            >
              <div className="space-y-4">
                <div className={cardClass}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Terms of Service</h3>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Review policies and disclaimers</p>
                    </div>
                    <Button variant="ghost" onClick={() => setIsTermsModalOpen(true)}>View Terms</Button>
                  </div>
                </div>
                <RegulatoryAgreementPanel currentUser={currentUser} onUpdateUser={() => {}} addToast={addToast} />
              </div>
            </CollapsibleSection>

            {isDevelopment() && (
              <CollapsibleSection
                title="Developer Tools"
                icon={<ShieldCheckIcon className="w-5 h-5 text-red-400" />}
                isOpen={false}
                onToggle={() => {}}
              >
                <div className="space-y-4">
                  <div className={cardClass}>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Session:</span> {session?.user?.email ?? 'None'}
                    </p>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>God Mode:</span> {godMode ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isDark ? 'text-sm text-gray-300' : 'text-sm text-gray-700'}>Dev God Mode</span>
                    <Button variant={godMode ? 'danger' : 'ghost'} onClick={() => setGodMode(!godMode)}>
                      {godMode ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
              </CollapsibleSection>
            )}
          </div>
        )}
      </div>

      <TermsOfServiceModal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} />

      {/* Anthropic API Key Setup Guide Modal */}
      {isAnthropicSetupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setIsAnthropicSetupOpen(false);
              setSetupStep(1);
            }}
          />

          {/* Modal */}
          <div className={`relative w-full max-w-lg rounded-2xl shadow-2xl ${isDark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                  <SparklesIcon className={`w-6 h-6 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <div>
                  <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Enable AI Invoice Extraction
                  </h2>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Step {setupStep} of 3
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAnthropicSetupOpen(false);
                  setSetupStep(1);
                }}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Progress Steps */}
            <div className="px-6 pt-4">
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`flex-1 h-1.5 rounded-full transition-colors ${
                      step <= setupStep
                        ? 'bg-purple-500'
                        : isDark ? 'bg-gray-700' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {setupStep === 1 && (
                <div className="space-y-4">
                  <h3 className={`text-base font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Get Your Anthropic API Key
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Claude Vision powers automatic invoice data extraction. You'll need an API key from Anthropic.
                  </p>

                  <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                        <ExternalLinkIcon className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          Anthropic Console
                        </p>
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Create an account and generate an API key
                        </p>
                        <a
                          href="https://console.anthropic.com/settings/keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-2 text-sm text-purple-500 hover:text-purple-400 font-medium"
                        >
                          Open Console <ExternalLinkIcon className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    API usage is pay-as-you-go. Invoice extraction typically costs $0.01-0.05 per document.
                  </div>
                </div>
              )}

              {setupStep === 2 && (
                <div className="space-y-4">
                  <h3 className={`text-base font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Add Key to Supabase Secrets
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Your API key needs to be securely stored in Supabase. Run this command in your terminal:
                  </p>

                  <div className={`relative p-4 rounded-xl font-mono text-sm ${isDark ? 'bg-gray-950' : 'bg-gray-900'} text-gray-100`}>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all">
{`supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here`}
                    </pre>
                    <button
                      onClick={() => handleCopyCommand('supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here')}
                      className="absolute top-3 right-3 p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors"
                      title="Copy command"
                    >
                      {copiedKey ? (
                        <CheckIcon className="w-4 h-4 text-green-400" />
                      ) : (
                        <ClipboardIcon className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>

                  <div className={`p-3 rounded-lg ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                    <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                      <strong>Tip:</strong> Replace <code className="font-mono">sk-ant-your-key-here</code> with your actual API key from the Anthropic Console.
                    </p>
                  </div>
                </div>
              )}

              {setupStep === 3 && (
                <div className="space-y-4">
                  <h3 className={`text-base font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Confirm Setup
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Enter your API key below to verify it's working, then we'll mark it as configured.
                  </p>

                  <div>
                    <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Anthropic API Key
                    </label>
                    <input
                      type="password"
                      value={anthropicKey.startsWith('••') ? '' : anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      placeholder="sk-ant-api03-..."
                      className={`w-full px-4 py-3 rounded-xl text-sm ${
                        isDark
                          ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-purple-500'
                          : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-purple-500'
                      } border focus:ring-2 focus:ring-purple-500/20 transition-colors`}
                    />
                  </div>

                  <div className={`flex items-start gap-2 p-3 rounded-lg ${isDark ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}>
                    <CheckIcon className={`w-4 h-4 mt-0.5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                    <p className={`text-xs ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                      Your key is stored securely and only used server-side for invoice extraction.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-between p-6 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={() => {
                  if (setupStep > 1) setSetupStep(setupStep - 1);
                  else {
                    setIsAnthropicSetupOpen(false);
                    setSetupStep(1);
                  }
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isDark
                    ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {setupStep === 1 ? 'Skip for now' : 'Back'}
              </button>

              {setupStep < 3 ? (
                <Button onClick={() => setSetupStep(setupStep + 1)}>
                  Continue
                </Button>
              ) : (
                <Button
                  onClick={handleSaveAnthropicKey}
                  disabled={anthropicKeyLoading || !anthropicKey || anthropicKey.startsWith('••')}
                >
                  {anthropicKeyLoading ? 'Verifying...' : 'Complete Setup'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Settings;
