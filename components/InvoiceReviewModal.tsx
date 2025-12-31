import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  XMarkIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  TruckIcon,
  CalculatorIcon,
  MailIcon,
  CurrencyDollarIcon,
} from './icons';
import {
  getInvoiceDataForPO,
  getInvoiceVariancesForPO,
  processInvoiceReview,
  getAPEmailSettings,
  InvoiceData,
  InvoiceVariance,
  InvoiceReviewResult
} from '../services/invoiceProcessingService';

interface InvoiceReviewModalProps {
  poId: string;
  isOpen: boolean;
  onClose: () => void;
  onReviewComplete?: () => void;
}

export function InvoiceReviewModal({ poId, isOpen, onClose, onReviewComplete }: InvoiceReviewModalProps) {
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [variances, setVariances] = useState<InvoiceVariance[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Review form state
  const [selectedVariances, setSelectedVariances] = useState<Set<string>>(new Set());
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [forwardToAP, setForwardToAP] = useState(false);
  const [apEmail, setApEmail] = useState('');
  const [apEmailSettings, setApEmailSettings] = useState<{ email: string; enabled: boolean } | null>(null);

  useEffect(() => {
    if (isOpen && poId) {
      loadInvoiceData();
      loadAPSettings();
    }
  }, [isOpen, poId]);

  const loadInvoiceData = async () => {
    try {
      setLoading(true);
      const [invoice, varianceData] = await Promise.all([
        getInvoiceDataForPO(poId),
        getInvoiceVariancesForPO(poId)
      ]);

      setInvoiceData(invoice);
      setVariances(varianceData);

      // Pre-select all variances for approval by default
      setSelectedVariances(new Set(varianceData.map(v => v.id)));
    } catch (error) {
      console.error('Failed to load invoice data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAPSettings = async () => {
    try {
      const settings = await getAPEmailSettings();
      setApEmailSettings(settings);
      if (settings?.enabled && settings.email) {
        setApEmail(settings.email);
        setForwardToAP(true);
      }
    } catch (error) {
      console.error('Failed to load AP settings:', error);
    }
  };

  const handleVarianceToggle = (varianceId: string, approved: boolean) => {
    const newSelected = new Set(selectedVariances);
    if (approved) {
      newSelected.add(varianceId);
    } else {
      newSelected.delete(varianceId);
    }
    setSelectedVariances(newSelected);
  };

  const handleSubmitReview = async (action: 'approve' | 'reject') => {
    if (!invoiceData) return;

    setProcessing(true);
    try {
      const approvedVariances = variances
        .filter(v => selectedVariances.has(v.id))
        .map(v => v.id);

      const rejectedVariances = variances
        .filter(v => !selectedVariances.has(v.id))
        .map(v => v.id);

      const result: InvoiceReviewResult = {
        invoiceId: invoiceData.id,
        action,
        approvedVariances,
        rejectedVariances,
        reviewerNotes,
        forwardToAP,
        apEmail
      };

      await processInvoiceReview(result);

      onReviewComplete?.();
      onClose();
    } catch (error) {
      console.error('Failed to process review:', error);
    } finally {
      setProcessing(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircleIcon className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangleIcon className="h-4 w-4 text-yellow-500" />;
      case 'info': return <CheckCircleIcon className="h-4 w-4 text-blue-500" />;
      default: return null;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary';
      case 'info': return 'outline';
      default: return 'outline';
    }
  };

  const getVarianceTypeIcon = (type: string) => {
    switch (type) {
      case 'shipping': return <TruckIcon className="h-4 w-4" />;
      case 'pricing': return <CurrencyDollarIcon className="h-4 w-4" />;
      case 'tax': return <CalculatorIcon className="h-4 w-4" />;
      case 'total': return <CalculatorIcon className="h-4 w-4" />;
      default: return <AlertTriangleIcon className="h-4 w-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Invoice Review</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="text-center py-8">Loading invoice data...</div>
          ) : !invoiceData ? (
            <div className="text-center py-8 text-gray-500">
              No invoice data found for this purchase order.
            </div>
          ) : (
            <>
              {/* Invoice Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalculatorIcon className="h-5 w-5" />
                    Invoice Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Invoice Number</Label>
                      <p className="text-sm text-gray-600">{invoiceData.invoiceNumber || 'Not specified'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Invoice Date</Label>
                      <p className="text-sm text-gray-600">
                        {invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate).toLocaleDateString() : 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Vendor</Label>
                      <p className="text-sm text-gray-600">{invoiceData.vendorName || 'Not specified'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Total Amount</Label>
                      <p className="text-lg font-semibold">${invoiceData.totalAmount.toFixed(2)}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <Label>Subtotal</Label>
                      <p className="font-medium">${invoiceData.subtotal.toFixed(2)}</p>
                    </div>
                    <div>
                      <Label>Tax</Label>
                      <p className="font-medium">${invoiceData.taxAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <Label>Shipping</Label>
                      <p className="font-medium">${invoiceData.shippingAmount.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Variances */}
              {variances.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangleIcon className="h-5 w-5" />
                      Variances Detected ({variances.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {variances.map((variance) => (
                        <div key={variance.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            {getSeverityIcon(variance.severity)}
                            {getVarianceTypeIcon(variance.varianceType)}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium capitalize">{variance.varianceType} Variance</span>
                                <Badge variant={getSeverityColor(variance.severity)}>
                                  {variance.severity}
                                </Badge>
                              </div>
                              <div className="text-sm text-gray-600">
                                PO: ${variance.poAmount.toFixed(2)} → Invoice: ${variance.invoiceAmount.toFixed(2)}
                                {variance.variancePercentage !== 0 && (
                                  <span className="ml-2">
                                    ({variance.variancePercentage > 0 ? '+' : ''}{variance.variancePercentage.toFixed(1)}%)
                                  </span>
                                )}
                              </div>
                              {variance.itemDescription && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {variance.itemDescription}
                                </div>
                              )}
                            </div>
                          </div>
                          <Checkbox
                            checked={selectedVariances.has(variance.id)}
                            onCheckedChange={(checked) => handleVarianceToggle(variance.id, checked as boolean)}
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AP Forwarding */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MailIcon className="h-5 w-5" />
                    AP Processing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="forward-ap"
                      checked={forwardToAP}
                      onCheckedChange={(checked) => setForwardToAP(checked as boolean)}
                    />
                    <Label htmlFor="forward-ap">Forward approved invoice to Accounts Payable</Label>
                  </div>

                  {forwardToAP && (
                    <div>
                      <Label htmlFor="ap-email">AP Email Address</Label>
                      <Input
                        id="ap-email"
                        type="email"
                        value={apEmail}
                        onChange={(e) => setApEmail(e.target.value)}
                        placeholder="ap@company.com"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Review Notes */}
              <Card>
                <CardHeader>
                  <CardTitle>Review Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Add any notes about this invoice review..."
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    rows={3}
                  />
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={onClose} disabled={processing}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleSubmitReview('reject')}
                  disabled={processing}
                >
                  Reject Invoice
                </Button>
                <Button
                  onClick={() => handleSubmitReview('approve')}
                  disabled={processing}
                >
                  {processing ? 'Processing...' : 'Approve Invoice'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}