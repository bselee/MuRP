import { supabase } from '../lib/supabase/client';
import type {
  VendorConfidenceProfile,
  VendorConfidenceHistoryPoint,
  VendorInteractionEvent,
  VendorResponseStrategy,
  VendorResponseTemplateStrictness,
} from '../types';

export interface VendorConfidenceFilterOptions {
  minScore?: number;
  status?: VendorConfidenceProfile['communicationStatus'];
  vendorId?: string;
  search?: string;
  limit?: number;
}

export interface VendorConfidenceRecommendation {
  heading: string;
  description: string;
}

const DEFAULT_LIMIT = 200;

const STRATEGY_LOOKUP: Array<{
  minScore: number;
  strictness: VendorResponseTemplateStrictness;
  tone: VendorResponseStrategy['tone'];
  reminders: string[];
  requiresManagerReview: boolean;
}> = [
  {
    minScore: 8,
    strictness: 'relaxed',
    tone: 'friendly',
    reminders: [],
    requiresManagerReview: false,
  },
  {
    minScore: 6,
    strictness: 'standard',
    tone: 'professional',
    reminders: ['Reference PO number', 'Remind threading expectations'],
    requiresManagerReview: false,
  },
  {
    minScore: 4,
    strictness: 'strict',
    tone: 'formal',
    reminders: ['Explicit PO reference', 'Request explicit confirmation'],
    requiresManagerReview: true,
  },
  {
    minScore: 2,
    strictness: 'maximum',
    tone: 'formal',
    reminders: ['Escalate to manager', 'Highlight next steps', 'Request acknowledgement'],
    requiresManagerReview: true,
  },
  {
    minScore: -1,
    strictness: 'maximum',
    tone: 'formal',
    reminders: ['Escalate immediately', 'Require manager approval'],
    requiresManagerReview: true,
  },
];

export async function getVendorConfidenceProfile(vendorId: string): Promise<VendorConfidenceProfile | null> {
  const { data, error } = await supabase
    .from('vendor_confidence_profiles')
    .select('*')
    .eq('vendor_id', vendorId)
    .single();

  if (error) {
    console.error('[vendorConfidenceService] getVendorConfidenceProfile failed', error);
    return null;
  }

  return mapProfileRow(data);
}

export async function getAllVendorConfidenceProfiles(
  options?: VendorConfidenceFilterOptions,
): Promise<VendorConfidenceProfile[]> {
  let query = supabase
    .from('vendor_confidence_profiles')
    .select('*, vendors:vendor_id(id, name)')
    .order('confidence_score', { ascending: false })
    .limit(options?.limit ?? DEFAULT_LIMIT);

  if (options?.minScore !== undefined) {
    query = query.gte('confidence_score', options.minScore);
  }
  if (options?.status) {
    query = query.eq('communication_status', options.status);
  }
  if (options?.vendorId) {
    query = query.eq('vendor_id', options.vendorId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[vendorConfidenceService] getAllVendorConfidenceProfiles failed', error);
    throw error;
  }
  const mapped = (data || []).map(mapProfileRow);

  if (options?.search) {
    const searchLower = options.search.toLowerCase();
    return mapped.filter(profile => profile.vendorName?.toLowerCase().includes(searchLower));
  }

  return mapped;
}

export async function getVendorConfidenceHistory(
  vendorId: string,
  limit = 90,
): Promise<VendorConfidenceHistoryPoint[]> {
  const { data, error } = await supabase
    .from('vendor_confidence_history')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[vendorConfidenceService] getVendorConfidenceHistory failed', error);
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    vendorId: row.vendor_id,
    confidenceScore: Number(row.confidence_score),
    recordedAt: row.recorded_at,
    responseLatencyScore: row.response_latency_score,
    threadingScore: row.threading_score,
    completenessScore: row.completeness_score,
    invoiceAccuracyScore: row.invoice_accuracy_score,
    leadTimeScore: row.lead_time_score,
    communicationStatus: row.communication_status ?? undefined,
  }));
}

