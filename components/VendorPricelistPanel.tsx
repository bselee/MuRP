import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import {
  Upload,
  FileText,
  TrendingUp,
  TrendingDown,
  Plus,
  Download,
  Share2,
  Eye,
  History,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileSpreadsheet,
  Mail,
  Cloud
} from 'lucide-react';
import {
  uploadPricelist,
  getCurrentPricelists,
  getPricelistHistory,
  getPricelistInsights,
  generateInsightsSummary,
  comparePricelistVersions,
  extractFromGoogleDocs,
  extractFromExcel
} from '../services/vendorPricelistService';
import { useSupabaseData } from '../hooks/useSupabaseData';
import type { VendorPricelist, PricelistInsights } from '../types';

interface PricelistUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  onUploadComplete: () => void;
}

const PricelistUploadModal: React.FC<PricelistUploadModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  onUploadComplete
}) => {
  const [uploadType, setUploadType] = useState<'file' | 'google' | 'email'>('file');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [googleDocId, setGoogleDocId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!name.trim()) {
      setError('Pricelist name is required');
      return;
    }

    setUploading(true);
    setError('');

    try {
      if (uploadType === 'google' && googleDocId) {
        await uploadPricelist({
          vendorId,
          name,
          description,
          effectiveDate,
          googleDocId,
          source: 'google_docs'
        });
      } else if (uploadType === 'file' && file) {
        await uploadPricelist({
          vendorId,
          name,
          description,
          effectiveDate,
          file,
          source: 'upload'
        });
      } else {
        throw new Error('Please provide the required information for the selected upload type');
      }

      onUploadComplete();
      onClose();
      // Reset form
      setName('');
      setDescription('');
      setEffectiveDate('');
      setGoogleDocId('');
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Upload Vendor Pricelist</h3>

        <div className="space-y-4">
          {/* Upload Type Selection */}
          <div>
            <Label className="text-sm font-medium">Upload Method</Label>
            <div className="flex gap-2 mt-2">
              <Button
                variant={uploadType === 'file' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setUploadType('file')}
              >
                <Upload className="w-4 h-4 mr-2" />
                File Upload
              </Button>
              <Button
                variant={uploadType === 'google' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setUploadType('google')}
              >
                <Cloud className="w-4 h-4 mr-2" />
                Google Docs
              </Button>
            </div>
          </div>

          {/* Common Fields */}
          <div>
            <Label htmlFor="name">Pricelist Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q4 2025 Pricing Update"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this pricelist"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="effectiveDate">Effective Date</Label>
            <Input
              id="effectiveDate"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>

          {/* Type-specific fields */}
          {uploadType === 'file' && (
            <div>
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Supported: Excel (.xlsx, .xls), CSV, PDF
              </p>
            </div>
          )}

          {uploadType === 'google' && (
            <div>
              <Label htmlFor="googleDocId">Google Doc ID</Label>
              <Input
                id="googleDocId"
                value={googleDocId}
                onChange={(e) => setGoogleDocId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              />
              <p className="text-xs text-gray-500 mt-1">
                Paste the document ID from the Google Docs URL
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 pt-4">
            <Button onClick={handleUpload} disabled={uploading} className="flex-1">
              {uploading ? 'Uploading...' : 'Upload Pricelist'}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface InsightsSummaryProps {
  insights: PricelistInsights;
  vendorName: string;
}

const InsightsSummary: React.FC<InsightsSummaryProps> = ({ insights, vendorName }) => {
  const [summary, setSummary] = useState('');
  const [generating, setGenerating] = useState(false);

  const generateSummary = async () => {
    setGenerating(true);
    try {
      const generatedSummary = await generateInsightsSummary(insights.changes[0]?.pricelist_id || '');
      setSummary(generatedSummary);
    } catch (error) {
      setSummary('Error generating summary');
    } finally {
      setGenerating(false);
    }
  };

  const significantChanges = insights.changes.filter(c => c.severity === 'high' || c.severity === 'critical');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Pricelist Insights - {vendorName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{insights.currentVersion}</div>
            <div className="text-sm text-gray-500">Current Version</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{insights.totalProducts}</div>
            <div className="text-sm text-gray-500">Total Products</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{insights.priceChangesLastVersion}</div>
            <div className="text-sm text-gray-500">Price Changes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{insights.significantChanges}</div>
            <div className="text-sm text-gray-500">Significant</div>
          </div>
        </div>

        {/* Average Change */}
        {insights.avgPriceChangePercentage > 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-sm">
              Average price change: <strong>+{insights.avgPriceChangePercentage.toFixed(1)}%</strong>
            </span>
          </div>
        )}

        {/* Significant Changes Alert */}
        {significantChanges.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>{significantChanges.length} significant changes detected</strong> requiring attention
            </AlertDescription>
          </Alert>
        )}

        {/* Recent Changes */}
        <div>
          <h4 className="font-medium mb-2">Recent Changes</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {insights.changes.slice(0, 5).map((change, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {change.changeType === 'price_increase' && <TrendingUp className="w-3 h-3 text-red-500" />}
                  {change.changeType === 'price_decrease' && <TrendingDown className="w-3 h-3 text-green-500" />}
                  {change.changeType === 'new_product' && <Plus className="w-3 h-3 text-blue-500" />}
                  <span className="truncate">{change.productDescription || change.sku}</span>
                </div>
                <div className="flex items-center gap-2">
                  {change.percentageChange && (
                    <Badge variant={change.percentageChange > 0 ? 'destructive' : 'secondary'}>
                      {change.percentageChange > 0 ? '+' : ''}{change.percentageChange.toFixed(1)}%
                    </Badge>
                  )}
                  <Badge variant={
                    change.severity === 'critical' ? 'destructive' :
                    change.severity === 'high' ? 'default' :
                    'secondary'
                  }>
                    {change.severity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Generate Summary */}
        <div className="pt-4 border-t">
          <Button onClick={generateSummary} disabled={generating} className="w-full">
            <Share2 className="w-4 h-4 mr-2" />
            {generating ? 'Generating...' : 'Generate Team Summary'}
          </Button>

          {summary && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{summary}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const VendorPricelistPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('current');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [insights, setInsights] = useState<PricelistInsights | null>(null);
  const [loading, setLoading] = useState(false);

  const { vendors } = useSupabaseData();
  const [currentPricelists, setCurrentPricelists] = useState<VendorPricelist[]>([]);
  const [history, setHistory] = useState<VendorPricelist[]>([]);

  useEffect(() => {
    loadCurrentPricelists();
  }, []);

  const loadCurrentPricelists = async () => {
    try {
      const pricelists = await getCurrentPricelists();
      setCurrentPricelists(pricelists);
    } catch (error) {
      console.error('Error loading pricelists:', error);
    }
  };

  const loadVendorHistory = async (vendorId: string) => {
    try {
      const historyData = await getPricelistHistory(vendorId);
      setHistory(historyData);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const loadInsights = async (vendorId: string) => {
    setLoading(true);
    try {
      const insightsData = await getPricelistInsights(vendorId);
      setInsights(insightsData);
    } catch (error) {
      console.error('Error loading insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVendorSelect = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    loadVendorHistory(vendorId);
    loadInsights(vendorId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'extracted': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'google_docs': return <Cloud className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      default: return <FileSpreadsheet className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Vendor Pricelists</h2>
          <p className="text-gray-600">Manage current and archived vendor pricing with automated change tracking</p>
        </div>
        <Button onClick={() => setUploadModalOpen(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Upload Pricelist
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="current">Current Pricelists</TabsTrigger>
          <TabsTrigger value="insights">Insights & Changes</TabsTrigger>
          <TabsTrigger value="history">Version History</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-4">
          <div className="grid gap-4">
            {currentPricelists.map((pricelist) => {
              const vendor = vendors.find(v => v.id === pricelist.vendorId);
              return (
                <Card key={pricelist.id} className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleVendorSelect(pricelist.vendorId)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getSourceIcon(pricelist.source || 'upload')}
                        <div>
                          <h3 className="font-medium">{pricelist.name}</h3>
                          <p className="text-sm text-gray-600">{vendor?.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(pricelist.extractionStatus)}
                        <Badge variant="outline">v{pricelist.version}</Badge>
                        <span className="text-sm text-gray-500">
                          {pricelist.extractedItemsCount} items
                        </span>
                      </div>
                    </div>

                    {pricelist.effectiveDate && (
                      <p className="text-sm text-gray-500 mt-2">
                        Effective: {new Date(pricelist.effectiveDate).toLocaleDateString()}
                      </p>
                    )}

                    {pricelist.extractionStatus === 'error' && pricelist.extractionError && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          {pricelist.extractionError}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {currentPricelists.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No pricelists uploaded yet</h3>
                  <p className="text-gray-600 mb-4">
                    Upload vendor pricelists to track pricing changes and get insights
                  </p>
                  <Button onClick={() => setUploadModalOpen(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload First Pricelist
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          {selectedVendorId ? (
            loading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p>Loading insights...</p>
                </CardContent>
              </Card>
            ) : insights ? (
              <InsightsSummary
                insights={insights}
                vendorName={vendors.find(v => v.id === selectedVendorId)?.name || 'Unknown Vendor'}
              />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p>No insights available for this vendor</p>
                </CardContent>
              </Card>
            )
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Select a Vendor</h3>
                <p className="text-gray-600">
                  Choose a vendor from the Current Pricelists tab to view insights
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {selectedVendorId ? (
            <div className="space-y-4">
              {history.map((pricelist) => (
                <Card key={pricelist.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getSourceIcon(pricelist.source || 'upload')}
                        <div>
                          <h3 className="font-medium">{pricelist.name}</h3>
                          <p className="text-sm text-gray-600">
                            Uploaded {new Date(pricelist.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(pricelist.extractionStatus)}
                        <Badge variant={pricelist.isCurrent ? 'default' : 'secondary'}>
                          v{pricelist.version}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {pricelist.extractedItemsCount} items
                        </span>
                      </div>
                    </div>

                    {pricelist.changesSummary && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>New: <strong>{pricelist.changesSummary.new_products || 0}</strong></div>
                          <div>Price Changes: <strong>{pricelist.changesSummary.price_changes || 0}</strong></div>
                          <div>Removed: <strong>{pricelist.changesSummary.removed_products || 0}</strong></div>
                          <div>Significant: <strong>{pricelist.changesSummary.significant_changes || 0}</strong></div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {history.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p>No history available for this vendor</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Select a Vendor</h3>
                <p className="text-gray-600">
                  Choose a vendor from the Current Pricelists tab to view version history
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <PricelistUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        vendorId={selectedVendorId}
        onUploadComplete={loadCurrentPricelists}
      />
    </div>
  );
};

export default VendorPricelistPanel;