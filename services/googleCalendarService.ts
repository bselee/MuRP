import { supabase } from '../lib/supabase/client';
import type { BuildOrder, MaterialRequirement } from '../types';

export interface CalendarMaterial {
  sku?: string;
  name?: string;
  requiredQuantity?: number;
  shortfall?: number;
  vendorName?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  extendedProperties?: Record<string, Record<string, string>>;
}

export interface ProductionCalendarEvent extends GoogleCalendarEvent {
  finishedSku: string | null;
  quantity: number | null;
  skuSource: 'extended_properties' | 'description' | 'summary' | 'unknown';
  quantitySource: 'extended_properties' | 'description' | 'summary' | 'unknown';
  materials?: CalendarMaterial[];
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  timeZone: string;
  primary: boolean;
}

export interface ProductionEventOptions {
  windowDays?: number;
  timeMin?: string;
  timeMax?: string;
}

export class GoogleCalendarService {
  private calendarId: string;
  private timeZone: string;

  constructor(calendarId?: string, timeZone?: string) {
    this.calendarId = calendarId || 'primary';
    this.timeZone = timeZone || 'America/Los_Angeles';
  }

  setCalendarId(calendarId: string) {
    this.calendarId = calendarId;
  }

  setTimeZone(timeZone: string) {
    this.timeZone = timeZone;
  }

  private async requireSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw new Error('Not authenticated');
    }
    return data.session;
  }

  private mapEventDates(startIso: string | null, endIso: string | null) {
    const now = new Date();
    const start = startIso ? new Date(startIso) : now;
    const end = endIso ? new Date(endIso) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return { start, end };
  }

  private mapMaterials(materials?: MaterialRequirement[]): CalendarMaterial[] | undefined {
    if (!materials || materials.length === 0) {
      return undefined;
    }

    return materials.map((req) => ({
      sku: req.sku,
      name: req.name,
      requiredQuantity: req.requiredQuantity,
      shortfall: req.shortfall,
      vendorName: req.vendorName,
    }));
  }

  private buildEventPayloadFromOrder(buildOrder: BuildOrder) {
    if (!buildOrder.scheduledDate) {
      throw new Error('Build order must have a scheduled date to sync with Google Calendar');
    }

    const start = new Date(buildOrder.scheduledDate);
    const end = buildOrder.dueDate
      ? new Date(buildOrder.dueDate)
      : new Date(start.getTime() + (buildOrder.estimatedDurationHours ?? 2) * 60 * 60 * 1000);

    return {
      title: `${buildOrder.name} (${buildOrder.quantity}x)`,
      start: start.toISOString(),
      end: end.toISOString(),
      description: buildOrder.notes || `Production build for ${buildOrder.finishedSku}`,
      location: buildOrder.assignedUserId ? `Owner: ${buildOrder.assignedUserId}` : '',
      finishedSku: buildOrder.finishedSku,
      quantity: buildOrder.quantity,
      materials: this.mapMaterials(buildOrder.materialRequirements),
    };
  }

  /** List available Google Calendars for the user */
  async listCalendars(): Promise<GoogleCalendar[]> {
    try {
      await this.requireSession();
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'list_calendars',
        },
      });

      if (error) throw error;
      return data.calendars || [];
    } catch (error) {
      console.error('[GoogleCalendarService] Error listing calendars:', error);
      throw error;
    }
  }

  /** Basic event listing (without parsed SKU/quantity metadata) */
  async getUpcomingEvents(daysAhead: number = 90): Promise<GoogleCalendarEvent[]> {
    try {
      await this.requireSession();
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'list_events',
          calendarId: this.calendarId,
          windowDays: daysAhead,
        },
      });

      if (error) throw error;

      return (data.events || []).map((event: any) => {
        const { start, end } = this.mapEventDates(event.start, event.end);
        return {
          id: event.id,
          title: event.title || event.summary || 'Production Event',
          start,
          end,
          description: event.description,
          location: event.location,
          extendedProperties: event.extendedProperties,
        } satisfies GoogleCalendarEvent;
      });
    } catch (error) {
      console.error('[GoogleCalendarService] Error fetching events:', error);
      return [];
    }
  }

  /** Fetch production events with parsed SKU+quantity metadata */
  async getProductionEvents(options: ProductionEventOptions = {}): Promise<ProductionCalendarEvent[]> {
    try {
      await this.requireSession();
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'list_production_events',
          calendarId: this.calendarId,
          windowDays: options.windowDays ?? 90,
          timeMin: options.timeMin,
          timeMax: options.timeMax,
        },
      });

      if (error) throw error;

      return (data.events || []).map((event: any) => {
        const { start, end } = this.mapEventDates(event.start, event.end);
        return {
          id: event.id,
          title: event.title || event.summary || 'Production Event',
          start,
          end,
          description: event.description,
          location: event.location,
          extendedProperties: event.extendedProperties,
          finishedSku: event.finishedSku ?? null,
          quantity: typeof event.quantity === 'number' ? event.quantity : event.quantity ? Number(event.quantity) : null,
          skuSource: event.skuSource ?? 'unknown',
          quantitySource: event.quantitySource ?? 'unknown',
          materials: event.materials,
        } satisfies ProductionCalendarEvent;
      });
    } catch (error) {
      console.error('[GoogleCalendarService] Error loading production events:', error);
      throw error;
    }
  }

  /** Create a build order event in Google Calendar */
  async createBuildEvent(buildOrder: BuildOrder): Promise<string | null> {
    try {
      await this.requireSession();
      const event = this.buildEventPayloadFromOrder(buildOrder);

      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'create_event',
          calendarId: this.calendarId,
          timeZone: this.timeZone,
          event,
        },
      });

      if (error) throw error;
      return data.eventId as string;
    } catch (error) {
      console.error('[GoogleCalendarService] Error creating build event:', error);
      return null;
    }
  }

  /** Update an existing Google Calendar event */
  async updateBuildEvent(eventId: string, buildOrder: BuildOrder): Promise<boolean> {
    try {
      await this.requireSession();
      const event = this.buildEventPayloadFromOrder(buildOrder);

      const { error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'update_event',
          calendarId: this.calendarId,
          timeZone: this.timeZone,
          eventId,
          event,
        },
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[GoogleCalendarService] Error updating build event:', error);
      return false;
    }
  }

  /** Delete an event from Google Calendar */
  async deleteBuildEvent(eventId: string): Promise<boolean> {
    try {
      await this.requireSession();
      const { error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'delete_event',
          calendarId: this.calendarId,
          eventId,
        },
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[GoogleCalendarService] Error deleting build event:', error);
      return false;
    }
  }
}

// Singleton instance
let googleCalendarService: GoogleCalendarService | null = null;

export function getGoogleCalendarService(calendarId?: string, timeZone?: string): GoogleCalendarService {
  if (!googleCalendarService) {
    googleCalendarService = new GoogleCalendarService(calendarId, timeZone);
  } else {
    if (calendarId) {
      googleCalendarService.setCalendarId(calendarId);
    }
    if (timeZone) {
      googleCalendarService.setTimeZone(timeZone);
    }
  }
  return googleCalendarService;
}

export default GoogleCalendarService;
