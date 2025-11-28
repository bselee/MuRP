import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { supabase } from '../lib/supabase';
import {
  Search,
  Filter,
  Eye,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  User,
  FileText
} from 'lucide-react';

interface PricingAuditEntry {
  id: string;
  product_pricing_id: string;
  change_type: string;
  change_reason: string;
  old_values: any;
  new_values: any;
  changed_by: string;
  changed_at: string;
  approval_reference?: string;
  internal_sku: string;
  product_name?: string;
  vendor_name?: string;
}

interface AuditDetail {
  field: string;
  oldValue: any;
  newValue: any;
  change: number;
  changePercent: number;
}

export default function PricingAuditLog() {
  const [auditEntries, setAuditEntries] = useState<PricingAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterChangeType, setFilterChangeType] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<string>('30');
  const [selectedEntry, setSelectedEntry] = useState<PricingAuditEntry | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const { vendors } = useSupabaseData();

  useEffect(() => {
    loadAuditEntries();
  }, [filterDateRange]);

  const loadAuditEntries = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('pricing_audit_log')
        .select(`
          *,
          product_pricing(internal_sku, inventory_items(product_name)),
          pricing_change_proposals(vendor_pricelists(vendors(name)))
        `)
        .order('changed_at', { ascending: false });

      // Apply date filter
      if (filterDateRange !== 'all') {
        const days = parseInt(filterDateRange);
        const date = new Date();
        date.setDate(date.getDate() - days);
        query = query.gte('changed_at', date.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedEntries = data.map(entry => ({
        ...entry,
        internal_sku: entry.product_pricing?.internal_sku,
        product_name: entry.product_pricing?.inventory_items?.product_name,
        vendor_name: entry.pricing_change_proposals?.vendor_pricelists?.vendors?.name
      }));

      setAuditEntries(formattedEntries);

    } catch (error) {
      console.error('Error loading pricing audit entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (entry: PricingAuditEntry) => {
    setSelectedEntry(entry);
    setShowDetailDialog(true);
  };

  const filteredEntries = auditEntries.filter(entry => {
    const matchesSearch = !searchTerm ||
      entry.internal_sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.change_reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.changed_by.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesChangeType = filterChangeType === 'all' || entry.change_type === filterChangeType;

    return matchesSearch && matchesChangeType;
  });

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case 'price_increase': return 'destructive';
      case 'price_decrease': return 'default';
      case 'cost_increase': return 'destructive';
      case 'cost_decrease': return 'secondary';
      case 'margin_change': return 'outline';
      default: return 'outline';
    }
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'price_increase':
      case 'cost_increase':
        return <TrendingUp className="h-4 w-4" />;
      case 'price_decrease':
      case 'cost_decrease':
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <Minus className="h-4 w-4" />;
    }
  };

  const calculateAuditDetails = (entry: PricingAuditEntry): AuditDetail[] => {
    const details: AuditDetail[] = [];
    const oldVals = entry.old_values || {};
    const newVals = entry.new_values || {};

    // Compare key pricing fields
    const fields = ['unit_cost', 'unit_price', 'margin_percentage'];

    fields.forEach(field => {
      const oldVal = oldVals[field];
      const newVal = newVals[field];

      if (oldVal !== undefined && newVal !== undefined && oldVal !== newVal) {
        const change = newVal - oldVal;
        const changePercent = oldVal !== 0 ? (change / oldVal) * 100 : 0;

        details.push({
          field,
          oldValue: oldVal,
          newValue: newVal,
          change,
          changePercent
        });
      }
    });

    return details;
  };

  const formatValue = (value: any, field: string) => {
    if (value === null || value === undefined) return 'N/A';

    if (field.includes('cost') || field.includes('price')) {
      return `$${Number(value).toFixed(2)}`;
    }

    if (field.includes('percentage') || field.includes('margin')) {
      return `${Number(value).toFixed(1)}%`;
    }

    return String(value);
  };

  const exportAuditLog = () => {
    const csvContent = [
      ['Date', 'Product SKU', 'Product Name', 'Change Type', 'Change Reason', 'Changed By', 'Vendor'],
      ...filteredEntries.map(entry => [
        new Date(entry.changed_at).toLocaleDateString(),
        entry.internal_sku || '',
        entry.product_name || '',
        entry.change_type,
        entry.change_reason,
        entry.changed_by,
        entry.vendor_name || ''
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pricing-audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
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
          <h1 className="text-3xl font-bold">Pricing Audit Log</h1>
          <p className="text-muted-foreground">Complete history of all pricing changes and approvals</p>
        </div>
        <Button onClick={exportAuditLog} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <Input
                placeholder="Search products, reasons, users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-80"
              />
            </div>

            <Select value={filterChangeType} onValueChange={setFilterChangeType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Change Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Change Types</SelectItem>
                <SelectItem value="price_increase">Price Increase</SelectItem>
                <SelectItem value="price_decrease">Price Decrease</SelectItem>
                <SelectItem value="cost_increase">Cost Increase</SelectItem>
                <SelectItem value="cost_decrease">Cost Decrease</SelectItem>
                <SelectItem value="margin_change">Margin Change</SelectItem>
                <SelectItem value="initial_setup">Initial Setup</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterDateRange} onValueChange={setFilterDateRange}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Entries ({filteredEntries.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredEntries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Change Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {new Date(entry.changed_at).toLocaleDateString()}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(entry.changed_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{entry.product_name || entry.internal_sku}</div>
                        <div className="text-sm text-muted-foreground">{entry.internal_sku}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getChangeTypeColor(entry.change_type)} className="flex items-center gap-1 w-fit">
                        {getChangeIcon(entry.change_type)}
                        {entry.change_type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="truncate" title={entry.change_reason}>
                        {entry.change_reason}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{entry.changed_by}</span>
                      </div>
                    </TableCell>
                    <TableCell>{entry.vendor_name || 'N/A'}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetails(entry)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                {auditEntries.length === 0
                  ? 'No pricing audit entries found.'
                  : 'No audit entries match your current filters.'
                }
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pricing Change Details</DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Product</Label>
                  <div className="mt-1">
                    <div className="font-medium">{selectedEntry.product_name || selectedEntry.internal_sku}</div>
                    <div className="text-sm text-muted-foreground">SKU: {selectedEntry.internal_sku}</div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Change Type</Label>
                  <div className="mt-1">
                    <Badge variant={getChangeTypeColor(selectedEntry.change_type)}>
                      {selectedEntry.change_type.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Changed By</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEntry.changed_by}</span>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Date/Time</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{new Date(selectedEntry.changed_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Change Reason */}
              <div>
                <Label className="text-sm font-medium">Change Reason</Label>
                <div className="mt-1 p-3 bg-muted rounded-md">
                  {selectedEntry.change_reason}
                </div>
              </div>

              {/* Value Changes */}
              <div>
                <Label className="text-sm font-medium">Value Changes</Label>
                <div className="mt-2 space-y-2">
                  {calculateAuditDetails(selectedEntry).map((detail, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-md">
                      <div className="flex-1">
                        <div className="font-medium capitalize">{detail.field.replace('_', ' ')}</div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-muted-foreground">
                          Old: {formatValue(detail.oldValue, detail.field)}
                        </div>
                        <div className="font-medium">
                          New: {formatValue(detail.newValue, detail.field)}
                        </div>
                        <div className={`font-medium ${
                          detail.change > 0 ? 'text-red-600' :
                          detail.change < 0 ? 'text-green-600' : 'text-muted-foreground'
                        }`}>
                          {detail.change > 0 ? '+' : ''}{formatValue(detail.change, detail.field)}
                          {detail.changePercent !== 0 && (
                            <span className="ml-1">
                              ({detail.changePercent > 0 ? '+' : ''}{detail.changePercent.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Approval Reference */}
              {selectedEntry.approval_reference && (
                <div>
                  <Label className="text-sm font-medium">Approval Reference</Label>
                  <div className="mt-1 p-3 bg-muted rounded-md font-mono text-sm">
                    {selectedEntry.approval_reference}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}