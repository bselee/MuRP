import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, XCircle, Truck, Package, MapPin, Calendar } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import {
  getShipmentDataForPO,
  getShipmentDetails,
  processShipmentReview,
  validateTrackingNumber,
  ShipmentData,
  ShipmentReviewResult
} from '../services/shipmentTrackingService';

interface ShipmentReviewModalProps {
  poId: string;
  isOpen: boolean;
  onClose: () => void;
  onReviewComplete?: () => void;
}

export function ShipmentReviewModal({ poId, isOpen, onClose, onReviewComplete }: ShipmentReviewModalProps) {
  const [shipments, setShipments] = useState<ShipmentData[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentData | null>(null);
  const [shipmentDetails, setShipmentDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Review form state
  const [correctedTrackingNumbers, setCorrectedTrackingNumbers] = useState<string[]>([]);
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [overrideCarrier, setOverrideCarrier] = useState('');
  const [overrideDeliveryDate, setOverrideDeliveryDate] = useState('');

  useEffect(() => {
    if (isOpen && poId) {
      loadShipmentData();
    }
  }, [isOpen, poId]);

  useEffect(() => {
    if (selectedShipment) {
      loadShipmentDetails(selectedShipment.id);
    }
  }, [selectedShipment]);

  const loadShipmentData = async () => {
    try {
      setLoading(true);
      const shipmentData = await getShipmentDataForPO(poId);
      setShipments(shipmentData);

      // Auto-select first shipment requiring review
      const pendingReview = shipmentData.find(s => s.requiresReview);
      if (pendingReview) {
        setSelectedShipment(pendingReview);
        setCorrectedTrackingNumbers(pendingReview.trackingNumbers);
      } else if (shipmentData.length > 0) {
        setSelectedShipment(shipmentData[0]);
        setCorrectedTrackingNumbers(shipmentData[0].trackingNumbers);
      }
    } catch (error) {
      console.error('Failed to load shipment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadShipmentDetails = async (shipmentId: string) => {
    try {
      const details = await getShipmentDetails(shipmentId);
      setShipmentDetails(details);
    } catch (error) {
      console.error('Failed to load shipment details:', error);
    }
  };

  const validateTrackingNumbers = async (trackingNumbers: string[]) => {
    const validations = await Promise.all(
      trackingNumbers.map(async (tn) => {
        try {
          const result = await validateTrackingNumber(tn, selectedShipment?.carrier);
          return { trackingNumber: tn, ...result };
        } catch (error) {
          return { trackingNumber: tn, isValid: false, carrier: null, confidence: 0 };
        }
      })
    );
    return validations;
  };

  const handleSubmitReview = async (action: 'approve' | 'reject' | 'override') => {
    if (!selectedShipment) return;

    setProcessing(true);
    try {
      const result: ShipmentReviewResult = {
        shipmentId: selectedShipment.id,
        action,
        reviewerNotes,
        correctedTrackingNumbers: correctedTrackingNumbers.filter(tn => tn.trim()),
        overrideCarrier: overrideCarrier || undefined,
        overrideDeliveryDate: overrideDeliveryDate || undefined,
      };

      await processShipmentReview(result);

      onReviewComplete?.();
      onClose();
    } catch (error) {
      console.error('Failed to process shipment review:', error);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'in_transit': return 'bg-blue-100 text-blue-800';
      case 'out_for_delivery': return 'bg-yellow-100 text-yellow-800';
      case 'exception': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-gray-100 text-gray-800';
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Shipment Review</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="text-center py-8">Loading shipment data...</div>
          ) : shipments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No shipment data found for this purchase order.
            </div>
          ) : (
            <>
              {/* Shipment Selection */}
              {shipments.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Select Shipment to Review</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-2">
                      {shipments.map((shipment) => (
                        <div
                          key={shipment.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedShipment?.id === shipment.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => {
                            setSelectedShipment(shipment);
                            setCorrectedTrackingNumbers(shipment.trackingNumbers);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4" />
                              <span className="font-medium">
                                Shipment {shipment.shipmentNumber || shipment.id.slice(-8)}
                              </span>
                              <Badge className={getStatusColor(shipment.status)}>
                                {shipment.status.replace('_', ' ')}
                              </Badge>
                              {shipment.requiresReview && (
                                <Badge variant="destructive">Review Required</Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-600">
                              {shipment.trackingNumbers.length} tracking number{shipment.trackingNumbers.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedShipment && (
                <>
                  {/* Shipment Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        Shipment Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium">Shipment ID</Label>
                          <p className="text-sm text-gray-600">
                            {selectedShipment.shipmentNumber || selectedShipment.id.slice(-8)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Status</Label>
                          <Badge className={getStatusColor(selectedShipment.status)}>
                            {selectedShipment.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Carrier</Label>
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-gray-600">
                              {selectedShipment.carrier || 'Not detected'}
                            </p>
                            {selectedShipment.carrierConfidence && (
                              <Badge className={getConfidenceColor(selectedShipment.carrierConfidence)}>
                                {Math.round(selectedShipment.carrierConfidence * 100)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">AI Confidence</Label>
                          <Badge className={getConfidenceColor(selectedShipment.aiConfidence)}>
                            {selectedShipment.aiConfidence ? Math.round(selectedShipment.aiConfidence * 100) : 0}%
                          </Badge>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Ship Date</Label>
                          <p className="text-sm text-gray-600">
                            {selectedShipment.shipDate ? new Date(selectedShipment.shipDate).toLocaleDateString() : 'Not specified'}
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Estimated Delivery</Label>
                          <p className="text-sm text-gray-600">
                            {selectedShipment.estimatedDeliveryDate ? new Date(selectedShipment.estimatedDeliveryDate).toLocaleDateString() : 'Not specified'}
                          </p>
                        </div>
                      </div>

                      {selectedShipment.reviewReason && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            <span className="text-sm font-medium text-yellow-800">Review Required</span>
                          </div>
                          <p className="text-sm text-yellow-700 mt-1">{selectedShipment.reviewReason}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Tracking Numbers */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Tracking Numbers
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div>
                          <Label>Current Tracking Numbers</Label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {selectedShipment.trackingNumbers.map((tn, index) => (
                              <Badge key={index} variant="outline" className="font-mono">
                                {tn}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="corrected-tracking">Corrected Tracking Numbers (one per line)</Label>
                          <Textarea
                            id="corrected-tracking"
                            placeholder="Enter corrected tracking numbers..."
                            value={correctedTrackingNumbers.join('\n')}
                            onChange={(e) => setCorrectedTrackingNumbers(e.target.value.split('\n').filter(tn => tn.trim()))}
                            rows={3}
                            className="font-mono"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Override Options */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Override Information (Optional)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="override-carrier">Override Carrier</Label>
                          <Input
                            id="override-carrier"
                            placeholder="e.g., UPS, FedEx, USPS"
                            value={overrideCarrier}
                            onChange={(e) => setOverrideCarrier(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="override-delivery">Override Delivery Date</Label>
                          <Input
                            id="override-delivery"
                            type="date"
                            value={overrideDeliveryDate}
                            onChange={(e) => setOverrideDeliveryDate(e.target.value)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Review Notes */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Review Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        placeholder="Add any notes about this shipment review..."
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
                      Reject Shipment
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleSubmitReview('override')}
                      disabled={processing}
                    >
                      Override & Approve
                    </Button>
                    <Button
                      onClick={() => handleSubmitReview('approve')}
                      disabled={processing}
                    >
                      {processing ? 'Processing...' : 'Approve Shipment'}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}