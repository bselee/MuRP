import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { supabase } from '../lib/supabase';
import { Edit, Save, X, DollarSign, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import ProductReorderIntelligence from './ProductReorderIntelligence';

interface InventoryItemPanelProps {
  sku: string;
  onClose?: () => void;
}

interface ProductPricing {
  id: string;
  internal_sku: string;
  vendor_id: string;
  current_unit_cost: number;
  current_unit_price: number;
  current_currency: string;
  current_effective_date: string;
  pricing_strategy: string;
  markup_percentage: number;
  margin_percentage: number;
  approval_status: string;
  approved_by?: string;
  approved_at?: string;
  approval_notes?: string;
  vendor_pricelist_id?: string;
  vendor_sku_mapping_id?: string;
}

interface PricingProposal {
  id: string;
  proposed_unit_cost: number;
  proposed_unit_price: number;
  cost_change_percentage: number;
  price_change_percentage: number;
  change_impact: string;
  change_reason: string;
  created_at: string;
  vendor_sku?: string;
  vendor_product_name?: string;
}

interface VendorSkuMapping {
  id: string;
  vendor_id: string;
  vendor_sku: string;
  vendor_product_name?: string;
  mapping_confidence: number;
  mapping_source: string;
  is_active: boolean;
}

export default function InventoryItemPanel({ sku, onClose }: InventoryItemPanelProps) {
  const [inventoryItem, setInventoryItem] = useState<any>(null);
  const [productPricing, setProductPricing] = useState<ProductPricing | null>(null);
  const [pricingProposals, setPricingProposals] = useState<PricingProposal[]>([]);
  const [vendorMappings, setVendorMappings] = useState<VendorSkuMapping[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { vendors } = useSupabaseData();

  useEffect(() => {
    loadData();
  }, [sku]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load inventory item
      const { data: item, error: itemError } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('sku', sku)
        .single();

      if (itemError) throw itemError;
      setInventoryItem(item);
      setEditForm(item);

      // Load product pricing
      const { data: pricing, error: pricingError } = await supabase
        .from('product_pricing')
        .select('*')
        .eq('internal_sku', sku)
        .maybeSingle();

      if (pricingError && pricingError.code !== 'PGRST116') throw pricingError;
      setProductPricing(pricing);

      // Load pricing proposals
      if (pricing) {
        const { data: proposals, error: proposalsError } = await supabase
          .from('pricing_change_proposals')
          .select('*')
          .eq('product_pricing_id', pricing.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (proposalsError) throw proposalsError;
        setPricingProposals(proposals || []);
      }

      // Load vendor SKU mappings
      const { data: mappings, error: mappingsError } = await supabase
        .from('vendor_sku_mappings')
        .select('*')
        .eq('internal_sku', sku)
        .eq('is_active', true);

      if (mappingsError) throw mappingsError;
      setVendorMappings(mappings || []);

    } catch (error) {
      console.error('Error loading inventory item data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('inventory_items')
        .update({
          name: editForm.name,
          description: editForm.description,
          category: editForm.category,
          reorder_point: editForm.reorder_point,
          moq: editForm.moq,
          unit_cost: editForm.unit_cost,
          unit_price: editForm.unit_price,
          currency: editForm.currency,
          status: editForm.status,
          vendor_id: editForm.vendor_id,
          supplier_sku: editForm.supplier_sku,
          weight: editForm.weight,
          weight_unit: editForm.weight_unit,
          dimensions: editForm.dimensions,
          upc: editForm.upc,
          warehouse_location: editForm.warehouse_location,
          bin_location: editForm.bin_location,
          updated_at: new Date().toISOString()
        })
        .eq('sku', sku);

      if (error) throw error;

      setInventoryItem(editForm);
      setIsEditing(false);

      // Reload data to get updated pricing info
      await loadData();

    } catch (error) {
      console.error('Error saving inventory item:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveProposal = async (proposalId: string) => {
    try {
      const { error } = await supabase.rpc('approve_pricing_change', {
        p_proposal_id: proposalId,
        p_approved_by: 'current_user', // TODO: Get from auth context
        p_approval_notes: 'Approved via inventory panel'
      });

      if (error) throw error;

      // Reload data
      await loadData();

    } catch (error) {
      console.error('Error approving pricing proposal:', error);
    }
  };

  const calculateMargin = (cost: number, price: number) => {
    if (!cost || cost === 0) return 0;
    return Math.round(((price - cost) / cost) * 100 * 100) / 100;
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <Card className="w-full max-w-4xl">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!inventoryItem) {
    return (
      <Card className="w-full max-w-4xl">
        <CardContent className="p-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Inventory item not found.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span>{inventoryItem.name}</span>
            <Badge variant={inventoryItem.status === 'active' ? 'default' : 'secondary'}>
              {inventoryItem.status}
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">SKU: {inventoryItem.sku}</p>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button onClick={handleSave} disabled={saving} size="sm">
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button onClick={() => setIsEditing(false)} variant="outline" size="sm">
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
          {onClose && (
            <Button onClick={onClose} variant="ghost" size="sm">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reorder">Reorder Analytics</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="proposals">Proposals</TabsTrigger>
            <TabsTrigger value="mappings">Vendor Mappings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>

                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">Product Name</Label>
                      <Input
                        id="name"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="category">Category</Label>
                      <Input
                        id="category"
                        value={editForm.category || ''}
                        onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={editForm.status || 'active'}
                        onValueChange={(value) => setEditForm({...editForm, status: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="discontinued">Discontinued</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p><strong>Description:</strong> {inventoryItem.description || 'No description'}</p>
                    <p><strong>Category:</strong> {inventoryItem.category || 'Uncategorized'}</p>
                    <p><strong>Status:</strong> <Badge variant={inventoryItem.status === 'active' ? 'default' : 'secondary'}>{inventoryItem.status}</Badge></p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Stock Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{inventoryItem.units_in_stock || 0}</div>
                    <div className="text-sm text-blue-600">In Stock</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{inventoryItem.units_available || 0}</div>
                    <div className="text-sm text-orange-600">Available</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{inventoryItem.reorder_point || 0}</div>
                    <div className="text-sm text-green-600">Reorder Point</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{inventoryItem.moq || 0}</div>
                    <div className="text-sm text-purple-600">MOQ</div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reorder" className="space-y-6">
            <ProductReorderIntelligence
              sku={inventoryItem.sku}
              productName={inventoryItem.name}
            />
          </TabsContent>

          <TabsContent value="pricing" className="space-y-6">
            {productPricing ? (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">Current Cost</span>
                      </div>
                      <div className="text-2xl font-bold">
                        ${productPricing.current_unit_cost?.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Effective: {new Date(productPricing.current_effective_date).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">Selling Price</span>
                      </div>
                      <div className="text-2xl font-bold">
                        ${productPricing.current_unit_price?.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Margin: {calculateMargin(productPricing.current_unit_cost, productPricing.current_unit_price)}%
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">Approval Status</span>
                      </div>
                      <div className="text-lg font-bold">
                        <Badge variant={productPricing.approval_status === 'approved' ? 'default' : 'secondary'}>
                          {productPricing.approval_status}
                        </Badge>
                      </div>
                      {productPricing.approved_by && (
                        <div className="text-xs text-muted-foreground">
                          By {productPricing.approved_by}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Pricing Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Pricing Strategy</Label>
                      <p className="text-sm text-muted-foreground">{productPricing.pricing_strategy || 'Not set'}</p>
                    </div>
                    <div>
                      <Label>Currency</Label>
                      <p className="text-sm text-muted-foreground">{productPricing.current_currency || 'USD'}</p>
                    </div>
                    <div>
                      <Label>Markup %</Label>
                      <p className="text-sm text-muted-foreground">{productPricing.markup_percentage || 0}%</p>
                    </div>
                    <div>
                      <Label>Margin %</Label>
                      <p className="text-sm text-muted-foreground">{productPricing.margin_percentage || 0}%</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No pricing information available for this item. Pricing data will be created when vendor pricelists are processed.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="proposals" className="space-y-4">
            {pricingProposals.length > 0 ? (
              <div className="space-y-4">
                {pricingProposals.map((proposal) => (
                  <Card key={proposal.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={getImpactColor(proposal.change_impact)}>
                              {proposal.change_impact}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Created {new Date(proposal.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className="text-sm text-muted-foreground">Current Cost</div>
                              <div className="font-medium">${productPricing?.current_unit_cost?.toFixed(2) || '0.00'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Proposed Cost</div>
                              <div className="font-medium">${proposal.proposed_unit_cost?.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Current Price</div>
                              <div className="font-medium">${productPricing?.current_unit_price?.toFixed(2) || '0.00'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Proposed Price</div>
                              <div className="font-medium">${proposal.proposed_unit_price?.toFixed(2)}</div>
                            </div>
                          </div>

                          <div className="text-sm text-muted-foreground mb-2">
                            {proposal.change_reason}
                          </div>

                          {proposal.vendor_sku && (
                            <div className="text-sm text-muted-foreground">
                              Vendor SKU: {proposal.vendor_sku}
                              {proposal.vendor_product_name && ` (${proposal.vendor_product_name})`}
                            </div>
                          )}
                        </div>

                        <Button
                          onClick={() => handleApproveProposal(proposal.id)}
                          size="sm"
                          className="ml-4"
                        >
                          Approve
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>No pending pricing proposals for this item.</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="mappings" className="space-y-4">
            {vendorMappings.length > 0 ? (
              <div className="space-y-4">
                {vendorMappings.map((mapping) => {
                  const vendor = vendors.find(v => v.id === mapping.vendor_id);
                  return (
                    <Card key={mapping.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{vendor?.name || 'Unknown Vendor'}</div>
                            <div className="text-sm text-muted-foreground">
                              Vendor SKU: {mapping.vendor_sku}
                              {mapping.vendor_product_name && ` (${mapping.vendor_product_name})`}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Confidence: {Math.round(mapping.mapping_confidence * 100)}% •
                              Source: {mapping.mapping_source}
                            </div>
                          </div>
                          <Badge variant={mapping.is_active ? 'default' : 'secondary'}>
                            {mapping.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>No vendor SKU mappings found for this item.</AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}