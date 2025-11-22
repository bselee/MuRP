export interface CalendarSourceConfig {
  id: string;
  name: string;
  timezone?: string | null;
  ingestEnabled: boolean;
  pushEnabled: boolean;
}

export const normalizeCalendarSources = (
  raw: unknown,
  fallback?: { id: string | null; name?: string | null; timezone?: string | null }
): CalendarSourceConfig[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const obj = entry as Record<string, any>;
        if (typeof obj.id !== 'string') return null;
        return {
          id: obj.id,
          name: typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : obj.id,
          timezone: typeof obj.timezone === 'string' ? obj.timezone : fallback?.timezone,
          ingestEnabled: typeof obj.ingestEnabled === 'boolean' ? obj.ingestEnabled : true,
          pushEnabled: typeof obj.pushEnabled === 'boolean' ? obj.pushEnabled : false,
        } as CalendarSourceConfig;
      })
      .filter((entry): entry is CalendarSourceConfig => Boolean(entry));
  }

  if (fallback?.id) {
    return [
      {
        id: fallback.id,
        name: fallback.name || fallback.id,
        timezone: fallback.timezone,
        ingestEnabled: true,
        pushEnabled: false,
      },
    ];
  }

  return [];
};
