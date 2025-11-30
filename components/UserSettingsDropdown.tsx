import React, { useState, useRef, useEffect } from 'react';
import { User, Settings, Bell, Shield, LogOut } from 'lucide-react';
import type { SystemAlert } from '../lib/systemAlerts/SystemAlertContext';

interface UserSettingsDropdownProps {
  user: {
    name: string;
    avatar: string;
  };
  onSignOut: () => void;
  onOpenSettings: () => void;
  isCollapsed?: boolean;
  systemAlerts?: SystemAlert[];
}

const UserSettingsDropdown: React.FC<UserSettingsDropdownProps> = ({
  user,
  onSignOut,
  onOpenSettings,
  isCollapsed = false,
  systemAlerts = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'display', label: 'Display', icon: Settings },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors relative"
        aria-label={`User settings for ${user.name}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={isCollapsed ? user.name : undefined}
      >
        <div className="relative">
          <img
            src={user.avatar}
            alt={`${user.name}'s profile picture`}
            className="w-8 h-8 rounded-full shadow-lg ring-2 ring-blue-500"
          />
          {systemAlerts.length > 0 && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></div>
          )}
        </div>
        {!isCollapsed && (
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {user.name}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-80 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <div className="p-4">
            <div className="flex space-x-1 mb-4 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <tab.icon size={16} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {activeTab === 'profile' && (
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Profile Settings</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manage your personal information and preferences.
                  </p>
                  {/* Placeholder for profile settings */}
                  <div className="text-xs text-gray-500">Profile settings coming soon...</div>
                </div>
              )}
              {activeTab === 'display' && (
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Display Settings</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Customize the appearance of the application.
                  </p>
                  {/* Placeholder for display settings */}
                  <div className="text-xs text-gray-500">Display settings coming soon...</div>
                </div>
              )}
              {activeTab === 'notifications' && (
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Notification Settings</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Control how and when you receive notifications.
                  </p>
                  {/* Placeholder for notification settings */}
                  <div className="text-xs text-gray-500">Notification settings coming soon...</div>
                </div>
              )}
              {activeTab === 'security' && (
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Security Settings</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manage your account security and authentication.
                  </p>
                  {/* Placeholder for security settings */}
                  <div className="text-xs text-gray-500">Security settings coming soon...</div>
                </div>
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 mt-4 pt-4 space-y-1">
              <button
                onClick={onOpenSettings}
                className="flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Settings size={16} />
                <span className="text-sm">Admin Settings</span>
              </button>
              <button
                onClick={onSignOut}
                className="flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
              >
                <LogOut size={16} />
                <span className="text-sm">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSettingsDropdown;