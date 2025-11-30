import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheckIcon, TrendingUpIcon, TrendingDownIcon, InformationCircleIcon, CheckCircleIcon, ExclamationTriangleIcon } from './icons';
import Button from './ui/Button';
import type {
  VendorConfidenceProfile,
  VendorConfidenceHistoryPoint,
  VendorInteractionEvent,
  VendorConfidenceTrend,
} from '../types';
import {
  buildRecommendations,
  getAllVendorConfidenceProfiles,
  getRecentInteractionEvents,
  getVendorConfidenceHistory,
  getResponseStrategyForVendor,
} from '../services/vendorConfidenceService';

interface VendorConfidenceDashboardProps {
  vendorId?: string;
}

type LoadingState = 'idle' | 'loading' | 'error';

const TREND_ICON: Record<VendorConfidenceTrend, React.ReactNode> = {
  improving: <TrendingUpIcon className="h-4 w-4 text-emerald-400" />,
  stable: <InformationCircleIcon className="h-4 w-4 text-slate-400" />,
  declining: <TrendingDownIcon className="h-4 w-4 text-rose-400" />,
};

const STATUS_BADGE: Record<string, string> = {
  fully_automatic: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  automatic_with_review: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
  needs_review: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
  needs_full_review: 'bg-orange-500/15 text-orange-200 border border-orange-500/30',
  suspended: 'bg-rose-500/15 text-rose-200 border border-rose-500/40',
};

const FACTOR_LABELS: Array<{ key: keyof VendorConfidenceProfile; label: string; weight: number }> = [
  { key: 'responseLatencyScore', label: 'Response Latency', weight: 0.2 },
  { key: 'threadingScore', label: 'Threading Discipline', weight: 0.15 },
  { key: 'completenessScore', label: 'Response Completeness', weight: 0.2 },
  { key: 'invoiceAccuracyScore', label: 'Invoice Accuracy', weight: 0.25 },
  { key: 'leadTimeScore', label: 'Lead Time Adherence', weight: 0.2 },
];

const MAX_HISTORY_POINTS = 90;

