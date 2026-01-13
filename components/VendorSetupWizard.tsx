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
    Loader2
} from 'lucide-react';
import Button from './ui/Button';
import { Vendor } from '@/types';
import { upsertVendors } from '@/hooks/useSupabaseMutations';

interface VendorSetupWizardProps {
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
    'Name', 'Contact Email', 'Phone', 'Address', 'City', 'State', 'Postal Code', 'Country', 'Website', 'Lead Time Days', 'Auto PO Enabled'
];

const SAMPLE_DATA = [
    { 
        'Name': 'Acme Supply Co', 
        'Contact Email': 'orders@acme.com', 
        'Phone': '555-0101', 
        'Address': '123 Industrial Way',
        'City': 'Springfield',
        'State': 'IL',
        'Postal Code': '62704',
        'Country': 'USA',
        'Website': 'https://acme.com',
        'Lead Time Days': 5,
        'Auto PO Enabled': 'Yes'
    },
    { 
        'Name': 'Fast Parts Ltd', 
        'Contact Email': 'sales@fastparts.com', 
        'Phone': '555-0202', 
        'Address': '456 Commerce Blvd',
        'City': 'Dover',
        'State': 'DE',
        'Postal Code': '19901',
        'Country': 'USA',
        'Website': 'https://fastparts.com',
        'Lead Time Days': 2,
        'Auto PO Enabled': 'No'
    }
];

