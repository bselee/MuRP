import React, { useState, useEffect } from 'react';
import { Truck, X, CheckCircle, XCircle, AlertTriangle, Package } from 'lucide-react';
import Button from './ui/Button';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { getShipmentAlerts, processShipmentReview } from '../services/shipmentTrackingService';
import { ShipmentAlert } from '../services/shipmentTrackingService';

interface ShipmentAlertBannerProps {
  onReviewClick?: (poId: string) => void;
}

export function ShipmentAlertBanner({ onReviewClick }: ShipmentAlertBannerProps) {
  const [alerts, setAlerts] = useState<ShipmentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const alertData = await getShipmentAlerts();
      setAlerts(alertData);
    } catch (error) {
      console.error('Failed to load shipment alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = async (shipmentId: string, action: 'approve' | 'reject') => {
    setProcessing(prev => new Set(prev).add(shipmentId));

    try {
      const reason = action === 'approve' ? 'Approved via alert banner' : 'Rejected via alert banner';
      await processShipmentReview({
        shipmentId,
        action,
        reviewerNotes: reason,
      });
      await loadAlerts(); // Refresh alerts
    } catch (error) {
      console.error('Failed to process shipment:', error);
    } finally {
      setProcessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(shipmentId);
        return newSet;
      });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getAlertTypeIcon = (alertType: string) => {
    switch (alertType) {
      case 'overdue_delivery': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'tracking_issue': return <XCircle className="h-4 w-4 text-orange-600" />;
      case 'review_required': return <Package className="h-4 w-4 text-blue-600" />;
      default: return <Truck className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading || alerts.length === 0) {
    return null;
  }

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Truck className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-blue-900">
                Shipment Updates Require Attention
              </h3>
              <Badge variant="secondary" className="bg-blue-200 text-blue-800">
                {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="space-y-3">
              {alerts.slice(0, 3).map((alert) => (
                <div key={alert.shipmentId} className="bg-white rounded-lg p-3 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getAlertTypeIcon(alert.alertType)}
                      <span className="font-medium text-sm">
                        PO {alert.poNumber}
                      </span>
                      <Badge className={`text-xs ${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </Badge>
                    </div>
                    {alert.daysOverdue > 0 && (
                      <span className="text-xs text-red-600 font-medium">
                        {alert.daysOverdue} day{alert.daysOverdue !== 1 ? 's' : ''} overdue
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-gray-700 mb-3">
                    {alert.alertMessage}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleQuickAction(alert.shipmentId, 'approve')}
                      disabled={processing.has(alert.shipmentId)}
                      className="h-7 px-2"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleQuickAction(alert.shipmentId, 'reject')}
                      disabled={processing.has(alert.shipmentId)}
                      className="h-7 px-2"
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Reject
                    </Button>
                    {onReviewClick && (
                      <Button
                        size="sm"
                        onClick={() => onReviewClick(alert.poId)}
                        className="h-7 px-2"
                      >
                        Review Details
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {alerts.length > 3 && (
                <div className="text-center">
                  <Button
                    variant="link"
                    className="text-blue-700 hover:text-blue-900"
                    onClick={() => onReviewClick?.(alerts[0].poId)}
                  >
                    View all {alerts.length} alerts
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}