# PO Tracking – Live Reality Snapshot

_Last audit: 2025-01-17_

This document merges the original **Roadmap** and **Implementation Plan** into a single view of what’s actually shipping today, what switches are available in the app, and which gaps remain.

---

## ✅ What’s Live Right Now

| Capability | Details | Where to see it |
|------------|---------|-----------------|
| Manual + AI-assisted tracking capture | Purchasing can edit carrier / tracking metadata via `UpdateTrackingModal`, while vendor replies flowing through the Gmail webhook auto-create `po_tracking_events` entries. | `components/UpdateTrackingModal.tsx`, `supabase/functions/gmail-webhook` |
| AfterShip polling (optional) | Configurable via **Settings → Integrations → AfterShip Tracking**. Stores credentials in `app_settings.aftership_config` and feeds the `po-tracking-updater` edge function. | `components/APIIntegrationsPanel.tsx`, `supabase/functions/po-tracking-updater` |
| Dashboard visibility | `POTrackingDashboard` surfaces status chips, ETA, last refresh time, plus the new **Timeline** drawer (reads `po_tracking_events`) and **CSV export** (calls `fetchTrackingHistoryRows`). | `components/POTrackingDashboard.tsx`, `services/poTrackingService.ts` |
| Purchasing-only Slack alerts | Disabled by default. When enabled in Settings → “Purchasing Alerts (Slack)”, only the purchasing webhook/mention receives notifications for selected statuses (exception/delivered/etc). | `components/APIIntegrationsPanel.tsx`, `services/poTrackingService.ts` |
| Audit trail & exports | Every status change inserts into `po_tracking_events`, giving a verifiable audit log that backs the timeline UI and CSV output. | `services/poTrackingService.ts`, `supabase/migrations/030_po_tracking.sql` |

---

## 🧩 Config & Controls

| Area | Setting | Notes / Defaults |
|------|---------|------------------|
| Slack notifications | `app_settings.po_tracking_notifications` | `enabled: false` until purchasing flips the switch. Requires a Slack webhook + optional mention. |
| AfterShip | `app_settings.aftership_config` | Supports preset or custom carrier slug, secure API key storage, and a “reset” option in the UI. |
| Follow-up cadence | `components/FollowUpSettingsPanel.tsx` + Supabase `po_followup_settings` | Drives Stage 1–3 reminder intervals used by `po-followup-runner`. |
| Gmail threading | Stored per PO (`vendor_response_thread_id`, etc.) | Keeps AI replies + manual verification tethered to the originating order. |

---

## 🔍 Verification Checklist

Use this when validating a PO workflow end-to-end:

1. **Send PO** – ensure `purchase_orders.tracking_status = 'awaiting_confirmation'`.
2. **Vendor replies** – confirm Gmail webhook logs an entry in `po_vendor_communications` and inserts an event in `po_tracking_events`.
3. **Manual verification** – edit via Update Tracking modal; check that status change inserts another timeline row.
4. **Dashboard review** – load `POTrackingDashboard`, click **Timeline** to inspect events, then export CSV to confirm the audit trail.
5. **Slack opt-in (optional)** – toggle alerts on, select statuses (e.g. `exception`, `delivered`), run a test by force-updating a PO to delivered; verify only the purchasing channel receives the ping.

---

## 🚧 Backlog / Still Planned

| Item | Gap it covers | Status |
|------|---------------|--------|
| Vendor escalation tasks & call queue | Original Plan Gap #2 | Not built yet – relies on `po_escalation_queue` view + task routing. |
| AP-side landed cost integration | Plan Gap #5 | Pending – requires invoice parser to push freight/fees into a GL staging table. |
| Forecast-assisted ETAs | Plan Gap #6 | Pending – would blend carrier ETA + historic lead time + AI forecast. |
| Manual receiving workflow | Plan addendum | Not started – needs a verification modal before inventory adjustments. |

---

## 📎 References

- **Schema**: `supabase/migrations/030_po_tracking.sql` (events + overview view)
- **Notifications**: `services/poTrackingService.ts` (event logging + Slack/Teams hooks)
- **UI**: `components/POTrackingDashboard.tsx`, `components/APIIntegrationsPanel.tsx`
- **Edge Functions**: `supabase/functions/po-tracking-updater`, `supabase/functions/gmail-webhook`

This snapshot should replace the duplicated content in `PO_TRACKING_ROADMAP.md` and `PO_TRACKING_IMPLEMENTATION_PLAN.md`; both now defer to this document for current-state truth.