export async function getRecentInteractionEvents(
  vendorId: string,
  limit = 10,
): Promise<VendorInteractionEvent[]> {
  const { data, error } = await supabase
    .from('vendor_interaction_events')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[vendorConfidenceService] getRecentInteractionEvents failed', error);
    throw error;
  }

  return (data || []).map(mapEventRow);
}

export async function recordInteractionEvent(event: Omit<VendorInteractionEvent, 'id' | 'occurredAt'>): Promise<boolean> {
  const payload = {
    vendor_id: event.vendorId,
    po_id: event.poId ?? null,
    event_type: event.eventType,
    response_latency_minutes: event.responseLatencyMinutes ?? null,
    is_threaded: event.isThreaded ?? null,
    extraction_confidence: event.extractionConfidence ?? null,
    invoice_variance_percent: event.invoiceVariancePercent ?? null,
    delivered_on_time: event.deliveredOnTime ?? null,
    payload: event.payload ?? null,
    trigger_source: event.triggerSource ?? null,
  };

  const { error } = await supabase.from('vendor_interaction_events').insert(payload);
  if (error) {
    console.error('[vendorConfidenceService] recordInteractionEvent failed', error);
    return false;
  }
  return true;
}

export async function recalculateVendorScore(vendorId: string, triggerSource?: string): Promise<void> {
  const { error } = await supabase.rpc('refresh_vendor_confidence_profile', {
    vendor_id: vendorId,
    trigger_source: triggerSource ?? null,
  });
  if (error) {
    console.error('[vendorConfidenceService] recalculateVendorScore failed', error);
    throw error;
  }
}

export function calculateResponseLatencyScore(events: VendorInteractionEvent[]): number {
  const latencies = events
    .map(event => event.responseLatencyMinutes)
    .filter((lat): lat is number => typeof lat === 'number' && lat >= 0);
  if (latencies.length === 0) return 5;
  const avgMinutes = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;

  if (avgMinutes <= 240) return 10;
  if (avgMinutes <= 480) return 9;
  if (avgMinutes <= 1440) return 7;
  if (avgMinutes <= 2880) return 5;
  if (avgMinutes <= 4320) return 3;
  return 1;
}

export function calculateThreadingScore(events: VendorInteractionEvent[]): number {
  const relevant = events.filter(event => typeof event.isThreaded === 'boolean');
  if (relevant.length === 0) return 5;
  const ratio = relevant.filter(event => event.isThreaded).length / relevant.length;
  if (ratio >= 0.95) return 10;
  if (ratio >= 0.85) return 8;
  if (ratio >= 0.70) return 6;
  if (ratio >= 0.50) return 4;
  return 2;
}

export function calculateCompletenessScore(events: VendorInteractionEvent[]): number {
  const confidences = events
    .map(event => event.extractionConfidence)
    .filter((value): value is number => typeof value === 'number');
  if (confidences.length === 0) return 5;
  const avgConfidence = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  return Math.max(0, Math.min(10, Number((avgConfidence * 10).toFixed(2))));
}

export function calculateInvoiceAccuracyScore(events: VendorInteractionEvent[]): number {
  const variances = events
    .map(event => event.invoiceVariancePercent)
    .filter((value): value is number => typeof value === 'number');
  if (variances.length === 0) return 5;
  const avgVariancePercent = variances.reduce((sum, value) => sum + Math.abs(value), 0) / variances.length;

  if (avgVariancePercent <= 0) return 10;
  if (avgVariancePercent <= 10) return 8;
  if (avgVariancePercent <= 30) return 6;
  if (avgVariancePercent <= 50) return 4;
  return 2;
}

export function calculateLeadTimeScore(events: VendorInteractionEvent[]): number {
  const relevant = events.filter(event => typeof event.deliveredOnTime === 'boolean');
  if (relevant.length === 0) return 5;
  const ratio = relevant.filter(event => event.deliveredOnTime).length / relevant.length;
  if (ratio >= 0.95) return 10;
  if (ratio >= 0.85) return 8;
  if (ratio >= 0.70) return 6;
  if (ratio >= 0.50) return 4;
  return 2;
}

