/**
 * useLeadTimeTracking Hook
 * 
 * Manages lead time tracking for purchase orders and provides
 * vendor lead time metrics and confidence analysis.
 */

import { useState, useCallback, useEffect } from 'react';
import { VendorLeadTimeAnalysis, VendorLeadTimeMetrics } from '../services/leadTimeTrackingService';
import vendorLeadTimeService from '../services/leadTimeTrackingService';

interface UseLeadTimeTrackingState {
  vendorMetrics: Map<string, VendorLeadTimeMetrics>;
  vendorAnalysis: Map<string, VendorLeadTimeAnalysis>;
  loading: boolean;
  error: string | null;
}

export function useLeadTimeTracking() {
  const [state, setState] = useState<UseLeadTimeTrackingState>({
    vendorMetrics: new Map(),
    vendorAnalysis: new Map(),
    loading: false,
    error: null
  });

  /**
   * Fetch and cache vendor lead time analysis
   */
  const fetchVendorAnalysis = useCallback(
    async (vendorId: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const result = await vendorLeadTimeService.getVendorLeadTimeAnalysis(vendorId);
      
      if (result.success && result.data) {
        setState(prev => ({
          ...prev,
          vendorAnalysis: new Map(prev.vendorAnalysis).set(vendorId, result.data!),
          loading: false
        }));
        return result.data;
      } else {
        setState(prev => ({
          ...prev,
          error: result.error || 'Failed to fetch vendor analysis',
          loading: false
        }));
        return null;
      }
    },
    []
  );

  /**
   * Fetch and cache vendor metrics
   */
  const fetchVendorMetrics = useCallback(
    async (vendorId: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const result = await vendorLeadTimeService.calculateVendorLeadTimeMetrics(vendorId);
      
      if (result.success && result.data) {
        setState(prev => ({
          ...prev,
          vendorMetrics: new Map(prev.vendorMetrics).set(vendorId, result.data!),
          loading: false
        }));
        return result.data;
      } else {
        setState(prev => ({
          ...prev,
          error: result.error || 'Failed to fetch vendor metrics',
          loading: false
        }));
        return null;
      }
    },
    []
  );

  /**
   * Get cached analysis for vendor
   */
  const getVendorAnalysis = useCallback(
    (vendorId: string): VendorLeadTimeAnalysis | null => {
      return state.vendorAnalysis.get(vendorId) || null;
    },
    [state.vendorAnalysis]
  );

  /**
   * Get cached metrics for vendor
   */
  const getVendorMetrics = useCallback(
    (vendorId: string): VendorLeadTimeMetrics | null => {
      return state.vendorMetrics.get(vendorId) || null;
    },
    [state.vendorMetrics]
  );

  /**
   * Record PO status change (triggers automatic timestamp tracking)
   */
  const recordStatusChange = useCallback(
    async (poId: string, vendorId: string | undefined, newStatus: string, previousStatus?: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const result = await vendorLeadTimeService.recordPOStatusChange(
        poId,
        vendorId,
        newStatus,
        previousStatus || null
      );
      
      if (result.success) {
        setState(prev => ({ ...prev, loading: false }));
        return true;
      } else {
        setState(prev => ({
          ...prev,
          error: result.error || 'Failed to record status change',
          loading: false
        }));
        return false;
      }
    },
    []
  );

  /**
   * Mark a PO as committed (when status changes to confirmed/committed)
   */
  const markCommitted = useCallback(
    async (poId: string) => {
      const result = await vendorLeadTimeService.markPOCommitted(poId);
      
      if (!result.success) {
        setState(prev => ({
          ...prev,
          error: result.error || 'Failed to mark PO committed'
        }));
        return false;
      }
      return true;
    },
    []
  );

  /**
   * Mark a PO as received (when status changes to received)
   */
  const markReceived = useCallback(
    async (poId: string) => {
      const result = await vendorLeadTimeService.markPOReceived(poId);
      
      if (!result.success) {
        setState(prev => ({
          ...prev,
          error: result.error || 'Failed to mark PO received'
        }));
        return false;
      }
      return true;
    },
    []
  );

  /**
   * Recalculate lead time metrics for a vendor
   */
  const recalculateMetrics = useCallback(
    async (vendorId: string) => {
      return fetchVendorMetrics(vendorId);
    },
    [fetchVendorMetrics]
  );

  /**
   * Clear cached data for a vendor
   */
  const clearVendorCache = useCallback(
    (vendorId?: string) => {
      setState(prev => {
        if (!vendorId) {
          return {
            ...prev,
            vendorMetrics: new Map(),
            vendorAnalysis: new Map()
          };
        }
        
        const metrics = new Map(prev.vendorMetrics);
        const analysis = new Map(prev.vendorAnalysis);
        metrics.delete(vendorId);
        analysis.delete(vendorId);
        
        return {
          ...prev,
          vendorMetrics: metrics,
          vendorAnalysis: analysis
        };
      });
    },
    []
  );

  return {
    // State
    vendorMetrics: state.vendorMetrics,
    vendorAnalysis: state.vendorAnalysis,
    loading: state.loading,
    error: state.error,
    
    // Fetch methods
    fetchVendorAnalysis,
    fetchVendorMetrics,
    
    // Getter methods
    getVendorAnalysis,
    getVendorMetrics,
    
    // PO tracking methods
    recordStatusChange,
    markCommitted,
    markReceived,
    
    // Metrics calculation
    recalculateMetrics,
    clearVendorCache
  };
}

export default useLeadTimeTracking;
