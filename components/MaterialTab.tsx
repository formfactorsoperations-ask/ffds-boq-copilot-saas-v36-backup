import React, { useState, useEffect, useRef } from 'react';
import { ProjectContext, ProposalTier, Item, MaterialSelection, MaterialSelectionStatus } from '../types';
import Card from './shared/Card';
import { PlusIcon, CheckIcon, ClockIcon, AlertCircleIcon, TrashIcon, PhotoIcon, EnvelopeIcon, XCircleIcon, SparklesIcon } from './Icons';
import { generateId } from '../lib/utils';
import { extractMaterialsFromText } from '../services/aiService';
import { useOrg } from '../contexts/OrgContext';
import { useStudioSettings } from '../hooks/useStudioSettings';

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
}

const MaterialTab: React.FC<MaterialTabProps> = ({ projectContext, setProjectContext, activeTier, bank }) => {
    const { orgData } = useOrg();
    const { settings: studioSettings } = useStudioSettings(orgData.tenantId || 'demo-tenant-01');
    const [selections, setSelections] = useState<MaterialSelection[]>(projectContext.materialSelections || []);
    
    const [showDocketPanel, setShowDocketPanel] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const itemNameRef = useRef<HTMLInputElement>(null);
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [activeRoom, setActiveRoom] = useState<string>('All');
    
    // Tab state for Selections vs Change Requests
    const [mainTab, setMainTab] = useState<'selections' | 'change_requests'>('selections');
    const [crStatusFilter, setCrStatusFilter] = useState<'All' | 'Pending Sign-off' | 'Approved' | 'Absorbed' | 'Rejected'>('All');
    
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
    const filteredSelections = activeRoom === 'All' ? normalSelections : normalSelections.filter(s => s.roomId === activeRoom);
    
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

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <datalist id="room-list">
                {allRoomNames.map(room => <option key={room} value={room} />)}
            </datalist>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-indigo-900">Shop Visit & Selections</h2>
                    <p className="text-slate-500 text-sm mt-1">Capture multiple photos (item, label, context) and present options directly from the shop.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                    <button 
                        onClick={handleExportTemplate}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors shadow-sm"
                        title="Download an Excel/CSV template for field agents to fill out"
                    >
                        Export SOF Template
                    </button>
                    <button 
                        onClick={() => csvInputRef.current?.click()}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-50 transition-colors shadow-sm"
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
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-indigo-600 border border-indigo-200 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors shadow-sm"
                    >
                        <SparklesIcon className="w-5 h-5" /> Paste Message
                    </button>
                    <button 
                        onClick={handleNewItem}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-950 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-900 transition-colors shadow-sm"
                    >
                        <PlusIcon className="w-5 h-5" /> New Item
                    </button>
                    {pendingSelections.length > 0 && (
                        <button 
                            onClick={async () => {
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
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 text-rose-600 border border-rose-200 bg-rose-50 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-rose-100 transition-colors shadow-sm"
                            title="Send consolidated reminder"
                        >
                            <EnvelopeIcon className="w-5 h-5" />
                            Remind all pending
                        </button>
                    )}
                    <button 
                        onClick={() => setShowDocketPanel(true)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                        <EnvelopeIcon className="w-5 h-5" />
                        Draft Docket ({pendingSelections.length})
                    </button>
                </div>
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
                <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-indigo-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                                    <SparklesIcon className="w-6 h-6 text-indigo-500" />
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
                                className="w-full h-48 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none text-slate-700"
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
                                    isExtracting || !importText.trim() ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
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
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center mt-6">
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CameraIcon className="w-10 h-10 text-indigo-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-indigo-900 mb-2">Start your first selection</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mb-8 text-sm">
                        Tap the + button to capture a material at the shop
                    </p>
                    <button 
                        onClick={handleNewItem}
                        className="bg-indigo-600 text-white px-8 py-3.5 rounded-xl text-lg font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                    >
                        Add first selection
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Main Tabs */}
                    <div className="flex gap-6 border-b border-slate-200">
                        <button 
                            className={`pb-4 text-[13px] uppercase tracking-wider font-bold transition-colors ${mainTab === 'selections' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-700'}`}
                            onClick={() => setMainTab('selections')}
                        >
                            Observations & Selections
                        </button>
                        <button 
                            className={`pb-4 text-[13px] uppercase tracking-wider font-bold transition-colors flex items-center gap-2 ${mainTab === 'change_requests' ? 'text-rose-600 border-b-2 border-rose-600' : 'text-slate-400 hover:text-slate-700'}`}
                            onClick={() => setMainTab('change_requests')}
                        >
                            Change Requests
                            {changeRequests.length > 0 && (
                                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">{changeRequests.length}</span>
                            )}
                        </button>
                    </div>

                    {mainTab === 'selections' && (
                        <>
                            {/* Section 1: Room Completion Dashboard */}
                            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                                <div 
                                    className="bg-slate-50 px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                                    onClick={() => setDashboardOpen(!dashboardOpen)}
                                >
                                    <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                                        {dashboardOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                        Room completion
                                    </h3>
                                    <div className="text-sm font-bold text-slate-600">
                                        {totalLockedItems} of {normalSelections.length} items locked
                                    </div>
                                </div>
                                {dashboardOpen && (
                                    <div className="p-6 space-y-4">
                                        {roomStats.map(stat => {
                                            if (stat.totalCount === 0) {
                                                return (
                                                    <div key={stat.roomId} className="text-[11px] text-slate-400 italic">
                                                        {stat.roomId} has no selections yet
                                                    </div>
                                                );
                                            }
                                            const progressColor = stat.pct > 66 ? 'bg-emerald-500' : stat.pct > 33 ? 'bg-amber-400' : 'bg-rose-500';
                                            return (
                                                <div 
                                                    key={stat.roomId} 
                                                    className="flex items-center gap-4 cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors -mx-2"
                                                    onClick={() => setActiveRoom(activeRoom === stat.roomId ? 'All' : stat.roomId)}
                                                >
                                                    <div className="w-1/3 text-[13px] font-bold text-slate-700 truncate">{stat.roomId}</div>
                                                    <div className="flex-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${stat.pct}%` }} />
                                                    </div>
                                                    <div className="w-24 text-right text-[11px] text-slate-500 font-medium whitespace-nowrap">
                                                        {stat.lockedCount} / {stat.totalCount} locked
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {allItemsLocked && normalSelections.length > 0 && (
                                            <div className="mt-4 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2">
                                                <CheckIcon className="w-5 h-5" /> All selections locked — ready to order
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Room Filter Pills */}
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mt-6 pt-2">
                                <button
                                    onClick={() => setActiveRoom('All')}
                                    className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                                        activeRoom === 'All' ? 'bg-indigo-900 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    All Rooms
                                </button>
                                {allRoomNames.map(room => (
                                    <button
                                        key={room}
                                        onClick={() => setActiveRoom(room)}
                                        className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                                            activeRoom === room ? 'bg-indigo-900 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        {room}
                                    </button>
                                ))}
                            </div>

                            {/* Section 2: Selection Cards List */}
                            <div className="space-y-3 pb-24 sm:pb-0">
                                {filteredSelections.map(selection => {
                                    const statusMigrated = migrateSelectionStatus(selection.status);
                                    const statusDisplay = getStatusDisplay(selection.status);
                                    
                                    return (
                                        <div 
                                            key={selection.id} 
                                            onClick={() => handleEditItem(selection)} 
                                            className={`bg-white border rounded-2xl overflow-hidden transition-all cursor-pointer hover:shadow-md ${statusMigrated === 'change_requested' ? 'border-rose-300 border-l-4 border-l-rose-500' : statusMigrated === 'at_shop' ? 'border-amber-300 ring-1 ring-amber-300' : 'border-slate-200'}`}
                                        >
                                            <div className="flex items-start p-3 gap-4 transition-colors hover:bg-slate-50">
                                                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-slate-100 border border-slate-200 flex items-center justify-center">
                                                    {selection.photos?.[0] ? (
                                                        <img src={selection.photos[0]} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <span className="text-2xl">{getCategoryEmoji(selection.category)}</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col flex-grow min-w-0 py-0.5">
                                                    <div className="font-bold text-[14px] text-indigo-900 truncate mb-0.5">{selection.itemName || 'Untitled Item'}</div>
                                                    <div className="text-[12px] text-slate-500 truncate mb-0.5">
                                                        {selection.brand || 'No brand'} — {selection.finishCode || 'No code'} · {selection.category}
                                                    </div>
                                                    {selection.quotedPrice != null && (
                                                        <div className="text-[12px] text-slate-500 truncate mb-1">
                                                            {selection.vendor || 'Unknown shop'} · {formatINR(selection.quotedPrice)}/{selection.priceUnit?.replace('per_', '')} · {selection.estimatedQty || 0} qty = <span className="font-medium text-slate-700">{formatINR(selection.estimatedTotal)}</span>
                                                        </div>
                                                    )}
                                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusDisplay.color}`}>
                                                            {statusDisplay.label}
                                                        </span>
                                                        {statusMigrated === 'sent_for_approval' && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                                                                    <ClockIcon className="w-3 h-3" /> Awaiting reply
                                                                </span>
                                                                <button 
                                                                    onClick={(e) => handleDirectApprove(e, selection.id)}
                                                                    className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                                                    title="If confirmed via WhatsApp/Call"
                                                                >
                                                                    <CheckIcon className="w-3 h-3" /> Mark Approved
                                                                </button>
                                                            </div>
                                                        )}
                                                        {statusMigrated === 'locked' && (
                                                            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                                                                <CheckIcon className="w-3 h-3" /> Client confirmed {selection.clientConfirmedAt ? 'recently' : 'offline'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {statusMigrated === 'change_requested' && selection.previousSelectionSnapshot && (
                                                        <div className="mt-2 bg-rose-50 border border-rose-100 rounded-lg p-2 text-xs">
                                                            <div className="text-rose-800 font-medium truncate">
                                                                Changed from: {selection.previousSelectionSnapshot.itemName} ({selection.previousSelectionSnapshot.brand || 'No brand'})
                                                            </div>
                                                            {selection.changeReason && (
                                                                <div className="text-rose-600/80 text-[10px] mt-0.5 truncate" title={selection.changeReason}>
                                                                    Reason: {selection.changeReason.length > 60 ? selection.changeReason.substring(0, 60) + '...' : selection.changeReason}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
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
                                            crStatusFilter === status ? 'bg-indigo-900 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
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
                                                <div className="font-bold text-indigo-900">{cr.itemName || 'Untitled Change'}</div>
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
                </div>
            )}

            {/* Draft Docket Panel */}
            {showDocketPanel && (
                <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-sm z-50 flex justify-end">
                    <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-indigo-900">Draft Docket</h3>
                                <p className="text-sm text-slate-500">Shop visit prep & pending selections</p>
                            </div>
                            <button onClick={() => setShowDocketPanel(false)} className="text-slate-400 hover:text-slate-600 bg-white rounded-full p-1 shadow-sm border border-slate-200">
                                <XCircleIcon className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-8">
                            
                            {/* Section 1: Pre-visit agenda */}
                            <section>
                                <h4 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
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
                                                            <span className="font-medium text-indigo-900">{item.itemName}</span>
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
                                <h4 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
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
                                                                <div className="font-bold text-sm text-indigo-900 truncate">{item.itemName}</div>
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
                                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-sm hover:bg-indigo-700 transition-colors"
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

            {/* Slide-Up / Drawer Panel for Editing */}
            {draftSelection && (
                <div className="fixed inset-0 z-[100] flex sm:justify-end bg-indigo-950/60 backdrop-blur-sm sm:items-stretch flex-col sm:flex-row">
                    <div className="w-full sm:w-[500px] h-[90vh] sm:h-full mt-auto sm:mt-0 bg-white sm:rounded-l-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-300">
                        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-white">
                            <h3 className="font-bold text-indigo-900 flex items-center gap-2 text-lg">
                                {selections.find(s => s.id === draftSelection.id) ? 'Edit Selection' : 'New Selection'}
                            </h3>
                            <button onClick={() => setDraftSelection(null)} className="text-slate-400 hover:text-slate-600 bg-slate-50 rounded-full p-2 hover:bg-slate-100">
                                <XCircleIcon className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar bg-slate-50/30 pb-32">
                            {/* QUICK FILL */}
                            <div className={`bg-indigo-50 border border-indigo-100 rounded-2xl overflow-hidden transition-all shadow-sm ${quickFillFlash ? 'ring-2 ring-emerald-400 bg-emerald-50' : ''}`}>
                                <div 
                                    className="px-4 py-3 text-[13px] font-bold text-indigo-700 flex justify-between items-center cursor-pointer select-none"
                                    onClick={() => setIsQuickFillExpanded(!isQuickFillExpanded)}
                                >
                                    <span className="flex items-center gap-2"><SparklesIcon className="w-4 h-4" /> ✨ Quick fill</span>
                                    <span className="text-indigo-400 text-[20px] leading-none transition-transform duration-200" style={{ transform: isQuickFillExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                                </div>
                                {isQuickFillExpanded && (
                                    <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <textarea
                                            value={quickFillText}
                                            onChange={(e) => setQuickFillText(e.target.value)}
                                            placeholder="Paste WhatsApp text here... (e.g. Kajaria Crema Marfil 600x600 Matt for living room floor, ₹85/sqft, code KJF6601 at Kajaria Thane)"
                                            className="w-full h-24 p-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none resize-none text-[13px] bg-white text-slate-700 mb-2"
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
                                            className="w-full bg-indigo-600 text-white py-2 rounded-xl text-[13px] font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                                        >
                                            Extract & fill form
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* ITEM TYPE TOGGLE */}
                            <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex mb-4">
                                {['observation', 'selection', 'change_request'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => updateDraft('itemType', type)}
                                        className={`flex-1 py-2 rounded-lg text-sm font-bold capitalize transition-colors ${
                                            (draftSelection.itemType || 'observation') === type 
                                            ? 'bg-indigo-900 text-white shadow-sm' 
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                        }`}
                                    >
                                        {type.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>

                            {/* 1. PHOTO CAPTURE */}
                            <div className="space-y-2">
                                {(draftSelection.photos && draftSelection.photos.length > 0) ? (
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x">
                                        {draftSelection.photos.map((photo, idx) => (
                                            <div key={idx} className="relative flex-none w-32 h-32 rounded-xl overflow-hidden snap-start group border border-slate-200 shadow-sm bg-white">
                                                <img src={photo} alt="" className="w-full h-full object-cover" />
                                                <button 
                                                    onClick={() => {
                                                        const p = [...draftSelection.photos!];
                                                        p.splice(idx, 1);
                                                        updateDraft('photos', p);
                                                    }}
                                                    className="absolute top-2 right-2 bg-rose-500 text-white p-1.5 rounded-full shadow-sm hover:scale-110 transition-transform"
                                                >
                                                    <XCircleIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        {draftSelection.photos.length < 4 && (
                                            <button 
                                                onClick={triggerDraftImageUpload}
                                                className="flex-none w-32 h-32 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all snap-start bg-slate-50"
                                            >
                                                <PlusIcon className="w-6 h-6 mb-1" />
                                                <span className="text-[10px] font-bold uppercase">Add Photo</span>
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <button 
                                        onClick={triggerDraftImageUpload}
                                        className="w-full py-12 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex flex-col items-center justify-center text-indigo-500 hover:bg-indigo-50 transition-all shadow-sm"
                                    >
                                        <CameraIcon className="w-12 h-12 mb-3 opacity-80" />
                                        <span className="text-xl font-bold">Tap to photograph</span>
                                        <span className="text-sm text-indigo-400 mt-1 font-medium">Item, label, or context</span>
                                    </button>
                                )}
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                                {/* 2. MATERIAL NAME */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Material Name <span className="text-rose-500">*</span></label>
                                    <input 
                                        type="text"
                                        autoFocus
                                        ref={itemNameRef}
                                        value={draftSelection.itemName || ''}
                                        onChange={(e) => updateDraft('itemName', e.target.value)}
                                        placeholder="e.g. Living Room Floor Tile"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[16px] font-bold text-indigo-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition-all placeholder:font-normal"
                                    />
                                </div>

                                {/* 3. ROOM + CATEGORY */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Room</label>
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
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none"
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
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none pr-8"
                                                />
                                                <button 
                                                    onClick={() => {
                                                        setIsRoomOther(false);
                                                        updateDraft('roomId', '');
                                                        setCustomRoom('');
                                                    }}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                >
                                                    <XCircleIcon className="w-5 h-5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider flex justify-between items-center">
                                            <span>Category</span>
                                            {autoDetectedCategory && !manualCategorySet && (
                                                <span className="text-[9px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded font-bold uppercase">(Auto)</span>
                                            )}
                                        </label>
                                        <select 
                                            value={draftSelection.category}
                                            onChange={(e) => updateDraft('category', e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none"
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
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Brand</label>
                                        <input 
                                            type="text" 
                                            value={draftSelection.brand || ''}
                                            onChange={(e) => updateDraft('brand', e.target.value)}
                                            placeholder="e.g. Philips"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Code / Model</label>
                                        <input 
                                            type="text" 
                                            value={draftSelection.finishCode || ''}
                                            onChange={(e) => updateDraft('finishCode', e.target.value)}
                                            placeholder="e.g. 12W Surface"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                                        />
                                    </div>
                                </div>
                                
                                {draftSelection.category === 'Lighting' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Wattage</label>
                                            <select 
                                                value={draftSelection.wattage || ''}
                                                onChange={(e) => updateDraft('wattage', e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
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
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Color Temp</label>
                                            <select 
                                                value={draftSelection.colorTemp || ''}
                                                onChange={(e) => updateDraft('colorTemp', e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
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
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Shop / Vendor</label>
                                    <input 
                                        type="text" 
                                        list="vendor-list"
                                        value={draftSelection.vendor || ''}
                                        onChange={(e) => updateDraft('vendor', e.target.value)}
                                        placeholder="e.g. The Light Studio"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                                    />
                                    <datalist id="vendor-list">
                                        {recentVendors.map(v => <option key={v} value={v} />)}
                                    </datalist>
                                </div>
                            </div>

                            {/* 6. PRICE ROW */}
                            <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-1">
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Quoted Price</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">₹</span>
                                            <input 
                                                type="number"
                                                value={draftSelection.quotedPrice ?? ''}
                                                onChange={(e) => updateDraft('quotedPrice', parseFloat(e.target.value))}
                                                placeholder="0.00"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-2 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="col-span-1">
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Unit</label>
                                        <select 
                                            value={draftSelection.priceUnit || 'per_sqft'}
                                            onChange={(e) => updateDraft('priceUnit', e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                                        >
                                            <option value="per_sqft">/ sqft</option>
                                            <option value="per_rft">/ rft</option>
                                            <option value="per_piece">/ piece</option>
                                            <option value="per_sheet">/ sheet</option>
                                            <option value="lumpsum">lump sum</option>
                                        </select>
                                    </div>
                                    <div className="col-span-1">
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Est. Qty</label>
                                        <input 
                                            type="number" 
                                            value={draftSelection.estimatedQty ?? ''}
                                            onChange={(e) => updateDraft('estimatedQty', parseFloat(e.target.value))}
                                            placeholder="qty"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                                    <span className="text-[12px] font-bold text-slate-500 uppercase">Est. total:</span>
                                    <span className={`text-[16px] font-black ${draftSelection.quotedPrice && draftSelection.estimatedQty ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {draftSelection.estimatedTotal != null ? formatINR(draftSelection.estimatedTotal) : "—"}
                                    </span>
                                </div>
                            </div>

                            {draftSelection.itemType === 'change_request' && (
                                <div className="bg-rose-50 border-2 border-rose-200 p-4 rounded-2xl shadow-sm space-y-4 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full -mr-10 -mt-10 blur-xl"></div>
                                    <h3 className="font-bold text-rose-800 flex items-center gap-2 relative">
                                        <AlertTriangleIcon className="w-5 h-5" /> Impact Assessment
                                    </h3>
                                    
                                    <div className="grid grid-cols-2 gap-4 relative z-10">
                                        <div className="col-span-2 md:col-span-1">
                                            <label className="block text-[11px] font-bold text-rose-700 mb-1.5 uppercase tracking-wider">Cost impact *</label>
                                            <input 
                                                type="number"
                                                value={draftSelection.costDelta ?? ''}
                                                onChange={e => updateDraft('costDelta', e.target.value === '' ? null : parseFloat(e.target.value))}
                                                placeholder="±₹"
                                                className="w-full bg-white border border-rose-200 rounded-xl px-3 py-3 text-[14px] font-bold text-rose-900 focus:ring-2 focus:ring-rose-400 outline-none"
                                            />
                                            {draftSelection.costDelta != null && draftSelection.costDelta > (studioSettings?.sofSettings?.changeRequestSignoffThreshold || 5000) && (
                                                <p className="text-[10px] text-rose-700 mt-1 font-semibold">⚡ This change will be sent for client sign-off</p>
                                            )}
                                        </div>
                                        
                                        <div className="col-span-2 md:col-span-1">
                                            <label className="block text-[11px] font-bold text-rose-700 mb-1.5 uppercase tracking-wider">Affected BOQ item <span className="bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded text-[8px] ml-1">OPTIONAL</span></label>
                                            <select
                                                value={draftSelection.affectedBoqItemId || ''}
                                                onChange={e => updateDraft('affectedBoqItemId', e.target.value)}
                                                className="w-full bg-white border border-rose-200 rounded-xl px-2 py-3 text-[12px] font-medium text-rose-900 focus:ring-2 focus:ring-rose-400 outline-none"
                                            >
                                                <option value="">General / Not BOQ-specific</option>
                                                {/* In a real app we would map project BOQ items here */}
                                            </select>
                                        </div>
                                        
                                        <div className="col-span-2 md:col-span-1">
                                            <label className="block text-[11px] font-bold text-rose-700 mb-1.5 uppercase tracking-wider">Timeline impact (days)</label>
                                            <input 
                                                type="number"
                                                min="0"
                                                value={draftSelection.timelineDeltaDays ?? ''}
                                                onChange={e => updateDraft('timelineDeltaDays', e.target.value === '' ? null : parseFloat(e.target.value))}
                                                placeholder="0"
                                                className="w-full bg-white border border-rose-200 rounded-xl px-3 py-3 text-[14px] font-bold text-rose-900 focus:ring-2 focus:ring-rose-400 outline-none"
                                            />
                                            {draftSelection.timelineDeltaDays! > 0 && (
                                                <p className="text-[10px] text-rose-700 mt-1 font-semibold leading-tight">
                                                    Adding {draftSelection.timelineDeltaDays} days will shift Phase {draftSelection.affectedPhaseStr || 'currently active'} completion and all subsequent phases.
                                                </p>
                                            )}
                                        </div>
                                        
                                        <div className="col-span-2 md:col-span-1">
                                            <label className="block text-[11px] font-bold text-rose-700 mb-1.5 uppercase tracking-wider">This change falls under phase</label>
                                            <select
                                                value={draftSelection.affectedPhaseStr || ''}
                                                onChange={e => updateDraft('affectedPhaseStr', e.target.value)}
                                                className="w-full bg-white border border-rose-200 rounded-xl px-2 py-3 text-[12px] font-medium text-rose-900 focus:ring-2 focus:ring-rose-400 outline-none"
                                            >
                                                <option value="">Select Phase</option>
                                                {projectContext.timelinePhases?.map(p => (
                                                    <option key={p.id} value={p.title}>{p.title}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-4 bg-white/60 p-3 rounded-xl border border-rose-100 flex gap-4 text-[11px] font-bold text-indigo-900">
                                        <div className="flex-1">
                                            <p className="text-slate-500 uppercase">Cost</p>
                                            <p className={`text-sm ${draftSelection.costDelta! < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {draftSelection.costDelta != null ? formatINR(draftSelection.costDelta) : '—'}
                                            </p>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-slate-500 uppercase">Timeline</p>
                                            <p className={`text-sm ${draftSelection.timelineDeltaDays ? 'text-rose-600' : 'text-slate-400'}`}>
                                                +{draftSelection.timelineDeltaDays || 0} days
                                            </p>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-slate-500 uppercase">Sign-off required</p>
                                            <p className="text-sm">
                                                {draftSelection.costDelta != null && draftSelection.costDelta > (studioSettings?.sofSettings?.changeRequestSignoffThreshold || 5000) ? 'Yes' : 'No'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                                {/* 7. NOTES */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Notes</label>
                                    <textarea 
                                        rows={2}
                                        value={draftSelection.notes || ''}
                                        onChange={(e) => updateDraft('notes', e.target.value)}
                                        placeholder="Client's reaction, conditions, notes..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                                    />
                                </div>

                                {/* 8. STATUS SELECTOR */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Status</label>
                                    <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                                        {['to_select', 'at_shop', 'sent_for_approval'].map((s) => {
                                            const labels = { to_select: 'To Select', at_shop: 'At Shop', sent_for_approval: 'Options Sent' };
                                            const isActive = migrateSelectionStatus(draftSelection.status) === s || (s === 'sent_for_approval' && !['to_select', 'at_shop'].includes(migrateSelectionStatus(draftSelection.status)));
                                            return (
                                                <button
                                                    key={s}
                                                    onClick={() => updateDraft('status', s)}
                                                    className={`flex-1 text-[13px] font-bold py-2 rounded-lg transition-all ${isActive ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                                                >
                                                    {labels[s as keyof typeof labels]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button 
                                        onClick={() => {
                                            if (window.confirm("Are you sure you want to delete this selection?")) {
                                                deleteSelection(draftSelection.id);
                                                setDraftSelection(null);
                                            }
                                        }}
                                        className="flex items-center gap-2 text-rose-500 text-sm font-bold hover:text-rose-700 bg-rose-50 px-3 py-2 rounded-lg"
                                    >
                                        <TrashIcon className="w-4 h-4" /> Delete Item
                                    </button>
                                </div>
                            </div>
                            
                            {draftSelection.previousSelectionSnapshot && (
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm mt-4">
                                    <details>
                                        <summary className="text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer outline-none mb-1">
                                            Previous Selection History
                                        </summary>
                                        <div className="mt-3 text-sm text-slate-700 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                            <div className="font-bold mb-1 text-indigo-900">{draftSelection.previousSelectionSnapshot.itemName}</div>
                                            <div className="text-xs text-slate-500 mb-2">
                                                {draftSelection.previousSelectionSnapshot.brand || 'No Brand'} — {draftSelection.previousSelectionSnapshot.finishCode || 'No Code'}
                                            </div>
                                            {draftSelection.previousSelectionSnapshot.quotedPrice && (
                                                <div className="text-xs font-medium text-slate-600 bg-slate-50 inline-block px-2 py-1 rounded">
                                                    {formatINR(draftSelection.previousSelectionSnapshot.quotedPrice)} / {draftSelection.previousSelectionSnapshot.priceUnit?.replace('per_', '')}
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                </div>
                            )}
                        </div>

                        {/* 9. ACTION BUTTONS (Always visible at bottom) */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200 bg-white shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)] space-y-2 z-10">
                            <button 
                                onClick={() => handleSaveSelection(true)}
                                className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm text-lg"
                            >
                                Save & Send to Client
                            </button>
                            <button 
                                onClick={() => handleSaveSelection(false)}
                                className="w-full bg-slate-100 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-200 transition-colors"
                            >
                                Save Only (no notification)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile FAB */}
            <button
                onClick={handleNewItem}
                className="sm:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-all active:scale-95 border border-indigo-400"
            >
                <CameraIcon className="w-6 h-6 absolute opacity-50 -ml-2 -mt-2" />
                <PlusIcon className="w-6 h-6 relative z-10" />
                <span className="sr-only">New Item</span>
            </button>
            
            {/* Change Request Wall */}
            {changeRequestSelection && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-indigo-950/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center border-b border-slate-100">
                            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangleIcon className="w-8 h-8 text-rose-500" />
                            </div>
                            <h3 className="text-xl font-bold text-indigo-900">This selection is locked</h3>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-4 items-center shadow-sm">
                                {changeRequestSelection.photos?.[0] && (
                                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-200">
                                        <img src={changeRequestSelection.photos[0]} alt="" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <div className="font-bold text-sm text-indigo-900 truncate mb-0.5">{changeRequestSelection.itemName}</div>
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
            
            {/* Share Bottom Sheet Modal */}
            {shareMessage && (
                <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-indigo-950/60 backdrop-blur-sm shadow-2xl animate-in fade-in duration-200" onClick={() => setShareMessage(null)}>
                    <div 
                        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-8 duration-300 transform"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-indigo-900">Share selection</h3>
                            <button onClick={() => setShareMessage(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full">
                                <XCircleIcon className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-600 mb-2 font-medium">Send this to the client via WhatsApp to confirm the selection.</p>
                            
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm whitespace-pre-wrap font-medium text-slate-700 min-h-[150px] max-h-[300px] overflow-y-auto">
                                {shareMessage}
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                <button 
                                    onClick={() => {
                                        window.open('https://wa.me/?text=' + encodeURIComponent(shareMessage), '_blank');
                                        setShareMessage(null);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold py-3.5 px-4 rounded-xl hover:bg-[#1DA851] transition-colors shadow-sm"
                                >
                                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M11.944 0A12 12 0 000 12a12 12 0 001.84 6.4L.4 23.6l5.376-1.4A11.944 11.944 0 0011.944 24a12 12 0 0012-12 12 12 0 00-12-12zm6.224 17.184c-.256.736-1.504 1.392-2.112 1.488-.56.112-1.312.224-4.224-1.008-3.536-1.488-5.888-5.184-6.064-5.424-.16-.24-1.456-1.936-1.456-3.712 0-1.776.928-2.672 1.28-3.04.32-.336.704-.416.944-.416.24 0 .48 0 .688.016.24.016.56-.096.88.672.336.816.8 1.968.88 2.112.08.144.128.32.016.544-.112.224-.16.352-.32.544-.16.176-.336.384-.48.528-.16.144-.336.32-.144.656.176.32.8 1.344 1.712 2.16.176.16.352.304.528.432.176.128.352.256.544.336.256.112.544.096.752-.128.224-.24.96-1.12 1.232-1.504.256-.4.528-.336.896-.208.368.128 2.336 1.104 2.736 1.296.4.208.672.304.768.48.096.176.096 1.056-.16 1.776z"/>
                                    </svg>
                                    Open in WhatsApp
                                </button>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(shareMessage);
                                        setShareMessage(null);
                                        // A small toast/alert would be nice here, maybe just standard alert for now
                                        setTimeout(() => alert('Message copied to clipboard!'), 100);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-bold py-3.5 px-4 rounded-xl hover:bg-slate-200 transition-colors shadow-sm"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a2.25 2.25 0 0 1-2.25 2.25H10.5a2.25 2.25 0 0 1-2.25-2.25v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                                    </svg>
                                    Copy Message
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MaterialTab;