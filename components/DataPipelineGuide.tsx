import React, { useState } from 'react';
import Button from '@/components/ui/Button';

interface GuideItem {
  label: string;
  description: string;
  checklist?: string[];
  docHref?: string;
  docLabel?: string;
}

interface DataPipelineGuideProps {
  items: GuideItem[];
  defaultCollapsed?: boolean;
}

const DataPipelineGuide: React.FC<DataPipelineGuideProps> = ({ items, defaultCollapsed = false }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="rounded-2xl border border-gray-700/70 bg-gray-900/50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-accent-300">Data inputs</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Configure every pipeline in minutes</h3>
          <p className="mt-2 text-sm text-gray-400">
            Follow these tiles when you need the playbook. Collapse them to keep the Settings surface light.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(prev => !prev)}
          className="rounded-full px-4 py-2 text-xs font-semibold"
        >
          {collapsed ? 'Show guidance' : 'Hide guidance'}
        </Button>
      </div>

      {collapsed ? (
        <p className="mt-4 text-xs text-gray-500">
          Need the checklist? Expand the guidance when you’re ready to wire each pipeline.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {items.map((item, idx) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 backdrop-blur-xl space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-200">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-accent-500/40 text-accent-100">
                  {idx + 1}
                </span>
                Step {idx + 1}
              </div>
              <div>
                <p className="text-base font-semibold text-white">{item.label}</p>
                <p className="text-xs text-gray-400 mt-1">{item.description}</p>
              </div>
              {item.checklist && item.checklist.length > 0 && (
                <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                  {item.checklist.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              )}
              {item.docHref && (
                <a
                  href={item.docHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-xs font-semibold text-accent-300 hover:text-accent-100 transition-colors"
                >
                  {item.docLabel ?? 'Open guide'} →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DataPipelineGuide;
