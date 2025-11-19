import { supabase } from '../lib/supabase';
import type { BuildOrder } from '../types';

export interface BuildCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  materials?: Array<{
    component_name: string;
    quantity: number;
    unit: string;
    vendor: string;
    cost: number;
  }>;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  timeZone: string;
  primary: boolean;
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

  /**
   * List available Google Calendars
   */
  async listCalendars(): Promise<GoogleCalendar[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'listCalendars',
        },
      });

      if (error) throw error;
      return data.calendars || [];
    } catch (error) {
      console.error('[GoogleCalendarService] Error listing calendars:', error);
      throw error;
    }
  }

  /**
   * Get upcoming build events from Google Calendar
   */
  async getUpcomingBuilds(daysAhead: number = 90): Promise<BuildCalendarEvent[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('[GoogleCalendarService] No active session');
        return [];
      }

      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'list',
          calendarId: this.calendarId,
          daysAhead,
        },
      });

      if (error) throw error;

      return (data.events || []).map((event: any) => ({
        ...event,
        start: new Date(event.start),
        end: new Date(event.end),
      }));
    } catch (error) {
      console.error('[GoogleCalendarService] Error fetching upcoming builds:', error);
      return [];
    }
  }

  /**
   * Create a build event in Google Calendar
   */
  async createBuildEvent(buildOrder: BuildOrder): Promise<string | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      if (!buildOrder.scheduledStart || !buildOrder.scheduledEnd) {
        throw new Error('Build order must have scheduled start and end times');
      }

      // Get materials for this build
      const materials = buildOrder.components?.map(comp => ({
        component_name: comp.component_name,
        quantity: comp.quantity_needed,
        unit: comp.unit || 'ea',
        vendor: comp.vendor || 'Unknown',
        cost: comp.cost_per_unit || 0,
      }));

      const event = {
        title: `Build: ${buildOrder.product_name}`,
        start: new Date(buildOrder.scheduledStart).toISOString(),
        end: new Date(buildOrder.scheduledEnd).toISOString(),
        description: `Production build for ${buildOrder.product_name}\nQuantity: ${buildOrder.quantity}\nStatus: ${buildOrder.status}`,
        location: buildOrder.location || '',
        materials,
      };

      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'create',
          calendarId: this.calendarId,
          timeZone: this.timeZone,
          event,
        },
      });

      if (error) throw error;
      return data.eventId;
    } catch (error) {
      console.error('[GoogleCalendarService] Error creating build event:', error);
      return null;
    }
  }

  /**
   * Update an existing build event
   */
  async updateBuildEvent(eventId: string, buildOrder: BuildOrder): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      if (!buildOrder.scheduledStart || !buildOrder.scheduledEnd) {
        throw new Error('Build order must have scheduled start and end times');
      }

      const materials = buildOrder.components?.map(comp => ({
        component_name: comp.component_name,
        quantity: comp.quantity_needed,
        unit: comp.unit || 'ea',
        vendor: comp.vendor || 'Unknown',
        cost: comp.cost_per_unit || 0,
      }));

      const event = {
        title: `Build: ${buildOrder.product_name}`,
        start: new Date(buildOrder.scheduledStart).toISOString(),
        end: new Date(buildOrder.scheduledEnd).toISOString(),
        description: `Production build for ${buildOrder.product_name}\nQuantity: ${buildOrder.quantity}\nStatus: ${buildOrder.status}`,
        location: buildOrder.location || '',
        materials,
      };

      const { error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'update',
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

  /**
   * Delete a build event from Google Calendar
   */
  async deleteBuildEvent(eventId: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const { error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'delete',
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
  } else if (calendarId) {
    googleCalendarService.setCalendarId(calendarId);
  }
  return googleCalendarService;
}

export default GoogleCalendarService;
