import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { InventoryItem, BillOfMaterials } from '../types';
import type {
  ShopifySetupState,
  ShopifySalesSource,
  ShopifySetupStatus,
} from '../hooks/useShopifySetup';
import {
  SparklesIcon,
  ShieldCheckIcon,
  LightBulbIcon,
  ChevronDownIcon,
  CheckCircleIcon,
} from './icons';

interface ShopifySetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  boms: BillOfMaterials[];
  state: ShopifySetupState;
  progress: number;
  onSelectSource: (source: ShopifySalesSource) => void;
  onSaveCredentials: (payload: { shopDomain: string; credentialStrategy: ShopifySetupState['credentialStrategy']; hasPlaceholders?: boolean }) => void;
  onMatchSku: (localSku: string, shopifySku: string) => void;
}

const salesSourceOptions: Array<{
  value: ShopifySalesSource;
  label: string;
  description: string;
  bestPractice: string;
}> = [
  {
    value: 'shopify',
    label: 'Shopify only',
    description: 'Shopify is the system of record for sales + inventory verification.',
    bestPractice: 'Best for teams that fulfill directly out of Shopify or a single 3PL.',
  },
  {
    value: 'shopify+finale',
    label: 'Shopify + Finale',
    description: 'Shopify feeds sales; Finale stays source-of-truth for inventory + costing.',
    bestPractice: 'Keep Finale nightly syncs on; MuRP reconciles deltas.',
  },
  {
    value: 'shopify+fishbowl',
    label: 'Shopify + Fishbowl',
    description: 'Fishbowl drives work orders while Shopify streams demand.',
    bestPractice: 'Use SKU parity and let Fishbowl push adjustments back upstream.',
  },
  {
    value: 'shopify+spreadsheets',
    label: 'Shopify + Spreadsheets',
    description: 'Sales in Shopify, ops tracked in curated spreadsheets.',
    bestPractice: 'Upload CSV snapshots weekly until a warehouse system is live.',
  },
];

const credentialStrategies = [
  { value: 'supabase-secrets', label: 'Supabase secrets manager' },
  { value: 'env-file', label: '.env files (local only)' },
  { value: 'manual', label: 'Manual paste per environment' },
];

const stepForStatus = (status: ShopifySetupStatus) => {
  switch (status) {
    case 'disabled':
      return 1;
    case 'planning':
      return 2;
    case 'matching':
      return 3;
    case 'ready':
      return 4;
    default:
      return 1;
  }
};

