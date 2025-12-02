import React, { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import {
  GmailIcon,
  GoogleCalendarIcon,
  GoogleSheetsIcon,
  CheckCircleIcon,
  XCircleIcon,
} from './icons';
import { getGoogleAuthService } from '../services/googleAuthService';
import type { GmailConnection } from '../types';

interface GoogleDataPanelProps {
  userId: string;
  gmailConnection: GmailConnection;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const GoogleDataPanel: React.FC<GoogleDataPanelProps> = ({ userId, gmailConnection, addToast }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');

  const checkConnection = useCallback(async () => {
    setLoading(true);
    try {
      const googleAuthService = getGoogleAuthService();
      const status = await googleAuthService.getAuthStatus();
      setIsConnected(status.isAuthenticated && status.hasValidToken);

      // Get email from gmailConnection if available
      if (gmailConnection.isConnected && gmailConnection.email) {
        setUserEmail(gmailConnection.email);
      }
    } catch (error) {
      console.error('[GoogleDataPanel] Failed to check connection:', error);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [gmailConnection]);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const handleConnect = async () => {
    try {
      const googleAuthService = getGoogleAuthService();
      await googleAuthService.initiateAuth();
      addToast('Connecting to Google Workspace...', 'info');
    } catch (error) {
      console.error('[GoogleDataPanel] Failed to initiate auth:', error);
      addToast('Failed to connect to Google Workspace', 'error');
    }
  };

  const handleDisconnect = async () => {
    try {
      const googleAuthService = getGoogleAuthService();
      await googleAuthService.signOut();
      setIsConnected(false);
      setUserEmail('');
      addToast('Disconnected from Google Workspace', 'success');
    } catch (error) {
      console.error('[GoogleDataPanel] Failed to disconnect:', error);
      addToast('Failed to disconnect', 'error');
    }
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-2xl">
            <GoogleCalendarIcon className="w-8 h-8 text-[#4285F4]" />
            <GoogleSheetsIcon className="w-8 h-8 text-[#34A853]" />
            <GmailIcon className="w-8 h-8 text-[#EA4335]" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">Google Workspace</h3>
            <p className="text-sm text-gray-400 mt-1">
              {isConnected ? `Connected as ${userEmail || 'user'}` : 'Connect to enable Calendar, Sheets, and Gmail'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <CheckCircleIcon className="w-6 h-6 text-green-400" />
          ) : (
            <XCircleIcon className="w-6 h-6 text-gray-500" />
          )}
        </div>
      </div>

      {!isConnected ? (
        <div className="space-y-4">
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-6 text-center">
            <h4 className="text-lg font-semibold text-white mb-2">Connect Your Account</h4>
            <p className="text-sm text-gray-400 mb-6">
              Sign in with Google to enable Calendar sync, Sheets integration, and Gmail automation
            </p>
            <Button
              onClick={handleConnect}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-md font-semibold transition-colors"
            >
              {loading ? 'Connecting...' : 'Connect Google Workspace'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">Connected Services</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-800/40 rounded-md">
                <div className="flex items-center gap-3">
                  <GoogleCalendarIcon className="w-5 h-5 text-[#4285F4]" />
                  <div>
                    <p className="text-sm font-medium text-white">Calendar</p>
                    <p className="text-xs text-gray-400">Production schedule sync</p>
                  </div>
                </div>
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-800/40 rounded-md">
                <div className="flex items-center gap-3">
                  <GoogleSheetsIcon className="w-5 h-5 text-[#34A853]" />
                  <div>
                    <p className="text-sm font-medium text-white">Sheets</p>
                    <p className="text-xs text-gray-400">Import/export inventory data</p>
                  </div>
                </div>
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-800/40 rounded-md">
                <div className="flex items-center gap-3">
                  <GmailIcon className="w-5 h-5 text-[#EA4335]" />
                  <div>
                    <p className="text-sm font-medium text-white">Gmail</p>
                    <p className="text-xs text-gray-400">Send POs and follow-ups</p>
                  </div>
                </div>
                {gmailConnection.isConnected ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-400" />
                ) : (
                  <span className="text-xs text-gray-500">Available</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <p className="text-xs text-gray-500">
              All services are automatically enabled when you connect
            </p>
            <Button
              onClick={handleDisconnect}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {isConnected && (
        <div className="mt-6 pt-6 border-t border-gray-700">
          <p className="text-xs text-gray-500 mb-3">
            Configure advanced settings for each service below in the Integrations section
          </p>
        </div>
      )}
    </div>
  );
};

export default GoogleDataPanel;
