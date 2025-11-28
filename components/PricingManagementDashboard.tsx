import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { supabase } from '../lib/supabase';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Search,
  Download,
  Upload
} from 'lucide-react';

interface PricingProposal {
  id: string;
  product_pricing_id: string;
  vendor_pricelist_id: string;
  proposed_unit_cost: number;
  proposed_unit_price: number;
  cost_change_percentage: number;
  price_change_percentage: number;
  change_impact: string;
  change_reason: string;
  vendor_sku?: string;
  vendor_product_name?: string;
  pricelist_item_data?: any;
  status: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  internal_sku: string;
  product_name?: string;
  vendor_name?: string;
  priority_score: number;
}

interface PricingDashboardData {
  total_products: number;
  pending_proposals: number;
  approved_today: number;
  critical_changes: number;
  total_inventory_value: number;
  avg_margin_percentage: number;
}

export default function PricingManagementDashboard() {
  const [proposals, setProposals] = useState<PricingProposal[]>([]);
  const [dashboardData, setDashboardData] = useState<PricingDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterImpact, setFilterImpact] = useState<string>('all');
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set());

  const { vendors } = useSupabaseData();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load dashboard data
      const { data: dashboard, error: dashboardError } = await supabase
        .rpc('get_pricing_dashboard_data');

      if (dashboardError) throw dashboardError;
      setDashboardData(dashboard[0]);

      // Load proposals queue
      const { data: proposalsData, error: proposalsError } = await supabase
        .from('pricing_proposals_queue')
        .select('*')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: true });

      if (proposalsError) throw proposalsError;
      setProposals(proposalsData || []);

    } catch (error) {
      console.error('Error loading pricing dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveProposal = async (proposalId: string) => {
    try {
      const { error } = await supabase.rpc('approve_pricing_change', {
        p_proposal_id: proposalId,
        p_approved_by: 'current_user', // TODO: Get from auth context
        p_approval_notes: 'Approved via pricing dashboard'
      });

      if (error) throw error;

      // Reload data
      await loadData();
      setSelectedProposals(new Set());

    } catch (error) {
      console.error('Error approving pricing proposal:', error);
    }
  };

  const handleBulkApprove = async () => {
    try {
      for (const proposalId of selectedProposals) {
        await handleApproveProposal(proposalId);
      }
    } catch (error) {
      console.error('Error in bulk approval:', error);
    }
  };

  const handleRejectProposal = async (proposalId: string, reason: string) => {
    try {
      const { error } = await supabase
        .from('pricing_change_proposals')
        .update({
          status: 'rejected',
          reviewed_by: 'current_user', // TODO: Get from auth context
          reviewed_at: new Date().toISOString(),
          review_notes: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', proposalId);

      if (error) throw error;

      await loadData();

    } catch (error) {
      console.error('Error rejecting pricing proposal:', error);
    }
  };

  const filteredProposals = proposals.filter(proposal => {
    const matchesImpact = filterImpact === 'all' || proposal.change_impact === filterImpact;
    const matchesVendor = filterVendor === 'all' || proposal.vendor_name === filterVendor;
    const matchesSearch = !searchTerm ||
      proposal.internal_sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesImpact && matchesVendor && matchesSearch;
  });

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'critical':
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      default: return <TrendingUp className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pricing Management</h1>
          <p className="text-muted-foreground">Manage product pricing changes and approvals</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
        </div>
      </div>

      {/* Dashboard Metrics */}
      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <div className="ml-2">
                  <p className="text-sm font-medium text-muted-foreground">Total Products</p>
                  <p className="text-2xl font-bold">{dashboardData.total_products}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="ml-2">
                  <p className="text-sm font-medium text-muted-foreground">Pending Proposals</p>
                  <p className="text-2xl font-bold">{dashboardData.pending_proposals}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <div className="ml-2">
                  <p className="text-sm font-medium text-muted-foreground">Critical Changes</p>
                  <p className="text-2xl font-bold text-red-600">{dashboardData.critical_changes}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <div className="ml-2">
                  <p className="text-sm font-medium text-muted-foreground">Avg Margin</p>
                  <p className="text-2xl font-bold text-green-600">{dashboardData.avg_margin_percentage?.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing Change Proposals</CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <Input
                placeholder="Search products, vendors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>

            <Select value={filterImpact} onValueChange={setFilterImpact}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Impact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Impact</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterVendor} onValueChange={setFilterVendor}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {vendors.map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.name}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedProposals.size > 0 && (
              <Button onClick={handleBulkApprove} className="ml-auto">
                Approve Selected ({selectedProposals.size})
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {filteredProposals.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedProposals.size === filteredProposals.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProposals(new Set(filteredProposals.map(p => p.id)));
                        } else {
                          setSelectedProposals(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Current Cost</TableHead>
                  <TableHead>Proposed Cost</TableHead>
                  <TableHead>Change %</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProposals.map((proposal) => (
                  <TableRow key={proposal.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedProposals.has(proposal.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedProposals);
                          if (e.target.checked) {
                            newSelected.add(proposal.id);
                          } else {
                            newSelected.delete(proposal.id);
                          }
                          setSelectedProposals(newSelected);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{proposal.product_name || proposal.internal_sku}</div>
                        <div className="text-sm text-muted-foreground">{proposal.internal_sku}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{proposal.vendor_name}</div>
                        {proposal.vendor_sku && (
                          <div className="text-sm text-muted-foreground">SKU: {proposal.vendor_sku}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getImpactColor(proposal.change_impact)} className="flex items-center gap-1 w-fit">
                        {getImpactIcon(proposal.change_impact)}
                        {proposal.change_impact}
                      </Badge>
                    </TableCell>
                    <TableCell>${proposal.proposed_unit_cost?.toFixed(2)}</TableCell>
                    <TableCell>${proposal.proposed_unit_price?.toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={proposal.cost_change_percentage > 0 ? 'text-red-600' : 'text-green-600'}>
                        {proposal.cost_change_percentage > 0 ? '+' : ''}{proposal.cost_change_percentage?.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={proposal.change_reason}>
                      {proposal.change_reason}
                    </TableCell>
                    <TableCell>
                      {new Date(proposal.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveProposal(proposal.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRejectProposal(proposal.id, 'Rejected via dashboard')}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {proposals.length === 0
                  ? 'No pricing change proposals found.'
                  : 'No proposals match your current filters.'
                }
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}