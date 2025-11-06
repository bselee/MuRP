import React, { useState } from 'react';
import type { BillOfMaterials, Artwork } from '../types';
import Modal from './Modal';
import LabelScanResults from './LabelScanResults';
import UploadArtworkModal from './UploadArtworkModal';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  XCircleIcon,
  CloudUploadIcon,
  DocumentTextIcon,
  PackageIcon,
  BeakerIcon,
  ClipboardDocumentListIcon
} from './icons';

interface BomDetailModalProps {
  bom: BillOfMaterials;
  isOpen: boolean;
  onClose: () => void;
  onUploadArtwork?: (bomId: string, artwork: Omit<Artwork, 'id'>) => void;
  currentUser?: { id: string; email: string };
}

type TabType = 'components' | 'packaging' | 'labels' | 'registrations';

const BomDetailModal: React.FC<BomDetailModalProps> = ({
  bom,
  isOpen,
  onClose,
  onUploadArtwork,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('components');
  const [selectedLabel, setSelectedLabel] = useState<Artwork | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Filter artwork to show only labels
  const labels = bom.artwork.filter(art => art.fileType === 'label');

  const handleViewLabel = (label: Artwork) => {
    setSelectedLabel(label);
  };

  const handleBackToList = () => {
    setSelectedLabel(null);
  };

  const handleUploadComplete = (bomId: string, artwork: Omit<Artwork, 'id'>) => {
    if (onUploadArtwork) {
      onUploadArtwork(bomId, artwork);
    }
    setIsUploadModalOpen(false);
  };

  const handleVerifyLabel = (artworkId: string) => {
    console.log('Verify label:', artworkId);
    // TODO: Implement verification update
  };

  const handleRescan = (artworkId: string) => {
    console.log('Rescan label:', artworkId);
    // TODO: Implement rescan functionality
  };

  const getScanStatusBadge = (label: Artwork) => {
    if (label.verified) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-300 border border-green-700">
          <CheckCircleIcon className="w-4 h-4" />
          Verified
        </span>
      );
    }

    switch (label.scanStatus) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-900/30 text-blue-300 border border-blue-700">
            <CheckCircleIcon className="w-4 h-4" />
            Scanned
          </span>
        );
      case 'scanning':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-900/30 text-yellow-300 border border-yellow-700">
            <ClockIcon className="w-4 h-4 animate-spin" />
            Scanning...
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-900/30 text-red-300 border border-red-700">
            <XCircleIcon className="w-4 h-4" />
            Failed
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300 border border-gray-600">
            <ClockIcon className="w-4 h-4" />
            Pending
          </span>
        );
    }
  };

  const tabs = [
    { id: 'components' as TabType, label: 'Components', icon: BeakerIcon },
    { id: 'packaging' as TabType, label: 'Packaging', icon: PackageIcon },
    { id: 'labels' as TabType, label: 'Labels', icon: DocumentTextIcon, count: labels.length },
    { id: 'registrations' as TabType, label: 'Registrations', icon: ClipboardDocumentListIcon, count: bom.registrations?.length || 0 }
  ];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={bom.name}
        subtitle={`${bom.finishedSku} • ${bom.category || 'Product'}`}
        size="large"
      >
        <div className="flex flex-col h-full">
          {/* Tab Navigation */}
          <div className="border-b border-gray-700 mb-6">
            <nav className="flex gap-2" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-indigo-500 text-indigo-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300">
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Components Tab */}
            {activeTab === 'components' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-white">Bill of Materials</h3>
                  <div className="text-sm text-gray-400">
                    Yields: <span className="font-semibold text-white">{bom.yieldQuantity}</span> unit(s)
                  </div>
                </div>

                {bom.description && (
                  <p className="text-sm text-gray-400 bg-gray-800/50 rounded-lg p-4">
                    {bom.description}
                  </p>
                )}

                <div className="bg-gray-800/30 rounded-lg overflow-hidden border border-gray-700">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          SKU
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Component Name
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Unit
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {bom.components.map((component) => (
                        <tr key={component.id} className="hover:bg-gray-800/30 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-400">
                            {component.sku}
                          </td>
                          <td className="px-6 py-4 text-sm text-white">
                            {component.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-white">
                            {component.quantity}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-400">
                            {component.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {bom.barcode && (
                  <div className="bg-indigo-900/20 border border-indigo-700 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-indigo-400 font-medium">Product Barcode</p>
                        <p className="text-lg font-mono text-white">{bom.barcode}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Packaging Tab */}
            {activeTab === 'packaging' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-white">Packaging Specifications</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                    <h4 className="text-sm font-medium text-gray-400 uppercase mb-2">Bag Type</h4>
                    <p className="text-lg text-white">{bom.packaging.bagType}</p>
                  </div>

                  <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                    <h4 className="text-sm font-medium text-gray-400 uppercase mb-2">Label Type</h4>
                    <p className="text-lg text-white">{bom.packaging.labelType}</p>
                  </div>
                </div>

                <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                  <h4 className="text-sm font-medium text-gray-400 uppercase mb-3">Special Instructions</h4>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">
                    {bom.packaging.specialInstructions}
                  </p>
                </div>

                {/* Show non-label artwork here (technical drawings, bag designs, etc.) */}
                {bom.artwork.filter(art => art.fileType !== 'label').length > 0 && (
                  <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                    <h4 className="text-sm font-medium text-gray-400 uppercase mb-3">Other Artwork</h4>
                    <div className="space-y-2">
                      {bom.artwork.filter(art => art.fileType !== 'label').map((art) => (
                        <div key={art.id} className="flex justify-between items-center p-3 bg-gray-800/50 rounded">
                          <div>
                            <p className="text-sm text-white">{art.fileName}</p>
                            <p className="text-xs text-gray-400">Rev {art.revision} • {art.fileType}</p>
                          </div>
                          <a
                            href={art.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:text-indigo-300"
                          >
                            View
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Labels Tab */}
            {activeTab === 'labels' && (
              <div className="space-y-6">
                {!selectedLabel ? (
                  <>
                    {/* Labels List View */}
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold text-white">Product Labels</h3>
                        <p className="text-sm text-gray-400 mt-1">
                          AI-scanned labels with ingredient verification
                        </p>
                      </div>
                      {onUploadArtwork && (
                        <button
                          onClick={() => setIsUploadModalOpen(true)}
                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                        >
                          <CloudUploadIcon className="w-5 h-5" />
                          Upload Label
                        </button>
                      )}
                    </div>

                    {labels.length === 0 ? (
                      <div className="bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700 p-12 text-center">
                        <DocumentTextIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                        <h4 className="text-lg font-medium text-gray-400 mb-2">No labels uploaded yet</h4>
                        <p className="text-sm text-gray-500 mb-6">
                          Upload a label file to extract ingredients, barcode, and NPK analysis with AI
                        </p>
                        {onUploadArtwork && (
                          <button
                            onClick={() => setIsUploadModalOpen(true)}
                            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                          >
                            <CloudUploadIcon className="w-5 h-5" />
                            Upload Your First Label
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {labels.map((label) => (
                          <div
                            key={label.id}
                            className="bg-gray-800/30 rounded-lg border border-gray-700 p-4 hover:bg-gray-800/50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3">
                                  <DocumentTextIcon className="w-8 h-8 text-indigo-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-white truncate">
                                      {label.fileName}
                                    </h4>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                      <span>Rev {label.revision}</span>
                                      {label.uploadedAt && (
                                        <>
                                          <span>•</span>
                                          <span>
                                            Uploaded {new Date(label.uploadedAt).toLocaleDateString()}
                                          </span>
                                        </>
                                      )}
                                      {label.barcode && (
                                        <>
                                          <span>•</span>
                                          <span className="font-mono">{label.barcode}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 ml-4">
                                {getScanStatusBadge(label)}

                                {label.scanStatus === 'completed' && (
                                  <button
                                    onClick={() => handleViewLabel(label)}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    View Results
                                  </button>
                                )}

                                {label.scanStatus === 'failed' && (
                                  <button
                                    onClick={() => handleRescan(label.id)}
                                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    Retry Scan
                                  </button>
                                )}
                              </div>
                            </div>

                            {label.scanStatus === 'failed' && label.scanError && (
                              <div className="mt-3 pt-3 border-t border-gray-700">
                                <div className="flex items-start gap-2 text-sm">
                                  <ExclamationCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-red-400 font-medium">Scan Failed</p>
                                    <p className="text-gray-400 mt-1">{label.scanError}</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {label.notes && (
                              <div className="mt-3 pt-3 border-t border-gray-700">
                                <p className="text-xs text-gray-500">
                                  <span className="font-medium">Notes:</span> {label.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Label Detail View with Scan Results */}
                    <div className="space-y-4">
                      <button
                        onClick={handleBackToList}
                        className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Labels List
                      </button>

                      <LabelScanResults
                        artwork={selectedLabel}
                        bom={bom}
                        onVerify={handleVerifyLabel}
                        onRescan={handleRescan}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Registrations Tab */}
            {activeTab === 'registrations' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold text-white">State Registrations</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Track product registrations and renewal deadlines
                    </p>
                  </div>
                  <button
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    disabled
                  >
                    <PlusCircleIcon className="w-5 h-5" />
                    Add Registration
                  </button>
                </div>

                {/* Placeholder for registrations feature */}
                <div className="bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700 p-12 text-center">
                  <ClipboardDocumentListIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-400 mb-2">Registrations Coming Soon</h4>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Track state-by-state product registrations, renewal deadlines, and compliance certificates.
                    This feature will be available in the next release.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Upload Modal */}
      {isUploadModalOpen && onUploadArtwork && (
        <UploadArtworkModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          boms={[bom]} // Pre-select this BOM
          onUpload={handleUploadComplete}
          currentUser={currentUser}
        />
      )}
    </>
  );
};

export default BomDetailModal;
