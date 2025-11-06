import React, { useState, useRef } from 'react';
import type { BillOfMaterials, Artwork } from '../types';
import Modal from './Modal';
import { fileToBase64, scanLabelImage } from '../services/labelScanningService';

interface UploadArtworkModalProps {
    isOpen: boolean;
    onClose: () => void;
    boms: BillOfMaterials[];
    onUpload: (bomId: string, artwork: Omit<Artwork, 'id'>) => void;
    currentUser?: { id: string; email: string };
}

const UploadArtworkModal: React.FC<UploadArtworkModalProps> = ({
    isOpen,
    onClose,
    boms,
    onUpload,
    currentUser
}) => {
    const [selectedBomId, setSelectedBomId] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string>('');
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState<string>('');
    const [version, setVersion] = useState('1.0');
    const [notes, setNotes] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (selectedFile: File) => {
        // Validate file type
        const validTypes = ['application/pdf', 'application/postscript', 'image/png', 'image/jpeg'];
        const isValidType = validTypes.includes(selectedFile.type) ||
                           selectedFile.name.endsWith('.ai') ||
                           selectedFile.name.endsWith('.pdf');

        if (!isValidType) {
            alert('Please upload a PDF or Adobe Illustrator (.ai) file');
            return;
        }

        // Validate file size (max 50MB)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (selectedFile.size > maxSize) {
            alert('File size must be less than 50MB');
            return;
        }

        setFile(selectedFile);

        // Create preview for PDFs (first page) or images
        if (selectedFile.type === 'application/pdf' || selectedFile.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setFilePreview(e.target?.result as string);
            };
            reader.readAsDataURL(selectedFile);
        } else {
            // For .ai files, show icon only
            setFilePreview('');
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
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

    const handleSubmit = async () => {
        if (!selectedBomId || !file) {
            alert('Please select a product and upload a file');
            return;
        }

        setUploading(true);
        setScanProgress('Uploading file...');

        try {
            // Convert file to base64 for storage
            const base64Data = await fileToBase64(file);
            const dataUrl = `data:${file.type};base64,${base64Data}`;

            // Get file type
            let fileType: Artwork['fileType'] = 'artwork';
            if (file.name.toLowerCase().includes('label')) fileType = 'label';
            else if (file.name.toLowerCase().includes('bag')) fileType = 'bag';
            else if (file.name.toLowerCase().includes('doc')) fileType = 'document';

            // Create artwork object
            const newArtwork: Omit<Artwork, 'id'> = {
                fileName: file.name,
                revision: parseFloat(version),
                url: dataUrl, // Store as base64 data URL
                fileType,
                fileSize: file.size,
                mimeType: file.type || 'application/octet-stream',
                uploadedAt: new Date().toISOString(),
                uploadedBy: currentUser?.id,
                status: 'draft',
                scanStatus: 'pending',
                verified: false,
                notes: notes || undefined
            };

            // Check if this is a label - if so, trigger AI scan
            if (fileType === 'label') {
                setScanning(true);
                setScanProgress('Scanning label with AI...');

                try {
                    const extractedData = await scanLabelImage(base64Data);

                    newArtwork.extractedData = extractedData;
                    newArtwork.scanStatus = 'completed';
                    newArtwork.scanCompletedAt = new Date().toISOString();

                    // If barcode found, add to artwork
                    if (extractedData?.barcode) {
                        newArtwork.barcode = extractedData.barcode;
                    }

                    setScanProgress('Scan completed successfully!');
                } catch (scanError) {
                    console.error('Scan error:', scanError);
                    newArtwork.scanStatus = 'failed';
                    newArtwork.scanError = scanError instanceof Error ? scanError.message : 'Scan failed';
                    setScanProgress('Scan failed, but file uploaded successfully');
                }
            }

            // Call parent handler
            onUpload(selectedBomId, newArtwork);

            // Reset and close
            setTimeout(() => {
                setUploading(false);
                setScanning(false);
                setScanProgress('');
                setFile(null);
                setFilePreview('');
                setSelectedBomId('');
                setVersion('1.0');
                setNotes('');
                onClose();
            }, 1500);

        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload file. Please try again.');
            setUploading(false);
            setScanning(false);
            setScanProgress('');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload Label Artwork">
            <div className="space-y-6">
                {/* Product Selection */}
                <div>
                    <label htmlFor="bom-select" className="block text-sm font-medium text-gray-300">
                        Product / Bill of Materials <span className="text-red-400">*</span>
                    </label>
                    <select
                        id="bom-select"
                        value={selectedBomId}
                        onChange={(e) => setSelectedBomId(e.target.value)}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        disabled={uploading}
                    >
                        <option value="">Select a product...</option>
                        {boms.map(bom => (
                            <option key={bom.id} value={bom.id}>
                                {bom.name} ({bom.finishedSku})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Version and Notes */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="version" className="block text-sm font-medium text-gray-300">
                            Version
                        </label>
                        <input
                            type="text"
                            id="version"
                            value={version}
                            onChange={e => setVersion(e.target.value)}
                            placeholder="1.0"
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            disabled={uploading}
                        />
                    </div>
                    <div>
                        <label htmlFor="notes" className="block text-sm font-medium text-gray-300">
                            Notes (optional)
                        </label>
                        <input
                            type="text"
                            id="notes"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="e.g., Updated ingredients"
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            disabled={uploading}
                        />
                    </div>
                </div>

                {/* File Upload Area */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Upload File (PDF or .ai) <span className="text-red-400">*</span>
                    </label>
                    <div
                        className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors cursor-pointer ${
                            isDragging
                                ? 'border-indigo-500 bg-indigo-900/20'
                                : 'border-gray-600 hover:border-gray-500'
                        } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                        <div className="space-y-2 text-center">
                            {file ? (
                                <>
                                    {filePreview && (
                                        <img
                                            src={filePreview}
                                            alt="Preview"
                                            className="mx-auto h-24 w-auto rounded border border-gray-600"
                                        />
                                    )}
                                    <div className="flex items-center justify-center gap-2">
                                        <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <div className="text-sm">
                                            <p className="font-medium text-white">{file.name}</p>
                                            <p className="text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        </div>
                                    </div>
                                    {!uploading && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFile(null);
                                                setFilePreview('');
                                            }}
                                            className="text-xs text-red-400 hover:text-red-300"
                                        >
                                            Remove file
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <svg className="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <div className="text-sm text-gray-400">
                                        <p className="font-semibold text-indigo-400">Click to upload</p>
                                        <p>or drag and drop</p>
                                        <p className="text-xs mt-1">PDF or Adobe Illustrator (.ai) files</p>
                                        <p className="text-xs">Maximum file size: 50MB</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.ai,application/pdf,application/postscript"
                        onChange={handleFileInputChange}
                        className="hidden"
                        disabled={uploading}
                    />
                </div>

                {/* Progress Indicator */}
                {(uploading || scanning) && (
                    <div className="bg-indigo-900/20 border border-indigo-700 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-400"></div>
                            <div className="text-sm">
                                <p className="font-semibold text-indigo-400">
                                    {scanning ? 'AI Scanning Label...' : 'Uploading...'}
                                </p>
                                <p className="text-gray-400 text-xs">{scanProgress}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Info Box */}
                <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                    <p className="text-xs text-blue-300">
                        <strong>✨ AI Label Scanning:</strong> If you upload a label file, our AI will automatically
                        extract ingredients, barcode, guaranteed analysis, and claims for verification.
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end pt-6 border-t border-gray-700 gap-3">
                    <button
                        onClick={onClose}
                        disabled={uploading}
                        className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedBomId || !file || uploading}
                        className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        {uploading ? (scanning ? 'Scanning...' : 'Uploading...') : 'Upload & Scan'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default UploadArtworkModal;
