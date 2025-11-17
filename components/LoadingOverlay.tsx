import React from 'react';

/**
 * Global loading overlay shown while the app hydrates its initial datasets.
 * Keeps UX consistent with a single spinner rather than empty tables.
 */
const LoadingOverlay: React.FC = () => (
  <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gray-950/85 backdrop-blur-sm text-white">
    <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
    <p className="mt-4 text-sm text-gray-300">Syncing the latest Supabase data…</p>
  </div>
);

export default LoadingOverlay;
