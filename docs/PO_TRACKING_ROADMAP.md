# PO Tracking Roadmap

## Phase 1 – Manual Tracking (Free)
- Fields added to `purchase_orders` for carrier, tracking number, and status.
- Users can enter/update tracking info via the PO modal or edit forms.
- `po_tracking_events` table captures manual updates for auditing.
- `POTrackingDashboard` surfaces current status and last check timestamps.

## Phase 2 – Email Parsing (~$1–2/mo)
- Reuse existing AI email parser to extract tracking numbers + carriers from vendor replies.
- When Gmail webhook receives a reply, call `parseVendorEmail()` and hydrate tracking fields.
- Auto-create `po_tracking_events` entries for extracted milestones.

## Phase 3 – Carrier APIs (~$10–20/mo)
- Deploy `po-tracking-updater` edge function (hourly) to poll carriers via AfterShip/Shippo or native APIs.
- Normalize responses into `tracking_status`, `tracking_estimated_delivery`, and events.
- Raise Slack/Teams notifications on delivered or exception states.

## Phase 4 – Full Automation (Custom)
- Vendor portal scraping through MCP server for carriers without APIs.
- Predictive ETA blend (carrier API + historic lead time + AI).
- Automated exception workflows (assign owner, escalate in Slack, open task).

## Notifications
- Slack / Teams templates:
  - `PO #12345 shipped! Tracking 1Z999AA10123456784 (UPS)`
  - `⚠️ PO #12346 delayed – expected delivery now Nov 25`
  - `✅ PO #12347 delivered and received`

## TODO
- [x] Hook Gmail webhook to AI parsing (with PDF OCR) for auto tracking capture.
- [x] Wire AfterShip credentials into the tracking edge function (fallback to stub while expanding carriers).
- [ ] Render timeline detail (events) in `POTrackingDashboard`.
- [ ] Build bulk export (CSV) of tracking history.
- [ ] Add Slack/Teams webhooks for delivery + exception notifications.
