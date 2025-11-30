import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { BillOfMaterials } from '../types';
import { XMarkIcon } from './icons';

export interface ScheduleBuildModalProps {
  boms: BillOfMaterials[];
  defaultStart?: Date;
  defaultEnd?: Date;
  defaultQuantity?: number;
  defaultBomId?: string;
  lockProductSelection?: boolean;
  onClose: () => void;
  onCreate: (
    sku: string,
    name: string,
    quantity: number,
    scheduledDate: string,
    dueDate?: string
  ) => void;
}

const toLocalInputValue = (date: Date) => {
  const iso = date.toISOString();
  return iso.slice(0, iso.lastIndexOf(':'));
};

const ScheduleBuildModal: React.FC<ScheduleBuildModalProps> = ({
  boms,
  defaultStart,
  defaultEnd,
  defaultQuantity = 1,
  defaultBomId,
  lockProductSelection = false,
  onClose,
  onCreate,
}) => {
  const defaultStartDate = useMemo(() => defaultStart ?? new Date(), [defaultStart]);
  const defaultEndDate = useMemo(() => {
    if (defaultEnd) return defaultEnd;
    return new Date(defaultStartDate.getTime() + 2 * 60 * 60 * 1000);
  }, [defaultEnd, defaultStartDate]);

  const [selectedBomId, setSelectedBomId] = useState<string>(defaultBomId ?? '');
  const [quantity, setQuantity] = useState<number>(defaultQuantity);
  const [startDate, setStartDate] = useState<Date>(defaultStartDate);
  const [endDate, setEndDate] = useState<Date>(defaultEndDate);

  useEffect(() => {
    setSelectedBomId(defaultBomId ?? '');
  }, [defaultBomId]);

  const selectedBom = useMemo(
    () => boms.find((bom) => bom.id === selectedBomId || bom.finishedSku === selectedBomId) ?? null,
    [boms, selectedBomId]
  );

  const handleSubmit = () => {
    if (!selectedBom) return;
    const sku = selectedBom.finishedSku;
    const name = selectedBom.name;
    onCreate(sku, name, quantity, startDate.toISOString(), endDate.toISOString());
  };

  const recommendedHours = selectedBom?.buildTimeMinutes ? selectedBom.buildTimeMinutes / 60 : null;
  const laborRate = selectedBom?.laborCostPerHour ?? null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg shadow-2xl mx-4">
        <div className="flex items-start justify-between border-b border-gray-800 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent-300">Schedule build</p>
            <h3 className="text-xl font-semibold text-white mt-1">Send to production calendar</h3>
          </div>
          <Button onClick={onClose} className="text-gray-400 hover:text-white">
            <XMarkIcon className="w-6 h-6" />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Product (BOM)</label>
            {lockProductSelection && selectedBom ? (
              <div className="rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-200">
                <p className="font-semibold">{selectedBom.name}</p>
                <p className="text-gray-400">{selectedBom.finishedSku}</p>
              </div>
            ) : (
              <select
                value={selectedBomId}
                onChange={(e) => setSelectedBomId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">Select a product…</option>
                {boms.map((bom) => (
                  <option key={bom.id} value={bom.id}>
                    {bom.name} ({bom.finishedSku})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Estimated duration</label>
              {recommendedHours ? (
                <p className="text-sm text-gray-300">
                  {recommendedHours.toFixed(1)} hrs
                  {laborRate ? ` • $${laborRate.toFixed(2)}/hr` : ''}
                </p>
              ) : (
                <p className="text-sm text-gray-500">Add build time in the BOM to estimate labor</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Start date & time</label>
              <input
                type="datetime-local"
                value={toLocalInputValue(startDate)}
                onChange={(e) => setStartDate(new Date(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">End date & time</label>
              <input
                type="datetime-local"
                value={toLocalInputValue(endDate)}
                onChange={(e) => setEndDate(new Date(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-6 py-4">
          <Button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedBom}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              selectedBom
                ? 'bg-accent-500 text-white hover:bg-accent-500'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            Schedule build
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleBuildModal;