const VendorConfidenceDashboard: React.FC<VendorConfidenceDashboardProps> = ({ vendorId }) => {
  const [profiles, setProfiles] = useState<VendorConfidenceProfile[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | undefined>(vendorId);
  const [history, setHistory] = useState<VendorConfidenceHistoryPoint[]>([]);
  const [events, setEvents] = useState<VendorInteractionEvent[]>([]);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfiles() {
      setLoading('loading');
      setError(null);
      try {
        const data = await getAllVendorConfidenceProfiles();
        if (!cancelled) {
          setProfiles(data);
          if (!selectedVendorId && data.length > 0) {
            setSelectedVendorId(data[0].vendorId);
          }
          setLoading('idle');
        }
      } catch (err) {
        console.error('[VendorConfidenceDashboard] loadProfiles failed', err);
        if (!cancelled) {
          setError('Unable to load vendor confidence data.');
          setLoading('error');
        }
      }
    }

    loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [selectedVendorId]);

  useEffect(() => {
    if (!selectedVendorId) return;
    let cancelled = false;
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const [historyData, eventData] = await Promise.all([
          getVendorConfidenceHistory(selectedVendorId, MAX_HISTORY_POINTS),
          getRecentInteractionEvents(selectedVendorId, 5),
        ]);
        if (!cancelled) {
          setHistory(historyData.reverse());
          setEvents(eventData);
          setDetailLoading(false);
        }
      } catch (err) {
        console.error('[VendorConfidenceDashboard] loadDetail failed', err);
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }
    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedVendorId]);

  const selectedProfile = profiles.find(profile => profile.vendorId === selectedVendorId);

  const avgScore = useMemo(() => {
    if (profiles.length === 0) return 0;
    return profiles.reduce((sum, profile) => sum + profile.confidenceScore, 0) / profiles.length;
  }, [profiles]);

  const recommendations = useMemo(() => buildRecommendations(selectedProfile), [selectedProfile]);

  const communicationsStatusClass = selectedProfile
    ? STATUS_BADGE[selectedProfile.communicationStatus] ?? STATUS_BADGE['needs_review']
    : STATUS_BADGE['needs_review'];

  const summaryTrendCounts = useMemo(() => {
    return profiles.reduce(
      (acc, profile) => {
        acc[profile.trend] = (acc[profile.trend] ?? 0) + 1;
        return acc;
      },
      {} as Record<VendorConfidenceTrend, number>,
    );
  }, [profiles]);

  const [strategy, setStrategy] = useState<Awaited<ReturnType<typeof getResponseStrategyForVendor>> | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!selectedProfile) {
      setStrategy(null);
      return undefined;
    }
    getResponseStrategyForVendor(selectedProfile)
      .then(res => {
        if (!cancelled) setStrategy(res);
      })
      .catch(err => console.error('[VendorConfidenceDashboard] getResponseStrategy failed', err));
    return () => {
      cancelled = true;
    };
  }, [selectedProfile]);

  if (loading === 'loading') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-slate-300">
        Loading vendor confidence data…
      </div>
    );
  }

  if (loading === 'error') {
    return (
      <div className="rounded-xl border border-rose-600/40 bg-rose-900/20 p-6 text-rose-200">
        {error ?? 'Unable to load vendor confidence dashboard.'}
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-slate-300">
        Vendor confidence profiles will appear once vendors begin interacting with PO communications.
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border border-slate-800 bg-slate-950/30 p-6 shadow-xl shadow-black/30">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-accent-200">
            <ShieldCheckIcon className="h-4 w-4 text-accent-300" />
            Vendor Confidence
          </div>
          <p className="text-2xl font-semibold text-white">Signal-driven vendor automation guardrails</p>
          <p className="mt-1 text-sm text-slate-300">
            Average score {avgScore.toFixed(1)} / 10 · {profiles.length} tracked vendors
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <TrendLegend trend="improving" count={summaryTrendCounts.improving ?? 0} />
          <TrendLegend trend="stable" count={summaryTrendCounts.stable ?? 0} />
          <TrendLegend trend="declining" count={summaryTrendCounts.declining ?? 0} />
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        {profiles.map(profile => {
          const vendorLabel = profile.vendorName ?? `Vendor ${profile.vendorId.slice(0, 8)}`;
          return (
            <button
              key={profile.vendorId}
              type="button"
              onClick={() => setSelectedVendorId(profile.vendorId)}
              className={`flex flex-1 min-w-[220px] items-center justify-between rounded-xl border p-4 transition ${
                profile.vendorId === selectedVendorId
                  ? 'border-accent-400 bg-accent-500/10 text-white'
                  : 'border-slate-800/70 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="text-left">
                <p className="text-sm font-semibold">{vendorLabel}</p>
                <p className="text-xs text-slate-400">Confidence {profile.confidenceScore.toFixed(1)}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {TREND_ICON[profile.trend]}
                {profile.trend === 'improving' && <span className="text-emerald-300">Improving</span>}
                {profile.trend === 'stable' && <span>Stable</span>}
                {profile.trend === 'declining' && <span className="text-rose-300">Declining</span>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedProfile && (
        <section className="space-y-6 rounded-xl border border-slate-800/80 bg-slate-900/50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <ConfidenceGauge value={selectedProfile.confidenceScore} size={140} />
              <div>
                {selectedProfile.vendorName && (
                  <p className="text-sm font-semibold text-white">{selectedProfile.vendorName}</p>
                )}
                <p className="text-xs uppercase tracking-widest text-slate-400">Composite Score</p>
                <p className="text-4xl font-bold text-white">{selectedProfile.confidenceScore.toFixed(1)}</p>
                <div className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${communicationsStatusClass}`}>
                  {selectedProfile.communicationStatus.replace(/_/g, ' ')}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Template strictness: <span className="capitalize text-white">{selectedProfile.templateStrictness}</span>
                </p>
              </div>
            </div>
            <div className="text-right text-sm text-slate-300">
              <p>Last recalculated</p>
              <p className="text-xs text-slate-400">
                {selectedProfile.lastRecalculatedAt
                  ? new Date(selectedProfile.lastRecalculatedAt).toLocaleString()
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedProfile.interactionsCount} interactions analyzed
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Confidence Trend (90 days)</p>
                {detailLoading && <span className="text-xs text-slate-500">Updating…</span>}
              </div>
              <Sparkline history={history} />
              <p className="text-xs text-slate-400">
                30-day delta:{' '}
                <span
                  className={
                    selectedProfile.score30DaysAgo && selectedProfile.confidenceScore < selectedProfile.score30DaysAgo
                      ? 'text-rose-300'
                      : 'text-emerald-300'
                  }
                >
                  {selectedProfile.score30DaysAgo
                    ? (selectedProfile.confidenceScore - selectedProfile.score30DaysAgo).toFixed(2)
                    : 'N/A'}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Automation Strategy</p>
                {strategy && (
                  <span className="text-xs uppercase tracking-widest text-slate-400">
                    {strategy.strictness} · {strategy.tone}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-300">
                {strategy
                  ? `Use a ${strategy.tone} tone with ${strategy.strictness} template guidance.`
                  : 'Gather more interactions to unlock automation strategy suggestions.'}
              </p>
              {strategy && strategy.reminders.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm text-slate-400">
                  {strategy.reminders.map(reminder => (
                    <li key={reminder} className="flex items-center gap-2">
                      <CheckCircleIcon className="h-4 w-4 text-accent-300" />
                      {reminder}
                    </li>
                  ))}
                </ul>
              )}
              {strategy?.requiresManagerReview && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Manager review required for outbound messages to this vendor.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            {FACTOR_LABELS.map(factor => {
              const rawValue = selectedProfile[factor.key];
              const numericValue = typeof rawValue === 'number' ? rawValue : 0;
              return <FactorCard key={factor.key} label={factor.label} value={numericValue} weight={factor.weight} />;
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 lg:col-span-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Recent Interactions</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedVendorId(selectedVendorId)}
                  className="text-xs text-accent-300"
                >
                  Refresh
                </Button>
              </div>
              {events.length === 0 && <p className="text-sm text-slate-400">No tracked interactions yet.</p>}
              <ul className="space-y-3">
                {events.map(event => (
                  <li key={event.id} className="rounded-lg border border-slate-800/70 bg-slate-900/50 p-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="uppercase tracking-wide text-slate-300">{event.eventType.replace(/_/g, ' ')}</span>
                      <span>{new Date(event.occurredAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                      {event.responseLatencyMinutes != null && (
                        <span>Latency: {(event.responseLatencyMinutes / 60).toFixed(1)} hrs</span>
                      )}
                      {event.isThreaded != null && <span>Threaded: {event.isThreaded ? 'Yes' : 'No'}</span>}
                      {event.invoiceVariancePercent != null && (
                        <span className={event.invoiceVariancePercent > 0 ? 'text-rose-300' : undefined}>
                          Variance: {event.invoiceVariancePercent.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 lg:col-span-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <InformationCircleIcon className="h-4 w-4 text-accent-300" />
                Recommendations
              </div>
              <ul className="space-y-3 text-sm text-slate-200">
                {recommendations.map(rec => (
                  <li key={rec.heading} className="rounded-lg border border-slate-800/70 bg-slate-900/60 p-3">
                    <p className="font-semibold text-white">{rec.heading}</p>
                    <p className="text-xs text-slate-400">{rec.description}</p>
                  </li>
                ))}
              </ul>
              {selectedProfile?.confidenceScore != null && selectedProfile.confidenceScore < 4 && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  <ExclamationTriangleIcon className="mr-2 inline h-4 w-4" />
                  Score dropped below 4 — escalate responses to manager review.
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

const TrendLegend: React.FC<{ trend: VendorConfidenceTrend; count: number }> = ({ trend, count }) => {
  return (
    <div className="flex items-center gap-1">
      {TREND_ICON[trend]}
      <span className="capitalize text-slate-200">{trend}</span>
      <span className="text-slate-400">{count}</span>
    </div>
  );
};

const ConfidenceGauge: React.FC<{ value: number; size?: number }> = ({ value, size = 120 }) => {
  const percentage = Math.max(0, Math.min(100, (value / 10) * 100));
  const color = value >= 8 ? '#34d399' : value >= 6 ? '#60a5fa' : value >= 4 ? '#f59e0b' : '#f87171';

  return (
    <div
      className="relative flex items-center justify-center rounded-full bg-slate-900"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${percentage}%, rgba(15,23,42,0.5) ${percentage}%)`,
      }}
    >
      <div className="absolute flex h-[70%] w-[70%] items-center justify-center rounded-full bg-slate-950 text-center text-xs text-slate-400 shadow-inner shadow-black/70">
        Confidence
      </div>
    </div>
  );
};

const Sparkline: React.FC<{ history: VendorConfidenceHistoryPoint[] }> = ({ history }) => {
  if (history.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">No trend data available yet.</p>;
  }

  const width = 400;
  const height = 120;
  const scores = history.map(point => point.confidenceScore);
  const minScore = Math.min(...scores, 0);
  const maxScore = Math.max(...scores, 10);
  const points = history.map((point, index) => {
    const x = (index / (history.length - 1)) * width;
    const y = height - ((point.confidenceScore - minScore) / (maxScore - minScore + 0.1)) * height;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-28 w-full">
      <polyline
        fill="none"
        stroke="#818cf8"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(' ')}
      />
    </svg>
  );
};

const FactorCard: React.FC<{ label: string; value: number; weight: number }> = ({ label, value, weight }) => {
  const normalized = Math.max(0, Math.min(10, value));
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold text-white">{normalized.toFixed(1)}</p>
      <div className="mt-2 h-2 rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-400 to-emerald-400"
          style={{ width: `${(normalized / 10) * 100}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">{Math.round(weight * 100)}% weight</p>
    </div>
  );
};

export default VendorConfidenceDashboard;