export default function VendorSetupWizard({ onComplete, onClose, onManualEntry }: VendorSetupWizardProps) {
    const [step, setStep] = useState<Step>('choice');
    const [parsedData, setParsedData] = useState<ValidationResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Helpers ---

    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet(SAMPLE_DATA);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "murp_vendor_template.xlsx");
    };

    const validateRow = (row: any): ValidationResult => {
        const errors: string[] = [];
        // Map common headers if needed or check both snake_case and Title Case
        const name = row['Name'] || row['name'];
        const email = row['Contact Email'] || row['email'];
        
        if (!name) errors.push('Missing Name');
        // Basic check, not strict
        if (row['Lead Time Days'] && isNaN(Number(row['Lead Time Days']))) errors.push('Invalid Lead Time');
        
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
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 'A', defval: '' }); // Check headers logic if needed
            
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
        const dbItems: Vendor[] = validItems.map(item => ({
            id: crypto.randomUUID(),
            name: String(item['Name'] || item['name']),
            contactEmails: [String(item['Contact Email'] || item['email'] || '')].filter(Boolean),
            phone: String(item['Phone'] || item['phone'] || ''),
            address: String(item['Address'] || item['address'] || ''),
            city: item['City'] || item['city'],
            state: item['State'] || item['state'],
            postalCode: item['Postal Code'] || item['postal_code'],
            country: item['Country'] || item['country'],
            website: String(item['Website'] || item['website'] || ''),
            leadTimeDays: Number(item['Lead Time Days'] ?? item['lead_time_days'] ?? 0),
            autoPoEnabled: (String(item['Auto PO Enabled']).toLowerCase() === 'yes' || item['autoPoEnabled'] === true),
            dataSource: 'csv',
            lastSyncAt: new Date().toISOString()
        }));

        const { success, error } = await upsertVendors(dbItems);
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
            <h2 className="text-xl font-semibold text-white text-center">How would you like to add your vendors?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => fileInputRef.current?.click()} className="group p-6 bg-gray-800 border border-gray-700 hover:border-accent-500 rounded-lg text-left transition-all hover:bg-gray-750">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-accent-500/10 rounded-lg text-accent-400 group-hover:bg-accent-500 group-hover:text-white transition-colors">
                            <UploadCloud size={24} />
                        </div>
                        <h3 className="font-semibold text-white">Upload Spreadsheet</h3>
                    </div>
                    <p className="text-sm text-gray-400">Import from Excel or CSV. Bulk add all suppliers.</p>
                </button>

                <button onClick={downloadTemplate} className="group p-6 bg-gray-800 border border-gray-700 hover:border-accent-500 rounded-lg text-left transition-all hover:bg-gray-750">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-400 group-hover:bg-green-500 group-hover:text-white transition-colors">
                            <FileSpreadsheet size={24} />
                        </div>
                        <h3 className="font-semibold text-white">Get Template</h3>
                    </div>
                    <p className="text-sm text-gray-400">Download formatted sheet to fill out.</p>
                </button>

                <button onClick={loadSampleData} className="group p-6 bg-gray-800 border border-gray-700 hover:border-accent-500 rounded-lg text-left transition-all hover:bg-gray-750">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                            <Sparkles size={24} />
                        </div>
                        <h3 className="font-semibold text-white">Try Sample Data</h3>
                    </div>
                    <p className="text-sm text-gray-400">See how it works with example vendors.</p>
                </button>

                <button onClick={onManualEntry} className="group p-6 bg-gray-800 border border-gray-700 hover:border-accent-500 rounded-lg text-left transition-all hover:bg-gray-750">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                            <Keyboard size={24} />
                        </div>
                        <h3 className="font-semibold text-white">Add Manually</h3>
                    </div>
                    <p className="text-sm text-gray-400">Enter details form. Best for one-off.</p>
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

    const renderPreview = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Import Preview</h3>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep('choice')} size="sm">Cancel</Button>
                    <Button 
                        variant="primary" 
                        onClick={handleImport} 
                        size="sm"
                        disabled={parsedData.filter(d => d.valid).length === 0}
                        className="bg-accent-500 hover:bg-accent-600 text-white"
                    >
                        {isProcessing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                        Complete Import ({parsedData.filter(d => d.valid).length})
                    </Button>
                </div>
            </div>

            <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-800 text-gray-300 sticky top-0">
                        <tr>
                            <th className="p-3">Status</th>
                            {TEMPLATE_HEADERS.slice(0, 5).map(h => <th key={h} className="p-3">{h}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-white">
                        {parsedData.map((item, idx) => (
                            <tr key={idx} className={item.valid ? 'hover:bg-gray-800/30' : 'bg-red-900/10 hover:bg-red-900/20'}>
                                <td className="p-3">
                                    {item.valid ? (
                                        <span className="flex items-center text-green-400 gap-1"><Check size={14} /> Valid</span>
                                    ) : (
                                        <span className="flex items-center text-red-400 gap-1" title={item.errors.join(', ')}>
                                            <AlertTriangle size={14} /> Invalid
                                        </span>
                                    )}
                                </td>
                                <td className="p-3 font-mono">{item.row['Name'] || item.row['name']}</td>
                                <td className="p-3">{item.row['Contact Email'] || item.row['email']}</td>
                                <td className="p-3">{item.row['Phone'] || item.row['phone']}</td>
                                <td className="p-3">{item.row['Address'] || item.row['address']}</td>
                                <td className="p-3">{item.row['City'] || item.row['city']}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!parsedData.every(d => d.valid) && (
                <div className="text-red-400 text-sm flex items-center gap-2 bg-red-900/20 p-3 rounded-lg border border-red-900/30">
                    <AlertTriangle size={16} />
                    <span>Some rows have errors and will be skipped. Hover over "Invalid" to see details.</span>
                </div>
            )}
        </div>
    );

    const renderSuccess = () => (
        <div className="text-center py-12 space-y-6">
            <div className="w-20 h-20 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-green-500/10">
                <Check size={40} strokeWidth={3} />
            </div>
            <h3 className="text-2xl font-bold text-white">Import Successful!</h3>
            <p className="text-gray-400 max-w-md mx-auto">
                Your vendors have been added to the system. You can now configure their automation settings.
            </p>
            <Button onClick={onComplete} className="bg-accent-500 hover:bg-accent-600 text-white px-8 py-2">
                Go to Vendors
            </Button>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Sparkles className="text-accent-400" size={20} />
                            Vendor Quick Start
                        </h2>
                        <p className="text-sm text-gray-400">Import your supplier list or add manually</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 p-2 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                    {isProcessing && (
                        <div className="absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center z-10 backdrop-blur-sm">
                            <Loader2 className="w-12 h-12 text-accent-500 animate-spin mb-4" />
                            <p className="text-lg font-semibold text-white">Processing Data...</p>
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
