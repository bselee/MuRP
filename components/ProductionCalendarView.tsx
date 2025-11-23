import Button from '@/components/ui/Button';
/**
 * Production Calendar View
 * 
 * Displays scheduled build orders in a calendar format with Google Calendar integration
 * Shows material requirements and sourcing information for each build
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { CalendarIcon, ClockIcon, ExclamationTriangleIcon, CheckCircleIcon, XMarkIcon, TruckIcon } from '../components/icons';
import { getGoogleCalendarService, type ProductionCalendarEvent as GoogleProductionEvent } from '../services/googleCalendarService';
import { supabase } from '../lib/supabase/client';
import type { BuildOrder, MaterialRequirement, BillOfMaterials, InventoryItem, Vendor, PurchaseOrder } from '../types';
import ScheduleBuildModal from './ScheduleBuildModal';
import type { CalendarSourceConfig } from '../types/calendar';
import { normalizeCalendarSources } from '../types/calendar';

const localizer = momentLocalizer(moment);

interface BuildCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  materials?: Array<{
    component_name: string;
    quantity: number;
    unit: string;
    vendor: string;
    cost: number;
  }>;
}

interface CalendarBuildEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: BuildOrder;
  status: 'Pending' | 'In Progress' | 'Completed';
  materialShortfall: boolean;
  source: 'build';
}

interface GoogleCalendarDisplayEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: 'External';
  source: 'google';
  materialShortfall: boolean;
  googleEvent: GoogleProductionEvent;
}

interface LogisticsCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: 'Inbound';
  source: 'logistics';
  materialShortfall: boolean;
  severity: 'critical' | 'warning';
  logistics: {
    po: PurchaseOrder;
    vendorName: string;
    arrivalDate: Date;
    items: LogisticsItemDetail[];
  };
}

interface LogisticsItemDetail {
  sku: string;
  name?: string;
  quantity: number;
  onHand: number;
  reorderPoint?: number;
}

type UnifiedCalendarEvent = CalendarBuildEvent | GoogleCalendarDisplayEvent | LogisticsCalendarEvent;

type DemandWindow = 30 | 60 | 90;

interface CalendarSettingsState {
  calendar_timezone: string;
  calendar_sync_enabled: boolean;
  calendar_sources: CalendarSourceConfig[];
  calendar_push_enabled: boolean;
}

interface ExternalDemandRow {
  sku: string;
  name: string;
  totalQty: number;
  available: number;
  shortfall: number;
  nextEventDate: Date | null;
  sourceNames: Set<string>;
}

interface EnrichedGoogleEvent extends GoogleProductionEvent {
  calendarSourceId: string;
  calendarSourceName: string;
}

interface ProductionCalendarViewProps {
  buildOrders: BuildOrder[];
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  onCreateBuildOrder: (sku: string, name: string, quantity: number, scheduledDate?: string, dueDate?: string) => void;
  onUpdateBuildOrder: (buildOrder: BuildOrder) => void;
  onCompleteBuildOrder: (buildOrderId: string) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ProductionCalendarView: React.FC<ProductionCalendarViewProps> = ({
  buildOrders,
  boms,
  inventory,
  vendors,
  purchaseOrders,
  onCreateBuildOrder,
  onUpdateBuildOrder,
  onCompleteBuildOrder,
  addToast,
}) => {
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedBuild, setSelectedBuild] = useState<BuildOrder | null>(null);
  const [selectedExternalEvent, setSelectedExternalEvent] = useState<GoogleProductionEvent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);
  const [googleEvents, setGoogleEvents] = useState<EnrichedGoogleEvent[]>([]);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettingsState | null>(null);
  const [calendarSyncError, setCalendarSyncError] = useState<string | null>(null);
  const [demandWindow, setDemandWindow] = useState<DemandWindow>(30);
  const [isPushingLogistics, setIsPushingLogistics] = useState(false);

  const inventoryMap = useMemo(() => new Map(inventory.map(item => [item.sku, item])), [inventory]);
  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);
  const primaryCalendar = useMemo(() => {
    if (!calendarSettings) return null;
    return calendarSettings.calendar_sources.find((src) => src.ingestEnabled) ?? calendarSettings.calendar_sources[0] ?? null;
  }, [calendarSettings]);
  const ingestCalendars = useMemo(() => {
    if (!calendarSettings) return [];
    return calendarSettings.calendar_sources.filter((src) => src.ingestEnabled);
  }, [calendarSettings]);
  const pushCalendars = useMemo(() => {
    if (!calendarSettings || !calendarSettings.calendar_push_enabled) return [];
    return calendarSettings.calendar_sources.filter((src) => src.pushEnabled);
  }, [calendarSettings]);

  const fetchCalendarSettings = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCalendarSettings({
          calendar_timezone: 'America/Los_Angeles',
          calendar_sync_enabled: false,
          calendar_sources: [],
          calendar_push_enabled: false,
        });
        return;
      }

      const { data, error } = await supabase
        .from('user_settings')
        .select('calendar_id, calendar_name, calendar_timezone, calendar_sync_enabled, calendar_sources, calendar_push_enabled')
        .eq('user_id', user.id)
        .single();

      if (error && (error as any).code !== 'PGRST116') {
        throw error;
      }

      const sources = normalizeCalendarSources(data?.calendar_sources, {
        id: data?.calendar_id ?? null,
        name: data?.calendar_name ?? null,
        timezone: data?.calendar_timezone ?? null,
      });

      setCalendarSettings({
        calendar_timezone: data?.calendar_timezone || 'America/Los_Angeles',
        calendar_sync_enabled: data?.calendar_sync_enabled ?? false,
        calendar_sources: sources,
        calendar_push_enabled: data?.calendar_push_enabled ?? false,
      });
    } catch (error) {
      console.error('Error loading calendar settings:', error);
      setCalendarSettings({
        calendar_timezone: 'America/Los_Angeles',
        calendar_sync_enabled: false,
        calendar_sources: [],
        calendar_push_enabled: false,
      });
    }
  }, []);

  useEffect(() => {
    fetchCalendarSettings();
  }, [fetchCalendarSettings]);

  const loadGoogleCalendarEvents = useCallback(
    async (windowOverride?: number, silent = false) => {
      if (!calendarSettings || !calendarSettings.calendar_sync_enabled) {
        if (!silent) {
          addToast('Enable calendar sync in Settings to pull Google Calendar events', 'info');
        }
        return;
      }

      const ingestSources = ingestCalendars;
      if (ingestSources.length === 0) {
        setGoogleEvents([]);
        if (!silent) {
          addToast('Select at least one calendar to ingest builds from.', 'info');
        }
        return;
      }

      try {
        setIsLoadingGoogle(true);
        setCalendarSyncError(null);
        const allEvents: EnrichedGoogleEvent[] = [];

        for (const source of ingestSources) {
          const calendarService = getGoogleCalendarService(
            source.id,
            source.timezone || calendarSettings.calendar_timezone
          );
          const events = await calendarService.getProductionEvents({
            windowDays: windowOverride ?? 90,
          });
          events.forEach((event) =>
            allEvents.push({
              ...event,
              calendarSourceId: source.id,
              calendarSourceName: source.name,
            })
          );
        }

        setGoogleEvents(allEvents);
        if (!silent) {
          addToast(`Synced ${allEvents.length} events from ${ingestSources.length} calendar(s)`, 'success');
        }
      } catch (error) {
        console.error('Error loading Google Calendar events:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        setCalendarSyncError(message);
        setGoogleEvents([]);
        if (!silent) {
          addToast('Failed to sync Google Calendar', 'error');
        }
      } finally {
        setIsLoadingGoogle(false);
      }
    },
    [calendarSettings, ingestCalendars, addToast]
  );

  useEffect(() => {
    if (calendarSettings?.calendar_sync_enabled) {
      loadGoogleCalendarEvents(undefined, true);
    } else if (calendarSettings) {
      setGoogleEvents([]);
    }
  }, [ingestCalendars, calendarSettings?.calendar_sync_enabled, loadGoogleCalendarEvents]);

  const handleSyncBuildOrderToGoogle = useCallback(async (buildOrder: BuildOrder) => {
    if (!calendarSettings?.calendar_sync_enabled) {
      addToast('Enable calendar sync in Settings before syncing build orders', 'info');
      return;
    }
    if (!primaryCalendar) {
      addToast('Select a calendar to push builds to.', 'error');
      return;
    }

    try {
      const calendarService = getGoogleCalendarService(
        primaryCalendar.id,
        primaryCalendar.timezone || calendarSettings.calendar_timezone
      );

      if (buildOrder.calendarEventId) {
        await calendarService.updateBuildEvent(buildOrder.calendarEventId, buildOrder);
      } else {
        const eventId = await calendarService.createBuildEvent(buildOrder);
        if (eventId) {
          onUpdateBuildOrder({ ...buildOrder, calendarEventId: eventId });
        }
      }

      addToast('Google Calendar updated', 'success');
      await loadGoogleCalendarEvents(undefined, true);
    } catch (error) {
      console.error('Error syncing build order to Google:', error);
      addToast('Failed to sync with Google Calendar', 'error');
    }
  }, [calendarSettings, primaryCalendar, addToast, onUpdateBuildOrder, loadGoogleCalendarEvents]);

  const buildLogisticsDescription = (event: LogisticsCalendarEvent) => {
    const lines = [
      `PO: ${event.logistics.po.orderId || event.logistics.po.id}`,
      `Vendor: ${event.logistics.vendorName}`,
      `Expected: ${event.logistics.arrivalDate.toLocaleDateString()}`,
      '',
      'Items:',
      ...event.logistics.items.map(
        (item) =>
          `• ${item.sku} – Qty ${item.quantity} (On hand ${item.onHand}${item.reorderPoint ? ` / ROP ${item.reorderPoint}` : ''})`
      ),
      '',
      `Status: ${event.severity === 'critical' ? 'Critical shortfall' : 'Low stock'}`,
    ];
    return lines.join('\n');
  };

  const handlePushLogisticsToCalendar = useCallback(async () => {
    if (!calendarSettings?.calendar_push_enabled) {
      addToast('Enable calendar push in Settings before sending logistics events.', 'info');
      return;
    }
    if (pushCalendars.length === 0) {
      addToast('Select at least one calendar to push logistics events to.', 'info');
      return;
    }
    if (logisticsEvents.length === 0) {
      addToast('No critical inbound purchase orders detected.', 'info');
      return;
    }

    try {
      setIsPushingLogistics(true);
      const eventsToPush = logisticsEvents.slice(0, 15);

      for (const target of pushCalendars) {
        const calendarService = getGoogleCalendarService(
          target.id,
          target.timezone || calendarSettings.calendar_timezone
        );
        for (const event of eventsToPush) {
          await calendarService.createCustomEvent({
            title: `${event.title} – ${event.logistics.vendorName}`,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            description: buildLogisticsDescription(event),
            extendedProperties: {
              private: {
                source: 'murp-logistics',
                poId: event.logistics.po.id,
              },
            },
          });
        }
      }

      addToast(`Pushed ${eventsToPush.length} logistics events to calendar`, 'success');
    } catch (error) {
      console.error('Error pushing logistics events:', error);
      addToast('Failed to push logistics events', 'error');
    } finally {
      setIsPushingLogistics(false);
    }
  }, [calendarSettings, pushCalendars, logisticsEvents, addToast]);

  // Handle creating new build order from calendar
  const buildEvents = useMemo<CalendarBuildEvent[]>(() => {
    return buildOrders
      .filter(bo => bo.scheduledDate) // Only show scheduled builds
      .map(buildOrder => {
        const startDate = new Date(buildOrder.scheduledDate!);
        const durationHours = buildOrder.estimatedDurationHours || 2;
        const endDate = buildOrder.dueDate 
          ? new Date(buildOrder.dueDate)
          : new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

        // Check for material shortfalls
        const hasMaterialShortfall = buildOrder.materialRequirements?.some(req => req.shortfall > 0) || false;

        return {
          id: buildOrder.id,
          title: `${buildOrder.name} (${buildOrder.quantity}x)`,
          start: startDate,
          end: endDate,
          resource: buildOrder,
          status: buildOrder.status,
          materialShortfall: hasMaterialShortfall,
          source: 'build',
        };
      });
  }, [buildOrders]);

  const googleDisplayEvents = useMemo<GoogleCalendarDisplayEvent[]>(() => {
    return googleEvents.map((event) => {
      const endDate = event.end || new Date(event.start.getTime() + 2 * 60 * 60 * 1000);
      const inventoryItem = event.finishedSku ? inventoryMap.get(event.finishedSku) : undefined;
      const hasShortfall = Boolean(
        event.finishedSku &&
        typeof event.quantity === 'number' &&
        inventoryItem &&
        inventoryItem.stock < event.quantity
      );

      return {
        id: `google-${event.id}`,
        title: event.finishedSku
          ? `${event.finishedSku} (${event.quantity ?? '?'}x)`
          : event.title,
        start: event.start,
        end: endDate,
        status: 'External',
        source: 'google',
        materialShortfall: hasShortfall,
        googleEvent: event,
      } satisfies GoogleCalendarDisplayEvent;
    });
  }, [googleEvents, inventoryMap]);

  const logisticsEvents = useMemo<LogisticsCalendarEvent[]>(() => {
    const events: LogisticsCalendarEvent[] = [];

    purchaseOrders.forEach((po) => {
      const arrivalIso = po.trackingEstimatedDelivery || po.estimatedReceiveDate || po.expectedDate || po.orderDate;
      if (!arrivalIso) return;
      const arrivalDate = new Date(arrivalIso);
      const criticalItems: LogisticsItemDetail[] = [];

      po.items.forEach((item) => {
        const inventoryItem = inventoryMap.get(item.sku);
        const onHand = inventoryItem?.stock ?? 0;
        const reorderPoint = inventoryItem?.reorderPoint ?? 0;
        const isCritical = !inventoryItem || onHand <= 0 || (reorderPoint > 0 && onHand <= reorderPoint);
        if (!isCritical) return;
        criticalItems.push({
          sku: item.sku,
          name: item.name || item.description,
          quantity: item.quantity,
          onHand,
          reorderPoint,
        });
      });

      if (criticalItems.length === 0) {
        return;
      }

      const severity = criticalItems.some((item) => item.onHand <= 0) ? 'critical' : 'warning';
      events.push({
        id: `logistics-${po.id}-${arrivalIso}`,
        title: `Inbound ${po.orderId || po.id}`,
        start: arrivalDate,
        end: new Date(arrivalDate.getTime() + 60 * 60 * 1000),
        status: 'Inbound',
        source: 'logistics',
        materialShortfall: severity === 'critical',
        severity,
        logistics: {
          po,
          vendorName: po.vendorId ? vendorMap.get(po.vendorId)?.name || po.supplier : po.supplier,
          arrivalDate,
          items: criticalItems,
        },
      });
    });

    return events.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [purchaseOrders, inventoryMap, vendorMap]);

  const combinedEvents = useMemo<UnifiedCalendarEvent[]>(
    () => [...buildEvents, ...googleDisplayEvents, ...logisticsEvents],
    [buildEvents, googleDisplayEvents, logisticsEvents]
  );

  const demandSummaries = useMemo<Record<DemandWindow, ExternalDemandRow[]>>(
    () => ({
      30: computeExternalDemand(googleEvents, inventoryMap, 30),
      60: computeExternalDemand(googleEvents, inventoryMap, 60),
      90: computeExternalDemand(googleEvents, inventoryMap, 90),
    }),
    [googleEvents, inventoryMap]
  );

  const demandRows = demandSummaries[demandWindow];
  const unparsedEvents = useMemo(
    () => googleEvents.filter(event => !event.finishedSku || !event.quantity),
    [googleEvents]
  );

  // Event styling based on status and material availability
  const eventStyleGetter = (event: UnifiedCalendarEvent) => {
    let backgroundColor = '#6366f1'; // Default blue
    let color = 'white';

    if (event.source === 'google') {
      backgroundColor = event.materialShortfall ? '#dc2626' : '#0ea5e9';
    } else if (event.source === 'logistics') {
      backgroundColor = event.severity === 'critical' ? '#be185d' : '#a855f7';
    } else if (event.status === 'Completed') {
      backgroundColor = '#10b981'; // Green
    } else if (event.status === 'In Progress') {
      backgroundColor = '#f59e0b'; // Orange
    } else if (event.materialShortfall) {
      backgroundColor = '#ef4444'; // Red for material shortfalls
    }

    return {
      style: {
        backgroundColor,
        color,
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        padding: '2px 6px',
      },
    };
  };

  // Handle calendar event selection
  const handleSelectEvent = (event: UnifiedCalendarEvent) => {
    if (event.source === 'google') {
      setSelectedExternalEvent(event.googleEvent);
    } else if (event.source === 'logistics') {
      addToast(
        `Inbound PO ${event.logistics.po.orderId || event.logistics.po.id} expected ${event.start.toLocaleDateString()}`,
        event.severity === 'critical' ? 'error' : 'info'
      );
    } else {
      setSelectedBuild(event.resource);
    }
  };

  // Handle slot selection for creating new events
  const handleSelectSlot = ({ start }: { start: Date; end: Date }) => {
    setNewEventDate(start);
    setShowCreateModal(true);
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <CalendarIcon className="w-6 h-6" />
            Production Calendar
          </h2>
          {isLoadingGoogle && (
            <div className="text-sm text-gray-400">Syncing with Google Calendar...</div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={() => loadGoogleCalendarEvents()}
            disabled={!calendarSettings?.calendar_sync_enabled}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              calendarSettings?.calendar_sync_enabled
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            Sync Google Calendar
          </Button>
          <div className="flex flex-col text-xs">
            {calendarSettings?.calendar_sync_enabled ? (
              ingestCalendars.length > 0 ? (
                <span className="text-gray-400">
                  Pulling from {ingestCalendars.map((c) => c.name).join(', ')}
                </span>
              ) : (
                <span className="text-yellow-400">No calendars selected for ingestion</span>
              )
            ) : (
              <span className="text-yellow-400">Sync disabled</span>
            )}
            {calendarSettings?.calendar_push_enabled && (
              <span className="text-gray-400">
                Push targets: {pushCalendars.length > 0 ? pushCalendars.map((c) => c.name).join(', ') : 'None selected'}
              </span>
            )}
            {calendarSyncError && (
              <span className="text-red-400">{calendarSyncError}</span>
            )}
          </div>
          
          <div className="flex bg-gray-700 rounded-lg">
            {(['month', 'week', 'day'] as const).map((viewType) => (
              <Button
                key={viewType}
                onClick={() => setView(viewType)}
                className={`px-3 py-1 text-sm capitalize rounded-lg transition-colors ${
                  view === viewType
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                {viewType}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-indigo-600 rounded"></div>
          <span className="text-gray-300">Pending</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-amber-500 rounded"></div>
          <span className="text-gray-300">In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span className="text-gray-300">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span className="text-gray-300">Material Shortfall</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-sky-500 rounded"></div>
          <span className="text-gray-300">Google Event</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-500 rounded"></div>
          <span className="text-gray-300">Inbound Logistics</span>
        </div>
      </div>

      {(googleEvents.length > 0 || calendarSettings?.calendar_sync_enabled) && (
        <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Google Production Demand</h3>
              {googleEvents.length === 0 && (
                <p className="text-xs text-gray-400">Sync events from your linked Google Calendar to see external demand.</p>
              )}
            </div>
            <div className="flex bg-gray-800 rounded-full text-xs overflow-hidden">
              {[30, 60, 90].map((window) => (
                <Button
                  key={window}
                  onClick={() => setDemandWindow(window as DemandWindow)}
                  className={`px-3 py-1 ${
                    demandWindow === window
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {window}d
                </Button>
              ))}
            </div>
          </div>

          {googleEvents.length > 0 ? (
            demandRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="table-density min-w-full text-xs">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="text-left py-1 pr-4 font-medium">SKU</th>
                      <th className="text-left py-1 pr-4 font-medium">Calendar Qty</th>
                      <th className="text-left py-1 pr-4 font-medium">On Hand</th>
                      <th className="text-left py-1 pr-4 font-medium">Gap</th>
                      <th className="text-left py-1 font-medium">Next Event</th>
                      <th className="text-left py-1 font-medium">Calendars</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-200">
                    {demandRows.slice(0, 5).map((row) => (
                      <tr key={row.sku} className="border-t border-gray-800">
                        <td className="py-1 pr-4 font-semibold">{row.sku}</td>
                        <td className="py-1 pr-4">{row.totalQty.toLocaleString()}</td>
                        <td className="py-1 pr-4">{row.available.toLocaleString()}</td>
                        <td className={`py-1 pr-4 ${row.shortfall < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {row.shortfall >= 0 ? `+${row.shortfall}` : row.shortfall}
                        </td>
                        <td className="py-1 text-gray-400">
                          {row.nextEventDate ? row.nextEventDate.toLocaleDateString() : '—'}
                        </td>
                        <td className="py-1 text-gray-400">
                          {row.sourceNames.size > 0 ? Array.from(row.sourceNames).join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Events synced but no SKUs detected for the next {demandWindow} days. Ensure events include “SKU:” and “Qty:” lines.
              </p>
            )
          ) : (
            <p className="text-xs text-gray-400">
              No Google events synced yet.
            </p>
          )}

          {unparsedEvents.length > 0 && (
            <div className="text-xs text-yellow-300 space-y-1">
              <p>Events missing SKU or quantity:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {unparsedEvents.slice(0, 3).map(event => (
                  <li key={event.id}>
                    {event.title} — {event.start.toLocaleDateString()}
                  </li>
                ))}
              </ul>
              {unparsedEvents.length > 3 && (
                <p className="text-[11px] text-gray-400">+{unparsedEvents.length - 3} more events need SKU/quantity</p>
              )}
            </div>
          )}
        </div>
      )}

      {(logisticsEvents.length > 0 || calendarSettings?.calendar_push_enabled) && (
        <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Inbound Logistics (Critical POs)</h3>
              <p className="text-xs text-gray-400">
                POs covering out-of-stock or low inventory items. Use this to answer “when is it arriving?” without chasing procurement.
              </p>
            </div>
            <Button
              onClick={handlePushLogisticsToCalendar}
              disabled={
                !calendarSettings?.calendar_push_enabled ||
                pushCalendars.length === 0 ||
                isPushingLogistics ||
                logisticsEvents.length === 0
              }
              className={`px-3 py-1.5 text-xs rounded ${
                calendarSettings?.calendar_push_enabled && pushCalendars.length > 0 && logisticsEvents.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isPushingLogistics ? 'Pushing…' : 'Push to Calendar'}
            </Button>
          </div>

          {logisticsEvents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table-density min-w-full text-xs">
                <thead className="text-gray-400">
                  <tr>
                    <th className="text-left py-1 pr-4 font-medium">PO</th>
                    <th className="text-left py-1 pr-4 font-medium">Vendor</th>
                    <th className="text-left py-1 pr-4 font-medium">Arrival</th>
                    <th className="text-left py-1 pr-4 font-medium">Critical Items</th>
                    <th className="text-left py-1 font-medium">Severity</th>
                  </tr>
                </thead>
                <tbody className="text-gray-200">
                  {logisticsEvents.slice(0, 5).map((event) => (
                    <tr key={event.id} className="border-t border-gray-800">
                      <td className="py-1 pr-4 font-semibold">{event.logistics.po.orderId || event.logistics.po.id}</td>
                      <td className="py-1 pr-4">{event.logistics.vendorName || 'Unknown vendor'}</td>
                      <td className="py-1 pr-4 text-gray-400">{event.start.toLocaleDateString()}</td>
                      <td className="py-1 pr-4">
                        <ul className="space-y-0.5">
                          {event.logistics.items.slice(0, 3).map((item) => (
                            <li key={item.sku}>
                              {item.sku} · Qty {item.quantity} (On hand {item.onHand})
                            </li>
                          ))}
                          {event.logistics.items.length > 3 && (
                            <li className="text-[11px] text-gray-500">
                              +{event.logistics.items.length - 3} more
                            </li>
                          )}
                        </ul>
                      </td>
                      <td className="py-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            event.severity === 'critical'
                              ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                              : 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/40'
                          }`}
                        >
                          {event.severity === 'critical' ? 'Critical' : 'Warning'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              No critical inbound purchase orders detected yet. When inventory falls below safety stock, inbound orders will display here.
            </p>
          )}
        </div>
      )}

      {/* Calendar */}
      <div className="flex-1 bg-white rounded-lg p-4">
        <Calendar
          localizer={localizer}
          events={combinedEvents}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          view={view as any}
          views={[Views.MONTH, Views.WEEK, Views.DAY]}
          onView={setView as any}
          date={selectedDate}
          onNavigate={setSelectedDate}
          onSelectEvent={handleSelectEvent as any}
          onSelectSlot={handleSelectSlot}
          selectable
          eventPropGetter={eventStyleGetter as any}
          style={{ height: '600px' }}
          popup
          tooltipAccessor={(event: UnifiedCalendarEvent) => {
            if (event.source === 'google') {
              const skuLine = event.googleEvent.finishedSku ? `SKU: ${event.googleEvent.finishedSku}\n` : '';
              const qtyLine = event.googleEvent.quantity ? `Quantity: ${event.googleEvent.quantity}\n` : '';
              return `${event.title}\n${skuLine}${qtyLine}Source: Google Calendar`;
            }
            if (event.source === 'logistics') {
              const lines = [
                event.title,
                `Vendor: ${event.logistics.vendorName || 'Unknown'}`,
                `Expected: ${event.start.toLocaleDateString()}`,
                `Items: ${event.logistics.items.map((item) => item.sku).join(', ')}`,
              ];
              return lines.join('\n');
            }
            return `${event.title}\nStatus: ${event.status}${event.materialShortfall ? '\n⚠️ Material Shortfall' : ''}`;
          }}
        />
      </div>

      {/* Build Details Modal */}
      {selectedBuild && (
        <BuildDetailsModal
          buildOrder={selectedBuild}
          onClose={() => setSelectedBuild(null)}
          onUpdate={onUpdateBuildOrder}
          onComplete={() => onCompleteBuildOrder(selectedBuild.id)}
          onSyncGoogle={() => handleSyncBuildOrderToGoogle(selectedBuild)}
          canSyncGoogle={Boolean(calendarSettings?.calendar_sync_enabled)}
          inventory={inventory}
          vendors={vendors}
          addToast={addToast}
        />
      )}

      {selectedExternalEvent && (
        <ExternalEventDetailsModal
          event={selectedExternalEvent}
          inventory={inventory}
          onClose={() => setSelectedExternalEvent(null)}
          onCreateBuildOrder={onCreateBuildOrder}
          addToast={addToast}
        />
      )}

      {/* Create Build Modal */}
      {showCreateModal && newEventDate && (
        <ScheduleBuildModal
          boms={boms}
          defaultStart={newEventDate}
          onClose={() => {
            setShowCreateModal(false);
            setNewEventDate(null);
          }}
          onCreate={(sku, name, quantity, scheduledDate, dueDate) => {
            onCreateBuildOrder(sku, name, quantity, scheduledDate, dueDate);
            setShowCreateModal(false);
            setNewEventDate(null);
          }}
        />
      )}
    </div>
  );
};

