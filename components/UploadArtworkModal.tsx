
import React, { useState } from 'react';
import type { BillOfMaterials } from '../types';
import Modal from './Modal';

interface UploadArtworkModalProps {
    isOpen: boolean;
    onClose: () => void;
    boms: BillOfMaterials[];
    onUpload: (finishedSku: string, fileName: string) => void;
}

const UploadArtworkModal: React.FC<UploadArtworkModalProps> = ({ isOpen, onClose, boms, onUpload }) => {
    const [selectedBomSku, setSelectedBomSku] = useState<string>('');
    const [fileName, setFileName] = useState('');

    const handleSubmit = () => {
        if (!selectedBomSku || !fileName) {
            // Add toast notification for error
            return;
        }
        onUpload(selectedBomSku, fileName);
        onClose();
        // Reset state
        setSelectedBomSku('');
        setFileName('');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload New Artwork">
            <div className="space-y-6">
                <div>
                    <label htmlFor="bom-select" className="block text-sm font-medium text-gray-300">
                        Product / Bill of Materials
                    </label>
                    <select
                        id="bom-select"
                        value={selectedBomSku}
                        onChange={(e) => setSelectedBomSku(e.target.value)}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                        <option value="" disabled>Select a product to associate artwork with</option>
                        {boms.map(bom => (
                            <option key={bom.id} value={bom.finishedSku}>{bom.name} ({bom.finishedSku})</option>
                        ))}
                    </select>
                </div>
                <div>
                     <label htmlFor="file-name" className="block text-sm font-medium text-gray-300">
                        File Name
                    </label>
                    <input
                        type="text"
                        id="file-name"
                        value={fileName}
                        onChange={e => setFileName(e.target.value)}
                        placeholder="e.g., product-label-5x6.ai"
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">
                        Upload File (Mock)
                    </label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md">
                        <div className="space-y-1 text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="flex text-sm text-gray-500">
                                <p className="pl-1">This is a UI demonstration. File uploads are not functional.</p>
                            </div>
                        </div>
                    </div>
                </div>
                 <div className="flex justify-end pt-6 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</button>
                    <button onClick={handleSubmit} disabled={!selectedBomSku || !fileName} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                        Add Artwork Record
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default UploadArtworkModal;
