/**
 * Google Calendar Service
 *
 * Manages Google Calendar integration for production build scheduling
 * Handles calendar events for build orders with material sourcing info
 */

import { getGoogleAuthService } from './googleAuthService';
import type { BuildOrder, MaterialRequirement } from '../types';

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: string;
  attendees?: Array<{ email: string }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
}

export interface BuildCalendarEvent extends CalendarEvent {
  buildOrderId: string;
  finishedSku: string;
  quantity: number;
  materialRequirements?: MaterialRequirement[];
}

export class GoogleCalendarService {
  private calendarId: string = 'primary'; // Use primary calendar by default
  private timeZone: string = 'America/New_York'; // Default timezone

  constructor(calendarId?: string, timeZone?: string) {
    if (calendarId) this.calendarId = calendarId;
    if (timeZone) this.timeZone = timeZone;
  }

  /**
   * Create calendar event for a build order
   */
  async createBuildEvent(buildOrder: BuildOrder): Promise<string | null> {
    try {
      const authService = getGoogleAuthService();
      const oauth2Client = await authService.getAuthenticatedClient();
      
      if (!oauth2Client) {
        throw new Error('Not authenticated with Google');
      }

      const event = this.buildOrderToCalendarEvent(buildOrder);
      
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${this.calendarId}/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauth2Client.credentials.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to create calendar event: ${error.error?.message || 'Unknown error'}`);
      }

      const createdEvent = await response.json();
      return createdEvent.id;
    } catch (error) {
      console.error('[GoogleCalendarService] Error creating build event:', error);
      return null;
    }
  }

  /**
   * Update existing calendar event
   */
  async updateBuildEvent(eventId: string, buildOrder: BuildOrder): Promise<boolean> {
    try {
      const authService = getGoogleAuthService();
      const oauth2Client = await authService.getAuthenticatedClient();
      
      if (!oauth2Client) {
        throw new Error('Not authenticated with Google');
      }

      const event = this.buildOrderToCalendarEvent(buildOrder);
      
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${this.calendarId}/events/${eventId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${oauth2Client.credentials.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to update calendar event: ${error.error?.message || 'Unknown error'}`);
      }

