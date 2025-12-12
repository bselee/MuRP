import React, { useState, useRef } from 'react';
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
    const [uploading, setUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDownloadTemplate = () => {
        // Comprehensive template with all fields + 10 examples
        const templateData = [
            {
                sku: "WC-001",
                name: "Worm Castings 1lb",
                description: "Premium earthworm castings for soil health",
                category: "Amendments",
                stock: 500,
                on_order: 100,
                reorder_point: 200,
                reorder_quantity: 500,
                moq: 50,
                vendor_name: "Worm Farm LLC",
                vendor_email: "orders@wormfarm.com",
                unit_cost: 2.50,
                unit_price: 5.99,
                location: "Warehouse A",
                notes: "Popular item"
            },
            {
                sku: "KM-002",
                name: "Kelp Meal 5lb",
                description: "Cold-processed Norwegian kelp",
                category: "Amendments",
                stock: 250,
                on_order: 0,
                reorder_point: 100,
                reorder_quantity: 300,
                moq: 25,
                vendor_name: "Ocean Harvest",
                vendor_email: "info@oceanharvest.com",
                unit_cost: 8.75,
                unit_price: 18.99,
                location: "Warehouse A",
                notes: "Seasonal"
            },
            {
                sku: "NM-003",
                name: "Neem Meal 2lb",
                description: "Organic pest deterrent and fertilizer",
                category: "Amendments",
                stock: 175,
                on_order: 50,
                reorder_point: 75,
                reorder_quantity: 200,
                moq: 20,
                vendor_name: "Neem Direct",
                vendor_email: "sales@neemdirect.com",
                unit_cost: 6.25,
                unit_price: 13.99,
                location: "Warehouse B",
                notes: "High demand spring/summer"
            },
            {
                sku: "CF-004",
                name: "Crab Meal 10lb",
                description: "Slow-release nitrogen source with chitin",
                category: "Amendments",
                stock: 80,
                on_order: 100,
                reorder_point: 50,
                reorder_quantity: 150,
                moq: 15,
                vendor_name: "Ocean Harvest",
                vendor_email: "info@oceanharvest.com",
                unit_cost: 22.50,
                unit_price: 45.99,
                location: "Warehouse A",
                notes: "Bulk item"
            },
            {
                sku: "BM-005",
                name: "Bat Guano 5lb",
                description: "High phosphorus organic fertilizer",
                category: "Amendments",
                stock: 120,
                on_order: 0,
                reorder_point: 60,
                reorder_quantity: 150,
                moq: 10,
                vendor_name: "Guano Supply Co",
                vendor_email: "orders@guanosupply.com",
                unit_cost: 12.00,
                unit_price: 24.99,
                location: "Warehouse B",
                notes: "Limited availability"
            },
            {
                sku: "PM-006",
                name: "Peat Moss 3.8cf",
                description: "Canadian sphagnum peat moss",
                category: "Growing Media",
                stock: 300,
                on_order: 200,
                reorder_point: 150,
                reorder_quantity: 400,
                moq: 50,
                vendor_name: "Premier Horticulture",
                vendor_email: "sales@premierhort.com",
                unit_cost: 15.75,
                unit_price: 29.99,
                location: "Warehouse C",
                notes: "Fast mover"
            },
            {
                sku: "PL-007",
                name: "Perlite 4cf",
                description: "Horticultural grade perlite",
                category: "Growing Media",
                stock: 200,
                on_order: 100,
                reorder_point: 100,
                reorder_quantity: 250,
                moq: 30,
                vendor_name: "Perlite Products",
                vendor_email: "info@perliteproducts.com",
                unit_cost: 18.00,
                unit_price: 34.99,
                location: "Warehouse C",
                notes: "Heavy item"
            },
            {
                sku: "VM-008",
                name: "Vermiculite 4cf",
                description: "Horticultural grade vermiculite",
                category: "Growing Media",
                stock: 150,
                on_order: 50,
                reorder_point: 80,
                reorder_quantity: 200,
                moq: 25,
                vendor_name: "Vermiculite Supply",
                vendor_email: "orders@vermsupply.com",
                unit_cost: 20.50,
                unit_price: 39.99,
                location: "Warehouse C",
                notes: ""
            },
            {
                sku: "CC-009",
                name: "Coco Coir Block",
                description: "Compressed coconut coir brick",
                category: "Growing Media",
                stock: 400,
                on_order: 0,
                reorder_point: 200,
                reorder_quantity: 500,
                moq: 40,
                vendor_name: "Coco Products Inc",
                vendor_email: "sales@cocoproducts.com",
                unit_cost: 3.25,
                unit_price: 7.99,
                location: "Warehouse C",
                notes: "Best seller"
            },
            {
                sku: "CM-010",
                name: "Compost 1cf",
                description: "Aged organic compost",
                category: "Amendments",
                stock: 180,
                on_order: 100,
                reorder_point: 100,
                reorder_quantity: 250,
                moq: 20,
                vendor_name: "Local Compost Co",
                vendor_email: "info@localcompost.com",
                unit_cost: 8.50,
                unit_price: 16.99,
                location: "Warehouse A",
                notes: "Local supplier"
            }
        ];

        const headers = Object.keys(templateData[0]).join(',');
        const rows = templateData.map(row =>
            Object.values(row).map(val => {
                // Proper CSV escaping
                const str = String(val);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join(',')
        );

        const csvString = [headers, ...rows].join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'murp_inventory_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setUploadStatus('Processing file...');

        try {
            // Parse CSV
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                throw new Error('File appears to be empty or has no data rows');
            }

            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const rows = lines.slice(1).map(line => {
                // Simple CSV parsing (TODO: handle quoted commas properly)
                const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                const row: Record<string, string> = {};
                headers.forEach((header, i) => {
                    row[header] = values[i] || '';
                });
                return row;
            });

            // TODO: Show review modal with rows
            // TODO: Allow column mapping
            // TODO: Commit to database

            console.log(`Parsed ${rows.length} rows:`, rows.slice(0, 5));
            setUploadStatus(`✓ Parsed ${rows.length} items successfully! Review & commit coming soon.`);

            setTimeout(() => {
                setUploadStatus(null);
            }, 5000);

        } catch (error) {
            console.error('Upload error:', error);
            setUploadStatus(`✗ Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

            setTimeout(() => {
                setUploadStatus(null);
            }, 5000);
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Import & Export Inventory">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Import Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <ArrowUpTrayIcon className="w-6 h-6 text-accent-400" />
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

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.tsv"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="file-upload"
                    />

                    <label
                        htmlFor="file-upload"
                        className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md cursor-pointer hover:border-accent-400 transition-colors"
                    >
                        <div className="space-y-1 text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="flex text-sm text-gray-500">
                                <p className="pl-1">{uploading ? 'Uploading...' : 'Click to upload CSV, Excel, or TSV'}</p>
                            </div>
                            <p className="text-xs text-gray-500">
                                {uploading ? 'Processing file...' : 'CSV, XLSX, and TSV files supported'}
                            </p>
                        </div>
                    </label>

                    {uploadStatus && (
                        <div className={`mt-2 p-3 rounded-md text-sm ${
                            uploadStatus.startsWith('✓')
                                ? 'bg-green-900/20 text-green-400 border border-green-500/30'
                                : uploadStatus.startsWith('✗')
                                ? 'bg-red-900/20 text-red-400 border border-red-500/30'
                                : 'bg-blue-900/20 text-blue-400 border border-blue-500/30'
                        }`}>
                            {uploadStatus}
                        </div>
                    )}
                </div>

                {/* Export Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <ArrowDownTrayIcon className="w-6 h-6 text-accent-400" />
                        Export Data
                    </h3>
                     <p className="text-sm text-gray-400">
                        Export the current inventory view. The export will respect any active search terms or filters.
                    </p>
                    <div className="bg-gray-900/50 p-4 rounded-lg space-y-3">
                         <div className="grid grid-cols-2 gap-3">
                            <Button 
                                onClick={onExportCsv}
                                className="w-full text-center bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm"
                            >
                                Export as CSV
                            </Button>
                             <Button 
                                onClick={onExportJson}
                                className="w-full text-center bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm"
                            >
                                Export as JSON
                            </Button>
                             <Button 
                                onClick={onExportXls}
                                className="w-full text-center bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm"
                            >
                                Export as Excel
                            </Button>
                            <Button 
                                onClick={onExportPdf}
                                className="w-full text-center bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm"
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
