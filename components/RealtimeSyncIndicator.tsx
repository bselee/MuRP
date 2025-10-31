/**
 * Realtime Sync Indicator
 * 
 * Visual indicator showing the status of real-time synchronization.
 * Displays connection status, last update time, and any errors.
 */

import { useRealtimeStatus } from '../hooks/useRealtimeSync';

export default function RealtimeSyncIndicator() {
  const { isOnline, isConnected, lastUpdate, error } = useRealtimeStatus();

  // Don't show if offline
  if (!isOnline) {
    return (
      <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
        <span className="w-2 h-2 bg-white rounded-full"></span>
        <span className="text-sm font-medium">Offline</span>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="fixed bottom-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">⚠️ Sync Error</span>
        </div>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  // Show connected state
  if (isConnected) {
    return (
      <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
          <span className="text-sm font-medium">Live</span>
        </div>
        {lastUpdate && (
          <p className="text-xs mt-1 opacity-90">
            Updated {new Date(lastUpdate).toLocaleTimeString()}
          </p>
        )}
      </div>
    );
  }

  // Show disconnected state
  return (
    <div className="fixed bottom-4 right-4 bg-gray-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
      <span className="w-2 h-2 bg-white rounded-full opacity-50"></span>
      <span className="text-sm font-medium">Not Connected</span>
    </div>
  );
}
