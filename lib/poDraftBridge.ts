export type PoDraftBridgePayload = Array<{
  vendorId?: string;
  vendorLocked?: boolean;
  items?: Array<{ sku: string; name: string; quantity: number; unitCost: number }>;
  expectedDate?: string;
  notes?: string;
  requisitionIds?: string[];
  sourceLabel?: string;
  trackingNumber?: string;
  trackingCarrier?: string;
}>;

type Listener = (drafts: PoDraftBridgePayload) => void;

const listeners = new Set<Listener>();

export function enqueuePoDrafts(drafts: PoDraftBridgePayload) {
  listeners.forEach(listener => listener(drafts));
}

export function subscribeToPoDrafts(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
