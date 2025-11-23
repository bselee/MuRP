import React, { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { BillOfMaterials, InventoryItem, User } from '../types';
import { SparklesIcon, ShieldCheckIcon, ArrowDownTrayIcon } from './icons';
import ShopifySetupWizard from './ShopifySetupWizard';
import { useShopifySetup } from '../hooks/useShopifySetup';

interface ShopifyIntegrationPanelProps {
  currentUser: User;
  inventory: InventoryItem[];
  boms: BillOfMaterials[];
}

const ShopifyIntegrationPanel: React.FC<ShopifyIntegrationPanelProps> = ({ currentUser, inventory, boms }) => {
  const { state, progress, markSalesSource, markCredentials, upsertSkuMatch, resetSetup } = useShopifySetup();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const executionEnabled = import.meta.env.VITE_SHOPIFY_INTEGRATION_ENABLED === 'true';
  const canAdminister = ['Admin', 'Manager'].includes(currentUser.role) || currentUser.department === 'Operations';

  const statusLabel = useMemo(() => {
    if (state.status === 'ready') {
      return executionEnabled ? 'Ready for Ops toggle' : 'Ready (still gated)';
    }
    if (state.status === 'matching') return 'Mapping SKUs';
    if (state.status === 'planning') return 'Planning systems';
    return 'Preview disabled until wizard runs';
  }, [executionEnabled, state.status]);

  const badgeClass =
    state.status === 'ready'
      ? 'bg-emerald-500/10 text-emerald-200 border-emerald-400/40'
      : 'bg-white/5 text-white border-white/10';

  const executionState = executionEnabled ? 'Edge functions live' : 'Edge functions off';

  if (!canAdminister) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-gray-400">
        <p className="font-semibold text-white">Admin only</p>
        <p className="mt-2">Only Admin/Ops can prepare the Shopify integration. Ask your lead to run the wizard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/80 to-slate-900/60 p-6 shadow-[0_25px_80px_rgba(1,5,20,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Sales channels (beta)</p>
            <h3 className="text-2xl font-bold text-white">Shopify bridge</h3>
            <p className="text-sm text-gray-400">
              Fully built but intentionally disabled until you finish the setup wizard and Ops flips the master switch.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Execution</p>
            <p className="text-sm font-semibold text-white">{executionState}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Status</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-white">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${badgeClass}`}>
                {statusLabel}
              </span>
            </p>
            <p className="mt-2 text-xs text-gray-400">Progress {progress}%</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-gray-300">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Next action</p>
            <p className="mt-2 text-white">
              {state.status === 'ready'
                ? 'Share this state with Ops to schedule go-live.'
                : 'Launch the wizard to finish credentials + SKU matching.'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-gray-300">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Docs</p>
            <p className="mt-2 text-white">`docs/SHOPIFY_INTEGRATION.md`</p>
            <a
              href="docs/SHOPIFY_INTEGRATION.md"
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Download playbook
            </a>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => setIsWizardOpen(true)}
            className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
          >
            Launch setup wizard
          </Button>
          <Button
            onClick={resetSetup}
            className="text-sm text-gray-400 hover:text-white"
          >
            Reset preview
          </Button>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-400">
            {executionEnabled ? (
              <ShieldCheckIcon className="h-4 w-4 text-emerald-300" />
            ) : (
              <SparklesIcon className="h-4 w-4 text-amber-200" />
            )}
            {executionEnabled ? 'Live once Ops toggles it' : 'Still off — safe to explore'}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-gray-400">
          <SparklesIcon className="h-4 w-4 text-amber-200" />
          Why it’s off
        </div>
        <p className="mt-2">
          Shopify becomes the source of truth for sales once Ops approves. Until then, MuRP politely nudges you to finish
          credential work in Settings while all code paths stay dormant.
        </p>
      </div>

      {isWizardOpen && (
        <ShopifySetupWizard
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          inventory={inventory}
          boms={boms}
          state={state}
          progress={progress}
          onSelectSource={markSalesSource}
          onSaveCredentials={markCredentials}
          onMatchSku={upsertSkuMatch}
        />
      )}
    </div>
  );
};

export default ShopifyIntegrationPanel;
