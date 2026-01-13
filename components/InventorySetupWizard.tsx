import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
    UploadCloud, 
    FileSpreadsheet, 
    Sparkles, 
    Keyboard, 
    Check, 
    AlertTriangle, 
    X,
    ArrowRight,
    Loader2,
    Download
} from 'lucide-react';
import Button from './ui/Button';
import { InventoryItem } from '@/types';
import { upsertInventoryItems } from '@/hooks/useSupabaseMutations';

interface InventorySetupWizardProps {
    onComplete: () => void;
    onClose: () => void;
    onManualEntry: () => void;
}

type Step = 'choice' | 'upload' | 'preview' | 'success';

interface ValidationResult {
    valid: boolean;
    errors: string[];
    row: any;
}

const TEMPLATE_HEADERS = [
    'SKU', 'Name', 'Description', 'Category', 
    'Unit Cost', 'Unit Price', 'Currency',
    'Stock Quantity', 'Reorder Point', 'MOQ', 'Reorder Method', 'Status',
    'Supplier Name', 'Supplier SKU', 'UPC',
    'Bin Location', 'Warehouse Location', 'Dimensions', 'Weight', 'Weight Unit',
    'Lot Tracking', 'Is Dropship', 'Item Flow Type'
];

const SAMPLE_DATA = [
    { 
        'SKU': 'SMP-001', 
        'Name': 'Premium Widget', 
        'Description': 'High quality stainless steel widget', 
        'Category': 'Widgets', 
        'Stock Quantity': 50, 
        'Unit Price': 29.99, 
        'Unit Cost': 15.00, 
        'Currency': 'USD',
        'Reorder Point': 10,
        'MOQ': 5,
        'Reorder Method': 'Auto',
        'Status': 'active',
        'Supplier Name': 'Acme Corp',
        'Supplier SKU': 'AC-WID-01',
        'UPC': '123456789012',
        'Bin Location': 'A-1-1',
        'Warehouse Location': 'Main',
        'Dimensions': '10x10x10',
        'Weight': 1.5,
        'Weight Unit': 'lb',
        'Lot Tracking': 'Yes',
        'Is Dropship': 'No',
        'Item Flow Type': 'standard'
    },
    { 
        'SKU': 'SMP-002', 
        'Name': 'Basic Gadget', 
        'Description': 'Entry level plastic gadget', 
        'Category': 'Gadgets', 
        'Stock Quantity': 100, 
        'Unit Price': 19.99, 
        'Unit Cost': 8.50, 
        'Currency': 'USD',
        'Reorder Point': 20,
        'MOQ': 10,
        'Reorder Method': 'Manual',
        'Status': 'active',
        'Supplier Name': 'Gadgets Inc',
        'Supplier SKU': 'GDT-002',
        'UPC': '987654321098',
        'Bin Location': 'B-2-5',
        'Warehouse Location': 'Main',
        'Dimensions': '5x5x2',
        'Weight': 0.5,
        'Weight Unit': 'lb',
        'Lot Tracking': 'No',
        'Is Dropship': 'No',
        'Item Flow Type': 'standard'
    }
];

