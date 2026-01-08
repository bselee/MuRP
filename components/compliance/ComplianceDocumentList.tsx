/**
 * Compliance Document List Component
 *
 * Displays a filterable, searchable list of compliance documents
 * with status indicators and quick actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import {
  getComplianceDocuments,
} from '@/services/complianceDocumentService';
import type {
  ComplianceDocumentOverview,
  ComplianceDocumentType,
  ComplianceDocumentStatus,
  ComplianceDocumentFilters,
} from '@/types/complianceDocuments';

interface ComplianceDocumentListProps {
  filters?: ComplianceDocumentFilters;
  onDocumentSelect?: (document: ComplianceDocumentOverview) => void;
  onUploadClick?: () => void;
  showUploadButton?: boolean;
  selectedDocumentId?: string;
  linkedToSku?: string;
  linkedToBomId?: string;
}

const DOCUMENT_TYPE_ICONS: Record<ComplianceDocumentType, string> = {
  artwork: '',
  label_proof: '',
  certificate: '',
  registration: '',
  test_report: '',
  statute: '',
  guidance: '',
  letter: '',
  sds: '',
  specification: '',
  approval: '',
  amendment: '',
  renewal: '',
  audit_report: '',
  other: '',
};

const STATUS_COLORS: Record<ComplianceDocumentStatus, string> = {
  draft: 'bg-gray-600 text-gray-200',
  pending_review: 'bg-yellow-600 text-yellow-100',
  pending_approval: 'bg-blue-600 text-blue-100',
  approved: 'bg-green-600 text-green-100',
  expired: 'bg-red-600 text-red-100',
  superseded: 'bg-purple-600 text-purple-100',
  rejected: 'bg-red-700 text-red-100',
  archived: 'bg-gray-700 text-gray-300',
};

const DOCUMENT_TYPES: { value: ComplianceDocumentType; label: string }[] = [
  { value: 'artwork', label: 'Artwork' },
  { value: 'label_proof', label: 'Label Proof' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'registration', label: 'Registration' },
  { value: 'test_report', label: 'Test Report' },
  { value: 'statute', label: 'Statute' },
  { value: 'guidance', label: 'Guidance' },
  { value: 'letter', label: 'Letter' },
  { value: 'sds', label: 'SDS' },
  { value: 'specification', label: 'Specification' },
  { value: 'approval', label: 'Approval' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'audit_report', label: 'Audit Report' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS: { value: ComplianceDocumentStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'expired', label: 'Expired' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
];

export default function ComplianceDocumentList({
  filters: externalFilters,
  onDocumentSelect,
  onUploadClick,
  showUploadButton = true,
  selectedDocumentId,
  linkedToSku,
  linkedToBomId,
}: ComplianceDocumentListProps) {
  const [documents, setDocuments] = useState<ComplianceDocumentOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<ComplianceDocumentType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ComplianceDocumentStatus | ''>('');
  const [expiringFilter, setExpiringFilter] = useState<number | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const filters: ComplianceDocumentFilters = {
      ...externalFilters,
      searchText: searchTerm || undefined,
      documentType: typeFilter || undefined,
      status: statusFilter || undefined,
      expiringWithinDays: expiringFilter || undefined,
      linkedToSku,
      linkedToBomId,
    };

    const result = await getComplianceDocuments(filters);

    if (result.success && result.data) {
      setDocuments(result.data);
    } else {
      setError(result.error || 'Failed to load documents');
    }

    setLoading(false);
  }, [externalFilters, searchTerm, typeFilter, statusFilter, expiringFilter, linkedToSku, linkedToBomId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getExpirationBadge = (daysUntilExpiry?: number) => {
    if (daysUntilExpiry === undefined || daysUntilExpiry === null) return null;

    if (daysUntilExpiry <= 0) {
      return <span className="px-2 py-0.5 text-xs rounded bg-red-700 text-red-100">Expired</span>;
    }
    if (daysUntilExpiry <= 7) {
      return <span className="px-2 py-0.5 text-xs rounded bg-red-600 text-red-100">Expires in {daysUntilExpiry}d</span>;
    }
    if (daysUntilExpiry <= 30) {
      return <span className="px-2 py-0.5 text-xs rounded bg-yellow-600 text-yellow-100">Expires in {daysUntilExpiry}d</span>;
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-100">Compliance Documents</h3>
        {showUploadButton && onUploadClick && (
          <Button
            onClick={onUploadClick}
            className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Upload Document
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Search */}
        <input
          type="text"
          placeholder="Search documents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ComplianceDocumentType | '')}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          <option value="">All Types</option>
          {DOCUMENT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {DOCUMENT_TYPE_ICONS[type.value]} {type.label}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ComplianceDocumentStatus | '')}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          <option value="">All Status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>

        {/* Expiration Filter */}
        <select
          value={expiringFilter || ''}
          onChange={(e) => setExpiringFilter(e.target.value ? parseInt(e.target.value) : null)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          <option value="">Any Expiration</option>
          <option value="7">Expiring in 7 days</option>
          <option value="30">Expiring in 30 days</option>
          <option value="90">Expiring in 90 days</option>
        </select>
      </div>

      {/* Document Count */}
      <div className="text-sm text-gray-400">
        {documents.length} document{documents.length !== 1 ? 's' : ''} found
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-900 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && documents.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📁</div>
          <h4 className="text-lg font-medium text-gray-300 mb-2">No documents found</h4>
          <p className="text-gray-500 mb-4">
            {searchTerm || typeFilter || statusFilter
              ? 'Try adjusting your filters'
              : 'Upload your first compliance document to get started'}
          </p>
          {showUploadButton && onUploadClick && (
            <Button
              onClick={onUploadClick}
              className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg"
            >
              Upload Document
            </Button>
          )}
        </div>
      )}

      {/* Document List */}
      {!loading && !error && documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onDocumentSelect?.(doc)}
              className={`
                p-4 bg-gray-800 rounded-lg border-2 cursor-pointer transition-all
                ${selectedDocumentId === doc.id
                  ? 'border-accent-500 bg-accent-800 bg-opacity-20'
                  : 'border-gray-700 hover:border-gray-600'}
              `}
            >
              <div className="flex items-start justify-between">
                {/* Document Info */}
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-2xl">{DOCUMENT_TYPE_ICONS[doc.documentType]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-gray-100 truncate">{doc.documentName}</h4>
                      <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[doc.status]}`}>
                        {doc.status.replace('_', ' ')}
                      </span>
                      {getExpirationBadge(doc.daysUntilExpiry)}
                    </div>

                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                      {doc.documentNumber && (
                        <span>#{doc.documentNumber}</span>
                      )}
                      {doc.agencyName && (
                        <span>{doc.agencyName}</span>
                      )}
                      {doc.regulatoryCategory && (
                        <span className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">
                          {doc.regulatoryCategory}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {doc.applicableStates.length > 0 && (
                        <span>
                          {doc.isNational ? 'National' : `${doc.applicableStates.slice(0, 5).join(', ')}${doc.applicableStates.length > 5 ? ` +${doc.applicableStates.length - 5}` : ''}`}
                        </span>
                      )}
                      {doc.effectiveDate && (
                        <span>Effective: {formatDate(doc.effectiveDate)}</span>
                      )}
                      {doc.expirationDate && (
                        <span>Expires: {formatDate(doc.expirationDate)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm">
                  {doc.linkedProductsCount > 0 && (
                    <div className="text-center">
                      <div className="text-gray-400">Products</div>
                      <div className="font-medium text-gray-200">{doc.linkedProductsCount}</div>
                    </div>
                  )}
                  {doc.pendingReviewsCount > 0 && (
                    <div className="text-center">
                      <div className="text-yellow-500">Reviews</div>
                      <div className="font-medium text-yellow-400">{doc.pendingReviewsCount}</div>
                    </div>
                  )}
                  {doc.activeAlertsCount > 0 && (
                    <div className="text-center">
                      <div className="text-red-500">Alerts</div>
                      <div className="font-medium text-red-400">{doc.activeAlertsCount}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              {doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {doc.tags.slice(0, 5).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                  {doc.tags.length > 5 && (
                    <span className="px-2 py-0.5 text-gray-500 text-xs">
                      +{doc.tags.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
