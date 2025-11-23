import React, { useMemo } from 'react';
import type { BillOfMaterials, BuildOrder, PurchaseOrder } from '../types';

interface ProductionTimelineViewProps {
  buildOrders: BuildOrder[];
  boms: BillOfMaterials[];
  purchaseOrders: PurchaseOrder[];
}

type TimelineRow = {
  department: string;
  orders: Array<{
    build: BuildOrder;
    name: string;
    startDate: Date;
    endDate: Date;
    offset: number;
    width: number;
    rangeLabel: string;
    incomingNote?: string;
    status: BuildOrder['status'];
  }>;
};

const fallbackDurationMs = 1000 * 60 * 60 * 24 * 2; // 2 days
const departments = ['MFG 1', 'MFG 2', 'Operations', 'Fulfillment', 'SHP/RCV', 'Purchasing'];

const inferDepartment = (build: BuildOrder, bom: BillOfMaterials | undefined): string => {
  const source = bom?.category?.toLowerCase() ?? bom?.notes?.toLowerCase() ?? '';
  if (source.includes('mfg 2')) return 'MFG 2';
  if (source.includes('mfg 1')) return 'MFG 1';
  if (source.includes('fulfill')) return 'Fulfillment';
  if (source.includes('shp') || source.includes('rcv') || source.includes('receiving')) return 'SHP/RCV';
  return departments.includes(build.assignedUserId ?? '') ? (build.assignedUserId as string) : 'Operations';
};

const getIncomingNote = (sku: string, purchaseOrders: PurchaseOrder[]): string | undefined => {
  const flattened = purchaseOrders.flatMap((po) =>
    (po.items || []).map((item) => ({
      po,
      item,
    })),
  );

  const candidate = flattened
    .filter(({ item }) => item.sku === sku)
    .sort((a, b) => {
      const dateA = new Date(a.po.estimatedReceiveDate ?? a.po.expectedDate ?? a.po.orderDate).getTime();
      const dateB = new Date(b.po.estimatedReceiveDate ?? b.po.expectedDate ?? b.po.orderDate).getTime();
      return dateA - dateB;
    })[0];

  if (!candidate) return undefined;

  const eta = candidate.po.estimatedReceiveDate || candidate.po.expectedDate;
  const etaLabel = eta ? new Date(eta).toLocaleDateString() : 'pending';
  const tracking = candidate.po.trackingStatus ? ` · ${candidate.po.trackingStatus}` : '';
  return `Incoming ${candidate.item.quantity} via PO ${candidate.po.orderId} (${etaLabel}${tracking})`;
};

const formatRange = (start: Date, end: Date) => {
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const ProductionTimelineView: React.FC<ProductionTimelineViewProps> = ({ buildOrders, boms, purchaseOrders }) => {
  const timeline = useMemo(() => {
    if (buildOrders.length === 0) {
      return { rows: [], label: '' };
    }

    const timelineBounds = buildOrders.reduce(
      (bounds, order) => {
        const start = order.scheduledDate ? new Date(order.scheduledDate) : new Date(order.createdAt);
        const end = order.dueDate
          ? new Date(order.dueDate)
          : new Date(start.getTime() + fallbackDurationMs);
        return {
          start: bounds.start ? new Date(Math.min(bounds.start.getTime(), start.getTime())) : start,
          end: bounds.end ? new Date(Math.max(bounds.end.getTime(), end.getTime())) : end,
        };
      },
      { start: null as Date | null, end: null as Date | null },
    );

    const totalDuration =
      timelineBounds.end && timelineBounds.start
        ? timelineBounds.end.getTime() - timelineBounds.start.getTime() || fallbackDurationMs
        : fallbackDurationMs;

    const rowsMap = new Map<string, TimelineRow>();

    buildOrders.forEach((order) => {
      const bom = boms.find((entry) => entry.finishedSku === order.finishedSku);
      const department = inferDepartment(order, bom);
      const start = order.scheduledDate ? new Date(order.scheduledDate) : new Date(order.createdAt);
      const end = order.dueDate ? new Date(order.dueDate) : new Date(start.getTime() + fallbackDurationMs);
      const positionStart = ((start.getTime() - (timelineBounds.start?.getTime() ?? start.getTime())) / totalDuration) * 100;
      const positionEnd = ((end.getTime() - (timelineBounds.start?.getTime() ?? start.getTime())) / totalDuration) * 100;
      const width = Math.max(4, clampPercent(positionEnd - positionStart));
      const offset = clampPercent(positionStart);
      const incoming = getIncomingNote(order.finishedSku, purchaseOrders);

      if (!rowsMap.has(department)) {
        rowsMap.set(department, { department, orders: [] });
      }

      rowsMap.get(department)?.orders.push({
        build: order,
        name: order.name,
        startDate: start,
        endDate: end,
        offset,
        width,
        rangeLabel: formatRange(start, end),
        incomingNote: incoming,
        status: order.status,
      });
    });

    const rows = Array.from(rowsMap.values()).sort((a, b) => departments.indexOf(a.department) - departments.indexOf(b.department));
    rows.forEach((row) => row.orders.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()));

    const label =
      timelineBounds.start && timelineBounds.end
        ? `${timelineBounds.start.toLocaleDateString()} → ${timelineBounds.end.toLocaleDateString()}`
        : '';

    return { rows, label };
  }, [buildOrders, boms, purchaseOrders]);

  if (timeline.rows.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-gray-400">
        No build orders yet. Schedule a build to see it plotted on the timeline.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Timeline window</span>
        <span>{timeline.label}</span>
      </div>
      {timeline.rows.map((row) => (
        <div key={row.department} className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/70 to-slate-900/50 p-4 shadow-[0_15px_50px_rgba(3,7,18,0.45)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Department</p>
              <h3 className="text-lg font-semibold text-white">{row.department}</h3>
            </div>
            <span className="text-xs text-gray-400">{row.orders.length} build{row.orders.length === 1 ? '' : 's'}</span>
          </div>
          <div className="relative mt-4 h-28 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:8%_100%]" />
            {row.orders.map((order) => (
              <div
                key={order.build.id}
                className={`absolute top-3 rounded-2xl border px-4 py-2 text-xs text-white shadow-lg transition-opacity ${
                  order.status === 'Completed'
                    ? 'bg-emerald-500/30 border-emerald-400/50'
                    : order.status === 'In Progress'
                      ? 'bg-indigo-500/30 border-indigo-400/50'
                      : 'bg-amber-500/25 border-amber-400/40'
                }`}
                style={{ left: `${order.offset}%`, width: `${order.width}%`, minWidth: '150px' }}
              >
                <p className="font-semibold">{order.name}</p>
                <p className="text-[11px] text-gray-200">{order.rangeLabel}</p>
                {order.incomingNote && (
                  <p className="mt-1 text-[11px] text-amber-100 line-clamp-2">{order.incomingNote}</p>
                )}
                {order.build.notes && (
                  <p className="mt-1 text-[11px] text-gray-200 line-clamp-2">{order.build.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProductionTimelineView;
