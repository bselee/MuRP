import React, { useState, useRef, useEffect } from 'react';
import { User, Settings, Bell, Shield, LogOut, AlertTriangle, X, CheckCircle, Info, AlertCircle } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'alerts' | 'profile' | 'display' | 'notifications' | 'security'>('alerts');
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

  // Auto-switch to alerts tab when alerts exist and dropdown opens
  useEffect(() => {
    if (isOpen && systemAlerts.length > 0 && activeTab !== 'alerts') {
      setActiveTab('alerts');
    }
  }, [isOpen, systemAlerts.length, activeTab]);

  const getSeverityIcon = (severity: SystemAlert['severity']) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: SystemAlert['severity']) => {
    switch (severity) {
      case 'error':
        return 'border-red-200 bg-red-50 dark:bg-red-950/20';
      case 'warning':
        return 'border-amber-200 bg-amber-50 dark:bg-amber-950/20';
      default:
        return 'border-blue-200 bg-blue-50 dark:bg-blue-950/20';
    }
  };

  const tabs = [
    { id: 'alerts' as const, label: 'Alerts', icon: Bell, count: systemAlerts.length },
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'display' as const, label: 'Display', icon: Settings },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'security' as const, label: 'Security', icon: Shield },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
        aria-label={`User menu for ${user.name}${systemAlerts.length > 0 ? `, ${systemAlerts.length} alerts` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={isCollapsed ? `${user.name}${systemAlerts.length > 0 ? ` (${systemAlerts.length} alerts)` : ''}` : undefined}
      >
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-0.5 shadow-lg ring-2 ring-white dark:ring-gray-800 group-hover:ring-blue-300 dark:group-hover:ring-blue-600 transition-all duration-200">
            <img
              src={user.avatar}
              alt={`${user.name}'s profile picture`}
              className="w-full h-full rounded-full object-cover"
            />
          </div>
          {systemAlerts.length > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-red-500 to-red-600 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-lg animate-pulse">
              <span className="text-xs font-bold text-white">{systemAlerts.length}</span>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
              {user.name}
            </span>
            {systemAlerts.length > 0 && (
              <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                {systemAlerts.length} alert{systemAlerts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-96 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-0.5">
                <img
                  src={user.avatar}
                  alt={`${user.name}'s profile picture`}
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{user.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">System Status</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 bg-white dark:bg-gray-900'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <tab.icon size={16} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                      : 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {activeTab === 'alerts' && (
              <div className="p-4">
                {systemAlerts.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">All Systems Operational</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">No alerts at this time</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
                      <Bell className="w-4 h-4 mr-2" />
                      System Alerts ({systemAlerts.length})
                    </h4>
                    {systemAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}
                      >
                        <div className="flex items-start space-x-3">
                          {getSeverityIcon(alert.severity)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {alert.message}
                            </p>
                            {alert.details && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                {alert.details}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                              {new Date(alert.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="p-4 space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">Profile Settings</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manage your personal information and preferences.
                </p>
                <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  Profile settings coming soon...
                </div>
              </div>
            )}

            {activeTab === 'display' && (
              <div className="p-4 space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">Display Settings</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Customize the appearance of the application.
                </p>
                <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  Display settings coming soon...
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="p-4 space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">Notification Settings</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Control how and when you receive notifications.
                </p>
                <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  Notification settings coming soon...
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="p-4 space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">Security Settings</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manage your account security and authentication.
                </p>
                <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  Security settings coming soon...
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-2">
            <button
              onClick={onOpenSettings}
              className="flex items-center space-x-2 w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Settings size={16} />
              <span className="text-sm">Admin Settings</span>
            </button>
            <button
              onClick={onSignOut}
              className="flex items-center space-x-2 w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
            >
              <LogOut size={16} />
              <span className="text-sm">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSettingsDropdown;