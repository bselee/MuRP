/**
 * POPipelineWidget - Lightweight dashboard widget showing PO pipeline summary
 * Links to full Pipeline View on PO page
 */
import React, { useMemo } from 'react';
import { useTheme } from './ThemeProvider';
import Button from './ui/Button';
import { PackageIcon, TruckIcon, CheckCircleIcon, ClockIcon, AlertTriangleIcon, ChevronRightIcon } from './icons';
import type { FinalePurchaseOrderRecord } from '../types';

type POPipelineStage = 'draft' | 'sent' | 'confirmed' | 'in_transit';

interface StageConfig {
  id: POPipelineStage;
  label: string;
  color: string;
  bgColor: string;
}

interface POPipelineWidgetProps {
  purchaseOrders: FinalePurchaseOrderRecord[];
  onNavigateToPipeline?: () => void;
}

const STAGES: StageConfig[] = [
  { id: 'draft', label: 'Draft', color: 'text-gray-400', bgColor: 'bg-gray-500/30' },
  { id: 'sent', label: 'Sent', color: 'text-blue-400', bgColor: 'bg-blue-500/30' },
  { id: 'confirmed', label: 'Confirmed', color: 'text-amber-400', bgColor: 'bg-amber-500/30' },
  { id: 'in_transit', label: 'In Transit', color: 'text-purple-400', bgColor: 'bg-purple-500/30' },
];

function getPOStage(po: FinalePurchaseOrderRecord): POPipelineStage | 'completed' {
  const status = (po.status || '').toUpperCase();

  if (status === 'RECEIVED' || status === 'COMPLETED') {
    return 'completed';
  }

  if (po.trackingStatus === 'in_transit' || po.trackingStatus === 'out_for_delivery') {
    return 'in_transit';
  }

  if (po.trackingNumber && po.trackingStatus !== 'delivered') {
    return 'confirmed';
  }

  if (status === 'SUBMITTED' || status === 'PARTIALLY_RECEIVED') {
    return 'sent';
  }

  return 'draft';
}

function isOverdue(po: FinalePurchaseOrderRecord): boolean {
  if (!po.expectedDate) return false;
  const expected = new Date(po.expectedDate);
  const now = new Date();
  const stage = getPOStage(po);
  return expected < now && stage !== 'completed';
}

export const POPipelineWidget: React.FC<POPipelineWidgetProps> = ({
  purchaseOrders,
  onNavigateToPipeline,
}) => {
  const { isDark } = useTheme();

  const stats = useMemo(() => {
    const counts: Record<POPipelineStage, number> = {
      draft: 0,
      sent: 0,
      confirmed: 0,
      in_transit: 0,
    };

    let overdueCount = 0;
    let totalActive = 0;

    // Filter out dropship and completed
    const activePOs = purchaseOrders.filter(po => {
      const orderId = (po.orderId || '').toLowerCase();
      if (orderId.includes('dropshippo')) return false;
      const stage = getPOStage(po);
      return stage !== 'completed';
    });

    activePOs.forEach(po => {
      const stage = getPOStage(po);
      if (stage !== 'completed') {
        counts[stage]++;
        totalActive++;
        if (isOverdue(po)) overdueCount++;
      }
    });

    return { counts, overdueCount, totalActive };
  }, [purchaseOrders]);

  const maxCount = Math.max(...Object.values(stats.counts), 1);

  return (
    <div className={`rounded-xl border p-4 ${
      isDark
        ? 'bg-slate-900/50 border-slate-800'
        : 'bg-white border-gray-200 shadow-sm'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PackageIcon className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            PO Pipeline
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {stats.overdueCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
              <AlertTriangleIcon className="w-3 h-3" />
              {stats.overdueCount} overdue
            </span>
          )}
          {onNavigateToPipeline && (
            <Button
              onClick={onNavigateToPipeline}
              className={`p-1 rounded transition-colors ${
                isDark
                  ? 'text-gray-400 hover:text-white hover:bg-slate-800'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title="View full pipeline"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline Progress Bar */}
      <div className="flex items-center gap-1 mb-3">
        {STAGES.map((stage, idx) => {
          const width = stats.totalActive > 0
            ? Math.max((stats.counts[stage.id] / stats.totalActive) * 100, 8)
            : 25;
          return (
            <React.Fragment key={stage.id}>
              <div
                className={`h-2 rounded-full ${stage.bgColor} transition-all duration-300`}
                style={{ width: `${width}%` }}
                title={`${stage.label}: ${stats.counts[stage.id]}`}
              />
              {idx < STAGES.length - 1 && (
                <ChevronRightIcon className={`w-3 h-3 flex-shrink-0 ${isDark ? 'text-gray-700' : 'text-gray-300'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Stage Counts */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {STAGES.map(stage => (
          <div key={stage.id}>
            <div className={`text-lg font-bold ${stage.color}`}>
              {stats.counts[stage.id]}
            </div>
            <div className={`text-[10px] uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {stage.label}
            </div>
          </div>
        ))}
      </div>

      {/* Summary Footer */}
      <div className={`mt-3 pt-3 border-t flex items-center justify-between text-xs ${
        isDark ? 'border-slate-700 text-gray-400' : 'border-gray-200 text-gray-500'
      }`}>
        <span>{stats.totalActive} active POs</span>
        <span className="flex items-center gap-1">
          <TruckIcon className="w-3 h-3" />
          {stats.counts.in_transit} arriving
        </span>
      </div>
    </div>
  );
};

export default POPipelineWidget;
