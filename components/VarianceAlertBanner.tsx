import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, CheckCircle, XCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { getVarianceAlerts, overrideVariance } from '../services/invoiceProcessingService';
import { InvoiceVariance } from '../services/invoiceProcessingService';

interface VarianceAlertBannerProps {
  onReviewClick?: (poId: string) => void;
}

export function VarianceAlertBanner({ onReviewClick }: VarianceAlertBannerProps) {
  const [alerts, setAlerts] = useState<Array<{
    variance: InvoiceVariance;
    po: any;
    invoice: InvoiceData;
    daysOld: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const alertData = await getVarianceAlerts();
      setAlerts(alertData);
    } catch (error) {
      console.error('Failed to load variance alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOverride = async (varianceId: string, action: 'approve' | 'reject') => {
    setProcessing(prev => new Set(prev).add(varianceId));

    try {
      const reason = action === 'approve' ? 'Approved via alert banner' : 'Rejected via alert banner';
      await overrideVariance(varianceId, action, reason);
      await loadAlerts(); // Refresh alerts
    } catch (error) {
      console.error('Failed to override variance:', error);
    } finally {
      setProcessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(varianceId);
        return newSet;
      });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading || alerts.length === 0) {
    return null;
  }

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-orange-900">
                Invoice Variances Require Attention
              </h3>
              <Badge variant="secondary" className="bg-orange-200 text-orange-800">
                {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="space-y-3">
              {alerts.slice(0, 3).map((alert) => (
                <div key={alert.variance.id} className="bg-white rounded-lg p-3 border border-orange-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        PO {alert.po.order_id}
                      </span>
                      <span className="text-sm text-gray-600">
                        {alert.po.supplier_name}
                      </span>
                      <Badge className={`text-xs ${getSeverityColor(alert.variance.severity)}`}>
                        {alert.variance.severity}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500">
                      {alert.daysOld} day{alert.daysOld !== 1 ? 's' : ''} old
                    </span>
                  </div>

                  <div className="text-sm text-gray-700 mb-3">
                    <span className="capitalize">{alert.variance.varianceType} variance:</span>{' '}
                    PO: ${alert.variance.poAmount.toFixed(2)} → Invoice: ${alert.variance.invoiceAmount.toFixed(2)}
                    {alert.variance.variancePercentage !== 0 && (
                      <span className="ml-2 font-medium">
                        ({alert.variance.variancePercentage > 0 ? '+' : ''}{alert.variance.variancePercentage.toFixed(1)}%)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOverride(alert.variance.id, 'approve')}
                      disabled={processing.has(alert.variance.id)}
                      className="h-7 px-2"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOverride(alert.variance.id, 'reject')}
                      disabled={processing.has(alert.variance.id)}
                      className="h-7 px-2"
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Reject
                    </Button>
                    {onReviewClick && (
                      <Button
                        size="sm"
                        onClick={() => onReviewClick(alert.po.id)}
                        className="h-7 px-2"
                      >
                        Review All
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {alerts.length > 3 && (
                <div className="text-center">
                  <Button
                    variant="link"
                    className="text-orange-700 hover:text-orange-900"
                    onClick={() => onReviewClick?.(alerts[0].po.id)}
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