export function getResponseStrategyForVendor(vendorId: string): Promise<VendorResponseStrategy>;
export function getResponseStrategyForVendor(profile: VendorConfidenceProfile | null): VendorResponseStrategy;
export function getResponseStrategyForVendor(
  arg: string | VendorConfidenceProfile | null,
): VendorResponseStrategy | Promise<VendorResponseStrategy> {
  if (typeof arg === 'string') {
    return getVendorConfidenceProfile(arg).then(profile => getResponseStrategyForVendor(profile));
  }

  const profile = arg;
  const score = profile?.confidenceScore ?? 5;

  const strategy = STRATEGY_LOOKUP.find(item => score >= item.minScore) ?? STRATEGY_LOOKUP[STRATEGY_LOOKUP.length - 1];
  return {
    strictness: strategy.strictness,
    tone: strategy.tone,
    reminders: strategy.reminders,
    requiresManagerReview: strategy.requiresManagerReview,
  };
}

export function buildRecommendations(profile?: VendorConfidenceProfile | null): VendorConfidenceRecommendation[] {
  if (!profile) {
    return [
      { heading: 'Not enough data', description: 'Record at least 5 vendor interactions to unlock recommendations.' },
    ];
  }

  const recs: VendorConfidenceRecommendation[] = [];
  if (profile.responseLatencyScore < 6) {
    recs.push({
      heading: 'Slow responses',
      description: 'Consider scheduling proactive nudges 12 hours after PO delivery.',
    });
  }
  if (profile.threadingScore < 6) {
    recs.push({
      heading: 'Threading reminders',
      description: 'Auto-insert threading reminder in email templates until behaviour improves.',
    });
  }
  if (profile.invoiceAccuracyScore < 7) {
    recs.push({
      heading: 'Invoice variances detected',
      description: 'Route invoices for this vendor through manual review until accuracy improves.',
    });
  }
  if (recs.length === 0) {
    recs.push({
      heading: 'Great performance',
      description: 'This vendor can run in relaxed automation mode. Continue monitoring monthly.',
    });
  }
  return recs;
}

function mapProfileRow(row: any): VendorConfidenceProfile {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorName: row.vendors?.name ?? row.vendor_name ?? undefined,
    confidenceScore: Number(row.confidence_score ?? 0),
    responseLatencyScore: Number(row.response_latency_score ?? 0),
    threadingScore: Number(row.threading_score ?? 0),
    completenessScore: Number(row.completeness_score ?? 0),
    invoiceAccuracyScore: Number(row.invoice_accuracy_score ?? 0),
    leadTimeScore: Number(row.lead_time_score ?? 0),
    trend: row.trend,
    score30DaysAgo: row.score_30_days_ago,
    recommendedLeadTimeBufferDays: Number(row.recommended_lead_time_buffer_days ?? 0),
    templateStrictness: row.template_strictness ?? 'standard',
    communicationStatus: row.communication_status,
    interactionsCount: Number(row.interactions_count ?? 0),
    lastRecalculatedAt: row.last_recalculated_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(row: any): VendorInteractionEvent {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    poId: row.po_id,
    eventType: row.event_type,
    responseLatencyMinutes: row.response_latency_minutes ? Number(row.response_latency_minutes) : undefined,
    isThreaded: typeof row.is_threaded === 'boolean' ? row.is_threaded : undefined,
    extractionConfidence: row.extraction_confidence ? Number(row.extraction_confidence) : undefined,
    invoiceVariancePercent: row.invoice_variance_percent ? Number(row.invoice_variance_percent) : undefined,
    deliveredOnTime: typeof row.delivered_on_time === 'boolean' ? row.delivered_on_time : undefined,
    payload: row.payload ?? undefined,
    triggerSource: row.trigger_source ?? undefined,
    occurredAt: row.occurred_at,
  };
}
