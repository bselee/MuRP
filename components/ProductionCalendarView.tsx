/**
 * Production Calendar View
 * 
 * Displays scheduled build orders in a calendar format with Google Calendar integration
 * Shows material requirements and sourcing information for each build
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
// import { getGoogleCalendarService, type BuildCalendarEvent } from '../services/googleCalendarService'; // Disabled - browser compatibility
import { CalendarIcon, ClockIcon, ExclamationTriangleIcon, CheckCircleIcon, XMarkIcon } from '../components/icons';
import type { BuildOrder, MaterialRequirement, BillOfMaterials, InventoryItem, Vendor } from '../types';

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
}

interface ProductionCalendarViewProps {
  buildOrders: BuildOrder[];
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  vendors: Vendor[];
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
  onCreateBuildOrder,
  onUpdateBuildOrder,
  onCompleteBuildOrder,
  addToast,
}) => {
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedBuild, setSelectedBuild] = useState<BuildOrder | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);
  const [googleEvents, setGoogleEvents] = useState<BuildCalendarEvent[]>([]);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);

  // Load Google Calendar events
  useEffect(() => {
    loadGoogleCalendarEvents();
  }, []);

  const loadGoogleCalendarEvents = async () => {
    try {
      setIsLoadingGoogle(true);
      // Temporarily disabled Google Calendar sync - will implement via edge functions
      console.log('Google Calendar sync temporarily disabled');
      setGoogleEvents([]);
    } catch (error) {
      console.error('Error loading Google Calendar events:', error);
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  // Convert build orders to calendar events
  const calendarEvents = useMemo<CalendarBuildEvent[]>(() => {
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
        };
      });
  }, [buildOrders]);

  // Event styling based on status and material availability
  const eventStyleGetter = (event: CalendarBuildEvent) => {
    let backgroundColor = '#6366f1'; // Default blue
    let color = 'white';

    if (event.status === 'Completed') {
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
  const handleSelectEvent = (event: CalendarBuildEvent) => {
    setSelectedBuild(event.resource);
  };

  // Handle slot selection for creating new events
  const handleSelectSlot = ({ start }: { start: Date; end: Date }) => {
    setNewEventDate(start);
    setShowCreateModal(true);
  };

  // Sync with Google Calendar
  const handleSyncWithGoogle = async (buildOrder: BuildOrder) => {
    try {
      // Temporarily disabled Google Calendar sync
      console.log('Google Calendar sync temporarily disabled for build order:', buildOrder.id);
      addToast('Google Calendar sync temporarily unavailable - coming soon!', 'info');
    } catch (error) {
      console.error('Error syncing with Google Calendar:', error);
      addToast('Error syncing with Google Calendar', 'error');
    }
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
          <button
            onClick={loadGoogleCalendarEvents}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Sync Google Calendar
          </button>
          
          <div className="flex bg-gray-700 rounded-lg">
            {(['month', 'week', 'day'] as const).map((viewType) => (
              <button
                key={viewType}
                onClick={() => setView(viewType)}
                className={`px-3 py-1 text-sm capitalize rounded-lg transition-colors ${
                  view === viewType
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                {viewType}
              </button>
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
      </div>

      {/* Calendar */}
      <div className="flex-1 bg-white rounded-lg p-4">
        <Calendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          view={view as any}
          views={[Views.MONTH, Views.WEEK, Views.DAY]}
          onView={setView as any}
          date={selectedDate}
          onNavigate={setSelectedDate}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable
          eventPropGetter={eventStyleGetter}
          style={{ height: '600px' }}
          popup
          tooltipAccessor={(event: CalendarBuildEvent) => 
            `${event.title}\nStatus: ${event.status}${event.materialShortfall ? '\n⚠️ Material Shortfall' : ''}`
          }
        />
      </div>

      {/* Build Details Modal */}
      {selectedBuild && (
        <BuildDetailsModal
          buildOrder={selectedBuild}
          onClose={() => setSelectedBuild(null)}
          onUpdate={onUpdateBuildOrder}
          onComplete={() => onCompleteBuildOrder(selectedBuild.id)}
          onSyncGoogle={() => handleSyncWithGoogle(selectedBuild)}
          inventory={inventory}
          vendors={vendors}
          addToast={addToast}
        />
      )}

      {/* Create Build Modal */}
      {showCreateModal && newEventDate && (
        <CreateScheduledBuildModal
          scheduledDate={newEventDate}
          boms={boms}
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
  onSyncGoogle: () => void;
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
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
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
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={onSyncGoogle}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
              >
                Sync to Calendar
              </button>
              
              {buildOrder.status !== 'Completed' && (
                <button
                  onClick={onComplete}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                >
                  Mark Complete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Create Scheduled Build Modal Component
interface CreateScheduledBuildModalProps {
  scheduledDate: Date;
  boms: BillOfMaterials[];
  onClose: () => void;
  onCreate: (sku: string, name: string, quantity: number, scheduledDate: string, dueDate?: string) => void;
}

const CreateScheduledBuildModal: React.FC<CreateScheduledBuildModalProps> = ({
  scheduledDate,
  boms,
  onClose,
  onCreate,
}) => {
  const [selectedBom, setSelectedBom] = useState<BillOfMaterials | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [startDate, setStartDate] = useState(scheduledDate);
  const [endDate, setEndDate] = useState(new Date(scheduledDate.getTime() + 2 * 60 * 60 * 1000)); // 2 hours later

  const handleCreate = () => {
    if (!selectedBom) return;
    
    onCreate(
      selectedBom.finishedSku,
      selectedBom.name,
      quantity,
      startDate.toISOString(),
      endDate.toISOString()
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg max-w-md w-full mx-4">
        <div className="p-6 border-b border-gray-700">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-white">Schedule Build Order</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Product (BOM)
            </label>
            <select
              value={selectedBom?.id || ''}
              onChange={(e) => {
                const bom = boms.find(b => b.id === e.target.value);
                setSelectedBom(bom || null);
              }}
              className="w-full bg-gray-700 text-white rounded-md px-3 py-2"
            >
              <option value="">Select a product...</option>
              {boms.map(bom => (
                <option key={bom.id} value={bom.id}>
                  {bom.name} ({bom.finishedSku})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Quantity
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="w-full bg-gray-700 text-white rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Start Date & Time
            </label>
            <input
              type="datetime-local"
              value={startDate.toISOString().slice(0, 16)}
              onChange={(e) => setStartDate(new Date(e.target.value))}
              className="w-full bg-gray-700 text-white rounded-md px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              End Date & Time
            </label>
            <input
              type="datetime-local"
              value={endDate.toISOString().slice(0, 16)}
              onChange={(e) => setEndDate(new Date(e.target.value))}
              className="w-full bg-gray-700 text-white rounded-md px-3 py-2"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedBom}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50"
            >
              Create Build Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionCalendarView;