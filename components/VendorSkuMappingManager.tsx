import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Alert, AlertDescription } from './ui/alert';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { supabase } from '../lib/supabase';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Link,
  Unlink,
  AlertTriangle,
  CheckCircle,
  Target
} from 'lucide-react';

interface VendorSkuMapping {
  id: string;
  vendor_id: string;
  vendor_sku: string;
  internal_sku: string;
  confidence_score: number;
  mapping_source: string;
  mapped_by?: string;
  mapped_at: string;
  last_verified?: string;
  is_active: boolean;
  vendor_name?: string;
  product_name?: string;
  current_cost?: number;
  current_price?: number;
}

interface MappingSuggestion {
  vendor_sku: string;
  internal_sku: string;
  confidence_score: number;
  reasoning: string;
  vendor_name: string;
  product_name?: string;
}

export default function VendorSkuMappingManager() {
  const [mappings, setMappings] = useState<VendorSkuMapping[]>([]);
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [filterConfidence, setFilterConfidence] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSuggestionsDialog, setShowSuggestionsDialog] = useState(false);

  const { vendors, inventoryItems } = useSupabaseData();

  // Form state for creating new mappings
  const [newMapping, setNewMapping] = useState({
    vendor_id: '',
    vendor_sku: '',
    internal_sku: '',
    confidence_score: 100,
    mapping_source: 'manual'
  });

  useEffect(() => {
    loadMappings();
    loadSuggestions();
  }, []);

  const loadMappings = async () => {
    try {
      const { data, error } = await supabase
        .from('vendor_sku_mappings')
        .select(`
          *,
          vendors(name),
          inventory_items(product_name, current_cost, current_price)
        `)
        .eq('is_active', true)
        .order('mapped_at', { ascending: false });

      if (error) throw error;

      const formattedMappings = data.map(mapping => ({
        ...mapping,
        vendor_name: mapping.vendors?.name,
        product_name: mapping.inventory_items?.product_name,
        current_cost: mapping.inventory_items?.current_cost,
        current_price: mapping.inventory_items?.current_price
      }));

      setMappings(formattedMappings);
    } catch (error) {
      console.error('Error loading vendor SKU mappings:', error);
    }
  };

  const loadSuggestions = async () => {
    try {
      // This would typically call an AI service to generate suggestions
      // For now, we'll simulate some suggestions
      const mockSuggestions: MappingSuggestion[] = [
        {
          vendor_sku: 'ABC-123',
          internal_sku: 'INT-456',
          confidence_score: 85,
          reasoning: 'Similar product descriptions and pricing patterns',
          vendor_name: 'Vendor A',
          product_name: 'Widget Component'
        },
        {
          vendor_sku: 'XYZ-789',
          internal_sku: 'INT-012',
          confidence_score: 92,
          reasoning: 'Exact part number match in vendor catalog',
          vendor_name: 'Vendor B',
          product_name: 'Gadget Assembly'
        }
      ];

      setSuggestions(mockSuggestions);
    } catch (error) {
      console.error('Error loading mapping suggestions:', error);
    }
  };

  const handleCreateMapping = async () => {
    try {
      const { error } = await supabase
        .from('vendor_sku_mappings')
        .insert({
          ...newMapping,
          mapped_by: 'current_user', // TODO: Get from auth context
          mapped_at: new Date().toISOString(),
          is_active: true
        });

      if (error) throw error;

      setShowCreateDialog(false);
      setNewMapping({
        vendor_id: '',
        vendor_sku: '',
        internal_sku: '',
        confidence_score: 100,
        mapping_source: 'manual'
      });

      await loadMappings();

    } catch (error) {
      console.error('Error creating vendor SKU mapping:', error);
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    try {
      const { error } = await supabase
        .from('vendor_sku_mappings')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', mappingId);

      if (error) throw error;

      await loadMappings();

    } catch (error) {
      console.error('Error deleting vendor SKU mapping:', error);
    }
  };

  const handleApplySuggestion = async (suggestion: MappingSuggestion) => {
    try {
      const vendor = vendors.find(v => v.name === suggestion.vendor_name);
      if (!vendor) return;

      const { error } = await supabase
        .from('vendor_sku_mappings')
        .insert({
          vendor_id: vendor.id,
          vendor_sku: suggestion.vendor_sku,
          internal_sku: suggestion.internal_sku,
          confidence_score: suggestion.confidence_score,
          mapping_source: 'ai_suggestion',
          mapped_by: 'current_user', // TODO: Get from auth context
          mapped_at: new Date().toISOString(),
          is_active: true
        });

      if (error) throw error;

      // Remove the applied suggestion
      setSuggestions(prev => prev.filter(s =>
        !(s.vendor_sku === suggestion.vendor_sku && s.internal_sku === suggestion.internal_sku)
      ));

      await loadMappings();

    } catch (error) {
      console.error('Error applying mapping suggestion:', error);
    }
  };

  const filteredMappings = mappings.filter(mapping => {
    const matchesSearch = !searchTerm ||
      mapping.vendor_sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mapping.internal_sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mapping.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mapping.product_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesVendor = filterVendor === 'all' || mapping.vendor_id === filterVendor;
    const matchesConfidence = filterConfidence === 'all' ||
      (filterConfidence === 'high' && mapping.confidence_score >= 80) ||
      (filterConfidence === 'medium' && mapping.confidence_score >= 50 && mapping.confidence_score < 80) ||
      (filterConfidence === 'low' && mapping.confidence_score < 50);

    return matchesSearch && matchesVendor && matchesConfidence;
  });

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 50) return 'secondary';
    return 'destructive';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vendor SKU Mapping</h1>
          <p className="text-muted-foreground">Manage mappings between vendor part numbers and internal SKUs</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showSuggestionsDialog} onOpenChange={setShowSuggestionsDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Target className="h-4 w-4 mr-2" />
                AI Suggestions ({suggestions.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>AI Mapping Suggestions</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {suggestions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor SKU</TableHead>
                        <TableHead>Internal SKU</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Reasoning</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suggestions.map((suggestion, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{suggestion.vendor_sku}</div>
                              <div className="text-sm text-muted-foreground">{suggestion.vendor_name}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{suggestion.internal_sku}</div>
                              <div className="text-sm text-muted-foreground">{suggestion.product_name}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getConfidenceBadge(suggestion.confidence_score)}>
                              {suggestion.confidence_score}%
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="text-sm">{suggestion.reasoning}</div>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => handleApplySuggestion(suggestion)}
                            >
                              Apply
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      No mapping suggestions available at this time.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Mapping
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Vendor SKU Mapping</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="vendor">Vendor</Label>
                  <Select
                    value={newMapping.vendor_id}
                    onValueChange={(value) => setNewMapping(prev => ({ ...prev, vendor_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map(vendor => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="vendor_sku">Vendor SKU</Label>
                  <Input
                    id="vendor_sku"
                    value={newMapping.vendor_sku}
                    onChange={(e) => setNewMapping(prev => ({ ...prev, vendor_sku: e.target.value }))}
                    placeholder="Enter vendor part number"
                  />
                </div>

                <div>
                  <Label htmlFor="internal_sku">Internal SKU</Label>
                  <Select
                    value={newMapping.internal_sku}
                    onValueChange={(value) => setNewMapping(prev => ({ ...prev, internal_sku: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select internal SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryItems.map(item => (
                        <SelectItem key={item.id} value={item.sku}>
                          {item.sku} - {item.product_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="confidence">Confidence Score (%)</Label>
                  <Input
                    id="confidence"
                    type="number"
                    min="0"
                    max="100"
                    value={newMapping.confidence_score}
                    onChange={(e) => setNewMapping(prev => ({ ...prev, confidence_score: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateMapping}>
                    Create Mapping
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <Input
                placeholder="Search mappings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>

            <Select value={filterVendor} onValueChange={setFilterVendor}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {vendors.map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterConfidence} onValueChange={setFilterConfidence}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="All Confidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Confidence</SelectItem>
                <SelectItem value="high">High (80%+)</SelectItem>
                <SelectItem value="medium">Medium (50-79%)</SelectItem>
                <SelectItem value="low">Low (&lt;50%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Mappings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Mappings ({filteredMappings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredMappings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor SKU</TableHead>
                  <TableHead>Internal SKU</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Mapped Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMappings.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-medium">{mapping.vendor_sku}</TableCell>
                    <TableCell className="font-medium">{mapping.internal_sku}</TableCell>
                    <TableCell>{mapping.vendor_name}</TableCell>
                    <TableCell>{mapping.product_name}</TableCell>
                    <TableCell>
                      <Badge variant={getConfidenceBadge(mapping.confidence_score)}>
                        {mapping.confidence_score}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{mapping.mapping_source}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(mapping.mapped_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteMapping(mapping.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {mappings.length === 0
                  ? 'No vendor SKU mappings found. Create your first mapping to get started.'
                  : 'No mappings match your current filters.'
                }
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}