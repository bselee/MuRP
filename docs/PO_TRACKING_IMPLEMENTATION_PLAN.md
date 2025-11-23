# Purchase Order Tracking - Complete Implementation Plan

> **Live status lives elsewhere:** For the up-to-date reality snapshot, verification checklist, and config references see `docs/PO_TRACKING_STATUS.md`. This file preserves the original end-to-end plan for historical/forward-looking detail.

**Date**: November 23, 2025  
**Status**: Implementation Roadmap  
**Priority**: High - Core operational automation

---

## 🎯 Executive Summary

This plan addresses critical gaps in PO tracking automation with focus on:
1. **Vendor communication escalation** (Gap 2) - Manual verification requirements
2. **Big Three carrier APIs + AfterShip** (Gap 4) - Real-time tracking automation
3. **AP integration with invoice/shipping cost tracking** (Gap 5) - Landed cost foundation
4. **Advanced forecasting intelligence** (Gap 6) - AI-powered demand prediction
5. **Manual receiving workflow** - Verification before inventory update

**Total Implementation**: 6-8 weeks  
**Estimated Monthly Cost**: $35-50 (carrier APIs + AI usage)  
**ROI**: 20+ hours/week saved, 95%+ inventory accuracy

---

## 📋 Gap 2: Vendor Communication Escalation System

### Problem Statement
- Vendors don't respond to initial PO emails
- Follow-ups sent manually (2-3 attempts typical)
- Vendor responds in separate email thread → hard to correlate
- No automated verification workflow before shipping

### Solution Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PO SENT → Email Tracking ID Saved                          │
│  Gmail API watches thread for vendor reply                  │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  NO RESPONSE IN 48HRS                                        │
│  → Auto-send Follow-up #1 (Stage 1)                         │
│  → Update follow_up_count, last_follow_up_sent_at           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  STILL NO RESPONSE IN 48HRS                                  │
│  → Auto-send Follow-up #2 (Stage 2, different template)     │
│  → Escalate: Notify purchasing manager                      │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  STILL NO RESPONSE IN 24HRS                                  │
│  → Follow-up #3 (Stage 3, urgent tone)                      │
│  → CREATE TASK: "Call vendor about PO-123"                  │
│  → Slack alert to #purchasing-urgent                        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  VENDOR RESPONDS (any thread)                                │
│  → AI correlates email to PO via order number/context       │
│  → Extract: confirmation, tracking, ship date, issues       │
│  → UPDATE: followUpStatus = 'vendor_responded'              │
│  → REQUIRE: Manual verification by purchasing               │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  MANUAL VERIFICATION MODAL                                   │
│  Shows: Vendor response summary, extracted tracking         │
│  Actions:                                                    │
│    ✓ Confirm details correct → Mark as verified             │
│    ✓ Add tracking number                                    │
│    ✓ Adjust ship date                                       │
│    ✗ Reject/Request clarification → Sends reply             │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema Updates

