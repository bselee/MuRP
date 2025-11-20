

import React, { useState, useMemo, useEffect } from 'react';
import type { BillOfMaterials, Artwork, WatchlistItem, AiConfig, ArtworkFolder } from '../types';
import { PhotoIcon, ArrowDownTrayIcon, SearchIcon, SparklesIcon, DocumentDuplicateIcon, PlusCircleIcon, QrCodeIcon, CheckCircleIcon } from '../components/icons';
import RegulatoryScanModal from '../components/RegulatoryScanModal';
import BatchArtworkVerificationModal from '../components/BatchArtworkVerificationModal';
import ManualLabelScanner from '../components/ManualLabelScanner';
import ArtworkEditor from '../components/ArtworkEditor';

type ArtworkWithProduct = Artwork & {
    productName: string;
    productSku: string;
    bomId: string;
};

interface ArtworkPageProps {
    boms: BillOfMaterials[];
    onAddArtwork: (finishedSku: string, fileName: string) => void;
    onCreatePoFromArtwork: (artworkIds: string[]) => void;
    onUpdateArtwork: (artworkId: string, bomId: string, updates: Partial<Artwork>) => void;
    initialFilter: string;
    onClearFilter: () => void;
    watchlist: WatchlistItem[];
    aiConfig: AiConfig;
    artworkFolders: ArtworkFolder[];
    onCreateArtworkFolder: (name: string) => void;
    currentUser?: { id: string; email: string };
}

