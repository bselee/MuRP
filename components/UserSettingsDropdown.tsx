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

  // Auto-close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {systemAlerts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">All Systems Operational</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">No alerts at this time</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
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