```sql
-- Migration 041: Vendor Communication Escalation
CREATE TYPE vendor_response_status AS ENUM (
  'pending_response',
  'vendor_responded',
  'verified_confirmed',
  'verified_with_issues',
  'requires_clarification',
  'vendor_non_responsive',
  'cancelled'
);

ALTER TABLE purchase_orders
  ADD COLUMN follow_up_status vendor_response_status DEFAULT 'pending_response',
  ADD COLUMN vendor_response_received_at TIMESTAMPTZ,
  ADD COLUMN vendor_response_email_id TEXT,
  ADD COLUMN vendor_response_thread_id TEXT,
  ADD COLUMN vendor_response_summary JSONB,
  ADD COLUMN verification_required BOOLEAN DEFAULT TRUE,
  ADD COLUMN verified_by UUID REFERENCES auth.users(id),
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN verification_notes TEXT,
  ADD COLUMN escalation_level INT DEFAULT 0, -- 0=none, 1=manager, 2=urgent, 3=critical
  ADD COLUMN next_follow_up_due_at TIMESTAMPTZ;

-- Track all vendor communications
CREATE TABLE po_vendor_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) NOT NULL,
  communication_type VARCHAR(50) NOT NULL, -- 'initial_send', 'follow_up', 'vendor_reply', 'clarification'
  stage INT, -- follow-up stage number
  direction VARCHAR(20) NOT NULL, -- 'outbound', 'inbound'
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  subject TEXT,
  body_preview TEXT,
  sender_email TEXT,
  recipient_email TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  
  -- AI extraction from vendor replies
  extracted_data JSONB, -- {tracking_number, carrier, ship_date, confirmation, issues}
  correlation_confidence NUMERIC(3,2), -- 0.00-1.00 AI confidence this email relates to this PO
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_po_comms_po_id ON po_vendor_communications(po_id);
CREATE INDEX idx_po_comms_thread_id ON po_vendor_communications(gmail_thread_id);
CREATE INDEX idx_po_comms_type ON po_vendor_communications(communication_type);

-- Escalation queue view
CREATE OR REPLACE VIEW po_escalation_queue AS
SELECT 
  po.id,
  po.order_id,
  po.vendor_id,
  v.name as vendor_name,
  po.follow_up_count,
  po.last_follow_up_sent_at,
  po.follow_up_status,
  po.escalation_level,
  po.next_follow_up_due_at,
  CASE 
    WHEN po.next_follow_up_due_at < NOW() THEN 'overdue'
    WHEN po.next_follow_up_due_at < NOW() + INTERVAL '4 hours' THEN 'due_soon'
    ELSE 'scheduled'
  END as urgency,
  EXTRACT(EPOCH FROM (NOW() - po.email_sent_at))/3600 as hours_since_sent,
  (SELECT COUNT(*) FROM po_vendor_communications 
   WHERE po_id = po.id AND direction = 'inbound') as vendor_reply_count
FROM purchase_orders po
JOIN vendors v ON v.id = po.vendor_id
WHERE po.email_sent = TRUE
  AND po.follow_up_status NOT IN ('verified_confirmed', 'cancelled')
  AND po.status IN ('sent', 'pending', 'confirmed')
ORDER BY 
  CASE po.escalation_level
    WHEN 3 THEN 1
    WHEN 2 THEN 2
    WHEN 1 THEN 3
    ELSE 4
  END,
  po.next_follow_up_due_at ASC NULLS LAST;
```

### Service Layer Implementation

