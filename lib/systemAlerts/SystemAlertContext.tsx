import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { SYSTEM_ALERT_EVENT, type SystemAlertPayload } from './alertBus';

export type SystemAlertSeverity = 'error' | 'warning';

export interface SystemAlert {
  id: string;
  source: string;
  message: string;
  severity: SystemAlertSeverity;
  timestamp: string;
  details?: string;
}

interface SystemAlertContextValue {
  alerts: SystemAlert[];
  upsertAlert: (alert: {
    source: string;
    message: string;
    severity?: SystemAlertSeverity;
    id?: string;
    timestamp?: string;
    details?: string;
  }) => void;
  dismissAlert: (idOrSource: string) => void;
  resolveAlert: (source: string) => void;
  clearAlerts: () => void;
}

const SystemAlertContext = createContext<SystemAlertContextValue | undefined>(undefined);

export const SystemAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SystemAlertPayload>).detail;
      if (!detail) return;
      upsertAlert(detail);
    };
    window.addEventListener(SYSTEM_ALERT_EVENT, handler);
    return () => {
      window.removeEventListener(SYSTEM_ALERT_EVENT, handler);
    };
  }, [upsertAlert]);

  const upsertAlert: SystemAlertContextValue['upsertAlert'] = useCallback((alertInput) => {
    setAlerts((prev) => {
      const nextAlert: SystemAlert = {
        id: alertInput.id ?? alertInput.source,
        source: alertInput.source,
        message: alertInput.message,
        severity: alertInput.severity ?? 'error',
        timestamp: alertInput.timestamp ?? new Date().toISOString(),
        details: alertInput.details,
      };

      const matchIndex = prev.findIndex((alert) => alert.source === alertInput.source);
      if (matchIndex >= 0) {
        const copy = [...prev];
        copy[matchIndex] = nextAlert;
        return copy;
      }
      return [...prev, nextAlert];
    });
  }, []);

  const dismissAlert = useCallback((idOrSource: string) => {
    setAlerts((prev) => prev.filter(
      (alert) => alert.id !== idOrSource && alert.source !== idOrSource,
    ));
  }, []);

  const resolveAlert = useCallback((source: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.source !== source));
  }, []);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  const value: SystemAlertContextValue = useMemo(() => ({
    alerts,
    upsertAlert,
    dismissAlert,
    resolveAlert,
    clearAlerts,
  }), [alerts, upsertAlert, dismissAlert, resolveAlert, clearAlerts]);

  return (
    <SystemAlertContext.Provider value={value}>
      {children}
    </SystemAlertContext.Provider>
  );
};

export const useSystemAlerts = (): SystemAlertContextValue => {
  const context = useContext(SystemAlertContext);
  if (!context) {
    throw new Error('useSystemAlerts must be used within a SystemAlertProvider');
  }
  return context;
};
