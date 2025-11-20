import React from 'react';
import CalendarSettingsPanel from './CalendarSettingsPanel';
import GoogleSheetsPanel from './GoogleSheetsPanel';

interface GoogleDataPanelProps {
  userId: string;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const GoogleDataPanel: React.FC<GoogleDataPanelProps> = ({ userId, addToast }) => {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Step 1</p>
        <h3 className="text-xl font-semibold text-white mt-2">Connect Google services</h3>
        <p className="text-sm text-gray-400 mt-1">
          Authenticate once and reuse the same scopes for calendar syncing, Sheets imports, and
          backups.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-700/70 bg-gray-900/40 p-6">
          <div className="mb-4 space-y-1">
            <h4 className="text-lg font-semibold text-white">Production calendar sync</h4>
            <p className="text-sm text-gray-400">
              Pick a calendar, timezone, and enable automatic sync so builds flow both directions.
            </p>
          </div>
          <CalendarSettingsPanel userId={userId} addToast={addToast} />
        </div>
        <div className="rounded-2xl border border-gray-700/70 bg-gray-900/40 p-6">
          <div className="mb-4 space-y-1">
            <h4 className="text-lg font-semibold text-white">Sheets import / backup</h4>
            <p className="text-sm text-gray-400">
              Import curated datasets, export the live warehouse, or generate automatic backups in
              one place.
            </p>
          </div>
          <GoogleSheetsPanel addToast={addToast} />
        </div>
      </div>
    </div>
  );
};

export default GoogleDataPanel;
