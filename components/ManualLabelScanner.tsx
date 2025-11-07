/**
 * Manual Label Scanner
 *
 * Standalone component for scanning labels manually with AI extraction
 * Supports:
 * - Drag-and-drop file upload
 * - Real-time AI scanning with progress
 * - Edit extracted data
 * - Link to existing BOM or create new product
 * - Save to Supabase
 */

import React, { useState, useRef } from 'react';
import { scanLabelImage } from '../services/labelScanningService';
import { createLabel, updateLabel } from '../services/labelDataService';
import type { Label, BillOfMaterials } from '../types';
import {
  CloudUploadIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon
} from './icons';
import Barcode from './Barcode';

interface ManualLabelScannerProps {
  boms: BillOfMaterials[];
  currentUser?: { id: string; email: string };
  onScanComplete?: (label: Label) => void;
  onClose?: () => void;
}

type ScanStep = 'upload' | 'scanning' | 'review' | 'link' | 'saving' | 'complete';

const ManualLabelScanner: React.FC<ManualLabelScannerProps> = ({
  boms,
  currentUser,
  onScanComplete,
  onClose
}) => {
  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scan state
  const [currentStep, setCurrentStep] = useState<ScanStep>('upload');
  const [scanProgress, setScanProgress] = useState<string>('');
  const [scanError, setScanError] = useState<string>('');

  // Label data
  const [labelData, setLabelData] = useState<Partial<Label> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<Label['extractedData'] | null>(null);

  // BOM linking
  const [selectedBomId, setSelectedBomId] = useState<string>('');
  const [linkToBom, setLinkToBom] = useState<boolean>(false);

  // ============================================================================
  // File Upload Handlers
  // ============================================================================

  const handleFileSelect = async (selectedFile: File) => {
    // Validate file type
    const validTypes = ['application/pdf', 'application/postscript', 'image/png', 'image/jpeg'];
    const isValidType = validTypes.includes(selectedFile.type) ||
                       selectedFile.name.endsWith('.ai') ||
                       selectedFile.name.endsWith('.pdf');

    if (!isValidType) {
      alert('Please upload a PDF, image (PNG/JPG), or Adobe Illustrator (.ai) file');
      return;
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      alert('File size must be less than 50MB');
      return;
    }

    setFile(selectedFile);

    // Create preview
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setFilePreview('');
    }

    // Auto-start scanning
    await handleScan(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  // ============================================================================
  // AI Scanning
  // ============================================================================

  const handleScan = async (fileToScan: File) => {
    setCurrentStep('scanning');
    setScanProgress('Preparing file...');
    setScanError('');

    try {
      // Convert file to base64
      const base64Data = await fileToBase64(fileToScan);

      setScanProgress('Scanning label with AI...');

      // Scan with AI
      const extractedData = await scanLabelImage(base64Data);

      setScanProgress('Extraction complete!');

      // Create label data object
      const newLabel: Partial<Label> = {
        fileName: fileToScan.name,
        fileUrl: `data:${fileToScan.type};base64,${base64Data}`,
        fileSize: fileToScan.size,
        mimeType: fileToScan.type || 'application/octet-stream',
        barcode: extractedData.barcode,
        productName: extractedData.productName,
        netWeight: extractedData.netWeight,
        scanStatus: 'completed',
        scanCompletedAt: new Date().toISOString(),
        extractedData,
        verified: false,
        fileType: 'label',
        status: 'draft',
        uploadedBy: currentUser?.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setLabelData(newLabel);
      setEditedData(extractedData);
      setCurrentStep('review');

    } catch (error) {
      console.error('Scan error:', error);
      setScanError(error instanceof Error ? error.message : 'Scan failed');
      setCurrentStep('upload');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // ============================================================================
  // Edit Handlers
  // ============================================================================

  const handleAddIngredient = () => {
    if (!editedData) return;
    const newIngredient = {
      name: '',
      percentage: '',
      order: (editedData.ingredients?.length || 0) + 1,
      confidence: 1.0
    };
    setEditedData({
      ...editedData,
      ingredients: [...(editedData.ingredients || []), newIngredient]
    });
  };

  const handleRemoveIngredient = (index: number) => {
    if (!editedData?.ingredients) return;
    const newIngredients = editedData.ingredients.filter((_, i) => i !== index);
    setEditedData({
      ...editedData,
      ingredients: newIngredients
    });
  };

  const handleIngredientChange = (index: number, field: string, value: any) => {
    if (!editedData?.ingredients) return;
    const newIngredients = [...editedData.ingredients];
    (newIngredients[index] as any)[field] = value;
    setEditedData({
      ...editedData,
      ingredients: newIngredients
    });
  };

  const handleSaveEdits = () => {
    if (labelData && editedData) {
      setLabelData({
        ...labelData,
        extractedData: editedData,
        productName: editedData.productName,
        netWeight: editedData.netWeight,
        barcode: editedData.barcode,
      });
    }
    setIsEditing(false);
  };

  const handleCancelEdits = () => {
    setEditedData(labelData?.extractedData || null);
    setIsEditing(false);
  };

  // ============================================================================
  // Save to Supabase
  // ============================================================================

  const handleSaveToDatabase = async () => {
    if (!labelData) return;

    setCurrentStep('saving');
    setScanProgress('Saving to database...');

    try {
      const finalLabel: Omit<Label, 'id' | 'createdAt' | 'updatedAt'> = {
        fileName: labelData.fileName!,
        fileUrl: labelData.fileUrl!,
        fileSize: labelData.fileSize,
        mimeType: labelData.mimeType,
        barcode: labelData.barcode,
        productName: labelData.productName,
        netWeight: labelData.netWeight,
        revision: labelData.revision,
        bomId: linkToBom && selectedBomId ? selectedBomId : undefined,
        scanStatus: labelData.scanStatus!,
        scanCompletedAt: labelData.scanCompletedAt,
        scanError: labelData.scanError,
        extractedData: labelData.extractedData,
        ingredientComparison: labelData.ingredientComparison,
        verified: labelData.verified!,
        verifiedBy: labelData.verifiedBy,
        verifiedAt: labelData.verifiedAt,
        fileType: labelData.fileType,
        status: labelData.status,
        approvedBy: labelData.approvedBy,
        approvedDate: labelData.approvedDate,
        notes: labelData.notes,
        uploadedBy: labelData.uploadedBy,
      };

      const savedLabel = await createLabel(finalLabel);

      setScanProgress('Saved successfully!');
      setCurrentStep('complete');

      if (onScanComplete) {
        onScanComplete(savedLabel);
      }

      // Auto-close after 2 seconds
      setTimeout(() => {
        if (onClose) {
          onClose();
        } else {
          handleReset();
        }
      }, 2000);

    } catch (error) {
      console.error('Save error:', error);
      setScanError(error instanceof Error ? error.message : 'Failed to save to database');
      setCurrentStep('review');
    }
  };

  // ============================================================================
  // Reset
  // ============================================================================

  const handleReset = () => {
    setFile(null);
    setFilePreview('');
    setCurrentStep('upload');
    setScanProgress('');
    setScanError('');
    setLabelData(null);
    setEditedData(null);
    setIsEditing(false);
    setSelectedBomId('');
    setLinkToBom(false);
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Manual Label Scanner</h1>
        <p className="text-gray-400">
          Upload and scan product labels with AI extraction. No BOM required.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <StepIndicator step={1} label="Upload" active={currentStep === 'upload'} completed={currentStep !== 'upload'} />
          <div className="flex-1 h-0.5 bg-gray-700 mx-2" />
          <StepIndicator step={2} label="Scan" active={currentStep === 'scanning'} completed={['review', 'link', 'saving', 'complete'].includes(currentStep)} />
          <div className="flex-1 h-0.5 bg-gray-700 mx-2" />
          <StepIndicator step={3} label="Review" active={currentStep === 'review'} completed={['link', 'saving', 'complete'].includes(currentStep)} />
          <div className="flex-1 h-0.5 bg-gray-700 mx-2" />
          <StepIndicator step={4} label="Save" active={['saving', 'complete'].includes(currentStep)} completed={currentStep === 'complete'} />
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
        {/* Upload Step */}
        {currentStep === 'upload' && (
          <div className="space-y-6">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-900/20'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <CloudUploadIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                Drop label file here or click to browse
              </h3>
              <p className="text-gray-400 mb-6">
                Supported formats: PDF, PNG, JPG, Adobe Illustrator (.ai)
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Select File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.ai,.png,.jpg,.jpeg,application/pdf,application/postscript,image/png,image/jpeg"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>

            {scanError && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-400 font-medium">Scan Failed</p>
                    <p className="text-gray-400 text-sm mt-1">{scanError}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scanning Step */}
        {currentStep === 'scanning' && (
          <div className="text-center space-y-6">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-400 mx-auto"></div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Scanning Label...</h3>
              <p className="text-gray-400">{scanProgress}</p>
            </div>
            {file && (
              <div className="mt-4 text-sm text-gray-500">
                File: {file.name}
              </div>
            )}
          </div>
        )}

        {/* Review Step */}
        {currentStep === 'review' && labelData && editedData && (
          <div className="space-y-6">
            {/* Header with Edit Button */}
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Extracted Data</h3>
              <div className="flex gap-3">
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleCancelEdits}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdits}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      Save Edits
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Product Information */}
            <div className="bg-gray-900/50 rounded-lg p-6 space-y-4">
              <h4 className="text-sm font-semibold text-gray-400 uppercase">Product Information</h4>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Product Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedData.productName || ''}
                    onChange={(e) => setEditedData({ ...editedData, productName: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-white font-semibold">{editedData.productName || '-'}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Net Weight</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedData.netWeight || ''}
                      onChange={(e) => setEditedData({ ...editedData, netWeight: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className="text-white">{editedData.netWeight || '-'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Barcode</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedData.barcode || ''}
                      onChange={(e) => setEditedData({ ...editedData, barcode: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className="text-white font-mono">{editedData.barcode || '-'}</p>
                  )}
                </div>
              </div>

              {/* Barcode Visual */}
              {editedData.barcode && !isEditing && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-400 mb-2">Visual Barcode:</p>
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <Barcode value={editedData.barcode} width={3} height={100} displayValue={true} />
                  </div>
                </div>
              )}
            </div>

            {/* Ingredients */}
            {editedData.ingredients && editedData.ingredients.length > 0 && (
              <div className="bg-gray-900/50 rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase">Ingredients</h4>
                  {isEditing && (
                    <button
                      onClick={handleAddIngredient}
                      className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
                    >
                      <PlusCircleIcon className="w-4 h-4" />
                      Add Ingredient
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {editedData.ingredients.map((ing, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded">
                      {isEditing ? (
                        <>
                          <input
                            type="number"
                            value={ing.order}
                            onChange={(e) => handleIngredientChange(idx, 'order', parseInt(e.target.value))}
                            className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                            placeholder="#"
                          />
                          <input
                            type="text"
                            value={ing.name}
                            onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}
                            className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm"
                            placeholder="Ingredient name"
                          />
                          <input
                            type="text"
                            value={ing.percentage || ''}
                            onChange={(e) => handleIngredientChange(idx, 'percentage', e.target.value)}
                            className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                            placeholder="%"
                          />
                          <button
                            onClick={() => handleRemoveIngredient(idx)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-500 font-mono text-sm w-8">{ing.order}.</span>
                          <span className="flex-1 text-white">{ing.name}</span>
                          {ing.percentage && (
                            <span className="text-gray-400 text-sm">{ing.percentage}</span>
                          )}
                          <span className="text-xs text-gray-500">
                            {Math.round(ing.confidence * 100)}% confident
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOM Linking */}
            <div className="bg-gray-900/50 rounded-lg p-6 space-y-4">
              <h4 className="text-sm font-semibold text-gray-400 uppercase">Link to Product (Optional)</h4>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="linkToBom"
                  checked={linkToBom}
                  onChange={(e) => setLinkToBom(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="linkToBom" className="text-white">
                  Link this label to an existing product
                </label>
              </div>

              {linkToBom && (
                <select
                  value={selectedBomId}
                  onChange={(e) => setSelectedBomId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select a product...</option>
                  {boms.map((bom) => (
                    <option key={bom.id} value={bom.id}>
                      {bom.name} ({bom.finishedSku})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end pt-6 border-t border-gray-700">
              <button
                onClick={onClose || handleReset}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToDatabase}
                disabled={isEditing}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                Save to Database
              </button>
            </div>
          </div>
        )}

        {/* Saving Step */}
        {currentStep === 'saving' && (
          <div className="text-center space-y-6">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-400 mx-auto"></div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Saving...</h3>
              <p className="text-gray-400">{scanProgress}</p>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {currentStep === 'complete' && (
          <div className="text-center space-y-6">
            <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto" />
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Scan Complete!</h3>
              <p className="text-gray-400">Label saved successfully to database</p>
            </div>
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Scan Another Label
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Step Indicator Component
interface StepIndicatorProps {
  step: number;
  label: string;
  active: boolean;
  completed: boolean;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ step, label, active, completed }) => (
  <div className="flex flex-col items-center">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
      completed ? 'bg-green-600 text-white' :
      active ? 'bg-indigo-600 text-white' :
      'bg-gray-700 text-gray-400'
    }`}>
      {completed ? '✓' : step}
    </div>
    <span className={`text-xs mt-2 ${active ? 'text-white font-semibold' : 'text-gray-400'}`}>
      {label}
    </span>
  </div>
);

export default ManualLabelScanner;