```typescript
// services/vendorCommunicationService.ts

import { supabase } from '../lib/supabase/client';
import { parseVendorEmail } from './aiPurchasingService';
import { sendGmailMessage, getGmailThread } from './googleGmailService';

export interface VendorCommunication {
  id: string;
  po_id: string;
  communication_type: string;
  stage?: number;
  direction: 'outbound' | 'inbound';
  gmail_message_id?: string;
  gmail_thread_id?: string;
  subject: string;
  body_preview: string;
  sender_email: string;
  recipient_email: string;
  sent_at?: string;
  received_at?: string;
  extracted_data?: any;
  correlation_confidence?: number;
}

export interface VendorResponseVerification {
  confirmed: boolean;
  tracking_number?: string;
  carrier?: string;
  estimated_ship_date?: string;
  issues?: string;
  verification_notes?: string;
}

/**
 * Process incoming vendor email and correlate to PO
 */
export async function processVendorReply(
  emailContent: string,
  senderEmail: string,
  gmailMessageId: string,
  gmailThreadId: string,
  receivedAt: string
): Promise<void> {
  // 1. Extract PO-related data using AI
  const parsed = await parseVendorEmail(emailContent);
  
  // 2. Find matching PO(s)
  const candidates = await findMatchingPOs(
    parsed.po_number,
    senderEmail,
    emailContent
  );
  
  for (const po of candidates) {
    const confidence = calculateCorrelationConfidence(po, parsed, senderEmail);
    
    if (confidence >= 0.7) { // High confidence match
      // 3. Record communication
      await recordVendorCommunication({
        po_id: po.id,
        communication_type: 'vendor_reply',
        direction: 'inbound',
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId,
        subject: 'Vendor response',
        body_preview: emailContent.substring(0, 500),
        sender_email: senderEmail,
        recipient_email: po.vendor_email,
        received_at: receivedAt,
        extracted_data: parsed,
        correlation_confidence: confidence,
      });
      
      // 4. Update PO status
      await supabase
        .from('purchase_orders')
        .update({
          follow_up_status: 'vendor_responded',
          vendor_response_received_at: receivedAt,
          vendor_response_email_id: gmailMessageId,
          vendor_response_thread_id: gmailThreadId,
          vendor_response_summary: parsed,
          verification_required: true,
          next_follow_up_due_at: null, // Cancel scheduled follow-ups
        })
        .eq('id', po.id);
      
      // 5. Notify purchasing team
      await createVerificationTask(po, parsed);
    }
  }
}

/**
 * Find POs that might match this email
 */
async function findMatchingPOs(
  poNumber: string | null,
  vendorEmail: string,
  emailContent: string
): Promise<any[]> {
  let query = supabase
    .from('purchase_orders')
    .select('*, vendors(*)')
    .eq('email_sent', true)
    .in('follow_up_status', ['pending_response', 'requires_clarification']);
  
  // Exact PO number match
  if (poNumber) {
    const { data } = await query.eq('order_id', poNumber);
    if (data && data.length > 0) return data;
  }
  
  // Match by vendor email domain
  const { data: vendorMatch } = await supabase
    .from('vendors')
    .select('id')
    .or(`purchase_email.ilike.%${vendorEmail.split('@')[1]}%,email.ilike.%${vendorEmail.split('@')[1]}%`);
  
  if (vendorMatch && vendorMatch.length > 0) {
    const vendorIds = vendorMatch.map(v => v.id);
    const { data } = await query.in('vendor_id', vendorIds);
    return data || [];
  }
  
  return [];
}

/**
 * Calculate confidence that email relates to PO
 */
function calculateCorrelationConfidence(
  po: any,
  parsedEmail: any,
  senderEmail: string
): number {
  let confidence = 0;
  
  // Exact PO number match
  if (parsedEmail.po_number === po.order_id) {
    confidence += 0.5;
  }
  
  // Vendor email domain match
  const vendorDomain = po.vendors?.purchase_email?.split('@')[1] || po.vendors?.email?.split('@')[1];
  if (vendorDomain && senderEmail.includes(vendorDomain)) {
    confidence += 0.3;
  }
  
  // Thread ID match (reply to our email)
  if (parsedEmail.gmail_thread_id === po.email_thread_id) {
    confidence += 0.2;
  }
  
  // Tracking number present
  if (parsedEmail.tracking_number) {
    confidence += 0.1;
  }
  
  return Math.min(confidence, 1.0);
}

/**
 * Create verification task for purchasing team
 */
async function createVerificationTask(po: any, parsedEmail: any): Promise<void> {
  await supabase.from('system_notifications').insert({
    channel: 'purchasing',
    severity: 'info',
    title: `Vendor Response: ${po.order_id}`,
    message: `${po.vendors?.name || 'Vendor'} responded. Verification required.`,
    action_url: `/purchase-orders?verify=${po.id}`,
    metadata: {
      po_id: po.id,
      order_id: po.order_id,
      vendor_name: po.vendors?.name,
      has_tracking: !!parsedEmail.tracking_number,
      extracted_data: parsedEmail,
    },
  });
}

/**
 * Manual verification by purchasing team
 */
export async function verifyVendorResponse(
  poId: string,
  userId: string,
  verification: VendorResponseVerification
): Promise<void> {
  const updates: any = {
    verified_by: userId,
    verified_at: new Date().toISOString(),
    verification_notes: verification.verification_notes,
    verification_required: false,
  };
  
  if (verification.confirmed) {
    updates.follow_up_status = 'verified_confirmed';
    
    // Update tracking if provided
    if (verification.tracking_number) {
      updates.tracking_number = verification.tracking_number;
      updates.tracking_carrier = verification.carrier || null;
      updates.tracking_status = 'confirmed';
    }
    
    // Update expected ship date
    if (verification.estimated_ship_date) {
      updates.estimated_receive_date = verification.estimated_ship_date;
    }
    
    // Update PO status
    if (updates.tracking_number) {
      updates.status = 'confirmed';
    }
  } else {
    // Requires clarification
    updates.follow_up_status = 'requires_clarification';
    updates.verification_required = true;
    
    // Will trigger another follow-up with specific questions
    await scheduleFollowUp(poId, {
      stage: 99, // Special clarification stage
      reason: verification.issues || 'Requires vendor clarification',
    });
  }
  
  await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('id', poId);
}

/**
 * Run automated follow-up system (called by cron job)
 */
export async function runFollowUpAutomation(): Promise<{
  sent: number;
  escalated: number;
}> {
  // Get POs needing follow-ups
  const { data: needsFollowUp } = await supabase
    .from('po_escalation_queue')
    .select('*')
    .eq('urgency', 'overdue');
  
  let sent = 0;
  let escalated = 0;
  
  for (const po of needsFollowUp || []) {
    const nextStage = (po.follow_up_count || 0) + 1;
    
    if (nextStage <= 3) {
      // Send follow-up
      await sendFollowUpEmail(po.id, nextStage);
      sent++;
      
      // Escalate if stage 2+
      if (nextStage >= 2) {
        await escalatePO(po.id, nextStage);
        escalated++;
      }
    } else {
      // Max follow-ups reached, mark as non-responsive
      await supabase
        .from('purchase_orders')
        .update({
          follow_up_status: 'vendor_non_responsive',
          escalation_level: 3,
        })
        .eq('id', po.id);
      
      // Create urgent task
      await createUrgentTask(po);
      escalated++;
    }
  }
  
  return { sent, escalated };
}

/**
 * Send follow-up email with appropriate template
 */
async function sendFollowUpEmail(poId: string, stage: number): Promise<void> {
  // Get PO details
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('*, vendors(*)')
    .eq('id', poId)
    .single();
  
  if (!po) return;
  
  // Get follow-up template for this stage
  const { data: template } = await supabase
    .from('follow_up_rules')
    .select('*')
    .eq('stage', stage)
    .eq('active', true)
    .single();
  
  if (!template) {
    console.error(`No follow-up template for stage ${stage}`);
    return;
  }
  
  // Render template
  const subject = renderTemplate(template.subject_template, po);
  const body = renderTemplate(template.body_template, po);
  
  // Send via Gmail
  const result = await sendGmailMessage({
    to: po.vendors.purchase_email || po.vendors.email,
    subject,
    body,
    thread_id: po.email_thread_id, // Keep in same thread
  });
  
  // Record communication
  await recordVendorCommunication({
    po_id: poId,
    communication_type: 'follow_up',
    stage,
    direction: 'outbound',
    gmail_message_id: result.message_id,
    gmail_thread_id: result.thread_id,
    subject,
    body_preview: body.substring(0, 500),
    sender_email: 'purchasing@yourdomain.com',
    recipient_email: po.vendors.purchase_email || po.vendors.email,
    sent_at: new Date().toISOString(),
  });
  
  // Update PO
  const nextFollowUpDue = new Date();
  nextFollowUpDue.setHours(nextFollowUpDue.getHours() + template.wait_hours);
  
  await supabase
    .from('purchase_orders')
    .update({
      follow_up_count: stage,
      last_follow_up_sent_at: new Date().toISOString(),
      next_follow_up_due_at: nextFollowUpDue.toISOString(),
    })
    .eq('id', poId);
}

/**
 * Escalate PO to manager/urgent status
 */
async function escalatePO(poId: string, stage: number): Promise<void> {
  const escalationLevel = stage === 2 ? 1 : stage === 3 ? 2 : 3;
  
  await supabase
    .from('purchase_orders')
    .update({ escalation_level: escalationLevel })
    .eq('id', poId);
  
  // Send Slack notification
  // TODO: Integrate Slack webhook
  console.log(`[Escalation] PO ${poId} escalated to level ${escalationLevel}`);
}

/**
 * Create urgent task for non-responsive vendor
 */
async function createUrgentTask(po: any): Promise<void> {
  await supabase.from('system_notifications').insert({
    channel: 'purchasing-urgent',
    severity: 'error',
    title: `Vendor Non-Responsive: ${po.order_id}`,
    message: `${po.vendor_name} has not responded after 3 follow-ups. Manual intervention required.`,
    action_url: `/purchase-orders/${po.id}`,
    metadata: {
      po_id: po.id,
      order_id: po.order_id,
      vendor_name: po.vendor_name,
      days_since_sent: Math.floor(po.hours_since_sent / 24),
    },
  });
}

function renderTemplate(template: string, po: any): string {
  return template
    .replace(/\{\{po_number\}\}/g, po.order_id)
    .replace(/\{\{vendor_name\}\}/g, po.vendors?.name || 'Vendor')
    .replace(/\{\{order_date\}\}/g, new Date(po.order_date).toLocaleDateString())
    .replace(/\{\{total\}\}/g, `$${po.total.toFixed(2)}`)
    .replace(/\{\{expected_date\}\}/g, po.expected_date ? new Date(po.expected_date).toLocaleDateString() : 'TBD');
}

async function recordVendorCommunication(comm: Omit<VendorCommunication, 'id'>): Promise<void> {
  await supabase.from('po_vendor_communications').insert(comm);
}

async function scheduleFollowUp(poId: string, options: { stage: number; reason: string }): Promise<void> {
  const nextDue = new Date();
  nextDue.setHours(nextDue.getHours() + 24); // 24 hours for clarifications
  
  await supabase
    .from('purchase_orders')
    .update({
      next_follow_up_due_at: nextDue.toISOString(),
    })
    .eq('id', poId);
}
```

