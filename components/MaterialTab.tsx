import React, { useState, useEffect, useRef } from 'react';
import { ProjectContext, ProposalTier, Item, MaterialSelection, MaterialSelectionStatus, PurchaseOrder, Vendor } from '../types';
import Card from './shared/Card';
import { PlusIcon, CheckIcon, ClockIcon, AlertCircleIcon, TrashIcon, PhotoIcon, EnvelopeIcon, XCircleIcon, SparklesIcon } from './Icons';
import { generateId } from '../lib/utils';
import { extractMaterialsFromText } from '../services/aiService';
import { useOrg } from '../contexts/OrgContext';
import { useStudioSettings } from '../hooks/useStudioSettings';
import { db } from '../services/dbService';
import RaisePOModal from './RaisePOModal';
import OrdersCard from './OrdersCard';
import { 
    sendSelectionNotificationEmail, 
    sendConsolidatedPendingSelectionsEmail,
    getSelectionNotificationEmailHtml,
    getConsolidatedPendingSelectionsEmailHtml
} from '../services/emailService';
import { EmailPreviewModal } from './EmailPreviewModal';

const formatINR = (value: number | undefined | null) => {
    if (value == null) return '';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
};

const getCategoryEmoji = (category: string) => {
    switch (category?.toLowerCase()) {
        case 'laminate':
        case 'veneer':
            return '🪵';
        case 'flooring': return '🏠';
        case 'lighting': return '💡';
        case 'sanitaryware': return '🚿';
        case 'hardware': return '🔩';
        case 'paint': return '🎨';
        case 'fabric': return '🧵';
        default: return '📦';
    }
};

const ChevronDownIcon = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
);

const ChevronUpIcon = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
);

const AlertTriangleIcon = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const CameraIcon = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
);


interface MaterialTabProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeTier?: ProposalTier;
    bank: Item[];
    projectId?: string;
}

