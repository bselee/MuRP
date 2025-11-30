import React, { useMemo } from 'react';
import Button from '@/components/ui/Button';
import type {
  BillOfMaterials,
  InventoryItem,
  Label,
  ComplianceRecord,
} from '../types';
import {
  DollarSignIcon,
  ClockIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ShieldCheckIcon,
  PackageIcon,
} from './icons';

const HOLDING_COST_RATE = 0.0175;
const DAY_MS = 1000 * 60 * 60 * 24;

export type BuildabilityInfo = {
  maxBuildable: number;
  limitingComponents: Array<{
    sku: string;
    name: string;
    available: number;
    needed: number;
    canBuild: number;
  }>;
};

interface StrategicBomMetricsProps {
  bom: BillOfMaterials;
  finishedItem?: InventoryItem;
  buildability: BuildabilityInfo;
  inventoryMap: Map<string, InventoryItem>;
  labels?: Label[];
  complianceRecords?: ComplianceRecord[];
  queueStatus?: Record<string, { status: string; poId: string | null }>;
  onViewBreakdown?: () => void;
}

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatPercent = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toFixed(1)}%`;
};

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/50 to-slate-950/70 p-4 backdrop-blur-lg shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-100 tracking-tight">{title}</h4>
        {description && <p className="text-[12px] text-gray-500">{description}</p>}
      </div>
    </div>
    {children}
  </div>
);

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  sublabel?: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ icon, label, value, tone = 'default', sublabel, footer }) => {
  const toneClasses =
    tone === 'danger'
      ? 'border-red-400/40 bg-red-500/10'
      : tone === 'warning'
        ? 'border-amber-400/40 bg-amber-400/10'
        : tone === 'success'
          ? 'border-emerald-400/40 bg-emerald-400/10'
          : 'border-white/10 bg-white/5';

  return (
    <div className={`rounded-2xl border ${toneClasses} p-3 backdrop-blur`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-100">{value}</div>
      {sublabel && <div className="text-[13px] text-gray-400 mt-1">{sublabel}</div>}
      {footer && <div className="mt-2 text-[12px] text-gray-500">{footer}</div>}
    </div>
  );
};

const StrategicBomMetrics: React.FC<StrategicBomMetricsProps> = ({
  bom,
  finishedItem,
  buildability,
  inventoryMap,
  labels = [],
  complianceRecords = [],
  queueStatus = {},
  onViewBreakdown,
}) => {
  const finishedStock = finishedItem?.stock ?? 0;
  const finishedOnOrder = finishedItem?.onOrder ?? 0;
  const safetyStock = finishedItem?.safetyStock ?? finishedItem?.reorderPoint ?? null;
  const yieldQuantity = bom.yieldQuantity || 1;

  const componentFinancials = useMemo(() => {
    return (bom.components || []).map(component => {
      const inventoryItem = inventoryMap.get(component.sku);
      const quantity = component.quantity || 1;
      const unitCost = inventoryItem?.unitCost ?? 0;
      return {
        sku: component.sku,
        name: component.name,
        quantity,
        unitCost,
        extendedCost: unitCost * quantity,
        available: inventoryItem?.stock ?? 0,
        leadTime: inventoryItem?.leadTimeDays ?? null,
        vendorId: inventoryItem?.vendorId ?? null,
      };
    });
  }, [bom.components, inventoryMap]);

  const totalBuildCost = componentFinancials.reduce((sum, part) => sum + part.extendedCost, 0);
  const unitBuildCost = totalBuildCost > 0 ? totalBuildCost / yieldQuantity : null;
  const stockCarryingValue = finishedStock * (finishedItem?.unitCost ?? unitBuildCost ?? 0);
  const holdingCostMonthly = stockCarryingValue * HOLDING_COST_RATE;

  const unitPrice = finishedItem?.unitPrice ?? null;
  const marginPct =
    unitPrice != null && unitBuildCost != null && unitPrice > 0
      ? ((unitPrice - unitBuildCost) / unitPrice) * 100
      : null;
  const marginStatus =
    marginPct == null ? 'unknown' : marginPct >= 50 ? 'success' : marginPct >= 35 ? 'warning' : 'danger';

  const componentsNeedingSupply = componentFinancials
    .filter(component => component.available < component.quantity)
    .sort((a, b) => (b.leadTime ?? 0) - (a.leadTime ?? 0));
  const leadCascade = componentsNeedingSupply.length
    ? componentsNeedingSupply
    : componentFinancials.filter(component => component.leadTime != null).sort((a, b) => (b.leadTime ?? 0) - (a.leadTime ?? 0));
  const readyInDays = leadCascade.length ? leadCascade[0].leadTime ?? 0 : 0;

  const lastProductionAt = bom.lastSyncAt || finishedItem?.lastSyncAt || null;
  const daysSinceProduction = lastProductionAt ? Math.floor((Date.now() - new Date(lastProductionAt).getTime()) / DAY_MS) : null;
  const productionStatus =
    daysSinceProduction == null
      ? 'No build record'
      : daysSinceProduction <= 30
        ? 'On cadence'
        : daysSinceProduction <= 90
          ? 'Idle — review'
          : 'Stale — audit';

  const velocityPerDay = typeof finishedItem?.salesVelocity === 'number' ? finishedItem.salesVelocity : null;
  const sales30Days = typeof finishedItem?.sales30Days === 'number' ? finishedItem.sales30Days : null;
  const sales60Days = typeof finishedItem?.sales60Days === 'number' ? finishedItem.sales60Days : null;
  const sales90Days = typeof finishedItem?.sales90Days === 'number' ? finishedItem.sales90Days : null;
  const avg30PerDay = sales30Days != null ? sales30Days / 30 : null;
  const avg60PerDay = sales60Days != null ? sales60Days / 60 : null;
  const avg90PerDay = sales90Days != null ? sales90Days / 90 : null;
  const currentDemand = velocityPerDay ?? avg30PerDay ?? avg60PerDay ?? avg90PerDay ?? null;
  const trailingAvg = avg90PerDay ?? avg60PerDay ?? avg30PerDay ?? null;
  const demandTrendRaw =
    currentDemand != null && trailingAvg != null && trailingAvg !== 0
      ? ((currentDemand - trailingAvg) / Math.abs(trailingAvg)) * 100
      : null;
  const demandTrendDirection =
    demandTrendRaw != null && Math.abs(demandTrendRaw) >= 0.5
      ? demandTrendRaw > 0
        ? 'up'
        : 'down'
      : null;
  const demandPeak = Math.max(
    currentDemand ?? 0,
    avg30PerDay ?? 0,
    avg60PerDay ?? 0,
    avg90PerDay ?? 0,
  );

  const runwayDays = currentDemand && currentDemand > 0 ? finishedStock / currentDemand : null;
  const runwayWithInbound = currentDemand && currentDemand > 0 ? (finishedStock + finishedOnOrder) / currentDemand : null;

  const stockoutRisk =
    runwayDays == null
      ? null
      : runwayDays <= 1
        ? 0.94
        : runwayDays <= 7
          ? 0.72
          : runwayDays <= 21
            ? 0.33
            : 0.08;
  const stockoutTone =
    stockoutRisk == null
      ? 'default'
      : stockoutRisk >= 0.7
        ? 'danger'
        : stockoutRisk >= 0.3
          ? 'warning'
          : 'success';

  const monthlyDemand = currentDemand != null ? currentDemand * 30 : null;
  const reorderTarget = monthlyDemand != null ? monthlyDemand + (safetyStock ?? 0) : null;
  const recommendedReorderQty =
    reorderTarget != null ? Math.max(0, Math.ceil(reorderTarget - (finishedStock + finishedOnOrder))) : null;

  const complianceCoverage = complianceRecords.length;
  const artworkCoverage = labels.filter(label => label.fileType === 'label').length;

  return (
    <div className="space-y-4">
      <Section title="Financial intelligence" description="Cost, margin, and inventory carrying impact.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            icon={<DollarSignIcon className="h-4 w-4 text-amber-300" />}
            label="Build cost"
            value={formatCurrency(unitBuildCost)}
            sublabel={`Per unit • Batch yields ${yieldQuantity} units`}
            footer={
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-amber-200/80">
                  {totalBuildCost > 0 ? `${formatCurrency(totalBuildCost)} per batch` : 'Add component costs'}
                </span>
                {onViewBreakdown && (
                  <Button
                    size="sm"
                    className="bg-amber-600/30 text-amber-100 hover:bg-amber-600/50 text-xs"
                    onClick={onViewBreakdown}
                  >
                    View cost breakdown
                  </Button>
                )}
              </div>
            }
          />
          <MetricCard
            icon={<ChartBarIcon className="h-4 w-4 text-cyan-300" />}
            label="Stock carrying cost"
            value={formatCurrency(stockCarryingValue)}
            sublabel={`Holding ≈ ${formatCurrency(holdingCostMonthly)} / month`}
            footer={
              safetyStock != null
                ? `Safety stock target ${safetyStock} units`
                : 'Add safety stock to tighten signals'
            }
          />
          <MetricCard
            icon={<TrendingUpIcon className="h-4 w-4 text-emerald-300" />}
            label="Margin health"
            value={marginPct != null ? formatPercent(marginPct) : 'Add price'}
            tone={marginStatus as 'default' | 'danger' | 'warning' | 'success'}
            sublabel={
              unitPrice != null
                ? `Sell price ${formatCurrency(unitPrice)}`
                : 'Need finished good price to score margin'
            }
            footer={
              marginPct != null && marginPct < 50
                ? 'Below 50% target — review pricing or component costs.'
                : 'On track with target margin.'
            }
          />
        </div>
      </Section>

      <Section title="Time-based intelligence" description="Lead times, readiness, and production cadence.">
        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard
            icon={<ClockIcon className="h-4 w-4 text-sky-300" />}
            label="Ready to build in"
            value={`${readyInDays || 0}d`}
            sublabel={
              leadCascade.length
                ? `${leadCascade[0].name}${leadCascade[0].leadTime ? ` • ${leadCascade[0].leadTime}d supplier` : ''}`
                : 'All critical lead times missing'
            }
            footer={
              leadCascade.length > 1
                ? `Next: ${leadCascade
                    .slice(1, 3)
                    .map(component => `${component.sku} (${component.leadTime ?? '?'}d)`)
                    .join(', ') || 'Add component lead times'}`
                : 'Add more lead-time data for cascade'
            }
          />
          <MetricCard
            icon={<SparklesIcon className="h-4 w-4 text-purple-300" />}
            label="Production runway"
            value={
              runwayDays != null
                ? `${runwayDays.toFixed(1)}d`
                : 'Set demand baseline'
            }
            sublabel={
              runwayWithInbound != null
                ? `With inbound POs: ${runwayWithInbound.toFixed(1)}d`
                : finishedOnOrder > 0
                  ? `${finishedOnOrder} inbound but missing demand rate`
                  : 'No inbound orders queued'
            }
            footer={
              safetyStock != null && finishedStock < safetyStock
                ? '⚠️ Below safety stock — expedite plan needed.'
                : 'Above safety threshold.'
            }
          />
          <MetricCard
            icon={<ClockIcon className="h-4 w-4 text-gray-300" />}
            label="Days since last build"
            value={daysSinceProduction != null ? `${daysSinceProduction}d` : '—'}
            sublabel={productionStatus}
            footer="Sync actual build completions to tighten cadence tracking."
          />
        </div>
        <div className="mt-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-3 text-[13px] text-slate-200">
          Lead time cascade:
          <div className="mt-2 space-y-1 font-mono text-[12px] text-slate-300">
            {leadCascade.slice(0, 4).map((component, index) => (
              <div key={component.sku} className="flex items-center justify-between">
                <span>
                  {index === 0 ? '└─' : '├─'} {component.sku} · {component.name}
                </span>
                <span className="text-slate-400">{component.leadTime != null ? `${component.leadTime}d` : '—'}</span>
              </div>
            ))}
            {!leadCascade.length && <div>Add lead times to expose cascade.</div>}
          </div>
        </div>
      </Section>

      <Section title="Demand intelligence" description="Signal strength, trend, and availability context.">
        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard
            icon={
              demandTrendDirection === 'down' ? (
                <TrendingDownIcon className="h-4 w-4 text-rose-300" />
              ) : (
                <TrendingUpIcon className="h-4 w-4 text-emerald-300" />
              )
            }
            label="Demand trend"
            value={
              currentDemand != null
                ? `${currentDemand.toFixed(1)}/day`
                : 'Need sales velocity'
            }
            tone={
              demandTrendDirection === 'down'
                ? 'warning'
                : demandTrendDirection === 'up'
                  ? 'success'
                  : 'default'
            }
            sublabel={
              demandTrendRaw != null
                ? `${demandTrendRaw > 0 ? '+' : ''}${demandTrendRaw.toFixed(1)}% vs trailing avg`
                : 'Add 60- or 90-day history for trend'
            }
            footer={`Peak observed: ${demandPeak ? demandPeak.toFixed(1) : 'n/a'} / day`}
          />
          <MetricCard
            icon={<PackageIcon className="h-4 w-4 text-accent-300" />}
            label="Committed vs available"
            value={`${finishedStock} units`}
            sublabel={
              safetyStock != null
                ? `Safety target ${safetyStock} • On order ${finishedOnOrder}`
                : 'Define safety stock to unlock variance alerts'
            }
            footer="Integrate order allocations to surface true commitments."
          />
          <MetricCard
            icon={<ExclamationTriangleIcon className="h-4 w-4 text-amber-300" />}
            label="Backorder impact"
            value={buildability.maxBuildable === 0 ? 'Blocking builds' : 'Clear'}
            tone={buildability.maxBuildable === 0 ? 'danger' : 'success'}
            sublabel={
              buildability.maxBuildable === 0
                ? `${Object.keys(queueStatus).length || 'Unknown'} components waiting on supply`
                : 'Ready to fulfill open demand'
            }
            footer="Connect customer order data to quantify revenue at risk."
          />
        </div>
      </Section>

      <Section title="Quality & compliance" description="Regulatory coverage and documentation hygiene.">
        <div className="grid gap-3 md:grid-cols-2">
          <MetricCard
            icon={<ShieldCheckIcon className="h-4 w-4 text-emerald-300" />}
            label="Compliance coverage"
            value={complianceCoverage ? `${complianceCoverage} records` : 'Add registrations'}
            sublabel={
              complianceCoverage
                ? 'Keep expirations synced for renewals.'
                : 'Map state registrations to unlock renewal alerts.'
            }
          />
          <MetricCard
            icon={<ClipboardDocumentListIcon className="h-4 w-4 text-slate-300" />}
            label="Artwork & docs"
            value={artworkCoverage ? `${artworkCoverage} files` : 'No files linked'}
            sublabel={
              artworkCoverage
                ? 'Verify remaining artwork for audit readiness.'
                : 'Attach labels/data sheets to enable packaging QA.'
            }
          />
        </div>
      </Section>

      <Section title="Predictive intelligence" description="Risk scoring and suggested next actions.">
        <div className="grid gap-3 md:grid-cols-2">
          <MetricCard
            icon={<ExclamationTriangleIcon className="h-4 w-4 text-amber-300" />}
            label="Stockout probability (7d)"
            value={stockoutRisk != null ? formatPercent(stockoutRisk * 100) : 'Need demand'}
            tone={stockoutTone as 'default' | 'danger' | 'warning' | 'success'}
            sublabel={
              runwayDays != null
                ? `Runway ${runwayDays.toFixed(1)}d • demand ${currentDemand?.toFixed(1) ?? '--'}/day`
                : 'Provide demand velocity to score risk.'
            }
            footer="Blend PO ETAs to improve accuracy."
          />
          <MetricCard
            icon={<TrendingUpIcon className="h-4 w-4 text-emerald-300" />}
            label="Smart reorder suggestion"
            value={
              recommendedReorderQty != null
                ? `${recommendedReorderQty} units`
                : 'Need demand'
            }
            sublabel={
              recommendedReorderQty != null && recommendedReorderQty > 0
                ? `Covers 30-day demand (${monthlyDemand?.toFixed(0)} units) + safety stock`
                : 'On-hand + inbound covers next month.'
            }
            footer="Link vendor price breaks to optimize MOQ vs. cash."
          />
        </div>
        <div className="mt-3 rounded-xl border border-dashed border-amber-800 bg-amber-900/10 p-3 text-[12px] text-amber-100">
          Seasonal & collaboration insights coming next — connect sales seasonality and watcher lists to see who is monitoring this BOM and when to pre-build ahead of peaks.
        </div>
      </Section>
    </div>
  );
};

export default StrategicBomMetrics;
