import React from 'react';

interface DataPipelineGuideProps {
  items: Array<{
    label: string;
    description: string;
  }>;
}

const DataPipelineGuide: React.FC<DataPipelineGuideProps> = ({ items }) => {
  return (
    <div className="rounded-2xl border border-gray-700/70 bg-gray-900/50 p-6">
      <p className="text-xs uppercase tracking-[0.35em] text-indigo-300">Data inputs</p>
      <h3 className="mt-2 text-2xl font-semibold text-white">Configure every pipeline in minutes</h3>
      <p className="mt-2 text-sm text-gray-400">
        Follow the guided steps below. Start with Google auth, then pick Finale or Sheets as your
        primary data source, and finally wire any custom APIs.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((item, idx) => (
          <div
            key={item.label}
            className="rounded-xl border border-gray-700/60 bg-gray-900/40 px-4 py-3 space-y-1"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/30 text-xs font-semibold text-indigo-200">
              {idx + 1}
            </span>
            <p className="text-sm font-semibold text-white">{item.label}</p>
            <p className="text-xs text-gray-400">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DataPipelineGuide;
