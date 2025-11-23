import React from 'react';
import Modal from './Modal';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from './icons';

import Button from '@/components/ui/Button';
interface ImportExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExportCsv: () => void;
    onExportPdf: () => void;
    onExportJson: () => void;
    onExportXls: () => void;
}

const ImportExportModal: React.FC<ImportExportModalProps> = ({ isOpen, onClose, onExportCsv, onExportPdf, onExportJson, onExportXls }) => {

    const handleDownloadTemplate = () => {
        const templateData = [{
            sku: "COMP-001",
            name: "Worm Castings (1 lb)",
            category: "Amendments",
            stock: 500,
            onOrder: 100,
            reorderPoint: 200,
            vendorId: 'VEND-001',
            moq: 50
        }];
        
        const headers = Object.keys(templateData[0]).join(',');
        const csvString = headers + '\n';
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'inventory_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Import & Export Inventory">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Import Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <ArrowUpTrayIcon className="w-6 h-6 text-indigo-400" />
                        Import from CSV
                    </h3>
                    <p className="text-sm text-gray-400">
                        Upload a CSV file to bulk-add or update inventory items. Make sure your file matches the template format.
                    </p>
                    <Button 
                        onClick={handleDownloadTemplate}
                        className="w-full text-center bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm flex items-center justify-center gap-2"
                    >
                       <ArrowDownTrayIcon className="w-5 h-5" />
                       Download CSV Template
                    </Button>
                    <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md">
                        <div className="space-y-1 text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="flex text-sm text-gray-500">
                                <p className="pl-1">Drag & drop a file or click to upload</p>
                            </div>
                             <p className="text-xs text-gray-500">This is a UI demonstration. File uploads are not functional.</p>
                        </div>
                    </div>
                </div>

                {/* Export Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <ArrowDownTrayIcon className="w-6 h-6 text-indigo-400" />
                        Export Data
                    </h3>
                     <p className="text-sm text-gray-400">
                        Export the current inventory view. The export will respect any active search terms or filters.
                    </p>
                    <div className="bg-gray-900/50 p-4 rounded-lg space-y-3">
                         <div className="grid grid-cols-2 gap-3">
                            <Button 
                                onClick={onExportCsv}
                                className="w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm"
                            >
                                Export as CSV
                            </Button>
                             <Button 
                                onClick={onExportJson}
                                className="w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm"
                            >
                                Export as JSON
                            </Button>
                             <Button 
                                onClick={onExportXls}
                                className="w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm"
                            >
                                Export as Excel
                            </Button>
                            <Button 
                                onClick={onExportPdf}
                                className="w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm"
                            >
                                Export as PDF
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ImportExportModal;
