import React, { useState, useRef } from 'react';
import Button from '@/components/ui/Button';
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

interface FileUploadStatus {
    file: File;
    status: 'pending' | 'uploading' | 'scanning' | 'completed' | 'failed';
    progress: string;
    error?: string;
}

const UploadArtworkModal: React.FC<UploadArtworkModalProps> = ({
    isOpen,
    onClose,
    boms,
    onUpload,
    currentUser
}) => {
    const [selectedBomId, setSelectedBomId] = useState<string>('');
    const [files, setFiles] = useState<FileUploadStatus[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [version, setVersion] = useState('1.0');
    const [notes, setNotes] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFilesSelect = async (selectedFiles: FileList | File[]) => {
        const newFiles: FileUploadStatus[] = [];

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];

            // Validate file type
            const validTypes = ['application/pdf', 'application/postscript', 'image/png', 'image/jpeg'];
            const isValidType = validTypes.includes(file.type) ||
                               file.name.endsWith('.ai') ||
                               file.name.endsWith('.pdf');

            if (!isValidType) {
                continue; // Skip invalid files
            }

            // Validate file size (max 50MB)
            const maxSize = 50 * 1024 * 1024; // 50MB
            if (file.size > maxSize) {
                continue; // Skip large files
            }

            newFiles.push({
                file,
                status: 'pending',
                progress: 'Ready to upload'
            });
        }

        setFiles(prev => [...prev, ...newFiles]);
    };

    const handleRemoveFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
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

        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles && droppedFiles.length > 0) {
            handleFilesSelect(droppedFiles);
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (selectedFiles && selectedFiles.length > 0) {
            handleFilesSelect(selectedFiles);
        }
    };

    const handleSubmit = async () => {
        if (!selectedBomId || files.length === 0) {
            alert('Please select a product and upload at least one file');
            return;
        }

        setUploading(true);

        // Process each file
        for (let i = 0; i < files.length; i++) {
            const fileStatus = files[i];

            if (fileStatus.status !== 'pending') continue; // Skip already processed

            // Update status to uploading
            setFiles(prev => prev.map((f, idx) =>
                idx === i ? { ...f, status: 'uploading', progress: 'Uploading...' } : f
            ));

            try {
                const file = fileStatus.file;

                // Convert file to base64
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
                    url: dataUrl,
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

                // If label, scan with AI
                if (fileType === 'label') {
                    setFiles(prev => prev.map((f, idx) =>
                        idx === i ? { ...f, status: 'scanning', progress: 'Scanning with AI...' } : f
                    ));

                    try {
                        const extractedData = await scanLabelImage(base64Data);
                        newArtwork.extractedData = extractedData;
                        newArtwork.scanStatus = 'completed';
                        newArtwork.scanCompletedAt = new Date().toISOString();

                        if (extractedData?.barcode) {
                            newArtwork.barcode = extractedData.barcode;
                        }
                    } catch (scanError) {
                        console.error('Scan error:', scanError);
                        newArtwork.scanStatus = 'failed';
                        newArtwork.scanError = scanError instanceof Error ? scanError.message : 'Scan failed';
                    }
                }

                // Upload
                onUpload(selectedBomId, newArtwork);

                // Mark as completed
                setFiles(prev => prev.map((f, idx) =>
                    idx === i ? { ...f, status: 'completed', progress: 'Complete!' } : f
                ));

            } catch (error) {
                console.error('Upload error:', error);
                setFiles(prev => prev.map((f, idx) =>
                    idx === i ? {
                        ...f,
                        status: 'failed',
                        progress: 'Failed',
                        error: error instanceof Error ? error.message : 'Upload failed'
                    } : f
                ));
            }
        }

        // Close after all files processed
        setTimeout(() => {
            setUploading(false);
            setFiles([]);
            setSelectedBomId('');
            setVersion('1.0');
            setNotes('');
            onClose();
        }, 1500);
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
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
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
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
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
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
                            disabled={uploading}
                        />
                    </div>
                </div>

                {/* File Upload Area */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Upload Files (PDF or .ai) <span className="text-red-400">*</span>
                    </label>
                    <div
                        className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors cursor-pointer ${
                            isDragging
                                ? 'border-accent-500 bg-accent-900/20'
                                : 'border-gray-600 hover:border-gray-500'
                        } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                        <div className="space-y-2 text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="text-sm text-gray-400">
                                <p className="font-semibold text-accent-400">Click to upload or drag and drop</p>
                                <p className="text-xs mt-1">PDF or Adobe Illustrator (.ai) files</p>
                                <p className="text-xs">Maximum file size: 50MB per file</p>
                                <p className="text-xs font-semibold text-green-400 mt-2">✨ Supports multiple files!</p>
                            </div>
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.ai,application/pdf,application/postscript"
                        onChange={handleFileInputChange}
                        className="hidden"
                        disabled={uploading}
                        multiple
                    />
                </div>

                {/* Files List */}
                {files.length > 0 && (
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h4 className="text-sm font-semibold text-white mb-3">
                            Files to Upload ({files.length})
                        </h4>
                        <div className="space-y-2">
                            {files.map((fileStatus, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-gray-900/50 rounded border border-gray-700"
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        {fileStatus.status === 'completed' ? (
                                            <svg className="h-5 w-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        ) : fileStatus.status === 'failed' ? (
                                            <svg className="h-5 w-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        ) : fileStatus.status === 'uploading' || fileStatus.status === 'scanning' ? (
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-400 flex-shrink-0"></div>
                                        ) : (
                                            <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{fileStatus.file.name}</p>
                                            <p className="text-xs text-gray-400">{fileStatus.progress}</p>
                                        </div>
                                    </div>
                                    {!uploading && fileStatus.status === 'pending' && (
                                        <Button
                                            onClick={() => handleRemoveFile(idx)}
                                            className="ml-3 text-red-400 hover:text-red-300 text-xs"
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </div>
                            ))}
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
                    <Button
                        onClick={onClose}
                        disabled={uploading}
                        className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!selectedBomId || files.length === 0 || uploading}
                        className="bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        {uploading ? 'Processing...' : 'Upload & Scan'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default UploadArtworkModal;
