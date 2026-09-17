import React, { useMemo, useState, useEffect } from 'react';
import { ProjectContext, FullBoqItem } from '../../types';
import { generateId } from '../../lib/utils';
import Card from '../shared/Card';
import { 
  CheckCircle, 
  Bolt, 
  LayoutList, 
  Printer, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  FileCheck2, 
  PlusCircle, 
  ChevronRight, 
  Sparkles, 
  ClipboardCheck,
  AlertCircle,
  FolderOpen
} from 'lucide-react';

interface PreHandoverChecklistProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    boq: FullBoqItem[];
    onNavigateToTab?: (tab: string) => void;
}

const STANDARD_CHECKS = [
    { id: 'paint', label: 'Final Paint Touch-ups (Skirting, Grooves & Cornice)', category: 'Finishes & Paint' },
    { id: 'hardware', label: 'Cabinet Shutters Aligned & Hardware Tightened', category: 'Woodwork & Hardware' },
    { id: 'clean', label: 'Deep Cleaning (Inside Cabinets, Drawers & Floors)', category: 'Cleaning & Handover' },
    { id: 'electrical', label: 'All Switchboards Clean, Straight & Plate Covers Snapped', category: 'Electrical & Fixtures' },
    { id: 'plumbing', label: 'Angle Cocks, Faucets & Drain Lines Leak-tested', category: 'Plumbing & Sanitary' },
    { id: 'debris', label: 'Site Debris Cleared & Surface Protection Removed', category: 'Cleaning & Handover' },
];

const STANDARD_ELECTRICAL_ITEMS = [
    "Panel Light", "COB", "Spot Set of 3", "Cove Light", "Fan", "Hanging Light",
    "Track Light", "Profile Light", "Safety Door Point", "Shoe Rack Plug Point",
    "TV Unit Plug Point", "Crockery Unit Plug Point", "Below Pedestal Plug Point",
    "Sofa Back Plug Point", "Mandir Plug Point", "Wardrobe Plug Point",
    "AC Point", "Geyser Point", "Exhaust Point"
];