// Build Details Modal Component
interface BuildDetailsModalProps {
  buildOrder: BuildOrder;
  inventory: InventoryItem[];
  vendors: Vendor[];
  onClose: () => void;
  onUpdate: (buildOrder: BuildOrder) => void;
  onComplete: () => void;
  onSyncGoogle: () => void | Promise<void>;
  canSyncGoogle: boolean;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const BuildDetailsModal: React.FC<BuildDetailsModalProps> = ({
  buildOrder,
  inventory,
  vendors,
  onClose,
  onUpdate,
  onComplete,
  onSyncGoogle,
  canSyncGoogle,
  addToast,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBuild, setEditedBuild] = useState(buildOrder);

  const handleSave = () => {
    onUpdate(editedBuild);
    setIsEditing(false);
    addToast('Build order updated', 'success');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-700">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-semibold text-white">{buildOrder.name}</h3>
              <p className="text-gray-400 mt-1">Build Order: {buildOrder.id}</p>
            </div>
            <Button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <XMarkIcon className="w-6 h-6" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Build Info */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Scheduled Date
              </label>
              {isEditing ? (
                <input
                  type="datetime-local"
                  value={editedBuild.scheduledDate ? new Date(editedBuild.scheduledDate).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditedBuild({
                    ...editedBuild,
                    scheduledDate: e.target.value ? new Date(e.target.value).toISOString() : undefined
                  })}
                  className="w-full bg-gray-700 text-white rounded-md px-3 py-2"
                />
              ) : (
                <p className="text-white">
                  {buildOrder.scheduledDate 
                    ? new Date(buildOrder.scheduledDate).toLocaleString()
                    : 'Not scheduled'
                  }
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Due Date
              </label>
              {isEditing ? (
                <input
                  type="datetime-local"
                  value={editedBuild.dueDate ? new Date(editedBuild.dueDate).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditedBuild({
                    ...editedBuild,
                    dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined
                  })}
                  className="w-full bg-gray-700 text-white rounded-md px-3 py-2"
                />
              ) : (
                <p className="text-white">
                  {buildOrder.dueDate 
                    ? new Date(buildOrder.dueDate).toLocaleString()
                    : 'No due date'
                  }
                </p>
              )}
            </div>
          </div>

          {/* Material Requirements */}
          {buildOrder.materialRequirements && buildOrder.materialRequirements.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Material Requirements</h4>
              <div className="space-y-3">
                {buildOrder.materialRequirements.map((req, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      req.shortfall > 0 
                        ? 'bg-red-900/20 border-red-500/30' 
                        : 'bg-gray-700/50 border-gray-600'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-white">{req.name}</p>
                        <p className="text-sm text-gray-400">{req.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white">
                          {req.requiredQuantity} needed
                        </p>
                        <p className="text-sm text-gray-400">
                          {req.availableQuantity} available
                        </p>
                        {req.shortfall > 0 && (
                          <p className="text-sm text-red-400 font-medium">
                            Short by {req.shortfall}
                          </p>
                        )}
                      </div>
                    </div>
                    {req.vendorName && (
                      <div className="mt-2 pt-2 border-t border-gray-600">
                        <p className="text-sm text-gray-300">
                          Vendor: {req.vendorName}
                          {req.leadTimeDays && ` • Lead time: ${req.leadTimeDays} days`}
                          {req.estimatedCost && ` • Cost: $${req.estimatedCost.toFixed(2)}`}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button
                    onClick={handleSave}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                  >
                    Save Changes
                  </Button>
                  <Button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  Edit
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={onSyncGoogle}
                disabled={!canSyncGoogle}
                className={`px-4 py-2 rounded-md transition-colors ${
                  canSyncGoogle
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {buildOrder.calendarEventId ? 'Update Google Event' : 'Sync to Google Calendar'}
              </Button>
              {!canSyncGoogle && (
                <span className="text-[11px] text-gray-400 self-center">
                  Enable calendar sync to push events
                </span>
              )}
              
              {buildOrder.status !== 'Completed' && (
                <Button
                  onClick={onComplete}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                >
                  Mark Complete
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ExternalEventDetailsModalProps {
  event: GoogleProductionEvent;
  inventory: InventoryItem[];
  onClose: () => void;
  onCreateBuildOrder: ProductionCalendarViewProps['onCreateBuildOrder'];
  addToast: ProductionCalendarViewProps['addToast'];
}

const ExternalEventDetailsModal: React.FC<ExternalEventDetailsModalProps> = ({
  event,
  inventory,
  onClose,
  onCreateBuildOrder,
  addToast,
}) => {
  const inventoryItem = event.finishedSku ? inventory.find(item => item.sku === event.finishedSku) : null;
  const available = inventoryItem?.stock ?? null;
  const shortfall = event.quantity && available !== null ? available - event.quantity : null;
  const canCreateBuild = Boolean(event.finishedSku && event.quantity);

  const handleCreateBuild = () => {
    if (!canCreateBuild || !event.finishedSku || !event.quantity) {
      addToast('Add SKU and quantity to the Google event to draft a build order.', 'error');
      return;
    }

    onCreateBuildOrder(
      event.finishedSku,
      inventoryItem?.name || event.title,
      Math.round(event.quantity),
      event.start.toISOString(),
      event.end?.toISOString()
    );
    addToast('Drafted build order from Google event', 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto border border-gray-800">
        <div className="flex justify-between items-start p-5 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-white">{event.title}</h3>
            <p className="text-xs text-gray-400 mt-1">Source: Google Calendar</p>
          </div>
          <Button onClick={onClose} className="text-gray-400 hover:text-white">
            <XMarkIcon className="w-6 h-6" />
          </Button>
        </div>

        <div className="p-5 space-y-4 text-sm text-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-gray-400 text-xs">Start</p>
              <p className="text-white font-medium">{event.start.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">End</p>
              <p className="text-white font-medium">{event.end?.toLocaleString() || 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Finished SKU</p>
              <p className="text-white font-medium">{event.finishedSku || 'Not detected'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Quantity</p>
              <p className="text-white font-medium">{event.quantity ?? 'Not detected'}</p>
            </div>
          </div>

          {event.description && (
            <div>
              <p className="text-gray-400 text-xs mb-1">Notes</p>
              <p className="text-gray-200 whitespace-pre-line bg-gray-800/60 rounded-lg p-3 border border-gray-700">
                {event.description}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Inventory Snapshot</p>
              {inventoryItem ? (
                <>
                  <p className="text-white font-semibold">{inventoryItem.name}</p>
                  <p className="text-gray-300">On hand: {inventoryItem.stock.toLocaleString()}</p>
                  {shortfall !== null && (
                    <p className={shortfall < 0 ? 'text-red-400 font-medium' : 'text-emerald-400 font-medium'}>
                      {shortfall < 0 ? `Short ${Math.abs(shortfall)}` : `Surplus ${shortfall}`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-gray-400">SKU not in inventory.</p>
              )}
            </div>
            <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Metadata Confidence</p>
              <p>SKU Source: <span className="text-white">{event.skuSource}</span></p>
              <p>Qty Source: <span className="text-white">{event.quantitySource}</span></p>
            </div>
          </div>

          {event.materials && event.materials.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Materials (from event)</p>
              <div className="space-y-1">
                {event.materials.map((material, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-gray-300 bg-gray-800/40 rounded px-3 py-1">
                    <span>{material.name || material.sku || `Component ${idx + 1}`}</span>
                    {material.requiredQuantity !== undefined && (
                      <span>{material.requiredQuantity}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
            <Button
              onClick={handleCreateBuild}
              disabled={!canCreateBuild}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                canCreateBuild
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              Create Build Order
            </Button>
            <Button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Create Scheduled Build Modal Component
function computeExternalDemand(
  events: EnrichedGoogleEvent[],
  inventoryMap: Map<string, InventoryItem>,
  windowDays: number
): ExternalDemandRow[] {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + windowDays);

  const aggregate = new Map<
    string,
    { total: number; nextEventDate: Date | null; name?: string; sourceNames: Set<string> }
  >();

  events.forEach((event) => {
    if (!event.finishedSku || typeof event.quantity !== 'number') {
      return;
    }

    const start = event.start;
    if (start < now || start > cutoff) {
      return;
    }

    const entry =
      aggregate.get(event.finishedSku) || { total: 0, nextEventDate: null, sourceNames: new Set<string>() };
    entry.total += event.quantity;
    if (!entry.nextEventDate || start < entry.nextEventDate) {
      entry.nextEventDate = start;
    }
    entry.name = event.title;
    if (event.calendarSourceName) {
      entry.sourceNames.add(event.calendarSourceName);
    }
    aggregate.set(event.finishedSku, entry);
  });

  return Array.from(aggregate.entries())
    .map(([sku, info]) => {
      const inventoryItem = inventoryMap.get(sku);
      const available = inventoryItem?.stock ?? 0;
      return {
        sku,
        name: inventoryItem?.name || info.name || sku,
        totalQty: info.total,
        available,
        shortfall: available - info.total,
        nextEventDate: info.nextEventDate,
        sourceNames: info.sourceNames,
      } as ExternalDemandRow;
    })
    .sort((a, b) => a.shortfall - b.shortfall);
}

export default ProductionCalendarView;
