import { useEffect } from 'react';
import { getFinaleSyncService } from '../services/finaleSyncService';

/**
 * Hook to initialize Finale Sync Service with credentials from storage
 * Call this once in the root App component
 */
export const useFinaleInit = () => {
  useEffect(() => {
    const accountPath = localStorage.getItem('FINALE_ACCOUNT_PATH');
    const username = localStorage.getItem('FINALE_USERNAME');
    const password = localStorage.getItem('FINALE_PASSWORD');

    if (accountPath && username && password) {
      const syncService = getFinaleSyncService();
      if (!syncService.isConfigured()) {
          console.log('[useFinaleInit] Initializing Finale Sync Service from saved credentials');
          syncService.setCredentials(username, password, accountPath);
      }
    }
  }, []);
};
