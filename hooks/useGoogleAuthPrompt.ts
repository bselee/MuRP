import { useCallback, useMemo } from 'react';
import { getGoogleAuthService } from '../services/googleAuthService';
import { DEFAULT_SCOPES } from '../lib/google/scopes';

type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

interface PromptOptions {
  reason?: string;
  scopes?: string[];
  /**
   * Optional custom connect function (e.g., parent handler that refreshes state)
   * Should resolve truthy when connection succeeds.
   */
  connect?: () => Promise<boolean | void>;
  /**
   * Optional message to show after successful connection.
   */
  postConnectMessage?: string;
}

type GoogleAuthPrompt = (options?: PromptOptions) => Promise<boolean>;

export function useGoogleAuthPrompt(addToast?: ToastFn): GoogleAuthPrompt {
  const googleAuthService = useMemo(() => getGoogleAuthService(), []);

  return useCallback<GoogleAuthPrompt>(
    async (options) => {
      const { reason, scopes = DEFAULT_SCOPES, connect, postConnectMessage } = options ?? {};

      try {
        const status = await googleAuthService.getAuthStatus();
        if (status.isAuthenticated && status.hasValidToken) {
          return true;
        }

        if (typeof window !== 'undefined') {
          const confirmMessage = reason
            ? `Connect Google Workspace to ${reason}?`
            : 'Connect Google Workspace now?';
          const shouldProceed = window.confirm(confirmMessage);
          if (!shouldProceed) {
            return false;
          }
        }

        if (connect) {
          const result = await connect();
          if (result === false) {
            return false;
          }
        } else {
          await googleAuthService.startOAuthFlow(scopes);
        }

        if (postConnectMessage) {
          addToast?.(postConnectMessage, 'success');
        }

        return true;
      } catch (error) {
        console.error('[useGoogleAuthPrompt] Failed to connect Google Workspace:', error);
        addToast?.(
          `Failed to connect Google Workspace: ${error instanceof Error ? error.message : 'Unexpected error'}`,
          'error',
        );
        return false;
      }
    },
    [addToast, googleAuthService],
  );
}

export type UseGoogleAuthPromptReturn = ReturnType<typeof useGoogleAuthPrompt>;
