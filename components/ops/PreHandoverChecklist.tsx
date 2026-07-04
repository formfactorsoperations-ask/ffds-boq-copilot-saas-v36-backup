import React, { useMemo, useState, useEffect } from 'react';
import { ProjectContext, FullBoqItem } from '../../types';
import Card from '../shared/Card';
import { CheckCircle, Bolt, LayoutList, Printer, Plus, Trash2, Edit2 } from 'lucide-react';

interface PreHandoverChecklistProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    boq: FullBoqItem[];
}

interface RoomChecklist {
    roomName: string;
    roomId: string;
    electricalPoints: {
        rawItems: FullBoqItem[];
        totalPoints: number;
        breakdown: { name: string; qty: number }[];
    };
    standardChecks: { id: string; label: string; checked: boolean }[];
}

const STANDARD_CHECKS = [
    { id: 'paint', label: 'Final Paint Touch-ups (Skirting & Cornice)' },
    { id: 'hardware', label: 'Cabinet Shutters Aligned & Hardware Tight' },
    { id: 'clean', label: 'Deep Cleaning (Inside Cabinets & Floor)' },
    { id: 'electrical', label: 'All Switchboards Clean & Straight' },
    { id: 'plumbing', label: 'Angle Cocks & Drain Lines Leak-tested' },
    { id: 'debris', label: 'Site Debris Cleared & Handed Over' },
];

const STANDARD_ELECTRICAL_ITEMS = [
    "Panel Light", "COB", "Spot Set of 3", "Cove Light", "Fan", "Hanging Light",
    "Track Light", "Profile Light", "Safety Door Point", "Shoe Rack Plug Point",
    "TV Unit Plug Point", "Crockery Unit Plug Point", "Below Pedestal Plug Point",
    "Sofa Back Plug Point", "Mandir Plug Point", "Wardrobe Plug Point",
    "AC Point", "Geyser Point", "Exhaust Point"
];

