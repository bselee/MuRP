# ShipStation API Integration Plan

## Overview

Integrate ShipStation as a **real-time tracking source** that complements the existing AfterShip polling and Email Tracking Agent. ShipStation provides webhooks for instant updates when shipments are created or tracking events occur.

## Goals

1. **Real-time tracking updates** via ShipStation webhooks (faster than email or polling)
2. **Correlate ShipStation shipments with POs** using order IDs and tracking numbers
3. **Feed ShipStation data into Email Thread Intelligence** for unified tracking view
4. **Enhance stockout prevention** with real-time ETA updates

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       TRACKING DATA SOURCES                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │ ShipStation │    │   Email     │    │      AfterShip          │ │
│  │  Webhooks   │    │  Tracking   │    │      Polling            │ │
│  │  (NEW)      │    │   Agent     │    │    (existing)           │ │
│  └──────┬──────┘    └──────┬──────┘    └───────────┬─────────────┘ │
│         │                  │                       │               │
│         ▼                  ▼                       ▼               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │           UNIFIED TRACKING INTELLIGENCE LAYER                │  │
│  │                                                              │  │
│  │  • po_shipment_data (tracking numbers, carriers, ETAs)       │  │
│  │  • shipment_tracking_events (audit trail)                    │  │
│  │  • email_threads (correlated threads with tracking)          │  │
│  │  • shipstation_sync_log (new - ShipStation webhook history)  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              STOCKOUT PREVENTION LOOP                        │  │
│  │                                                              │  │
│  │  • poIntelligenceAgent (email-enhanced predictions)          │  │
│  │  • stockoutPreventionAgent (real-time alerts)                │  │
│  │  • Air Traffic Controller (delay impact assessment)          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## ShipStation API Overview

### Authentication
- **Type**: Basic HTTP Auth
- **Credentials**: API Key (username) + API Secret (password)
- **Base URL**: `https://ssapi.shipstation.com/`

### Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/orders` | GET | List orders with shipment data |
| `/orders/{orderId}` | GET | Get order with tracking |
| `/shipments` | GET | List shipments with tracking |
| `/shipments/{shipmentId}` | GET | Get shipment details |
| `/webhooks/subscribe` | POST | Subscribe to webhook events |
| `/webhooks` | GET | List webhook subscriptions |

### Webhook Events

| Event | Trigger | Use Case |
|-------|---------|----------|
| `ORDER_NOTIFY` | New order created | Sync orders to MuRP |
| `SHIP_NOTIFY` | Label created/shipped | Get tracking number instantly |
| `ITEM_SHIP_NOTIFY` | Item shipped | Partial shipment tracking |

### Webhook Payload Structure
```json
{
  "resource_url": "https://ssapi.shipstation.com/orders?orderNumber=12345",
  "resource_type": "ORDER_NOTIFY"
}
```
**Note**: Webhook delivers a `resource_url` - must make GET request to retrieve full data.

## Implementation Plan

### Phase 1: Core ShipStation Service

**File**: `services/shipStationService.ts`

```typescript
// Core capabilities:
- ShipStation API client with auth
- Fetch orders with shipments
- Fetch shipments by tracking number
- Subscribe/manage webhooks
- Rate limit handling (429 backoff)
```

### Phase 2: Webhook Handler

**File**: `supabase/functions/shipstation-webhook/index.ts`

```typescript
// Webhook handler:
1. Verify signature (RSA-SHA256)
2. Parse resource_url from payload
3. Fetch full data from ShipStation API
4. Correlate with PO using order number or tracking
5. Update po_shipment_data
6. Update email_threads if correlated
7. Create shipment_tracking_events
8. Trigger Air Traffic Controller for delays
```

### Phase 3: Email Thread Correlation

**Integration Points**:
- When ShipStation provides tracking, search email_threads for matching tracking number
- Link ShipStation shipment to email thread for unified view
- Use ShipStation ETA as `email_threads.latest_eta` if more recent
- Mark thread as having tracking info

### Phase 4: Stockout Prevention Integration

**Enhancements**:
- ShipStation updates feed into `poIntelligenceAgent.getArrivalPredictions()`
- Real-time ETA changes trigger delay impact assessment
- ShipStation exceptions create EMAIL_DELAY_NOTICE alerts

## Database Changes

### Migration: `102_shipstation_integration.sql`