      return true;
    } catch (error) {
      console.error('[GoogleCalendarService] Error updating build event:', error);
      return false;
    }
  }

  /**
   * Delete calendar event
   */
  async deleteBuildEvent(eventId: string): Promise<boolean> {
    try {
      const authService = getGoogleAuthService();
      const oauth2Client = await authService.getAuthenticatedClient();
      
      if (!oauth2Client) {
        throw new Error('Not authenticated with Google');
      }

      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${this.calendarId}/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${oauth2Client.credentials.access_token}`,
        },
      });

      if (!response.ok && response.status !== 410) { // 410 = already deleted
        const error = await response.json();
        throw new Error(`Failed to delete calendar event: ${error.error?.message || 'Unknown error'}`);
      }

      return true;
    } catch (error) {
      console.error('[GoogleCalendarService] Error deleting build event:', error);
      return false;
    }
  }

  /**
   * Get upcoming build events from calendar
   */
  async getUpcomingBuilds(days: number = 30): Promise<BuildCalendarEvent[]> {
    try {
      const authService = getGoogleAuthService();
      const oauth2Client = await authService.getAuthenticatedClient();
      
      if (!oauth2Client) {
        throw new Error('Not authenticated with Google');
      }

      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${this.calendarId}/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&` +
        `timeMax=${encodeURIComponent(timeMax)}&` +
        `q=Build Order&` + // Filter for build-related events
        `orderBy=startTime&` +
        `singleEvents=true`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${oauth2Client.credentials.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to fetch calendar events: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      return (data.items || [])
        .filter((event: any) => this.isBuildEvent(event))
        .map((event: any) => this.calendarEventToBuildEvent(event));
    } catch (error) {
      console.error('[GoogleCalendarService] Error fetching upcoming builds:', error);
      return [];
    }
  }

  /**
   * Convert BuildOrder to Google Calendar event format
   */
  private buildOrderToCalendarEvent(buildOrder: BuildOrder): CalendarEvent {
    const startDate = buildOrder.scheduledDate ? new Date(buildOrder.scheduledDate) : new Date();
    const durationHours = buildOrder.estimatedDurationHours || 2; // Default 2 hours
    const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

    // Build material requirements description
    let description = `Build Order: ${buildOrder.id}\n`;
    description += `Product: ${buildOrder.name} (${buildOrder.finishedSku})\n`;
    description += `Quantity: ${buildOrder.quantity}\n`;
    
    if (buildOrder.notes) {
      description += `\nNotes: ${buildOrder.notes}\n`;
    }

    if (buildOrder.materialRequirements && buildOrder.materialRequirements.length > 0) {
      description += `\nMaterial Requirements:\n`;
      buildOrder.materialRequirements.forEach((req) => {
        description += `• ${req.name} (${req.sku}): ${req.requiredQuantity} units\n`;
        if (req.shortfall > 0) {
          description += `  ⚠️ Short by ${req.shortfall} units`;
          if (req.vendorName) {
            description += ` - Order from ${req.vendorName}`;
          }
          description += '\n';
        }
      });
    }

    description += `\nCreated: ${new Date(buildOrder.createdAt).toLocaleString()}`;

    return {
      summary: `Build Order: ${buildOrder.name} (${buildOrder.quantity}x)`,
      description,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: this.timeZone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: this.timeZone,
      },
      location: 'Production Floor',
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 60 }, // 1 hour before
        ],
      },
    };
  }

  /**
   * Check if calendar event is a build order event
   */
  private isBuildEvent(event: any): boolean {
    return event.summary && event.summary.includes('Build Order');
  }

  /**
   * Convert Google Calendar event to BuildCalendarEvent
   */
  private calendarEventToBuildEvent(event: any): BuildCalendarEvent {
    // Parse build order info from event description
    const description = event.description || '';
    const buildOrderIdMatch = description.match(/Build Order: (BO-\d{4}-\d{3})/);
    const skuMatch = description.match(/\(([A-Z]+-[A-Z0-9]+)\)/);
    const quantityMatch = description.match(/Quantity: (\d+)/);

    return {
      id: event.id,
      buildOrderId: buildOrderIdMatch ? buildOrderIdMatch[1] : '',
      finishedSku: skuMatch ? skuMatch[1] : '',
      quantity: quantityMatch ? parseInt(quantityMatch[1]) : 0,
      summary: event.summary,
      description: event.description,
      start: {
        dateTime: event.start.dateTime || event.start.date + 'T09:00:00',
        timeZone: event.start.timeZone || this.timeZone,
      },
      end: {
        dateTime: event.end.dateTime || event.end.date + 'T17:00:00',
        timeZone: event.end.timeZone || this.timeZone,
      },
      location: event.location,
    };
  }

  /**
   * Set custom calendar ID (e.g., for dedicated production calendar)
   */
  setCalendarId(calendarId: string) {
    this.calendarId = calendarId;
  }

  /**
   * Set timezone for calendar events
   */
  setTimeZone(timeZone: string) {
    this.timeZone = timeZone;
  }

  /**
   * Create a dedicated calendar for production builds
   */
  async createProductionCalendar(name: string = 'Production Builds'): Promise<string | null> {
    try {
      const authService = getGoogleAuthService();
      const oauth2Client = await authService.getAuthenticatedClient();
      
      if (!oauth2Client) {
        throw new Error('Not authenticated with Google');
      }

      const calendarData = {
        summary: name,
        description: 'Calendar for tracking production build orders and material requirements',
        timeZone: this.timeZone,
      };

      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauth2Client.credentials.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calendarData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to create calendar: ${error.error?.message || 'Unknown error'}`);
      }

      const calendar = await response.json();
      return calendar.id;
    } catch (error) {
      console.error('[GoogleCalendarService] Error creating production calendar:', error);
      return null;
    }
  }
}

// Export singleton instance
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