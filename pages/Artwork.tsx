import React, { useState, useMemo, useEffect, useRef } from 'react';
import Button from '@/components/ui/Button';
import type { BillOfMaterials, Artwork, WatchlistItem, AiConfig, ArtworkFolder, GmailConnection, InventoryItem, Vendor, ArtworkShareEvent, DAMTier, DamSettingsState, CompanyEmailSettings } from '../types';
import { mockBOMs } from '../types';
import { isE2ETesting } from '../lib/auth/guards';
import { PhotoIcon, ArrowDownTrayIcon, SearchIcon, SparklesIcon, DocumentDuplicateIcon, PlusCircleIcon, QrCodeIcon, CheckCircleIcon, CloudUploadIcon, SendIcon, DocumentTextIcon } from '../components/icons';
import RegulatoryScanModal from '../components/RegulatoryScanModal';
import BatchArtworkVerificationModal from '../components/BatchArtworkVerificationModal';
import ArtworkEditor from '../components/ArtworkEditor';
import UploadArtworkModal from '../components/UploadArtworkModal';
import ShareArtworkModal from '../components/ShareArtworkModal';
import { DAMSettingsPanel } from '../components/DAMSettingsPanel';
import { DAM_TIER_LIMITS } from '../types';
import { loadState, saveState } from '../services/storageService';
import { fileToBase64, scanLabelImage } from '../services/labelScanningService';
import SupportTicketModal from '../components/SupportTicketModal';
import ComplianceDashboard from '../components/ComplianceDashboard';

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
    channel?: 'gmail' | 'resend' | 'simulation';
    senderEmail?: string | null;
};

type DropzoneUpload = {
    id: string;
    file: File;
    bomId?: string;
    status: 'pending' | 'uploading' | 'scanning' | 'complete' | 'error';
    progress: string;
    error?: string;
    preview?: string;
};

const DEFAULT_DAM_SETTINGS: DamSettingsState = {
    defaultPrintSize: '4x6',
    showPrintReadyWarning: true,
    requireApproval: false,
    allowedDomains: 'gmail.com, company.com',
    autoArchive: false,
    emailNotifications: true,
    defaultShareCc: '',
};

const damSettingsEqual = (a: DamSettingsState, b: DamSettingsState): boolean =>
    a.defaultPrintSize === b.defaultPrintSize &&
    a.showPrintReadyWarning === b.showPrintReadyWarning &&
    a.requireApproval === b.requireApproval &&
    a.allowedDomains === b.allowedDomains &&
    a.autoArchive === b.autoArchive &&
    a.emailNotifications === b.emailNotifications &&
    a.defaultShareCc === b.defaultShareCc;

const getDamStorageKey = (userId: string | undefined, suffix: 'tier' | 'settings') =>
    `dam-settings:${userId ?? 'global'}:${suffix}`;

const formatStorageSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
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
    onConnectGoogle?: () => Promise<boolean>;
    companyEmailSettings: CompanyEmailSettings;
}