const ShopifySetupWizard: React.FC<ShopifySetupWizardProps> = ({
  isOpen,
  onClose,
  inventory,
  boms,
  state,
  progress,
  onSelectSource,
  onSaveCredentials,
  onMatchSku,
}) => {
  const [step, setStep] = useState(stepForStatus(state.status));
  const [shopDomain, setShopDomain] = useState(state.shopDomain ?? '');
  const [credentialStrategy, setCredentialStrategy] = useState(state.credentialStrategy ?? 'supabase-secrets');
  const [ackSecrets, setAckSecrets] = useState(false);
  const [localMatches, setLocalMatches] = useState<Record<string, string>>({});

  useEffect(() => {
    setStep(stepForStatus(state.status));
  }, [state.status]);

  useEffect(() => {
    setShopDomain(state.shopDomain ?? '');
    setCredentialStrategy(state.credentialStrategy ?? 'supabase-secrets');
    setLocalMatches(
      Object.entries(state.skuMatches).reduce<Record<string, string>>((acc, [sku, payload]) => {
        acc[sku] = payload.shopifySku ?? '';
        return acc;
      }, {}),
    );
  }, [state]);

  const displayRows = useMemo(() => {
    const inventorySkus = inventory.map((item) => item.sku);
    const finishedSkus = boms.map((bom) => bom.finishedSku);
    const unique = Array.from(new Set([...finishedSkus, ...inventorySkus])).filter(Boolean);
    return unique.slice(0, 8);
  }, [boms, inventory]);

  if (!isOpen) return null;

  const handleCredentialSave = () => {
    if (!shopDomain.trim()) return;
    onSaveCredentials({
      shopDomain: shopDomain.trim(),
      credentialStrategy: credentialStrategy as ShopifySetupState['credentialStrategy'],
      hasPlaceholders: ackSecrets,
    });
    setStep(3);
  };

  const handleMatchCommit = (sku: string) => {
    const candidate = localMatches[sku] ?? '';
    onMatchSku(sku, candidate);
  };

  const allMatched =
    displayRows.length > 0 &&
    displayRows.every((sku) => {
      const stateMatch = state.skuMatches[sku];
      return stateMatch?.status === 'matched';
    });

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-gray-950/80 backdrop-blur-lg px-4 py-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/70 shadow-[0_35px_120px_rgba(1,5,20,0.65)]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Shopify preview</p>
            <h2 className="text-2xl font-bold text-white">Sales channel setup</h2>
            <p className="text-sm text-gray-400">
              We keep this integration powered off until credentials + SKU matching are complete.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-gray-400">
              <p>Progress</p>
              <p className="text-base font-semibold text-white">{progress}%</p>
            </div>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <Button onClick={onClose} className="text-sm text-gray-400 hover:text-white">
              Close
            </Button>
          </div>
        </header>

        <div className="grid gap-6 p-6 md:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <nav className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-gray-500">
              {['Systems', 'Credentials', 'SKU matching', 'Review'].map((label, idx) => {
                const active = step === idx + 1;
                const done = step > idx + 1;
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
                        done
                          ? 'border-emerald-400 text-emerald-300'
                          : active
                            ? 'border-white text-white'
                            : 'border-white/10 text-white/40'
                      }`}
                    >
                      {done ? <CheckCircleIcon className="h-4 w-4 text-emerald-300" /> : idx + 1}
                    </span>
                    <span className={active ? 'text-white' : ''}>{label}</span>
                    {idx < 3 && <ChevronDownIcon className="-rotate-90 text-white/30" />}
                  </div>
                );
              })}
            </nav>

            {step === 1 && (
              <div className="space-y-3">
                {salesSourceOptions.map((option) => {
                  const active = state.salesSource === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onSelectSource(option.value)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                        active
                          ? 'border-emerald-400 bg-emerald-400/10'
                          : 'border-white/10 bg-white/5 hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-white">{option.label}</p>
                          <p className="text-sm text-gray-400">{option.description}</p>
                        </div>
                        {active && <ShieldCheckIcon className="h-5 w-5 text-emerald-300" />}
                      </div>
                      <p className="mt-3 text-xs text-amber-200/80">
                        <strong className="uppercase tracking-wide text-amber-300">Best practice:</strong>{' '}
                        {option.bestPractice}
                      </p>
                    </button>
                  );
                })}
                <div className="flex justify-end">
                  <Button
                    disabled={!state.salesSource}
                    onClick={() => setStep(2)}
                    className="rounded-full bg-white/10 px-6 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-50"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                    Shopify domain
                  </label>
                  <input
                    type="text"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    placeholder="your-store.myshopify.com"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Secret storage</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {credentialStrategies.map((option) => (
                      <label
                        key={option.value}
                        className={`cursor-pointer rounded-2xl border p-3 text-sm ${
                          credentialStrategy === option.value
                            ? 'border-emerald-400 bg-emerald-400/10 text-white'
                            : 'border-white/10 text-gray-300 hover:border-white/25'
                        }`}
                      >
                        <input
                          type="radio"
                          value={option.value}
                          checked={credentialStrategy === option.value}
                          onChange={(e) => setCredentialStrategy(e.target.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-gray-300">
                  <p className="font-semibold text-white">Secrets checklist</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-400">
                    <li>SHOPIFY_API_KEY / SHOPIFY_API_SECRET</li>
                    <li>SHOPIFY_ACCESS_TOKEN (offline token for Edge functions)</li>
                    <li>SHOPIFY_SHOP_DOMAIN</li>
                  </ul>
                  <label className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={ackSecrets}
                      onChange={(e) => setAckSecrets(e.target.checked)}
                      className="rounded border-white/20 bg-transparent text-emerald-400 focus:ring-emerald-500"
                    />
                    I’ve staged these secrets in the selected storage method.
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-white">
                    Back
                  </Button>
                  <Button
                    disabled={!shopDomain}
                    onClick={handleCredentialSave}
                    className="rounded-full bg-emerald-500 px-6 py-2 text-sm text-black hover:bg-emerald-400 disabled:opacity-40"
                  >
                    Save & Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  We pre-fill Shopify SKUs with your existing MuRP SKUs so you can confirm parity or override before we
                  ever call the Shopify API.
                </p>
                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-xs uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">MuRP SKU</th>
                        <th className="px-4 py-3 text-left">Shopify SKU</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {displayRows.map((sku) => {
                        const stateMatch = state.skuMatches[sku];
                        const localValue = localMatches[sku] ?? stateMatch?.shopifySku ?? sku;
                        const isMatched = stateMatch?.status === 'matched';
                        return (
                          <tr key={sku} className="bg-white/5/50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-300">{sku || '—'}</td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={localValue}
                                onChange={(e) =>
                                  setLocalMatches((prev) => ({
                                    ...prev,
                                    [sku]: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-xs ${
                                  isMatched
                                    ? 'border border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                                    : 'border border-white/10 text-gray-400'
                                }`}
                              >
                                {isMatched ? 'Matched' : 'Needs review'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                onClick={() => handleMatchCommit(sku)}
                                className="rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
                              >
                                Commit
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-white">
                    Back
                  </Button>
                  <Button
                    disabled={!allMatched}
                    onClick={() => setStep(4)}
                    className="rounded-full bg-emerald-500 px-6 py-2 text-sm text-black hover:bg-emerald-400 disabled:opacity-40"
                  >
                    Finish review
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-gray-200">
                <div className="flex items-center gap-3">
                  <ShieldCheckIcon className="h-6 w-6 text-emerald-300" />
                  <div>
                    <p className="text-lg font-semibold text-white">Wizard complete</p>
                    <p className="text-gray-400">
                      Shopify integration stays disabled until Ops toggles it on. Your mappings are safe in local
                      storage for now.
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 text-gray-300">
                  <li>• Sales source: {state.salesSource}</li>
                  <li>• Shopify domain: {state.shopDomain || '—'}</li>
                  <li>• Credential strategy: {state.credentialStrategy}</li>
                  <li>• Matched SKUs: {Object.values(state.skuMatches).filter((m) => m.status === 'matched').length}</li>
                </ul>
                <div className="flex justify-end">
                  <Button onClick={onClose} className="rounded-full bg-emerald-500 px-6 py-2 text-sm text-black hover:bg-emerald-400">
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-indigo-200">
                <SparklesIcon className="h-4 w-4 text-amber-200" />
                Why the wizard?
              </div>
              <p>
                Shopify runs point on sales, but MuRP never hits their API until you explicitly bless credentials & SKU
                mappings. This keeps production stable while we stage the future integration.
              </p>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-gray-400">
                <LightBulbIcon className="h-4 w-4 text-amber-200" />
                Best practices
              </div>
              <ul className="mt-3 space-y-2 text-xs text-gray-400">
                <li>• Keep Shopify + Finale or Fishbowl SKUs identical whenever possible.</li>
                <li>• Stage secrets in Supabase or a secure vault—never in screenshots or docs.</li>
                <li>• Decide if Shopify or Finale is the financial system of record before toggling on.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ShopifySetupWizard;