### React Components

```tsx
// components/VendorResponseVerificationModal.tsx

import React, { useState } from 'react';
import Modal from './Modal';
import Button from './ui/Button';
import { CheckCircleIcon, XCircleIcon } from './icons';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: any;
  vendorResponse: any;
  onVerify: (verification: VendorResponseVerification) => Promise<void>;
}

export function VendorResponseVerificationModal({
  isOpen,
  onClose,
  purchaseOrder,
  vendorResponse,
  onVerify,
}: Props) {
  const [confirming, setConfirming] = useState(true);
  const [trackingNumber, setTrackingNumber] = useState(
    vendorResponse?.tracking_number || ''
  );
  const [carrier, setCarrier] = useState(vendorResponse?.carrier || '');
  const [shipDate, setShipDate] = useState(
    vendorResponse?.expected_ship_date || ''
  );
  const [issues, setIssues] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onVerify({
        confirmed: confirming,
        tracking_number: trackingNumber || undefined,
        carrier: carrier || undefined,
        estimated_ship_date: shipDate || undefined,
        issues: confirming ? undefined : issues,
        verification_notes: notes,
      });
      onClose();
    } catch (error) {
      console.error('Verification failed:', error);
      alert('Failed to save verification');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Verify Vendor Response">
      <div className="space-y-6">
        {/* Response Summary */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-200 mb-2">
            Vendor Response Summary
          </h4>
          <div className="text-sm text-blue-100 space-y-1">
            <p>
              <strong>PO:</strong> {purchaseOrder.order_id}
            </p>
            <p>
              <strong>Vendor:</strong> {purchaseOrder.vendor_name}
            </p>
            <p>
              <strong>Received:</strong>{' '}
              {new Date(
                purchaseOrder.vendor_response_received_at
              ).toLocaleString()}
            </p>
            {vendorResponse?.confirmation && (
              <p>
                <strong>Message:</strong> {vendorResponse.confirmation}
              </p>
            )}
          </div>
        </div>

        {/* AI Extracted Data */}
        {vendorResponse && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">
              AI Extracted Information
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="text-gray-400">Tracking Number</label>
                <p className="text-white font-mono">
                  {vendorResponse.tracking_number || 'Not found'}
                </p>
              </div>
              <div>
                <label className="text-gray-400">Carrier</label>
                <p className="text-white">
                  {vendorResponse.carrier || 'Not specified'}
                </p>
              </div>
              <div>
                <label className="text-gray-400">Ship Date</label>
                <p className="text-white">
                  {vendorResponse.expected_ship_date || 'Not specified'}
                </p>
              </div>
              <div>
                <label className="text-gray-400">Issues</label>
                <p className="text-white">
                  {vendorResponse.issues || 'None detected'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Verification Decision */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Verification Decision
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirming(true)}
              className={`flex-1 p-4 rounded-lg border text-left transition ${
                confirming
                  ? 'border-green-500/60 bg-green-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
                <span className="font-semibold text-white">Confirm Details</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Information is accurate and complete
              </p>
            </button>

            <button
              onClick={() => setConfirming(false)}
              className={`flex-1 p-4 rounded-lg border text-left transition ${
                !confirming
                  ? 'border-red-500/60 bg-red-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <XCircleIcon className="w-5 h-5 text-red-400" />
                <span className="font-semibold text-white">
                  Request Clarification
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Missing info or issues detected
              </p>
            </button>
          </div>
        </div>

        {/* Confirming: Tracking Details */}
        {confirming && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Tracking Number
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="1Z999AA10123456784"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Carrier
                </label>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                >
                  <option value="">Select carrier</option>
                  <option value="UPS">UPS</option>
                  <option value="FedEx">FedEx</option>
                  <option value="USPS">USPS</option>
                  <option value="Amazon Logistics">Amazon Logistics</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Expected Ship Date
                </label>
                <input
                  type="date"
                  value={shipDate}
                  onChange={(e) => setShipDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Not Confirming: Issues */}
        {!confirming && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              What needs clarification?
            </label>
            <textarea
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              placeholder="Describe what information is missing or incorrect..."
              rows={4}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
            <p className="text-xs text-gray-400 mt-1">
              This will trigger another follow-up email to the vendor
            </p>
          </div>
        )}

        {/* Verification Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Verification Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes about this verification..."
            rows={2}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || (!confirming && !issues.trim())}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : confirming ? 'Confirm & Update PO' : 'Send Clarification Request'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

### Supabase Edge Function: Gmail Webhook Handler

```typescript
// supabase/functions/gmail-vendor-reply-webhook/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { message } = await req.json();
    
    // Decode Gmail push notification
    const data = JSON.parse(atob(message.data));
    const emailAddress = data.emailAddress;
    const historyId = data.historyId;

    // Fetch new messages from Gmail API
    const gmail = await getGmailClient(); // Your Gmail API client
    const history = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId,
      historyTypes: ['messageAdded'],
    });

    for (const record of history.data.history || []) {
      for (const message of record.messagesAdded || []) {
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: message.message.id,
          format: 'full',
        });

        // Check if this is a vendor reply (not from us)
        const from = getHeader(fullMessage, 'From');
        const ourDomain = 'yourdomain.com';
        
        if (!from.includes(ourDomain)) {
          // This is an inbound vendor email
          const subject = getHeader(fullMessage, 'Subject');
          const threadId = fullMessage.data.threadId;
          const body = decodeMessageBody(fullMessage);
          const receivedAt = new Date(parseInt(fullMessage.data.internalDate)).toISOString();

          // Process vendor reply
          await processVendorReply(supabase, {
            emailContent: body,
            senderEmail: from,
            gmailMessageId: message.message.id,
            gmailThreadId: threadId,
            receivedAt,
            subject,
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Gmail webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

async function processVendorReply(supabase: any, data: any) {
  // 1. Parse email with AI
  const { data: aiParse } = await supabase.functions.invoke('ai-email-parser', {
    body: {
      email_content: data.emailContent,
      sender: data.senderEmail,
    },
  });

  // 2. Find matching POs
  const { data: candidates } = await supabase
    .from('purchase_orders')
    .select('*, vendors(*)')
    .eq('email_sent', true)
    .or('follow_up_status.eq.pending_response,follow_up_status.eq.requires_clarification');

  for (const po of candidates || []) {
    // Calculate correlation confidence
    const confidence = calculateConfidence(po, aiParse, data.senderEmail);
    
    if (confidence >= 0.7) {
      // Record communication
      await supabase.from('po_vendor_communications').insert({
        po_id: po.id,
        communication_type: 'vendor_reply',
        direction: 'inbound',
        gmail_message_id: data.gmailMessageId,
        gmail_thread_id: data.gmailThreadId,
        subject: data.subject,
        body_preview: data.emailContent.substring(0, 500),
        sender_email: data.senderEmail,
        recipient_email: po.vendors?.purchase_email || po.vendors?.email,
        received_at: data.receivedAt,
        extracted_data: aiParse,
        correlation_confidence: confidence,
      });

      // Update PO
      await supabase.from('purchase_orders').update({
        follow_up_status: 'vendor_responded',
        vendor_response_received_at: data.receivedAt,
        vendor_response_email_id: data.gmailMessageId,
        vendor_response_thread_id: data.gmailThreadId,
        vendor_response_summary: aiParse,
        verification_required: true,
        next_follow_up_due_at: null,
      }).eq('id', po.id);

      // Create notification
      await supabase.from('system_notifications').insert({
        channel: 'purchasing',
        severity: 'info',
        title: `Vendor Response: ${po.order_id}`,
        message: `${po.vendors?.name || 'Vendor'} responded. Verification required.`,
        action_url: `/purchase-orders?verify=${po.id}`,
        metadata: {
          po_id: po.id,
          has_tracking: !!aiParse.tracking_number,
        },
      });
    }
  }
}

function calculateConfidence(po: any, aiParse: any, senderEmail: string): number {
  let confidence = 0;
  
  if (aiParse.po_number === po.order_id) confidence += 0.5;
  
  const vendorDomain = po.vendors?.purchase_email?.split('@')[1] || po.vendors?.email?.split('@')[1];
  if (vendorDomain && senderEmail.includes(vendorDomain)) confidence += 0.3;
  
  if (aiParse.tracking_number) confidence += 0.2;
  
  return Math.min(confidence, 1.0);
}

function getHeader(message: any, name: string): string {
  const header = message.data.payload.headers.find((h: any) => h.name === name);
  return header?.value || '';
}

function decodeMessageBody(message: any): string {
  // Decode base64 email body
  const parts = message.data.payload.parts || [message.data.payload];
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    }
  }
  return '';
}
```

### Cron Job: Automated Follow-ups

```typescript
// supabase/functions/po-follow-up-automation/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Get POs needing follow-ups
  const { data: needsFollowUp } = await supabase
    .from('po_escalation_queue')
    .select('*')
    .eq('urgency', 'overdue');

  let sent = 0;
  let escalated = 0;

  for (const po of needsFollowUp || []) {
    const nextStage = (po.follow_up_count || 0) + 1;

    if (nextStage <= 3) {
      // Send follow-up
      await sendFollowUp(supabase, po, nextStage);
      sent++;

      if (nextStage >= 2) {
        await escalate(supabase, po.id, nextStage);
        escalated++;
      }
    } else {
      // Mark non-responsive
      await supabase.from('purchase_orders').update({
        follow_up_status: 'vendor_non_responsive',
        escalation_level: 3,
      }).eq('id', po.id);

      await createUrgentAlert(supabase, po);
      escalated++;
    }
  }

  return new Response(
    JSON.stringify({ sent, escalated }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});

async function sendFollowUp(supabase: any, po: any, stage: number) {
  // Get template
  const { data: template } = await supabase
    .from('follow_up_rules')
    .select('*')
    .eq('stage', stage)
    .eq('active', true)
    .single();

  if (!template) return;

  // Render email
  const subject = template.subject_template
    .replace('{{po_number}}', po.order_id)
    .replace('{{vendor_name}}', po.vendor_name);
  
  const body = template.body_template
    .replace('{{po_number}}', po.order_id)
    .replace('{{vendor_name}}', po.vendor_name)
    .replace('{{order_date}}', new Date(po.order_date).toLocaleDateString());

  // Send via Gmail (using your existing Gmail service)
  const result = await sendGmailMessage({
    to: po.vendor_email,
    subject,
    body,
    threadId: po.email_thread_id,
  });

  // Record
  await supabase.from('po_vendor_communications').insert({
    po_id: po.id,
    communication_type: 'follow_up',
    stage,
    direction: 'outbound',
    gmail_message_id: result.message_id,
    subject,
    sent_at: new Date().toISOString(),
  });

  // Update PO
  const nextDue = new Date();
  nextDue.setHours(nextDue.getHours() + template.wait_hours);

  await supabase.from('purchase_orders').update({
    follow_up_count: stage,
    last_follow_up_sent_at: new Date().toISOString(),
    next_follow_up_due_at: nextDue.toISOString(),
  }).eq('id', po.id);
}

async function escalate(supabase: any, poId: string, stage: number) {
  const level = stage === 2 ? 1 : stage === 3 ? 2 : 3;
  await supabase.from('purchase_orders').update({
    escalation_level: level
  }).eq('id', poId);
}

async function createUrgentAlert(supabase: any, po: any) {
  await supabase.from('system_notifications').insert({
    channel: 'purchasing-urgent',
    severity: 'error',
    title: `Vendor Non-Responsive: ${po.order_id}`,
    message: `${po.vendor_name} has not responded after 3 follow-ups. Call vendor immediately.`,
    action_url: `/purchase-orders/${po.id}`,
  });
}
```

### Testing & Rollout

1. **Week 1**: Database migration + basic service layer
2. **Week 2**: Gmail webhook integration + AI email parsing
3. **Week 3**: UI components + verification workflow
4. **Week 4**: Cron automation + escalation testing

**Success Metrics**:
- 90%+ vendor response rate after follow-ups
- <24hr average verification time
- 50%+ reduction in manual vendor phone calls

---

## 📦 Next: Gap 4 Implementation (Carrier APIs)

Coming in next document section...

**Cost**: ~$15-20/month for AfterShip + carrier APIs  
**Effort**: 2 weeks  
**Impact**: Real-time tracking for 95%+ of shipments
