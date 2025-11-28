import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { Alert, AlertDescription } from './ui/Alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/Dialog';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import {
  FileTextIcon,
  DownloadIcon,
  CheckCircleIcon,
  ClockIcon,
  AlertTriangleIcon,
  PlayIcon,
  SquareIcon,
  StarIcon,
  PlusIcon
} from './ui/Icons';

import type {
  StandardOperatingProcedure,
  BuildOrder,
  SOPUsageLog,
  User
} from '../types';
import {
  getSOPsForBOM,
  attachSOPToBuildOrder,
  logSOPUsage,
  completeSOPUsage,
  getSOPStatistics
} from '../services/sopService';

interface SOPBuildOrderIntegrationProps {
  buildOrder: BuildOrder;
  bomName: string;
  currentUser: User;
  onSOPAttached?: (sop: StandardOperatingProcedure) => void;
}

export default function SOPBuildOrderIntegration({
  buildOrder,
  bomName,
  currentUser,
  onSOPAttached
}: SOPBuildOrderIntegrationProps) {
  const [availableSOPs, setAvailableSOPs] = useState<StandardOperatingProcedure[]>([]);
  const [attachedSOPs, setAttachedSOPs] = useState<StandardOperatingProcedure[]>([]);
  const [activeUsage, setActiveUsage] = useState<SOPUsageLog | null>(null);
  const [showAttachDialog, setShowAttachDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [selectedSOP, setSelectedSOP] = useState<string>('');
  const [completionRating, setCompletionRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionIssues, setCompletionIssues] = useState<string[]>([]);
  const [newIssue, setNewIssue] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSOPs();
  }, [buildOrder.finishedSku]);

  const loadSOPs = async () => {
    try {
      setLoading(true);
      // Get SOPs for this BOM (we'll need to implement this in the service)
      const sops = await getSOPsForBOM(buildOrder.finishedSku);

      // Separate attached and available SOPs
      const attached = sops.filter(sop => sop.attachedToBuildOrders?.includes(buildOrder.id));
      const available = sops.filter(sop => !sop.attachedToBuildOrders?.includes(buildOrder.id));

      setAttachedSOPs(attached);
      setAvailableSOPs(available);
    } catch (error) {
      console.error('Failed to load SOPs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAttachSOP = async () => {
    if (!selectedSOP) return;

    try {
      const sop = availableSOPs.find(s => s.id === selectedSOP);
      if (!sop) return;

      await attachSOPToBuildOrder(sop.id, buildOrder.id);

      // Update local state
      setAttachedSOPs([...attachedSOPs, sop]);
      setAvailableSOPs(availableSOPs.filter(s => s.id !== selectedSOP));
      setSelectedSOP('');
      setShowAttachDialog(false);

      if (onSOPAttached) {
        onSOPAttached(sop);
      }
    } catch (error) {
      console.error('Failed to attach SOP:', error);
    }
  };

  const handleStartSOP = async (sop: StandardOperatingProcedure) => {
    try {
      const usageLog = await logSOPUsage(
        sop.id,
        buildOrder.id,
        currentUser.id,
        currentUser.name,
        `Started following SOP for build order ${buildOrder.id}`
      );

      setActiveUsage(usageLog);
    } catch (error) {
      console.error('Failed to start SOP usage:', error);
    }
  };

  const handleCompleteSOP = async () => {
    if (!activeUsage) return;

    try {
      await completeSOPUsage(
        activeUsage.id,
        completionRating,
        completionIssues.length > 0 ? completionIssues : undefined
      );

      // Reset state
      setActiveUsage(null);
      setCompletionRating(5);
      setCompletionNotes('');
      setCompletionIssues([]);
      setNewIssue('');
      setShowCompleteDialog(false);

      // Reload SOPs to get updated statistics
      await loadSOPs();
    } catch (error) {
      console.error('Failed to complete SOP usage:', error);
    }
  };

  const handleAddIssue = () => {
    if (newIssue.trim()) {
      setCompletionIssues([...completionIssues, newIssue.trim()]);
      setNewIssue('');
    }
  };

  const handleRemoveIssue = (index: number) => {
    setCompletionIssues(completionIssues.filter((_, i) => i !== index));
  };

  const downloadSOP = (sop: StandardOperatingProcedure) => {
    if (!sop.pdfUrl) return;

    const link = document.createElement('a');
    link.href = sop.pdfUrl;
    link.download = `${sop.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_v${sop.version}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Standard Operating Procedures</h3>
          <p className="text-sm text-gray-600">
            Attach and follow SOPs for {bomName} production
          </p>
        </div>

        {availableSOPs.length > 0 && (
          <Dialog open={showAttachDialog} onOpenChange={setShowAttachDialog}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <PlusIcon className="h-4 w-4" />
                Attach SOP
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Attach SOP to Build Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Select SOP</label>
                  <Select value={selectedSOP} onValueChange={setSelectedSOP}>
                    <option value="">Choose an SOP...</option>
                    {availableSOPs.map(sop => (
                      <option key={sop.id} value={sop.id}>
                        {sop.title} (v{sop.version})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAttachDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAttachSOP} disabled={!selectedSOP}>
                    Attach SOP
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* No SOPs Available */}
      {attachedSOPs.length === 0 && availableSOPs.length === 0 && (
        <Alert>
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertDescription>
            No SOPs are available for this BOM. Create an SOP first using the SOP Creator tool.
          </AlertDescription>
        </Alert>
      )}

      {/* Attached SOPs */}
      {attachedSOPs.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium">Attached SOPs ({attachedSOPs.length})</h4>

          {attachedSOPs.map(sop => (
            <Card key={sop.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileTextIcon className="h-5 w-5" />
                    {sop.title}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={sop.status === 'approved' ? 'default' : 'secondary'}>
                      {sop.status}
                    </Badge>
                    <Badge variant="outline">v{sop.version}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                  <div className="flex items-center gap-1">
                    <ClockIcon className="h-4 w-4 text-gray-500" />
                    <span>{sop.estimatedTimeMinutes} min</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Difficulty:</span> {sop.difficulty}
                  </div>
                  <div>
                    <span className="text-gray-500">Safety:</span> {sop.safetyLevel}
                  </div>
                  <div>
                    <span className="text-gray-500">Used:</span> {sop.usageCount} times
                  </div>
                </div>

                {sop.description && (
                  <p className="text-sm text-gray-600 mb-4">{sop.description}</p>
                )}

                {/* Active Usage Indicator */}
                {activeUsage && activeUsage.sopId === sop.id && (
                  <Alert className="mb-4">
                    <PlayIcon className="h-4 w-4" />
                    <AlertDescription>
                      You are currently following this SOP.
                      <Button
                        size="sm"
                        className="ml-2"
                        onClick={() => setShowCompleteDialog(true)}
                      >
                        Mark Complete
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadSOP(sop)}
                    className="flex items-center gap-1"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Download PDF
                  </Button>

                  {!activeUsage || activeUsage.sopId !== sop.id ? (
                    <Button
                      size="sm"
                      onClick={() => handleStartSOP(sop)}
                      className="flex items-center gap-1"
                    >
                      <PlayIcon className="h-4 w-4" />
                      Start Following
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setShowCompleteDialog(true)}
                      className="flex items-center gap-1"
                    >
                      <SquareIcon className="h-4 w-4" />
                      Complete
                    </Button>
                  )}
                </div>

                {/* Usage Statistics */}
                {sop.usageCount > 0 && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <h5 className="font-medium text-sm mb-2">Usage Statistics</h5>
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-gray-500">Times Used:</span>
                        <div className="font-medium">{sop.usageCount}</div>
                      </div>
                      {sop.averageCompletionTime && (
                        <div>
                          <span className="text-gray-500">Avg Time:</span>
                          <div className="font-medium">{sop.averageCompletionTime} min</div>
                        </div>
                      )}
                      {sop.successRate !== undefined && (
                        <div>
                          <span className="text-gray-500">Success Rate:</span>
                          <div className="font-medium">{sop.successRate}%</div>
                        </div>
                      )}
                    </div>
                    {sop.commonIssues && sop.commonIssues.length > 0 && (
                      <div className="mt-2">
                        <span className="text-gray-500 text-xs">Common Issues:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {sop.commonIssues.slice(0, 3).map((issue, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {issue}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Completion Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete SOP Usage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">How did it go?</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(rating => (
                  <Button
                    key={rating}
                    size="sm"
                    variant={completionRating === rating ? "default" : "outline"}
                    onClick={() => setCompletionRating(rating)}
                    className="flex items-center gap-1"
                  >
                    <StarIcon className="h-4 w-4" />
                    {rating}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Issues Encountered (optional)</label>
              <div className="space-y-2">
                {completionIssues.map((issue, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                    <span className="text-sm flex-1">{issue}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveIssue(index)}
                      className="h-6 w-6 p-0"
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newIssue}
                    onChange={(e) => setNewIssue(e.target.value)}
                    placeholder="Add an issue..."
                    className="flex-1 px-3 py-1 text-sm border rounded"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddIssue()}
                  />
                  <Button size="sm" onClick={handleAddIssue} disabled={!newIssue.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notes (optional)</label>
              <Textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
                placeholder="Any additional notes about following this SOP..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCompleteSOP}>
                Complete SOP
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}