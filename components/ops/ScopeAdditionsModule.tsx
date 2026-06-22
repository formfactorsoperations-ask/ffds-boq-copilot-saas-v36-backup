import React, { useState, useEffect, useMemo } from 'react';
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
import { classifyScopeAddition, generateScopeAdditionBoq, ScopeAdditionClassification } from '../../services/geminiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ScopeAdditionProps {
    projectId: string;
    projectContext: ProjectContext;
    bank: Item[];
    setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
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

export default function ScopeAdditionsModule({ projectId, projectContext, bank, setProjectContext }: ScopeAdditionProps) {
    const { orgData, currentRole } = useOrg();
    const orgId = orgData?.tenantId || 'demo-tenant-01';
    
    const [additions, setAdditions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // UI Panels toggle
    const [isFormOpen, setIsFormOpen] = useState(false);

    // New additions formulation state
    const [clientRequest, setClientRequest] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [classification, setClassification] = useState<ScopeAdditionClassification | null>(null);
    const [generatedBoq, setGeneratedBoq] = useState<any | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Interactive builder states
    const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
    const [draftDesignFeeType, setDraftDesignFeeType] = useState<'formula' | 'custom' | 'waived'>('formula');
    const [draftCustomDesignFee, setDraftCustomDesignFee] = useState<number>(0);

    // Search and add library items
    const [searchQuery, setSearchQuery] = useState('');
    const [isLibraryDropdownOpen, setIsLibraryDropdownOpen] = useState(false);

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
            const rootProjectRef = doc(db, 'projects', projectId);
            await setDoc(rootProjectRef, {
                context: {
                    scopeAdditionsEnabled: true,
                    boqFrozen: true,
                    currentStage: 6,
                    status: 'execution',
                    designPhaseClosedAt: new Date().toISOString()
                },
                lastModified: Date.now()
            }, { merge: true });

            try {
                const orgProjectRef = doc(db, 'organizations', orgId, 'projects', projectId);
                await setDoc(orgProjectRef, {
                    scopeAdditionsEnabled: true,
                    boqFrozen: true,
                    currentStage: 6,
                    status: 'execution',
                    designPhaseClosedAt: serverTimestamp()
                }, { merge: true });
            } catch (err) {
                console.warn("Nested write failed:", err);
            }

            setProjectContext?.(prev => ({
                ...prev,
                scopeAdditionsEnabled: true,
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

    // Analyze using Gemini Model triggers
    const handleAnalyzeRequest = async () => {
        if (!clientRequest.trim()) return;
        setIsAnalyzing(true);
        setClassification(null);
        setGeneratedBoq(null);

        try {
            const cls = await classifyScopeAddition(
                (projectContext.name || '') + ' ' + (projectContext.config || ''),
                new Date().toISOString(),
                clientRequest
            );
            if (!cls) throw new Error("Failed to classify scope request type");
            setClassification(cls);

            const miniBoq = await generateScopeAdditionBoq(
                cls.type,
                clientRequest,
                (projectContext as any).dimensions || 'Standard',
                (projectContext as any).style || 'Modern',
                (projectContext as any).budgetTier || 'Premium'
            );

            if (miniBoq) {
                // Initialize draft items with details & link to standard library
                const loadedItems: DraftItem[] = miniBoq.items.map(item => {
                    // Try to scan index matches in active bank rate library
                    const bankMatch = bank.find(b => 
                        (b.cat || '').toLowerCase() === (item.category || '').toLowerCase() && 
                        (b.unit || '').toLowerCase() === (item.unit || '').toLowerCase()
                    );
                    
                    if (bankMatch) {
                        const standardRate = bankMatch.materials + bankMatch.labor;
                        return {
                            description: item.description,
                            category: bankMatch.cat || item.category || 'General',
                            unit: bankMatch.unit || item.unit || 'sqft',
                            qty: item.qty,
                            estimatedUnitRate: standardRate > 0 ? standardRate : item.estimatedUnitRate,
                            baseCost: item.qty * (standardRate > 0 ? standardRate : item.estimatedUnitRate),
                            marginOverride: bankMatch.margin || 20,
                            source: 'library',
                            bankId: bankMatch.id
                        };
                    }

                    return {
                        description: item.description,
                        category: item.category || 'General',
                        unit: item.unit || 'sqft',
                        qty: item.qty,
                        estimatedUnitRate: item.estimatedUnitRate,
                        baseCost: item.baseCost,
                        marginOverride: 20,
                        source: 'ai'
                    };
                });

                setDraftItems(loadedItems);
                setDraftDesignFeeType('formula');
                setDraftCustomDesignFee(0);
                setGeneratedBoq(miniBoq);
            }
        } catch (error) {
            console.error("AI Analysis failed:", error);
            alert("AI analysis encountered an issue. Initializing manual template instead.");
            handleSkipAI();
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Manual Bypass formulation
    const handleSkipAI = () => {
        setClassification({
            type: 'TYPE_C',
            reasoning: 'Logged directly via operations override.',
            confidence: 1.0,
            newDrawingsRequired: []
        });
        setDraftItems([
            {
                description: 'Scope Adjustment Item',
                category: 'General Woodwork',
                unit: 'sqft',
                qty: 10,
                estimatedUnitRate: 1500,
                baseCost: 15000,
                marginOverride: 20,
                source: 'custom'
            }
        ]);
        setDraftDesignFeeType('formula');
        setDraftCustomDesignFee(0);
        setGeneratedBoq({
            additionName: 'Manual Entry',
            items: [],
            subTotal: 15000,
            marginAt20Pct: 3000,
            gstAt18Pct: 3240,
            totalExecutionValue: 21240,
            aiNote: 'Manually customized draft.'
        });
    };

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
            setGeneratedBoq(null);
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
            doc.text('Ops Headquarters: Indiranagar, Bengaluru, India', 15, 25);

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
            
            doc.setTextColor(79, 70, 229); // indigo 600
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

            doc.save(`FFDS_Supplementary_Ledger_${projectContext.name?.replace(/\s+/g, '_') || 'Project'}.pdf`);
        } catch (error) {
            console.error(error);
            alert("Export failed, please try again.");
        }
    };

    // Specific Scope addition Invoice PDF generator
    const generateInvoicePDF = (add: any) => {
        try {
            const doc = new jsPDF() as any;
            
            // Slate top banner
            doc.setFillColor(15, 23, 42); 
            doc.rect(0, 0, 210, 40, 'F');
            
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(255, 255, 255);
            doc.text('FORM FACTORS DESIGN STUDIO', 15, 15);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text('INVOICE OF SUPPLEMENTARY SCOPE ADDITIONS • CONTRACT MEMORANDUM', 15, 22);
            doc.text('Corporate Office: Indiranagar, Bengaluru, Karnataka, India', 15, 27);
            doc.text('GSTIN: 29AAGFF5421M1ZC', 15, 32);

            // Document ID & Meta on top right of banner
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(255, 215, 0); // Gold
            doc.text(`INVOICE NO: INV/SA/${projectId.substring(0,6).toUpperCase()}/${add.id}`, 130, 15);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(230, 230, 230);
            doc.text(`Date Logged: ${add.createdAt ? new Date(add.createdAt.seconds * 1000).toLocaleDateString('en-IN') : 'Just now'}`, 130, 22);
            doc.text(`Account Status: ${add.paymentGate?.workAuthorized ? 'AUTHORIZED' : 'PENDING'}`, 130, 28);
            doc.text(`Scope Class: ${add.type}`, 130, 34);

            // Client and Project description details block
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text('BILL TO:', 15, 52);
            doc.text('PROJECT SITE DETAILS:', 110, 52);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(71, 85, 105);
            doc.text(`Client Name: ${projectContext.clientName || 'Valued Partner'}`, 15, 58);
            doc.text(`Client Email: ${projectContext.clientEmail || 'N/A'}`, 15, 63);
            doc.text(`Billing Contact: ${projectContext.clientPhone || 'N/A'}`, 15, 68);

            doc.text(`Project Name: ${projectContext.name || 'FFDS Site'}`, 110, 58);
            doc.text(`Site Configuration: ${projectContext.config || 'General Plan'}`, 110, 63);
            doc.text(`Ops Manager: ${add.createdBy || 'Ops Director'}`, 110, 68);

            doc.setDrawColor(226, 232, 240);
            doc.line(15, 73, 195, 73);

            // Overview request description
            doc.setFont('helvetica', 'bold');
            doc.text('Original Client Request Instruction:', 15, 79);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            
            // handle multi-line string wrapping
            const splitRequest = doc.splitTextToSize(add.clientRequest || 'Custom instruction', 180);
            doc.text(splitRequest, 15, 84);

            let tableStartY = 95 + (splitRequest.length * 4);

            // Itemized table using autoTable
            const itemizedRows = (add.miniBoq || []).map((item: any, idx: number) => {
                const sourceBadge = item.source === 'library' ? 'Rate Library' : (item.source === 'ai' ? 'AI Estimate' : 'Manual');
                return [
                    idx + 1,
                    item.description || 'Supplementary scope item',
                    item.category || 'General',
                    item.qty || 1,
                    item.unit || 'sqft',
                    `Rs ${Math.floor(item.estimatedUnitRate || 0).toLocaleString('en-IN')}`,
                    `${item.marginOverride || 20}%`,
                    `Rs ${Math.floor(item.baseCost || 0).toLocaleString('en-IN')}`
                ];
            });

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text('Bill of Quantities (Subtotal breakdown):', 15, tableStartY - 3);

            autoTable(doc, {
                startY: tableStartY,
                head: [['S No.', 'Item Specification Spec', 'Category', 'Qty', 'Unit', 'Base Rate', 'Markup', 'Base Cost']],
                body: itemizedRows,
                headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontSize: 8 },
                bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
                columnStyles: {
                    0: { cellWidth: 10 },
                    1: { cellWidth: 55 },
                    6: { halign: 'center' },
                    7: { halign: 'right', fontStyle: 'bold' }
                },
                theme: 'striped'
            });

            let finalY = (doc as any).lastAutoTable.finalY + 8;

            // Grand Ledger Split
            // left grid: ICICI Bank Details
            doc.setFillColor(248, 250, 252);
            doc.rect(15, finalY, 85, 32, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.rect(15, finalY, 85, 32, 'S');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.text('BANK ESCROW FOR WIRE TRANSFERS:', 18, finalY + 6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            doc.text('Account Name: Form Factors Design Studio LLP', 18, finalY + 12);
            doc.text('Bank: ICICI Bank Ltd., Indiranagar branch', 18, finalY + 16);
            doc.text('Current A/C No: 0034050012354', 18, finalY + 20);
            doc.text('IFSC Code: ICIC0000034', 18, finalY + 24);
            doc.text('Payment Type: NEFT, RTGS or IMPS only.', 18, finalY + 28);

            // right grid: financial summaries
            doc.setFont('helvetica', 'bold');
            doc.text('FINANCIAL STATEMENT:', 115, finalY + 6);
            doc.setFont('helvetica', 'normal');
            doc.text('Section A: Design Fee Subtotal', 115, finalY + 13);
            doc.text(`Rs ${Math.floor(add.designFeeBase || 0).toLocaleString('en-IN')}`, 175, finalY + 13, { align: 'right' });

            doc.text('Section A: Design GST (18%)', 115, finalY + 17);
            doc.text(`Rs ${Math.floor(add.designFeeGst || 0).toLocaleString('en-IN')}`, 175, finalY + 17, { align: 'right' });

            doc.text('Section B: Execution (inc. margin)', 115, finalY + 21);
            doc.text(`Rs ${Math.floor(add.executionSubtotal + add.executionMargin).toLocaleString('en-IN')}`, 175, finalY + 21, { align: 'right' });

            doc.text('Section B: Execution GST (18%)', 115, finalY + 25);
            doc.text(`Rs ${Math.floor(add.executionGst || 0).toLocaleString('en-IN')}`, 175, finalY + 25, { align: 'right' });

            doc.setDrawColor(15, 23, 42);
            doc.line(115, finalY + 27, 180, finalY + 27);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('Grand Total Payable:', 115, finalY + 31);
            doc.setTextColor(79, 70, 229);
            doc.text(`Rs ${Math.floor(add.grandTotal || 0).toLocaleString('en-IN')}`, 175, finalY + 31, { align: 'right' });

            // Signature approval lines
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.text('AUTHORIZED SIGNATORY (FFDS)', 25, finalY + 48);
            doc.text('CLIENT SIGNATURE & SEAL', 130, finalY + 48);

            doc.setDrawColor(15, 23, 42);
            doc.line(15, finalY + 44, 85, finalY + 44);
            doc.line(115, finalY + 44, 185, finalY + 44);

            doc.save(`FFDS_Invoice_${add.id}_${projectContext.name?.replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            console.error(error);
            alert("Error constructing Invoice PDF layout.");
        }
    };

    if (!projectContext.scopeAdditionsEnabled) {
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
                        <span className="text-[10px] font-bold tracking-wider text-indigo-600 uppercase block mb-1">Method 1 (Standard Operations)</span>
                        <h4 className="font-bold text-slate-800 text-xs mb-1.5">Activate Design Complete Gate</h4>
                        <p className="text-slate-500 text-[11px] leading-relaxed">
                            Under <strong>Design & Proposals</strong> &gt; <strong>Design Complete</strong>, tick all items on the design closeout checklist and choose "Activate Design Gate". This automatically freezes the BOQ, shifts the project stage to Execution, and activates this module.
                        </p>
                    </div>

                    <div className="p-4 rounded-xl border border-indigo-150 bg-indigo-50/35">
                        <span className="text-[10px] font-bold tracking-wider text-indigo-700 uppercase block mb-1">Method 2 (Ops Sandbox Bypass)</span>
                        <h4 className="font-bold text-indigo-950 text-xs mb-1.5">Instant Execution Override</h4>
                        <p className="text-indigo-800/80 text-[11px] leading-relaxed">
                            For administrators, sandbox users, and operations managers, click the toggle below to bypass the checklist gate, freeze the current BOQ snapshot in the cloud, and unlock the workspace immediately.
                        </p>
                    </div>
                </div>

                {/* Bypass Trigger Button */}
                <div className="w-full pt-4 border-t border-slate-100 flex flex-col items-center justify-center">
                    <button
                        onClick={handleBypassUnlock}
                        disabled={isUnlocking}
                        className="bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white px-6 py-3 rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-98 disabled:opacity-50"
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
            <div className="flex flex-col items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-slate-500 font-medium text-sm">Syncing latest changes orders...</p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            
            {/* Header Area */}
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 font-serif">Scope Additions & Extra Items</h1>
                    <p className="text-sm text-slate-500">Log client alterations, adjust line-item pricing margins, and generate PDF Tax Invoices.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsFormOpen(!isFormOpen)}
                        className="bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white px-4 py-2.5 rounded-lg flex items-center gap-1.5 shadow-sm transition duration-150"
                    >
                        <Plus className="w-4 h-4" /> Log Proposed Alteration
                    </button>
                    {additions.length > 0 && (
                        <button 
                            onClick={generateLifetimeLedger}
                            className="bg-slate-800 hover:bg-slate-900 font-bold text-xs text-white px-4 py-2.5 rounded-lg flex items-center gap-1.5 shadow-sm transition duration-150"
                        >
                            <FileText className="w-4 h-4" /> Export Combined Ledger PDF
                        </button>
                    )}
                </div>
            </div>

            {/* Configured Builder Form Panel */}
            {isFormOpen && (
                <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-md space-y-6 transition duration-200">
                    <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                        <div>
                            <span className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase">Active Draft Phase</span>
                            <h3 className="font-bold text-slate-900 text-lg">Formulate Contract Modification</h3>
                        </div>
                        <button 
                            onClick={() => { setIsFormOpen(false); setClassification(null); setGeneratedBoq(null); }}
                            className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                        >
                            Cancel Formulation
                        </button>
                    </div>

                    {!classification && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Original Client Request Scope</label>
                                <textarea 
                                    className="w-full border border-slate-200 p-4 rounded-xl text-sm bg-slate-50 focus:bg-white transition-colors min-h-[100px] shadow-inner focus:outline-indigo-500" 
                                    placeholder="e.g. Add 3 extra electrical power plug points in kitchen, provide custom partition wall in master bed, and install premium quartz counter instead of granite..." 
                                    value={clientRequest} 
                                    onChange={e => setClientRequest(e.target.value)} 
                                />
                            </div>
                            
                            <div className="flex gap-2.5">
                                <button 
                                    disabled={isAnalyzing || !clientRequest.trim()}
                                    onClick={handleAnalyzeRequest}
                                    className="bg-indigo-600 font-bold text-xs text-white px-5 py-3 rounded-xl disabled:opacity-50 hover:bg-indigo-700 transition duration-150 flex items-center justify-center gap-2 shadow-sm"
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
                                            Analyzing via Gemini Agent...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
                                            Analyze with Gemini AI Heuristics
                                        </>
                                    )}
                                </button>
                                <button 
                                    onClick={handleSkipAI}
                                    className="bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-bold text-xs px-5 py-3 rounded-xl transition duration-150"
                                >
                                    Log Manually (Direct Standard Estimate)
                                </button>
                            </div>
                        </div>
                    )}

                    {classification && (
                        <div className="space-y-6">
                            
                            {/* Classification result banner */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-start justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold text-base border border-indigo-200">
                                        {classification.type.split('_')[1] || classification.type}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-sm">
                                            {classification.type === 'TYPE_A' ? 'Material Update (Type A — Non-structural alteration)' :
                                             classification.type === 'TYPE_B' ? 'Minor Scope Increment (Type B — Checklist gate addition)' :
                                             classification.type === 'TYPE_C' ? 'Major New Area Scope (Type C — Structural draft addition)' : 
                                             'Complex Space Redesign (Type D)'}
                                        </h4>
                                        <p className="text-slate-600 text-xs mt-1 leading-relaxed">{classification.reasoning}</p>
                                        {classification.newDrawingsRequired?.length > 0 && (
                                            <div className="mt-2 text-[10px] font-bold text-indigo-700 bg-indigo-50 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-indigo-100">
                                                <Info className="w-3 h-3" /> Creates {classification.newDrawingsRequired.length} working drawing tasks: {classification.newDrawingsRequired.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">AI Match Confidence</span>
                                    <span className="font-mono text-sm font-bold text-slate-700 bg-white border px-2.5 py-1 rounded-lg">{(classification.confidence * 100).toFixed(0)}% Match</span>
                                </div>
                            </div>

                            {/* Portfolio margin warning preview */}
                            {currentRole && ['Super Admin', 'Admin', 'Ops Director'].includes(currentRole) && marginAnalytics && (
                                <div className="bg-slate-900 text-slate-200 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <TrendingUp className="w-5 h-5 text-indigo-400" />
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Firm-wide Margin Health Impact</div>
                                            <div className="flex items-baseline gap-2 mt-0.5">
                                                <span className="text-slate-400 text-xs">Current Blended: {marginAnalytics.blendedMarginPct?.toFixed(1)}%</span>
                                                <span className="text-slate-600">→</span>
                                                <span className={`font-bold font-mono text-lg ${ (((marginAnalytics.totalFirmMargin || 0) + calcs.marginTotal) / ((marginAnalytics.totalFirmBase || 0) + calcs.subTotal) * 100) < feeFloors.marginDefault ? 'text-amber-400 animate-pulse' : 'text-emerald-400' }`}>
                                                    { (((marginAnalytics.totalFirmMargin || 0) + calcs.marginTotal) / ((marginAnalytics.totalFirmBase || 0) + calcs.subTotal) * 100).toFixed(1) }% Blended Post-Alteration
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {(((marginAnalytics.totalFirmMargin || 0) + calcs.marginTotal) / ((marginAnalytics.totalFirmBase || 0) + calcs.subTotal) * 100) < feeFloors.marginDefault && (
                                        <div className="bg-amber-950/40 text-amber-300 font-bold text-[10px] px-3 py-1.5 rounded-lg border border-amber-900/50 max-w-[280px] leading-tight">
                                            ⚠️ This modification erodes global commercial metrics. Adjust item-level margins above 20% to compensate.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Interactive Editable Draft Mini-BOQ Table */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                         Itemized Scope Breakdown <span className="text-xs font-normal text-slate-500">(Double check quantities and spec origins)</span>
                                    </h4>
                                    
                                    {/* Active rate dropdown loader */}
                                    <div className="relative">
                                        <button 
                                            onClick={() => setIsLibraryDropdownOpen(!isLibraryDropdownOpen)}
                                            className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
                                        >
                                            <Search className="w-3.5 h-3.5" /> Log item from Rate Library
                                        </button>
                                        
                                        {isLibraryDropdownOpen && (
                                            <div className="absolute right-0 mt-2 w-96 bg-white border border-slate-300 rounded-xl shadow-xl z-30 p-3 space-y-2 max-h-80 overflow-y-auto">
                                                <div className="flex items-center border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50">
                                                    <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                                                    <input 
                                                        className="bg-transparent text-xs outline-none w-full"
                                                        placeholder="Type keywords (e.g. partition, ceiling, laminate)..."
                                                        value={searchQuery}
                                                        onChange={e => setSearchQuery(e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-bold text-slate-400 block mb-1">Standard Item Matches</span>
                                                    {filteredLibraryItems.length === 0 ? (
                                                        <p className="text-[11px] text-slate-500 text-center py-2">No matching rates in active catalog.</p>
                                                    ) : (
                                                        filteredLibraryItems.map(item => {
                                                            const total = item.materials + item.labor;
                                                            return (
                                                                <button 
                                                                    key={item.id} 
                                                                    onClick={() => handleAddLibraryItem(item)}
                                                                    className="w-full text-left p-2 hover:bg-slate-50 rounded-lg flex justify-between items-center border border-transparent hover:border-slate-100 transition"
                                                                >
                                                                    <div className="truncate pr-4">
                                                                        <div className="text-[11px] font-bold text-slate-800 truncate">{item.name}</div>
                                                                        <span className="text-[9px] text-slate-400 uppercase tracking-tight">{item.cat || 'General'} • {item.unit}</span>
                                                                    </div>
                                                                    <span className="text-xs font-bold text-slate-700 font-mono flex-shrink-0">{formatINR(total)}</span>
                                                                </button>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

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
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-indigo-500 rounded px-2 py-1 text-xs outline-none bg-transparent"
                                                            value={item.description}
                                                            onChange={e => updateDraftItem(index, { description: e.target.value })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <input 
                                                            type="text" 
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-indigo-500 rounded px-2 py-1 text-xs outline-none bg-transparent"
                                                            value={item.category}
                                                            onChange={e => updateDraftItem(index, { category: e.target.value })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <input 
                                                            type="number" 
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-indigo-500 rounded px-2 py-1 text-xs outline-none bg-transparent text-center font-mono font-bold"
                                                            value={item.qty}
                                                            onChange={e => updateDraftItem(index, { qty: Math.max(1, Number(e.target.value) || 1) })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <select
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-indigo-500 rounded px-2 py-1 text-xs outline-none bg-transparent"
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
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-indigo-500 rounded px-2 py-1 text-xs outline-none bg-transparent font-mono text-slate-800"
                                                            value={item.estimatedUnitRate}
                                                            onChange={e => updateDraftItem(index, { estimatedUnitRate: Math.max(0, Number(e.target.value) || 0) })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <input 
                                                            type="number" 
                                                            className="w-full border border-slate-200/80 hover:border-slate-300 focus:border-indigo-500 rounded px-2 py-1 text-xs outline-none bg-transparent text-center font-mono"
                                                            value={item.marginOverride !== undefined ? item.marginOverride : 20}
                                                            onChange={e => updateDraftItem(index, { marginOverride: Math.max(0, Number(e.target.value) || 0) })}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-4 font-mono font-bold text-slate-800">
                                                        {formatINR(item.baseCost)}
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        {item.source === 'library' && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                                                <Check className="w-3 h-3" /> ✓ Rate Library Catalog
                                                            </span>
                                                        )}
                                                        {item.source === 'ai' && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 animate-pulse">
                                                                <Sparkles className="w-3 h-3" /> ⚡ AI Estimate Link
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
                                        className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 border border-indigo-100 bg-indigo-50/20 hover:bg-indigo-50 text-[11px] px-3 py-1.5 rounded-lg"
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
                                        Section A: Associated Architectural Design Fee
                                    </h5>
                                    
                                    <div className="space-y-3 text-xs">
                                        <div>
                                            <label className="block text-slate-500 mb-1 font-medium">Billing Type Formula</label>
                                            <select 
                                                className="w-full border border-slate-200 p-2 rounded-lg bg-white outline-none focus:outline-indigo-500"
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
                                                    className="w-full border border-slate-200 p-2 rounded-lg bg-white font-mono font-bold"
                                                    value={draftCustomDesignFee}
                                                    onChange={e => setDraftCustomDesignFee(Math.max(0, Number(e.target.value) || 0))}
                                                />
                                            </div>
                                        )}
                                        
                                        <div className="bg-indigo-50/40 p-2.5 rounded-lg text-[11px] text-indigo-900 border border-indigo-100">
                                            {classification.type === 'TYPE_A' && draftDesignFeeType === 'formula' ? (
                                                <p>💡 Non-structural material variants (Type A) waive fee by default guidelines.</p>
                                            ) : (
                                                <p>🔒 Subtotal under standard bracket features a structural threshold. 18% GST applies automatically.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Section B: Costing Analytics Preview card */}
                                <div className="lg:col-span-2 space-y-4 bg-indigo-950 text-white p-5 rounded-xl border border-indigo-900 shadow-sm self-start">
                                    <h5 className="text-xs font-bold text-indigo-200 uppercase tracking-wider pb-2 border-b border-indigo-900">
                                        Contract Invoice Financial Analytics
                                    </h5>
                                    
                                    <div className="grid grid-cols-2 gap-4 text-xs font-medium text-indigo-200/80">
                                        <div>
                                            <span>Section A: Design Fee</span>
                                            <div className="text-white font-bold text-sm mt-0.5">{formatINR(calcs.designFeeBase)}</div>
                                            <span className="text-[10px] text-indigo-400 font-mono">+ 18% GST: {formatINR(calcs.designFeeGst)}</span>
                                        </div>
                                        <div>
                                            <span>Section B: Execution Base</span>
                                            <div className="text-white font-bold text-sm mt-0.5">{formatINR(calcs.executionTotalBase)}</div>
                                            <span className="text-[10px] text-indigo-400 font-mono">+ 18% GST: {formatINR(calcs.executionGst)}</span>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-indigo-900 flex justify-between items-end">
                                        <div>
                                            <span className="text-xs text-indigo-400 font-bold block">TOTAL COMMITTED PAYABLE</span>
                                            <span className="text-xs text-[10px] text-indigo-400">Section A + Section B + GST</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xl font-extrabold text-white font-mono">{formatINR(calcs.grandTotal)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Control action buttons */}
                            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 text-xs">
                                <button 
                                    onClick={() => { setClassification(null); setGeneratedBoq(null); }}
                                    className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-50 rounded-lg transition"
                                >
                                    Restart AI Analysis
                                </button>
                                <button 
                                    disabled={isCreating}
                                    onClick={handleCreateAddition}
                                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold disabled:opacity-50 hover:bg-indigo-700 transition duration-150 flex items-center gap-1.5"
                                >
                                    {isCreating ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
                                            Saving Invoice...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" /> Finalize & Save Bundled Invoice
                                        </>
                                    )}
                                </button>
                            </div>

                        </div>
                    )}

                </div>
            )}

            {/* Historical list details cards */}
            <div className="space-y-4">
                {additions.map((add, idx) => (
                    <div key={add.internalDocId || idx} className={`bg-white border rounded-xl overflow-hidden shadow-sm transition ${add.paymentGate?.workAuthorized ? 'border-emerald-200' : 'border-amber-200'}`}>
                        
                        {/* Summary bar */}
                        <div className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-inherit ${add.paymentGate?.workAuthorized ? 'bg-emerald-50/30' : 'bg-amber-50/30'}`}>
                            <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border shrink-0 ${add.paymentGate?.workAuthorized ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-amber-100 border-amber-200 text-amber-700'}`}>
                                    {add.paymentGate?.workAuthorized ? <CheckCircle2 className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-800 text-sm font-mono">{add.id}</span>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-200 text-slate-600 uppercase tracking-tight">{add.type}</span>
                                        <span className="text-[10px] text-slate-400">Created: {add.createdAt ? new Date(add.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-700 mt-1">{add.clientRequest}</p>
                                    {add.aiReasoning && (
                                        <p className="text-slate-500 text-[11px] mt-0.5 italic">Rationale: {add.aiReasoning}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-start w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                                <span className="text-xs text-slate-400">Grand Total Invoice</span>
                                <span className="text-lg font-extrabold text-slate-800 font-mono">{formatINR(add.grandTotal)}</span>
                            </div>
                        </div>

                        {/* Financial segments splitting */}
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white">
                            
                            {/* Section A: Design components info */}
                            <div className="border border-indigo-100 bg-indigo-50/20 rounded-lg p-3">
                                <div className="flex justify-between items-center border-b border-indigo-100 pb-2 mb-2">
                                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">Section A: Architectural Design Fee</h4>
                                    <span className="text-[10px] font-semibold text-indigo-600 bg-white border border-indigo-100 px-1.5 py-0.5 rounded">Tax 18% GST</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Net Fee Base Estimate</span>
                                        <span className="font-medium text-slate-800">{formatINR(add.designFeeBase)}</span>
                                    </div>
                                    <div className="flex justify-between pb-1.5 border-b border-dashed border-indigo-100">
                                        <span className="text-slate-500">Design CGST + SGST (18%)</span>
                                        <span className="font-medium text-slate-800">{formatINR(add.designFeeGst)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-sm text-slate-900 pt-1">
                                        <span>Total Design Payable</span>
                                        <span className="font-mono text-indigo-700">{formatINR(add.designFeeTotal)}</span>
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between">
                                    {add.type === 'TYPE_A' ? (
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-md w-full text-center">Waived (No structural layout change)</span>
                                    ) : add.paymentGate?.designFeePaid ? (
                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-md w-full text-center border border-emerald-100 flex items-center justify-center gap-1">
                                             ✓ Design Payment Recorded Office
                                        </span>
                                    ) : (
                                        <button 
                                            onClick={() => handlePayment(add.internalDocId, 'design', add)}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white py-1.5 rounded transition shadow-sm"
                                        >
                                            Mark Section A Paid (Clearance)
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Section B: Execution additions */}
                            <div className="border border-blue-100 bg-blue-50/20 rounded-lg p-3">
                                <div className="flex justify-between items-center border-b border-blue-100 pb-2 mb-2">
                                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Section B: Extra Materials & Site labor</h4>
                                    <span className="text-[10px] font-semibold text-blue-600 bg-white border border-blue-100 px-1.5 py-0.5 rounded">Tax 18% GST</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Subtotal</span>
                                        <span className="font-medium text-slate-800">{formatINR(add.executionSubtotal)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Applied Margin Markups</span>
                                        <span className="font-medium text-slate-850">{formatINR(add.executionMargin)}</span>
                                    </div>
                                    <div className="flex justify-between pb-1.5 border-b border-dashed border-blue-100">
                                        <span className="text-slate-500">Execution GST (18%)</span>
                                        <span className="font-medium text-slate-800">{formatINR(add.executionGst)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-sm text-slate-900 pt-1">
                                        <span>Total Execution Scope</span>
                                        <span className="font-mono text-blue-700">{formatINR(add.executionTotal)}</span>
                                    </div>
                                </div>

                                <div className="mt-4">
                                    {add.paymentGate?.executionPaid ? (
                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-md w-full text-center border border-emerald-100 flex items-center justify-center gap-1">
                                             ✓ Execution Payment Settled
                                        </span>
                                    ) : (
                                        <button 
                                            onClick={() => handlePayment(add.internalDocId, 'execution', add)}
                                            className="w-full bg-blue-600 hover:bg-blue-700 font-bold text-xs text-white py-1.5 rounded transition shadow-sm"
                                        >
                                            Mark Section B Paid (Cleared to execute)
                                        </button>
                                    )}
                                </div>
                            </div>

                        </div>

                        {/* Detailed BOQ collapse display */}
                        {add.miniBoq && add.miniBoq.length > 0 && (
                            <div className="px-4 pb-3 pt-1 border-t border-slate-100 bg-slate-50/30">
                                <details className="group">
                                    <summary className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer list-none flex items-center gap-1 py-1">
                                        <ChevronDown className="w-3.5 h-3.5 transform group-open:rotate-180 transition duration-150" />
                                        View Line Items specifications & markup breakdown ({add.miniBoq.length} items logged)
                                    </summary>
                                    <div className="mt-2 text-xs border border-slate-100 rounded-lg bg-white overflow-hidden shadow-inner">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 font-bold uppercase">
                                                    <th className="py-2 px-3">Specification Name</th>
                                                    <th className="py-2 px-3 w-32">Category</th>
                                                    <th className="py-2 px-3 w-16 text-center">Qty</th>
                                                    <th className="py-2 px-3 w-16">Unit</th>
                                                    <th className="py-2 px-3 w-28">Est Rate</th>
                                                    <th className="py-2 px-3 w-20 text-center">Margin</th>
                                                    <th className="py-2 px-3 w-28">Line Subtotal</th>
                                                    <th className="py-2 px-3 w-28">Snapshot Source</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 font-medium">
                                                {add.miniBoq.map((item: any, i: number) => (
                                                    <tr key={i} className="hover:bg-slate-50/50">
                                                        <td className="py-2 px-3 text-slate-800">{item.description}</td>
                                                        <td className="py-2 px-3 text-slate-500">{item.category}</td>
                                                        <td className="py-2 px-3 text-center">{item.qty}</td>
                                                        <td className="py-2 px-3 text-slate-500">{item.unit}</td>
                                                        <td className="py-2 px-3">{formatINR(item.estimatedUnitRate)}</td>
                                                        <td className="py-2 px-3 text-center">{item.marginOverride !== undefined ? item.marginOverride : 20}%</td>
                                                        <td className="py-2 px-3 font-semibold text-slate-700">{formatINR(item.baseCost)}</td>
                                                        <td className="py-2 px-3">
                                                            {item.source === 'library' && <span className="text-[9px] font-bold text-emerald-600">Rate Library</span>}
                                                            {item.source === 'ai' && <span className="text-[9px] font-bold text-indigo-600">AI Estimate</span>}
                                                            {item.source === 'custom' && <span className="text-[9px] font-bold text-amber-600">Custom Manual</span>}
                                                            {!item.source && <span className="text-[9px] font-bold text-slate-400">Archived Record</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </details>
                            </div>
                        )}

                        {/* Footer status blocks */}
                        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-150 text-[10px] text-slate-500 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <span>
                                Rate Snapshot Sourced on: {add.rateSnapshotDate ? new Date(add.rateSnapshotDate.seconds * 1000).toLocaleString('en-IN') : 'Archive'}. Execution commences upon Section payment clearances.
                            </span>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => generateInvoicePDF(add)}
                                    className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-sm transition"
                                >
                                    <Printer className="w-3.5 h-3.5" /> Download Tax Invoice PDF
                                </button>
                            </div>
                        </div>

                        {add.paymentGate?.workAuthorized && (
                            <div className="px-4 py-2 bg-emerald-50 border-t border-emerald-100 text-xs font-semibold text-emerald-800 flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                                    ✓ Work Authorized on {add.paymentGate.workAuthorizedAt ? new Date(add.paymentGate.workAuthorizedAt.seconds * 1000).toLocaleDateString('en-IN') : 'Just now'}
                                </span>
                                {add.newDrawingsRequired?.length > 0 ? (
                                    <span className="text-[10px] bg-emerald-100 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
                                         Queued {add.newDrawingsRequired.length} Drawing task updates
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-slate-400 font-normal italic">No supplementary plans needed</span>
                                )}
                            </div>
                        )}
                        
                    </div>
                ))}

                {additions.length === 0 && (
                    <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 py-16 shadow-inner space-y-2">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-400">
                            ✓
                        </div>
                        <h4 className="font-bold text-slate-800">No Post-Agreement Alterations Logged</h4>
                        <p className="text-slate-400 text-xs max-w-sm mx-auto">Click "Log Proposed Alteration" above to draft a budget deviation using Gemini estimation or direct catalogue rates.</p>
                    </div>
                )}
            </div>

        </div>
    );
}