const MaterialTab: React.FC<MaterialTabProps> = ({ projectContext, setProjectContext, activeTier, bank, projectId }) => {
    const { orgData } = useOrg();
    const { settings: studioSettings } = useStudioSettings(orgData.tenantId || 'demo-tenant-01');
    const [selections, setSelections] = useState<MaterialSelection[]>(projectContext.materialSelections || []);
    
    const [showDocketPanel, setShowDocketPanel] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const itemNameRef = useRef<HTMLInputElement>(null);
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [activeRoom, setActiveRoom] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState<string>('');
    
    // Tab state for Selections vs Change Requests vs Orders
    const [mainTab, setMainTab] = useState<'selections' | 'change_requests' | 'orders'>('selections');
    const [crStatusFilter, setCrStatusFilter] = useState<'All' | 'Pending Sign-off' | 'Approved' | 'Absorbed' | 'Rejected'>('All');
    
    // Checkbox selection & PO states
    const [selectedSelectionIds, setSelectedSelectionIds] = useState<string[]>([]);
    const [projectPOs, setProjectPOs] = useState<PurchaseOrder[]>([]);
    const [showRaisePO, setShowRaisePO] = useState(false);
    const [loadingPOs, setLoadingPOs] = useState(false);
    const [poTargetSelections, setPoTargetSelections] = useState<MaterialSelection[]>([]);

    // Email notification state variables
    const [sharingSelection, setSharingSelection] = useState<MaterialSelection | null>(null);
    const [isConsolidatedReminder, setIsConsolidatedReminder] = useState<boolean>(false);
    const [emailSendingStatus, setEmailSendingStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [emailError, setEmailError] = useState<string | null>(null);
    const [isEmailPreviewOpen, setIsEmailPreviewOpen] = useState(false);

    const loadPOs = async () => {
        if (!projectId) return;
        setLoadingPOs(true);
        try {
            const list = await db.getPurchaseOrders(projectId);
            setProjectPOs(list);
        } catch (e) {
            console.error('Error loading POs:', e);
        } finally {
            setLoadingPOs(false);
        }
    };

    useEffect(() => {
        loadPOs();
    }, [projectId]);

    const [manualCategorySet, setManualCategorySet] = useState(false);
    const [autoDetectedCategory, setAutoDetectedCategory] = useState<string | null>(null);
    const [isRoomOther, setIsRoomOther] = useState(false);
    const [lastUsedRoom, setLastUsedRoom] = useState<string>('');
    const [customRoom, setCustomRoom] = useState('');
    
    const [quickFillText, setQuickFillText] = useState('');
    const [isQuickFillExpanded, setIsQuickFillExpanded] = useState(typeof window !== 'undefined' && window.innerWidth < 640);
    const [quickFillFlash, setQuickFillFlash] = useState(false);
    
    // New Form Panel State
    const [draftSelection, setDraftSelection] = useState<MaterialSelection | null>(null);
    const [recentVendors, setRecentVendors] = useState<string[]>([]);
    
    const [changeRequestSelection, setChangeRequestSelection] = useState<MaterialSelection | null>(null);
    const [changeReason, setChangeReason] = useState("");

    useEffect(() => {
        const saved = localStorage.getItem('ffds_recent_vendors');
        if (saved) {
            try { setRecentVendors(JSON.parse(saved)); } catch (e) {}
        }
    }, []);

    const saveRecentVendor = (vendor: string) => {
        if (!vendor.trim()) return;
        const newVendors = [vendor.trim(), ...recentVendors.filter(v => v.toLowerCase() !== vendor.trim().toLowerCase())].slice(0, 5);
        setRecentVendors(newVendors);
        localStorage.setItem('ffds_recent_vendors', JSON.stringify(newVendors));
    };

    const migrateSelectionStatus = (status: string) => {
        if (status === 'pending_selection') return 'to_select';
        if (status === 'pending_approval') return 'at_shop';
        if (status === 'approved') return 'locked';
        return status;
    };

    const getStatusDisplay = (status: string) => {
        const migrated = migrateSelectionStatus(status);
        switch (migrated) {
            case 'to_select': return { label: 'To Select', color: 'bg-slate-100 text-slate-600 border-slate-200' };
            case 'at_shop': return { label: 'At Shop', color: 'bg-blue-100 text-blue-800 border-blue-300' };
            case 'sent_for_approval': return { label: 'Options Sent', color: 'bg-amber-100 text-amber-800 border-amber-300' };
            case 'locked': return { label: 'Locked ✓', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
            case 'ordered': return { label: 'Ordered', color: 'bg-teal-100 text-teal-800 border-teal-300' };
            case 'delayed': return { label: 'Delayed', color: 'bg-rose-100 text-rose-800 border-rose-300' };
            case 'change_requested': return { label: 'Change Requested', color: 'bg-rose-100 text-rose-800 border-rose-300' };
            default: return { label: migrated, color: 'bg-slate-100 text-slate-600 border-slate-200' };
        }
    };

    // AI Import State
    const [showImportModal, setShowImportModal] = useState(false);
    const [importText, setImportText] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);

    // Sync local state to project context
    useEffect(() => {
        const totalAbsorbedCost = selections
            .filter(s => s.itemType === 'change_request' && s.boqAbsorbed)
            .reduce((sum, s) => sum + (s.costDelta || 0), 0);
            
        setProjectContext(prev => ({ 
            ...prev, 
            materialSelections: selections,
            totalChangeRequestCost: totalAbsorbedCost 
        }));
    }, [selections, setProjectContext]);

    const csvInputRef = useRef<HTMLInputElement>(null);

    const handleExportTemplate = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "ID,Room,Category,Item Name,Brand,Finish Code,Lead Time (Days)\n";

        const migratedStatus = s => migrateSelectionStatus(s.status);
        const pending = selections.filter(s => migratedStatus(s) === 'to_select');
        pending.forEach(item => {
            const row = [
                item.id,
                `"${item.roomId || ''}"`,
                `"${item.category || ''}"`,
                `"${item.itemName || ''}"`,
                `"${item.brand || ''}"`,
                `"${item.finishCode || ''}"`,
                item.leadTimeDays || 7
            ].join(",");
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "SOF_Field_Collection_Template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            if (!text) return;
            
            const lines = text.split('\n');
            const newSelections = [...selections];
            let updatedCount = 0;
            let addedCount = 0;

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                
                // Split by comma, ignoring commas inside quotes
                const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/^"|"$/g, '').trim());
                if (row.length < 4) continue;

                const id = row[0];
                const room = row[1];
                const category = row[2];
                const itemName = row[3];
                const brand = row[4] || '';
                const finishCode = row[5] || '';
                const leadTime = parseInt(row[6]) || 7;

                const existingIndex = newSelections.findIndex(s => s.id === id);
                if (existingIndex >= 0) {
                    newSelections[existingIndex] = {
                        ...newSelections[existingIndex],
                        brand,
                        finishCode,
                        leadTimeDays: leadTime,
                        status: finishCode ? 'at_shop' : migrateSelectionStatus(newSelections[existingIndex].status) as any
                    };
                    updatedCount++;
                } else {
                    newSelections.push({
                        id: generateId(),
                        roomId: room,
                        category,
                        itemName,
                        brand,
                        finishCode,
                        status: finishCode ? 'at_shop' : 'to_select',
                        leadTimeDays: leadTime,
                        photos: []
                    });
                    addedCount++;
                }
            }
            setSelections(newSelections);
            alert(`Successfully imported! Updated ${updatedCount} items, Added ${addedCount} new items.`);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const getDefaultNewSelectionFields = () => ({
        quotedPrice: null,
        priceUnit: 'per_sqft',
        estimatedQty: null,
        estimatedTotal: null,
        notes: '',
        clientConfirmedAt: null,
        clientConfirmMethod: null,
        confirmationSentAt: null,
        confirmationToken: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        changeRequestedAt: null,
        changeReason: null,
        changeRequestedBy: null,
        previousSelectionSnapshot: null
    });

    const handleNewItem = () => {
        setDraftSelection({
            id: generateId(),
            roomId: lastUsedRoom || (activeRoom !== 'All' ? activeRoom : ''),
            itemName: '',
            category: 'Laminate',
            finishCode: '',
            status: 'at_shop' as any,
            leadTimeDays: 7,
            photos: [],
            ...getDefaultNewSelectionFields()
        });
        setManualCategorySet(false);
        setAutoDetectedCategory(null);
        setIsRoomOther(false);
        setCustomRoom('');
    };
    
    const handleEditItem = (sel: MaterialSelection) => {
        if (migrateSelectionStatus(sel.status) === 'locked') {
            setChangeRequestSelection(sel);
            setChangeReason("");
        } else {
            setDraftSelection({ ...sel });
        }
    };

    const confirmChangeRequest = () => {
        if (!changeRequestSelection || changeReason.length < 20) return;
        
        const updatedSel = {
            ...changeRequestSelection,
            status: 'change_requested' as any,
            changeRequestedAt: new Date().toISOString(),
            changeReason: changeReason,
            changeRequestedBy: 'designer',
            previousSelectionSnapshot: JSON.parse(JSON.stringify(changeRequestSelection))
        };
        
        setSelections(selections.map(s => s.id === updatedSel.id ? updatedSel : s));
        setDraftSelection(updatedSel);
        setChangeRequestSelection(null);
        setChangeReason("");
    };

    const handleDirectApprove = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setSelections(selections.map(s => {
            if (s.id === id) {
                return {
                    ...s,
                    status: 'locked' as any,
                    clientConfirmedAt: new Date().toISOString(),
                    clientConfirmMethod: 'ops_manual_override'
                };
            }
            return s;
        }));
    };

    const handleCreatePOFromSelected = () => {
        const selectedItems = selections.filter(s => selectedSelectionIds.includes(s.id));
        if (selectedItems.length > 0) {
            setPoTargetSelections(selectedItems);
            setShowRaisePO(true);
        }
    };

    const CategoryKeywords: Record<string, string[]> = {
        'Flooring': ['tile', 'marble', 'granite', 'wooden floor', 'carpet', 'rug'],
        'Hardware': ['channel', 'hinge', 'handle', 'knob', 'lock', 'hettich', 'hafele', 'slider'],
        'Lighting': ['light', 'lamp', 'chandelier', 'spotlight', 'led', 'bulb'],
        'Plumbing': ['sink', 'faucet', 'shower', 'tap', 'basin', 'commode', 'wc'],
        'Paint': ['paint', 'color', 'primer', 'texture', 'asian', 'dulux'],
        'Electrical': ['switch', 'socket', 'wire', 'cable', 'mcb', 'board'],
        'Laminate': ['laminate', 'mica', 'sunmica', 'merino', 'greenlam'],
        'Veneer': ['veneer', 'teak', 'walnut', 'oak']
    };

    const updateDraft = (field: keyof MaterialSelection, value: any) => {
        setDraftSelection(prev => {
            if (!prev) return prev;
            const updated = { ...prev, [field]: value };
            
            if (field === 'category') {
                setManualCategorySet(true);
            }
            
            if (field === 'itemName' && !manualCategorySet) {
                const lowerName = String(value).toLowerCase();
                let detected: string | null = null;
                for (const [cat, keywords] of Object.entries(CategoryKeywords)) {
                    if (keywords.some(kw => lowerName.includes(kw))) {
                        detected = cat;
                        break;
                    }
                }
                if (detected) {
                    updated.category = detected;
                    setAutoDetectedCategory(detected);
                } else {
                    setAutoDetectedCategory(null);
                }
            }

            if (field === 'quotedPrice' || field === 'estimatedQty') {
                const p = Number(updated.quotedPrice);
                const q = Number(updated.estimatedQty);
                if (!isNaN(p) && p > 0 && !isNaN(q) && q > 0) {
                    updated.estimatedTotal = Math.round(p * q);
                } else {
                    updated.estimatedTotal = null;
                }
            }
            return updated;
        });
    };

    const handleSmartParse = () => {
        if (!quickFillText) return;
        const txt = quickFillText.toLowerCase();
        let updates: any = {};
        
        // Price extraction
        const rateMatch = txt.match(/₹?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*\/?\s*(sqft|rft|piece|sheet|pc|nos|no|unit|meter|mtr)?/i);
        if (rateMatch && rateMatch[1]) {
            updates.quotedPrice = parseFloat(rateMatch[1].replace(/,/g, ''));
            if (rateMatch[2]) {
                const u = rateMatch[2].toLowerCase();
                if (u === 'sqft') updates.priceUnit = 'per_sqft';
                else if (u === 'rft') updates.priceUnit = 'per_rft';
                else if (['piece', 'pc', 'nos', 'no', 'unit'].includes(u)) updates.priceUnit = 'per_piece';
                else if (u === 'sheet') updates.priceUnit = 'per_sheet';
            }
        }
        
        // Brand & Vendor extraction
        const commonBrands = ['philips', 'havells', 'syska', 'hettich', 'hafele', 'ebco', 'blum', 'kajaria', 'somany', 'simpolo', 'nitco', 'asian paints', 'dulux', 'berger', 'nerolac', 'jaquar', 'kohler', 'toto', 'grohe', 'cera', 'rehau', 'merino', 'greenlam', 'century', 'action tesa', 'royal touche'];
        const foundBrand = commonBrands.find(b => txt.includes(b));
        if (foundBrand) {
            updates.brand = foundBrand.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            updates.vendor = updates.brand + " Showroom";
        }
        
        // Code
        const codeMatch = txt.match(/(?:code|model|no|number|ref)\s*[:=-]?\s*([a-zA-Z0-9_/+-]+)/i) || txt.match(/\b([a-zA-Z0-9]{3,}-\w+)\b/i);
        if (codeMatch && codeMatch[1]) {
            updates.finishCode = codeMatch[1].toUpperCase();
        }
        
        // Category
        let detectedCat = null;
        for (const [cat, keywords] of Object.entries(CategoryKeywords)) {
            if (keywords.some(kw => txt.includes(kw))) {
                detectedCat = cat;
                break;
            }
        }
        if (detectedCat) {
            updates.category = detectedCat;
            setAutoDetectedCategory(detectedCat);
            setManualCategorySet(false);
        }
        
        // Room Match
        const foundRoom = allRoomNames.find(r => txt.includes(r.toLowerCase()));
        if (foundRoom) {
            updates.roomId = foundRoom;
        }

        // Qty Match
        const qtyMatch = txt.match(/(?:qty|quantity|estimated\s*qty|count)\s*[:=-]?\s*(\d+)/i) || txt.match(/(\d+)\s*(?:pcs|pieces|qty|nos|units|sqft|rft)/i);
        if (qtyMatch && qtyMatch[1]) {
            updates.estimatedQty = parseFloat(qtyMatch[1]);
        }

        // Title/Name extraction
        const namePart = quickFillText.split(/,|\.|\s+-|\sat\s/i)[0].trim();
        if (namePart && namePart.length < 50) {
            updates.itemName = namePart;
        }
        
        setDraftSelection(prev => prev ? { ...prev, ...updates } : prev);
        setQuickFillFlash(true);
        setTimeout(() => setQuickFillFlash(false), 800);
    };

    const [shareMessage, setShareMessage] = useState<string | null>(null);

    const handleSaveSelection = (sendNotification: boolean) => {
        if (!draftSelection) return;
        
        if (draftSelection.itemType === 'change_request') {
            const allowZero = studioSettings?.sofSettings?.allowZeroCostChanges !== false;
            const cost = draftSelection.costDelta || 0;
            if (!allowZero && cost === 0) {
                alert('Project settings do not allow zero-cost change requests.');
                return;
            }
        }
        
        if (draftSelection.vendor) saveRecentVendor(draftSelection.vendor);
        if (draftSelection.roomId) setLastUsedRoom(draftSelection.roomId);
        
        let finalSelectionToSave = { ...draftSelection };
        
        if (migrateSelectionStatus(finalSelectionToSave.status) === 'change_requested') {
            finalSelectionToSave.status = 'at_shop' as any;
        }
        
        if (finalSelectionToSave.changeRequestedAt) {
            finalSelectionToSave.changeRequestedAt = null;
            finalSelectionToSave.changeReason = null;
        }

        if (sendNotification) {
            finalSelectionToSave.status = 'sent_for_approval' as any;
            finalSelectionToSave.confirmationSentAt = new Date().toISOString();
            if (!finalSelectionToSave.confirmationToken) {
                finalSelectionToSave.confirmationToken = generateId(); // Reuse utility function for random string
            }
        }

        const exists = selections.find(s => s.id === finalSelectionToSave.id);
        
        // Part D: Change Request Side Effects
        if (finalSelectionToSave.itemType === 'change_request') {
            const threshold = studioSettings?.sofSettings?.changeRequestSignoffThreshold || 5000;
            const cost = finalSelectionToSave.costDelta || 0;
            
            if (cost > threshold) {
                finalSelectionToSave.requiresClientSignoff = true;
                finalSelectionToSave.clientSignoffStatus = 'pending';
                finalSelectionToSave.boqAbsorbed = false;
                finalSelectionToSave.needsSignoffRouting = true;
                console.log(`STUB: Route SOF item ${finalSelectionToSave.id} for client sign-off via Decision Tracker`);
                alert('⏳ Awaiting client sign-off before cost is absorbed');
            } else {
                finalSelectionToSave.clientSignoffStatus = 'not_required';
                finalSelectionToSave.boqAbsorbed = true;
                alert('Change recorded and absorbed into project cost');
            }

            if (finalSelectionToSave.timelineDeltaDays && finalSelectionToSave.timelineDeltaDays > 0) {
                finalSelectionToSave.timelineApplied = false;
                alert(`⚠️ This change adds ${finalSelectionToSave.timelineDeltaDays} days. Review timeline to apply.`);
            }
        }
        
        let newSelections;
        if (exists) {
            newSelections = selections.map(s => s.id === finalSelectionToSave.id ? finalSelectionToSave : s);
        } else {
            newSelections = [finalSelectionToSave, ...selections];
        }
        setSelections(newSelections);
        
        setDraftSelection(null);
        
        if (sendNotification) {
            setSharingSelection(finalSelectionToSave);
            setIsConsolidatedReminder(false);
            setEmailSendingStatus('idle');
            setEmailError(null);

            // Generate WhatsApp message
            const lines = [];
            lines.push(`Hi ${projectContext.clientName || 'Client'},`);
            lines.push('');
            lines.push(`We've logged the following selection for *${projectContext.name}*:`);
            lines.push('');
            lines.push(`📦 *${finalSelectionToSave.itemName}*`);
            
            if (finalSelectionToSave.brand) {
                lines.push(`Brand: ${finalSelectionToSave.brand}${finalSelectionToSave.finishCode ? ' — ' + finalSelectionToSave.finishCode : ''}`);
            } else if (finalSelectionToSave.finishCode) {
                lines.push(`Code/Model: ${finalSelectionToSave.finishCode}`);
            }
            
            if (finalSelectionToSave.vendor) lines.push(`Shop: ${finalSelectionToSave.vendor}`);
            if (finalSelectionToSave.quotedPrice) {
                lines.push(`Price: ₹${finalSelectionToSave.quotedPrice.toLocaleString('en-IN')}/${finalSelectionToSave.priceUnit?.replace('per_', '') || 'unit'}${finalSelectionToSave.estimatedQty ? ' × ' + finalSelectionToSave.estimatedQty + ' = ₹' + (finalSelectionToSave.quotedPrice * finalSelectionToSave.estimatedQty).toLocaleString('en-IN') : ''}`);
            }
            if (finalSelectionToSave.notes) lines.push(`Note: ${finalSelectionToSave.notes}`);
            
            lines.push('');
            lines.push(`Please tap the link below to confirm this selection:`);
            const appUrl = window.location.origin;
            lines.push(`${appUrl}/selection-confirm/${finalSelectionToSave.confirmationToken}`);
            lines.push('');
            lines.push(`If you have any concerns, you can note them on that page.`);
            lines.push('');
            lines.push(`— Form Factors Design Studio`);
            
            setShareMessage(lines.join('\n'));
        }
    };

    const handleSendEmailNotification = async (overrideSubject?: string, overrideHtml?: string) => {
        if (!projectContext.clientEmail) {
            setEmailError('Client email is missing in project settings.');
            setEmailSendingStatus('error');
            return;
        }

        setEmailSendingStatus('sending');
        setEmailError(null);

        try {
            let res;
            if (isConsolidatedReminder) {
                res = await sendConsolidatedPendingSelectionsEmail(
                    projectId || '',
                    pendingSelections,
                    projectContext,
                    orgData.tenantId || 'demo-tenant-01',
                    overrideSubject,
                    overrideHtml
                );
            } else if (sharingSelection) {
                res = await sendSelectionNotificationEmail(
                    projectId || '',
                    sharingSelection,
                    projectContext,
                    orgData.tenantId || 'demo-tenant-01',
                    overrideSubject,
                    overrideHtml
                );
            } else {
                throw new Error('No active selection to send');
            }

            if (res.success) {
                setEmailSendingStatus('sent');
            } else {
                setEmailError(res.error || 'Failed to deliver confirmation email.');
                setEmailSendingStatus('error');
            }
        } catch (err: any) {
            console.error('Error in handleSendEmailNotification:', err);
            setEmailError(err.message || 'An unexpected error occurred.');
            setEmailSendingStatus('error');
        }
    };

    const handleImportText = async () => {
        if (!importText.trim()) return;
        setIsExtracting(true);
        try {
            const extracted = await extractMaterialsFromText(importText);
            if (extracted && extracted.length > 0) {
                const newSelections: MaterialSelection[] = extracted.map(item => ({
                    id: generateId(),
                    roomId: item.roomId,
                    itemName: item.itemName,
                    category: item.category,
                    brand: item.brand,
                    finishCode: item.finishCode,
                    status: 'to_select' as any,
                    leadTimeDays: 7,
                    photos: [],
                    ...getDefaultNewSelectionFields()
                }));
                setSelections([...newSelections, ...selections]);
                setShowImportModal(false);
                setImportText('');
            } else {
                alert("Could not extract any materials from the text.");
            }
        } catch (error) {
            console.error("Error extracting text:", error);
            alert("An error occurred while extracting text.");
        } finally {
            setIsExtracting(false);
        }
    };

    const updateSelection = (id: string, field: keyof MaterialSelection, value: any) => {
        setSelections(selections.map(s => {
            if (s.id !== id) return s;
            const updated = { ...s, [field]: value };
            
            // Auto-calculate estimatedTotal everywhere
            if (field === 'quotedPrice' || field === 'estimatedQty') {
                if (updated.quotedPrice && updated.estimatedQty) {
                    updated.estimatedTotal = Math.round(updated.quotedPrice * updated.estimatedQty);
                } else {
                    updated.estimatedTotal = null;
                }
            }
            return updated;
        }));
    };

    const deleteSelection = (id: string) => {
        setSelections(selections.filter(s => s.id !== id));
    };

    const handleImageUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setSelections(prev => prev.map(s => {
                if (s.id === id) {
                    const currentPhotos = s.photos || [];
                    const currentMig= migrateSelectionStatus(s.status);
                    const newStatus = currentMig === 'to_select' ? 'at_shop' : s.status;
                    return { ...s, photos: [...currentPhotos, reader.result as string], status: newStatus };
                }
                return s;
            }));
            setUploadingId(null);
        };
        reader.readAsDataURL(file);
    };

    const triggerImageUpload = (id: string) => {
        setUploadingId(id);
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleDraftImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !draftSelection) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            updateDraft('photos', [...(draftSelection.photos || []), reader.result as string]);
            setTimeout(() => {
                itemNameRef.current?.focus();
            }, 100);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const triggerDraftImageUpload = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const removePhoto = (selectionId: string, photoIndex: number) => {
        setSelections(prev => prev.map(s => {
            if (s.id === selectionId && s.photos) {
                const newPhotos = [...s.photos];
                newPhotos.splice(photoIndex, 1);
                return { ...s, photos: newPhotos };
            }
            return s;
        }));
    };

    const allRoomNames = Array.from(new Set([
        ...(projectContext.rooms?.map(r => r.name) || []),
        ...selections.map(s => s.roomId).filter(Boolean)
    ]));

    const roomStats = allRoomNames.map(roomId => {
        const roomItems = selections.filter(s => s.roomId === roomId);
        const lockedItems = roomItems.filter(s => migrateSelectionStatus(s.status) === 'locked' || migrateSelectionStatus(s.status) === 'ordered');
        const lockedCount = lockedItems.length;
        const totalCount = roomItems.length;
        const pct = totalCount === 0 ? 0 : (lockedCount / totalCount) * 100;
        return { roomId, lockedCount, totalCount, pct };
    });

    const allItemsLocked = selections.length > 0 && roomStats.every(r => r.totalCount > 0 && r.lockedCount === r.totalCount);
    const totalLockedItems = roomStats.reduce((acc, curr) => acc + curr.lockedCount, 0);

    const [dashboardOpen, setDashboardOpen] = useState(true);

    const normalSelections = selections.filter(s => s.itemType !== 'change_request');
    const filteredSelectionsByRoom = activeRoom === 'All' ? normalSelections : normalSelections.filter(s => s.roomId === activeRoom);
    const filteredSelections = filteredSelectionsByRoom.filter(s => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            s.itemName?.toLowerCase().includes(q) ||
            s.brand?.toLowerCase().includes(q) ||
            s.finishCode?.toLowerCase().includes(q) ||
            s.category?.toLowerCase().includes(q) ||
            s.vendor?.toLowerCase().includes(q) ||
            s.roomId?.toLowerCase().includes(q)
        );
    });
    
    const changeRequests = selections.filter(s => s.itemType === 'change_request');
    const filteredChangeRequests = changeRequests.filter(s => {
        if (crStatusFilter === 'All') return true;
        if (crStatusFilter === 'Pending Sign-off') return s.clientSignoffStatus === 'pending';
        if (crStatusFilter === 'Approved') return s.clientSignoffStatus === 'approved';
        if (crStatusFilter === 'Absorbed') return s.boqAbsorbed === true;
        if (crStatusFilter === 'Rejected') return s.clientSignoffStatus === 'rejected';
        return true;
    });

    const pendingSelections = normalSelections.filter(s => migrateSelectionStatus(s.status) === 'sent_for_approval');
    const itemsToSelect = normalSelections.filter(s => migrateSelectionStatus(s.status) === 'to_select');

    const renderSelectionForm = (isNew: boolean) => {
        if (!draftSelection) return null;
        
        return (
            <div className="space-y-6 bg-[#FCFBF9] border border-[#E4E4E0] rounded-2xl p-6 shadow-sm">
                {/* Header */}
                <div className="flex justify-between items-center pb-4 border-b border-slate-200/60">
                    <div>
                        <span className="text-[10px] font-bold text-[#B89047] tracking-widest uppercase block mb-0.5">
                            {isNew ? 'Create New Selection' : 'Refining Specification'}
                        </span>
                        <h3 className="font-serif text-slate-900 text-sm font-bold">
                            {isNew ? 'Smart Material Entry' : `Editing Selection: ${draftSelection.itemName || 'Unnamed Item'}`}
                        </h3>
                    </div>
                    <button 
                        onClick={() => setDraftSelection(null)}
                        className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 rounded-lg p-2 transition-all shadow-sm"
                        title="Cancel"
                    >
                        <XCircleIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* Smart Paste Block */}
                <div className={`bg-white border ${quickFillFlash ? 'border-emerald-500 ring-2 ring-emerald-50' : 'border-[#E4E4E0]'} rounded-xl p-4 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]`}>
                    <div className="flex items-center gap-2 mb-2">
                        <SparklesIcon className="w-4 h-4 text-[#B89047]" />
                        <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Smart Quick Fill Assistant</span>
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500 leading-normal mb-3">
                        Paste any text from WhatsApp or note (e.g. <code className="bg-slate-50 text-slate-700 px-1 py-0.5 rounded font-mono">Philips LED spot, master bedroom, 12W 3000K, 24 units, ₹350 each</code>) then click Quick Fill.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={quickFillText}
                            onChange={(e) => setQuickFillText(e.target.value)}
                            placeholder="e.g. Kajaria Crema Marfil floor tile, 200 sqft, ₹85/sqft, model KJF-90"
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-850 placeholder-slate-400 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSmartParse();
                                }
                            }}
                        />
                        <button 
                            onClick={handleSmartParse}
                            className="bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white hover:bg-[#0055B3] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-[0.98]"
                        >
                            <SparklesIcon className="w-3.5 h-3.5 text-amber-400" />
                            <span>Quick Fill</span>
                        </button>
                    </div>
                </div>

                {/* Main Form Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Column 1: Core Details */}
                    <div className="space-y-4">
                        {/* ITEM NAME */}
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Item Name *</label>
                            <input 
                                type="text" 
                                ref={itemNameRef}
                                value={draftSelection.itemName || ''}
                                onChange={(e) => updateDraft('itemName', e.target.value)}
                                placeholder="e.g. Living Room Italian Marble"
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* AREA / ROOM */}
                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Area / Room</label>
                                {!isRoomOther ? (
                                    <select 
                                        value={draftSelection.roomId || ''}
                                        onChange={(e) => {
                                            if (e.target.value === '__other__') {
                                                setIsRoomOther(true);
                                                updateDraft('roomId', '');
                                            } else {
                                                updateDraft('roomId', e.target.value);
                                            }
                                        }}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                                    >
                                        <option value="">Select room...</option>
                                        {allRoomNames.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                        <option value="__other__">+ Add custom room...</option>
                                    </select>
                                ) : (
                                    <div className="flex gap-2">
                                        <input 
                                            type="text"
                                            value={customRoom}
                                            onChange={(e) => {
                                                setCustomRoom(e.target.value);
                                                updateDraft('roomId', e.target.value);
                                            }}
                                            placeholder="e.g. Balcony"
                                            className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-850 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                                        />
                                        <button 
                                            onClick={() => {
                                                setIsRoomOther(false);
                                                setCustomRoom('');
                                                updateDraft('roomId', '');
                                            }}
                                            className="text-[10px] text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg px-2 font-bold"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* CATEGORY */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-baseline">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</label>
                                    {autoDetectedCategory && !manualCategorySet && (
                                        <span className="text-[8px] font-extrabold text-[#B89047] uppercase tracking-wider">⚡ AI</span>
                                    )}
                                </div>
                                <select 
                                    value={draftSelection.category}
                                    onChange={(e) => updateDraft('category', e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                                >
                                    <option value="Laminate">Laminate</option>
                                    <option value="Veneer">Veneer</option>
                                    <option value="Flooring">Flooring</option>
                                    <option value="Lighting">Lighting</option>
                                    <option value="Sanitaryware">Sanitaryware</option>
                                    <option value="Hardware">Hardware</option>
                                    <option value="Fabric">Fabric</option>
                                    <option value="Paint">Paint</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        {/* BRAND + CODE */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Brand</label>
                                <input 
                                    type="text" 
                                    value={draftSelection.brand || ''}
                                    onChange={(e) => updateDraft('brand', e.target.value)}
                                    placeholder="e.g. Somany"
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Code / Model</label>
                                <input 
                                    type="text" 
                                    value={draftSelection.finishCode || ''}
                                    onChange={(e) => updateDraft('finishCode', e.target.value)}
                                    placeholder="e.g. SOM-9001"
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* SHOP / VENDOR */}
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Shop / Vendor</label>
                            <input 
                                type="text" 
                                list="vendor-list"
                                value={draftSelection.vendor || ''}
                                onChange={(e) => updateDraft('vendor', e.target.value)}
                                placeholder="e.g. Royal Ceramics"
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Column 2: Specs, Photos, Pricing */}
                    <div className="space-y-4">
                        {/* SPECIFICATION PHOTOS */}
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Photos</label>
                            {(draftSelection.photos && draftSelection.photos.length > 0) ? (
                                <div className="grid grid-cols-4 gap-2">
                                    {draftSelection.photos.map((photo, idx) => (
                                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden group border border-slate-200 bg-white shadow-sm hover:border-[#B89047]/50 transition-colors">
                                            <img src={photo} alt="" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button 
                                                    onClick={() => {
                                                        const p = [...draftSelection.photos!];
                                                        p.splice(idx, 1);
                                                        updateDraft('photos', p);
                                                    }}
                                                    className="bg-rose-500 text-white p-1 rounded-md shadow-sm hover:scale-110 transition-all"
                                                    title="Remove photo"
                                                >
                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {draftSelection.photos.length < 4 && (
                                        <button 
                                            onClick={triggerDraftImageUpload}
                                            className="aspect-square rounded-lg border border-dashed border-slate-300 hover:border-[#B89047] bg-white hover:bg-amber-50/20 transition-all flex flex-col items-center justify-center text-slate-400 hover:text-[#B89047]"
                                        >
                                            <PlusIcon className="w-4 h-4 mb-0.5" />
                                            <span className="text-[8px] font-bold uppercase tracking-wider">Add</span>
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <button 
                                    onClick={triggerDraftImageUpload}
                                    className="w-full bg-white border border-dashed border-slate-200 hover:border-[#B89047]/60 rounded-xl py-5 transition-all flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:text-[#B89047]"
                                >
                                    <CameraIcon className="w-5 h-5 text-slate-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-900">Add Specification Photos</span>
                                </button>
                            )}
                        </div>

                        {/* ESTIMATION & PRICING */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estimation & Pricing</label>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="block text-[9px] font-bold text-slate-500 uppercase">Price</label>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-semibold">₹</span>
                                        <input 
                                            type="number"
                                            value={draftSelection.quotedPrice ?? ''}
                                            onChange={(e) => updateDraft('quotedPrice', parseFloat(e.target.value))}
                                            placeholder="0"
                                            className="w-full bg-white border border-slate-200 rounded-lg pl-5 pr-1.5 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[9px] font-bold text-slate-500 uppercase">Unit</label>
                                    <select 
                                        value={draftSelection.priceUnit || 'per_sqft'}
                                        onChange={(e) => updateDraft('priceUnit', e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-1.5 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                                    >
                                        <option value="per_sqft">/ sqft</option>
                                        <option value="per_rft">/ rft</option>
                                        <option value="per_piece">/ pc</option>
                                        <option value="per_sheet">/ sheet</option>
                                        <option value="lumpsum">lumpsum</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[9px] font-bold text-slate-500 uppercase">Est Qty</label>
                                    <input 
                                        type="number" 
                                        value={draftSelection.estimatedQty ?? ''}
                                        onChange={(e) => updateDraft('estimatedQty', parseFloat(e.target.value))}
                                        placeholder="Qty"
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-sky-950 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="bg-[#1E293B] text-white p-3 rounded-lg flex items-center justify-between mt-2">
                                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Est. Total Cost</span>
                                <span className="text-sm font-black font-mono tracking-tight text-amber-400">
                                    {draftSelection.estimatedTotal != null ? formatINR(draftSelection.estimatedTotal) : "—"}
                                </span>
                            </div>
                        </div>

                        {/* DESIGNER PRIVATE NOTES */}
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Private Designer Notes</label>
                            <textarea 
                                rows={2}
                                value={draftSelection.notes || ''}
                                onChange={(e) => updateDraft('notes', e.target.value)}
                                placeholder="Add private notes, vendor info, or follow-up details..."
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-sky-950 outline-none resize-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-slate-200/60 gap-3">
                    <div>
                        {!isNew && (
                            <button 
                                onClick={() => {
                                    if (window.confirm("Are you sure you want to delete this selection? This action is irreversible.")) {
                                        deleteSelection(draftSelection.id);
                                        setDraftSelection(null);
                                    }
                                }}
                                className="flex items-center gap-1.5 text-rose-500 text-xs font-bold hover:text-rose-700 hover:bg-rose-50 px-3 py-2 rounded-lg transition-all"
                            >
                                <TrashIcon className="w-3.5 h-3.5" /> 
                                <span>Delete Selection</span>
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <button 
                            onClick={() => setDraftSelection(null)}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-150 border border-slate-200 transition-colors bg-white"
                        >
                            Discard
                        </button>
                        <button 
                            onClick={() => handleSaveSelection(false)}
                            className="flex-1 sm:flex-none bg-white hover:bg-slate-50 text-slate-800 font-bold px-4 py-2 rounded-lg border border-slate-200 transition-colors text-xs flex items-center justify-center gap-1.5 active:scale-[0.99]"
                        >
                            Save Only
                        </button>
                        <button 
                            onClick={() => handleSaveSelection(true)}
                            className="flex-1 sm:flex-none bg-[#0066CC]/90 backdrop-blur-md border border-white/20 hover:bg-[#0055B3] text-white font-bold px-5 py-2.5 rounded-lg transition-all shadow-md text-xs flex items-center justify-center gap-1.5 active:scale-[0.99]"
                        >
                            <CheckIcon className="w-3.5 h-3.5 text-amber-400" />
                            <span>Save & Notify Client</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <datalist id="room-list">
                {allRoomNames.map(room => <option key={room} value={room} />)}
            </datalist>

            {/* Premium Sophisticated Header Row */}
            <div className="flex flex-wrap items-center justify-end gap-2.5 w-full pb-4 border-b border-slate-100">
                <button 
                        onClick={handleExportTemplate}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 bg-white text-slate-700 border border-slate-200 px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                        title="Download an Excel/CSV template for field agents to fill out"
                    >
                        Export Template
                    </button>
                    <button 
                        onClick={() => csvInputRef.current?.click()}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 bg-white text-slate-700 border border-slate-200 px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                        title="Import a filled Excel/CSV template from the field"
                    >
                        Import CSV
                    </button>
                    <input 
                        type="file" 
                        ref={csvInputRef} 
                        className="hidden" 
                        accept=".csv" 
                        onChange={handleImportCSV} 
                    />
                    <button 
                        onClick={() => setShowImportModal(true)}
                        className="flex-1 lg:flex-none flex items-center justify-gray-700 gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-amber-100/50 transition-colors"
                    >
                        <SparklesIcon className="w-4 h-4 text-[#B89047]" /> AI Paste
                    </button>
                    {pendingSelections.length > 0 && (
                        <button 
                            onClick={async () => {
                                setIsConsolidatedReminder(true);
                                setSharingSelection(null);
                                setEmailSendingStatus('idle');
                                setEmailError(null);

                                const lines = [];
                                lines.push(`Hi ${projectContext.clientName || 'Client'}, just a reminder — the following selections are awaiting your confirmation for *${projectContext.name || 'your project'}*:`);
                                lines.push('');
                                pendingSelections.forEach(item => {
                                    lines.push(`▪ ${item.itemName}${item.brand ? ' — ' + item.brand : ''}${item.quotedPrice ? ' — ₹' + item.quotedPrice.toLocaleString('en-IN') : ''}: ${window.location.origin}/selection-confirm/${item.confirmationToken}`);
                                });
                                lines.push('');
                                lines.push('Please review and confirm at your earliest convenience.');
                                setShareMessage(lines.join('\n'));
                            }}
                            className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 bg-rose-50 text-rose-700 border border-rose-100 px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors"
                            title="Send consolidated reminder"
                        >
                            <EnvelopeIcon className="w-4 h-4" /> Remind Pending
                        </button>
                    )}
                    <button 
                        onClick={() => setShowDocketPanel(true)}
                        className="flex-grow lg:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-sm"
                    >
                        <EnvelopeIcon className="w-4 h-4 text-slate-400" />
                        Docket ({pendingSelections.length})
                    </button>
                    <button 
                        onClick={handleNewItem}
                        className="flex-grow lg:flex-none flex items-center justify-center gap-1.5 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#0055B3] transition-all shadow-sm"
                    >
                        <PlusIcon className="w-4 h-4" /> Add Selection
                    </button>
            </div>

            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                capture="environment"
                onChange={(e) => {
                    if (draftSelection) {
                        handleDraftImageUpload(e);
                    } else if (uploadingId) {
                        handleImageUpload(uploadingId, e);
                    }
                }} 
            />

            {/* AI Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-sky-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <SparklesIcon className="w-6 h-6 text-[#0066CC]" />
                                    Import from Message
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Paste a WhatsApp message or email from the team. AI will extract the items.</p>
                            </div>
                            <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 bg-white rounded-full p-1 shadow-sm border border-slate-200">
                                <XCircleIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6">
                            <textarea 
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder="e.g. 'Hey, I'm at Royal Touche. For the Master Bedroom Wardrobe, let's go with 8765-SF. Also for the Living Room TV Unit, veneer model X looks good.'"
                                className="w-full h-48 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0066CC] focus:border-[#0066CC] outline-none resize-none text-slate-700"
                            />
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button 
                                onClick={() => setShowImportModal(false)}
                                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleImportText}
                                disabled={isExtracting || !importText.trim()}
                                className={`px-5 py-2.5 rounded-xl font-bold text-white flex items-center gap-2 transition-all shadow-sm ${
                                    isExtracting || !importText.trim() ? 'bg-sky-400 cursor-not-allowed' : 'bg-[#0066CC] hover:bg-[#0055B3]'
                                }`}
                            >
                                {isExtracting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Extracting...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Extract & Add Items
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selections.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center mt-6">
                    <div className="w-16 h-16 bg-[#FCFBF9] border border-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CameraIcon className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2 font-serif">Start your first selection</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mb-8 text-xs">
                        Tap the + button to capture materials, samples, or finishes at the shop and sync them to your digital catalog.
                    </p>
                    <button 
                        onClick={handleNewItem}
                        className="bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white px-8 py-3.5 rounded-xl text-xs font-bold hover:bg-[#0055B3] transition-all shadow-sm"
                    >
                        Add first selection
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Sovereign Key Metrics Continuous Banner */}
                    <div className="grid grid-cols-2 md:grid-cols-4 bg-[#FCFBF9] border border-slate-200/60 rounded-xl divide-y md:divide-y-0 md:divide-x divide-slate-200/60 overflow-hidden shadow-sm">
                        <div className="p-4 flex flex-col justify-center">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Total Catalog Items</span>
                            <span className="text-xl font-extrabold text-slate-900 mt-1">{normalSelections.length} <span className="text-xs font-semibold text-slate-400 font-sans">items</span></span>
                        </div>
                        <div className="p-4 flex flex-col justify-center">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Confirmed & Locked</span>
                            <span className="text-xl font-extrabold text-emerald-700 mt-1">{totalLockedItems} <span className="text-xs font-semibold text-slate-400 font-sans">approved</span></span>
                        </div>
                        <div className="p-4 flex flex-col justify-center">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Pending Decision</span>
                            <span className="text-xl font-extrabold text-amber-700 mt-1">{pendingSelections.length} <span className="text-xs font-semibold text-slate-400 font-sans">awaiting</span></span>
                        </div>
                        <div className="p-4 flex flex-col justify-center">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Committed PO Volume</span>
                            <span className="text-xl font-extrabold text-slate-900 mt-1">
                                {formatINR(projectPOs.reduce((sum, po) => sum + po.total, 0)) || "₹0"}
                            </span>
                        </div>
                    </div>

                    {/* Main Tabs */}
                    <div className="flex gap-6 border-b border-slate-200">
                        <button 
                            className={`pb-4 text-[12px] uppercase tracking-wider font-bold transition-colors ${mainTab === 'selections' ? 'text-slate-900 border-b-2 border-[#0055B3]' : 'text-slate-400 hover:text-slate-700'}`}
                            onClick={() => setMainTab('selections')}
                        >
                            Observations & Selections
                        </button>
                        <button 
                            className={`pb-4 text-[12px] uppercase tracking-wider font-bold transition-colors flex items-center gap-2 ${mainTab === 'change_requests' ? 'text-rose-700 border-b-2 border-rose-700' : 'text-slate-400 hover:text-slate-700'}`}
                            onClick={() => setMainTab('change_requests')}
                        >
                            Change Requests
                            {changeRequests.length > 0 && (
                                <span className="bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5 rounded text-[10px]">{changeRequests.length}</span>
                            )}
                        </button>
                        <button 
                            className={`pb-4 text-[12px] uppercase tracking-wider font-bold transition-colors flex items-center gap-2 ${mainTab === 'orders' ? 'text-slate-900 border-b-2 border-[#0055B3]' : 'text-slate-400 hover:text-slate-700'}`}
                            onClick={() => setMainTab('orders')}
                        >
                            Orders (POs)
                            {projectPOs.length > 0 && (
                                <span className="bg-sky-50 text-[#0055B3] border border-sky-200 px-1.5 py-0.5 rounded text-[10px]">{projectPOs.length}</span>
                            )}
                        </button>
                    </div>

                    {mainTab === 'selections' && (
                        <div className="space-y-6">

                            {/* Horizontal Rooms / Area Directory (Luxury architect chips) */}
                            <div className="bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Area Directory Filter</span>
                                    <span className="text-[11px] font-semibold text-slate-500">
                                        Active: <span className="text-slate-900 font-bold">{activeRoom === 'All' ? 'All Spaces' : activeRoom}</span>
                                    </span>
                                </div>
                                
                                <div className="flex gap-2 overflow-x-auto pb-1.5 custom-scrollbar scroll-smooth">
                                    <button
                                        onClick={() => setActiveRoom('All')}
                                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap border shrink-0 ${
                                            activeRoom === 'All' 
                                            ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white border-[#0055B3] shadow-sm' 
                                            : 'bg-[#FCFBF9] text-slate-700 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span>All Areas</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${activeRoom === 'All' ? 'bg-sky-900 text-sky-100' : 'bg-slate-200/50 text-slate-600'}`}>
                                                {normalSelections.length}
                                            </span>
                                        </div>
                                    </button>

                                    {roomStats.map(stat => {
                                        const isSelected = activeRoom === stat.roomId;
                                        return (
                                            <button
                                                key={stat.roomId}
                                                onClick={() => setActiveRoom(isSelected ? 'All' : stat.roomId)}
                                                className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap border shrink-0 ${
                                                    isSelected 
                                                    ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white border-[#0055B3] shadow-sm' 
                                                    : 'bg-[#FCFBF9] text-slate-700 border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span>{stat.roomId}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isSelected ? 'bg-sky-900 text-sky-100' : 'bg-slate-200/50 text-slate-600'}`}>
                                                        {stat.lockedCount}/{stat.totalCount}
                                                    </span>
                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stat.pct === 100 ? '#10B981' : stat.pct > 0 ? '#F59E0B' : '#94A3B8' }} />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* Unified Search and Action Bar */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/60 p-4 rounded-xl shadow-sm">
                                <div className="relative flex-1">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Search by name, brand, category, room, or finish code..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-[#FCFBF9] text-xs font-semibold text-slate-900 placeholder-slate-400 pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-950 focus:border-[#0055B3] transition-all"
                                    />
                                    {searchQuery && (
                                        <button 
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-900 transition-colors"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 self-end sm:self-auto">
                                    {selectedSelectionIds.length > 0 && (
                                        <button
                                            onClick={handleCreatePOFromSelected}
                                            className="bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white px-4 py-2.5 rounded-lg text-xs font-bold hover:bg-[#0055B3] transition-all shadow-sm flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
                                        >
                                            Create PO ({selectedSelectionIds.length})
                                        </button>
                                    )}
                                    <span className="text-[11px] font-semibold text-slate-500 bg-[#FCFBF9] border border-slate-200 px-3 py-2.5 rounded-lg">
                                        Showing <span className="text-slate-900 font-bold">{filteredSelections.length}</span> items
                                    </span>
                                </div>
                            </div>

                                {filteredSelections.length === 0 ? (
                                    <div className="bg-white border border-slate-200/60 rounded-xl p-12 text-center shadow-sm">
                                        <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <PlusIcon className="w-5 h-5 text-slate-400" />
                                        </div>
                                        <h4 className="text-sm font-bold text-slate-900">No selections in this area</h4>
                                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Click "Add Selection" or use the excel template to import selections directly from shop visits.</p>
                                        <button 
                                            onClick={handleNewItem}
                                            className="mt-4 bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                                        >
                                            Add First Item
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24 lg:pb-0">
                                        {filteredSelections.map(selection => {
                                            if (false && draftSelection && draftSelection.id === selection.id) {
                                                return (
                                                    <div key={selection.id} className="col-span-1 md:col-span-2 lg:col-span-3 animate-in zoom-in-95 duration-200">
                                                        {renderSelectionForm(false)}
                                                    </div>
                                                );
                                            }
                                            const statusMigrated = migrateSelectionStatus(selection.status);
                                            const statusDisplay = getStatusDisplay(selection.status);
                                            
                                            // Make status display extremely professional and sober:
                                            const getPillStyles = (status: string) => {
                                                switch (status) {
                                                    case 'to_select':
                                                        return 'bg-slate-50 text-slate-600 border-slate-200/60';
                                                    case 'at_shop':
                                                        return 'bg-amber-50/60 text-amber-800 border-amber-200/40';
                                                    case 'sent_for_approval':
                                                        return 'bg-amber-50/60 text-amber-800 border-amber-200/40';
                                                    case 'locked':
                                                        return 'bg-emerald-50/60 text-emerald-800 border-emerald-200/40';
                                                    case 'ordered':
                                                        return 'bg-sky-50/60 text-sky-800 border-sky-200/40';
                                                    case 'change_requested':
                                                        return 'bg-rose-50/60 text-rose-800 border-rose-200/40';
                                                    default:
                                                        return 'bg-slate-50 text-slate-600 border-slate-200';
                                                }
                                            };

                                            return (
                                                <div 
                                                    key={selection.id} 
                                                    onClick={() => handleEditItem(selection)} 
                                                    className={`bg-white border rounded-xl overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-md relative flex flex-col justify-between ${
                                                        statusMigrated === 'change_requested' 
                                                        ? 'border-rose-200 hover:border-rose-300 border-t-2 border-t-rose-500' 
                                                        : statusMigrated === 'at_shop' 
                                                        ? 'border-amber-400/80 border-t-2 border-t-amber-500' 
                                                        : 'border-slate-200 hover:border-slate-300 border-t-2 border-t-[#B89047]'
                                                    }`}
                                                >
                                                    <div className="flex flex-col p-4 flex-grow justify-between gap-4 hover:bg-slate-50/20 transition-colors">
                                                         {/* Header section of individual card */}
                                                        <div className="flex items-start gap-3 justify-between w-full">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                {/* Checkbox for PO Selection */}
                                                                <div 
                                                                    className="flex items-center" 
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <input 
                                                                        type="checkbox"
                                                                        checked={selectedSelectionIds.includes(selection.id)}
                                                                        onChange={(e) => {
                                                                            const checked = e.target.checked;
                                                                            if (checked) {
                                                                                setSelectedSelectionIds(prev => [...prev, selection.id]);
                                                                            } else {
                                                                                setSelectedSelectionIds(prev => prev.filter(id => id !== selection.id));
                                                                            }
                                                                        }}
                                                                        className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500/20 cursor-pointer accent-amber-600"
                                                                    />
                                                                </div>

                                                                {/* Details */}
                                                                <div className="min-w-0">
                                                                    <div className="font-bold text-[14px] text-slate-900 truncate tracking-tight font-serif">
                                                                        {selection.itemName || 'Untitled Item'}
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">
                                                                        {selection.category}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${getPillStyles(statusMigrated)}`}>
                                                                {statusDisplay.label}
                                                            </span>
                                                        </div>

                                                        {/* Center Spec Details */}
                                                        <div className="flex gap-3 items-center mt-1 w-full">
                                                            {/* Thumbnail */}
                                                            <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-[#FCFBF9] border border-slate-200/60 flex items-center justify-center shadow-sm">
                                                                {selection.photos?.[0] ? (
                                                                    <img src={selection.photos[0]} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                                                ) : (
                                                                    <span className="text-lg">{getCategoryEmoji(selection.category)}</span>
                                                                )}
                                                            </div>

                                                            <div className="flex flex-col min-w-0 text-[11px] text-slate-500">
                                                                <div className="truncate">
                                                                    <span className="font-semibold text-slate-700">Brand:</span> {selection.brand || '—'}
                                                                </div>
                                                                {selection.finishCode && (
                                                                    <div className="truncate mt-0.5">
                                                                        <span className="font-semibold text-slate-700">Finish Code:</span> <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded border border-slate-100">{selection.finishCode}</span>
                                                                    </div>
                                                                )}
                                                                {selection.roomId && (
                                                                    <div className="truncate mt-0.5">
                                                                        <span className="font-semibold text-slate-700">Room/Space:</span> <span className="text-slate-900 font-bold">{selection.roomId}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Footer Pricing Row */}
                                                        {selection.quotedPrice != null && (
                                                            <div className="bg-[#FCFBF9] border border-slate-200/50 p-2.5 rounded-lg mt-2 flex flex-col gap-1 text-[11px] text-slate-500 font-medium w-full">
                                                                <div className="flex justify-between items-center text-[10px] text-slate-400">
                                                                    <span>Vendor: <span className="text-slate-600 font-semibold">{selection.vendor || 'Unknown shop'}</span></span>
                                                                    <span>{selection.estimatedQty || 0} qty</span>
                                                                </div>
                                                                <div className="flex justify-between items-center border-t border-slate-100/60 pt-1.5 mt-1">
                                                                    <span className="text-slate-800 font-bold">{formatINR(selection.quotedPrice)}/{selection.priceUnit?.replace('per_', '')}</span>
                                                                    <span className="text-slate-900 font-bold text-xs">{formatINR(selection.estimatedTotal)}</span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Action Items */}
                                                        {statusMigrated === 'sent_for_approval' && (
                                                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100/60 w-full">
                                                                <span className="flex items-center gap-1 text-[10px] text-amber-700 font-bold">
                                                                    <ClockIcon className="w-3.5 h-3.5 text-amber-500" /> Awaiting Confirmation
                                                                </span>
                                                                <button 
                                                                    onClick={(e) => handleDirectApprove(e, selection.id)}
                                                                    className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                                                >
                                                                    <CheckIcon className="w-3 h-3" /> Approve Direct
                                                                </button>
                                                            </div>
                                                        )}
                                                        
                                                        {statusMigrated === 'locked' && (
                                                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100/60 text-[10px] w-full">
                                                                <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50/50 px-2 py-0.5 rounded border border-emerald-100/50">
                                                                    <CheckIcon className="w-3.5 h-3.5 text-emerald-500" /> Confirmed & Locked
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {statusMigrated === 'change_requested' && selection.previousSelectionSnapshot && (
                                                        <div className="bg-rose-50/40 border-t border-rose-100/60 p-3 text-xs flex gap-2 items-center justify-between">
                                                            <div className="min-w-0">
                                                                <div className="text-rose-800 font-semibold truncate">
                                                                    Changed from: {selection.previousSelectionSnapshot.itemName} ({selection.previousSelectionSnapshot.brand || 'No brand'})
                                                                </div>
                                                                {selection.changeReason && (
                                                                    <div className="text-rose-600/80 text-[10px] mt-0.5 truncate" title={selection.changeReason}>
                                                                        Reason: {selection.changeReason}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-rose-700 font-extrabold uppercase shrink-0 bg-rose-100/50 px-1.5 py-0.5 rounded border border-rose-200/50">
                                                                Pending Review
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                    )}

                    {mainTab === 'change_requests' && (
                        <div className="space-y-6">
                            {/* Dashboard Summary Bar */}
                            <div className="bg-gradient-to-br from-rose-50 to-white p-6 rounded-3xl border border-rose-100 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <div className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-1">Pending Cost Impact</div>
                                    <div className="text-2xl font-black text-rose-700">
                                        {formatINR(changeRequests.filter(cr => cr.clientSignoffStatus === 'pending').reduce((sum, cr) => sum + (cr.costDelta || 0), 0))}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-sky-500 uppercase tracking-widest mb-1">Absorbed Cost</div>
                                    <div className="text-2xl font-black text-sky-700">
                                        {formatINR(changeRequests.filter(cr => cr.boqAbsorbed).reduce((sum, cr) => sum + (cr.costDelta || 0), 0))}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">Pending Timeline Shifts</div>
                                    <div className="text-2xl font-black text-amber-700">
                                        +{changeRequests.filter(cr => cr.timelineDeltaDays && !cr.timelineApplied).reduce((sum, cr) => sum + (cr.timelineDeltaDays || 0), 0)} days
                                    </div>
                                </div>
                            </div>
                            
                            {/* Status Filters */}
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                {['All', 'Pending Sign-off', 'Approved', 'Absorbed', 'Rejected'].map(status => (
                                    <button
                                        key={status}
                                        onClick={() => setCrStatusFilter(status as any)}
                                        className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                                            crStatusFilter === status ? 'bg-sky-900 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        {status}
                                    </button>
                                ))}
                            </div>

                            {/* CR List */}
                            <div className="space-y-3 pb-24 sm:pb-0">
                                {filteredChangeRequests.length === 0 && (
                                    <div className="text-center p-8 text-slate-500 italic bg-white border border-slate-200 rounded-2xl">
                                        No change requests found.
                                    </div>
                                )}
                                {filteredChangeRequests.map(cr => (
                                    <div key={cr.id} onClick={() => handleEditItem(cr)} className="bg-white border hover:shadow-md cursor-pointer border-slate-200 rounded-2xl p-4 transition-all">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <div className="font-bold text-slate-800">{cr.itemName || 'Untitled Change'}</div>
                                                <div className="text-xs text-slate-500 mt-1">{cr.notes || 'No description provided'}</div>
                                            </div>
                                            <div className="text-right flex flex-col gap-1 items-end">
                                                {cr.costDelta != null && (
                                                    <span className={`font-black text-sm ${cr.costDelta < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {cr.costDelta >= 0 ? '+' : ''}{formatINR(cr.costDelta)}
                                                    </span>
                                                )}
                                                {cr.timelineDeltaDays ? (
                                                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">+{cr.timelineDeltaDays} days</span>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 flex-wrap">
                                            {cr.clientSignoffStatus === 'pending' && <span className="bg-rose-50 text-rose-700 font-bold px-2 py-1 rounded text-xs leading-none">⏳ Pending Sign-off</span>}
                                            {cr.clientSignoffStatus === 'approved' && <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded text-xs leading-none">✅ Approved</span>}
                                            {cr.clientSignoffStatus === 'rejected' && <span className="bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded text-xs leading-none">❌ Rejected</span>}
                                            {cr.boqAbsorbed && <span className="bg-sky-50 text-sky-700 border border-sky-200 font-bold px-2 py-1 rounded text-xs leading-none">💰 Cost Absorbed</span>}
                                            {cr.timelineApplied && <span className="bg-purple-50 text-purple-700 border border-purple-200 font-bold px-2 py-1 rounded text-xs leading-none">📅 Timeline Adjusted</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {mainTab === 'orders' && (
                        <div className="space-y-6">
                            {/* Orders Overview Dashboard */}
                            <div className="bg-gradient-to-br from-sky-50 to-white p-6 rounded-3xl border border-sky-100 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">POs Raised</div>
                                    <div className="text-2xl font-black text-slate-900">
                                        {projectPOs.length} <span className="text-xs font-semibold text-slate-500">orders</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Committed</div>
                                    <div className="text-2xl font-black text-slate-900">
                                        ₹{projectPOs.reduce((sum, po) => sum + po.total, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </div>
                                </div>
                                <div className="flex flex-col justify-between">
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Paid</div>
                                        <div className="text-2xl font-black text-emerald-600">
                                            ₹{projectPOs.reduce((sum, po) => sum + (po.payments?.reduce((s, pay) => s + pay.amount, 0) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">Project Purchase Orders</h4>
                                <button
                                    onClick={() => {
                                        setPoTargetSelections([]);
                                        setShowRaisePO(true);
                                    }}
                                    className="bg-[#0066CC] hover:bg-[#0055B3] text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-sky-100 flex items-center gap-1.5"
                                >
                                    <PlusIcon className="w-3.5 h-3.5" /> New Custom PO
                                </button>
                            </div>

                            {loadingPOs ? (
                                <div className="text-center py-12 text-sm text-slate-400">Loading purchase orders...</div>
                            ) : projectPOs.length === 0 ? (
                                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <EnvelopeIcon className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <h5 className="text-sm font-bold text-slate-900 mb-1">No Purchase Orders raised yet</h5>
                                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                                        Select items from your shop visits to raise a PO, or create a custom PO above.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {projectPOs.map(po => {
                                        const paidTotal = po.payments?.reduce((s, p) => s + p.amount, 0) || 0;
                                        return (
                                            <OrdersCard 
                                                key={po.id} 
                                                po={po} 
                                                paidTotal={paidTotal}
                                                projectId={projectId!}
                                                onUpdate={() => loadPOs()}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Draft Docket Panel */}
            {showDocketPanel && (
                <div className="fixed inset-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-sm z-50 flex justify-end">
                    <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">Draft Docket</h3>
                                <p className="text-sm text-slate-500">Shop visit prep & pending selections</p>
                            </div>
                            <button onClick={() => setShowDocketPanel(false)} className="text-slate-400 hover:text-slate-600 bg-white rounded-full p-1 shadow-sm border border-slate-200">
                                <XCircleIcon className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-8">
                            
                            {/* Section 1: Pre-visit agenda */}
                            <section>
                                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs">1</span>
                                    Items to select at the next shop visit
                                </h4>
                                
                                {itemsToSelect.length === 0 ? (
                                    <div className="text-sm text-slate-500 italic bg-white p-4 rounded-xl border border-slate-200 text-center">
                                        No items pending selection.
                                    </div>
                                ) : (
                                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                        {Object.entries<MaterialSelection[]>(
                                            itemsToSelect.reduce((acc, item) => {
                                                acc[item.category] = acc[item.category] || [];
                                                acc[item.category].push(item);
                                                return acc;
                                            }, {} as Record<string, MaterialSelection[]>)
                                        ).map(([category, items]) => (
                                            <div key={category} className="border-b border-slate-100 last:border-0">
                                                <div className="bg-slate-50 px-4 py-2 font-bold text-xs text-slate-600 uppercase tracking-widest flex items-center gap-2">
                                                    <span>{getCategoryEmoji(category)}</span> {category}
                                                </div>
                                                <ul className="divide-y divide-slate-50">
                                                    {items.map(item => (
                                                        <li key={item.id} className="px-4 py-3 text-sm flex justify-between">
                                                            <span className="font-medium text-slate-800">{item.itemName}</span>
                                                            <span className="text-slate-400 text-xs">{item.roomId}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                        <div className="p-4 bg-slate-50 border-t border-slate-100">
                                            <button 
                                                onClick={() => {
                                                    const itemsByCategory = itemsToSelect.reduce((acc, item) => {
                                                        acc[item.category] = acc[item.category] || [];
                                                        acc[item.category].push(item);
                                                        return acc;
                                                    }, {} as Record<string, MaterialSelection[]>);
                                                    
                                                    const lines = [];
                                                    lines.push(`Hi ${projectContext.clientName || 'Client'}, here's what we'll be selecting during our next shop visit for *${projectContext.name || 'your project'}*:`);
                                                    lines.push('');
                                                    Object.entries<MaterialSelection[]>(itemsByCategory).forEach(([category, items]) => {
                                                        lines.push(`*${category}*`);
                                                        items.forEach(item => {
                                                            lines.push(`• ${item.itemName} (${item.roomId})`);
                                                        });
                                                        lines.push('');
                                                    });
                                                    lines.push('We\'ll send you photos and prices from the shop for your approval.');
                                                    setShareMessage(lines.join('\n'));
                                                }}
                                                className="w-full flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 py-3 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-colors"
                                            >
                                                Send agenda to client
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* Section 2: Awaiting your confirmation */}
                            <section>
                                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs">2</span>
                                    Pending Client Approval
                                </h4>
                                
                                {pendingSelections.length === 0 ? (
                                    <div className="text-sm text-slate-500 italic bg-white p-4 rounded-xl border border-slate-200 text-center">
                                        No selections currently waiting for approval.
                                    </div>
                                ) : (
                                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                        <ul className="divide-y divide-slate-100">
                                            {pendingSelections.map(item => {
                                                const daysSent = item.confirmationSentAt ? Math.floor((new Date().getTime() - new Date(item.confirmationSentAt).getTime()) / (1000 * 3600 * 24)) : 0;
                                                return (
                                                    <li key={item.id} className="p-4 flex flex-col gap-3">
                                                        <div className="flex gap-3 items-center">
                                                            <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200 shadow-sm">
                                                                {item.photos?.[0] ? <img src={item.photos[0]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">{getCategoryEmoji(item.category)}</div>}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-bold text-sm text-slate-800 truncate">{item.itemName}</div>
                                                                <div className="text-xs text-slate-500 truncate">{item.quotedPrice ? `₹${item.quotedPrice.toLocaleString('en-IN')}` : 'No price'}</div>
                                                            </div>
                                                            <div className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded">
                                                                {daysSent === 0 ? 'Today' : `${daysSent}d ago`}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end mt-1">
                                                            <button 
                                                                onClick={(e) => handleDirectApprove(e, item.id)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 w-full transition-colors"
                                                            >
                                                                <CheckIcon className="w-4 h-4" /> Verify & Mark Approved
                                                            </button>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        <div className="p-4 bg-slate-50 border-t border-slate-100">
                                            <button 
                                                onClick={() => {
                                                    const lines = [];
                                                    lines.push(`Hi ${projectContext.clientName || 'Client'}, just a reminder — the following selections are awaiting your confirmation for *${projectContext.name || 'your project'}*:`);
                                                    lines.push('');
                                                    pendingSelections.forEach(item => {
                                                        lines.push(`▪ ${item.itemName}${item.brand ? ' — ' + item.brand : ''}${item.quotedPrice ? ' — ₹' + item.quotedPrice.toLocaleString('en-IN') : ''}: ${window.location.origin}/selection-confirm/${item.confirmationToken}`);
                                                    });
                                                    lines.push('');
                                                    lines.push('Please review and confirm at your earliest convenience.');
                                                    setShareMessage(lines.join('\n'));
                                                }}
                                                className="w-full flex items-center justify-center gap-2 bg-[#0066CC] text-white py-3 rounded-xl font-bold shadow-sm hover:bg-[#0055B3] transition-colors"
                                            >
                                                Send consolidated reminder
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </section>

                        </div>
                    </div>
                </div>
            )}

            {/* Proper Elegant Centered Modal Window for Material Entry & Refinement */}
            {draftSelection && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[6px] overflow-y-auto animate-in fade-in duration-200">
                    <div className="w-full max-w-3xl bg-[#FCFBF9] rounded-2xl border border-[#E4E4E0] border-t-4 border-t-[#B89047] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
                        <div className="overflow-y-auto custom-scrollbar p-1">
                            {renderSelectionForm(!selections.some(s => s.id === draftSelection.id))}
                        </div>
                    </div>
                </div>
            )}

            {/* Slide-Up / Drawer Panel for Editing (Bypassed in favor of Proper Modal Window) */}
            {false && draftSelection && (
                <div className="fixed inset-0 z-[100] flex sm:justify-end bg-slate-900/40 backdrop-blur-[2px] sm:items-stretch flex-col sm:flex-row">
                    <div className="w-full sm:w-[520px] h-[92vh] sm:h-full mt-auto sm:mt-0 bg-white sm:rounded-l-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-300 border-l border-slate-100">
                        <div className="flex justify-between items-center px-6 py-4.5 border-b border-slate-100 bg-white">
                            <div>
                                <span className="text-[10px] font-bold text-amber-600 tracking-widest uppercase block mb-0.5">FFDS Material Specification</span>
                                <h3 className="font-semibold text-slate-900 text-lg tracking-tight">
                                    {selections.find(s => s.id === draftSelection.id) ? 'Edit Selection' : 'New Selection'}
                                </h3>
                            </div>
                            <button 
                                onClick={() => setDraftSelection(null)} 
                                className="text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg p-2 transition-all"
                            >
                                <XCircleIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[#FAFAF9] pb-32">
                            {/* QUICK FILL */}
                            <div className={`bg-white border ${quickFillFlash ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'} rounded-xl overflow-hidden transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)]`}>
                                <div 
                                    className="px-4 py-3 bg-slate-50/50 text-[11px] font-bold text-slate-700 flex justify-between items-center cursor-pointer select-none border-b border-slate-100"
                                    onClick={() => setIsQuickFillExpanded(!isQuickFillExpanded)}
                                >
                                    <span className="flex items-center gap-2 text-slate-800">
                                        <SparklesIcon className="w-4 h-4 text-amber-500 animate-pulse" />
                                        <span>AI Text Import / Quick Fill</span>
                                    </span>
                                    <span className="text-slate-400 text-xs transition-transform duration-200" style={{ transform: isQuickFillExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                                        {isQuickFillExpanded ? 'Collapse' : 'Expand'} ▾
                                    </span>
                                </div>
                                {isQuickFillExpanded && (
                                    <div className="p-4 bg-white animate-in fade-in slide-in-from-top-1 duration-200">
                                        <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                                            Paste raw text (e.g., from WhatsApp or email notes). Our parser will automatically extract the name, brand, code, vendor, and price.
                                        </p>
                                        <textarea
                                            value={quickFillText}
                                            onChange={(e) => setQuickFillText(e.target.value)}
                                            placeholder="e.g. Kajaria Crema Marfil 600x600 Matt for living room floor, ₹85/sqft, code KJF6601 at Kajaria Thane"
                                            className="w-full h-24 p-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none text-[13px] bg-slate-50/30 text-slate-800 mb-3 placeholder:text-slate-400 placeholder:font-normal font-medium leading-relaxed"
                                        />
                                        <button
                                            onClick={() => {
                                                if (!quickFillText) return;
                                                // Basic extraction logic
                                                const txt = quickFillText.toLowerCase();
                                                let updates: any = {};
                                                
                                                // Price extraction
                                                const rateMatch = txt.match(/₹?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*\/?\s*(sqft|rft|piece|sheet|pc)?/i);
                                                if (rateMatch && rateMatch[1]) {
                                                    updates.quotedPrice = parseFloat(rateMatch[1].replace(/,/g, ''));
                                                    if (rateMatch[2]) {
                                                        const u = rateMatch[2].toLowerCase();
                                                        if (u === 'sqft') updates.priceUnit = 'per_sqft';
                                                        if (u === 'rft') updates.priceUnit = 'per_rft';
                                                        if (u === 'piece' || u === 'pc') updates.priceUnit = 'per_piece';
                                                        if (u === 'sheet') updates.priceUnit = 'per_sheet';
                                                    }
                                                }
                                                
                                                // Brand / Vendor extraction (Kajaria example)
                                                if (txt.includes('kajaria')) updates.brand = 'Kajaria';
                                                if (txt.includes('kajaria thane')) updates.vendor = 'Kajaria Thane';
                                                
                                                // Code
                                                const codeMatch = txt.match(/code\s+([a-zA-Z0-9_-]+)/i);
                                                if (codeMatch && codeMatch[1]) updates.finishCode = codeMatch[1].toUpperCase();
                                                
                                                // Category
                                                let detectedCat = null;
                                                for (const [cat, keywords] of Object.entries(CategoryKeywords)) {
                                                    if (keywords.some(kw => txt.includes(kw))) {
                                                        detectedCat = cat;
                                                        break;
                                                    }
                                                }
                                                if (detectedCat) {
                                                    updates.category = detectedCat;
                                                    setAutoDetectedCategory(detectedCat);
                                                    setManualCategorySet(false);
                                                }
                                                
                                                // Item name
                                                updates.itemName = quickFillText.split(/,|\n/)[0].trim();
                                                
                                                setDraftSelection(prev => prev ? { ...prev, ...updates } : prev);
                                                setQuickFillFlash(true);
                                                setTimeout(() => setQuickFillFlash(false), 800);
                                                setIsQuickFillExpanded(false);
                                            }}
                                            className="w-full bg-slate-900 text-white hover:bg-slate-800 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.99]"
                                        >
                                            <SparklesIcon className="w-3.5 h-3.5 text-amber-400" />
                                            <span>Extract & Populate Fields</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* ITEM TYPE TOGGLE */}
                            <div className="bg-slate-100 p-1 rounded-xl border border-slate-200/60 flex mb-2">
                                {['observation', 'selection', 'change_request'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => updateDraft('itemType', type)}
                                        className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
                                            (draftSelection.itemType || 'observation') === type 
                                            ? 'bg-slate-900 text-white shadow-sm' 
                                            : 'text-slate-500 hover:bg-[#E9E9E5]/60 hover:text-slate-800'
                                        }`}
                                    >
                                        {type.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>

                            {/* PHOTO CAPTURE */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">SPECIFICATION PHOTOS</label>
                                {(draftSelection.photos && draftSelection.photos.length > 0) ? (
                                    <div className="grid grid-cols-4 gap-2.5">
                                        {draftSelection.photos.map((photo, idx) => (
                                            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-slate-200 bg-white shadow-sm hover:border-amber-500/50 transition-colors">
                                                <img src={photo} alt="" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <button 
                                                        onClick={() => {
                                                            const p = [...draftSelection.photos!];
                                                            p.splice(idx, 1);
                                                            updateDraft('photos', p);
                                                        }}
                                                        className="bg-rose-500 text-white p-1.5 rounded-lg shadow-sm hover:scale-110 transition-transform"
                                                        title="Remove photo"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {draftSelection.photos.length < 4 && (
                                            <button 
                                                onClick={triggerDraftImageUpload}
                                                className="aspect-square rounded-xl border border-dashed border-slate-300 hover:border-amber-500 bg-slate-50 hover:bg-amber-50/20 transition-all flex flex-col items-center justify-center text-slate-400 hover:text-amber-600 group"
                                            >
                                                <PlusIcon className="w-5 h-5 mb-1 text-slate-400 group-hover:text-amber-500 transition-colors" />
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-amber-600">Add</span>
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <button 
                                        onClick={triggerDraftImageUpload}
                                        className="w-full py-8 rounded-xl border border-dashed border-amber-500/30 bg-[#FAF9F6] hover:bg-[#F5F4EE]/40 flex flex-col items-center justify-center text-[#B8860B] hover:text-amber-700 transition-all group animate-in fade-in duration-350"
                                    >
                                        <CameraIcon className="w-8 h-8 mb-2 text-amber-600/70 group-hover:scale-105 transition-transform" />
                                        <span className="text-xs font-bold uppercase tracking-wider">Tap to photograph or upload</span>
                                        <span className="text-[10px] text-slate-400 mt-1 font-medium">Add up to 4 reference photos or material textures</span>
                                    </button>
                                )}
                            </div>

                            <div className="space-y-4">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5">MATERIAL DETAIL</label>
                                
                                {/* 2. MATERIAL NAME */}
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Material Name <span className="text-rose-500">*</span></label>
                                    <input 
                                        type="text"
                                        autoFocus
                                        ref={itemNameRef}
                                        value={draftSelection.itemName || ''}
                                        onChange={(e) => updateDraft('itemName', e.target.value)}
                                        placeholder="e.g. Living Room Floor Tile"
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-3 text-sm font-semibold text-slate-900 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all placeholder:font-normal placeholder:text-slate-400"
                                    />
                                </div>

                                {/* 3. ROOM + CATEGORY */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Room</label>
                                        {!isRoomOther ? (
                                            <select
                                                value={draftSelection.roomId || ''}
                                                onChange={(e) => {
                                                    if (e.target.value === '__other__') {
                                                        setIsRoomOther(true);
                                                        updateDraft('roomId', '');
                                                    } else {
                                                        updateDraft('roomId', e.target.value);
                                                    }
                                                }}
                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-3 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                            >
                                                <option value="">Select Room</option>
                                                {allRoomNames.map(r => <option key={r} value={r}>{r}</option>)}
                                                <option value="__other__">Other...</option>
                                            </select>
                                        ) : (
                                            <div className="relative">
                                                <input 
                                                    type="text"
                                                    value={customRoom}
                                                    onChange={(e) => {
                                                        setCustomRoom(e.target.value);
                                                        updateDraft('roomId', e.target.value);
                                                    }}
                                                    placeholder="Enter room name"
                                                    autoFocus
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-3 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none pr-8 transition-all"
                                                />
                                                <button 
                                                    onClick={() => {
                                                        setIsRoomOther(false);
                                                        updateDraft('roomId', '');
                                                        setCustomRoom('');
                                                    }}
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                >
                                                    <XCircleIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center">
                                            <span>Category</span>
                                            {autoDetectedCategory && !manualCategorySet && (
                                                <span className="text-[8px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold uppercase border border-amber-100">Auto</span>
                                            )}
                                        </label>
                                        <select 
                                            value={draftSelection.category}
                                            onChange={(e) => updateDraft('category', e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-3 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                        >
                                            <option value="Laminate">Laminate</option>
                                            <option value="Veneer">Veneer</option>
                                            <option value="Flooring">Flooring</option>
                                            <option value="Lighting">Lighting</option>
                                            <option value="Sanitaryware">Sanitaryware</option>
                                            <option value="Hardware">Hardware</option>
                                            <option value="Fabric">Fabric</option>
                                            <option value="Paint">Paint</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                </div>

                                {/* 4. BRAND + CODE */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Brand</label>
                                        <input 
                                            type="text" 
                                            value={draftSelection.brand || ''}
                                            onChange={(e) => updateDraft('brand', e.target.value)}
                                            placeholder="e.g. Philips"
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-3 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Code / Model</label>
                                        <input 
                                            type="text" 
                                            value={draftSelection.finishCode || ''}
                                            onChange={(e) => updateDraft('finishCode', e.target.value)}
                                            placeholder="e.g. 12W Surface"
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-3 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                
                                {draftSelection.category === 'Lighting' && (
                                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-150">
                                        <div className="space-y-1">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Wattage</label>
                                            <select 
                                                value={draftSelection.wattage || ''}
                                                onChange={(e) => updateDraft('wattage', e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-3 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                            >
                                                <option value="">Select...</option>
                                                <option value="5W">5W</option>
                                                <option value="7W">7W</option>
                                                <option value="12W">12W</option>
                                                <option value="15W">15W</option>
                                                <option value="20W">20W</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Color Temp</label>
                                            <select 
                                                value={draftSelection.colorTemp || ''}
                                                onChange={(e) => updateDraft('colorTemp', e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-3 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                            >
                                                <option value="">Select...</option>
                                                <option value="3000K (Warm)">3000K (Warm)</option>
                                                <option value="4000K (Neutral)">4000K (Neutral)</option>
                                                <option value="6000K (White)">6000K (White)</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {/* 5. SHOP / VENDOR */}
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Shop / Vendor</label>
                                    <input 
                                        type="text" 
                                        list="vendor-list"
                                        value={draftSelection.vendor || ''}
                                        onChange={(e) => updateDraft('vendor', e.target.value)}
                                        placeholder="e.g. The Light Studio"
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-3 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                    />
                                    <datalist id="vendor-list">
                                        {recentVendors.map(v => <option key={v} value={v} />)}
                                    </datalist>
                                </div>
                            </div>

                            {/* ESTIMATION & PRICING */}
                            <div className="space-y-3 pt-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5">ESTIMATION & PRICING</label>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quoted Price</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">₹</span>
                                            <input 
                                                type="number"
                                                value={draftSelection.quotedPrice ?? ''}
                                                onChange={(e) => updateDraft('quotedPrice', parseFloat(e.target.value))}
                                                placeholder="0"
                                                className="w-full bg-white border border-slate-200 rounded-lg pl-6 pr-2 py-2.5 text-sm font-semibold text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unit</label>
                                        <select 
                                            value={draftSelection.priceUnit || 'per_sqft'}
                                            onChange={(e) => updateDraft('priceUnit', e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2.5 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                        >
                                            <option value="per_sqft">/ sqft</option>
                                            <option value="per_rft">/ rft</option>
                                            <option value="per_piece">/ piece</option>
                                            <option value="per_sheet">/ sheet</option>
                                            <option value="lumpsum">lump sum</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Est. Qty</label>
                                        <input 
                                            type="number" 
                                            value={draftSelection.estimatedQty ?? ''}
                                            onChange={(e) => updateDraft('estimatedQty', parseFloat(e.target.value))}
                                            placeholder="Qty"
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="bg-[#1E293B] text-white p-3.5 rounded-xl flex items-center justify-between shadow-sm border border-slate-800">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Estimated Total Cost</span>
                                    </div>
                                    <span className={`text-base font-black font-mono tracking-tight ${draftSelection.quotedPrice && draftSelection.estimatedQty ? 'text-amber-400' : 'text-slate-500'}`}>
                                        {draftSelection.estimatedTotal != null ? formatINR(draftSelection.estimatedTotal) : "—"}
                                    </span>
                                </div>
                            </div>

                            {draftSelection.itemType === 'change_request' && (
                                <div className="bg-rose-50/50 border border-rose-200/60 p-4.5 rounded-xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                    <div className="flex items-center gap-2 border-b border-rose-200/40 pb-2">
                                        <AlertTriangleIcon className="w-4 h-4 text-rose-600" />
                                        <h4 className="text-xs font-bold text-rose-800 uppercase tracking-widest">
                                            Change Request Impact Analysis
                                        </h4>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3.5">
                                        <div className="space-y-1">
                                            <label className="block text-[10px] font-bold text-rose-700 uppercase tracking-wider">Cost impact</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-500 text-xs font-bold">₹</span>
                                                <input 
                                                    type="number"
                                                    value={draftSelection.costDelta ?? ''}
                                                    onChange={e => updateDraft('costDelta', e.target.value === '' ? null : parseFloat(e.target.value))}
                                                    placeholder="0"
                                                    className="w-full bg-white border border-rose-200 rounded-lg pl-6 pr-2 py-2 text-sm font-semibold text-rose-950 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                                                />
                                            </div>
                                            {draftSelection.costDelta != null && draftSelection.costDelta > (studioSettings?.sofSettings?.changeRequestSignoffThreshold || 5000) && (
                                                <p className="text-[9px] text-rose-600 mt-1 font-semibold leading-tight">⚡ Requires client sign-off</p>
                                            )}
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <label className="block text-[10px] font-bold text-rose-700 uppercase tracking-wider">Affected BOQ item</label>
                                            <select
                                                value={draftSelection.affectedBoqItemId || ''}
                                                onChange={e => updateDraft('affectedBoqItemId', e.target.value)}
                                                className="w-full bg-white border border-rose-200 rounded-lg px-2 py-2 text-xs font-medium text-rose-950 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                                            >
                                                <option value="">General / Not BOQ-specific</option>
                                                {/* In a real app we would map project BOQ items here */}
                                            </select>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <label className="block text-[10px] font-bold text-rose-700 uppercase tracking-wider">Timeline impact (days)</label>
                                            <input 
                                                type="number"
                                                min="0"
                                                value={draftSelection.timelineDeltaDays ?? ''}
                                                onChange={e => updateDraft('timelineDeltaDays', e.target.value === '' ? null : parseFloat(e.target.value))}
                                                placeholder="0"
                                                className="w-full bg-white border border-rose-200 rounded-lg px-3 py-2 text-sm font-semibold text-rose-950 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                                            />
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <label className="block text-[10px] font-bold text-rose-700 uppercase tracking-wider">Project phase</label>
                                            <select
                                                value={draftSelection.affectedPhaseStr || ''}
                                                onChange={e => updateDraft('affectedPhaseStr', e.target.value)}
                                                className="w-full bg-white border border-rose-200 rounded-lg px-2 py-2 text-xs font-medium text-rose-950 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                                            >
                                                <option value="">Select Phase</option>
                                                {projectContext.timelinePhases?.map(p => (
                                                    <option key={p.id} value={p.title}>{p.title}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {draftSelection.timelineDeltaDays! > 0 && (
                                        <p className="text-[10px] text-rose-700/80 bg-rose-100/30 p-2 rounded-md font-semibold leading-normal">
                                            Adding {draftSelection.timelineDeltaDays} days shifts Phase {draftSelection.affectedPhaseStr || 'currently active'} and overall timeline.
                                        </p>
                                    )}
                                    
                                    <div className="mt-2 bg-white/80 p-3 rounded-lg border border-rose-100/60 flex gap-4 text-[10px] font-bold text-rose-900">
                                        <div className="flex-1">
                                            <p className="text-slate-500 uppercase">Cost Shift</p>
                                            <p className={`text-xs ${draftSelection.costDelta! < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {draftSelection.costDelta != null ? formatINR(draftSelection.costDelta) : '—'}
                                            </p>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-slate-500 uppercase">Timeline shift</p>
                                            <p className={`text-xs ${draftSelection.timelineDeltaDays ? 'text-rose-600' : 'text-slate-400'}`}>
                                                +{draftSelection.timelineDeltaDays || 0} days
                                            </p>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-slate-500 uppercase">Client signoff</p>
                                            <p className="text-xs text-slate-800">
                                                {draftSelection.costDelta != null && draftSelection.costDelta > (studioSettings?.sofSettings?.changeRequestSignoffThreshold || 5000) ? 'Required' : 'Automatic'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* WORKFLOW STATUS & NOTES */}
                            <div className="space-y-4 pt-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5">WORKFLOW & AUDIT</label>
                                
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Selection Status</label>
                                    <div className="flex bg-[#F3F4F1] p-1 rounded-xl border border-slate-200/60">
                                        {['to_select', 'at_shop', 'sent_for_approval'].map((s) => {
                                            const labels = { to_select: 'To Select', at_shop: 'At Shop', sent_for_approval: 'Options Sent' };
                                            const isActive = migrateSelectionStatus(draftSelection.status) === s || (s === 'sent_for_approval' && !['to_select', 'at_shop'].includes(migrateSelectionStatus(draftSelection.status)));
                                            return (
                                                <button
                                                    key={s}
                                                    onClick={() => updateDraft('status', s)}
                                                    className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all duration-200 uppercase tracking-wider ${isActive ? 'bg-slate-900 shadow-sm text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-[#E9E9E5]/60'}`}
                                                >
                                                    {labels[s as keyof typeof labels]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Designer Notes</label>
                                    <textarea 
                                        rows={2.5}
                                        value={draftSelection.notes || ''}
                                        onChange={(e) => updateDraft('notes', e.target.value)}
                                        placeholder="Add private designer notes, client responses, or specific instructions..."
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none transition-all"
                                    />
                                </div>

                                <div className="flex justify-between items-center pt-2.5 border-t border-slate-100/80">
                                    <button 
                                        onClick={() => {
                                            if (window.confirm("Are you sure you want to delete this selection? This action is irreversible.")) {
                                                deleteSelection(draftSelection.id);
                                                setDraftSelection(null);
                                            }
                                        }}
                                        className="flex items-center gap-1.5 text-rose-500 text-xs font-bold hover:text-rose-700 bg-rose-50 hover:bg-rose-100/60 px-3 py-2 rounded-lg transition-all active:scale-[0.98]"
                                    >
                                        <TrashIcon className="w-3.5 h-3.5" /> 
                                        <span>Delete Selection</span>
                                    </button>
                                </div>
                            </div>
                            
                            {draftSelection.previousSelectionSnapshot && (
                                <div className="bg-[#FAF9F5] p-4 rounded-xl border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.01)] mt-2">
                                    <details className="group">
                                        <summary className="text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer outline-none flex items-center justify-between select-none">
                                            <span>Previous Selection Snapshot</span>
                                            <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                                        </summary>
                                        <div className="mt-3.5 text-xs text-slate-700 bg-white p-3.5 rounded-lg border border-slate-100 shadow-inner space-y-1.5">
                                            <div className="font-bold text-slate-900">{draftSelection.previousSelectionSnapshot.itemName}</div>
                                            <div className="text-slate-500">
                                                {draftSelection.previousSelectionSnapshot.brand || 'No Brand'} — {draftSelection.previousSelectionSnapshot.finishCode || 'No Code'}
                                            </div>
                                            {draftSelection.previousSelectionSnapshot.quotedPrice && (
                                                <div className="text-[10px] font-bold text-slate-600 bg-slate-50 inline-block px-2 py-1 rounded-md border border-slate-100">
                                                    {formatINR(draftSelection.previousSelectionSnapshot.quotedPrice)} / {draftSelection.previousSelectionSnapshot.priceUnit?.replace('per_', '')}
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                </div>
                            )}
                        </div>

                        {/* ACTION BUTTONS (Always visible at bottom) */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-100 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.05)] grid grid-cols-2 gap-3 z-10">
                            <button 
                                onClick={() => handleSaveSelection(false)}
                                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-3.5 rounded-xl border border-[#E4E4E0] transition-colors text-sm flex items-center justify-center gap-1.5 active:scale-[0.99]"
                            >
                                <span>Save Only</span>
                            </button>
                            <button 
                                onClick={() => handleSaveSelection(true)}
                                className="w-full bg-[#1E293B] hover:bg-[#0F172A] text-white font-bold py-3.5 rounded-xl transition-all shadow-md text-sm flex items-center justify-center gap-1.5 active:scale-[0.99]"
                            >
                                <CheckIcon className="w-4 h-4 text-amber-400" />
                                <span>Save & Notify Client</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile FAB */}
            <button
                onClick={handleNewItem}
                className="sm:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-[#0066CC] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#0055B3] transition-all active:scale-95 border border-sky-400"
            >
                <CameraIcon className="w-6 h-6 absolute opacity-50 -ml-2 -mt-2" />
                <PlusIcon className="w-6 h-6 relative z-10" />
                <span className="sr-only">New Item</span>
            </button>
            
            {/* Change Request Wall */}
            {changeRequestSelection && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center border-b border-slate-100">
                            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangleIcon className="w-8 h-8 text-rose-500" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">This selection is locked</h3>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-4 items-center shadow-sm">
                                {changeRequestSelection.photos?.[0] && (
                                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-200">
                                        <img src={changeRequestSelection.photos[0]} alt="" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <div className="font-bold text-sm text-slate-800 truncate mb-0.5">{changeRequestSelection.itemName}</div>
                                    {(changeRequestSelection.brand || changeRequestSelection.finishCode) && (
                                        <div className="text-xs text-slate-500 truncate mb-0.5">
                                            {changeRequestSelection.brand} {changeRequestSelection.brand && changeRequestSelection.finishCode ? '—' : ''} {changeRequestSelection.finishCode}
                                        </div>
                                    )}
                                    <div className="text-xs text-slate-500 truncate mb-1">
                                        {changeRequestSelection.vendor}
                                        {changeRequestSelection.quotedPrice ? ` · ${formatINR(changeRequestSelection.quotedPrice)}/${changeRequestSelection.priceUnit?.replace('per_', '')}` : ''}
                                    </div>
                                    {changeRequestSelection.clientConfirmedAt ? (
                                        <div className="text-[10px] text-emerald-600 font-bold bg-emerald-50 inline-block px-1.5 py-0.5 rounded border border-emerald-100">
                                            Client confirmed on {new Date(changeRequestSelection.clientConfirmedAt).toLocaleDateString()}
                                        </div>
                                    ) : changeRequestSelection.confirmationSentAt ? (
                                        <div className="text-[10px] text-amber-600 font-bold bg-amber-50 inline-block px-1.5 py-0.5 rounded border border-amber-100">
                                            Sent to client on {new Date(changeRequestSelection.confirmationSentAt).toLocaleDateString()} — confirmed by designer only
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 p-3 rounded-xl font-medium">
                                Changing a locked selection may affect vendor commitments and procurement timing. This change will be logged and {(window as any).project?.clientName || 'the client'} will be notified.
                            </p>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-2">Why is this changing? <span className="text-rose-500">*</span></label>
                                <textarea 
                                    value={changeReason}
                                    onChange={(e) => setChangeReason(e.target.value)}
                                    placeholder="e.g. Client wants to see different colour options / cheaper alternative found"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none resize-none font-medium"
                                    rows={3}
                                />
                                <div className="text-right text-[10px] mt-1 font-bold text-slate-400">
                                    {changeReason.length}/20 min chars
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button 
                                onClick={() => setChangeRequestSelection(null)}
                                className="flex-1 bg-white text-slate-700 border border-slate-200 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={confirmChangeRequest}
                                disabled={changeReason.length < 20}
                                className="flex-1 bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Yes, request this change
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Multi-Channel Client Notifier Modal */}
            {shareMessage && (
                <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-sm shadow-2xl animate-in fade-in duration-200" onClick={() => setShareMessage(null)}>
                    <div 
                        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg overflow-hidden shadow-xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-8 duration-300 transform flex flex-col max-h-[90vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Client Notification</h3>
                                <p className="text-xs text-slate-500 font-medium">Choose how you want to notify the client</p>
                            </div>
                            <button onClick={() => setShareMessage(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                                <XCircleIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        {/* Tab Headers */}
                        <div className="flex border-b border-slate-100 bg-slate-50/50">
                            <button 
                                className="flex-1 py-3 px-4 text-xs font-black uppercase tracking-wider text-center border-b-2 border-amber-500 text-amber-600 bg-white"
                            >
                                ✉️ Email Confirmation (Preferred)
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-4 flex-1">
                            {/* Email Panel */}
                            <div className="space-y-4">
                                <div className="bg-[#FAF9F5] p-4 rounded-xl border border-amber-200/50 space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-slate-500 uppercase tracking-wider">Recipient Client:</span>
                                        <span className="font-bold text-slate-900 bg-sky-50 px-2 py-0.5 rounded-full">
                                            {projectContext.clientName || 'Client'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-slate-500 uppercase tracking-wider">Client Email:</span>
                                        <span className="font-semibold text-slate-700">
                                            {projectContext.clientEmail || 'Not specified in project settings'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-slate-500 uppercase tracking-wider">Subject Line:</span>
                                        <span className="text-slate-600 italic font-medium truncate max-w-[280px]">
                                            {isConsolidatedReminder 
                                                ? `Action Required: Outstanding material selections for ${projectContext.name || 'your project'}`
                                                : `Action Required: Confirm selection for ${projectContext.name || 'your project'} — ${sharingSelection?.itemName || 'Material Item'}`
                                            }
                                        </span>
                                    </div>
                                </div>

                                {/* Email Status & Actions */}
                                {emailSendingStatus === 'idle' && (
                                    <div className="space-y-3">
                                        <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                            This will send a beautifully styled, formal HTML email formatted in the studio's theme directly to the client's inbox. The email includes a direct link to review and confirm the selection with one tap (no login required).
                                        </p>
                                        <button 
                                            onClick={handleSendEmailNotification}
                                            disabled={!projectContext.clientEmail}
                                            className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 ${
                                                projectContext.clientEmail 
                                                    ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white hover:bg-[#0055B3] hover:shadow-sky-100 active:scale-[0.99]' 
                                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                            }`}
                                        >
                                            <EnvelopeIcon className="w-4 h-4 text-amber-400" />
                                            <span>Send Email Confirmation Request</span>
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => setIsEmailPreviewOpen(true)}
                                            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 text-slate-900 shadow-sm"
                                        >
                                            <span className="text-amber-500">👁️</span>
                                            <span>Preview Email Template</span>
                                        </button>
                                    </div>
                                )}

                                {emailSendingStatus === 'sending' && (
                                    <div className="flex flex-col items-center justify-center py-6 space-y-3">
                                        <div className="w-8 h-8 border-4 border-[#0055B3] border-t-amber-400 rounded-full animate-spin"></div>
                                        <p className="text-xs font-bold text-slate-900">Delivering secure confirmation link to client...</p>
                                    </div>
                                )}

                                {emailSendingStatus === 'sent' && (
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
                                        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                                            <CheckIcon className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <h4 className="text-sm font-black text-emerald-900">Notification Sent Successfully</h4>
                                        <p className="text-xs text-emerald-700">
                                            An email confirmation request has been successfully dispatched to <strong>{projectContext.clientEmail}</strong>.
                                        </p>
                                        <button 
                                            onClick={() => setShareMessage(null)}
                                            className="mt-2 text-xs font-bold text-emerald-950 bg-emerald-100 hover:bg-emerald-200/80 px-4 py-1.5 rounded-lg transition-colors"
                                        >
                                            Done
                                        </button>
                                    </div>
                                )}

                                {emailSendingStatus === 'error' && (
                                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2">
                                        <div className="flex items-center gap-2 text-rose-800 font-bold text-xs uppercase tracking-wider">
                                            <AlertCircleIcon className="w-4 h-4 shrink-0 text-rose-600" />
                                            <span>Email Delivery Failed</span>
                                        </div>
                                        <p className="text-xs text-rose-600 leading-relaxed font-medium">
                                            {emailError || 'An error occurred while attempting to send the email notification.'}
                                        </p>
                                        <div className="flex gap-2 pt-1">
                                            {projectContext.clientEmail && (
                                                <button 
                                                    onClick={handleSendEmailNotification}
                                                    className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    Retry
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => setEmailSendingStatus('idle')}
                                                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                Back
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* WhatsApp / Manual Copy (Fallback) */}
                            <div className="pt-4 border-t border-slate-100">
                                <details className="group">
                                    <summary className="text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer outline-none flex items-center justify-between select-none py-1 hover:text-slate-600 transition-colors">
                                        <span>Show WhatsApp / Manual Share Backup</span>
                                        <span className="text-slate-300 group-open:rotate-180 transition-transform">▼</span>
                                    </summary>
                                    
                                    <div className="mt-3 space-y-3 pt-1">
                                        <p className="text-xs text-slate-500 font-medium">WhatsApp backup message content:</p>
                                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs whitespace-pre-wrap font-medium text-slate-700 max-h-[160px] overflow-y-auto">
                                            {shareMessage}
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-3">
                                            <button 
                                                onClick={() => {
                                                    window.open('https://wa.me/?text=' + encodeURIComponent(shareMessage), '_blank');
                                                    setShareMessage(null);
                                                }}
                                                className="flex items-center justify-center gap-1.5 bg-[#25D366] text-white font-bold py-2.5 px-3 rounded-lg hover:bg-[#1DA851] transition-colors text-xs shadow-sm"
                                            >
                                                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M11.944 0A12 12 0 000 12a12 12 0 001.84 6.4L.4 23.6l5.376-1.4A11.944 11.944 0 0011.944 24a12 12 0 0012-12 12 12 0 00-12-12zm6.224 17.184c-.256.736-1.504 1.392-2.112 1.488-.56.112-1.312.224-4.224-1.008-3.536-1.488-5.888-5.184-6.064-5.424-.16-.24-1.456-1.936-1.456-3.712 0-1.776.928-2.672 1.28-3.04.32-.336.704-.416.944-.416.24 0 .48 0 .688.016.24.016.56-.096.88.672.336.816.8 1.968.88 2.112.08.144.128.32.016.544-.112.224-.16.352-.32.544-.16.176-.336.384-.48.528-.16.144-.336.32-.144.656.176.32.8 1.344 1.712 2.16.176.16.352.304.528.432.176.128.352.256.544.336.256.112.544.096.752-.128.224-.24.96-1.12 1.232-1.504.256-.4.528-.336.896-.208.368.128 2.336 1.104 2.736 1.296.4.208.672.304.768.48.096.176.096 1.056-.16 1.776z"/>
                                                </svg>
                                                <span>WhatsApp</span>
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(shareMessage);
                                                    setShareMessage(null);
                                                    setTimeout(() => alert('Message copied to clipboard!'), 100);
                                                }}
                                                className="flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 font-bold py-2.5 px-3 rounded-lg hover:bg-slate-200 transition-colors text-xs shadow-sm"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a2.25 2.25 0 0 1-2.25 2.25H10.5a2.25 2.25 0 0 1-2.25-2.25v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                                                </svg>
                                                <span>Copy Msg</span>
                                            </button>
                                        </div>
                                    </div>
                                </details>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SELECTIONS PO ELEVATED FOOTER BAR */}
            {selectedSelectionIds.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white py-4 px-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between z-40 animate-in slide-in-from-bottom duration-300 gap-3 border-t border-sky-900">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-black bg-sky-800 px-3 py-1 rounded-full text-sky-200">{selectedSelectionIds.length}</span>
                        <span className="text-xs font-bold text-sky-200 uppercase tracking-wider">selected items from shop visits</span>
                    </div>
                    <div className="flex gap-3 items-center flex-wrap">
                        <button
                            onClick={() => setSelectedSelectionIds([])}
                            className="text-xs font-black uppercase tracking-wider text-sky-300 hover:text-white px-3 py-2 transition-colors"
                        >
                            Clear
                        </button>
                        {/* One button per distinct vendor */}
                        {(() => {
                            const selectedSel = selections.filter(s => selectedSelectionIds.includes(s.id));
                            const selectedVends = Array.from(new Set(selectedSel.map(s => s.vendor?.trim()).filter(Boolean))) as string[];
                            
                            if (selectedVends.length === 0) {
                                return (
                                    <button
                                        onClick={() => {
                                            setPoTargetSelections(selectedSel);
                                            setShowRaisePO(true);
                                        }}
                                        className="bg-[#0066CC] hover:bg-[#0066CC] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-sky-900/30"
                                    >
                                        Raise PO (Generic)
                                    </button>
                                );
                            }

                            return selectedVends.map(vendor => (
                                <button
                                    key={vendor}
                                    onClick={() => {
                                        const forVendor = selectedSel.filter(s => s.vendor?.trim() === vendor);
                                        setPoTargetSelections(forVendor);
                                        setShowRaisePO(true);
                                    }}
                                    className="bg-[#0066CC] hover:bg-[#0066CC] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-sky-900/30"
                                >
                                    Raise PO — <span className="font-extrabold text-white">{vendor}</span>
                                </button>
                            ));
                        })()}
                    </div>
                </div>
            )}

            {/* Raise PO Modal */}
            {showRaisePO && projectId && (
                <RaisePOModal
                    projectId={projectId}
                    projectContext={projectContext}
                    selectedSelections={poTargetSelections}
                    onClose={() => {
                        setShowRaisePO(false);
                        setPoTargetSelections([]);
                    }}
                    onSuccess={() => {
                        setShowRaisePO(false);
                        setPoTargetSelections([]);
                        setSelectedSelectionIds([]);
                        loadPOs(); // Reload orders list
                        setMainTab('orders'); // Jump to orders tab to see success
                    }}
                />
            )}

            {isEmailPreviewOpen && (() => {
                const clientName = projectContext?.clientName || 'Client';
                const recipientEmail = projectContext?.clientEmail || '';
                const projectName = projectContext?.name || 'your project';
                
                let initialSubject = '';
                let initialIntro = '';
                
                if (isConsolidatedReminder) {
                    initialSubject = `Action Required: Outstanding material selections for ${projectName}`;
                    initialIntro = `This is a quick reminder that the following material and finish selections for <strong>${projectName}</strong> are awaiting your confirmation. Kindly review and confirm them at your earliest convenience to help us maintain the procurement and execution schedule.`;
                } else if (sharingSelection) {
                    initialSubject = `Action Required: Confirm selection for ${projectName} — ${sharingSelection.itemName}`;
                    initialIntro = `We've logged the following material/finish selection for <strong>${projectName}</strong> and would love your confirmation to lock this specification.`;
                }

                const generatePreview = (intro: string, subjectLine: string) => {
                    if (isConsolidatedReminder) {
                        return getConsolidatedPendingSelectionsEmailHtml(pendingSelections, projectContext, intro, subjectLine);
                    } else if (sharingSelection) {
                        return getSelectionNotificationEmailHtml(sharingSelection, projectContext, intro, subjectLine);
                    }
                    return { subject: '', html: '' };
                };

                return (
                    <EmailPreviewModal
                        isOpen={isEmailPreviewOpen}
                        onClose={() => setIsEmailPreviewOpen(false)}
                        onSend={handleSendEmailNotification}
                        initialSubject={initialSubject}
                        initialIntro={initialIntro}
                        generatePreview={generatePreview}
                        recipientEmail={recipientEmail}
                        clientName={clientName}
                        isSending={emailSendingStatus === 'sending'}
                        sendingStatus={emailSendingStatus}
                        error={emailError}
                    />
                );
            })()}
        </div>
    );
};

export default MaterialTab;