export const SYSTEM_ALERT_EVENT = 'murp-system-alert';

export type SystemAlertPayload = {
  source: string;
  message: string;
  severity?: 'error' | 'warning';
  details?: string;
};

export const emitSystemAlert = (payload: SystemAlertPayload) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SystemAlertPayload>(SYSTEM_ALERT_EVENT, { detail: payload }));
};

