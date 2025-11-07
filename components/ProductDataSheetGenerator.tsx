/**
 * Product Data Sheet Generator
 *
 * Component for generating AI-powered product documentation
 * Supports SDS, spec sheets, product info, and compliance documents
 */

import React, { useState } from 'react';
import type { BillOfMaterials, Label, ComplianceRecord, ProductDataSheet } from '../types';
import { generateProductDataSheet, generateDataSheetSummary } from '../services/productDataSheetService';
import { createProductDataSheet } from '../services/labelDataService';
import { generatePDF, downloadPDF, generatePDFFilename } from '../services/pdfGenerationService';
import { uploadPDFToStorage, updateDataSheetPDFUrl } from '../services/pdfStorageService';
import {
  DocumentTextIcon,
  SparklesIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowDownTrayIcon
} from './icons';

interface ProductDataSheetGeneratorProps {
  bom: BillOfMaterials;
  labels?: Label[];
  complianceRecords?: ComplianceRecord[];
  currentUser?: { id: string; email: string };
  onComplete?: (dataSheet: ProductDataSheet) => void;
  onClose?: () => void;
}

type GenerationStep = 'config' | 'generating' | 'preview' | 'saving' | 'complete' | 'error';

const ProductDataSheetGenerator: React.FC<ProductDataSheetGeneratorProps> = ({
  bom,
  labels = [],
  complianceRecords = [],
  currentUser,
  onComplete,
  onClose
}) => {
  // Configuration state
  const [documentType, setDocumentType] = useState<ProductDataSheet['documentType']>('spec_sheet');
  const [title, setTitle] = useState(`${bom.name} - Specification Sheet`);
  const [selectedLabelId, setSelectedLabelId] = useState<string>(labels[0]?.id || '');
  const [includeManufacturingInfo, setIncludeManufacturingInfo] = useState(true);
  const [includeRegulatoryInfo, setIncludeRegulatoryInfo] = useState(true);

  // Generation state
  const [currentStep, setCurrentStep] = useState<GenerationStep>('config');
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [generatedContent, setGeneratedContent] = useState<ProductDataSheet['content'] | null>(null);
  const [savedDataSheet, setSavedDataSheet] = useState<ProductDataSheet | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Handle document type change
  const handleDocumentTypeChange = (type: ProductDataSheet['documentType']) => {
    setDocumentType(type);

    // Update default title based on type
    const titleMap = {
      'sds': 'Safety Data Sheet',
      'spec_sheet': 'Specification Sheet',
      'product_info': 'Product Information',
      'compliance_doc': 'Compliance Documentation',
      'custom': 'Product Document'
    };

    setTitle(`${bom.name} - ${titleMap[type]}`);
  };

  // Generate data sheet
  const handleGenerate = async () => {
    setCurrentStep('generating');
    setProgress('Preparing data...');
    setError('');

    try {
      const selectedLabel = labels.find(l => l.id === selectedLabelId);

      setProgress('Analyzing product information...');

      const content = await generateProductDataSheet({
        documentType,
        bom,
        label: selectedLabel,
        complianceRecords,
        includeManufacturingInfo,
        includeRegulatoryInfo
      });

      setGeneratedContent(content);
      setProgress('Generation complete!');
      setCurrentStep('preview');

    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate data sheet');
      setCurrentStep('error');
    }
  };

  // Save to database
  const handleSave = async () => {
    if (!generatedContent) return;

    setCurrentStep('saving');
    setProgress('Saving to database...');

    try {
      const dataSheet: Omit<ProductDataSheet, 'id' | 'createdAt' | 'updatedAt'> = {
        bomId: bom.id,
        labelId: selectedLabelId || undefined,
        documentType,
        title,
        version: 1.0,
        description: generateDataSheetSummary(generatedContent),
        content: generatedContent,
        status: 'draft',
        isAiGenerated: true,
        aiModelUsed: 'gemini-1.5-pro',
        editCount: 0,
        createdBy: currentUser?.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = await createProductDataSheet(dataSheet);

      setSavedDataSheet(saved);
      setProgress('Saved successfully!');
      setCurrentStep('complete');

      if (onComplete) {
        onComplete(saved);
      }

    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save data sheet');
      setCurrentStep('error');
    }
  };

  // Generate and download PDF
  const handleDownloadPDF = async () => {
    if (!savedDataSheet) return;

    setIsGeneratingPDF(true);
    setProgress('Generating PDF...');

    try {
      const pdfBlob = await generatePDF(savedDataSheet);
      const filename = generatePDFFilename(savedDataSheet);

      downloadPDF(pdfBlob, filename);
      setProgress('PDF downloaded successfully!');

    } catch (err) {
      console.error('PDF generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Generate PDF and upload to Supabase
  const handleGenerateAndUploadPDF = async () => {
    if (!savedDataSheet) return;

    setIsGeneratingPDF(true);
    setProgress('Generating PDF...');

    try {
      const pdfBlob = await generatePDF(savedDataSheet);

      setProgress('Uploading to storage...');
      const pdfUrl = await uploadPDFToStorage(savedDataSheet, pdfBlob);

      setProgress('Updating database...');
      await updateDataSheetPDFUrl(savedDataSheet.id, pdfUrl);

      // Update local state
      setSavedDataSheet({ ...savedDataSheet, pdfUrl });

      setProgress('PDF generated and uploaded successfully!');

    } catch (err) {
      console.error('PDF upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Render content preview
  const renderContentPreview = () => {
    if (!generatedContent) return null;

    return (
      <div className="space-y-6 max-h-96 overflow-y-auto">
        {/* Product Identification */}
        {generatedContent.productIdentification && (
          <div className="bg-gray-900/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-400 uppercase mb-3">Product Identification</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(generatedContent.productIdentification).map(([key, value]) => (
                <div key={key}>
                  <span className="text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                  <span className="text-white ml-2">{value || 'N/A'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Composition */}
        {generatedContent.composition && (
          <div className="bg-gray-900/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-400 uppercase mb-3">Composition</h4>

            {generatedContent.composition.ingredients && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Ingredients:</p>
                <div className="space-y-1">
                  {generatedContent.composition.ingredients.slice(0, 5).map((ing, idx) => (
                    <div key={idx} className="text-sm text-white">
                      • {ing.name} {ing.percentage && `(${ing.percentage})`}
                    </div>
                  ))}
                  {generatedContent.composition.ingredients.length > 5 && (
                    <p className="text-xs text-gray-500 italic">
                      ...and {generatedContent.composition.ingredients.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {generatedContent.composition.guaranteedAnalysis && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Guaranteed Analysis:</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {Object.entries(generatedContent.composition.guaranteedAnalysis).slice(0, 6).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      <span className="text-white ml-1">{value || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Regulatory Information */}
        {generatedContent.regulatoryInformation && (
          <div className="bg-gray-900/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-400 uppercase mb-3">Regulatory Information</h4>

            {generatedContent.regulatoryInformation.stateRegistrations && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-2">State Registrations:</p>
                <div className="space-y-1">
                  {generatedContent.regulatoryInformation.stateRegistrations.map((reg, idx) => (
                    <div key={idx} className="text-sm text-white">
                      • {reg.state}: {reg.registrationNumber} ({reg.status})
                    </div>
                  ))}
                </div>
              </div>
            )}

            {generatedContent.regulatoryInformation.certifications && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Certifications:</p>
                <div className="flex flex-wrap gap-2">
                  {generatedContent.regulatoryInformation.certifications.map((cert, idx) => (
                    <span key={idx} className="px-2 py-1 bg-green-900/30 text-green-300 text-xs rounded">
                      {cert}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Technical Data */}
        {generatedContent.technicalData && (
          <div className="bg-gray-900/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-400 uppercase mb-3">Technical Data</h4>

            {generatedContent.technicalData.applicationRates && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-2">Application Rates:</p>
                <div className="space-y-1">
                  {Object.entries(generatedContent.technicalData.applicationRates).map(([crop, rate]) => (
                    <div key={crop} className="text-sm text-white">
                      • {crop}: {rate}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {generatedContent.technicalData.directions && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Directions:</p>
                <p className="text-sm text-white">{generatedContent.technicalData.directions}</p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-gray-500 text-center italic">
          Preview shows key sections. Full document will be editable after saving.
        </p>
      </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Generate Product Data Sheet</h2>
        <p className="text-gray-400">
          AI-powered documentation for {bom.name}
        </p>
      </div>

      {/* Configuration Step */}
      {currentStep === 'config' && (
        <div className="space-y-6">
          {/* Document Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Document Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleDocumentTypeChange('sds')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  documentType === 'sds'
                    ? 'border-indigo-500 bg-indigo-900/20'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <DocumentTextIcon className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
                <p className="text-white font-medium text-sm">Safety Data Sheet (SDS)</p>
                <p className="text-gray-400 text-xs mt-1">Complete safety information</p>
              </button>

              <button
                onClick={() => handleDocumentTypeChange('spec_sheet')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  documentType === 'spec_sheet'
                    ? 'border-indigo-500 bg-indigo-900/20'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <DocumentTextIcon className="w-6 h-6 text-green-400 mx-auto mb-2" />
                <p className="text-white font-medium text-sm">Specification Sheet</p>
                <p className="text-gray-400 text-xs mt-1">Technical specifications</p>
              </button>

              <button
                onClick={() => handleDocumentTypeChange('product_info')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  documentType === 'product_info'
                    ? 'border-indigo-500 bg-indigo-900/20'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <DocumentTextIcon className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                <p className="text-white font-medium text-sm">Product Information</p>
                <p className="text-gray-400 text-xs mt-1">Marketing and sales info</p>
              </button>

              <button
                onClick={() => handleDocumentTypeChange('compliance_doc')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  documentType === 'compliance_doc'
                    ? 'border-indigo-500 bg-indigo-900/20'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <DocumentTextIcon className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                <p className="text-white font-medium text-sm">Compliance Document</p>
                <p className="text-gray-400 text-xs mt-1">Regulatory focus</p>
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Document Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter document title..."
            />
          </div>

          {/* Label Selection */}
          {labels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Source Label (Optional)
              </label>
              <select
                value={selectedLabelId}
                onChange={(e) => setSelectedLabelId(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">None (use BOM data only)</option>
                {labels.map(label => (
                  <option key={label.id} value={label.id}>
                    {label.fileName} - {label.productName || 'Unnamed'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select a scanned label to include its extracted data in the document
              </p>
            </div>
          )}

          {/* Options */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="includeManufacturing"
                checked={includeManufacturingInfo}
                onChange={(e) => setIncludeManufacturingInfo(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="includeManufacturing" className="text-white text-sm">
                Include Manufacturing Information
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="includeRegulatory"
                checked={includeRegulatoryInfo}
                onChange={(e) => setIncludeRegulatoryInfo(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="includeRegulatory" className="text-white text-sm">
                Include Regulatory Information ({complianceRecords.length} records)
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-6 border-t border-gray-700">
            {onClose && (
              <button
                onClick={onClose}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <SparklesIcon className="w-5 h-5" />
              Generate with AI
            </button>
          </div>
        </div>
      )}

      {/* Generating Step */}
      {currentStep === 'generating' && (
        <div className="text-center space-y-6 py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-400 mx-auto"></div>
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">Generating Document...</h3>
            <p className="text-gray-400">{progress}</p>
          </div>
          <p className="text-sm text-gray-500">
            This may take 10-30 seconds depending on document complexity
          </p>
        </div>
      )}

      {/* Preview Step */}
      {currentStep === 'preview' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-green-400">
            <CheckCircleIcon className="w-6 h-6" />
            <span className="font-semibold">Document Generated Successfully!</span>
          </div>

          <div className="bg-indigo-900/20 border border-indigo-700 rounded-lg p-4">
            <p className="text-sm text-indigo-300">
              <strong>Preview:</strong> Review the generated content below. You can edit it after saving.
            </p>
          </div>

          {renderContentPreview()}

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-6 border-t border-gray-700">
            <button
              onClick={() => setCurrentStep('config')}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              Regenerate
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              Save to Database
            </button>
          </div>
        </div>
      )}

      {/* Saving Step */}
      {currentStep === 'saving' && (
        <div className="text-center space-y-6 py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-400 mx-auto"></div>
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">Saving...</h3>
            <p className="text-gray-400">{progress}</p>
          </div>
        </div>
      )}

      {/* Complete Step */}
      {currentStep === 'complete' && (
        <div className="space-y-6 py-8">
          <div className="text-center space-y-4">
            <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto" />
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Complete!</h3>
              <p className="text-gray-400">Product data sheet saved successfully</p>
              {savedDataSheet && (
                <p className="text-sm text-gray-500 mt-2">
                  ID: {savedDataSheet.id} • Version {savedDataSheet.version}
                </p>
              )}
            </div>
          </div>

          {/* PDF Generation Section */}
          <div className="bg-indigo-900/20 border border-indigo-700 rounded-lg p-6">
            <h4 className="text-sm font-semibold text-indigo-300 mb-4">Generate PDF Document</h4>
            <p className="text-sm text-gray-400 mb-4">
              Create a professional PDF version of your data sheet with proper formatting and branding.
            </p>

            {isGeneratingPDF ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto mb-2"></div>
                <p className="text-sm text-gray-400">{progress}</p>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleDownloadPDF}
                  disabled={!savedDataSheet}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  <ArrowDownTrayIcon className="w-5 h-5" />
                  Download PDF
                </button>

                <button
                  onClick={handleGenerateAndUploadPDF}
                  disabled={!savedDataSheet}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  <ArrowDownTrayIcon className="w-5 h-5" />
                  Generate & Store PDF
                </button>
              </div>
            )}

            {savedDataSheet?.pdfUrl && (
              <div className="mt-4 p-3 bg-green-900/20 border border-green-700 rounded-lg">
                <p className="text-xs text-green-300 mb-2">
                  ✓ PDF already generated and stored
                </p>
                <a
                  href={savedDataSheet.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-400 hover:text-green-300 underline"
                >
                  View stored PDF
                </a>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-700">
            <button
              onClick={() => {
                setCurrentStep('config');
                setGeneratedContent(null);
                setSavedDataSheet(null);
              }}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              Generate Another
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Step */}
      {currentStep === 'error' && (
        <div className="space-y-6">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <XCircleIcon className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium mb-2">Generation Failed</p>
                <p className="text-gray-400 text-sm">{error}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setCurrentStep('config');
                setError('');
              }}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDataSheetGenerator;
