import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import type { PurchaseOrder } from '../types';

/**
 * Hook to fetch PO data for limiting SKUs
 * Returns on-order information with ETA for components that limit buildability
 */

export interface LimitingSKUOnOrder {
  sku: string;
  poId: string;
  orderId: string;
  supplier: string;
  estimatedReceiveDate: string | null;
  status: string;
  quantity: number;
  vendor?: string;
  trackingStatus?: string;
}

interface UseLimitingSKUOnOrderProps {
  limitingSkus: string[]; // Array of SKUs that are limiting
  purchaseOrders: PurchaseOrder[]; // All POs, will filter by SKU
}

export const useLimitingSKUOnOrder = ({ limitingSkus, purchaseOrders }: UseLimitingSKUOnOrderProps) => {
  const [onOrderData, setOnOrderData] = useState<Map<string, LimitingSKUOnOrder>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!limitingSkus || limitingSkus.length === 0) {
      setOnOrderData(new Map());
      return;
    }

    const buildOnOrderMap = () => {
      const map = new Map<string, LimitingSKUOnOrder>();

      // Filter POs that contain limiting SKUs
      purchaseOrders.forEach((po) => {
        // POs may have items property or items could be in details
        const poItems = (po as any).items || (po as any).details || [];
        
        poItems.forEach((item: any) => {
          const itemSku = item.sku || item.productId || '';
          
          // Check if this item SKU is in our limiting SKUs list
          if (limitingSkus.includes(itemSku)) {
            // Only include active/pending POs, not received/cancelled
            const isActive = ['pending', 'committed', 'sent', 'confirmed', 'partial'].includes(po.status);
            
            if (isActive) {
              map.set(itemSku, {
                sku: itemSku,
                poId: po.id,
                orderId: po.orderId,
                supplier: po.supplier,
                estimatedReceiveDate: po.estimatedReceiveDate || po.expectedDate || null,
                status: po.status,
                quantity: item.quantity || 0,
                vendor: po.supplier,
                trackingStatus: po.trackingStatus
              });
            }
          }
        });
      });

      setOnOrderData(map);
    };

    buildOnOrderMap();
  }, [limitingSkus, purchaseOrders]);

  // Get on-order info for a specific SKU
  const getOnOrderInfo = (sku: string): LimitingSKUOnOrder | null => {
    return onOrderData.get(sku) || null;
  };

  // Get all on-order info
  const getAllOnOrderInfo = (): LimitingSKUOnOrder[] => {
    return Array.from(onOrderData.values());
  };

  return {
    onOrderData,
    loading,
    getOnOrderInfo,
    getAllOnOrderInfo
  };
};

export default useLimitingSKUOnOrder;
