// Tier 1 AI Enhancement: Batch Artwork Verification
// Modal for uploading and verifying multiple artwork files

import React, { useState, useRef } from 'react';
import type { BillOfMaterials, AiConfig } from '../types';
import type { BatchArtworkResult } from '../types/regulatory';
import Modal from './Modal';
import { verifyArtworkBatch, exportBatchResultsToCSV } from '../services/batchArtworkService';
import { SparklesIcon, DocumentDuplicateIcon, CloseIcon, CheckCircleIcon, ExclamationCircleIcon, XCircleIcon } from './icons';

interface BatchArtworkVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  boms: BillOfMaterials[];
  aiConfig: AiConfig;
}

const BatchArtworkVerificationModal: React.FC<BatchArtworkVerificationModalProps> = ({
  isOpen,
  onClose,
  boms,
  aiConfig,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<BatchArtworkResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    
    const imageFiles = Array.from(selectedFiles).filter(
      file => file.type.startsWith('image/') || file.type === 'application/pdf'
    );
    
    setFiles(prev => [...prev, ...imageFiles]);
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
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleVerifyBatch = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setProgress({ completed: 0, total: files.length });
    setResults([]);

    try {
      const promptTemplate = aiConfig.prompts.find(p => p.id === 'verifyArtworkLabel');
      if (!promptTemplate) throw new Error('Artwork verification prompt not found.');

      const batchResults = await verifyArtworkBatch(
        files,
        boms,
        aiConfig.model,
        promptTemplate.prompt,
        (completed, total) => {
          setProgress({ completed, total });
        }
      );

      setResults(batchResults);
      setError(null);
    } catch (error) {
      console.error('Batch verification error:', error);
      setError(error instanceof Error ? error.message : 'An error occurred during batch verification. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportCSV = () => {
    const csv = exportBatchResultsToCSV(results);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artwork-verification-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFiles([]);
    setResults([]);
    setProgress({ completed: 0, total: 0 });
  };

  const getStatusIcon = (status: BatchArtworkResult['status']) => {
    switch (status) {
      case 'Success':
        return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
      case 'Warning':
        return <ExclamationCircleIcon className="w-5 h-5 text-yellow-400" />;
      case 'Error':
        return <XCircleIcon className="w-5 h-5 text-red-400" />;
    }
  };

  const successCount = results.filter(r => r.status === 'Success').length;
  const warningCount = results.filter(r => r.status === 'Warning').length;
  const errorCount = results.filter(r => r.status === 'Error').length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Batch Artwork Verification">
      <div className="space-y-6">
        {/* Error Display */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
            <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-semibold">Verification Error</p>
              <p className="text-red-200 text-sm mt-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-sm text-red-400 hover:text-red-300 mt-2 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        
        {/* Upload Section */}
        {!isProcessing && results.length === 0 && (
          <div>
            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <DocumentDuplicateIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-white font-semibold mb-2">
                Drag & Drop artwork files here
              </p>
              <p className="text-gray-400 text-sm mb-4">
                or click to browse (PNG, JPG, PDF)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={e => handleFileSelect(e.target.files)}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md transition-colors"
              >
                Select Files
              </button>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-6">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-white font-semibold">
                    Selected Files ({files.length})
                  </h3>
                  <button
                    onClick={handleReset}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    Clear All
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto bg-gray-800/50 p-3 rounded-lg">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center bg-gray-700/50 p-2 rounded"
                    >
                      <span className="text-sm text-gray-300 truncate flex-1">
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeFile(index)}
                        className="ml-2 text-gray-400 hover:text-red-400"
                      >
                        <CloseIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleVerifyBatch}
                  className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <SparklesIcon className="w-5 h-5" />
                  Verify All Artwork
                </button>
              </div>
            )}
          </div>
        )}

        {/* Processing Section */}
        {isProcessing && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400 mx-auto mb-4"></div>
            <p className="text-white font-semibold mb-2">
              Verifying artwork...
            </p>
            <p className="text-gray-400">
              {progress.completed} of {progress.total} files processed
            </p>
            <div className="w-full bg-gray-700 rounded-full h-2 mt-4 max-w-md mx-auto">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.completed / progress.total) * 100}%`,
                }}
              ></div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {!isProcessing && results.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold text-lg">
                Verification Results
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handleExportCSV}
                  className="text-sm bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-md transition-colors"
                >
                  Export CSV
                </button>
                <button
                  onClick={handleReset}
                  className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition-colors"
                >
                  New Batch
                </button>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{successCount}</p>
                <p className="text-sm text-green-300">Success</p>
              </div>
              <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">{warningCount}</p>
                <p className="text-sm text-yellow-300">Warnings</p>
              </div>
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{errorCount}</p>
                <p className="text-sm text-red-300">Errors</p>
              </div>
            </div>

            {/* Results Table */}
            <div className="bg-gray-800/50 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-700 sticky top-0">
                  <tr>
                    <th className="text-left p-3 text-gray-300 text-sm font-semibold">Status</th>
                    <th className="text-left p-3 text-gray-300 text-sm font-semibold">File</th>
                    <th className="text-left p-3 text-gray-300 text-sm font-semibold">Product</th>
                    <th className="text-left p-3 text-gray-300 text-sm font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr
                      key={index}
                      className="border-t border-gray-700 hover:bg-gray-700/30"
                    >
                      <td className="p-3">{getStatusIcon(result.status)}</td>
                      <td className="p-3 text-sm text-gray-300 max-w-xs truncate">
                        {result.fileName}
                      </td>
                      <td className="p-3 text-sm text-gray-300">
                        {result.productName || 'N/A'}
                      </td>
                      <td className="p-3 text-xs text-gray-400">
                        {result.verificationDetails ? (
                          <div>
                            <div>Barcode: {result.verificationDetails.barcodeMatch ? '✓' : '✗'}</div>
                            <div>Quality: {result.verificationDetails.qualityScore}</div>
                            {result.verificationDetails.issues.length > 0 && (
                              <div className="text-red-400 mt-1">
                                {result.verificationDetails.issues.join(', ')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-500">{result.message}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BatchArtworkVerificationModal;