export default function InventorySetupWizard({ onComplete, onClose, onManualEntry }: InventorySetupWizardProps) {
    const [step, setStep] = useState<Step>('choice');
    const [parsedData, setParsedData] = useState<ValidationResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Helpers ---

    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet(SAMPLE_DATA);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "murp_inventory_template.xlsx");
    };

    const validateRow = (row: any): ValidationResult => {
        const errors: string[] = [];
        // Map common headers if needed or check both snake_case and Title Case
        const sku = row['SKU'] || row['sku'];
        const name = row['Name'] || row['name'];
        const stock = row['Stock Quantity'] !== undefined ? row['Stock Quantity'] : (row['stock'] !== undefined ? row['stock'] : undefined);

        if (!sku) errors.push('Missing SKU');
        if (!name) errors.push('Missing Name');
        if (stock === undefined || stock === null || isNaN(Number(stock))) errors.push('Invalid Stock Quantity');
        
        return {
            valid: errors.length === 0,
            errors,
            row
        };
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 'A', defval: '' }); // Get raw array first to check headers? No, simple json is fine usually.
            
            // Better parsing with simple json_to_sheet logic usually expects headers in row 1
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

            const results = rows.map(validateRow);
            setParsedData(results);
            setStep('preview');
        } catch (error) {
            console.error("Parse error:", error);
            alert("Failed to parse file. Please check the format.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = async () => {
        setIsProcessing(true);
        const validItems = parsedData.filter(r => r.valid).map(r => r.row);
        
        // Transform to match DB schema (mapping Human Readable -> DB Fields)
        const dbItems: InventoryItem[] = validItems.map(item => ({
            id: crypto.randomUUID(),
            sku: String(item['SKU'] || item['sku']),
            name: String(item['Name'] || item['name']),
            description: item['Description'] || item['description'],
            category: item['Category'] || item['category'] || 'Uncategorized',
            stock: Number(item['Stock Quantity'] ?? item['stock'] ?? 0),
            unit_price: Number(item['Unit Price'] ?? item['unit_price'] ?? 0),
            unit_cost: Number(item['Unit Cost'] ?? item['unit_cost'] ?? 0),
            vendor_name: item['Supplier Name'] || item['vendor_name'],
            reorderPoint: Number(item['Reorder Point'] ?? item['reorderPoint'] ?? 0),
            moq: Number(item['MOQ'] ?? item['moq'] ?? 0),
            status: (item['Status'] || item['status'] || 'active') as any,
            location: item['Warehouse Location'] || item['location'], // Mapping Warehouse Location -> location (or bin)
            binLocation: item['Bin Location'] || item['binLocation'],
            isDropship: (String(item['Is Dropship']).toLowerCase() === 'yes' || item['isDropship'] === true),
            itemFlowType: item['Item Flow Type'] as any || 'standard',
            // Fields not yet in main schema but useful to keep in mind (or put in description/notes if needed)
            // 'Weight', 'Dimensions', 'UPC', 'Supplier SKU'
            
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));

        const { success, error } = await upsertInventoryItems(dbItems);
        setIsProcessing(false);
        
        if (success) {
            setStep('success');
        } else {
            alert(`Import failed: ${error}`);
        }
    };

    const loadSampleData = () => {
        const results = SAMPLE_DATA.map(validateRow);
        setParsedData(results);
        setStep('preview');
    };

    // --- Render Steps ---

    const renderChoice = () => (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white text-center">How would you like to add your inventory?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => fileInputRef.current?.click()} className="group p-6 bg-gray-800 border border-gray-700 hover:border-accent-500 rounded-lg text-left transition-all hover:bg-gray-750">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-accent-500/10 rounded-lg text-accent-400 group-hover:bg-accent-500 group-hover:text-white transition-colors">
                            <UploadCloud size={24} />
                        </div>
                        <h3 className="font-semibold text-white">Upload Spreadsheet</h3>
                    </div>
                    <p className="text-sm text-gray-400">Import from Excel or CSV. Great for bulk syncing.</p>
                </button>

                <button onClick={downloadTemplate} className="group p-6 bg-gray-800 border border-gray-700 hover:border-accent-500 rounded-lg text-left transition-all hover:bg-gray-750">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-400 group-hover:bg-green-500 group-hover:text-white transition-colors">
                            <FileSpreadsheet size={24} />
                        </div>
                        <h3 className="font-semibold text-white">Get Template</h3>
                    </div>
                    <p className="text-sm text-gray-400">Download a formatted spreadsheet to fill out.</p>
                </button>

                <button onClick={loadSampleData} className="group p-6 bg-gray-800 border border-gray-700 hover:border-accent-500 rounded-lg text-left transition-all hover:bg-gray-750">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                            <Sparkles size={24} />
                        </div>
                        <h3 className="font-semibold text-white">Try Sample Data</h3>
                    </div>
                    <p className="text-sm text-gray-400">Explore the app with example data first.</p>
                </button>

                <button onClick={onManualEntry} className="group p-6 bg-gray-800 border border-gray-700 hover:border-accent-500 rounded-lg text-left transition-all hover:bg-gray-750">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                            <Keyboard size={24} />
                        </div>
                        <h3 className="font-semibold text-white">Add Manually</h3>
                    </div>
                    <p className="text-sm text-gray-400">Enter items one by one. Best for small shops.</p>
                </button>
            </div>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv,.xlsx,.xls" 
                onChange={handleFileUpload} 
            />
        </div>
    );

    const renderPreview = () => {
        const validCount = parsedData.filter(d => d.valid).length;
        const invalidCount = parsedData.length - validCount;

        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-white">Import Preview</h2>
                    <div className="flex gap-4 text-sm">
                        <span className="flex items-center text-green-400 gap-2 font-medium bg-green-400/10 px-3 py-1 rounded-full">
                            <Check size={16} /> {validCount} Ready
                        </span>
                        {invalidCount > 0 && (
                            <span className="flex items-center text-red-400 gap-2 font-medium bg-red-400/10 px-3 py-1 rounded-full">
                                <AlertTriangle size={16} /> {invalidCount} Issues
                            </span>
                        )}
                    </div>
                </div>

                <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900 max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-800 text-gray-200 sticky top-0">
                            <tr>
                                <th className="p-3">Status</th>
                                <th className="p-3">SKU</th>
                                <th className="p-3">Name</th>
                                <th className="p-3">Stock</th>
                                <th className="p-3">Issues</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parsedData.map((item, i) => (
                                <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                                    <td className="p-3">
                                        {item.valid ? (
                                            <Check size={16} className="text-green-500" />
                                        ) : (
                                            <X size={16} className="text-red-500" />
                                        )}
                                    </td>
                                    <td className="p-3 font-mono text-gray-300">{item.row.sku || '-'}</td>
                                    <td className="p-3">{item.row.name || '-'}</td>
                                    <td className="p-3">{item.row.stock}</td>
                                    <td className="p-3 text-red-400">
                                        {item.errors.join(', ')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                    <Button variant="secondary" onClick={() => setStep('choice')}>Back</Button>
                    <Button onClick={handleImport} disabled={validCount === 0 || isProcessing}>
                        {isProcessing ? <><Loader2 className="animate-spin w-4 h-4 mr-2" /> Importing...</> : `Import ${validCount} Items`}
                    </Button>
                </div>
            </div>
        );
    };

    const renderSuccess = () => (
        <div className="text-center py-8 space-y-6">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-white">Import Complete!</h2>
            <p className="text-gray-400 max-w-md mx-auto">
                {parsedData.filter(d => d.valid).length} items have been successfully added to your inventory.
            </p>
            
            <div className="bg-gray-800/50 rounded-lg p-6 max-w-sm mx-auto text-left space-y-3">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">Quick Check</h4>
                {parsedData.filter(d => d.valid).slice(0, 3).map((d, i) => (
                    <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-400 font-mono">{d.row.sku}</span>
                        <span className="text-gray-300">{d.row.name}</span>
                        <span className="text-gray-500">{d.row.stock} units</span>
                    </div>
                ))}
            </div>

            <div className="flex justify-center gap-4 pt-4">
                <Button variant="secondary" onClick={onClose}>Close</Button>
                <Button onClick={onComplete}>Looks Good</Button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="p-6">
                    {step !== 'success' && (
                        <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
                            <h1 className="text-xl font-bold text-white flex items-center gap-2">
                                <Sparkles className="text-accent-500" /> Quick Start
                            </h1>
                            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                    )}

                    <div className="min-h-[400px]">
                        {step === 'choice' && renderChoice()}
                        {step === 'preview' && renderPreview()}
                        {step === 'success' && renderSuccess()}
                    </div>
                </div>
            </div>
        </div>
    );
}