const ArtworkPage: React.FC<ArtworkPageProps> = ({ boms, inventory, vendors, onAddArtwork, onCreatePoFromArtwork, onUpdateArtwork, initialFilter, onClearFilter, watchlist, aiConfig, artworkFolders, onCreateArtworkFolder, currentUser, gmailConnection, addToast, artworkShareHistory, onRecordArtworkShare, onConnectGoogle, companyEmailSettings }) => {
    const [isScanModalOpen, setIsScanModalOpen] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isBatchVerificationModalOpen, setIsBatchVerificationModalOpen] = useState(false);
    const [isScanningInterfaceOpen, setIsScanningInterfaceOpen] = useState(false);
    const [activeScanTab, setActiveScanTab] = useState<'manual' | 'regulatory' | 'batch' | 'ai' | 'compliance'>('manual');
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
    const [dropzoneItems, setDropzoneItems] = useState<DropzoneUpload[]>([]);
    const [isDragActive, setIsDragActive] = useState(false);
    const dropInputRef = useRef<HTMLInputElement | null>(null);
    
    // DAM Settings State (persisted per-user)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const damTierStorageKey = getDamStorageKey(currentUser?.id, 'tier');
    const damSettingsStorageKey = getDamStorageKey(currentUser?.id, 'settings');
    const [damTier, setDamTier] = useState<DAMTier>(() => loadState<DAMTier>(damTierStorageKey, 'basic'));
    const [damSettings, setDamSettings] = useState<DamSettingsState>(() =>
        loadState<DamSettingsState>(damSettingsStorageKey, DEFAULT_DAM_SETTINGS)
    );

    // Sidebar collapse state
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const storedTier = loadState<DAMTier>(damTierStorageKey, 'basic');
        if (storedTier !== damTier) {
            setDamTier(storedTier);
        }
        const storedSettings = loadState<DamSettingsState>(damSettingsStorageKey, DEFAULT_DAM_SETTINGS);
        if (!damSettingsEqual(storedSettings, damSettings)) {
            setDamSettings(storedSettings);
        }
    }, [damTierStorageKey, damSettingsStorageKey]);

    useEffect(() => {
        saveState<DAMTier>(damTierStorageKey, damTier);
    }, [damTier, damTierStorageKey]);

    useEffect(() => {
        saveState<DamSettingsState>(damSettingsStorageKey, damSettings);
    }, [damSettings, damSettingsStorageKey]);

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

    const isArtworkE2EMode = typeof window !== 'undefined' && isE2ETesting();
    const effectiveBoms = useMemo(() => {
        if (isArtworkE2EMode && (!boms || boms.length === 0)) {
            return mockBOMs;
        }
        return boms;
    }, [boms, isArtworkE2EMode]);

    const allArtwork = useMemo(() => {
        return effectiveBoms.flatMap(bom =>
            bom.artwork.map(art => ({
                ...art,
                productName: bom.name,
                productSku: bom.finishedSku,
                bomId: bom.id,
            }))
        ).sort((a,b) => a.fileName.localeCompare(b.fileName));
    }, [effectiveBoms]);

    const normalizedAssets = useMemo(() => {
        return effectiveBoms.flatMap(bom => bom.artworkAssets?.map(link => link.asset) ?? []);
    }, [effectiveBoms]);

    const normalizedStorageBytes = useMemo(() => {
        return normalizedAssets.reduce((total, asset) => {
            const metadata = (asset.metadata as { fileSizeBytes?: number; fileSize?: number } | null) ?? null;
            const size = metadata?.fileSizeBytes ?? metadata?.fileSize ?? 0;
            return total + (typeof size === 'number' ? size : 0);
        }, 0);
    }, [normalizedAssets]);

    const legacyStorageBytes = useMemo(() => {
        return allArtwork.reduce((acc, art) => acc + (art.fileSize ?? 0), 0);
    }, [allArtwork]);

    const storageUsageBytes = normalizedStorageBytes || legacyStorageBytes;
    const storageLimitBytes = DAM_TIER_LIMITS[damTier].storage;
    const normalizedAssetCount = normalizedAssets.length;
    const legacyAssetCount = allArtwork.length;
    const totalAssetCount = normalizedAssetCount + legacyAssetCount;
    const uploadLimit = DAM_TIER_LIMITS[damTier].uploadLimit;
    const isUploadOnly = DAM_TIER_LIMITS[damTier].uploadOnly;
    const canUpload = uploadLimit === -1 || totalAssetCount < uploadLimit;

    const allowedDomainsList = useMemo(() => {
        return damSettings.allowedDomains
            .split(',')
            .map(domain => domain.trim().replace(/^@/, '').toLowerCase())
            .filter(Boolean);
    }, [damSettings.allowedDomains]);

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

    const inventoryBySku = useMemo(() => new Map((inventory || []).map(item => [item.sku, item])), [inventory]);
    const vendorById = useMemo(() => new Map((vendors || []).map(v => [v.id, v])), [vendors]);

    const packagingContactsByArtworkId = useMemo(() => {
        const map = new Map<string, PackagingContactSuggestion[]>();
        const isPackagingCategory = (category?: string) => category?.toLowerCase().includes('pack');

        effectiveBoms.forEach(bom => {
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
    }, [effectiveBoms, inventoryBySku, vendorById]);

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
                senderEmail: payload.senderEmail ?? currentUser?.email ?? gmailConnection.email,
                timestamp: new Date().toISOString(),
                channel: payload.channel ?? (payload.sentViaGmail ? 'gmail' : 'simulation'),
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
        <Button onClick={() => setSelectedFolderId(folderId)} className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${selectedFolderId === folderId ? 'bg-accent-500 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}>
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

    const handleDropzoneFiles = (fileList: FileList | File[]) => {
        const accepted: DropzoneUpload[] = [];
        const maxSize = 75 * 1024 * 1024;
        Array.from(fileList).forEach((file, idx) => {
            if (file.size > maxSize) {
                return;
            }
            const id = `${file.name}-${Date.now()}-${idx}`;
            const preview = file.type?.startsWith('image/') ? URL.createObjectURL(file) : undefined;
            accepted.push({
                id,
                file,
                status: 'pending',
                progress: 'Queued',
                preview,
            });
        });
        if (accepted.length === 0) return;
        setDropzoneItems(prev => [...prev, ...accepted]);
    };

    const handleDropzoneRemove = (id: string) => {
        setDropzoneItems(prev => {
            const target = prev.find(item => item.id === id);
            if (target?.preview) URL.revokeObjectURL(target.preview);
            return prev.filter(item => item.id !== id);
        });
    };

    const handleDropzoneBomChange = (id: string, bomId: string) => {
        setDropzoneItems(prev => prev.map(item => item.id === id ? { ...item, bomId } : item));
    };

    const inferArtworkFileType = (file: File): Artwork['fileType'] => {
        const lower = file.name.toLowerCase();
        if (lower.includes('label')) return 'label';
        if (lower.includes('bag')) return 'bag';
        if (lower.includes('doc')) return 'document';
        if (lower.endsWith('.pdf')) return 'artwork';
        if (lower.endsWith('.ai') || lower.endsWith('.ps') || lower.endsWith('.eps')) return 'artwork';
        return 'document';
    };

    const handleDropzoneUpload = async () => {
        if (dropzoneItems.length === 0) return;
        const items = [...dropzoneItems];
        for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx];
            if (item.status !== 'pending' && item.status !== 'error') continue;
            if (!item.bomId) {
                setDropzoneItems(prev => prev.map(entry => entry.id === item.id ? { ...entry, status: 'error', progress: 'Select a product first', error: 'Choose a product' } : entry));
                continue;
            }
            setDropzoneItems(prev => prev.map(entry => entry.id === item.id ? { ...entry, status: 'uploading', progress: 'Uploading...' } : entry));
            try {
                const base64 = await fileToBase64(item.file);
                const dataUrl = `data:${item.file.type || 'application/octet-stream'};base64,${base64}`;
                const artworkPayload: Omit<Artwork, 'id'> = {
                    fileName: item.file.name,
                    revision: 1,
                    url: dataUrl,
                    fileType: inferArtworkFileType(item.file),
                    fileSize: item.file.size,
                    mimeType: item.file.type || 'application/octet-stream',
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: currentUser?.id,
                    status: 'draft',
                    scanStatus: 'pending',
                    verified: false,
                };
                if (artworkPayload.fileType === 'label') {
                    setDropzoneItems(prev => prev.map(entry => entry.id === item.id ? { ...entry, status: 'scanning', progress: 'Scanning label...' } : entry));
                    try {
                        const extracted = await scanLabelImage(base64);
                        artworkPayload.extractedData = extracted;
                        artworkPayload.scanStatus = 'completed';
                        artworkPayload.scanCompletedAt = new Date().toISOString();
                        if (extracted?.barcode) {
                            artworkPayload.barcode = extracted.barcode;
                        }
                    } catch (scanError) {
                        console.error('Dropzone scan error', scanError);
                        artworkPayload.scanStatus = 'failed';
                        artworkPayload.scanError = scanError instanceof Error ? scanError.message : 'Scan failed';
                    }
                }
                onUpload(item.bomId, artworkPayload);
                setDropzoneItems(prev => prev.map(entry => entry.id === item.id ? { ...entry, status: 'complete', progress: 'Uploaded!' } : entry));
                if (item.preview) URL.revokeObjectURL(item.preview);
            } catch (error) {
                console.error('Dropzone upload error:', error);
                setDropzoneItems(prev => prev.map(entry => entry.id === item.id ? {
                    ...entry,
                    status: 'error',
                    progress: 'Upload failed',
                    error: error instanceof Error ? error.message : 'Upload failed',
                } : entry));
            }
        }
    };

    const pendingDropUploads = dropzoneItems.filter(item => item.status === 'pending' || item.status === 'error').length;

    useEffect(() => {
        if (dropzoneItems.length === 0) return;
        const allComplete = dropzoneItems.every(item => item.status === 'complete');
        if (allComplete) {
            const timeout = window.setTimeout(() => setDropzoneItems([]), 1500);
            return () => window.clearTimeout(timeout);
        }
    }, [dropzoneItems]);

    return (
        <>
            {/* Integrated Scanning Interface */}
            {isScanningInterfaceOpen && (
                <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <SparklesIcon className="w-6 h-6 text-accent-400" />
                            <h2 className="text-2xl font-bold text-white">Scanning System</h2>
                        </div>
                        <Button
                            onClick={() => setIsScanningInterfaceOpen(false)}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </Button>
                    </div>

                    {/* Scan Mode Tabs */}
                    <div className="flex gap-2 mb-6 overflow-x-auto">
                        {[
                            { id: 'manual' as const, label: 'Manual Label Scan', icon: QrCodeIcon, description: 'Upload & scan individual labels with AI extraction', requiresCompliance: false },
                            { id: 'regulatory' as const, label: 'Regulatory Compliance', icon: SparklesIcon, description: 'State-specific regulatory scanning & compliance advice', requiresCompliance: false },
                            { id: 'batch' as const, label: 'Batch Verification', icon: DocumentDuplicateIcon, description: 'Verify multiple artwork files simultaneously', requiresCompliance: false },
                            { id: 'ai' as const, label: 'AI-Powered Analysis', icon: SparklesIcon, description: 'Advanced AI analysis for artwork quality & compliance', requiresCompliance: false },
                            { id: 'compliance' as const, label: 'Compliance Dashboard', icon: DocumentTextIcon, description: 'Comprehensive compliance monitoring across all products', requiresCompliance: true }
                        ].filter(tab => !tab.requiresCompliance || DAM_TIER_LIMITS[damTier].compliance).map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveScanTab(tab.id)}
                                className={`flex-shrink-0 px-4 py-3 rounded-lg border transition-all duration-200 ${
                                    activeScanTab === tab.id
                                        ? 'bg-accent-500 border-accent-500 text-white shadow-lg'
                                        : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50 hover:border-gray-500'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <tab.icon className="w-4 h-4" />
                                    <span className="font-semibold text-sm">{tab.label}</span>
                                </div>
                                <p className="text-xs opacity-80">{tab.description}</p>
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="min-h-[600px]">
                        {activeScanTab === 'manual' && (
                            <div className="bg-gray-900/30 rounded-lg p-6">
                                <div className="text-center mb-6">
                                    <QrCodeIcon className="w-12 h-12 text-accent-400 mx-auto mb-3" />
                                    <h3 className="text-xl font-semibold text-white mb-2">Manual Label Scanner</h3>
                                    <p className="text-gray-400">Upload and scan product labels with AI extraction. No BOM required.</p>
                                </div>
                                <div className="text-center py-8">
                                    <p className="text-gray-500 mb-4">Manual label scanner component coming soon.</p>
                                </div>
                            </div>
                        )}

                        {activeScanTab === 'regulatory' && (
                            <div className="bg-gray-900/30 rounded-lg p-6">
                                <div className="text-center mb-6">
                                    <SparklesIcon className="w-12 h-12 text-green-400 mx-auto mb-3" />
                                    <h3 className="text-xl font-semibold text-white mb-2">Regulatory Compliance Scanner</h3>
                                    <p className="text-gray-400">AI-powered regulatory scanning for state-specific compliance requirements.</p>
                                </div>
                                {selectedArtworkForScan ? (
                                    <RegulatoryScanModal
                                        isOpen={true}
                                        onClose={() => setSelectedArtworkForScan(null)}
                                        artwork={selectedArtworkForScan}
                                        bom={effectiveBoms.find(b => b.id === selectedArtworkForScan.bomId)!}
                                        onUpdateLink={(link) => onUpdateArtwork(selectedArtworkForScan.id, selectedArtworkForScan.bomId, { regulatoryDocLink: link })}
                                        watchlist={watchlist}
                                        aiConfig={aiConfig}
                                    />
                                ) : (
                                    <div className="text-center py-12">
                                        <DocumentTextIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                                        <h4 className="text-lg font-semibold text-gray-400 mb-2">Select Artwork to Scan</h4>
                                        <p className="text-gray-500 mb-4">Choose an artwork file from the library above to begin regulatory compliance scanning.</p>
                                        <Button
                                            onClick={() => setIsScanningInterfaceOpen(false)}
                                            className="bg-accent-500 hover:bg-accent-600 text-white px-6 py-2 rounded-lg"
                                        >
                                            Browse Artwork Library
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeScanTab === 'batch' && (
                            <div className="bg-gray-900/30 rounded-lg p-6">
                                <div className="text-center mb-6">
                                    <DocumentDuplicateIcon className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                                    <h3 className="text-xl font-semibold text-white mb-2">Batch Artwork Verification</h3>
                                    <p className="text-gray-400">Upload and verify multiple artwork files simultaneously with AI analysis.</p>
                                </div>
                                <BatchArtworkVerificationModal
                                    isOpen={true}
                                    onClose={() => {}}
                                    boms={effectiveBoms}
                                    aiConfig={aiConfig}
                                />
                            </div>
                        )}

                        {activeScanTab === 'compliance' && DAM_TIER_LIMITS[damTier].compliance && (
                            <div className="bg-gray-900/30 rounded-lg p-6">
                                <div className="text-center mb-6">
                                    <DocumentTextIcon className="w-12 h-12 text-green-400 mx-auto mb-3" />
                                    <h3 className="text-xl font-semibold text-white mb-2">Compliance Dashboard</h3>
                                    <p className="text-gray-400">Comprehensive regulatory compliance monitoring across all your products and artwork.</p>
                                </div>
                                <ComplianceDashboard
                                    boms={effectiveBoms}
                                    watchlist={watchlist}
                                    onViewDetails={(bom, status) => {
                                        // Handle viewing compliance details for a specific BOM
                                        addToast(`Viewing compliance details for ${bom.name}`, 'info');
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="flex gap-6 h-full">
                {/* Folder Sidebar */}
                <aside className={`${isSidebarCollapsed ? 'w-12' : 'w-64'} bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex-shrink-0 flex flex-col transition-all duration-300`} style={{ minHeight: '600px' }}>
                    <div className="flex items-center justify-between mb-4">
                        {!isSidebarCollapsed && <h2 className="text-lg font-semibold text-white">Folders</h2>}
                        <Button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="text-gray-400 hover:text-white transition-colors p-1"
                            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            <svg className={`w-5 h-5 transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Button>
                    </div>
                    {!isSidebarCollapsed && (
                        <>
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
                                            <Button onClick={handleCreateFolder} className="flex-1 bg-accent-500 text-white font-semibold py-1 px-2 text-sm rounded-md">Create</Button>
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
                        </>
                    )}
                </aside>

                <main className="flex-1 space-y-6">
                    <header className="mb-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <h1 className="text-xl font-bold text-white tracking-tight">Artwork Library</h1>
                            <div className="flex flex-wrap gap-2">
                                <Button 
                                    onClick={() => {
                                        if (!canUpload) {
                                            addToast(`Upload limit reached (${uploadLimit} files) for ${damTier} tier. Please upgrade to upload more.`, 'error');
                                            return;
                                        }
                                        if (storageUsageBytes >= storageLimitBytes) {
                                            addToast(`Storage limit reached for ${damTier} tier (${formatStorageSize(storageLimitBytes)}). Please upgrade to upload more.`, 'error');
                                            return;
                                        }
                                        setIsUploadModalOpen(true);
                                    }}
                                    className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1.5 px-2 rounded-md transition-colors flex items-center gap-1 text-sm"
                                >
                                    <CloudUploadIcon className="w-4 h-4" />
                                    Upload
                                </Button>
                                <Button 
                                    onClick={() => {
                                        if (isUploadOnly) {
                                            addToast('AI scanning features require a paid DAM tier. Upgrade to unlock regulatory compliance scanning and AI-powered analysis.', 'error');
                                            return;
                                        }
                                        setIsScanningInterfaceOpen(true);
                                    }}
                                    className="bg-gradient-to-r from-accent-500 to-purple-600 hover:from-accent-600 hover:to-purple-700 text-white font-semibold py-1.5 px-2 rounded-md transition-all duration-200 flex items-center gap-1 shadow-lg text-sm"
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Scanning
                                </Button>
                                {selectedArtworkIds.length > 0 && (
                                    <>
                                        <Button onClick={handleBulkShare} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-2 rounded-md transition-colors flex items-center gap-1 text-sm">
                                            <SendIcon className="w-4 h-4" />
                                            Share ({selectedArtworkIds.length})
                                        </Button>
                                        <Button onClick={handleCreatePo} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-1.5 px-2 rounded-md transition-colors text-sm">
                                            Create PO ({selectedArtworkIds.length})
                                        </Button>
                                    </>
                                )}
                                <Button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="bg-gray-700 hover:bg-gray-600 text-white p-1.5 rounded-md transition-colors"
                                    title="DAM Settings"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </Button>
                            </div>
                        </div>
                        <div className="relative mt-3">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon className="h-5 w-5 text-gray-400" /></div>
                            <input type="text" placeholder="Search by filename, product name, or SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-gray-800/50 border border-gray-700 text-white placeholder-gray-400 rounded-md py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-accent-500 w-full" />
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
                                <p className="text-xs text-accent-400 mt-0.5">{selectedArtworkForDetails.productSku}</p>
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
                                    className="mt-1 w-full bg-gray-900/60 text-white text-sm rounded-md p-2 border border-gray-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400">Notes</label>
                                <textarea
                                    value={metadataDraft.notes}
                                    onChange={e => handleMetadataChange('notes', e.target.value)}
                                    rows={3}
                                    className="mt-1 w-full bg-gray-900/60 text-white text-sm rounded-md p-2 border border-gray-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
                                />
                            </div>
                            <Button
                                onClick={handleMetadataSave}
                                disabled={!metadataDirty || isSavingMetadata}
                                className="w-full bg-accent-500 hover:bg-accent-600 disabled:bg-gray-700 disabled:text-gray-400 text-white font-semibold py-2 px-4 rounded-md transition-colors"
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
                                className="flex items-center justify-center gap-2 w-full bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-4 rounded-md transition-colors"
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
                                                <span className={
                                                    event.channel === 'resend'
                                                        ? 'text-emerald-300'
                                                        : event.channel === 'gmail'
                                                            ? 'text-emerald-200'
                                                            : 'text-yellow-300'
                                                }>
                                                    {event.channel ? event.channel.toUpperCase() : event.sentViaGmail ? 'GMAIL' : 'SIM'}
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
                    bom={effectiveBoms.find(b => b.id === selectedArtworkForScan.bomId)!}
                    onUpdateLink={(link) => onUpdateArtwork(selectedArtworkForScan.id, selectedArtworkForScan.bomId, { regulatoryDocLink: link })}
                    watchlist={watchlist}
                    aiConfig={aiConfig}
                 />
            )}
            
            <BatchArtworkVerificationModal
                isOpen={isBatchVerificationModalOpen}
                onClose={() => setIsBatchVerificationModalOpen(false)}
                boms={effectiveBoms}
                aiConfig={aiConfig}
            />
            
            <ArtworkEditor
                isOpen={Boolean(artworkBeingEdited)}
                artwork={artworkBeingEdited}
                onClose={() => setArtworkBeingEdited(null)}
                onSave={handleSaveEditedArtwork}
            />

            <UploadArtworkModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                boms={effectiveBoms}
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
                storageUsedBytes={storageUsageBytes}
                storageLimitBytes={storageLimitBytes}
                normalizedAssetCount={normalizedAssetCount}
                legacyAssetCount={legacyAssetCount}
                totalAssetCount={totalAssetCount}
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
                defaultCc={damSettings.defaultShareCc}
                allowedDomains={allowedDomainsList}
                onConnectGoogle={onConnectGoogle}
                companyEmailSettings={companyEmailSettings}
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
            data-testid="artwork-card"
            className={`bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border overflow-hidden group flex flex-col cursor-pointer transition-all hover:shadow-xl ${
                isSelected ? 'border-accent-500 ring-2 ring-accent-500/50' : 'border-gray-700 hover:border-gray-600'
            }`}
        >
            <div className="relative aspect-square bg-gray-900 flex items-center justify-center">
                <PhotoIcon className="w-16 h-16 text-gray-600" />
                <input 
                    type="checkbox" 
                    checked={selectedArtworkIds.includes(art.id)} 
                    onChange={(e) => onCheckboxChange(art.id, e.target.checked)} 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-2 left-2 h-5 w-5 rounded bg-gray-700 text-accent-500 focus:ring-accent-500 border-gray-600" 
                />
            </div>
            <div className="p-3 flex-grow">
                <p className="text-sm font-semibold text-white truncate" title={art.fileName}>{art.fileName}</p>
                <p className="text-xs text-gray-400">Rev {art.revision}</p>
                <p className="text-xs text-accent-300 mt-1 truncate" title={art.productName}>{art.productName}</p>
            </div>
             <div className="p-2 bg-gray-800 border-t border-gray-700 space-y-2" onClick={(e) => e.stopPropagation()}>
                <div>
                     <select onChange={handleMove} value={art.folderId || 'unassigned'} className="w-full text-xs bg-gray-700 p-1.5 rounded-md focus:ring-accent-500 focus:border-accent-500 border-gray-600">
                        <option value="unassigned">Move to...</option>
                        {artworkFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                     </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <a href={art.url} download className="flex items-center justify-center gap-1 w-full text-center bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <ArrowDownTrayIcon className="w-4 h-4" /> <span>Download</span>
                    </a>
                    <Button onClick={(e) => { e.stopPropagation(); onScanClick(art); }} className="flex items-center justify-center gap-1 w-full text-center bg-accent-500 hover:bg-accent-600 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <SparklesIcon className="w-4 h-4" /> <span>Scan</span>
                    </Button>
                    <Button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="flex items-center justify-center gap-1 w-full text-center bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors">
                        <PhotoIcon className="w-4 h-4" /> <span>Edit</span>
                    </Button>
                    <Button
                        data-testid="artwork-card-share"
                        onClick={(e) => { e.stopPropagation(); onShare(); }}
                        className="flex items-center justify-center gap-1 w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors"
                    >
                        <SendIcon className="w-4 h-4" /> <span>Share</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default ArtworkPage;
