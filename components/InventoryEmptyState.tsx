import React from 'react';
import { useTheme } from '@/components/ThemeProvider';
import Button from '@/components/ui/Button';
import { PlusCircleIcon, ArrowsUpDownIcon, DocumentTextIcon } from './icons';

interface InventoryEmptyStateProps {
    onAddManual: () => void;
    onImport: () => void;
}

const InventoryEmptyState: React.FC<InventoryEmptyStateProps> = ({ onAddManual, onImport }) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme !== 'light';

    return (
        <div className={`rounded-xl border border-dashed ${isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-300 bg-gray-50'} p-12 text-center`}>
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 ${isDark ? 'bg-gray-700' : 'bg-white shadow-sm'}`}>
                <DocumentTextIcon className={`w-8 h-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            </div>
            
            <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Your inventory is empty
            </h3>
            
            <p className={`text-sm max-w-md mx-auto mb-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Get started by adding your first item manually, or import your entire catalog from a CSV file.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                    onClick={onAddManual}
                    className="flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg shadow-accent-900/20 w-full sm:w-auto transition-all transform hover:scale-105"
                >
                    <PlusCircleIcon className="w-5 h-5" />
                    Add First Item
                </Button>
                
                <Button
                    onClick={onImport}
                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold border w-full sm:w-auto transition-all ${
                        isDark 
                            ? 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white' 
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <ArrowsUpDownIcon className="w-5 h-5" />
                    Import CSV
                </Button>
            </div>

            <div className={`mt-8 pt-8 border-t ${isDark ? 'border-gray-700/50' : 'border-gray-200'} max-w-2xl mx-auto`}>
                <h4 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Why track inventory here?
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
                    <Feature 
                        title="Stock Intelligence" 
                        desc="Get predicted stockouts and automatic reorder alerts based on sales velocity."
                        isDark={isDark}
                    />
                    <Feature 
                        title="Vendor Management" 
                        desc="Track lead times, performance, and automatically generate purchase orders."
                        isDark={isDark}
                    />
                    <Feature 
                        title="Production Planning" 
                        desc="Link inventory to BOMs to plan production runs effortlessly."
                        isDark={isDark}
                    />
                </div>
            </div>
        </div>
    );
};

const Feature = ({ title, desc, isDark }: { title: string; desc: string; isDark: boolean }) => (
    <div>
        <div className={`font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-900'}`}>{title}</div>
        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{desc}</div>
    </div>
);

export default InventoryEmptyState;
