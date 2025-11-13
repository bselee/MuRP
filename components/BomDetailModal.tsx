import React, { useState } from 'react';
import type { BillOfMaterials, Artwork, ProductRegistration, ProductDataSheet, Label } from '../types';
import Modal from './Modal';
import LabelScanResults from './LabelScanResults';
import UploadArtworkModal from './UploadArtworkModal';
import RegistrationManagement from './RegistrationManagement';
import AddRegistrationModal from './AddRegistrationModal';
import ProductDataSheetGenerator from './ProductDataSheetGenerator';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  XCircleIcon,
  CloudUploadIcon,
  DocumentTextIcon,
  PackageIcon,
  BeakerIcon,
  ClipboardDocumentListIcon,
  SparklesIcon
} from './icons';

interface BomDetailModalProps {
  bom: BillOfMaterials;
  isOpen: boolean;
  onClose: () => void;
  onUploadArtwork?: (bomId: string, artwork: Omit<Artwork, 'id'>) => void;
  onUpdateBom?: (updatedBom: BillOfMaterials) => void;
  currentUser?: { id: string; email: string };
}

type TabType = 'components' | 'packaging' | 'labels' | 'datasheets' | 'registrations';

const BomDetailModal: React.FC<BomDetailModalProps> = ({
  bom,
  isOpen,
  onClose,
  onUploadArtwork,
  onUpdateBom,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('components');
  const [selectedLabel, setSelectedLabel] = useState<Artwork | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAddRegistrationModalOpen, setIsAddRegistrationModalOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<ProductRegistration | null>(null);
  const [isGeneratingDataSheet, setIsGeneratingDataSheet] = useState(false);
  const [dataSheets, setDataSheets] = useState<ProductDataSheet[]>([]);

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

  const handleSaveLabel = (artworkId: string, updatedData: Artwork['extractedData']) => {
    if (!onUpdateBom) return;

    // Find and update the artwork with the new extracted data
    const updatedArtwork = bom.artwork.map(art =>
      art.id === artworkId
        ? { ...art, extractedData: updatedData }
        : art
    );

    const updatedBom: BillOfMaterials = {
      ...bom,
      artwork: updatedArtwork
    };

    onUpdateBom(updatedBom);

    // Update selected label if it's the one being edited
    if (selectedLabel?.id === artworkId) {
      setSelectedLabel({ ...selectedLabel, extractedData: updatedData });
    }
  };

  const handleAddRegistration = (registration: Omit<ProductRegistration, 'id'>) => {
    if (!onUpdateBom) return;

    const newRegistration: ProductRegistration = {
      ...registration,
      id: `reg-${Date.now()}`
    } as ProductRegistration;

    const updatedBom: BillOfMaterials = {
      ...bom,
      registrations: [...(bom.registrations || []), newRegistration]
    };

    onUpdateBom(updatedBom);
    setIsAddRegistrationModalOpen(false);
    setSelectedRegistration(null);
  };

  const handleEditRegistration = (registration: ProductRegistration) => {
    if (!onUpdateBom) return;

    const updatedRegistrations = (bom.registrations || []).map(reg =>
      reg.id === registration.id ? registration : reg
    );

    const updatedBom: BillOfMaterials = {
      ...bom,
      registrations: updatedRegistrations
    };

    onUpdateBom(updatedBom);
    setIsAddRegistrationModalOpen(false);
    setSelectedRegistration(null);
  };

  const handleDeleteRegistration = (registrationId: string) => {
    if (!onUpdateBom) return;

    const updatedRegistrations = (bom.registrations || []).filter(
      reg => reg.id !== registrationId
    );

    const updatedBom: BillOfMaterials = {
      ...bom,
      registrations: updatedRegistrations
    };

    onUpdateBom(updatedBom);
  };

  const handleSaveRegistration = (registration: Omit<ProductRegistration, 'id'> | ProductRegistration) => {
    if ('id' in registration) {
      handleEditRegistration(registration);
    } else {
      handleAddRegistration(registration);
    }
  };

  const handleDataSheetComplete = (dataSheet: ProductDataSheet) => {
    setDataSheets([...dataSheets, dataSheet]);
    setIsGeneratingDataSheet(false);
  };

  const handleCancelGeneration = () => {
    setIsGeneratingDataSheet(false);
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
    { id: 'packaging' as TabType, label: 'Packaging Specs', icon: PackageIcon },
    { id: 'labels' as TabType, label: 'Packaging & Labels', icon: DocumentTextIcon, count: labels.length },
    { id: 'datasheets' as TabType, label: 'Data Sheets', icon: SparklesIcon, count: dataSheets.length },
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

            {/* Packaging & Labels Tab */}
            {activeTab === 'labels' && (
              <div className="space-y-6">
                {!selectedLabel ? (
                  <>
                    {/* Packaging & Labels List View */}
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold text-white">Packaging & Labels</h3>
                        <p className="text-sm text-gray-400 mt-1">
                          AI-scanned packaging materials, labels, and bag designs with ingredient verification
                        </p>
                      </div>
                      {onUploadArtwork && (
                        <button
                          onClick={() => setIsUploadModalOpen(true)}
                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                        >
                          <CloudUploadIcon className="w-5 h-5" />
                          Upload Artwork
                        </button>
                      )}
                    </div>

                    {labels.length === 0 ? (
                      <div className="bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700 p-12 text-center">
                        <DocumentTextIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                        <h4 className="text-lg font-medium text-gray-400 mb-2">No packaging/labels uploaded yet</h4>
                        <p className="text-sm text-gray-500 mb-6">
                          Upload packaging materials, labels, or bag designs to extract ingredients, barcodes, and NPK analysis with AI
                        </p>
                        {onUploadArtwork && (
                          <button
                            onClick={() => setIsUploadModalOpen(true)}
                            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                          >
                            <CloudUploadIcon className="w-5 h-5" />
                            Upload Packaging/Label
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
                        onSave={handleSaveLabel}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Data Sheets Tab */}
            {activeTab === 'datasheets' && (
              <div className="space-y-6">
                {!isGeneratingDataSheet ? (
                  <>
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold text-white">Product Data Sheets</h3>
                        <p className="text-sm text-gray-400 mt-1">
                          AI-generated documentation: SDS, spec sheets, compliance docs
                        </p>
                      </div>
                      <button
                        onClick={() => setIsGeneratingDataSheet(true)}
                        className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                      >
                        <SparklesIcon className="w-5 h-5" />
                        Generate with AI
                      </button>
                    </div>

                    {dataSheets.length === 0 ? (
                      <div className="bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700 p-12 text-center">
                        <SparklesIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                        <h4 className="text-lg font-medium text-gray-400 mb-2">No data sheets generated yet</h4>
                        <p className="text-sm text-gray-500 mb-6">
                          Generate comprehensive product documentation with AI using label data, BOM ingredients, and compliance records
                        </p>
                        <button
                          onClick={() => setIsGeneratingDataSheet(true)}
                          className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                        >
                          <SparklesIcon className="w-5 h-5" />
                          Generate Your First Data Sheet
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dataSheets.map((sheet) => (
                          <div
                            key={sheet.id}
                            className="bg-gray-800/30 rounded-lg border border-gray-700 p-4 hover:bg-gray-800/50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3">
                                  <DocumentTextIcon className="w-8 h-8 text-purple-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-white truncate">
                                      {sheet.title}
                                    </h4>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                      <span className="capitalize">{sheet.documentType.replace('_', ' ')}</span>
                                      <span>•</span>
                                      <span>v{sheet.version}</span>
                                      {sheet.createdAt && (
                                        <>
                                          <span>•</span>
                                          <span>
                                            Created {new Date(sheet.createdAt).toLocaleDateString()}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 ml-4">
                                <span
                                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                                    sheet.status === 'published'
                                      ? 'bg-green-900/30 text-green-300 border border-green-700'
                                      : sheet.status === 'approved'
                                      ? 'bg-blue-900/30 text-blue-300 border border-blue-700'
                                      : 'bg-gray-700 text-gray-300 border border-gray-600'
                                  }`}
                                >
                                  {sheet.status === 'published' && <CheckCircleIcon className="w-4 h-4" />}
                                  {sheet.status.charAt(0).toUpperCase() + sheet.status.slice(1)}
                                </span>

                                {sheet.pdfUrl && (
                                  <a
                                    href={sheet.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    Download PDF
                                  </a>
                                )}
                              </div>
                            </div>

                            {sheet.description && (
                              <div className="mt-3 pt-3 border-t border-gray-700">
                                <p className="text-xs text-gray-400">{sheet.description}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <ProductDataSheetGenerator
                    bom={bom}
                    labels={labels.map(artwork => ({
                      id: artwork.id,
                      fileName: artwork.fileName,
                      fileUrl: artwork.url,
                      fileSize: artwork.fileSize,
                      mimeType: artwork.mimeType,
                      barcode: artwork.barcode || undefined,
                      productName: bom.name,
                      bomId: bom.id,
                      scanStatus: artwork.scanStatus || 'pending',
                      extractedData: artwork.extractedData,
                      verified: artwork.verified,
                      uploadedBy: currentUser?.id,
                      createdAt: artwork.uploadedAt || new Date().toISOString(),
                      updatedAt: artwork.updatedAt || new Date().toISOString()
                    }))}
                    complianceRecords={bom.registrations?.map(reg => ({
                      id: reg.id,
                      bomId: bom.id,
                      state: reg.state,
                      registrationType: reg.registrationType,
                      registrationNumber: reg.registrationNumber,
                      status: reg.status,
                      submittedDate: reg.submittedDate,
                      approvalDate: reg.approvalDate,
                      expirationDate: reg.expirationDate,
                      createdBy: currentUser?.id,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    })) || []}
                    currentUser={currentUser}
                    onComplete={handleDataSheetComplete}
                    onCancel={handleCancelGeneration}
                  />
                )}
              </div>
            )}

            {/* Registrations Tab */}
            {activeTab === 'registrations' && (
              <RegistrationManagement
                bom={bom}
                onAddRegistration={() => {
                  setSelectedRegistration(null);
                  setIsAddRegistrationModalOpen(true);
                }}
                onEditRegistration={(registration) => {
                  setSelectedRegistration(registration);
                  setIsAddRegistrationModalOpen(true);
                }}
                onDeleteRegistration={handleDeleteRegistration}
              />
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

      {/* Add/Edit Registration Modal */}
      {isAddRegistrationModalOpen && (
        <AddRegistrationModal
          isOpen={isAddRegistrationModalOpen}
          onClose={() => {
            setIsAddRegistrationModalOpen(false);
            setSelectedRegistration(null);
          }}
          onSave={handleSaveRegistration}
          bomId={bom.id}
          existingRegistration={selectedRegistration}
          currentUserId={currentUser?.id}
        />
      )}
    </>
  );
};

export default BomDetailModal;