```sql
-- ShipStation configuration in app_settings
INSERT INTO app_settings (setting_key, setting_value) VALUES
('shipstation_config', '{
  "enabled": false,
  "apiKey": null,
  "apiSecret": null,
  "webhookSecret": null,
  "syncOrders": true,
  "syncShipments": true,
  "autoCorrelate": true
}'::jsonb);

-- ShipStation sync log for deduplication and audit
CREATE TABLE shipstation_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipstation_order_id TEXT,
  shipstation_shipment_id TEXT,
  po_id UUID REFERENCES purchase_orders(id),
  thread_id UUID REFERENCES email_threads(id),
  event_type TEXT,
  resource_url TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT now(),
  correlation_method TEXT,
  correlation_confidence DECIMAL(3,2)
);

-- Index for deduplication
CREATE UNIQUE INDEX idx_shipstation_sync_order_event
  ON shipstation_sync_log(shipstation_order_id, event_type)
  WHERE shipstation_order_id IS NOT NULL;
```

## API Integration Details

### Fetching Orders with Shipments
```typescript
GET /orders?orderStatus=shipped&sortBy=ShipDate&sortDir=DESC
Authorization: Basic base64(apiKey:apiSecret)

Response includes:
- orderNumber (correlate with PO)
- shipments[].trackingNumber
- shipments[].carrierCode
- shipments[].shipDate
- shipments[].shipTo (delivery address)
```

### Fetching Shipment Details
```typescript
GET /shipments?trackingNumber={tracking}
Authorization: Basic base64(apiKey:apiSecret)

Response includes:
- trackingNumber
- carrierCode
- shipDate
- deliveryDate (actual or estimated)
- shipmentCost
- shipmentItems[]
```

### Subscribing to Webhooks
```typescript
POST /webhooks/subscribe
{
  "target_url": "https://your-app.com/api/shipstation-webhook",
  "event": "SHIP_NOTIFY",
  "store_id": null, // null = all stores
  "friendly_name": "MuRP Tracking Integration"
}
```

## Correlation Strategy

### Order Number Matching
1. ShipStation `orderNumber` → MuRP `purchase_orders.order_id`
2. Match by vendor name + date if order number differs

### Tracking Number Matching
1. ShipStation tracking → `po_shipment_data.tracking_numbers`
2. ShipStation tracking → `email_threads.tracking_numbers`
3. ShipStation tracking → `email_thread_messages.extracted_tracking_number`

### Vendor Domain Matching
1. ShipStation `orderNumber` format analysis
2. Match vendor from shipping address or notes

## Settings UI

### ShipStation Configuration Panel

```typescript
// In components/APIIntegrationsPanel.tsx or new ShipStationSettingsPanel.tsx

Settings:
- [ ] Enable ShipStation Integration
- API Key: [__________]
- API Secret: [__________]
- Webhook URL: (auto-generated, read-only)
- [ ] Auto-correlate with POs
- [ ] Auto-correlate with Email Threads
- [ ] Sync historical orders (last 30 days)

Actions:
- [Test Connection]
- [Sync Now]
- [View Sync Log]
```

## Implementation Order

1. **Migration** - `102_shipstation_integration.sql`
2. **Service** - `services/shipStationService.ts`
3. **Webhook** - `supabase/functions/shipstation-webhook/index.ts`
4. **Email Integration** - Update `emailInboxManager.ts` to check ShipStation
5. **Stockout Integration** - Update `poIntelligenceAgent.ts` to use ShipStation data
6. **Settings UI** - Update `APIIntegrationsPanel.tsx`
7. **Dashboard** - Add ShipStation status to EmailStockoutIntelligenceWidget

## Security Considerations

1. **Signature Verification**: Verify RSA-SHA256 signature on all webhooks
2. **API Secret Storage**: Store in Supabase encrypted settings
3. **Rate Limiting**: Implement exponential backoff for 429 responses
4. **Webhook URL**: Use HTTPS endpoint with random token

## Testing Plan

1. **Unit Tests**: ShipStation API client methods
2. **Webhook Tests**: Mock webhook payloads
3. **Correlation Tests**: PO matching accuracy
4. **Integration Tests**: End-to-end tracking flow
5. **Load Tests**: Handle high webhook volume

## Success Metrics

- **Tracking discovery time**: < 5 minutes from shipment (vs hours via email)
- **Correlation accuracy**: > 95% automatic PO matching
- **Alert latency**: Real-time delay detection
- **Data completeness**: 100% shipments captured

## References

- [ShipStation API Documentation](https://www.shipstation.com/docs/api/)
- [ShipStation Webhooks Guide](https://help.shipstation.com/hc/en-us/articles/360025856252)
- [ShipStation API Essentials](https://rollout.com/integration-guides/shipstation/api-essentials)