const ArtworkPage: React.FC<ArtworkPageProps> = ({ boms, onCreatePoFromArtwork, onUpdateArtwork, initialFilter, onClearFilter, watchlist, aiConfig, artworkFolders, onCreateArtworkFolder, currentUser }) => {
    const [isScanModalOpen, setIsScanModalOpen] = useState(false);
    const [isBatchVerificationModalOpen, setIsBatchVerificationModalOpen] = useState(false);
    const [isLabelScannerOpen, setIsLabelScannerOpen] = useState(false);
    const [selectedArtworkForScan, setSelectedArtworkForScan] = useState<ArtworkWithProduct | null>(null);
    const [selectedArtworkForDetails, setSelectedArtworkForDetails] = useState<ArtworkWithProduct | null>(null);
    const [searchTerm, setSearchTerm] = useState(initialFilter);
    const [selectedArtworkIds, setSelectedArtworkIds] = useState<string[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [artworkBeingEdited, setArtworkBeingEdited] = useState<ArtworkWithProduct | null>(null);
    
    useEffect(() => {
        return () => {
            if (initialFilter) onClearFilter();
        };
    }, [initialFilter, onClearFilter]);

    const allArtwork = useMemo(() => {
        return boms.flatMap(bom =>
            bom.artwork.map(art => ({
                ...art,
                productName: bom.name,
                productSku: bom.finishedSku,
                bomId: bom.id,
            }))
        ).sort((a,b) => a.fileName.localeCompare(b.fileName));
    }, [boms]);

    const filteredByFolder = useMemo(() => {
        if (selectedFolderId === null) return allArtwork;
        if (selectedFolderId === 'unassigned') return allArtwork.filter(art => !art.folderId);
        return allArtwork.filter(art => art.folderId === selectedFolderId);
    }, [allArtwork, selectedFolderId]);

    const processedArtwork = useMemo(() => {
        if (!searchTerm) return filteredByFolder;
        return filteredByFolder.filter(art => 
            art.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            art.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            art.productSku.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [filteredByFolder, searchTerm]);
    
    const handleScanClick = (artwork: ArtworkWithProduct) => {
        setSelectedArtworkForScan(artwork);
        setIsScanModalOpen(true);
    };

    const handleCheckboxChange = (artworkId: string, isChecked: boolean) => {
        setSelectedArtworkIds(prev => isChecked ? [...prev, artworkId] : prev.filter(id => id !== artworkId));
    };
    
    const handleCreatePo = () => {
        onCreatePoFromArtwork(selectedArtworkIds);
        setSelectedArtworkIds([]);
    };
    
    const handleCreateFolder = () => {
        if (newFolderName.trim()) {
            onCreateArtworkFolder(newFolderName.trim());
            setNewFolderName('');
            setIsCreatingFolder(false);
        }
    };
    
    const handleSaveEditedArtwork = (dataUrl: string, vectorSvg?: string | null) => {
        if (!artworkBeingEdited) return;
        const currentRevision = typeof artworkBeingEdited.revision === 'number' ? artworkBeingEdited.revision : 1;
        const nextRevision = parseFloat((currentRevision + 0.01).toFixed(2));
        const editedAt = new Date().toISOString();
        onUpdateArtwork(artworkBeingEdited.id, artworkBeingEdited.bomId, {
            url: dataUrl,
            revision: Number.isFinite(nextRevision) ? nextRevision : currentRevision,
            updatedAt: editedAt,
            vectorSvg: typeof vectorSvg === 'string' ? vectorSvg : artworkBeingEdited.vectorSvg ?? null,
            vectorGeneratedAt: typeof vectorSvg === 'string' ? editedAt : artworkBeingEdited.vectorGeneratedAt,
            lastEditedAt: editedAt,
            lastEditedBy: currentUser?.id,
        });
        setArtworkBeingEdited(null);
    };
    
    const FolderButton: React.FC<{folderId: string | null, name: string}> = ({folderId, name}) => (
        <button onClick={() => setSelectedFolderId(folderId)} className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${selectedFolderId === folderId ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}>
            {name}
        </button>
    );

    return (
        <>
            <div className="flex gap-6 h-full">
                {/* Folder Sidebar */}
                <aside className="w-64 bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex-shrink-0 flex flex-col" style={{ minHeight: '600px' }}>
                    <h2 className="text-lg font-semibold text-white mb-4">Folders</h2>
                    <nav className="space-y-1 flex-grow">
                        <FolderButton folderId={null} name="All Artwork" />
                        {artworkFolders.map(folder => <FolderButton key={folder.id} folderId={folder.id} name={folder.name} />)}
                        <FolderButton folderId="unassigned" name="Unassigned" />
                    </nav>
                    <div>
                        {isCreatingFolder ? (
                            <div className="space-y-2">
                                <input 
                                    type="text"
                                    value={newFolderName}
                                    onChange={e => setNewFolderName(e.target.value)}
                                    placeholder="New folder name..."
                                    className="w-full bg-gray-700 p-2 rounded-md text-sm"
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                                />
                                <div className="flex gap-2">
                                    <button onClick={handleCreateFolder} className="flex-1 bg-indigo-600 text-white font-semibold py-1 px-2 text-sm rounded-md">Create</button>
                                    <button onClick={() => setIsCreatingFolder(false)} className="flex-1 bg-gray-600 text-white font-semibold py-1 px-2 text-sm rounded-md">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => setIsCreatingFolder(true)} className="w-full flex items-center justify-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-3 rounded-md transition-colors">
                                <PlusCircleIcon className="w-5 h-5" />
                                Create Folder
                            </button>
                        )}
                    </div>
                </aside>

                <main className="flex-1 space-y-6">
                    <header className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h1 className="text-3xl font-bold text-white tracking-tight">Artwork Library</h1>
                                <p className="text-gray-400 mt-1">A central repository for all product artwork and design files.</p>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setIsLabelScannerOpen(true)}
                                    className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center gap-2"
                                >
                                    <QrCodeIcon className="w-5 h-5" />
                                    Scan Labels
                                </button>
                                <button 
                                    onClick={() => setIsBatchVerificationModalOpen(true)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center gap-2"
                                >
                                    <SparklesIcon className="w-5 h-5" />
                                    Batch Verify
                                </button>
                                {selectedArtworkIds.length > 0 && (
                                    <button onClick={handleCreatePo} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                                        Create PO for Packaging ({selectedArtworkIds.length})
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon className="h-5 w-5 text-gray-400" /></div>
                            <input type="text" placeholder="Search by filename, product name, or SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-gray-800/50 border border-gray-700 text-white placeholder-gray-400 rounded-md py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full" />
                        </div>
                    </header>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {processedArtwork.map(art => (
                            <ArtworkCard 
                                key={art.id} 
                                art={art} 
                                selectedArtworkIds={selectedArtworkIds} 
                                onCheckboxChange={handleCheckboxChange} 
                                onScanClick={handleScanClick} 
                                onUpdateArtwork={onUpdateArtwork} 
                                artworkFolders={artworkFolders}
                                onSelect={() => setSelectedArtworkForDetails(art)}
                                isSelected={selectedArtworkForDetails?.id === art.id}
                                onEdit={() => setArtworkBeingEdited(art)}
                            />
                        ))}
                    </div>
                </main>

                {/* Details Panel - Right Side */}
                {selectedArtworkForDetails && (
                    <aside className="w-80 bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex-shrink-0 overflow-auto" style={{ maxHeight: '90vh' }}>
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="text-lg font-semibold text-white">Artwork Details</h2>
                            <button
                                onClick={() => setSelectedArtworkForDetails(null)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Preview */}
                        <div className="mb-6 bg-gray-900 rounded-lg p-4 flex items-center justify-center aspect-square">
                            {selectedArtworkForDetails.url ? (
                                <img
                                    src={selectedArtworkForDetails.url}
                                    alt={selectedArtworkForDetails.fileName}
                                    className="max-h-full max-w-full object-contain rounded"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                            ) : (
                                <PhotoIcon className="w-20 h-20 text-gray-600" />
                            )}
                        </div>

                        {/* File Information */}
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wide">File Name</label>
                                <p className="text-sm text-white mt-1 break-words">{selectedArtworkForDetails.fileName}</p>
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wide">Product</label>
                                <p className="text-sm text-white mt-1">{selectedArtworkForDetails.productName}</p>
                                <p className="text-xs text-indigo-400 mt-0.5">{selectedArtworkForDetails.productSku}</p>
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wide">Revision</label>
                                <p className="text-sm text-white mt-1">Rev {selectedArtworkForDetails.revision}</p>
                            </div>

                            {selectedArtworkForDetails.fileType && (
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wide">Type</label>
                                    <p className="text-sm text-white mt-1 capitalize">{selectedArtworkForDetails.fileType}</p>
                                </div>
                            )}

                            {selectedArtworkForDetails.status && (
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wide">Status</label>
                                    <span className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${
                                        selectedArtworkForDetails.status === 'approved' ? 'bg-green-900/30 text-green-300 border border-green-700' :
                                        selectedArtworkForDetails.status === 'draft' ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700' :
                                        'bg-gray-700 text-gray-300 border border-gray-600'
                                    }`}>
                                        {selectedArtworkForDetails.status}
                                    </span>
                                </div>
                            )}

                            {selectedArtworkForDetails.barcode && (
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wide">Barcode</label>
                                    <p className="text-sm text-white mt-1 font-mono">{selectedArtworkForDetails.barcode}</p>
                                </div>
                            )}

                            {selectedArtworkForDetails.verified && (
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wide">Verification</label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <CheckCircleIcon className="w-4 h-4 text-green-400" />
                                        <span className="text-sm text-green-300">Verified</span>
                                    </div>
                                    {selectedArtworkForDetails.verifiedBy && (
                                        <p className="text-xs text-gray-400 mt-1">By {selectedArtworkForDetails.verifiedBy}</p>
                                    )}
                                </div>
                            )}

                            {selectedArtworkForDetails.fileSize && (
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wide">File Size</label>
                                    <p className="text-sm text-white mt-1">{(selectedArtworkForDetails.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                            )}

                            {selectedArtworkForDetails.uploadedAt && (
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wide">Uploaded</label>
                                    <p className="text-sm text-white mt-1">{new Date(selectedArtworkForDetails.uploadedAt).toLocaleDateString()}</p>
                                </div>
                            )}

                            {selectedArtworkForDetails.notes && (
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wide">Notes</label>
                                    <p className="text-sm text-white mt-1 whitespace-pre-wrap">{selectedArtworkForDetails.notes}</p>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="mt-6 pt-6 border-t border-gray-700 space-y-2">
                            <a 
                                href={selectedArtworkForDetails.url} 
                                download 
                                className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                <ArrowDownTrayIcon className="w-5 h-5" />
                                Download
                            </a>
                            <button 
                                onClick={() => handleScanClick(selectedArtworkForDetails)}
                                className="flex items-center justify-center gap-2 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                <SparklesIcon className="w-5 h-5" />
                                AI Scan
                            </button>
                            <button
                                onClick={() => setArtworkBeingEdited(selectedArtworkForDetails)}
                                className="flex items-center justify-center gap-2 w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                <DocumentDuplicateIcon className="w-5 h-5" />
                                Edit Artwork
                            </button>
                        </div>
                    </aside>
                )}
            </div>
            
            {selectedArtworkForScan && (
                 <RegulatoryScanModal
                    isOpen={isScanModalOpen}
                    onClose={() => setIsScanModalOpen(false)}
                    artwork={selectedArtworkForScan}
                    bom={boms.find(b => b.id === selectedArtworkForScan.bomId)!}
                    onUpdateLink={(link) => onUpdateArtwork(selectedArtworkForScan.id, selectedArtworkForScan.bomId, { regulatoryDocLink: link })}
                    watchlist={watchlist}
                    aiConfig={aiConfig}
                 />
            )}
            
            <BatchArtworkVerificationModal
                isOpen={isBatchVerificationModalOpen}
                onClose={() => setIsBatchVerificationModalOpen(false)}
                boms={boms}
                aiConfig={aiConfig}
            />

            {/* Label Scanner Modal */}
            {isLabelScannerOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-6xl max-h-[90vh] overflow-auto">
                        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center z-10">
                            <h2 className="text-2xl font-bold text-white">Label Scanner</h2>
                            <button
                                onClick={() => setIsLabelScannerOpen(false)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6">
                            <ManualLabelScanner
                                boms={boms}
                                currentUser={currentUser}
                                onClose={() => setIsLabelScannerOpen(false)}
                            />
                        </div>
                    </div>
                </div>
            )}
            
            <ArtworkEditor
                isOpen={Boolean(artworkBeingEdited)}
                artwork={artworkBeingEdited}
                onClose={() => setArtworkBeingEdited(null)}
                onSave={handleSaveEditedArtwork}
            />
        </>
    );
};

const ArtworkCard: React.FC<{
    art: ArtworkWithProduct; 
    selectedArtworkIds: string[]; 
    onCheckboxChange: (id: string, checked: boolean) => void; 
    onScanClick: (art: ArtworkWithProduct) => void; 
    onUpdateArtwork: (artworkId: string, bomId: string, updates: Partial<Artwork>) => void; 
    artworkFolders: ArtworkFolder[];
    onSelect: () => void;
    isSelected: boolean;
    onEdit: () => void;
}> = ({art, selectedArtworkIds, onCheckboxChange, onScanClick, onUpdateArtwork, artworkFolders, onSelect, isSelected, onEdit}) => {
    
    const handleMove = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newFolderId = e.target.value === 'unassigned' ? undefined : e.target.value;
        onUpdateArtwork(art.id, art.bomId, { folderId: newFolderId });
    };

    return (
        <div 
            key={art.id} 
            onClick={onSelect}
            className={`bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border overflow-hidden group flex flex-col cursor-pointer transition-all hover:shadow-xl ${
                isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-gray-700 hover:border-gray-600'
            }`}
        >
            <div className="relative aspect-square bg-gray-900 flex items-center justify-center">
                <PhotoIcon className="w-16 h-16 text-gray-600" />
                <input 
                    type="checkbox" 
                    checked={selectedArtworkIds.includes(art.id)} 
                    onChange={(e) => onCheckboxChange(art.id, e.target.checked)} 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-2 left-2 h-5 w-5 rounded bg-gray-700 text-indigo-500 focus:ring-indigo-600 border-gray-600" 
                />
            </div>
            <div className="p-3 flex-grow">
                <p className="text-sm font-semibold text-white truncate" title={art.fileName}>{art.fileName}</p>
                <p className="text-xs text-gray-400">Rev {art.revision}</p>
                <p className="text-xs text-indigo-300 mt-1 truncate" title={art.productName}>{art.productName}</p>
            </div>
             <div className="p-2 bg-gray-800 border-t border-gray-700 space-y-2" onClick={(e) => e.stopPropagation()}>
                <div>
                     <select onChange={handleMove} value={art.folderId || 'unassigned'} className="w-full text-xs bg-gray-700 p-1.5 rounded-md focus:ring-indigo-500 focus:border-indigo-500 border-gray-600">
                        <option value="unassigned">Move to...</option>
                        {artworkFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                     </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <a href={art.url} download className="flex items-center justify-center gap-1 w-full text-center bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <ArrowDownTrayIcon className="w-4 h-4" /> <span>Download</span>
                    </a>
                    <button onClick={(e) => { e.stopPropagation(); onScanClick(art); }} className="flex items-center justify-center gap-1 w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <SparklesIcon className="w-4 h-4" /> <span>Scan</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="flex items-center justify-center gap-1 w-full text-center bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <PhotoIcon className="w-4 h-4" /> <span>Edit</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ArtworkPage;
