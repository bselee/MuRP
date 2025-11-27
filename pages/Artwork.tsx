import React, { useState, useMemo, useEffect } from 'react';
import Button from '@/components/ui/Button';
import type { BillOfMaterials, Artwork, WatchlistItem, AiConfig, ArtworkFolder, GmailConnection, InventoryItem, Vendor, ArtworkShareEvent, DAMTier } from '../types';
import { PhotoIcon, ArrowDownTrayIcon, SearchIcon, SparklesIcon, DocumentDuplicateIcon, PlusCircleIcon, QrCodeIcon, CheckCircleIcon, CloudUploadIcon, SendIcon } from '../components/icons';
import RegulatoryScanModal from '../components/RegulatoryScanModal';
import BatchArtworkVerificationModal from '../components/BatchArtworkVerificationModal';
import ManualLabelScanner from '../components/ManualLabelScanner';
import ArtworkEditor from '../components/ArtworkEditor';
import UploadArtworkModal from '../components/UploadArtworkModal';
import ShareArtworkModal from '../components/ShareArtworkModal';
import { DAMSettingsPanel } from '../components/DAMSettingsPanel';
import { DAM_TIER_LIMITS } from '../types';

type ArtworkWithProduct = Artwork & {
    productName: string;
    productSku: string;
    bomId: string;
};

type PackagingContactSuggestion = {
    vendorId: string;
    vendorName: string;
    email: string;
};

type ShareLogPayload = {
    to: string[];
    cc: string[];
    subject: string;
    includeCompliance: boolean;
    attachFile: boolean;
    attachmentHash?: string | null;
    sentViaGmail: boolean;
};

interface ArtworkPageProps {
    boms: BillOfMaterials[];
    inventory: InventoryItem[];
    vendors: Vendor[];
    onAddArtwork: (bomId: string, artwork: Omit<Artwork, 'id'>) => void;
    onCreatePoFromArtwork: (artworkIds: string[]) => void;
    onUpdateArtwork: (artworkId: string, bomId: string, updates: Partial<Artwork>) => void;
    initialFilter: string;
    onClearFilter: () => void;
    watchlist: WatchlistItem[];
    aiConfig: AiConfig;
    artworkFolders: ArtworkFolder[];
    onCreateArtworkFolder: (name: string) => void;
    currentUser?: { id: string; email: string };
    gmailConnection: GmailConnection;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    artworkShareHistory: ArtworkShareEvent[];
    onRecordArtworkShare: (event: ArtworkShareEvent) => void;
}

