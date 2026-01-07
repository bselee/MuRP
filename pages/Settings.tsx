import React, { useState } from 'react';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiSettings, InventoryItem, BillOfMaterials, Vendor, CompanyEmailSettings } from '../types';
import { isDevelopment } from '../lib/auth/guards';
import { isFeatureEnabled } from '../lib/featureFlags';
import useSettingsHash from '../hooks/useSettingsHash';
import { getSectionsGroupedForSidebar, getDefaultSection } from '../components/settings/settingsConfig';
import SettingsLayout from '../components/settings/SettingsLayout';
import SettingsSidebar from '../components/settings/SettingsSidebar';
import SettingsContent from '../components/settings/SettingsContent';

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

const Settings: React.FC<SettingsProps> = (props) => {
  const { currentUser } = props;
  const isDev = isDevelopment();

  // Get default section based on user permissions
  const defaultSection = getDefaultSection(currentUser, isDev, isFeatureEnabled);

  // URL hash-based section navigation
  const [activeSection, setActiveSection] = useSettingsHash(defaultSection);

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Get sections grouped for sidebar based on user permissions
  const sections = getSectionsGroupedForSidebar(currentUser, isDev, isFeatureEnabled);

  return (
    <SettingsLayout
      sidebar={
        <SettingsSidebar
          sections={sections}
          activeSection={activeSection}
          onSelect={setActiveSection}
          onClose={() => setSidebarOpen(false)}
        />
      }
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
    >
      <SettingsContent
        activeSection={activeSection}
        {...props}
      />
    </SettingsLayout>
  );
};

export default Settings;
