

import React, { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import type { Artwork, BillOfMaterials, WatchlistItem, AiConfig } from '../types';
import Modal from './Modal';
import { getRegulatoryAdvice, draftComplianceLetter } from '../services/geminiService';
import { getCachedScan, saveScanToCache, getScanAge } from '../services/regulatoryCacheService';
import { SparklesIcon, LinkIcon, DocumentDuplicateIcon, ClipboardCopyIcon, ChevronDownIcon, FlagIcon } from './icons';

type ArtworkWithProduct = Artwork & { productName: string; bomId: string; };

interface RegulatoryScanModalProps {
    isOpen: boolean;
    onClose: () => void;
    artwork: ArtworkWithProduct;
    bom: BillOfMaterials;
    onUpdateLink: (link: string) => void;
    watchlist: WatchlistItem[];
    aiConfig: AiConfig;
}

const statesByRegion = {
    Northeast: ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Vermont", "New Jersey", "New York", "Pennsylvania"],
    South: ["Delaware", "Florida", "Georgia", "Maryland", "North Carolina", "South Carolina", "Virginia", "West Virginia", "Alabama", "Kentucky", "Mississippi", "Tennessee", "Arkansas", "Louisiana", "Oklahoma", "Texas"],
    Midwest: ["Illinois", "Indiana", "Michigan", "Ohio", "Wisconsin", "Iowa", "Kansas", "Minnesota", "Missouri", "Nebraska", "North Dakota", "South Dakota"],
    West: ["Arizona", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Utah", "Wyoming", "Alaska", "California", "Hawaii", "Oregon", "Washington"]
};

const CollapsibleRegion: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between p-2 font-medium text-gray-300 hover:bg-gray-700 rounded-md">
            {title}
            <ChevronDownIcon className="w-5 h-5 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-2 gap-2 p-2">
            {children}
        </div>
    </details>
);

const ScannedSources: React.FC<{ text: string }> = ({ text }) => {
    const lines = text.split('\n');
    const sourcesLine = lines.find(line => line.toLowerCase().includes('**scanned sources:**'));
    if (!sourcesLine) return null;

    const sourceContent = text.substring(text.indexOf(sourcesLine));
    const websiteMatch = sourceContent.match(/Website: (https?:\/\/[^\s]+)/);
    const contactMatch = sourceContent.match(/Contact: (.+)/);

    return (
        <div className="mb-4 p-3 bg-gray-800 rounded-lg">
            <h4 className="font-semibold text-gray-200 mb-2">Scanned Sources</h4>
            {websiteMatch && (
                <p className="text-sm text-gray-400">
                    Website: <a href={websiteMatch[1]} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{websiteMatch[1]}</a>
                </p>
            )}
            {contactMatch && (
                <p className="text-sm text-gray-400">Contact: {contactMatch[1]}</p>
            )}
        </div>
    );
};


const RegulatoryScanModal: React.FC<RegulatoryScanModalProps> = ({ isOpen, onClose, artwork, bom, onUpdateLink, watchlist, aiConfig }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isDrafting, setIsDrafting] = useState(false);
    const [advice, setAdvice] = useState('');
    const [draftLetter, setDraftLetter] = useState('');
    const [scannedState, setScannedState] = useState('');
    const [docLink, setDocLink] = useState(artwork.regulatoryDocLink || '');
    const [usedCache, setUsedCache] = useState(false);
    const [cacheAge, setCacheAge] = useState<number | null>(null);

    const flaggedIngredients = useMemo(() => {
        const ingredients = bom.components.filter(c => !c.sku.startsWith('BAG-')).map(c => c.name.toLowerCase());
        return watchlist.filter(item => 
            item.type === 'Ingredient' && ingredients.some(ing => ing.includes(item.term.toLowerCase()))
        );
    }, [bom, watchlist]);

    const handleScan = async (state: string) => {
        setIsLoading(true);
        setDraftLetter('');
        setScannedState(state);
        setAdvice('');
        setUsedCache(false);
        setCacheAge(null);
        
        try {
            // First, check if we have a cached result
            const cachedScan = getCachedScan(artwork.productName, bom.components, state, bom.id);
            
            if (cachedScan) {
                // Use cached result
                setAdvice(cachedScan.results);
                setUsedCache(true);
                setCacheAge(getScanAge(cachedScan));
                setIsLoading(false);
                return;
            }
            
            // No cache hit, perform new scan
            const promptTemplate = aiConfig.prompts.find(p => p.id === 'getRegulatoryAdvice');
            if (!promptTemplate) throw new Error("Regulatory advice prompt not found.");
            const result = await getRegulatoryAdvice(aiConfig.model, promptTemplate.prompt, artwork.productName, bom.components, state, watchlist);
            setAdvice(result);
            
            // Extract source URLs from the result (if any)
            const sourceUrls: string[] = [];
            const urlMatches = result.match(/https?:\/\/[^\s)]+/g);
            if (urlMatches) {
                sourceUrls.push(...urlMatches);
            }
            
            // Save to cache for future use
            saveScanToCache(artwork.productName, bom.components, state, result, sourceUrls, bom.id);
        } catch (error) {
            console.error(error);
            setAdvice('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDraftLetter = async () => {
        if (!advice || !scannedState) return;
        setIsDrafting(true);
        setDraftLetter('');
        try {
            const promptTemplate = aiConfig.prompts.find(p => p.id === 'draftComplianceLetter');
            if (!promptTemplate) throw new Error("Compliance letter prompt not found.");
            const result = await draftComplianceLetter(aiConfig.model, promptTemplate.prompt, artwork.productName, bom.components, scannedState, advice);
            setDraftLetter(result);
        } catch(e) {
            console.error(e);
            setDraftLetter('An error occurred while drafting the letter.');
        } finally {
            setIsDrafting(false);
        }
    };
    
    const handleUpdateLink = () => {
        onUpdateLink(docLink);
    };

    const handleCopyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Consider adding a toast notification for success
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Regulatory Scan: ${artwork.productName}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Panel: Ingredients & Actions */}
                <div className="md:col-span-1 space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-2">Scan for State Compliance</h3>
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-2 bg-gray-900/50 p-2 rounded-md">
                            {Object.entries(statesByRegion).map(([region, states]) => (
                                <CollapsibleRegion key={region} title={region}>
                                    {states.map(state => (
                                        <Button key={state} onClick={() => handleScan(state)} className="text-left p-2 bg-indigo-600/80 hover:bg-indigo-700 rounded-md text-white font-semibold text-xs transition-colors">
                                            {state}
                                        </Button>
                                    ))}
                                </CollapsibleRegion>
                            ))}
                        </div>
                    </div>
                     <div>
                        <h3 className="text-lg font-semibold text-white mb-2">Compliance Documents</h3>
                        <div className="relative">
                             <LinkIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                             <input 
                                type="text"
                                placeholder="Link to document folder..."
                                value={docLink}
                                onChange={e => setDocLink(e.target.value)}
                                className="w-full bg-gray-700 p-2 pl-10 rounded-md text-sm"
                            />
                        </div>
                        <Button onClick={handleUpdateLink} className="mt-2 w-full bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-3 rounded-md text-sm">
                            Save Link
                        </Button>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-2">Product Ingredients</h3>
                        <ul className="space-y-1 text-sm text-gray-300 max-h-32 overflow-y-auto bg-gray-900/50 p-2 rounded-md">
                            {bom.components.filter(c => !c.sku.startsWith('BAG-')).map(c => {
                                const isFlagged = flaggedIngredients.some(fi => fi.term.toLowerCase() === c.name.toLowerCase());
                                return (
                                    <li key={c.sku} className={`flex items-center gap-2 p-1 rounded ${isFlagged ? 'bg-yellow-500/10' : ''}`}>
                                        {isFlagged && <FlagIcon className="w-4 h-4 text-yellow-400 flex-shrink-0" title={flaggedIngredients.find(fi => fi.term.toLowerCase() === c.name.toLowerCase())?.reason}/>}
                                        <span>{c.name}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>

                {/* Right Panel: AI Response */}
                <div className="md:col-span-2 bg-gray-900/50 p-4 rounded-lg border border-gray-700 min-h-[400px] flex flex-col">
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-indigo-400"/>
                        AI Regulatory Co-Pilot
                    </h3>
                    
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
                             <p className="mt-4">Scanning {scannedState} regulations...</p>
                        </div>
                    )}

                    {!isLoading && !advice && (
                         <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center">
                            <p>Select a state to begin a compliance scan.</p>
                            <p className="text-xs mt-2">The AI will use Google Search to find the latest regulations for your product's ingredients.</p>
                        </div>
                    )}
                    
                    {!isLoading && advice && (
                        <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                           {usedCache && cacheAge !== null && (
                               <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-3 flex items-center gap-2">
                                   <SparklesIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                                   <div className="text-sm">
                                       <p className="text-green-300 font-semibold">⚡ Instant Result (Cached)</p>
                                       <p className="text-green-400/80 text-xs">
                                           This scan was completed {cacheAge} day{cacheAge !== 1 ? 's' : ''} ago. 
                                           Cache expires in {90 - cacheAge} days. 
                                           <span className="font-semibold"> 90% API cost savings!</span>
                                       </p>
                                   </div>
                               </div>
                           )}
                           <ScannedSources text={advice} />
                           <div className="prose prose-sm prose-invert max-w-none text-gray-300">
                               <h4 className="text-white">Compliance Report for {scannedState}</h4>
                               <div dangerouslySetInnerHTML={{ __html: advice.replace(/\*\*Scanned Sources:\*\*[\s\S]*/, '').replace(/\n/g, '<br />') }}></div>
                           </div>
                           
                           <div className="border-t border-gray-700 pt-4">
                               <Button 
                                    onClick={handleDraftLetter}
                                    disabled={isDrafting}
                                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md text-sm transition-colors disabled:bg-gray-500 disabled:cursor-wait"
                                >
                                    {isDrafting ? 'Drafting...' : `Draft Inquiry Letter for ${scannedState}`}
                                </Button>
                           </div>

                           {isDrafting && (
                                <div className="flex items-center justify-center text-gray-400 pt-4">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400"></div>
                                    <p className="ml-3">Generating draft...</p>
                                </div>
                           )}

                           {draftLetter && (
                                <div className="pt-4">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-white font-semibold">Generated Draft Letter</h4>
                                        <Button onClick={() => handleCopyToClipboard(draftLetter)} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
                                            <ClipboardCopyIcon className="w-4 h-4" />
                                            Copy
                                        </Button>
                                    </div>
                                    <pre className="mt-2 bg-gray-800 p-3 rounded-md text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">{draftLetter}</pre>
                                </div>
                           )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default RegulatoryScanModal;
