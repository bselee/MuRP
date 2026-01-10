import type { ReactNode } from 'react';
import type { User, AiConfig, AiSettings, InventoryItem, BillOfMaterials, Vendor, CompanyEmailSettings, ExternalConnection, GmailConnection } from '../../types';
import type { Page } from '../../App';

// Section IDs for URL hash fragments
export type SettingsSectionId =
  // Account
  | 'personalization'
  | 'billing'
  // Team (admin)
  | 'team'
  // Admin
  | 'modules'
  // Data & Integrations (admin)
  | 'integrations'
  | 'api-keys'
  | 'data-filters'
  // Operations
  | 'purchasing'
  | 'bom'
  | 'search'
  | 'sops'
  // Email
  | 'email-policy'
  | 'email-monitoring'
  | 'email-branding'
  | 'email-log'
  // Communication
  | 'templates'
  // AI
  | 'ai-assistant'
  | 'workflow-log'
  // Sales
  | 'shopify'
  // Advanced
  | 'mcp-server'
  | 'dev-tools'
  | 'help';

export type SettingsGroup =
  | 'Account'
  | 'Team'
  | 'Admin'
  | 'Data'
  | 'Operations'
  | 'Email'
  | 'Communication'
  | 'AI'
  | 'Sales'
  | 'Advanced';

export interface SettingsSectionConfig {
  id: SettingsSectionId;
  label: string;
  group: SettingsGroup;
  adminOnly?: boolean;
  managerOnly?: boolean;
  devOnly?: boolean;
  featureFlag?: string;
}

// Section definitions - order matters for navigation
export const settingsSections: SettingsSectionConfig[] = [
  // Account
  { id: 'personalization', label: 'Profile & Display', group: 'Account' },
  { id: 'billing', label: 'Billing & Subscription', group: 'Account' },

  // Team (admin only)
  { id: 'team', label: 'Team & Permissions', group: 'Team', adminOnly: true },

  // Admin (admin only)
  { id: 'modules', label: 'Modules', group: 'Admin', adminOnly: true },

  // Data & Integrations (admin only)
  { id: 'integrations', label: 'Company Integrations', group: 'Data', adminOnly: true },
  { id: 'api-keys', label: 'API Keys & Connections', group: 'Data', adminOnly: true },
  { id: 'data-filters', label: 'Global Data Filtering', group: 'Data', adminOnly: true },

  // Operations
  { id: 'purchasing', label: 'Purchasing & Vendors', group: 'Operations', adminOnly: true },
  { id: 'bom', label: 'BOM Management', group: 'Operations' },
  { id: 'search', label: 'Search & Indexing', group: 'Operations' },
  { id: 'sops', label: 'SOPs & Job Descriptions', group: 'Operations', managerOnly: true },

  // Email
  { id: 'email-policy', label: 'Email Policy', group: 'Email' },
  { id: 'email-monitoring', label: 'Inbox Monitoring', group: 'Email', adminOnly: true },
  { id: 'email-branding', label: 'Email Branding', group: 'Email', adminOnly: true },
  { id: 'email-log', label: 'Activity Log', group: 'Email', adminOnly: true },

  // Communication (admin only)
  { id: 'templates', label: 'Document Templates', group: 'Communication', adminOnly: true },

  // AI
  { id: 'ai-assistant', label: 'AI Assistant', group: 'AI' },
  { id: 'workflow-log', label: 'Workflow History', group: 'AI', adminOnly: true },

  // Sales (feature-gated)
  { id: 'shopify', label: 'Shopify', group: 'Sales', featureFlag: 'shopify' },

  // Advanced
  { id: 'mcp-server', label: 'MCP Server', group: 'Advanced', adminOnly: true },
  { id: 'dev-tools', label: 'Developer Tools', group: 'Advanced', devOnly: true, adminOnly: true },
  { id: 'help', label: 'Help & Compliance', group: 'Advanced' },
];

// Group order for sidebar rendering
export const groupOrder: SettingsGroup[] = [
  'Account',
  'Team',
  'Admin',
  'Data',
  'Operations',
  'Email',
  'Communication',
  'AI',
  'Sales',
  'Advanced',
];

// Props passed to Settings page - used by SettingsContent
export interface SettingsPageProps {
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

// Utility to check if user can see a section
export function canAccessSection(
  section: SettingsSectionConfig,
  user: User,
  isDev: boolean,
  isFeatureEnabled: (flag: string) => boolean
): boolean {
  // Feature flag check
  if (section.featureFlag && !isFeatureEnabled(section.featureFlag)) {
    return false;
  }

  // Dev-only check
  if (section.devOnly && !isDev) {
    return false;
  }

  const isAdmin = user.role === 'Admin' || user.department === 'Operations';
  const isManager = user.role === 'Manager';

  // Admin-only check
  if (section.adminOnly && !isAdmin) {
    return false;
  }

  // Manager-only check (admin also passes)
  if (section.managerOnly && !isAdmin && !isManager) {
    return false;
  }

  return true;
}

// Get sections grouped for sidebar
export function getSectionsGroupedForSidebar(
  user: User,
  isDev: boolean,
  isFeatureEnabled: (flag: string) => boolean
): Map<SettingsGroup, SettingsSectionConfig[]> {
  const grouped = new Map<SettingsGroup, SettingsSectionConfig[]>();

  for (const group of groupOrder) {
    grouped.set(group, []);
  }

  for (const section of settingsSections) {
    if (canAccessSection(section, user, isDev, isFeatureEnabled)) {
      const groupSections = grouped.get(section.group);
      if (groupSections) {
        groupSections.push(section);
      }
    }
  }

  // Remove empty groups
  for (const [group, sections] of grouped) {
    if (sections.length === 0) {
      grouped.delete(group);
    }
  }

  return grouped;
}

// Get default section for user
export function getDefaultSection(
  user: User,
  isDev: boolean,
  isFeatureEnabled: (flag: string) => boolean
): SettingsSectionId {
  const accessible = settingsSections.find(s =>
    canAccessSection(s, user, isDev, isFeatureEnabled)
  );
  return accessible?.id ?? 'personalization';
}
