import React from 'react';

/**
 * Global loading overlay shown while the app hydrates its initial datasets.
 * Keeps UX consistent with a single spinner rather than empty tables.
 */
const LoadingOverlay: React.FC = () => (
  <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gray-900/40 backdrop-blur-sm text-white">
    <div className="relative w-16 h-16">
      <div className="absolute inset-0 rounded-full border-[3px] border-accent-500/30" />
      <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-accent-300 border-r-violet-400 animate-[spin_1.25s_linear_infinite]" />
      <div className="absolute inset-2 rounded-full border-[3px] border-transparent border-b-cyan-300 border-l-blue-500 animate-[spin_1.75s_linear_infinite] opacity-80" />
      <div className="absolute inset-4 rounded-full bg-accent-500/40 blur-2xl opacity-60" />
    </div>
    <p className="mt-4 text-sm text-gray-300">Gathering updated data…</p>
  </div>
);

export default LoadingOverlay;