const PreHandoverChecklist: React.FC<PreHandoverChecklistProps> = ({ projectContext, setProjectContext, boq, onNavigateToTab }) => {
    
    // Switch between checklist & electrical table views
    const [viewMode, setViewMode] = useState<'checklist' | 'electrical-plan'>('checklist');
    const [activeRoomId, setActiveRoomId] = useState<string>('');
    const [newCustomCheck, setNewCustomCheck] = useState<string>('');
    const [showPrintWarning, setShowPrintWarning] = useState(false);

    // Initial state sync / bootstrap qualityChecklist if empty
    useEffect(() => {
        if (!projectContext.qualityChecklist) {
            setProjectContext(prev => ({
                ...prev,
                qualityChecklist: {
                    checkedState: {},
                    elecVerified: {},
                    customChecks: [],
                    notesState: {},
                    naState: {}
                }
            }));
        }
    }, [projectContext.qualityChecklist, setProjectContext]);

    // Bootstrap electricalPointsPlan from BOQ
    useEffect(() => {
        if (!projectContext.electricalPointsPlan || projectContext.electricalPointsPlan.length === 0) {
            const initialPlan: { id: string; roomId: string; roomName?: string; item: string; qty: number; notes: string }[] = [];
            
            boq.forEach(item => {
                 const isElectrical = item.cat?.toLowerCase().includes('electrical') || 
                                      item.name?.toLowerCase().includes('switch') || 
                                      item.name?.toLowerCase().includes('socket') || 
                                      item.name?.toLowerCase().includes('point') ||
                                      item.name?.toLowerCase().includes('light');
                 if (isElectrical) {
                      const rId = item.roomId || 'unassigned';
                      initialPlan.push({
                          id: generateId(),
                          roomId: rId,
                          item: item.name,
                          qty: item.qty || 1,
                          notes: ''
                      });
                 }
            });

            if (initialPlan.length > 0) {
                setProjectContext(prev => ({ ...prev, electricalPointsPlan: initialPlan }));
            }
        }
    }, [boq, projectContext.rooms, projectContext.electricalPointsPlan, setProjectContext]);

    // Resolve persistent state values cleanly and defensively
    const checkedState = (projectContext.qualityChecklist?.checkedState && typeof projectContext.qualityChecklist.checkedState === 'object')
        ? projectContext.qualityChecklist.checkedState
        : {};
    const elecVerified = (projectContext.qualityChecklist?.elecVerified && typeof projectContext.qualityChecklist.elecVerified === 'object')
        ? projectContext.qualityChecklist.elecVerified
        : {};
    const customChecks = Array.isArray(projectContext.qualityChecklist?.customChecks)
        ? projectContext.qualityChecklist.customChecks
        : [];
    const notesState = (projectContext.qualityChecklist?.notesState && typeof projectContext.qualityChecklist.notesState === 'object')
        ? projectContext.qualityChecklist.notesState
        : {};
    const naState = (projectContext.qualityChecklist?.naState && typeof projectContext.qualityChecklist.naState === 'object')
        ? projectContext.qualityChecklist.naState
        : {};

    // Helper to calculate total electrical points per room from plan
    const roomElectricalCounts = useMemo(() => {
        const counts: Record<string, { total: number; items: { name: string; qty: number }[] }> = {};
        const plan = projectContext.electricalPointsPlan || [];
        
        plan.forEach(ep => {
            if (!ep) return;
            const rId = ep.roomId || 'unassigned';
            if (!counts[rId]) {
                counts[rId] = { total: 0, items: [] };
            }
            const qty = typeof ep.qty === 'number' ? ep.qty : parseInt(ep.qty as any) || 0;
            counts[rId].total += (isNaN(qty) ? 0 : qty);
            
            const epItemName = ep.item || '';
            const existing = counts[rId].items.find(i => i.name === epItemName);
            if (existing) {
                existing.qty += (isNaN(qty) ? 0 : qty);
            } else {
                counts[rId].items.push({ name: epItemName, qty: (isNaN(qty) ? 0 : qty) });
            }
        });
        return counts;
    }, [projectContext.electricalPointsPlan]);

    // Resolve room contexts
    const rooms = useMemo(() => {
        return projectContext.rooms || [];
    }, [projectContext.rooms]);

    // Set first room active if none set
    useEffect(() => {
        if (rooms.length > 0 && !activeRoomId) {
            setActiveRoomId(rooms[0].id || rooms[0].name);
        }
    }, [rooms, activeRoomId]);

    // Group checks by room for calculations
    const roomSummaries = useMemo(() => {
        return rooms.map(room => {
            const rId = room.id || room.name;
            const roomChecks = (checkedState[rId] && typeof checkedState[rId] === 'object') ? checkedState[rId] : {};
            const roomNAs = (naState[rId] && typeof naState[rId] === 'object') ? naState[rId] : {};
            
            const applicableStandardChecks = STANDARD_CHECKS.filter(c => !roomNAs[c.id]);
            const standardCheckedCount = applicableStandardChecks.filter(c => !!roomChecks[c.id]).length;
            
            const roomCustoms = customChecks.filter(c => c && c.roomId === rId);
            const customCheckedCount = roomCustoms.filter(c => c.checked).length;
            
            const totalChecksCount = applicableStandardChecks.length + roomCustoms.length;
            const checkedCount = standardCheckedCount + customCheckedCount;
            const pct = totalChecksCount > 0 ? Math.round((checkedCount / totalChecksCount) * 100) : 100;
            const isElecVerified = !!elecVerified[rId];

            return {
                id: rId,
                name: room.name,
                totalChecksCount,
                checkedCount,
                pct,
                isElecVerified,
                electricalCount: roomElectricalCounts[rId]?.total || 0,
                electricalBreakdown: roomElectricalCounts[rId]?.items || [],
                customsCount: roomCustoms.length
            };
        });
    }, [rooms, checkedState, customChecks, elecVerified, roomElectricalCounts, naState]);

    // Project Overall Stats
    const projectOverallStats = useMemo(() => {
        let total = 0;
        let checked = 0;
        
        roomSummaries.forEach(s => {
            total += s.totalChecksCount;
            checked += s.checkedCount;
        });

        const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
        const verifiedRoomsCount = roomSummaries.filter(s => s.pct === 100).length;
        const totalElectricalPoints = (Object.values(roomElectricalCounts) as any[]).reduce((sum, current) => sum + (current.total || 0), 0);
        const verifiedElectricalRoomsCount = roomSummaries.filter(s => s.isElecVerified).length;

        return {
            total,
            checked,
            pct,
            verifiedRoomsCount,
            totalElectricalPoints,
            verifiedElectricalRoomsCount
        };
    }, [roomSummaries, roomElectricalCounts]);

    // Action: Toggle Standard Checklist Checkbox
    const toggleCheck = (roomId: string, checkId: string) => {
        setProjectContext(prev => {
            const currentChecklist = prev.qualityChecklist || { checkedState: {}, elecVerified: {}, customChecks: [], notesState: {} };
            const roomChecks = { ...(currentChecklist.checkedState?.[roomId] || {}) };
            roomChecks[checkId] = !roomChecks[checkId];

            return {
                ...prev,
                qualityChecklist: {
                    ...currentChecklist,
                    checkedState: {
                        ...(currentChecklist.checkedState || {}),
                        [roomId]: roomChecks
                    }
                }
            };
        });
    };

    // Action: Toggle Standard Checklist Checkbox N/A state
    const toggleNA = (roomId: string, checkId: string, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation(); // Avoid triggering card toggle check
        }
        setProjectContext(prev => {
            const currentChecklist = prev.qualityChecklist || { checkedState: {}, elecVerified: {}, customChecks: [], notesState: {}, naState: {} };
            const roomNAs = { ...(currentChecklist.naState?.[roomId] || {}) };
            roomNAs[checkId] = !roomNAs[checkId];

            const roomChecks = { ...(currentChecklist.checkedState?.[roomId] || {}) };
            if (roomNAs[checkId]) {
                roomChecks[checkId] = false; // Uncheck if marked N/A
            }

            return {
                ...prev,
                qualityChecklist: {
                    ...currentChecklist,
                    checkedState: {
                        ...(currentChecklist.checkedState || {}),
                        [roomId]: roomChecks
                    },
                    naState: {
                        ...(currentChecklist.naState || {}),
                        [roomId]: roomNAs
                    }
                }
            };
        });
    };

    // Action: Verify Electrical points
    const toggleElecVerified = (roomId: string) => {
        setProjectContext(prev => {
            const currentChecklist = prev.qualityChecklist || { checkedState: {}, elecVerified: {}, customChecks: [], notesState: {} };
            const verifiedMap = { ...(currentChecklist.elecVerified || {}) };
            verifiedMap[roomId] = !verifiedMap[roomId];

            return {
                ...prev,
                qualityChecklist: {
                    ...currentChecklist,
                    elecVerified: verifiedMap
                }
            };
        });
    };

    // Action: Add custom check
    const handleAddCustomCheck = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCustomCheck.trim() || !activeRoomId) return;

        setProjectContext(prev => {
            const currentChecklist = prev.qualityChecklist || { checkedState: {}, elecVerified: {}, customChecks: [], notesState: {} };
            const customs = [...(currentChecklist.customChecks || [])];
            customs.push({
                id: generateId(),
                roomId: activeRoomId,
                label: newCustomCheck.trim(),
                checked: false
            });

            return {
                ...prev,
                qualityChecklist: {
                    ...currentChecklist,
                    customChecks: customs
                }
            };
        });
        setNewCustomCheck('');
    };

    // Action: Remove custom check
    const handleRemoveCustomCheck = (checkId: string) => {
        setProjectContext(prev => {
            const currentChecklist = prev.qualityChecklist || { checkedState: {}, elecVerified: {}, customChecks: [], notesState: {} };
            const customs = (currentChecklist.customChecks || []).filter(c => c.id !== checkId);

            return {
                ...prev,
                qualityChecklist: {
                    ...currentChecklist,
                    customChecks: customs
                }
            };
        });
    };

    // Action: Toggle custom check checkbox
    const toggleCustomCheck = (checkId: string) => {
        setProjectContext(prev => {
            const currentChecklist = prev.qualityChecklist || { checkedState: {}, elecVerified: {}, customChecks: [], notesState: {} };
            const customs = (currentChecklist.customChecks || []).map(c => 
                c.id === checkId ? { ...c, checked: !c.checked } : c
            );

            return {
                ...prev,
                qualityChecklist: {
                    ...currentChecklist,
                    customChecks: customs
                }
            };
        });
    };

    // Action: Update Room Note
    const handleUpdateRoomNote = (roomId: string, noteText: string) => {
        setProjectContext(prev => {
            const currentChecklist = prev.qualityChecklist || { checkedState: {}, elecVerified: {}, customChecks: [], notesState: {} };
            const notesMap = { ...(currentChecklist.notesState || {}) };
            notesMap[roomId] = noteText;

            return {
                ...prev,
                qualityChecklist: {
                    ...currentChecklist,
                    notesState: notesMap
                }
            };
        });
    };

    // Action: Verify/Complete All for active room
    const handleVerifyAllInRoom = () => {
        if (!activeRoomId) return;
        setProjectContext(prev => {
            const currentChecklist = prev.qualityChecklist || { checkedState: {}, elecVerified: {}, customChecks: [], notesState: {}, naState: {} };
            const roomNAs = currentChecklist.naState?.[activeRoomId] || {};
            
            // Set all standard checks (excluding N/A ones) to true
            const roomChecks = { ...(currentChecklist.checkedState?.[activeRoomId] || {}) };
            STANDARD_CHECKS.forEach(c => {
                if (!roomNAs[c.id]) {
                    roomChecks[c.id] = true;
                }
            });

            // Set all custom checks for this room to true
            const customs = (currentChecklist.customChecks || []).map(c => 
                c.roomId === activeRoomId ? { ...c, checked: true } : c
            );

            // Also mark electrical verified as true
            const verifiedMap = { ...(currentChecklist.elecVerified || {}) };
            verifiedMap[activeRoomId] = true;

            return {
                ...prev,
                qualityChecklist: {
                    ...currentChecklist,
                    checkedState: {
                        ...(currentChecklist.checkedState || {}),
                        [activeRoomId]: roomChecks
                    },
                    customChecks: customs,
                    elecVerified: verifiedMap
                }
            };
        });
    };

    // -------------------------------------------------------------
    // ELECTRICAL PLAN EDITING LOGIC (For Electrical table view)
    // -------------------------------------------------------------
    const handleUpdateElectricalPoint = (id: string, field: string, value: string | number) => {
        setProjectContext(prev => ({
            ...prev,
            electricalPointsPlan: prev.electricalPointsPlan?.map(ep => 
                ep.id === id ? { ...ep, [field]: value } : ep
            )
        }));
    };

    const handleRoomChange = (id: string, roomId: string) => {
        setProjectContext(prev => ({
            ...prev,
            electricalPointsPlan: prev.electricalPointsPlan?.map(ep => 
                ep.id === id ? { ...ep, roomId } : ep
            )
        }));
    };

    const handleAddElectricalPoint = () => {
        setProjectContext(prev => ({
            ...prev,
            electricalPointsPlan: [...(prev.electricalPointsPlan || []), {
                id: generateId(),
                roomId: activeRoomId || prev.rooms[0]?.id || 'unassigned',
                item: '',
                qty: 1,
                notes: ''
            }]
        }));
    };

    const handleAddSpecificElectricalPoint = (item: string, customRoomId?: string) => {
        setProjectContext(prev => {
            const plan = prev.electricalPointsPlan || [];
            const targetRoomId = customRoomId || activeRoomId || prev.rooms[0]?.id || 'unassigned';
            
            return {
                ...prev,
                electricalPointsPlan: [...plan, {
                    id: generateId(),
                    roomId: targetRoomId,
                    item: item,
                    qty: 1,
                    notes: ''
                }]
            };
        });
    };

    const handleRemoveElectricalPoint = (id: string) => {
        setProjectContext(prev => ({
            ...prev,
            electricalPointsPlan: prev.electricalPointsPlan?.filter(ep => ep.id !== id)
        }));
    };

    const handleUpdateRoomName = (roomId: string, newName: string) => {
        if (roomId === 'unassigned' || !roomId) return;
        setProjectContext(prev => {
            const roomExists = prev.rooms.some(r => r.id === roomId);
            if (roomExists) {
                return {
                    ...prev,
                    rooms: prev.rooms.map(r => r.id === roomId ? { ...r, name: newName } : r)
                };
            } else {
                return {
                    ...prev,
                    rooms: [...prev.rooms, { id: roomId, name: newName }]
                };
            }
        });
    };

    const groupedElectricalPlan = useMemo(() => {
        const plan = projectContext.electricalPointsPlan || [];
        const groups: Record<string, typeof plan> = {};
        plan.forEach(ep => {
            if (!groups[ep.roomId]) groups[ep.roomId] = [];
            groups[ep.roomId].push(ep);
        });
        return groups;
    }, [projectContext.electricalPointsPlan]);

    const activeRoomSummary = useMemo(() => {
        return roomSummaries.find(r => r.id === activeRoomId);
    }, [roomSummaries, activeRoomId]);

    const activeRoomCustoms = useMemo(() => {
        return customChecks.filter(c => c.roomId === activeRoomId);
    }, [customChecks, activeRoomId]);

    const activeRoomNotes = notesState[activeRoomId] || '';

    // Handle Direct Print Action
    const handlePrintClick = () => {
        if (window !== window.parent) {
            setShowPrintWarning(true);
            setTimeout(() => setShowPrintWarning(false), 8000);
        } else {
            window.print();
        }
    };

    return (
        <div className="space-y-6 print:space-y-8 font-['Plus_Jakarta_Sans']">
            {/* Top Overview Ribbon */}
            <div className="bg-[#FAF9F6] border border-[#EBEAE5] p-6 rounded-[24px] shadow-sm print:hidden">
                <div className="flex flex-col lg:flex-row items-stretch justify-between gap-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-[#334486] shadow-sm shrink-0">
                            <FileCheck2 className="w-6 h-6 stroke-[2]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-[#3D52A0]">Quality Standard Hub</span>
                                <span className="bg-sky-50 text-[#3D52A0] border border-sky-100 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Studio Standard</span>
                            </div>
                            <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1 tracking-tight">Quality & Handover Checklist</h3>
                            <p className="text-slate-500 text-xs mt-0.5 max-w-xl font-normal">
                                Verify room finishes, carpentry alignments, plumbing, and electrical installations before final client handover.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 border-t lg:border-t-0 lg:border-l border-slate-200/80 pt-4 lg:pt-0 lg:pl-6">
                        {/* Circle Progress Meter */}
                        <div className="flex items-center gap-3">
                            <div className="relative w-14 h-14 shrink-0">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                    <path className="text-slate-100" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                    <path className="text-emerald-500 transition-all duration-500" strokeDasharray={`${projectOverallStats.pct}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-800">
                                    {projectOverallStats.pct}%
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Project Progress</div>
                                <div className="text-xs font-bold text-slate-700 mt-0.5">{projectOverallStats.checked} / {projectOverallStats.total} Points Cleared</div>
                            </div>
                        </div>

                        {/* Room Completion Count */}
                        <div className="bg-white p-3 rounded-2xl border border-slate-100 flex-1 min-w-[120px] shadow-sm">
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Rooms Perfected</div>
                            <div className="text-lg font-black text-slate-800 mt-1 leading-none">
                                {projectOverallStats.verifiedRoomsCount}<span className="text-slate-300 font-light text-sm">/{rooms.length}</span>
                            </div>
                        </div>

                        {/* Switch Buttons & Print */}
                        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                            <div className="bg-slate-100 p-1 rounded-xl flex border border-slate-200/60 shadow-inner w-full sm:w-auto">
                                <button 
                                    onClick={() => setViewMode('checklist')}
                                    className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex-1 sm:flex-initial text-center ${viewMode === 'checklist' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Audits
                                </button>
                                <button 
                                    onClick={() => setViewMode('electrical-plan')}
                                    className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex-1 sm:flex-initial text-center ${viewMode === 'electrical-plan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Points Plan
                                </button>
                            </div>

                            {onNavigateToTab && (
                                <button
                                    onClick={() => onNavigateToTab('checklist')}
                                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider rounded-xl text-[#b8923a] border border-[#d9c585]/45 bg-[#faf8f0] hover:bg-[#f3eedc] transition-all shadow-sm w-full sm:w-auto shrink-0 font-extrabold"
                                >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                    <span>View Document</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center border-b border-[#D9D6CC] pb-4 mb-6">
                <h1 className="text-2xl font-black text-[#1E293B] uppercase tracking-widest">
                    {viewMode === 'electrical-plan' ? 'Electrical Points Audit' : 'Quality Handover Audit'}
                </h1>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mt-1">Form Factors Design Studio · Quality Assurance Checklist</p>
                <div className="mt-4 flex justify-between text-xs text-slate-500">
                    <span>Project: {projectContext.name || 'Untitled'}</span>
                    <span>Client: {projectContext.clientName || 'N/A'}</span>
                    <span>Date: {new Date().toLocaleDateString()}</span>
                </div>
            </div>

            {viewMode === 'electrical-plan' ? (
                /* =========================================================================
                   ELECTRICAL TABLE VIEW 
                   ========================================================================= */
                <div className="bg-white border border-[#EBEAE5] rounded-[24px] overflow-hidden shadow-sm">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 print:hidden">
                        <div className="flex items-center gap-2">
                            <Bolt className="w-4 h-4 text-amber-500" />
                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Electrical Points Verification Master Grid</h4>
                        </div>
                        <button
                            onClick={handleAddElectricalPoint}
                            className="bg-[#3D52A0] hover:bg-[#334486] text-white text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add Point Node
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600 border-collapse">
                            <thead>
                                <tr className="bg-[#FAF9F6] border-b border-[#EBEAE5] text-slate-700 uppercase tracking-wider text-[11px] font-black">
                                    <th className="px-6 py-4 w-1/4">Target Room</th>
                                    <th className="px-6 py-4 w-1/3">Electrical Item Node</th>
                                    <th className="px-6 py-4 w-24 text-center">Qty</th>
                                    <th className="px-6 py-4 w-1/3">Technical Audit Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {Object.entries(groupedElectricalPlan).map(([roomId, records]) => {
                                    const planRecords = records as any[];
                                    const roomMatch = rooms.find(r => r.id === roomId);
                                    const roomName = roomMatch ? roomMatch.name : (roomId === 'unassigned' ? 'General / Unassigned' : roomId);
                                    return (
                                        <React.Fragment key={roomId}>
                                            {/* Subheader per room */}
                                            <tr className="bg-slate-50/70 text-slate-900">
                                                <td colSpan={4} className="px-6 py-2.5 font-extrabold text-xs uppercase tracking-wide border-y border-slate-100">
                                                    <div className="flex items-center justify-between">
                                                        <span>{roomName}</span>
                                                        <span className="text-[10px] bg-slate-200/80 text-slate-800 px-2 py-0.5 rounded font-bold">
                                                            {planRecords.reduce((sum, r) => sum + r.qty, 0)} Points
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                            {planRecords.map((ep) => (
                                                <tr key={`ep-${ep.id}`} className="hover:bg-slate-50/50 group/row">
                                                    <td className="px-6 py-3">
                                                        <select 
                                                            value={ep.roomId} 
                                                            onChange={(e) => handleRoomChange(ep.id, e.target.value)}
                                                            className="w-full text-xs text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer font-medium print:hidden"
                                                        >
                                                            {rooms.map((r, idx) => (
                                                                <option key={`${r.id}-${idx}`} value={r.id}>{r.name}</option>
                                                            ))}
                                                            <option value="unassigned">General / Unassigned</option>
                                                        </select>
                                                        <span className="hidden print:inline text-xs">{roomName}</span>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input 
                                                            type="text" 
                                                            list="electrical-items-list"
                                                            value={ep.item} 
                                                            onChange={(e) => handleUpdateElectricalPoint(ep.id, 'item', e.target.value)}
                                                            placeholder="E.g. Panel Light, COB..."
                                                            className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-semibold text-slate-800 placeholder-slate-300"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3 text-center">
                                                        <input 
                                                            type="number" 
                                                            min={1}
                                                            value={ep.qty} 
                                                            onChange={(e) => handleUpdateElectricalPoint(ep.id, 'qty', parseInt(e.target.value) || 0)}
                                                            className="w-12 bg-transparent border-none p-0 focus:ring-0 text-center font-extrabold text-slate-800"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3 relative">
                                                        <div className="flex items-center justify-between pr-8">
                                                            <input 
                                                                type="text" 
                                                                value={ep.notes} 
                                                                onChange={(e) => handleUpdateElectricalPoint(ep.id, 'notes', e.target.value)}
                                                                placeholder="Add site notes..."
                                                                className="w-full bg-transparent border-none p-0 focus:ring-0 text-xs text-slate-500"
                                                            />
                                                            <button 
                                                                onClick={() => handleRemoveElectricalPoint(ep.id)}
                                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity print:hidden cursor-pointer"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}

                                {(!projectContext.electricalPointsPlan || projectContext.electricalPointsPlan.length === 0) && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-slate-400 bg-slate-50/50 print:hidden">
                                            No electrical points logged in this project's checklist plan yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Datalist */}
                    <datalist id="electrical-items-list">
                        {STANDARD_ELECTRICAL_ITEMS.map((item, idx) => (
                            <option key={idx} value={item} />
                        ))}
                    </datalist>

                    {/* Rapid Addition Footer */}
                    <div className="p-6 bg-[#FAF9F6] border-t border-[#EBEAE5] print:hidden">
                        <div className="space-y-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Rapid node injection (Adds to current active room):</span>
                            <div className="flex flex-wrap gap-2">
                                {STANDARD_ELECTRICAL_ITEMS.map(item => (
                                    <button 
                                        key={item}
                                        onClick={() => handleAddSpecificElectricalPoint(item)} 
                                        className="text-[11px] bg-white border border-[#EBEAE5] px-2.5 py-1 rounded-lg text-slate-600 hover:border-sky-300 hover:bg-sky-50/50 hover:text-[#334486] transition-all shadow-sm font-semibold"
                                    >
                                        + {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* =========================================================================
                   MASTER-DETAIL QUALITY AUDIT CHECKLIST
                   ========================================================================= */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* Left Sidebar: Rooms List */}
                    <div className="lg:col-span-4 space-y-3 print:hidden">
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">PROJECT ROOMS ({rooms.length})</span>
                        </div>
                        
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                            {roomSummaries.map((room) => {
                                const isActive = room.id === activeRoomId;
                                return (
                                    <button
                                        key={room.id}
                                        onClick={() => setActiveRoomId(room.id)}
                                        className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between cursor-pointer group ${
                                            isActive 
                                                ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 border-[#334486] text-white shadow-md shadow-sky-950/10' 
                                                : 'bg-white border-[#EBEAE5] hover:border-slate-300 text-slate-800'
                                        }`}
                                    >
                                        <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                                            <div className="flex items-center gap-2">
                                                <h5 className={`font-bold text-sm truncate ${isActive ? 'text-white' : 'text-slate-900 group-hover:text-[#334486]'}`}>
                                                    {room.name}
                                                </h5>
                                                {room.pct === 100 && (
                                                    <span className="text-emerald-500 bg-emerald-50 rounded-full p-0.5">
                                                        <Check className="w-3 h-3 stroke-[3]" />
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {/* Mini completion percentage */}
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <span className={`text-[10px] font-black uppercase ${isActive ? 'text-sky-200' : 'text-slate-400'}`}>
                                                        {room.checkedCount}/{room.totalChecksCount} Verified
                                                    </span>
                                                </div>

                                                {/* Electrical count marker */}
                                                {room.electricalCount > 0 && (
                                                    <div className="flex items-center gap-1">
                                                        <Bolt className={`w-3 h-3 ${room.isElecVerified ? 'text-amber-500' : 'text-slate-400'}`} />
                                                        <span className={`text-[10px] font-bold ${isActive ? 'text-sky-200' : 'text-slate-500'}`}>
                                                            {room.electricalCount} Nodes
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Progress bar */}
                                            <div className="w-full bg-slate-100/30 h-1.5 rounded-full overflow-hidden shrink-0">
                                                <div 
                                                    className={`h-full transition-all duration-300 ${room.pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                                    style={{ width: `${room.pct}%` }}
                                                />
                                            </div>
                                        </div>

                                        <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'text-white translate-x-1' : 'text-slate-300 group-hover:text-slate-500'}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Workspace: Active Selected Room Panel */}
                    <div className="lg:col-span-8">
                        {activeRoomSummary ? (
                            <div className="space-y-6">
                                <Card 
                                    title={
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full border-b border-slate-100 pb-4">
                                            <div>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block leading-none">Inspecting Zone</span>
                                                <h4 className="text-lg font-extrabold text-slate-900 font-['Plus_Jakarta_Sans'] leading-tight mt-1">{activeRoomSummary.name}</h4>
                                            </div>
                                            <div className="flex items-center gap-2 print:hidden">
                                                <button
                                                    onClick={handleVerifyAllInRoom}
                                                    className="bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 border border-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                                                >
                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                    Approve Room Complete
                                                </button>
                                            </div>
                                        </div>
                                    }
                                    className="bg-white border border-[#EBEAE5] rounded-[24px] p-6 shadow-sm flex flex-col"
                                >
                                    {/* Standardized Checklist Categories */}
                                    <div className="space-y-6">
                                        
                                        {/* 1. Paint & Woodwork Finishes */}
                                        <div className="space-y-3">
                                            <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 rounded-full"></span>
                                                Core Standard Checks
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {STANDARD_CHECKS.map((check) => {
                                                    const isChecked = !!(checkedState[activeRoomSummary.id]?.[check.id]);
                                                    const isNA = !!(naState[activeRoomSummary.id]?.[check.id]);
                                                    return (
                                                        <div 
                                                            key={check.id}
                                                            onClick={() => {
                                                                if (!isNA) {
                                                                    toggleCheck(activeRoomSummary.id, check.id);
                                                                }
                                                            }}
                                                            className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-all select-none relative group/card ${
                                                                isNA
                                                                    ? 'bg-slate-50/60 border-slate-200 text-slate-450'
                                                                    : isChecked 
                                                                        ? 'bg-emerald-50/40 border-emerald-200/80 cursor-pointer' 
                                                                        : 'bg-white border-slate-100 hover:border-slate-200 cursor-pointer'
                                                            }`}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                                                                    isNA
                                                                        ? 'border-slate-300 bg-slate-200 text-slate-500 cursor-not-allowed'
                                                                        : isChecked 
                                                                            ? 'bg-emerald-500 border-emerald-500 text-white' 
                                                                            : 'border-slate-300 bg-white'
                                                                }`}>
                                                                    {isChecked && !isNA && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                                    {isNA && <span className="text-[9px] font-extrabold">NA</span>}
                                                                </div>
                                                                <div className="space-y-0.5">
                                                                    <span className={`text-xs font-semibold leading-tight block ${
                                                                        isNA 
                                                                            ? 'text-slate-400 font-medium italic line-through' 
                                                                            : isChecked 
                                                                                ? 'text-slate-400 line-through' 
                                                                                : 'text-slate-700'
                                                                    }`}>
                                                                        {check.label}
                                                                    </span>
                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                                                        {check.category}
                                                                        {isNA && <span className="text-amber-700 font-extrabold bg-amber-50 px-1 rounded">[N/A]</span>}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => toggleNA(activeRoomSummary.id, check.id, e)}
                                                                className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider transition-all border shrink-0 ${
                                                                    isNA
                                                                        ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 sm:opacity-0 group-hover/card:opacity-100'
                                                                }`}
                                                            >
                                                                {isNA ? 'Apply' : 'N/A'}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* 2. Custom Site Checks */}
                                        <div className="space-y-3 pt-2">
                                            <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 rounded-full"></span>
                                                Room-Specific Custom Audits
                                            </div>

                                            {activeRoomCustoms.length > 0 ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {activeRoomCustoms.map((custom) => (
                                                        <div 
                                                            key={custom.id}
                                                            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                                                custom.checked 
                                                                    ? 'bg-emerald-50/40 border-emerald-200/80' 
                                                                    : 'bg-white border-slate-100'
                                                            }`}
                                                        >
                                                            <div 
                                                                onClick={() => toggleCustomCheck(custom.id)}
                                                                className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                                                            >
                                                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                                                                    custom.checked 
                                                                        ? 'bg-emerald-500 border-emerald-500 text-white' 
                                                                        : 'border-slate-300 bg-white'
                                                                }`}>
                                                                    {custom.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                                </div>
                                                                <span className={`text-xs font-semibold leading-tight truncate ${custom.checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                                    {custom.label}
                                                                </span>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleRemoveCustomCheck(custom.id)}
                                                                className="text-slate-300 hover:text-red-500 p-1 rounded-md hover:bg-slate-50 transition-colors shrink-0 cursor-pointer"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-400 italic">No room-specific custom audits added yet.</p>
                                            )}

                                            {/* Form to add custom checks */}
                                            <form onSubmit={handleAddCustomCheck} className="flex gap-2 max-w-md pt-1 print:hidden">
                                                <input 
                                                    type="text" 
                                                    value={newCustomCheck}
                                                    onChange={(e) => setNewCustomCheck(e.target.value)}
                                                    placeholder="Add custom check (e.g. Veneer polish grooves)..."
                                                    className="flex-1 bg-[#FAF9F6] border border-[#EBEAE5] rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-[#3D52A0] focus:bg-white focus:border-[#3D52A0] font-medium"
                                                />
                                                <button 
                                                    type="submit"
                                                    className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 hover:bg-[#334486] text-white text-xs font-bold px-4 py-2 rounded-xl uppercase tracking-wider shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                                                >
                                                    <Plus className="w-3.5 h-3.5" /> Append
                                                </button>
                                            </form>
                                        </div>

                                        {/* 3. Electrical Audit counts */}
                                        <div className="space-y-3 pt-2">
                                            <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 rounded-full"></span>
                                                Electrical Point Audit
                                            </div>

                                            <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                                            <Bolt className="w-4 h-4 text-amber-500" />
                                                            <span>Nodes Planned: {activeRoomSummary.electricalCount} point(s)</span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 leading-normal max-w-md">
                                                            Compare the physical physical mockups on site against the BOQ plan before final handover.
                                                        </p>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => toggleElecVerified(activeRoomSummary.id)}
                                                        className={`text-xs font-bold px-4 py-2 rounded-xl uppercase tracking-wider transition-all border flex items-center gap-1.5 shadow-sm cursor-pointer ${
                                                            activeRoomSummary.isElecVerified 
                                                                ? 'bg-amber-500 text-slate-900 border-amber-600 font-extrabold' 
                                                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                                        }`}
                                                    >
                                                        <Bolt className={`w-4 h-4 ${activeRoomSummary.isElecVerified ? 'text-slate-900' : 'text-slate-400'}`} />
                                                        {activeRoomSummary.isElecVerified ? 'Points Verified ✓' : 'Verify Points Count'}
                                                    </button>
                                                </div>

                                                {/* Electrical breakdown table in active room */}
                                                {activeRoomSummary.electricalBreakdown.length > 0 && (
                                                    <div className="mt-4 border-t border-slate-200/60 pt-3">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Plan Breakdown:</span>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                                                            {activeRoomSummary.electricalBreakdown.map((b, idx) => (
                                                                <div key={idx} className="bg-white border border-slate-100 p-2 rounded-lg text-xs flex justify-between items-center">
                                                                    <span className="text-slate-600 font-medium truncate pr-2">{b.name || 'Points'}</span>
                                                                    <span className="font-extrabold text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{b.qty}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* 4. Supervisor Audit notes */}
                                        <div className="space-y-3 pt-2">
                                            <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 rounded-full"></span>
                                                Site Supervisor Remarks
                                            </div>

                                            <textarea
                                                rows={3}
                                                value={activeRoomNotes}
                                                onChange={(e) => handleUpdateRoomNote(activeRoomSummary.id, e.target.value)}
                                                placeholder={`Add specialized quality remarks for ${activeRoomSummary.name} (e.g., Slight dampness check near skirting, alignment needs 1mm adjustment)...`}
                                                className="w-full bg-[#FAF9F6] border border-[#EBEAE5] rounded-[18px] p-4 text-xs focus:ring-1 focus:ring-[#3D52A0] focus:bg-white focus:border-[#3D52A0] font-medium placeholder-slate-400 leading-relaxed"
                                            />
                                        </div>

                                    </div>
                                </Card>
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-[24px]">
                                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm font-semibold text-slate-500">Please select a room to audit.</p>
                            </div>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
};

export default PreHandoverChecklist;
