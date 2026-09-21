import React, { useState, useEffect, useMemo } from 'react';
import AttachedLoader from '../ui/AttachedLoader';
import LockedState from '../LockedState';
import { db } from '../../services/firebaseClient';
import { collection, doc, onSnapshot, writeBatch, serverTimestamp, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { useOrg } from '../../contexts/OrgContext';
import { ProjectContext, Item } from '../../types';
import { 
    Plus, 
    Trash2, 
    Edit, 
    Save, 
    Download, 
    FileText, 
    ChevronDown, 
    CheckCircle2, 
    Lock, 
    AlertCircle, 
    Search, 
    PlusCircle, 
    Check, 
    Eye, 
    Printer, 
    ArrowRight, 
    Sparkles, 
    TrendingUp, 
    Info 
} from 'lucide-react';
import { ScopeAdditionClassification } from '../../services/geminiService';
import { calculateProjectFinancials } from '../../lib/financialsUtils';
import { normaliseAddition, summariseScopeAdditions } from '../../lib/scopeAdditions';
import ScopeAdditionsHeader from './ScopeAdditionsHeader';
import { jsPDF } from 'jspdf';
import ScopeAdditionInvoiceDoc from '../client/ScopeAdditionInvoiceDoc';
import { prepareClonedDocForPdf } from '../../lib/pdfUtils';
import autoTable from 'jspdf-autotable';

interface ScopeAdditionProps {
    projectId: string;
    projectContext: ProjectContext;
    bank: Item[];
    setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
    /** The approved tier. Required for the contract figure to be real. */
    activeTier?: any;
    /** The project's own frozen BOQ, so an addition can be cloned from it. */
    fullBoq?: any[];
}

interface DraftItem {
    description: string;
    category: string;
    unit: string;
    qty: number;
    estimatedUnitRate: number;
    baseCost: number;
    marginOverride?: number; // percentage
    source: 'ai' | 'library' | 'custom';
    bankId?: string;
}

export default function ScopeAdditionsModule({ projectId, projectContext, bank, setProjectContext, activeTier, fullBoq = [] }: ScopeAdditionProps) {
    const designGateActive = (projectContext as any)?.designGate?.gateActivated || (projectContext as any)?.lifecycle?.gates?.designGateActive?.done || (projectContext as any)?.scopeAdditionsEnabled;
    if (!designGateActive) {
        return (
            <div className="w-full space-y-6">
                <LockedState 
                    title="Scope Additions Locked" 
                    prerequisite="Design Gate Activation" 
                    why="Scope Additions (Change Requests) can only be raised after the initial design BOQ is frozen at the Design Gate." 
                    actionLabel="Go to Design Gate" 
                    onAction={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'design-gate' }))}
                />
            </div>
        );
    }

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const focus = params.get('focus');
        if (focus) {
            setTimeout(() => {
                const el = document.getElementById(focus);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-2', 'ring-[#3D52A0]', 'ring-offset-2');
                    setTimeout(() => el.classList.remove('ring-2', 'ring-[#3D52A0]', 'ring-offset-2'), 3000);
                }
            }, 500);
        }
    }, []);

    const { orgData, currentRole } = useOrg();
    const orgId = orgData?.tenantId || 'demo-tenant-01';
    
    const [additions, setAdditions] = useState<any[]>([]);

    /*
      The same derivation the Money tab runs, from the same records. Computed
      here rather than passed in because this screen owns the subscription --
      but it is the shared function, so the two screens cannot drift apart on
      what the revised contract is.
    */
    const scopeFin = useMemo(() => {
        try { return calculateProjectFinancials(projectContext, activeTier); }
        catch { return null; }
    }, [projectContext, activeTier]);
    const contractedExGst = ((scopeFin as any)?.taxableExecution || 0) + ((scopeFin as any)?.taxableDesign || 0);
    const baseMarginPct = useMemo(() => {
        const cost = Number(activeTier?.summary?.totalCost || 0);
        return contractedExGst > 0 && cost > 0 ? ((contractedExGst - cost) / contractedExGst) * 100 : null;
    }, [contractedExGst, activeTier]);

    const scopeSummary = useMemo(
        () => summariseScopeAdditions(
            additions.map((a: any) => normaliseAddition(a.internalDocId || a.id, a)),
            contractedExGst,
            baseMarginPct,
            bank
        ),
        [additions, contractedExGst, baseMarginPct, bank]
    );
    const [loading, setLoading] = useState(true);
    
    // UI Panels toggle
    const [isFormOpen, setIsFormOpen] = useState(false);

    // New additions formulation state
    const [clientRequest, setClientRequest] = useState('');
    const [classification, setClassification] = useState<ScopeAdditionClassification | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Interactive builder states
    const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
    const [draftDesignFeeType, setDraftDesignFeeType] = useState<'formula' | 'custom' | 'waived'>('formula');
    const [draftCustomDesignFee, setDraftCustomDesignFee] = useState<number>(0);

    // Search and add library items
    const [searchQuery, setSearchQuery] = useState('');
    const [isLibraryDropdownOpen, setIsLibraryDropdownOpen] = useState(false);
    /* Which way of adding a line is open. Four sources, because a line can come
       from the rate bank, from this project's own BOQ, from a previous addition
       on it, or from nowhere but somebody's head. */
    const [addSource, setAddSource] = useState<'bank' | 'boq' | 'prev' | null>(null);
    const [boqQuery, setBoqQuery] = useState('');

    // Fetch org settings
    const [feeFloors, setFeeFloors] = useState({ typeB: 5000, typeC: 8000, marginDefault: 15 });
    const [marginAnalytics, setMarginAnalytics] = useState<any>(null);

    // Load project stats & margins
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const orgDoc = await getDocs(collection(db, 'organizations'));
                const org = orgDoc.docs.find(d => d.id === orgId);
                if (org && org.data().settings) {
                    const s = org.data().settings;
                    setFeeFloors({
                        typeB: s.scopeAdditionFeeFloors?.typeB || 5000,
                        typeC: s.scopeAdditionFeeFloors?.typeC || 8000,
                        marginDefault: s.marginFloors?.default || 15
                    });
                }
            } catch (error) {
                console.warn("Failed to retrieve organization invoice guidelines:", error);
            }
        };
        fetchSettings();

        if (projectId && currentRole && ['Super Admin', 'Admin', 'Ops Director'].includes(currentRole)) {
            const unsubMA = onSnapshot(doc(db, `organizations/${orgId}/projects/${projectId}/marginAnalytics/current`), snap => {
                if (snap.exists()) setMarginAnalytics(snap.data());
            });
            return unsubMA;
        }
    }, [orgId, projectId, currentRole]);

    // Read existing additions
    useEffect(() => {
        if (!projectId) return;
        const unsub = onSnapshot(collection(db, `organizations/${orgId}/projects/${projectId}/scopeAdditions`), snap => {
            const data = snap.docs.map(d => ({ ...d.data(), internalDocId: d.id }));
            data.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setAdditions(data);
            setLoading(false);
        });
        return () => unsub();
    }, [projectId, orgId]);

    const [isUnlocking, setIsUnlocking] = useState(false);

    // Bypass activation process in Cloud
    const handleBypassUnlock = async () => {
        setIsUnlocking(true);
        try {
            const orgProjectRef = doc(db, 'organizations', orgId, 'projects', projectId);
            await setDoc(orgProjectRef, {
                scopeAdditionsEnabled: true,
                boqFrozen: true,
                designPhaseClosedAt: serverTimestamp()
            }, { merge: true });

            const { advance } = await import('../../services/lifecycleService');
            let updatedLifecycle = await advance(orgId, projectId, { type: 'GATE_ACTIVATE', gate: 'designGateActive', reference: 'manual-override' });
            if (updatedLifecycle.stage < 5) {
                updatedLifecycle = await advance(orgId, projectId, { type: 'ADVANCE', toStage: 5 });
            }

            setProjectContext?.((prev: any) => ({
                ...prev,
                scopeAdditionsEnabled: true,
                lifecycle: updatedLifecycle,
                boqFrozen: true,
                currentStage: 6,
                status: 'execution',
                designPhaseClosedAt: new Date().toISOString()
            }));

            const feedRef = doc(collection(db, 'organizations', orgId, 'projects', projectId, 'liveFeed'));
            await setDoc(feedRef, {
                type: 'milestone',
                text: `⚡ Scope Additions enabled manually via Ops Override — ${projectContext.name}`,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error("Bypass failed:", error);
            alert("Bypass failed. Please check your network or try again.");
        } finally {
            setIsUnlocking(false);
        }
    };

    /*
      THE ADDITION'S TYPE, CHOSEN RATHER THAN GUESSED.

      This was set by a keyword match dressed as a model -- "tile" meant a
      finish change, "balcony" meant new scope -- reported at a hardcoded 95%
      confidence. The type decides whether a design fee is charged at all, so a
      wrong guess nobody noticed silently waived it.

      The person raising the addition knows which it is, and the fee rule for
      each is shown as they pick.
    */
    const TYPE_META: Record<string, { label: string; blurb: string; fee: string; drawings: string[] }> = {
        TYPE_A: {
            label: 'Finish change',
            blurb: 'Same layout, different material or finish.',
            fee: 'No design fee',
            drawings: [],
        },
        TYPE_B: {
            label: 'Alteration',
            blurb: 'An addition within the existing layout.',
            fee: `10% of the work, minimum ₹${feeFloors.typeB.toLocaleString('en-IN')}`,
            drawings: ['Updated Plan'],
        },
        TYPE_C: {
            label: 'New scope',
            blurb: 'New space or a substantial addition.',
            fee: `11% of the work, minimum ₹${feeFloors.typeC.toLocaleString('en-IN')}`,
            drawings: ['Updated Plan', 'New Elevation'],
        },
    };

    const chooseType = (type: 'TYPE_A' | 'TYPE_B' | 'TYPE_C') => {
        const meta = TYPE_META[type];
        setClassification({
            type,
            /* No fabricated score. This was chosen, not inferred. */
            confidence: 1,
            reasoning: meta.blurb,
            designFeeFormula: meta.fee,
            estimatedDesignFee: null,
            newDrawingsRequired: meta.drawings,
            boqImpact: type === 'TYPE_A' ? 'delta_only' : 'new_items',
        } as any);
        setDraftDesignFeeType(type === 'TYPE_A' ? 'waived' : 'formula');
        setDraftCustomDesignFee(0);
    };

    const addLine = (item: DraftItem) => setDraftItems(prev => [...prev, item]);

    /* From the rate bank: the only source whose rate can later be checked for
       drift, because it carries the bank id forward. */
    const addFromBank = (b: Item) => {
        const rate = (b.materials || 0) + (b.labor || 0);
        addLine({
            description: b.name,
            category: b.cat || 'General',
            unit: b.unit || 'sqft',
            qty: 1,
            estimatedUnitRate: rate,
            baseCost: rate,
            marginOverride: b.margin || 20,
            source: 'library',
            bankId: b.id,
        });
        setSearchQuery('');
        setIsLibraryDropdownOpen(false);
    };

    /* From the project's own frozen BOQ. Most additions are more of something
       already priced, and this keeps the description and the rate consistent
       with what the client already signed. */
    const addFromBoq = (line: any, useCurrentRate: boolean) => {
        const frozenRate = (line.materials || 0) + (line.labor || 0);
        const bankMatch = bank.find(x => x.id === line.id || x.name === line.name);
        const currentRate = bankMatch ? (bankMatch.materials || 0) + (bankMatch.labor || 0) : frozenRate;
        const rate = useCurrentRate ? currentRate : frozenRate;
        addLine({
            description: line.name,
            category: line.cat || line.category || 'General',
            unit: line.unit || 'sqft',
            qty: 1,
            estimatedUnitRate: rate,
            baseCost: rate,
            marginOverride: line.margin || 20,
            source: bankMatch ? 'library' : 'custom',
            bankId: bankMatch?.id,
        });
    };

    /* From an earlier addition on this project, quantities cleared so nothing
       is carried over by accident. */
    const addFromPrevious = (add: any) => {
        const lines: DraftItem[] = (add.miniBoq || []).map((i: any) => ({
            description: i.description,
            category: i.category || 'General',
            unit: i.unit || 'sqft',
            qty: 1,
            estimatedUnitRate: i.estimatedUnitRate || 0,
            baseCost: i.estimatedUnitRate || 0,
            marginOverride: i.marginOverride !== undefined ? i.marginOverride : 20,
            source: i.bankId ? 'library' : 'custom',
            bankId: i.bankId,
        }));
        if (lines.length) setDraftItems(prev => [...prev, ...lines]);
    };

    const addBlankLine = () => addLine({
        description: '',
        category: 'General',
        unit: 'sqft',
        qty: 1,
        estimatedUnitRate: 0,
        baseCost: 0,
        marginOverride: 20,
        source: 'custom',
    });

    // Builder helpers
    const updateDraftItem = (index: number, fields: Partial<DraftItem>) => {
        setDraftItems(prev => {
            const next = [...prev];
            const item = { ...next[index], ...fields };
            if (fields.qty !== undefined || fields.estimatedUnitRate !== undefined) {
                const qty = fields.qty !== undefined ? fields.qty : item.qty;
                const rate = fields.estimatedUnitRate !== undefined ? fields.estimatedUnitRate : item.estimatedUnitRate;
                item.baseCost = qty * rate;
            }
            if (fields.qty !== undefined || fields.estimatedUnitRate !== undefined || fields.description !== undefined || fields.unit !== undefined || fields.category !== undefined) {
                item.source = 'custom';
            }
            next[index] = item;
            return next;
        });
    };

    const deleteDraftItem = (index: number) => {
        setDraftItems(prev => prev.filter((_, idx) => idx !== index));
    };

    const addCustomRow = () => {
        setDraftItems(prev => [
            ...prev,
            {
                description: 'New Scope Variant',
                category: 'General',
                unit: 'lumpsum',
                qty: 1,
                estimatedUnitRate: 1000,
                baseCost: 1000,
                marginOverride: 20,
                source: 'custom'
            }
        ]);
    };

    // Add and snap rate library items
    const handleAddLibraryItem = (bankItem: Item) => {
        const rate = bankItem.materials + bankItem.labor;
        setDraftItems(prev => [
            ...prev,
            {
                description: bankItem.name,
                category: bankItem.cat || 'General',
                unit: bankItem.unit || 'sqft',
                qty: 1,
                estimatedUnitRate: rate,
                baseCost: rate,
                marginOverride: bankItem.margin || 20,
                source: 'library',
                bankId: bankItem.id
            }
        ]);
        setIsLibraryDropdownOpen(false);
        setSearchQuery('');
    };

    // Real-time pricing calculations
    const calcs = useMemo(() => {
        const subTotal = draftItems.reduce((sum, item) => sum + item.baseCost, 0);
        const marginTotal = draftItems.reduce((sum, item) => {
            const pct = item.marginOverride !== undefined ? item.marginOverride : 20;
            return sum + (item.baseCost * (pct / 100));
        }, 0);

        const executionTotalBase = subTotal + marginTotal;
        const executionGst = executionTotalBase * 0.18;
        const executionTotal = executionTotalBase + executionGst;

        let designFeeBase = 0;
        if (draftDesignFeeType === 'formula' && classification) {
            if (classification.type === 'TYPE_B') {
                designFeeBase = Math.max(feeFloors.typeB, executionTotalBase * 0.10);
            } else if (classification.type === 'TYPE_C') {
                designFeeBase = Math.max(feeFloors.typeC, executionTotalBase * 0.11);
            } else if (classification.type === 'TYPE_D') {
                designFeeBase = feeFloors.typeC;
            }
        } else if (draftDesignFeeType === 'custom') {
            designFeeBase = draftCustomDesignFee;
        }

        const designFeeGst = designFeeBase * 0.18;
        const designFeeTotal = designFeeBase + designFeeGst;
        const grandTotal = designFeeTotal + executionTotal;

        return {
            subTotal,
            marginTotal,
            executionTotalBase,
            executionGst,
            executionTotal,
            designFeeBase,
            designFeeGst,
            designFeeTotal,
            grandTotal
        };
    }, [draftItems, draftDesignFeeType, draftCustomDesignFee, classification, feeFloors]);

    // Save Scope Addition with configured settings
    const handleCreateAddition = async () => {
        if (!classification || draftItems.length === 0) return;
        setIsCreating(true);
        try {
            const idStr = `SA-${String(additions.length + 1).padStart(3, '0')}`;
            const newAddition = {
                id: idStr,
                createdAt: serverTimestamp(),
                createdBy: currentRole || 'Ops Staff',
                type: classification.type,
                clientRequest: clientRequest || 'Custom Manual Request',
                classifiedBy: classification.reasoning ? 'system_ai' : 'manual_override',
                classificationConfidence: classification.confidence || 1.0,
                executionValue: calcs.executionTotalBase,
                designFeeBase: calcs.designFeeBase,
                designFeeGst: calcs.designFeeGst,
                designFeeTotal: calcs.designFeeTotal,
                executionSubtotal: calcs.subTotal,
                executionMargin: calcs.marginTotal,
                executionGst: calcs.executionGst,
                executionTotal: calcs.executionTotal,
                grandTotal: calcs.grandTotal,
                paymentGate: {
                    designFeePaid: false,
                    designFeePaidAt: null,
                    executionPaid: false,
                    executionPaidAt: null,
                    workAuthorized: false,
                    workAuthorizedAt: null
                },
                newDrawingsRequired: classification.newDrawingsRequired || [],
                invoiceStatus: 'sent',
                rateSnapshotDate: serverTimestamp(),
                miniBoq: draftItems,
                aiReasoning: classification.reasoning || 'Custom created invoice.'
            };

            await setDoc(doc(collection(db, `organizations/${orgId}/projects/${projectId}/scopeAdditions`)), newAddition);
            
            // Log Event
            const feedRef = doc(collection(db, `organizations/${orgId}/projects/${projectId}/liveFeed`));
            await setDoc(feedRef, {
                type: 'scope_addition',
                text: `📋 Proposed supplementary invoice ${idStr} for: "${clientRequest.substring(0, 50)}..."`,
                timestamp: serverTimestamp()
            });

            // reset form & close panel
            setClientRequest('');
            setClassification(null);
            
            setDraftItems([]);
            setIsFormOpen(false);
        } catch (error) {
            console.error("Failed to persist scope addition:", error);
            alert("Storage error, failed to save contract addition details.");
        } finally {
            setIsCreating(false);
        }
    };

    // Process Signoffs & Milestones
    const handlePayment = async (addId: string, type: 'design' | 'execution', currentAddition: any) => {
        const fieldMap = type === 'design' ? 'designFeePaid' : 'executionPaid';
        const dateMap = type === 'design' ? 'designFeePaidAt' : 'executionPaidAt';
        
        let updates: any = {
            [`paymentGate.${fieldMap}`]: true,
            [`paymentGate.${dateMap}`]: serverTimestamp()
        };

        const willDesignBePaid = type === 'design' ? true : currentAddition.paymentGate.designFeePaid;
        const willExecutionBePaid = type === 'execution' ? true : currentAddition.paymentGate.executionPaid;
        
        if (currentAddition.type === 'TYPE_A') {
            if (willExecutionBePaid) {
                updates['paymentGate.workAuthorized'] = true;
                updates['paymentGate.workAuthorizedAt'] = serverTimestamp();
            }
        } else {
            if (willDesignBePaid && willExecutionBePaid) {
                updates['paymentGate.workAuthorized'] = true;
                updates['paymentGate.workAuthorizedAt'] = serverTimestamp();
            }
        }

        const batch = writeBatch(db);
        batch.update(doc(db, `organizations/${orgId}/projects/${projectId}/scopeAdditions`, addId), updates);

        if (updates['paymentGate.workAuthorized']) {
            if (currentAddition.newDrawingsRequired?.length > 0) {
                for (const dwg of currentAddition.newDrawingsRequired) {
                    const dwgRef = doc(collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`));
                    batch.set(dwgRef, {
                        id: dwgRef.id,
                        name: `[${currentAddition.id}] ${dwg}`,
                        boqTriggers: ['Scope Addition'],
                        rounds: [],
                        currentRound: 0,
                        status: 'pending',
                        approvedAt: null,
                        isMandatory: true,
                        companionOf: null,
                        isGapFlagged: false,
                        lastUpdated: serverTimestamp()
                    });
                }
            }
            
            const feedRef = doc(collection(db, `organizations/${orgId}/projects/${projectId}/liveFeed`));
            batch.set(feedRef, {
                type: 'milestone',
                text: `✓ Client agreement signoff & work authorized for addition — ${currentAddition.id}`,
                timestamp: serverTimestamp()
            });
        }

        await batch.commit();
    };

    // Filter library search list
    const filteredLibraryItems = useMemo(() => {
        if (!searchQuery.trim()) return bank.slice(0, 10);
        const query = searchQuery.toLowerCase();
        return bank.filter(item => 
            (item.name || '').toLowerCase().includes(query) || 
            (item.cat || '').toLowerCase().includes(query)
        ).slice(0, 15);
    }, [bank, searchQuery]);

    // Format currency to Indian system
    const formatINR = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value);
    };

    // Master Ledger PDF generator
    const generateLifetimeLedger = () => {
        try {
            const doc = new jsPDF() as any;
            
            // Corporate design headers
            doc.setFillColor(15, 23, 42); 
            doc.rect(0, 0, 210, 36, 'F');
            
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(255, 255, 255);
            doc.text('FORM FACTORS DESIGN STUDIO', 15, 14);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text('PREMIUM COMMERCIAL & HOUSEHOLD INTERIORS • STATEMENT OF ACCOUNT', 15, 20);
            /* From the org profile. This printed "Ops Headquarters:
               Indiranagar, Bengaluru, India" on a Thane studio's statement. */
            doc.text(
                [orgData?.officeAddress, orgData?.cityState].filter(Boolean).join(', ') || 'Address not set in Studio Settings',
                15, 25,
            );

            // Statement Ledger Date & Project Details
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor(15, 23, 42);
            doc.text('Supplementary Account Ledger', 15, 50);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(71, 85, 105);
            doc.text(`Client ID Reference: ${projectContext.clientName || 'N/A'}`, 15, 58);
            doc.text(`Project Name: ${projectContext.name || 'N/A'}`, 15, 63);
            doc.text(`Location Structure: ${projectContext.config || 'General Design Layout'}`, 15, 68);
            doc.text(`Export Timestamp: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}`, 15, 73);

            // Calculations for historical additions overview
            const totalAdditions = additions.length;
            const absoluteValue = additions.reduce((sum, item) => sum + (item.grandTotal || 0), 0);
            const authorizedValue = additions.filter(item => item.paymentGate?.workAuthorized).reduce((sum, item) => sum + (item.grandTotal || 0), 0);
            const totalPaid = additions.reduce((sum, item) => {
                let currentPaid = 0;
                if (item.paymentGate?.designFeePaid) currentPaid += (item.designFeeTotal || 0);
                if (item.paymentGate?.executionPaid) currentPaid += (item.executionTotal || 0);
                return sum + currentPaid;
            }, 0);
            
            const outstanding = absoluteValue - totalPaid;

            // Stats Block Card
            doc.setFillColor(248, 250, 252);
            doc.rect(15, 80, 180, 24, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.rect(15, 80, 180, 24, 'S');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text('CONTRACT ITEMS', 20, 87);
            doc.text('TOTAL VALUESProposed', 60, 87);
            doc.text('AUTHORIZED EXCU', 105, 87);
            doc.text('PAID COLLECTED', 150, 87);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text(`${totalAdditions} items`, 20, 96);
            doc.text(`Rs ${Math.floor(absoluteValue).toLocaleString('en-IN')}`, 60, 96);
            
            doc.setTextColor(5, 150, 105); // emerald 600
            doc.text(`Rs ${Math.floor(authorizedValue).toLocaleString('en-IN')}`, 105, 96);
            
            doc.setTextColor(61, 82, 160); // indigo 600
            doc.text(`Rs ${Math.floor(totalPaid).toLocaleString('en-IN')}`, 150, 96);

            // Chronological Ledger table
            const tableRows = additions.map((add, idx) => {
                const designPaid = add.type === 'TYPE_A' ? 'Waived' : (add.paymentGate?.designFeePaid ? 'Paid' : 'Unpaid');
                const execPaid = add.paymentGate?.executionPaid ? 'Paid' : 'Unpaid';
                const date = add.createdAt ? new Date(add.createdAt.seconds * 1000).toLocaleDateString('en-IN') : 'N/A';
                
                return [
                    add.id || `SA-${idx}`,
                    date,
                    add.clientRequest ? (add.clientRequest.substring(0, 45) + (add.clientRequest.length > 45 ? '...' : '')) : 'Custom scope modification',
                    add.type || 'Custom',
                    `Rs ${Math.floor(add.designFeeTotal || 0).toLocaleString('en-IN')} (${designPaid})`,
                    `Rs ${Math.floor(add.executionTotal || 0).toLocaleString('en-IN')} (${execPaid})`,
                    `Rs ${Math.floor(add.grandTotal || 0).toLocaleString('en-IN')}`
                ];
            });

            autoTable(doc, {
                startY: 112,
                head: [['Ref ID', 'Date Logged', 'Client Scope Description', 'Type', 'Design Component', 'Execution Component', 'Grand Total']],
                body: tableRows,
                headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
                bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 22 },
                    2: { cellWidth: 45 },
                    6: { fontStyle: 'bold', halign: 'right' }
                },
                theme: 'striped'
            });

            // consolidated outstanding box
            const currentY = (doc as any).lastAutoTable.finalY + 12;
            doc.setFillColor(254, 242, 242);
            doc.rect(120, currentY, 75, 18, 'F');
            doc.setDrawColor(248, 113, 113);
            doc.rect(120, currentY, 75, 18, 'S');

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(185, 28, 28);
            doc.text('OUTSTANDING STATEMENT BALANCE', 124, currentY + 6);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(`Rs ${Math.floor(outstanding).toLocaleString('en-IN')}`, 124, currentY + 13);

            // Footer Signature section
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text('Verify all entries matching physical vouchers before execution authorization.', 15, currentY + 30);
            doc.text('Generated from executive database workspace.', 15, currentY + 34);

            doc.save(`Supplementary_Ledger_${projectContext.name?.replace(/\s+/g, '_') || 'Project'}.pdf`);
        } catch (error) {
            console.error(error);
            alert("Export failed, please try again.");
        }
    };

    // Specific Scope addition Invoice PDF generator
    /*
      THE SUPPLEMENTARY INVOICE.

      Drawn with jsPDF primitives at hand-placed coordinates, and hardcoded to a
      Bengaluru address, a Karnataka GSTIN and an ICICI account number -- none of
      which belong to this studio. It now renders the same styled-HTML document
      every other client-facing paper uses, reading the studio's real details
      from the org profile.
    */
    const [invoiceFor, setInvoiceFor] = useState<any | null>(null);

    const generateInvoicePDF = (add: any) => {
        setInvoiceFor(add);
    };

    /* Once the sheet is in the DOM, render it to PDF and take it back out. */
    useEffect(() => {
        if (!invoiceFor) return;
        let cancelled = false;
        const run = async () => {
            /* One frame so the sheet and its stylesheet are laid out before
               html2canvas measures anything. */
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const element = document.getElementById('sa-invoice-sheet');
            if (!element || cancelled) { setInvoiceFor(null); return; }
            try {
                const mod: any = await import('html2pdf.js');
                const html2pdf = typeof mod === 'function' ? mod
                    : typeof mod?.default === 'function' ? mod.default
                    : mod?.default?.default;
                if (!html2pdf) throw new Error('html2pdf unavailable');

                const safeProject = (projectContext.name || 'Project').replace(/[^a-zA-Z0-9]+/g, '_');
                await html2pdf()
                    .set({
                        margin: [15, 0, 15, 0],
                        filename: `Invoice_${invoiceFor.id}_${safeProject}.pdf`,
                        image: { type: 'jpeg' as const, quality: 1 },
                        html2canvas: {
                            scale: 2,
                            useCORS: true,
                            letterRendering: true,
                            logging: false,
                            onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc),
                        },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
                        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.totals', '.paycols', '.sig', '.metabar'] },
                    })
                    .from(element)
                    .save();
            } catch (e) {
                console.error('Invoice PDF failed', e);
                alert('Could not produce the invoice PDF.');
            } finally {
                if (!cancelled) setInvoiceFor(null);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [invoiceFor, projectContext.name]);

    const isScopeAdditionsEnabled = projectContext.lifecycle?.gates?.designGateActive?.done || projectContext.scopeAdditionsEnabled;
    if (!isScopeAdditionsEnabled) {
        return (
            <div className="flex flex-col items-center justify-center p-10 max-w-2xl mx-auto my-12 text-center bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center text-amber-500 mb-6 shadow-inner">
                    <Lock className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 font-serif mb-3">Scope Additions Locked</h2>
                <p className="text-slate-600 text-sm max-w-md mb-8 leading-relaxed">
                    This module is designed to handle supplementary client requests and post-agreement changes. It is locked until the initial project design and budget are frozen.
                </p>

                {/* Integration Info Box */}
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 text-left mb-8">
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                        <span className="text-[10px] font-bold tracking-wider text-[#3D52A0] uppercase block mb-1">Method 1 (Standard Operations)</span>
                        <h4 className="font-bold text-slate-800 text-xs mb-1.5">Activate Design Complete Gate</h4>
                        <p className="text-slate-500 text-[11px] leading-relaxed">
                            Under <strong>Design & Proposals</strong> &gt; <strong>Design Complete</strong>, tick all items on the design closeout checklist and choose "Activate Design Gate". This automatically freezes the BOQ, shifts the project stage to Execution, and activates this module.
                        </p>
                    </div>

                    <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/35">
                        <span className="text-[10px] font-bold tracking-wider text-[#334486] uppercase block mb-1">Method 2 (Ops Sandbox Bypass)</span>
                        <h4 className="font-bold text-slate-900 text-xs mb-1.5">Instant Execution Override</h4>
                        <p className="text-sky-800/80 text-[11px] leading-relaxed">
                            For administrators, sandbox users, and operations managers, click the toggle below to bypass the checklist gate, freeze the current BOQ snapshot in the cloud, and unlock the workspace immediately.
                        </p>
                    </div>
                </div>

                {/* Bypass Trigger Button */}
                <div className="w-full pt-4 border-t border-slate-100 flex flex-col items-center justify-center">
                    <button
                        onClick={handleBypassUnlock}
                        disabled={isUnlocking}
                        className="bg-[#3D52A0] hover:bg-[#334486] font-bold text-xs text-white px-6 py-3 rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-98 disabled:opacity-50"
                    >
                        {isUnlocking ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Unlocking Workspace...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
                                Bypass Lock & Enable Module Now
                            </>
                        )}
                    </button>
                    <p className="text-[10px] text-slate-400 mt-2.5">
                        * Clicking bypass will automatically transition this project to the 'Execution' stage and freeze the draft BOQ.
                    </p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <AttachedLoader message="Syncing latest change orders..." />
        );
    }

    /* Full width. This was capped at max-w-6xl and centred, so on any real
       screen a third of the page sat empty either side while the money was
       squeezed into a ribbon down the middle. */
    return (
        <div className="w-full px-4 pb-10 space-y-6">

            {/* Off-screen while it renders. Positioned rather than hidden,
                because html2canvas cannot measure display:none. */}
            {invoiceFor && (
                <div style={{ position: 'fixed', left: -10000, top: 0, width: 820, zIndex: -1 }} aria-hidden>
                    <ScopeAdditionInvoiceDoc
                        addition={invoiceFor}
                        projectContext={projectContext}
                        orgData={orgData as any}
                        invoiceNo={`INV/SA/${String(projectId).slice(0, 6).toUpperCase()}/${invoiceFor.id}`}
                    />
                </div>
            )}
            
            {/*
              The header was two buttons floated right. It is now the reading an
              owner needs before deciding anything: how far the job has drifted
              from what was signed, whether the extra work is priced as well as
              the original, and whether it is priced off rates that have moved.
            */}
            <ScopeAdditionsHeader
                summary={scopeSummary}
                contractedExGst={contractedExGst}
                baseMarginPct={baseMarginPct}
                onNew={() => setIsFormOpen(!isFormOpen)}
                onExport={additions.length > 0 ? generateLifetimeLedger : undefined}
            />

            {/* Configured Builder Form Panel */}
            {isFormOpen && (
                <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-md space-y-6 transition duration-200">
                    <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                        <div>
                            <span className="text-[10px] font-bold text-[#3D52A0] tracking-wider uppercase">New addition</span>
                            <h3 className="font-bold text-slate-900 text-lg">What has the client asked for?</h3>
                        </div>
                        <button 
                            onClick={() => { setIsFormOpen(false); setClassification(null); setDraftItems([]); setAddSource(null); }}
                            className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                        >
                            Cancel
                        </button>
                    </div>

                    {!classification && (
                        <div className="space-y-5">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-2">
                                    In their words
                                </label>
                                <textarea
                                    className="w-full border border-slate-200 p-4 rounded-xl text-[13.5px] bg-slate-50 focus:bg-white transition-colors min-h-[90px] focus:outline-[#3D52A0]"
                                    placeholder="e.g. Add a shoe rack in the foyer, and swap the kitchen counter to quartz"
                                    value={clientRequest}
                                    onChange={e => setClientRequest(e.target.value)}
                                />
                            </div>

                            {/*
                              Pick the kind of change. The fee rule for each is
                              on the card, so the design fee is never a number
                              that appears from nowhere.
                            */}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-2">
                                    What kind of change is it?
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {(['TYPE_A', 'TYPE_B', 'TYPE_C'] as const).map(t => {
                                        const meta = TYPE_META[t];
                                        return (
                                            <button
                                                key={t}
                                                type="button"
                                                disabled={!clientRequest.trim()}
                                                onClick={() => chooseType(t)}
                                                className="text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-[#3D52A0] hover:bg-[#3D52A0]/[0.03] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <span className="block text-[13.5px] font-bold text-slate-800">{meta.label}</span>
                                                <span className="block text-[11.5px] text-slate-500 mt-1 leading-snug">{meta.blurb}</span>
                                                <span className="block text-[11px] font-semibold mt-2 text-[#3D52A0]">{meta.fee}</span>
                                                {meta.drawings.length > 0 && (
                                                    <span className="block text-[10.5px] text-slate-400 mt-1">
                                                        {meta.drawings.length} drawing {meta.drawings.length === 1 ? 'task' : 'tasks'} queued on release
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                {!clientRequest.trim() && (
                                    <p className="mt-2 text-[11.5px] text-slate-400">
                                        Write down what the client asked for first — it goes on the invoice.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {classification && (
                        <div id="pending" className="space-y-6">
                            
                            {/* Classification result banner */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-start justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center text-[#334486] font-extrabold text-base border border-sky-200">
                                        {classification.type.split('_')[1] || classification.type}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-sm">
                                            {/* The same words the picker used. It read
                                                "Major New Area Scope (Type C — Structural
                                                draft addition)" — a label from a taxonomy
                                                the person choosing never saw. */}
                                            {TYPE_META[classification.type]?.label || 'Alteration'}
                                        </h4>
                                        <p className="text-slate-600 text-xs mt-1 leading-relaxed">{classification.reasoning}{TYPE_META[classification.type]?.fee ? ` · ${TYPE_META[classification.type].fee}` : null}</p>
                                        {classification.newDrawingsRequired?.length > 0 && (
                                            <div className="mt-2 text-[10px] font-bold text-[#334486] bg-sky-50 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-sky-100">
                                                <Info className="w-3 h-3" /> Creates {classification.newDrawingsRequired.length} working drawing tasks: {classification.newDrawingsRequired.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* "AI Match Confidence 95%" stood here, printed from a
                                    hardcoded 0.95. The type is chosen now, so the only
                                    honest thing to offer is a way to change it. */}
                                <button
                                    type="button"
                                    onClick={() => setClassification(null)}
                                    className="shrink-0 text-[11.5px] font-bold text-[#3D52A0] hover:underline cursor-pointer"
                                >
                                    Change type
                                </button>
                            </div>

                            {/* Portfolio margin warning preview */}
                            {currentRole && ['Super Admin', 'Admin', 'Ops Director'].includes(currentRole) && marginAnalytics && (
                                <div className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-slate-200 border border-sky-900 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <TrendingUp className="w-5 h-5 text-sky-400" />
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Firm-wide Margin Health Impact</div>
                                            <div className="flex items-baseline gap-2 mt-0.5">
                                                <span className="text-slate-400 text-xs">Current Blended: {marginAnalytics.blendedMarginPct?.toFixed(1)}%</span>
                                                <span className="text-slate-600">→</span>
                                                <span className={`font-bold text-lg ${ (((marginAnalytics.totalFirmMargin || 0) + calcs.marginTotal) / ((marginAnalytics.totalFirmBase || 0) + calcs.subTotal + (marginAnalytics.totalFirmMargin || 0) + calcs.marginTotal) * 100) < feeFloors.marginDefault ? 'text-amber-400 animate-pulse' : 'text-emerald-400' }`}>
                                                    { (((marginAnalytics.totalFirmMargin || 0) + calcs.marginTotal) / ((marginAnalytics.totalFirmBase || 0) + calcs.subTotal + (marginAnalytics.totalFirmMargin || 0) + calcs.marginTotal) * 100).toFixed(1) }% Blended Post-Alteration
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {(((marginAnalytics.totalFirmMargin || 0) + calcs.marginTotal) / ((marginAnalytics.totalFirmBase || 0) + calcs.subTotal + (marginAnalytics.totalFirmMargin || 0) + calcs.marginTotal) * 100) < feeFloors.marginDefault && (
                                        <div className="bg-amber-950/40 text-amber-300 font-bold text-[10px] px-3 py-1.5 rounded-lg border border-amber-900/50 max-w-[280px] leading-tight">
                                            ⚠️ This modification erodes global commercial metrics. Adjust item-level margins above 20% to compensate.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Interactive Editable Draft Mini-BOQ Table */}
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h4 className="font-bold text-slate-900 text-[14px]">What the work involves</h4>

                                    {/*
                                      Four ways in, and the order is the order of
                                      preference. A rate-bank line carries its
                                      bankId forward, which is the only thing that
                                      makes its rate checkable for drift later. A
                                      typed line can never be compared against
                                      today's rates -- which is exactly why the
                                      drift panel on this project currently reads
                                      "not measurable".
                                    */}
                                    <div className="flex flex-wrap gap-2">
                                        {([
                                            { k: 'bank', label: 'Rate bank' },
                                            { k: 'boq', label: 'From this BOQ' },
                                            { k: 'prev', label: 'Reuse an addition' },
                                        ] as const).map(src => (
                                            <button
                                                key={src.k}
                                                type="button"
                                                onClick={() => setAddSource(addSource === src.k ? null : src.k)}
                                                disabled={src.k === 'boq' ? fullBoq.length === 0 : src.k === 'prev' ? additions.length === 0 : false}
                                                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                                    addSource === src.k
                                                        ? 'bg-[#3D52A0] text-white border-[#3D52A0]'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                                }`}
                                            >
                                                {src.label}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={addBlankLine}
                                            className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 transition-colors cursor-pointer"
                                        >
                                            Blank line
                                        </button>
                                    </div>
                                </div>

                                {/* ── whichever source is open ──────────────────────── */}
                                {addSource === 'bank' && (
                                    <div className="border border-slate-200 rounded-xl bg-white p-3">
                                        <div className="flex items-center border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50">
                                            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                                            <input
                                                autoFocus
                                                className="bg-transparent text-[12.5px] outline-none w-full"
                                                placeholder="Search the rate bank"
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                            />
                                        </div>
                                        <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-50">
                                            {filteredLibraryItems.length === 0 ? (
                                                <p className="text-[12px] text-slate-400 text-center py-4">
                                                    Nothing in the bank matches that.
                                                </p>
                                            ) : filteredLibraryItems.map(item => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => addFromBank(item)}
                                                    className="w-full text-left py-2 px-1 hover:bg-slate-50 rounded flex justify-between items-center gap-3 cursor-pointer"
                                                >
                                                    <span className="min-w-0">
                                                        <span className="block text-[12.5px] font-semibold text-slate-800 truncate">{item.name}</span>
                                                        <span className="block text-[10.5px] text-slate-400">{item.cat || 'General'} · per {item.unit}</span>
                                                    </span>
                                                    <span className="text-[12.5px] font-bold tabular-nums text-slate-700 shrink-0">
                                                        {formatINR((item.materials || 0) + (item.labor || 0))}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {addSource === 'boq' && (
                                    <div className="border border-slate-200 rounded-xl bg-white p-3">
                                        <p className="text-[11.5px] text-slate-500 mb-2">
                                            Most additions are more of something already priced. Pick the line, then take the
                                            rate it was frozen at or what it costs today.
                                        </p>
                                        <div className="flex items-center border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50">
                                            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                                            <input
                                                autoFocus
                                                className="bg-transparent text-[12.5px] outline-none w-full"
                                                placeholder="Search this project's BOQ"
                                                value={boqQuery}
                                                onChange={e => setBoqQuery(e.target.value)}
                                            />
                                        </div>
                                        <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-50">
                                            {fullBoq
                                                .filter((l: any) => !boqQuery.trim() || (l.name || '').toLowerCase().includes(boqQuery.toLowerCase()))
                                                .slice(0, 40)
                                                .map((line: any, i: number) => {
                                                    const frozen = (line.materials || 0) + (line.labor || 0);
                                                    const match = bank.find(x => x.id === line.id || x.name === line.name);
                                                    const current = match ? (match.materials || 0) + (match.labor || 0) : frozen;
                                                    const moved = Math.abs(current - frozen) > 0.5;
                                                    return (
                                                        <div key={`${line.id}-${i}`} className="py-2 px-1 flex items-center justify-between gap-3">
                                                            <span className="min-w-0">
                                                                <span className="block text-[12.5px] font-semibold text-slate-800 truncate">{line.name}</span>
                                                                <span className="block text-[10.5px] text-slate-400">
                                                                    {line.roomId || line.cat || 'General'} · per {line.unit}
                                                                </span>
                                                            </span>
                                                            <span className="flex items-center gap-1.5 shrink-0">
                                                                <button
                                                                    onClick={() => addFromBoq(line, false)}
                                                                    className="px-2 py-1 rounded-md text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer tabular-nums"
                                                                    title="The rate this line was frozen at"
                                                                >
                                                                    {formatINR(frozen)}
                                                                </button>
                                                                {moved && (
                                                                    <button
                                                                        onClick={() => addFromBoq(line, true)}
                                                                        className="px-2 py-1 rounded-md text-[11px] font-bold border cursor-pointer tabular-nums"
                                                                        style={{
                                                                            color: current > frozen ? '#B45309' : '#0F766E',
                                                                            borderColor: current > frozen ? '#F5D9AE' : '#BFE3D9',
                                                                            background: current > frozen ? '#FEF6EC' : '#ECF7F4',
                                                                        }}
                                                                        title="What the rate bank says today"
                                                                    >
                                                                        {formatINR(current)} today
                                                                    </button>
                                                                )}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}

                                {addSource === 'prev' && (
                                    <div className="border border-slate-200 rounded-xl bg-white p-3">
                                        <p className="text-[11.5px] text-slate-500 mb-2">
                                            Copies the lines with quantities reset to one, so nothing carries over by accident.
                                        </p>
                                        <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
                                            {additions.map((add: any, i: number) => (
                                                <button
                                                    key={add.internalDocId || i}
                                                    onClick={() => { addFromPrevious(add); setAddSource(null); }}
                                                    className="w-full text-left py-2 px-1 hover:bg-slate-50 rounded flex justify-between items-center gap-3 cursor-pointer"
                                                >
                                                    <span className="min-w-0">
                                                        <span className="block text-[12.5px] font-semibold text-slate-800">{add.id}</span>
                                                        <span className="block text-[11px] text-slate-500 truncate">{add.clientRequest}</span>
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 shrink-0">
                                                        {(add.miniBoq || []).length} {(add.miniBoq || []).length === 1 ? 'line' : 'lines'}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/*
                                  THE MARGIN GUARD.

                                  Both additions already on this project were
                                  priced below the contract they were added to
                                  -- 20% and 25% against 25.6% -- and nobody saw
                                  it until a report was built months later. The
                                  comparison now happens while the price can
                                  still be changed, against THIS job's own
                                  margin rather than a number picked out of
                                  the air.
                                */}
                                {draftItems.length > 0 && calcs.subTotal > 0 && (() => {
                                    const pct = calcs.executionTotalBase > 0
                                        ? (calcs.marginTotal / calcs.executionTotalBase) * 100
                                        : 0;
                                    const thin = baseMarginPct != null && pct < baseMarginPct;
                                    const gap = baseMarginPct != null ? baseMarginPct - pct : 0;
                                    return (
                                        <div
                                            className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
                                            style={{
                                                borderColor: thin ? '#F2D0DC' : '#BFE3D9',
                                                background: thin ? '#FFF8FA' : '#ECF7F4',
                                            }}
                                        >
                                            <span className="text-[12px] text-slate-600">
                                                This addition:{' '}
                                                <strong className="font-bold tabular-nums" style={{ color: thin ? '#B4436A' : '#0F766E' }}>
                                                    {pct.toFixed(1)}% margin
                                                </strong>
                                            </span>
                                            {baseMarginPct != null && (
                                                <span className="text-[12px] text-slate-600">
                                                    This project:{' '}
                                                    <strong className="font-bold tabular-nums text-slate-800">
                                                        {baseMarginPct.toFixed(1)}%
                                                    </strong>
                                                </span>
                                            )}
                                            <span className="text-[11.5px] leading-snug" style={{ color: thin ? '#B4436A' : '#0F766E' }}>
                                                {baseMarginPct == null
                                                    ? 'No contract margin on record to compare against.'
                                                    : thin
                                                        ? `Priced ${gap.toFixed(1)} points under the job it is being added to — about ${formatINR((gap / 100) * calcs.executionTotalBase)} of margin.`
                                                        : 'At or above the contract margin.'}
                                            </span>
                                        </div>
                                    );
                                })()}

                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto text-[13px]">
                                    <table className="w-full text-left border-collapse min-w-[800px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                                                <th className="py-3 px-4">Scope Specification</th>
                                                <th className="py-3 px-4 w-32">Category</th>
                                                <th className="py-3 px-4 w-20">Quantity</th>
                                                <th className="py-3 px-4 w-24">Unit Type</th>
                                                <th className="py-3 px-4 w-28">Base Rate (₹)</th>
                                                <th className="py-3 px-4 w-20">Markup %</th>
                                                <th className="py-3 px-4 w-28">Line Cost</th>
                                                <th className="py-3 px-4 w-32">Rate Source Origin</th>
                                                <th className="py-3 px-4 w-12 text-center">Delete</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {draftItems.map((item, index) => (
                                                <tr key={index} className="hover:bg-slate-50/50">
                                                    <td className="py-2 px-4">
                                                        <input 
                                                            type="text" 
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-[#3D52A0] rounded px-2 py-1 text-xs outline-none bg-transparent"
                                                            value={item.description}
                                                            onChange={e => updateDraftItem(index, { description: e.target.value })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <input 
                                                            type="text" 
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-[#3D52A0] rounded px-2 py-1 text-xs outline-none bg-transparent"
                                                            value={item.category}
                                                            onChange={e => updateDraftItem(index, { category: e.target.value })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <input 
                                                            type="number" 
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-[#3D52A0] rounded px-2 py-1 text-xs outline-none bg-transparent text-center font-bold"
                                                            value={item.qty}
                                                            onChange={e => updateDraftItem(index, { qty: Math.max(1, Number(e.target.value) || 1) })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <select
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-[#3D52A0] rounded px-2 py-1 text-xs outline-none bg-transparent"
                                                            value={item.unit}
                                                            onChange={e => updateDraftItem(index, { unit: e.target.value })}
                                                        >
                                                            <option value="sqft">sqft</option>
                                                            <option value="rft">rft</option>
                                                            <option value="lumpsum">lumpsum</option>
                                                            <option value="nos">nos</option>
                                                            <option value="running_row">running row</option>
                                                            <option value="bag">bag</option>
                                                            <option value="brass">brass</option>
                                                        </select>
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <input 
                                                            type="number" 
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-[#3D52A0] rounded px-2 py-1 text-xs outline-none bg-transparent text-slate-800"
                                                            value={item.estimatedUnitRate}
                                                            onChange={e => updateDraftItem(index, { estimatedUnitRate: Math.max(0, Number(e.target.value) || 0) })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <input 
                                                            type="number" 
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-[#3D52A0] rounded px-2 py-1 text-xs outline-none bg-transparent text-center"
                                                            value={item.marginOverride !== undefined ? item.marginOverride : 20}
                                                            onChange={e => updateDraftItem(index, { marginOverride: Math.max(0, Number(e.target.value) || 0) })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4 font-bold text-slate-800">
                                                        {formatINR(item.baseCost)}
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        {item.source === 'library' && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                                                <Check className="w-3 h-3" /> ✓ Rate Library Catalog
                                                            </span>
                                                        )}
                                                        {item.source === 'ai' && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#334486] bg-sky-50 px-2 py-0.5 rounded border border-sky-100 animate-pulse">
                                                                <Sparkles className="w-3 h-3" /> Estimated
                                                            </span>
                                                        )}
                                                        {item.source === 'custom' && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                                <Edit className="w-3 h-3" /> ✎ Custom Override Rate
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-4 text-center">
                                                        <button 
                                                            disabled={draftItems.length === 1}
                                                            onClick={() => deleteDraftItem(index)}
                                                            className="text-slate-400 hover:text-red-500 transition disabled:opacity-30"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex gap-2 text-xs">
                                    <button 
                                        onClick={addCustomRow}
                                        className="text-[#3D52A0] hover:text-[#334486] font-bold flex items-center gap-1 border border-sky-100 bg-sky-50/20 hover:bg-sky-50 text-[11px] px-3 py-1.5 rounded-lg"
                                    >
                                        <PlusCircle className="w-3.5 h-3.5" /> + Append Custom Scope Item
                                    </button>
                                </div>
                            </div>

                            {/* Section breakdown layout configurer */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                
                                {/* Section A: Design Fee Configurer */}
                                <div className="space-y-4 border border-slate-100 bg-slate-50/50 p-4 rounded-xl">
                                    <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider pb-2 border-b border-slate-200">
                                        Design fee
                                    </h5>
                                    
                                    <div className="space-y-3 text-xs">
                                        <div>
                                            <label className="block text-slate-500 mb-1 font-medium">Billing Type Formula</label>
                                            <select 
                                                className="w-full border border-slate-200 p-2 rounded-lg bg-white outline-none focus:outline-sky-500"
                                                value={draftDesignFeeType}
                                                onChange={e => setDraftDesignFeeType(e.target.value as any)}
                                            >
                                                <option value="formula">Standard Automatic Formula (10/11%)</option>
                                                <option value="custom">Manual Fixed Quote</option>
                                                <option value="waived">Waived / Free Modification (₹0)</option>
                                            </select>
                                        </div>

                                        {draftDesignFeeType === 'custom' && (
                                            <div>
                                                <label className="block text-slate-500 mb-1 font-medium">Manual Fixed Fee Amount (₹)</label>
                                                <input 
                                                    type="number" 
                                                    className="w-full border border-slate-200 p-2 rounded-lg bg-white font-bold"
                                                    value={draftCustomDesignFee}
                                                    onChange={e => setDraftCustomDesignFee(Math.max(0, Number(e.target.value) || 0))}
                                                />
                                            </div>
                                        )}
                                        
                                        <div className="bg-sky-50/40 p-2.5 rounded-lg text-[11px] text-slate-800 border border-sky-100">
                                            {classification.type === 'TYPE_A' && draftDesignFeeType === 'formula' ? (
                                                <p>💡 Non-structural material variants (Type A) waive fee by default guidelines.</p>
                                            ) : (
                                                <p>🔒 Subtotal under standard bracket features a structural threshold. 18% GST applies automatically.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Section B: Costing Analytics Preview card */}
                                <div className="lg:col-span-2 space-y-4 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white p-5 rounded-xl border border-sky-900 shadow-sm self-start">
                                    <h5 className="text-xs font-bold text-sky-200 uppercase tracking-wider pb-2 border-b border-sky-900">
                                        What the client will be invoiced
                                    </h5>
                                    
                                    <div className="grid grid-cols-2 gap-4 text-xs font-medium text-sky-200/80">
                                        <div>
                                            <span>Design fee</span>
                                            <div className="text-white font-bold text-sm mt-0.5">{formatINR(calcs.designFeeBase)}</div>
                                            <span className="text-[10px] text-sky-400">+ 18% GST: {formatINR(calcs.designFeeGst)}</span>
                                        </div>
                                        <div>
                                            <span>Extra site work</span>
                                            <div className="text-white font-bold text-sm mt-0.5">{formatINR(calcs.executionTotalBase)}</div>
                                            <span className="text-[10px] text-sky-400">+ 18% GST: {formatINR(calcs.executionGst)}</span>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-sky-900 flex justify-between items-end">
                                        <div>
                                            <span className="text-xs text-sky-400 font-bold block">Invoice total</span>
                                            <span className="text-xs text-[10px] text-sky-400">design fee + site work + GST</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xl font-extrabold text-white">{formatINR(calcs.grandTotal)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Control action buttons */}
                            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 text-xs">
                                <button 
                                    onClick={() => { setClassification(null); }}
                                    className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-50 rounded-lg transition"
                                >
                                    Start over
                                </button>
                                <button 
                                    disabled={isCreating}
                                    onClick={handleCreateAddition}
                                    className="bg-[#3D52A0] text-white px-6 py-2.5 rounded-lg font-bold disabled:opacity-50 hover:bg-[#334486] transition duration-150 flex items-center gap-1.5"
                                >
                                    {isCreating ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
                                            Raising…
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" /> Raise supplementary invoice
                                        </>
                                    )}
                                </button>
                            </div>

                        </div>
                    )}

                </div>
            )}

            {/*
              ONE ADDITION, ACROSS THE WIDTH.

              The card was a vertical stack inside a max-w-6xl column, so on any
              real screen a third of the page was empty while the money sat in a
              narrow ribbon down the middle. The two payable halves and the
              status now sit side by side, which is also how they are decided:
              you look at what the design fee is, what the site work is, and what
              is still owed, in one glance rather than three scrolls.

              Nothing here wears `font-mono`. index.html exempts that class from
              the studio's own font setting, so every figure on this card was
              quietly ignoring the typeface the studio had chosen.
            */}
            <div className="space-y-4">
                {additions.map((add, idx) => {
                    const authorised = !!add.paymentGate?.workAuthorized;
                    const designDue = add.type !== 'TYPE_A' && !add.paymentGate?.designFeePaid;
                    const execDue = !add.paymentGate?.executionPaid;
                    const createdOn = add.createdAt?.seconds
                        ? new Date(add.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                        : 'just now';

                    return (
                    <div
                        key={add.internalDocId || idx}
                        className={`relative bg-white border rounded-2xl overflow-hidden transition ${authorised ? 'border-emerald-200' : 'border-slate-200'}`}
                    >
                        <span
                            aria-hidden
                            className="absolute left-0 top-0 bottom-0 w-[3px]"
                            style={{ background: authorised ? '#0F766E' : '#B45309' }}
                        />

                        {/* ── what was asked for, and what it costs ─────────── */}
                        <div className="pl-6 pr-5 py-4 flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-100">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[13px] font-bold tabular-nums text-slate-800">{add.id}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-500 uppercase tracking-wider">
                                        {add.type === 'TYPE_A' ? 'Finish change' : add.type === 'TYPE_C' ? 'New scope' : 'Alteration'}
                                    </span>
                                    <span className="text-[11px] text-slate-400">raised {createdOn}</span>
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider border ${
                                            authorised
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : 'bg-amber-50 text-amber-700 border-amber-200'
                                        }`}
                                    >
                                        {authorised ? 'Authorised' : 'Awaiting client'}
                                    </span>
                                </div>
                                <p className="text-[13.5px] text-slate-700 mt-1.5 leading-snug">{add.clientRequest}</p>
                                {add.aiReasoning && (
                                    <p className="text-slate-400 text-[11px] mt-1">{add.aiReasoning}</p>
                                )}
                            </div>

                            <div className="shrink-0 lg:text-right">
                                <span className="block text-[11px] text-slate-400">Invoice total</span>
                                <span className="block text-[20px] font-bold tabular-nums text-slate-900 leading-tight">
                                    {formatINR(add.grandTotal)}
                                </span>
                            </div>
                        </div>

                        {/* ── the two payable halves and the status, side by side ── */}
                        <div className="pl-6 pr-5 py-4 grid grid-cols-1 lg:grid-cols-3 gap-5">

                            {/* Design fee */}
                            <div>
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                    <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Design fee</h4>
                                    <span className="text-[9.5px] text-slate-400">incl. 18% GST</span>
                                </div>
                                {add.type === 'TYPE_A' ? (
                                    <p className="text-[12px] text-slate-500 py-2">
                                        Waived — a finish change needs no new drawings.
                                    </p>
                                ) : (
                                    <div className="space-y-1 text-[12px]">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Fee</span>
                                            <span className="tabular-nums text-slate-700">{formatINR(add.designFeeBase)}</span>
                                        </div>
                                        <div className="flex justify-between pb-1.5 border-b border-dashed border-slate-100">
                                            <span className="text-slate-500">GST</span>
                                            <span className="tabular-nums text-slate-700">{formatINR(add.designFeeGst)}</span>
                                        </div>
                                        <div className="flex justify-between pt-1">
                                            <span className="font-bold text-slate-800">Payable</span>
                                            <span className="font-bold tabular-nums text-[#3D52A0]">{formatINR(add.designFeeTotal)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Site work */}
                            <div>
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                    <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Extra site work</h4>
                                    <span className="text-[9.5px] text-slate-400">incl. 18% GST</span>
                                </div>
                                <div className="space-y-1 text-[12px]">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Cost</span>
                                        <span className="tabular-nums text-slate-700">{formatINR(add.executionValue)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Margin</span>
                                        <span className="tabular-nums text-slate-700">{formatINR(add.executionMargin)}</span>
                                    </div>
                                    <div className="flex justify-between pb-1.5 border-b border-dashed border-slate-100">
                                        <span className="text-slate-500">GST</span>
                                        <span className="tabular-nums text-slate-700">{formatINR(add.executionGst)}</span>
                                    </div>
                                    <div className="flex justify-between pt-1">
                                        <span className="font-bold text-slate-800">Payable</span>
                                        <span className="font-bold tabular-nums text-[#3D52A0]">{formatINR(add.executionTotal)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Where it stands, and what releases it */}
                            <div>
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                    <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Where it stands</h4>
                                </div>

                                {/*
                                  Three steps, because that is exactly what the
                                  record holds: this app authorises work only when
                                  both halves are settled, so the gate is not a
                                  separate decision somebody makes.
                                */}
                                <div className="space-y-1.5">
                                    {[
                                        { label: 'Invoice sent to client', done: true },
                                        {
                                            label: add.type === 'TYPE_A' ? 'Design fee waived' : 'Design fee received',
                                            done: add.type === 'TYPE_A' || !!add.paymentGate?.designFeePaid,
                                        },
                                        { label: 'Site work received', done: !!add.paymentGate?.executionPaid },
                                        { label: 'Work released to site', done: authorised },
                                    ].map((step) => (
                                        <div key={step.label} className="flex items-center gap-2">
                                            <span
                                                className={`w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center border ${
                                                    step.done
                                                        ? 'bg-emerald-500 border-emerald-500'
                                                        : 'bg-white border-slate-300'
                                                }`}
                                            >
                                                {step.done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />}
                                            </span>
                                            <span className={`text-[12px] ${step.done ? 'text-slate-600' : 'text-slate-400'}`}>
                                                {step.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-3 flex flex-col gap-2">
                                    {designDue && (
                                        <button
                                            onClick={() => handlePayment(add.internalDocId, 'design', add)}
                                            className="w-full bg-[#3D52A0] hover:bg-[#334486] font-bold text-[11.5px] text-white py-2 rounded-lg transition cursor-pointer"
                                        >
                                            Record design fee received
                                        </button>
                                    )}
                                    {execDue && (
                                        <button
                                            onClick={() => handlePayment(add.internalDocId, 'execution', add)}
                                            className="w-full bg-[#3D52A0] hover:bg-[#334486] font-bold text-[11.5px] text-white py-2 rounded-lg transition cursor-pointer"
                                        >
                                            Record site work received
                                        </button>
                                    )}
                                    {authorised && (
                                        <p className="text-[11.5px] text-emerald-700 leading-snug">
                                            Released{add.paymentGate.workAuthorizedAt?.seconds
                                                ? ` on ${new Date(add.paymentGate.workAuthorizedAt.seconds * 1000).toLocaleDateString('en-IN')}`
                                                : ''}
                                            {add.newDrawingsRequired?.length > 0 && (
                                                <> · {add.newDrawingsRequired.length} drawing {add.newDrawingsRequired.length === 1 ? 'task' : 'tasks'} queued</>
                                            )}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── the line items ────────────────────────────────── */}
                        {add.miniBoq && add.miniBoq.length > 0 && (
                            <div className="pl-6 pr-5 pb-3 pt-1 border-t border-slate-100 bg-slate-50/40">
                                <details className="group">
                                    <summary className="text-[11.5px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer list-none flex items-center gap-1 py-1.5">
                                        <ChevronDown className="w-3.5 h-3.5 transform group-open:rotate-180 transition duration-150" />
                                        {add.miniBoq.length} line {add.miniBoq.length === 1 ? 'item' : 'items'}
                                    </summary>
                                    <div className="mt-2 text-[12px] border border-slate-200 rounded-xl bg-white overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                                                    <th className="py-2 px-3">Item</th>
                                                    <th className="py-2 px-3 w-36">Category</th>
                                                    <th className="py-2 px-3 w-16 text-center">Qty</th>
                                                    <th className="py-2 px-3 w-16">Unit</th>
                                                    <th className="py-2 px-3 w-28 text-right">Rate</th>
                                                    <th className="py-2 px-3 w-20 text-center">Margin</th>
                                                    <th className="py-2 px-3 w-28 text-right">Cost</th>
                                                    <th className="py-2 px-3 w-28">Priced from</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {add.miniBoq.map((item: any, i: number) => (
                                                    <tr key={i} className="hover:bg-slate-50/60">
                                                        <td className="py-2 px-3 text-slate-800">{item.description}</td>
                                                        <td className="py-2 px-3 text-slate-500">{item.category}</td>
                                                        <td className="py-2 px-3 text-center tabular-nums">{item.qty}</td>
                                                        <td className="py-2 px-3 text-slate-500">{item.unit}</td>
                                                        <td className="py-2 px-3 text-right tabular-nums">{formatINR(item.estimatedUnitRate)}</td>
                                                        <td className="py-2 px-3 text-center tabular-nums">{item.marginOverride !== undefined ? item.marginOverride : 20}%</td>
                                                        <td className="py-2 px-3 text-right font-semibold tabular-nums text-slate-700">{formatINR(item.baseCost)}</td>
                                                        <td className="py-2 px-3">
                                                            {item.source === 'library' && <span className="text-[10px] font-bold text-emerald-600">Rate bank</span>}
                                                            {item.source === 'ai' && <span className="text-[10px] font-bold text-[#3D52A0]">AI estimate</span>}
                                                            {item.source === 'custom' && <span className="text-[10px] font-bold text-amber-600">Typed in</span>}
                                                            {!item.source && <span className="text-[10px] font-bold text-slate-400">Archived</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </details>
                            </div>
                        )}

                        {/* ── provenance and the invoice ────────────────────── */}
                        <div className="pl-6 pr-5 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-400 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <span>
                                Priced at the rates of{' '}
                                {add.rateSnapshotDate?.seconds
                                    ? new Date(add.rateSnapshotDate.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                    : 'an earlier date'}
                                {add.miniBoq?.some((i: any) => i.bankId)
                                    ? ' — rate-bank items are checked for drift in the summary above.'
                                    : ' — typed-in items cannot be checked against the rate bank.'}
                            </span>
                            <button
                                onClick={() => generateInvoicePDF(add)}
                                className="shrink-0 text-[#3D52A0] hover:text-[#334486] font-bold flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-md transition cursor-pointer"
                            >
                                <Printer className="w-3.5 h-3.5" /> Invoice PDF
                            </button>
                        </div>
                    </div>
                    );
                })}

                {/* The header already says the contract is untouched and offers
                    "New addition", so a second empty state under it was the same
                    message twice with two buttons. */}
            </div>

        </div>
    );
}
