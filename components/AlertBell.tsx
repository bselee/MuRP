import React, { useMemo, useState, useEffect } from 'react';
import { BellIcon, XMarkIcon } from './icons';
import Button from '@/components/ui/Button';
import { supabase } from '../lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Notification {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  data?: any;
  read: boolean;
  created_at: string;
}

interface AlertBellProps {
  userId?: string;
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

const getSeverityColor = (severity: string): string => {
  switch (severity) {
    case 'critical': return 'text-red-400';
    case 'high': return 'text-orange-400';
    case 'medium': return 'text-yellow-400';
    default: return 'text-blue-400';
  }
};

const AlertBell: React.FC<AlertBellProps> = ({ userId }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('read', false)
        .not('dismissed', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Set up real-time subscription
    if (userId) {
      const newChannel = supabase
        .channel(`notifications-${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        }, () => {
          fetchNotifications();
        })
        .subscribe();

      setChannel(newChannel);

      return () => {
        if (newChannel) {
          supabase.removeChannel(newChannel);
        }
      };
    }
  }, [userId]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const hasNotifications = unreadCount > 0;

  const sortedNotifications = useMemo(
    () => [...notifications].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [notifications],
  );

  const handleDismiss = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      // Update local state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error dismissing notification:', error);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      // Update local state
      setNotifications(prev => prev.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const toggleOpen = () => {
    if (!hasNotifications) return;
    setIsOpen((prev) => !prev);
  };

  if (loading) {
    return (
      <div className="relative">
        <Button
          className="relative p-2 rounded-full text-gray-400 cursor-default"
          disabled
          aria-label="Loading notifications"
        >
          <BellIcon className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        className={`relative p-2 rounded-full transition-colors ${
          hasNotifications
            ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
            : 'text-gray-400 cursor-default'
        }`}
        onClick={toggleOpen}
        aria-label="Notifications"
        title={hasNotifications ? `${unreadCount} unread notifications` : 'No unread notifications'}
      >
        <BellIcon className="h-6 w-6" />
        {hasNotifications && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && hasNotifications && (
        <div className="absolute right-0 mt-2 w-96 rounded-lg border border-gray-700 bg-gray-900 shadow-xl z-50">
          <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <Button
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              onClick={() => setIsOpen(false)}
              aria-label="Close notifications"
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {sortedNotifications.map((notification) => (
              <li
                key={notification.id}
                className={`border-b border-gray-800 px-3 py-3 last:border-none ${
                  !notification.read ? 'bg-gray-800/50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${getSeverityColor(notification.severity)}`}>
                      {notification.title}
                    </p>
                    <p className="text-sm text-gray-300 mt-1">{notification.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatRelativeTime(notification.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 ml-2">
                    {!notification.read && (
                      <Button
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        onClick={() => handleMarkAsRead(notification.id)}
                      >
                        Mark read
                      </Button>
                    )}
                    <Button
                      className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                      onClick={() => handleDismiss(notification.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {notifications.length === 0 && (
            <div className="px-3 py-6 text-center text-gray-400">
              <p className="text-sm">No notifications</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertBell;
