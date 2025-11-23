import React, { useMemo, useState } from 'react';
import { BellIcon, XMarkIcon } from './icons';
import Button from '@/components/ui/Button';
import type { SystemAlert } from '../lib/systemAlerts/SystemAlertContext';

interface AlertBellProps {
  alerts: SystemAlert[];
  onDismiss: (idOrSource: string) => void;
}

const formatRelativeTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
};

const AlertBell: React.FC<AlertBellProps> = ({ alerts, onDismiss }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasAlerts = alerts.length > 0;

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [alerts],
  );

  const toggleOpen = () => {
    if (!hasAlerts) return;
    setIsOpen((prev) => !prev);
  };

  return (
    <div className="relative">
      <Button
        className={`relative p-2 rounded-full transition-colors ${
          hasAlerts
            ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
            : 'text-gray-400 cursor-default'
        }`}
        onClick={toggleOpen}
        aria-label="System alerts"
        title={hasAlerts ? 'System alerts available' : 'All systems normal'}
      >
        <BellIcon className="h-6 w-6" />
        {hasAlerts && (
          <span className="absolute top-2 right-2 block h-2 w-2 rounded-full bg-red-400" />
        )}
      </Button>

      {isOpen && hasAlerts && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-700 bg-gray-900 shadow-xl z-50">
          <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
            <p className="text-sm font-semibold text-white">System alerts</p>
            <Button
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              onClick={() => setIsOpen(false)}
              aria-label="Close alerts"
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {sortedAlerts.map((alert) => (
              <li
                key={alert.id}
                className="border-b border-gray-800 px-3 py-3 last:border-none"
              >
                <p className="text-sm text-white">{alert.message}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
                  <span>{formatRelativeTime(alert.timestamp)}</span>
                  <Button
                    className="text-indigo-300 hover:text-indigo-100 transition-colors"
                    onClick={() => {
                      onDismiss(alert.source);
                      if (alerts.length === 1) {
                        setIsOpen(false);
                      }
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AlertBell;
