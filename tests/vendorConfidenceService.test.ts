/**
 * Tests for vendorConfidenceService.ts
 * Tests confidence score calculations, profile management, and response strategies
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getVendorConfidenceProfile,
  getAllVendorConfidenceProfiles,
  recordInteractionEvent,
  recalculateVendorScore,
  calculateResponseLatencyScore,
  calculateThreadingScore,
  calculateCompletenessScore,
  calculateInvoiceAccuracyScore,
  calculateLeadTimeScore,
  getResponseStrategyForVendor,
  buildRecommendations,
} from '../services/vendorConfidenceService';
import type { VendorInteractionEvent, VendorConfidenceProfile } from '../types';

// Mock Supabase client
vi.mock('../lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          order: vi.fn(() => ({
            limit: vi.fn(),
          })),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      rpc: vi.fn(),
    })),
  },
}));

describe('vendorConfidenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getVendorConfidenceProfile', () => {
    it('should return null for non-existent vendor', async () => {
      // Mock database response
      const mockSupabase = vi.mocked(require('../lib/supabase/client').supabase);
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      } as any);

      const result = await getVendorConfidenceProfile('non-existent-vendor');
      expect(result).toBeNull();
    });

    it('should return profile data for existing vendor', async () => {
      const mockProfile = {
        id: 'profile-1',
        vendor_id: 'vendor-1',
        confidence_score: 8.5,
        response_latency_score: 9.0,
        threading_score: 8.0,
        completeness_score: 8.5,
        invoice_accuracy_score: 9.0,
        lead_time_score: 8.0,
        trend: 'improving',
        communication_status: 'fully_automatic',
      };

      const mockSupabase = vi.mocked(require('../lib/supabase/client').supabase);
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          })),
        })),
      } as any);

      const result = await getVendorConfidenceProfile('vendor-1');
      expect(result).toEqual({
        id: 'profile-1',
        vendorId: 'vendor-1',
        confidenceScore: 8.5,
        responseLatencyScore: 9.0,
        threadingScore: 8.0,
        completenessScore: 8.5,
        invoiceAccuracyScore: 9.0,
        leadTimeScore: 8.0,
        trend: 'improving',
        communicationStatus: 'fully_automatic',
        interactionsCount: 0,
        lastRecalculatedAt: undefined,
        score30DaysAgo: undefined,
        recommendedLeadTimeBufferDays: 0,
        templateStrictness: 'standard',
        updatedAt: undefined,
      });
    });
  });

  describe('calculateResponseLatencyScore', () => {
    it('should return 5 for no events', () => {
      const result = calculateResponseLatencyScore([]);
      expect(result).toBe(5);
    });

    it('should calculate score based on average response time', () => {
      const events: VendorInteractionEvent[] = [
        { id: '1', vendorId: 'v1', eventType: 'email_received', responseLatencyMinutes: 120 }, // 2 hours
        { id: '2', vendorId: 'v1', eventType: 'email_received', responseLatencyMinutes: 180 }, // 3 hours
      ];

      const result = calculateResponseLatencyScore(events);
      expect(result).toBe(9); // Average 2.5 hours = score 9
    });

    it('should return 10 for very fast responses', () => {
      const events: VendorInteractionEvent[] = [
        { id: '1', vendorId: 'v1', eventType: 'email_received', responseLatencyMinutes: 60 }, // 1 hour
      ];

      const result = calculateResponseLatencyScore(events);
      expect(result).toBe(10);
    });

    it('should return 1 for very slow responses', () => {
      const events: VendorInteractionEvent[] = [
        { id: '1', vendorId: 'v1', eventType: 'email_received', responseLatencyMinutes: 4320 }, // 3 days
      ];

      const result = calculateResponseLatencyScore(events);
      expect(result).toBe(1);
    });
  });

  describe('calculateThreadingScore', () => {
    it('should return 5 for no threaded events', () => {
      const result = calculateThreadingScore([]);
      expect(result).toBe(5);
    });

    it('should calculate score based on threading ratio', () => {
      const events: VendorInteractionEvent[] = [
        { id: '1', vendorId: 'v1', eventType: 'email_received', isThreaded: true },
        { id: '2', vendorId: 'v1', eventType: 'email_received', isThreaded: false },
        { id: '3', vendorId: 'v1', eventType: 'email_received', isThreaded: true },
      ];

      const result = calculateThreadingScore(events);
      expect(result).toBe(8); // 67% threaded = score 8
    });

    it('should return 10 for perfect threading', () => {
      const events: VendorInteractionEvent[] = [
        { id: '1', vendorId: 'v1', eventType: 'email_received', isThreaded: true },
        { id: '2', vendorId: 'v1', eventType: 'email_received', isThreaded: true },
      ];

      const result = calculateThreadingScore(events);
      expect(result).toBe(10);
    });
  });

  describe('calculateCompletenessScore', () => {
    it('should return 5 for no confidence data', () => {
      const result = calculateCompletenessScore([]);
      expect(result).toBe(5);
    });

    it('should calculate score based on average extraction confidence', () => {
      const events: VendorInteractionEvent[] = [
        { id: '1', vendorId: 'v1', eventType: 'email_received', extractionConfidence: 0.8 },
        { id: '2', vendorId: 'v1', eventType: 'email_received', extractionConfidence: 0.9 },
      ];

      const result = calculateCompletenessScore(events);
      expect(result).toBe(8.5); // Average 0.85 confidence = score 8.5
    });
  });

  describe('calculateInvoiceAccuracyScore', () => {
    it('should return 5 for no variance data', () => {
      const result = calculateInvoiceAccuracyScore([]);
      expect(result).toBe(5);
    });

    it('should calculate score based on invoice variance', () => {
      const events: VendorInteractionEvent[] = [
        { id: '1', vendorId: 'v1', eventType: 'invoice_processed', invoiceVariancePercent: 0.5 }, // 0.5%
        { id: '2', vendorId: 'v1', eventType: 'invoice_processed', invoiceVariancePercent: 1.0 }, // 1.0%
      ];

      const result = calculateInvoiceAccuracyScore(events);
      expect(result).toBe(9.75); // Average variance 0.75% = score 9.75
    });

    it('should return 10 for perfect accuracy', () => {
      const events: VendorInteractionEvent[] = [
        { id: '1', vendorId: 'v1', eventType: 'invoice_processed', invoiceVariancePercent: 0 },
      ];

      const result = calculateInvoiceAccuracyScore(events);
      expect(result).toBe(10);
    });
  });

  describe('calculateLeadTimeScore', () => {
    it('should return 5 for no delivery data', () => {
      const result = calculateLeadTimeScore([]);
      expect(result).toBe(5);
    });

    it('should calculate score based on on-time delivery ratio', () => {
      const events: VendorInteractionEvent[] = [
        { id: '1', vendorId: 'v1', eventType: 'delivery_confirmed', deliveredOnTime: true },
        { id: '2', vendorId: 'v1', eventType: 'delivery_confirmed', deliveredOnTime: false },
        { id: '3', vendorId: 'v1', eventType: 'delivery_confirmed', deliveredOnTime: true },
      ];

      const result = calculateLeadTimeScore(events);
      expect(result).toBe(8); // 67% on-time = score 8
    });
  });

  describe('getResponseStrategyForVendor', () => {
    it('should return relaxed strategy for high-confidence vendor', () => {
      const profile: VendorConfidenceProfile = {
        id: 'p1',
        vendorId: 'v1',
        confidenceScore: 9.0,
        responseLatencyScore: 9,
        threadingScore: 9,
        completenessScore: 9,
        invoiceAccuracyScore: 9,
        leadTimeScore: 9,
        trend: 'stable',
        communicationStatus: 'fully_automatic',
        interactionsCount: 10,
      };

      const result = getResponseStrategyForVendor(profile);
      expect(result).toEqual({
        strictness: 'relaxed',
        tone: 'friendly',
        reminders: [],
        requiresManagerReview: false,
      });
    });

    it('should return strict strategy for low-confidence vendor', () => {
      const profile: VendorConfidenceProfile = {
        id: 'p1',
        vendorId: 'v1',
        confidenceScore: 3.0,
        responseLatencyScore: 3,
        threadingScore: 3,
        completenessScore: 3,
        invoiceAccuracyScore: 3,
        leadTimeScore: 3,
        trend: 'declining',
        communicationStatus: 'needs_full_review',
        interactionsCount: 10,
      };

      const result = getResponseStrategyForVendor(profile);
      expect(result).toEqual({
        strictness: 'maximum',
        tone: 'formal',
        reminders: ['Escalate to manager', 'Highlight next steps', 'Request acknowledgement'],
        requiresManagerReview: true,
      });
    });

    it('should return standard strategy for medium-confidence vendor', () => {
      const profile: VendorConfidenceProfile = {
        id: 'p1',
        vendorId: 'v1',
        confidenceScore: 6.5,
        responseLatencyScore: 6,
        threadingScore: 7,
        completenessScore: 6,
        invoiceAccuracyScore: 7,
        leadTimeScore: 7,
        trend: 'stable',
        communicationStatus: 'automatic_with_review',
        interactionsCount: 10,
      };

      const result = getResponseStrategyForVendor(profile);
      expect(result).toEqual({
        strictness: 'standard',
        tone: 'professional',
        reminders: ['Reference PO number', 'Remind threading expectations'],
        requiresManagerReview: false,
      });
    });
  });

  describe('buildRecommendations', () => {
    it('should return default message for no profile', () => {
      const result = buildRecommendations();
      expect(result).toEqual([{
        heading: 'Not enough data',
        description: 'Record at least 5 vendor interactions to unlock recommendations.',
      }]);
    });

    it('should generate recommendations based on factor scores', () => {
      const profile: VendorConfidenceProfile = {
        id: 'p1',
        vendorId: 'v1',
        confidenceScore: 6.0,
        responseLatencyScore: 3, // Low
        threadingScore: 4, // Low
        completenessScore: 8, // Good
        invoiceAccuracyScore: 7, // Good
        leadTimeScore: 8, // Good
        trend: 'stable',
        communicationStatus: 'automatic_with_review',
        interactionsCount: 10,
      };

      const result = buildRecommendations(profile);
      expect(result).toHaveLength(2);
      expect(result[0].heading).toBe('Slow responses');
      expect(result[1].heading).toBe('Threading reminders');
    });

    it('should return positive message for good performance', () => {
      const profile: VendorConfidenceProfile = {
        id: 'p1',
        vendorId: 'v1',
        confidenceScore: 9.0,
        responseLatencyScore: 9,
        threadingScore: 9,
        completenessScore: 9,
        invoiceAccuracyScore: 9,
        leadTimeScore: 9,
        trend: 'improving',
        communicationStatus: 'fully_automatic',
        interactionsCount: 10,
      };

      const result = buildRecommendations(profile);
      expect(result).toHaveLength(1);
      expect(result[0].heading).toBe('Great performance');
    });
  });

  describe('recordInteractionEvent', () => {
    it('should successfully record an interaction event', async () => {
      const mockSupabase = vi.mocked(require('../lib/supabase/client').supabase);
      mockSupabase.from.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ error: null }),
          })),
        })),
      } as any);

      const event = {
        vendorId: 'v1',
        eventType: 'email_received' as const,
        responseLatencyMinutes: 120,
        isThreaded: true,
        extractionConfidence: 0.85,
      };

      const result = await recordInteractionEvent(event);
      expect(result).toBe(true);
    });

    it('should return false on database error', async () => {
      const mockSupabase = vi.mocked(require('../lib/supabase/client').supabase);
      mockSupabase.from.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ error: new Error('Database error') }),
          })),
        })),
      } as any);

      const event = {
        vendorId: 'v1',
        eventType: 'email_received' as const,
      };

      const result = await recordInteractionEvent(event);
      expect(result).toBe(false);
    });
  });

  describe('recalculateVendorScore', () => {
    it('should call the database function to recalculate scores', async () => {
      const mockSupabase = vi.mocked(require('../lib/supabase/client').supabase);
      mockSupabase.rpc = vi.fn().mockResolvedValue({ error: null });

      const result = await recalculateVendorScore('vendor-1', 'manual_recalc');
      expect(result).toBeUndefined();

      expect(mockSupabase.rpc).toHaveBeenCalledWith('refresh_vendor_confidence_profile', {
        vendor_id: 'vendor-1',
        trigger_source: 'manual_recalc',
      });
    });

    it('should throw error on database failure', async () => {
      const mockSupabase = vi.mocked(require('../lib/supabase/client').supabase);
      mockSupabase.rpc = vi.fn().mockResolvedValue({ error: new Error('RPC failed') });

      await expect(recalculateVendorScore('vendor-1')).rejects.toThrow();
    });
  });
});