const PreHandoverChecklist: React.FC<PreHandoverChecklistProps> = ({ projectContext, setProjectContext, boq }) => {
    
    // Initialize or sync electricalPointsPlan
    useEffect(() => {
        if (!projectContext.electricalPointsPlan || projectContext.electricalPointsPlan.length === 0) {
            // Generate initial plan from boq
            const initialPlan: { id: string; roomId: string; roomName?: string; item: string; qty: number; notes: string }[] = [];
            
            boq.forEach(item => {
                 const isElectrical = item.cat?.toLowerCase().includes('electrical') || 
                                      item.name?.toLowerCase().includes('switch') || 
                                      item.name?.toLowerCase().includes('socket') || 
                                      item.name?.toLowerCase().includes('point') ||
                                      item.name?.toLowerCase().includes('light');
                 if (isElectrical) {
                      const rId = item.roomId || 'unassigned';
                      const existingNameMatch = projectContext.rooms.find(r => r.id === rId);
                      const roomName = existingNameMatch ? existingNameMatch.name : (rId === 'unassigned' ? 'General / Unassigned' : rId);
                      
                      initialPlan.push({
                          id: crypto.randomUUID(),
                          roomId: rId,
                          item: item.name,
                          qty: item.qty,
                          notes: ''
                      });
                 }
            });

            if (initialPlan.length > 0) {
                setProjectContext(prev => ({ ...prev, electricalPointsPlan: initialPlan }));
            }
        }
    }, [boq, projectContext.rooms, projectContext.electricalPointsPlan, setProjectContext]);

    // Group and calculate checklists per room
    const checklists = useMemo(() => {
        const rooms: Record<string, RoomChecklist> = {};

        // Initialize rooms based on projectContext
        projectContext.rooms.forEach(r => {
            rooms[r.id] = {
                roomId: r.id,
                roomName: r.name,
                electricalPoints: { rawItems: [], totalPoints: 0, breakdown: [] },
                standardChecks: STANDARD_CHECKS.map(c => ({ ...c, checked: false }))
            };
        });

        // Add items from electricalPointsPlan
        const ePlan = projectContext.electricalPointsPlan || [];
        ePlan.forEach(ep => {
            if (!rooms[ep.roomId]) {
                const manualMatch = projectContext.rooms.find(r => r.id === ep.roomId);
                const resolvedName = manualMatch ? manualMatch.name : (ep.roomName || (ep.roomId === 'unassigned' ? 'General / Unassigned' : ep.roomId));
                rooms[ep.roomId] = {
                    roomId: ep.roomId,
                    roomName: resolvedName,
                    electricalPoints: { rawItems: [], totalPoints: 0, breakdown: [] },
                    standardChecks: STANDARD_CHECKS.map(c => ({ ...c, checked: false }))
                };
            }
            
            rooms[ep.roomId].electricalPoints.totalPoints += ep.qty;
            
            const existingBd = rooms[ep.roomId].electricalPoints.breakdown.find(b => b.name === ep.item);
            if (existingBd) {
                existingBd.qty += ep.qty;
            } else {
                rooms[ep.roomId].electricalPoints.breakdown.push({ name: ep.item, qty: ep.qty });
            }
        });

        // Filter out empty rooms (no electrical points and no checks done, but usually we just show all context rooms)
        // Let's sort to put rooms with electrical points first
        return Object.values(rooms).sort((a, b) => b.electricalPoints.totalPoints - a.electricalPoints.totalPoints);
    }, [projectContext.rooms, projectContext.electricalPointsPlan]);

    // Local State for checklist tracking (ideally persists to DB, but doing basic local state for now)
    const [viewMode, setViewMode] = useState<'checklist' | 'electrical-plan'>('checklist');
    const [checkedState, setCheckedState] = useState<Record<string, Record<string, boolean>>>({});
    const [elecVerified, setElecVerified] = useState<Record<string, boolean>>({});
    const [showPrintWarning, setShowPrintWarning] = useState(false);

    const handlePrintClick = () => {
        if (window !== window.parent) {
            setShowPrintWarning(true);
            setTimeout(() => setShowPrintWarning(false), 8000);
        } else {
            window.print();
        }
    };

    const toggleCheck = (roomId: string, checkId: string) => {
        setCheckedState(prev => ({
            ...prev,
            [roomId]: {
                ...(prev[roomId] || {}),
                [checkId]: !prev[roomId]?.[checkId]
            }
        }));
    };

    const toggleElecVerified = (roomId: string) => {
        setElecVerified(prev => ({
            ...prev,
            [roomId]: !prev[roomId]
        }));
    };


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
                id: crypto.randomUUID(),
                roomId: prev.rooms[0]?.id || 'unassigned',
                item: '',
                qty: 1,
                notes: ''
            }]
        }));
    };

    const handleAddSpecificElectricalPoint = (item: string, customRoomId?: string) => {
        setProjectContext(prev => {
            const plan = prev.electricalPointsPlan || [];
            const lastRoomId = plan.length > 0 ? plan[plan.length - 1].roomId : (prev.rooms[0]?.id || 'unassigned');
            const targetRoomId = customRoomId || lastRoomId;
            
            return {
                ...prev,
                electricalPointsPlan: [...plan, {
                    id: crypto.randomUUID(),
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

    // Grouping for table render
    const groupedElectricalPlan = useMemo(() => {
        const plan = projectContext.electricalPointsPlan || [];
        const groups: Record<string, typeof plan> = {};
        plan.forEach(ep => {
            if (!groups[ep.roomId]) groups[ep.roomId] = [];
            groups[ep.roomId].push(ep);
        });
        return groups;
    }, [projectContext.electricalPointsPlan]);

    if (!boq.length && (!projectContext.electricalPointsPlan || projectContext.electricalPointsPlan.length === 0)) {
         return (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-500 font-medium">
                <LayoutList className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                <p>No BOQ items loaded and no electrical plan exists.</p>
                <button
                    onClick={handleAddElectricalPoint}
                    className="mt-4 flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-indigo-700 transition-colors"
                >
                    <Plus className="w-4 h-4" /> Start Electrical Plan
                </button>
            </div>
         );
    }

    return (
        <div className="space-y-6 print:space-y-8">
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl flex flex-col md:flex-row items-start justify-between gap-4 print:hidden">
                <div className="flex items-start gap-4">
                    <CheckCircle className="w-8 h-8 text-emerald-600 mt-1 flex-shrink-0" />
                    <div>
                        <h3 className="text-xl font-bold text-emerald-900 mb-2">Pre-Handover & Electrical Check</h3>
                        <p className="text-emerald-700 text-sm max-w-2xl">
                            This checklist dynamically reads from your BOQ items to confirm site finish readiness and count electrical points room-by-room. Mark sections as verified before scheduling client walkthrough.
                        </p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                    <div className="bg-white border text-sm border-slate-200 p-1 rounded-lg flex font-medium shadow-sm">
                        <button 
                            onClick={() => setViewMode('checklist')}
                            className={`px-3 py-1.5 rounded-md transition-colors ${viewMode === 'checklist' ? 'bg-slate-100 text-indigo-900 font-bold' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Grid Checklist
                        </button>
                        <button 
                            onClick={() => setViewMode('electrical-plan')}
                            className={`px-3 py-1.5 rounded-md transition-colors ${viewMode === 'electrical-plan' ? 'bg-slate-100 text-indigo-900 font-bold' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Electrical Plan Table
                        </button>
                    </div>
                    <div className="relative">
                        <button 
                            onClick={handlePrintClick}
                            className="flex items-center justify-center gap-2 bg-white border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-emerald-100 transition-colors"
                        >
                            <Printer className="w-4 h-4" />
                            Print
                        </button>
                        {showPrintWarning && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-indigo-950 text-white text-xs p-3 rounded shadow-xl z-50">
                                Printing directly from the preview might be blocked. Click the "Open Web App" arrow button ↗ in the top right to open in a new tab, then print.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center border-b-2 border-indigo-950 pb-4 mb-8">
                <h1 className="text-3xl font-black text-indigo-950 uppercase tracking-widest mb-1">
                    {viewMode === 'electrical-plan' ? 'Electrical Plan' : 'Site Checklist'}
                </h1>
                <h2 className="text-lg font-medium text-slate-600">
                    {viewMode === 'electrical-plan' ? 'Electrical Points Audit' : 'Electrical Points & Handover Audit'}
                </h2>
                <div className="mt-4 flex justify-between text-sm font-bold text-slate-500">
                    <span>Project: {projectContext.name || 'Untitled'}</span>
                    <span>Date: ____________</span>
                </div>
            </div>

            {viewMode === 'electrical-plan' ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden print:border-none print:shadow-none">
                    <table className="w-full text-left text-sm text-slate-600 print:text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-xs font-bold print:bg-white print:border-slate-400">
                            <tr>
                                <th className="px-4 py-3 print:p-2 border-r border-slate-200 print:border-slate-300 w-1/4">Room</th>
                                <th className="px-4 py-3 print:p-2 border-r border-slate-200 print:border-slate-300 w-1/3">Item</th>
                                <th className="px-4 py-3 print:p-2 border-r border-slate-200 print:border-slate-300 w-24 text-center">Quantity</th>
                                <th className="px-4 py-3 print:p-2 border-slate-200 w-1/3">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 print:divide-slate-300">
                            {Object.entries(groupedElectricalPlan).map(([roomId, records]: [string, any]) => {
                                const roomMatch = projectContext.rooms.find(r => r.id === roomId);
                                const roomName = roomMatch ? roomMatch.name : (roomId === 'unassigned' ? 'General / Unassigned' : roomId);
                                return (
                                    <React.Fragment key={roomId}>
                                        <tr className="bg-slate-100/50 print:bg-slate-100 text-indigo-900">
                                            <td colSpan={4} className="px-4 py-2 border-b border-slate-200 print:border-slate-300">
                                                <div className="flex items-center justify-between font-bold">
                                                    {roomId === 'unassigned' ? (
                                                        <span>{roomName}</span>
                                                    ) : (
                                                        <div className="flex items-center gap-1 group/edit w-full relative">
                                                            <input 
                                                                type="text" 
                                                                value={roomName}
                                                                onChange={(e) => handleUpdateRoomName(roomId, e.target.value)}
                                                                className="bg-transparent border-b border-dashed border-transparent hover:border-slate-300 focus:border-indigo-500 py-0.5 outline-none focus:ring-0 text-inherit font-bold w-full transition-colors"
                                                            />
                                                            <Edit2 className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover/edit:opacity-100 transition-opacity absolute right-0 pointer-events-none" />
                                                        </div>
                                                    )}
                                                    <button onClick={() => handleAddSpecificElectricalPoint('', roomId)} className="text-xs text-indigo-600 flex items-center gap-1 opacity-0 group-hover/row:opacity-100 hover:opacity-100 transition-opacity print:hidden px-2 py-1 hover:bg-indigo-50 rounded">
                                                        <Plus className="w-3 h-3" /> Add Point
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {records.map((ep, i) => (
                                            <tr key={`ep-${ep.id}`} className="hover:bg-slate-50 print:hover:bg-transparent group/row">
                                                <td className="px-4 py-2 print:p-1.5 border-r border-b border-slate-200 print:border-slate-300">
                                                    <select 
                                                        value={ep.roomId} 
                                                        onChange={(e) => handleRoomChange(ep.id, e.target.value)}
                                                        className="w-full text-xs text-slate-400 bg-transparent border-none p-0 outline-none focus:ring-0 cursor-pointer print:hidden"
                                                    >
                                                        {projectContext.rooms.map((r, idx) => (
                                                            <option key={`${r.id}-${idx}-small`} value={r.id}>{r.name}</option>
                                                        ))}
                                                        <option value="unassigned">General / Unassigned</option>
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2 print:p-1.5 border-r border-b border-slate-200 print:border-slate-300">
                                                    <input 
                                                        type="text" 
                                                        list="electrical-items"
                                                        value={ep.item} 
                                                        onChange={(e) => handleUpdateElectricalPoint(ep.id, 'item', e.target.value)}
                                                        placeholder="E.g., Panel Light, Switch..."
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 font-medium text-indigo-900"
                                                    />
                                                </td>
                                                <td className="px-4 py-2 print:p-1.5 border-r border-b border-slate-200 print:border-slate-300">
                                                    <input 
                                                        type="number" 
                                                        min={1}
                                                        value={ep.qty} 
                                                        onChange={(e) => handleUpdateElectricalPoint(ep.id, 'qty', parseInt(e.target.value) || 0)}
                                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-center font-bold text-indigo-900"
                                                    />
                                                </td>
                                                <td className="px-0 py-0 border-b border-slate-200 print:border-slate-300 relative">
                                                    <input 
                                                        type="text" 
                                                        value={ep.notes} 
                                                onChange={(e) => handleUpdateElectricalPoint(ep.id, 'notes', e.target.value)}
                                                placeholder="Add notes..."
                                                className="w-full bg-transparent border-none px-4 py-2 focus:ring-0 text-slate-500"
                                            />
                                            <button 
                                                onClick={() => handleRemoveElectricalPoint(ep.id)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity print:hidden"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </React.Fragment>
                            );
                        })}
                            
                            {/* Empty state add button */}
                            {(!projectContext.electricalPointsPlan || projectContext.electricalPointsPlan.length === 0) && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-500 bg-slate-50 print:hidden border-b border-slate-200">
                                        <button
                                            onClick={handleAddElectricalPoint}
                                            className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-slate-50 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" /> Start Adding Points
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="print:hidden">
                            <tr>
                                <td colSpan={4} className="px-4 py-3 bg-slate-50">
                                   <div className="flex flex-col gap-4">
                                       <button
                                            onClick={handleAddElectricalPoint}
                                            className="text-sm font-bold text-indigo-600 flex items-center gap-2 hover:text-indigo-800 transition-colors w-fit"
                                        >
                                            <Plus className="w-4 h-4" /> Add Custom Electrical Point
                                        </button>
                                        <div className="flex flex-wrap gap-2 items-center">
                                           <span className="text-xs uppercase font-bold text-slate-400 mr-2">Rapid Adding:</span>
                                           {STANDARD_ELECTRICAL_ITEMS.map(item => (
                                              <button 
                                                 key={item}
                                                 onClick={() => handleAddSpecificElectricalPoint(item)} 
                                                 className="text-[11px] bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-sm"
                                              >
                                                 + {item}
                                              </button>
                                           ))}
                                        </div>
                                   </div>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                    
                    <datalist id="electrical-items">
                        {STANDARD_ELECTRICAL_ITEMS.map((item, idx) => (
                            <option key={idx} value={item} />
                        ))}
                    </datalist>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2 print:gap-8 print:text-xs">
                {checklists.map((room, i) => (
                    <Card 
                        key={room.roomId || `room-${i}`} 
                        title={
                            room.roomId === 'unassigned' ? (
                                <span>{room.roomName}</span>
                            ) : (
                                <div className="flex items-center gap-2 group/edit relative w-full">
                                    <input
                                        type="text"
                                        value={room.roomName}
                                        onChange={(e) => handleUpdateRoomName(room.roomId, e.target.value)}
                                        className="bg-transparent border-b border-dashed border-transparent hover:border-slate-300 focus:border-indigo-500 py-1 outline-none focus:ring-0 w-full text-inherit transition-colors"
                                    />
                                    <Edit2 className="w-4 h-4 text-slate-400 opacity-0 group-hover/edit:opacity-100 transition-opacity absolute right-0 pointer-events-none" />
                                </div>
                            )
                        } 
                        className="flex flex-col print:shadow-none print:border-slate-300 print:break-inside-avoid"
                    >
                        
                        {/* Electrical Counting Section */}
                        <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200 print:bg-white print:border-slate-300">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2 text-indigo-700 font-bold print:text-indigo-950">
                                    <Bolt className="w-4 h-4 print:hidden" /> Electrical Points
                                </div>
                                <div className="text-2xl font-black text-indigo-900 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm print:shadow-none print:border-indigo-950 print:bg-slate-50">
                                    {room.electricalPoints.totalPoints}
                                </div>
                            </div>
                            
                            {room.electricalPoints.breakdown.length > 0 ? (
                                <ul className="text-xs space-y-2 mb-4 text-slate-600 border-t border-slate-200 pt-3 print:text-[11px] print:text-indigo-900">
                                    {room.electricalPoints.breakdown.map((bd, idx) => (
                                        <li key={`elec-${bd.name}-${idx}`} className="flex justify-between border-b border-slate-100 pb-1 print:border-slate-300">
                                            <span className="truncate pr-2">{bd.name}</span>
                                            <span className="font-bold">{bd.qty}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-slate-400 mb-4 pt-3 border-t border-slate-200">No explicit electrical points found.</p>
                            )}

                            <label className="flex items-center gap-2 cursor-pointer pt-2 group print:hidden">
                                <input 
                                    type="checkbox" 
                                    checked={!!elecVerified[room.roomId]}
                                    onChange={() => toggleElecVerified(room.roomId)}
                                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer transition-all"
                                />
                                <span className={`text-sm font-bold transition-colors ${elecVerified[room.roomId] ? 'text-indigo-600' : 'text-slate-600 group-hover:text-indigo-600'}`}>
                                    Verify Points Count
                                </span>
                            </label>
                            
                            {/* Print-only checkbox space */}
                            <div className="hidden print:flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                                <span className="font-bold">Points Verified</span>
                                <div className="w-5 h-5 border border-slate-400 rounded-sm"></div>
                            </div>
                        </div>

                        {/* Standard Finishes Section */}
                        <div className="flex-grow">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1 print:text-slate-700">Finish Checks</h4>
                            <ul className="space-y-3 print:space-y-2">
                                {room.standardChecks.map(check => {
                                    const isChecked = checkedState[room.roomId]?.[check.id] || false;
                                    return (
                                        <li key={check.id}>
                                            <label className="flex items-start gap-3 cursor-pointer group print:hidden">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isChecked}
                                                    onChange={() => toggleCheck(room.roomId, check.id)}
                                                    className="w-5 h-5 mt-0.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer transition-all"
                                                />
                                                <span className={`text-sm tracking-tight transition-all leading-tight ${isChecked ? 'text-slate-400 line-through' : 'text-slate-700 font-medium group-hover:text-emerald-700'}`}>
                                                    {check.label}
                                                </span>
                                            </label>
                                            
                                            {/* Print friendly checklist item */}
                                            <div className="hidden print:flex items-start gap-2">
                                                <div className="w-4 h-4 mt-0.5 border border-slate-400 rounded-sm shrink-0"></div>
                                                <span className="text-[11px] font-medium text-indigo-900 leading-tight">
                                                    {check.label}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </Card>
                ))}
            </div>
            )}
            
            {/* Print Footer */}
            <div className="hidden print:flex mt-12 pt-8 border-t border-slate-300 justify-between">
                <div className="w-48">
                    <div className="border-b border-slate-400 h-8 mb-2"></div>
                    <span className="text-xs font-bold text-slate-600">Supervisor Signature</span>
                </div>
                <div className="w-48">
                    <div className="border-b border-slate-400 h-8 mb-2"></div>
                    <span className="text-xs font-bold text-slate-600">Client Signature</span>
                </div>
            </div>
        </div>
    );
};

export default PreHandoverChecklist;