const ArtworkPage: React.FC<ArtworkPageProps> = ({ boms, inventory, vendors, onAddArtwork, onCreatePoFromArtwork, onUpdateArtwork, initialFilter, onClearFilter, watchlist, aiConfig, artworkFolders, onCreateArtworkFolder, currentUser, gmailConnection, addToast, artworkShareHistory, onRecordArtworkShare }) => {
    const [isScanModalOpen, setIsScanModalOpen] = useState(false);
    const [isBatchVerificationModalOpen, setIsBatchVerificationModalOpen] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isLabelScannerOpen, setIsLabelScannerOpen] = useState(false);
    const [selectedArtworkForScan, setSelectedArtworkForScan] = useState<ArtworkWithProduct | null>(null);
    const [selectedArtworkForDetails, setSelectedArtworkForDetails] = useState<ArtworkWithProduct | null>(null);
    const [searchTerm, setSearchTerm] = useState(initialFilter);
    const [selectedArtworkIds, setSelectedArtworkIds] = useState<string[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [artworkBeingEdited, setArtworkBeingEdited] = useState<ArtworkWithProduct | null>(null);
    const [metadataDraft, setMetadataDraft] = useState({ fileName: '', notes: '' });
    const [isSavingMetadata, setIsSavingMetadata] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [selectedShareArtworks, setSelectedShareArtworks] = useState<ArtworkWithProduct[]>([]);
    
    // DAM Settings State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [damTier, setDamTier] = useState<DAMTier>('basic');
    const [damSettings, setDamSettings] = useState({
        defaultPrintSize: '4x6',
        showPrintReadyWarning: true,
        requireApproval: false,
        allowedDomains: 'gmail.com, company.com',
        autoArchive: false,
        emailNotifications: true,
        defaultShareCc: '',
    });

    // Download Warning State
    const [pendingDownload, setPendingDownload] = useState<{ artwork: ArtworkWithProduct; url: string } | null>(null);

    useEffect(() => {
        return () => {
            if (initialFilter) onClearFilter();
        };
    }, [initialFilter, onClearFilter]);

    useEffect(() => {
        if (selectedArtworkForDetails) {
            setMetadataDraft({
                fileName: selectedArtworkForDetails.fileName,
                notes: selectedArtworkForDetails.notes ?? '',
            });
        } else {
            setMetadataDraft({ fileName: '', notes: '' });
        }
    }, [selectedArtworkForDetails]);

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

    const inventoryBySku = useMemo(() => new Map(inventory.map(item => [item.sku, item])), [inventory]);
    const vendorById = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

    const packagingContactsByArtworkId = useMemo(() => {
        const map = new Map<string, PackagingContactSuggestion[]>();
        const isPackagingCategory = (category?: string) => category?.toLowerCase().includes('pack');

        boms.forEach(bom => {
            const vendorContactMap = new Map<string, PackagingContactSuggestion>();
            bom.components.forEach(component => {
                const inventoryItem = inventoryBySku.get(component.sku);
                if (!inventoryItem) return;
                if (!isPackagingCategory(inventoryItem.category)) return;
                const vendor = vendorById.get(inventoryItem.vendorId);
                if (!vendor || !vendor.contactEmails?.length) return;
                vendor.contactEmails.forEach(email => {
                    if (!email) return;
                    const key = `${vendor.id}:${email.toLowerCase()}`;
                    if (!vendorContactMap.has(key)) {
                        vendorContactMap.set(key, {
                            vendorId: vendor.id,
                            vendorName: vendor.name,
                            email,
                        });
                    }
                });
            });
            const suggestions = Array.from(vendorContactMap.values());
            bom.artwork.forEach(art => {
                map.set(art.id, suggestions);
            });
        });
        return map;
    }, [boms, inventoryBySku, vendorById]);

    const shareHistoryByArtworkId = useMemo(() => {
        const map = new Map<string, ArtworkShareEvent[]>();
        artworkShareHistory.forEach(event => {
            const entries = map.get(event.artworkId) ?? [];
            entries.push(event);
            map.set(event.artworkId, entries);
        });
        return map;
    }, [artworkShareHistory]);
    
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
        // Use integer revisions to match BOMs and database schema
        const nextRevision = Math.floor(currentRevision) + 1;
        const editedAt = new Date().toISOString();
        onUpdateArtwork(artworkBeingEdited.id, artworkBeingEdited.bomId, {
            url: dataUrl,
            revision: nextRevision,
            vectorSvg: typeof vectorSvg === 'string' ? vectorSvg : artworkBeingEdited.vectorSvg ?? null,
            vectorGeneratedAt: typeof vectorSvg === 'string' ? editedAt : artworkBeingEdited.vectorGeneratedAt,
            lastEditedAt: editedAt,
            lastEditedBy: currentUser?.id,
        });
        setArtworkBeingEdited(null);
    };

    const handleMetadataChange = (field: 'fileName' | 'notes', value: string) => {
        setMetadataDraft(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    const metadataDirty = Boolean(
        selectedArtworkForDetails &&
        (
            metadataDraft.fileName.trim() !== selectedArtworkForDetails.fileName ||
            (metadataDraft.notes ?? '').trim() !== (selectedArtworkForDetails.notes ?? '')
        )
    );

    const handleMetadataSave = async () => {
        if (!selectedArtworkForDetails) return;
        setIsSavingMetadata(true);
        const updates: Partial<Artwork> = {
            fileName: metadataDraft.fileName.trim() || selectedArtworkForDetails.fileName,
            notes: metadataDraft.notes.trim() ? metadataDraft.notes : undefined,
            lastEditedAt: new Date().toISOString(),
        };

        await awaitMaybePromise(onUpdateArtwork(selectedArtworkForDetails.id, selectedArtworkForDetails.bomId, updates));
        setSelectedArtworkForDetails(prev => prev && prev.id === selectedArtworkForDetails.id ? { ...prev, ...updates } : prev);
        setIsSavingMetadata(false);
    };

    const handleApproveArtwork = (artwork: ArtworkWithProduct) => {
        const updates: Partial<Artwork> = {
            status: 'approved',
            approvedBy: currentUser?.id || 'admin',
            approvedDate: new Date().toISOString(),
        };
        onUpdateArtwork(artwork.id, artwork.bomId, updates);
        addToast(`Artwork ${artwork.fileName} approved.`, 'success');
        
        if (selectedArtworkForDetails?.id === artwork.id) {
            setSelectedArtworkForDetails(prev => prev ? { ...prev, ...updates } : null);
        }
    };

    const handleShareClick = (artwork: ArtworkWithProduct) => {
        if (damSettings.requireApproval && artwork.status !== 'approved') {
            addToast('Approval required before sharing.', 'error');
            return;
        }
        setSelectedShareArtworks([artwork]);
        setIsShareModalOpen(true);
    };

    const handleBulkShare = () => {
        const artworksToShare = allArtwork.filter(art => selectedArtworkIds.includes(art.id));
        
        if (damSettings.requireApproval) {
            const unapproved = artworksToShare.filter(art => art.status !== 'approved');
            if (unapproved.length > 0) {
                addToast(`Cannot share ${unapproved.length} unapproved artwork(s). Approval is required.`, 'error');
                return;
            }
        }

        setSelectedShareArtworks(artworksToShare);
        setIsShareModalOpen(true);
    };

    const handleCopyLink = async (artwork: ArtworkWithProduct) => {
        if (!artwork.url) {
            addToast('No shareable link available for this artwork.', 'error');
            return;
        }
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(artwork.url);
                addToast('Artwork link copied to clipboard.', 'success');
            } else {
                throw new Error('Clipboard API unavailable');
            }
        } catch (error) {
            console.error('Copy link error:', error);
            addToast('Unable to copy link. Please copy manually.', 'error');
        }
    };

    const handleShareLogged = (artworks: ArtworkWithProduct[], payload: ShareLogPayload) => {
        artworks.forEach(artwork => {
            const event: ArtworkShareEvent = {
                id: `share-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                artworkId: artwork.id,
                bomId: artwork.bomId,
                productSku: artwork.productSku,
                productName: artwork.productName,
                to: payload.to,
                cc: payload.cc,
                subject: payload.subject,
                includeCompliance: payload.includeCompliance,
                attachFile: payload.attachFile,
                attachmentHash: payload.attachmentHash ?? null,
                sentViaGmail: payload.sentViaGmail,
                senderEmail: currentUser?.email ?? gmailConnection.email,
                timestamp: new Date().toISOString(),
            };
            onRecordArtworkShare(event);
        });
    };
    
    const awaitMaybePromise = async (maybePromise: void | Promise<void>) => {
        if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
            await maybePromise;
        }
    };

    const FolderButton: React.FC<{folderId: string | null, name: string}> = ({folderId, name}) => (
        <Button onClick={() => setSelectedFolderId(folderId)} className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${selectedFolderId === folderId ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}>
            {name}
        </Button>
    );

    const selectedShareHistory = selectedArtworkForDetails
        ? [...(shareHistoryByArtworkId.get(selectedArtworkForDetails.id) ?? [])].sort((a, b) => (
            (new Date(b.timestamp).valueOf()) - (new Date(a.timestamp).valueOf())
          ))
        : [];

    const selectedShareSuggestions = useMemo(() => {
        if (selectedShareArtworks.length === 0) return [];
        // Aggregate suggestions from all selected artworks
        const allSuggestions = selectedShareArtworks.flatMap(art => 
            packagingContactsByArtworkId.get(art.id) ?? []
        );
        // Deduplicate by email
        const unique = new Map<string, PackagingContactSuggestion>();
        allSuggestions.forEach(s => unique.set(s.email, s));
        return Array.from(unique.values());
    }, [selectedShareArtworks, packagingContactsByArtworkId]);

    const complianceHighlights = selectedArtworkForDetails ? [
        {
            label: 'AI Scan',
            value: selectedArtworkForDetails.scanStatus
                ? selectedArtworkForDetails.scanStatus === 'completed'
                    ? 'Completed'
                    : selectedArtworkForDetails.scanStatus
                : 'Not started',
        },
        {
            label: 'Verification',
            value: selectedArtworkForDetails.verified ? 'Verified' : 'Pending',
            accent: selectedArtworkForDetails.verified ? 'text-green-300' : 'text-yellow-300',
        },
        {
            label: 'Reg Doc Link',
            value: selectedArtworkForDetails.regulatoryDocLink ? 'Linked' : 'Missing',
            accent: selectedArtworkForDetails.regulatoryDocLink ? 'text-emerald-300' : 'text-red-300',
        },
    ] : [];

    const handleDownload = (artwork: ArtworkWithProduct) => {
        const isPrintReady = artwork.printReady;
        const dateStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '');
        const size = damSettings.defaultPrintSize;
        const prFlag = isPrintReady ? '_PR' : '';
        const sku = artwork.productSku || 'SKU';
        
        // Schema: SKU_SIZE_DATE_PR
        const filename = `${sku}_${size}_${dateStr}${prFlag}`;
        
        // If not print ready and warning enabled, show warning
        if (!isPrintReady && damSettings.showPrintReadyWarning) {
            setPendingDownload({ artwork, url: artwork.url });
            return;
        }

        triggerDownload(artwork.url, filename);
    };

    const triggerDownload = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setPendingDownload(null);
    };

    const confirmDownload = () => {
        if (!pendingDownload) return;
        const dateStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '');
        const size = damSettings.defaultPrintSize;
        const sku = pendingDownload.artwork.productSku || 'SKU';
        const filename = `${sku}_${size}_${dateStr}`; // No PR flag
        triggerDownload(pendingDownload.url, filename);
    };

    const handleEditClick = (artwork: ArtworkWithProduct) => {
        if (!DAM_TIER_LIMITS[damTier].editing) {
            addToast(`Editing requires 'Mid' or 'Full' DAM tier. Current: ${damTier}`, 'error');
            return;
        }
        setArtworkBeingEdited(artwork);
    };

    const handleMoveArtwork = (artwork: ArtworkWithProduct, folderId: string | null) => {
        onUpdateArtwork(artwork.id, artwork.bomId, { folderId });
    };

    const handleBulkMove = (folderId: string | null) => {
        const updates = selectedArtworkIds.map(artworkId => {
            const artwork = allArtwork.find(art => art.id === artworkId);
            return artwork ? { id: artwork.id, bomId: artwork.bomId, folderId } : null;
        }).filter((artwork): artwork is { id: string; bomId: string; folderId: string | null } => artwork !== null);

        updates.forEach(artwork => {
            onUpdateArtwork(artwork.id, artwork.bomId, { folderId });
        });

        setSelectedArtworkIds([]);
    };

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
                                    <Button onClick={handleCreateFolder} className="flex-1 bg-indigo-600 text-white font-semibold py-1 px-2 text-sm rounded-md">Create</Button>
                                    <Button onClick={() => setIsCreatingFolder(false)} className="flex-1 bg-gray-600 text-white font-semibold py-1 px-2 text-sm rounded-md">Cancel</Button>
                                </div>
                            </div>
                        ) : (
                            <Button onClick={() => setIsCreatingFolder(true)} className="w-full flex items-center justify-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-3 rounded-md transition-colors">
                                <PlusCircleIcon className="w-5 h-5" />
                                Create Folder
                            </Button>
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
                                <Button 
                                    onClick={() => {
                                        const totalSize = allArtwork.reduce((acc, art) => acc + (art.fileSize || 0), 0);
                                        const limitGB = DAM_TIER_LIMITS[damTier].storage;
                                        const limitBytes = limitGB * 1024 * 1024 * 1024;
                                        
                                        if (totalSize >= limitBytes) {
                                            addToast(`Storage limit reached for ${damTier} tier (${limitGB}GB). Please upgrade to upload more.`, 'error');
                                            return;
                                        }
                                        setIsUploadModalOpen(true);
                                    }}
                                    className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center gap-2"
                                >
                                    <CloudUploadIcon className="w-5 h-5" />
                                    Upload Artwork
                                </Button>
                                <Button 
                                    onClick={() => setIsLabelScannerOpen(true)}
                                    className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center gap-2"
                                >
                                    <QrCodeIcon className="w-5 h-5" />
                                    Scan Labels
                                </Button>
                                <Button 
                                    onClick={() => setIsBatchVerificationModalOpen(true)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center gap-2"
                                >
                                    <SparklesIcon className="w-5 h-5" />
                                    Batch Verify
                                </Button>
                                {selectedArtworkIds.length > 0 && (
                                    <>
                                        <Button onClick={handleBulkShare} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center gap-2">
                                            <SendIcon className="w-4 h-4" />
                                            Share ({selectedArtworkIds.length})
                                        </Button>
                                        <Button onClick={handleCreatePo} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                                            Create PO for Packaging ({selectedArtworkIds.length})
                                        </Button>
                                    </>
                                )}
                                <Button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-md transition-colors"
                                    title="DAM Settings"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </Button>
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
                                onShare={() => handleShareClick(art)}
                            />
                        ))}
                    </div>
                </main>

                {/* Details Panel - Right Side */}
                {selectedArtworkForDetails && (
                    <aside className="w-80 bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex-shrink-0 overflow-auto" style={{ maxHeight: '90vh' }}>
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="text-lg font-semibold text-white">Artwork Details</h2>
                            <Button
                                onClick={() => setSelectedArtworkForDetails(null)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </Button>
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

                        <div className="mt-6 pt-4 border-t border-gray-700 space-y-3">
                            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Metadata Editor</h3>
                            <div>
                                <label className="text-xs text-gray-400">Display Name</label>
                                <input
                                    type="text"
                                    value={metadataDraft.fileName}
                                    onChange={e => handleMetadataChange('fileName', e.target.value)}
                                    className="mt-1 w-full bg-gray-900/60 text-white text-sm rounded-md p-2 border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400">Notes</label>
                                <textarea
                                    value={metadataDraft.notes}
                                    onChange={e => handleMetadataChange('notes', e.target.value)}
                                    rows={3}
                                    className="mt-1 w-full bg-gray-900/60 text-white text-sm rounded-md p-2 border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <Button
                                onClick={handleMetadataSave}
                                disabled={!metadataDirty || isSavingMetadata}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                {isSavingMetadata ? 'Saving...' : 'Save Details'}
                            </Button>
                        </div>

                        {complianceHighlights.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-gray-700">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Compliance Snapshot</h3>
                                <div className="space-y-2">
                                    {complianceHighlights.map(item => (
                                        <div key={item.label} className="flex justify-between text-sm text-gray-300">
                                            <span className="text-gray-400">{item.label}</span>
                                            <span className={item.accent ?? ''}>{item.value}</span>
                                        </div>
                                    ))}
                                    {selectedArtworkForDetails?.scanError && (
                                        <p className="text-xs text-red-300">Scan Error: {selectedArtworkForDetails.scanError}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="mt-6 pt-6 border-t border-gray-700 space-y-2">
                            <Button 
                                onClick={() => handleDownload(selectedArtworkForDetails)}
                                className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                <ArrowDownTrayIcon className="w-5 h-5" />
                                Download
                            </Button>
                            {selectedArtworkForDetails.status !== 'approved' && (
                                <Button
                                    onClick={() => handleApproveArtwork(selectedArtworkForDetails)}
                                    className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                                >
                                    <CheckCircleIcon className="w-5 h-5" />
                                    Approve Artwork
                                </Button>
                            )}
                            <Button 
                                onClick={() => handleScanClick(selectedArtworkForDetails)}
                                className="flex items-center justify-center gap-2 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                <SparklesIcon className="w-5 h-5" />
                                AI Scan
                            </Button>
                            <Button
                                onClick={() => handleEditClick(selectedArtworkForDetails)}
                                className="flex items-center justify-center gap-2 w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                <DocumentDuplicateIcon className="w-5 h-5" />
                                Edit Artwork
                            </Button>
                            <Button
                                onClick={() => handleShareClick(selectedArtworkForDetails)}
                                className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                <SendIcon className="w-5 h-5" />
                                Email Packaging
                            </Button>
                            <Button
                                onClick={() => handleCopyLink(selectedArtworkForDetails)}
                                className="flex items-center justify-center gap-2 w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                <DocumentDuplicateIcon className="w-5 h-5" />
                                Copy Share Link
                            </Button>
                        </div>

                        {selectedShareHistory.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-gray-700 space-y-3">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Share History</h3>
                                <div className="space-y-3">
                                    {selectedShareHistory.slice(0, 4).map(event => (
                                        <div key={event.id} className="bg-gray-900/40 rounded-md p-3 border border-gray-800">
                                            <div className="flex items-center justify-between text-xs text-gray-400">
                                                <span>{new Date(event.timestamp).toLocaleString()}</span>
                                                <span className={event.sentViaGmail ? 'text-emerald-300' : 'text-yellow-300'}>
                                                    {event.sentViaGmail ? 'Gmail' : 'Simulated'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-white mt-1 truncate">
                                                To: {event.to.join(', ')}
                                            </p>
                                            {event.cc.length > 0 && (
                                                <p className="text-xs text-gray-400 truncate">
                                                    Cc: {event.cc.join(', ')}
                                                </p>
                                            )}
                                            {event.attachmentHash && (
                                                <p className="text-[10px] text-gray-500 mt-1 font-mono">
                                                    Hash: {event.attachmentHash.slice(0, 12)}…
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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
                            <Button
                                onClick={() => setIsLabelScannerOpen(false)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </Button>
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

            <UploadArtworkModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                boms={boms}
                onUpload={onAddArtwork}
                currentUser={currentUser}
            />

            <DAMSettingsPanel
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currentTier={damTier}
                onUpgrade={setDamTier}
                settings={damSettings}
                onUpdateSettings={setDamSettings}
            />

            {/* Download Warning Modal */}
            {pendingDownload && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-lg p-6 max-w-md border border-yellow-600/50">
                        <div className="flex items-center gap-3 mb-4 text-yellow-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <h3 className="text-lg font-bold">Not Print Ready</h3>
                        </div>
                        <p className="text-gray-300 mb-6">
                            This file is not marked as <strong>Print Ready (PR)</strong>. It may not meet production standards for resolution or bleed.
                        </p>
                        <div className="flex justify-end gap-3">
                            <Button onClick={() => setPendingDownload(null)} className="bg-gray-700 hover:bg-gray-600 text-white">
                                Cancel
                            </Button>
                            <Button onClick={confirmDownload} className="bg-yellow-600 hover:bg-yellow-700 text-white">
                                Download Anyway
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            
            <ShareArtworkModal
                isOpen={isShareModalOpen}
                onClose={() => {
                    setIsShareModalOpen(false);
                    setSelectedShareArtworks([]);
                }}
                artworks={selectedShareArtworks}
                gmailConnection={gmailConnection}
                addToast={addToast}
                currentUser={currentUser}
                suggestedContacts={selectedShareSuggestions}
                onShareLogged={(artworks, payload) => handleShareLogged(artworks as ArtworkWithProduct[], payload)}
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
    onShare: () => void;
}> = ({art, selectedArtworkIds, onCheckboxChange, onScanClick, onUpdateArtwork, artworkFolders, onSelect, isSelected, onEdit, onShare}) => {
    
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
                <div className="grid grid-cols-2 gap-2">
                    <a href={art.url} download className="flex items-center justify-center gap-1 w-full text-center bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <ArrowDownTrayIcon className="w-4 h-4" /> <span>Download</span>
                    </a>
                    <Button onClick={(e) => { e.stopPropagation(); onScanClick(art); }} className="flex items-center justify-center gap-1 w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <SparklesIcon className="w-4 h-4" /> <span>Scan</span>
                    </Button>
                    <Button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="flex items-center justify-center gap-1 w-full text-center bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <PhotoIcon className="w-4 h-4" /> <span>Edit</span>
                    </Button>
                    <Button onClick={(e) => { e.stopPropagation(); onShare(); }} className="flex items-center justify-center gap-1 w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <SendIcon className="w-4 h-4" /> <span>Share</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default ArtworkPage;
