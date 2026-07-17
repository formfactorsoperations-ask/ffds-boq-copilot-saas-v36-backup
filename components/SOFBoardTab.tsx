import React, { useState } from 'react';
import { ProjectContext, MaterialSelection } from '../types';
import { CheckCircle, Clock, Plus, X, Package, ShoppingCart, Eye, DollarSign, PlusCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const formatINR = (value: number | undefined | null) => {
    if (value == null) return '';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
};

interface SOFBoardTabProps {
    projectContext: ProjectContext;
    setProjectContext: (ctx: ProjectContext) => void;
}

export default function SOFBoardTab({ projectContext, setProjectContext }: SOFBoardTabProps) {
    const [viewMode, setViewMode] = useState<'kanban' | 'rooms' | 'financials' | 'client_presentation'>('kanban');
    const [selections, setSelections] = useState<MaterialSelection[]>(projectContext.materialSelections || []);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newSelection, setNewSelection] = useState({ roomId: '', category: '', itemName: '', allowancePrice: '' });

    const updateSelectionStatus = (id: string, newStatus: any) => {
        const updated = selections.map(s => s.id === id ? { ...s, status: newStatus } : s);
        setSelections(updated);
        setProjectContext({ ...projectContext, materialSelections: updated });
    };

        const handleAddSelection = () => {
        if (!newSelection.roomId || !newSelection.category || !newSelection.itemName) return;
        const newItem: MaterialSelection = {
            id: 'sel_' + Date.now().toString(),
            roomId: newSelection.roomId,
            category: newSelection.category,
            itemName: newSelection.itemName,
            status: 'to_select',
            leadTimeDays: 7,
            finishCode: '',
            allowancePrice: newSelection.allowancePrice ? parseFloat(newSelection.allowancePrice) : 0,
            quotedPrice: 0,
            estimatedQty: 1
        };
        const updated = [...selections, newItem];
        setSelections(updated);
        setProjectContext({ ...projectContext, materialSelections: updated });
        setNewSelection({ roomId: newSelection.roomId, category: '', itemName: '', allowancePrice: '' }); // keep room selected for fast multi-add
        // setShowAddModal(false); 
    };

    const PRESET_CATEGORIES = [
        { id: 'Laminate', icon: '🪵' },
        { id: 'Flooring', icon: '🏠' },
        { id: 'Lighting', icon: '💡' },
        { id: 'Sanitaryware', icon: '🚿' },
        { id: 'Hardware', icon: '🔩' },
        { id: 'Paint', icon: '🎨' },
        { id: 'Fabric', icon: '🧵' },
        { id: 'Custom', icon: '✨' }
    ];
    const availableRooms = Array.from(new Set([...(projectContext.rooms?.map(r => r.name) || []), ...selections.map(s => s.roomId)]));

    const updateFinancials = (id: string, field: keyof MaterialSelection, value: number) => {
        const updated = selections.map(s => {
            if (s.id === id) {
                const newS = { ...s, [field]: value };
                if (newS.quotedPrice && newS.allowancePrice && newS.quotedPrice > newS.allowancePrice) {
                    newS.costDelta = newS.quotedPrice - newS.allowancePrice;
                    newS.itemType = 'change_request';
                } else if (newS.quotedPrice && newS.allowancePrice && newS.quotedPrice <= newS.allowancePrice) {
                    newS.costDelta = 0;
                    newS.itemType = 'selection';
                }
                return newS;
            }
            return s;
        });
        setSelections(updated);
        setProjectContext({ ...projectContext, materialSelections: updated });
    };

    const columns = [
        { id: 'to_select', label: 'To Select', icon: <Eye size={16} />, color: 'bg-slate-100 text-slate-700' },
        { id: 'sent_for_approval', label: 'Client Review', icon: <Clock size={16} />, color: 'bg-amber-100 text-amber-700' },
        { id: 'approved', label: 'Approved', icon: <CheckCircle size={16} />, color: 'bg-emerald-100 text-emerald-700' },
        { id: 'ordered', label: 'Ordered', icon: <ShoppingCart size={16} />, color: 'bg-blue-100 text-blue-700' },
        { id: 'delivered', label: 'Delivered', icon: <Package size={16} />, color: 'bg-indigo-100 text-indigo-700' },
    ];

    const getColumnItems = (colId: string) => {
        return selections.filter(s => {
            if (colId === 'to_select') return s.status === 'to_select' || s.status === 'pending_selection';
            if (colId === 'sent_for_approval') return s.status === 'sent_for_approval' || s.status === 'pending_approval';
            if (colId === 'approved') return s.status === 'approved' || s.status === 'locked';
            if (colId === 'ordered') return s.status === 'ordered';
            if (colId === 'delivered') return s.status === 'delivered';
            return false;
        });
    };

    const totalAllowance = selections.reduce((acc, s) => acc + (s.allowancePrice || 0) * (s.estimatedQty || 1), 0);
    const totalActual = selections.reduce((acc, s) => acc + (s.quotedPrice || 0) * (s.estimatedQty || 1), 0);
    const totalVariance = totalActual - totalAllowance;

    const changeRequests = selections.filter(s => s.itemType === 'change_request');

    return (
        <div className="max-w-[1400px] mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">SOF & Selections Board</h2>
                    <p className="text-sm text-slate-500 mt-1">Track material selections, financials, and scope changes.</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setViewMode('kanban')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}
                    >
                        Kanban Board
                    </button>
                    <button 
                        onClick={() => setViewMode('rooms')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'rooms' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}
                    >
                        By Room
                    </button>
                    <button 
                        onClick={() => setViewMode('financials')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'financials' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}
                    >
                        Financials & Scope
                    </button>
                    <button 
                        onClick={() => setViewMode('client_presentation')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'client_presentation' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}
                    >
                        Client Presentation
                    </button>
                    <button 
                        onClick={() => setShowAddModal(true)}
                        className="ml-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2"
                    >
                        <Plus size={16} /> Add Item
                    </button>
                </div>
            </div>

            {viewMode === 'kanban' && (
                <div className="flex gap-6 overflow-x-auto pb-4 h-[calc(100vh-250px)]">
                    {columns.map(col => (
                        <div key={col.id} className="min-w-[300px] flex-1 bg-slate-50/50 rounded-2xl flex flex-col border border-slate-200/60 overflow-hidden">
                            <div className="p-4 border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 flex items-center justify-between">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold ${col.color}`}>
                                    {col.icon}
                                    {col.label}
                                </div>
                                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                                    {getColumnItems(col.id).length}
                                </span>
                            </div>
                            
                            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                                <AnimatePresence>
                                    {getColumnItems(col.id).map(item => (
                                        <motion.div 
                                            key={item.id}
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 group hover:border-indigo-300 transition-colors"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                                                    {item.category}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400 truncate max-w-[100px]">
                                                    {item.roomId}
                                                </span>
                                            </div>
                                            <h4 className="font-bold text-slate-800 text-sm mb-1">{item.itemName}</h4>
                                            {item.finishCode && (
                                                <p className="text-xs text-slate-500 font-medium font-mono bg-slate-50 inline-block px-1.5 py-0.5 rounded border border-slate-100">
                                                    {item.finishCode}
                                                </p>
                                            )}
                                            
                                            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <select 
                                                    className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none"
                                                    value={item.status}
                                                    onChange={(e) => updateSelectionStatus(item.id, e.target.value)}
                                                >
                                                    <option value="to_select">To Select</option>
                                                    <option value="sent_for_approval">Client Review</option>
                                                    <option value="approved">Approved</option>
                                                    <option value="ordered">Ordered</option>
                                                    <option value="delivered">Delivered</option>
                                                </select>
                                                <button className="text-[10px] font-bold text-indigo-600 hover:underline">View Details</button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                {getColumnItems(col.id).length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 pb-10">
                                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center opacity-50">
                                            {col.icon}
                                        </div>
                                        <p className="text-xs font-medium">No items</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {viewMode === 'rooms' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from(new Set(selections.map(s => s.roomId))).map(room => {
                        const roomItems = selections.filter(s => s.roomId === room);
                        return (
                            <div key={room} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                                <h3 className="font-bold text-lg text-slate-900 mb-4 flex items-center justify-between">
                                    {room}
                                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                                        {roomItems.length} items
                                    </span>
                                </h3>
                                <div className="space-y-3">
                                    {roomItems.map(item => (
                                        <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{item.itemName}</p>
                                                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{item.category}</p>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                                                ['approved', 'locked'].includes(item.status) ? 'bg-emerald-100 text-emerald-700' :
                                                ['ordered', 'delivered'].includes(item.status) ? 'bg-blue-100 text-blue-700' :
                                                ['sent_for_approval', 'pending_approval'].includes(item.status) ? 'bg-amber-100 text-amber-700' :
                                                'bg-slate-200 text-slate-600'
                                            }`}>
                                                {item.status.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {viewMode === 'financials' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                                    <DollarSign size={20} />
                                </div>
                                <h3 className="font-bold text-slate-700">Total Allowance</h3>
                            </div>
                            <p className="text-3xl font-bold text-slate-900">{formatINR(totalAllowance)}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                    <ShoppingCart size={20} />
                                </div>
                                <h3 className="font-bold text-slate-700">Total Actual</h3>
                            </div>
                            <p className="text-3xl font-bold text-slate-900">{formatINR(totalActual)}</p>
                        </div>
                        <div className={`bg-white p-6 rounded-2xl shadow-sm border ${totalVariance > 0 ? 'border-rose-200' : 'border-emerald-200'}`}>
                            <div className="flex items-center gap-3 mb-2">
                                <div className={`p-2 rounded-lg ${totalVariance > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                    <AlertTriangle size={20} />
                                </div>
                                <h3 className="font-bold text-slate-700">Variance (Delta)</h3>
                            </div>
                            <p className={`text-3xl font-bold ${totalVariance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {totalVariance > 0 ? '+' : ''}{formatINR(totalVariance)}
                            </p>
                            {totalVariance > 0 && <p className="text-xs text-rose-500 mt-1">Requires Change Request / Scope Addition</p>}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h3 className="font-bold text-lg text-slate-900">Financial Tracking (Allowances vs Actuals)</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-medium">
                                    <tr>
                                        <th className="py-4 px-6">Item</th>
                                        <th className="py-4 px-6">Room</th>
                                        <th className="py-4 px-6">Qty</th>
                                        <th className="py-4 px-6">Allowance (₹)</th>
                                        <th className="py-4 px-6">Actual / Quoted (₹)</th>
                                        <th className="py-4 px-6">Variance</th>
                                        <th className="py-4 px-6">Scope Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selections.map(item => {
                                        const qty = item.estimatedQty || 1;
                                        const allowance = (item.allowancePrice || 0) * qty;
                                        const actual = (item.quotedPrice || 0) * qty;
                                        const variance = actual - allowance;
                                        const isOverage = variance > 0 && allowance > 0;

                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-4 px-6">
                                                    <p className="font-bold text-slate-900">{item.itemName}</p>
                                                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.category}</p>
                                                </td>
                                                <td className="py-4 px-6 text-slate-600">{item.roomId}</td>
                                                <td className="py-4 px-6 text-slate-600">{qty}</td>
                                                <td className="py-4 px-6">
                                                    <input 
                                                        type="number"
                                                        value={item.allowancePrice || ''}
                                                        onChange={(e) => updateFinancials(item.id, 'allowancePrice', parseFloat(e.target.value) || 0)}
                                                        placeholder="0"
                                                        className="w-24 px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                                    />
                                                </td>
                                                <td className="py-4 px-6">
                                                    <input 
                                                        type="number"
                                                        value={item.quotedPrice || ''}
                                                        onChange={(e) => updateFinancials(item.id, 'quotedPrice', parseFloat(e.target.value) || 0)}
                                                        placeholder="0"
                                                        className="w-24 px-2 py-1 bg-white border border-slate-200 rounded text-slate-900 font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                                    />
                                                </td>
                                                <td className="py-4 px-6">
                                                    <span className={`font-bold font-mono ${variance > 0 ? 'text-rose-600' : variance < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                        {variance > 0 ? '+' : ''}{formatINR(variance)}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-6">
                                                    {isOverage || item.itemType === 'change_request' ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md">
                                                            <PlusCircle size={12} /> Auto-Added to Scope
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md">
                                                            Within Scope
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {selections.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                                                No selections added yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {changeRequests.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-rose-200 overflow-hidden">
                            <div className="p-6 border-b border-rose-100 bg-rose-50/50">
                                <h3 className="font-bold text-lg text-rose-900 flex items-center gap-2">
                                    <AlertTriangle size={20} />
                                    Auto-Scope Additions (Change Requests)
                                </h3>
                                <p className="text-sm text-rose-600 mt-1">Items that exceeded their allowance and require client sign-off or additional invoicing.</p>
                            </div>
                            <div className="p-6">
                                <div className="space-y-4">
                                    {changeRequests.map(cr => {
                                        const qty = cr.estimatedQty || 1;
                                        const allowance = (cr.allowancePrice || 0) * qty;
                                        const actual = (cr.quotedPrice || 0) * qty;
                                        const variance = actual - allowance;
                                        return (
                                            <div key={cr.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-rose-300 transition-colors">
                                                <div>
                                                    <h4 className="font-bold text-slate-900">{cr.itemName} <span className="text-slate-400 font-normal text-sm">in {cr.roomId}</span></h4>
                                                    <p className="text-xs text-slate-500 mt-1">Allowance: {formatINR(allowance)} | Actual: {formatINR(actual)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-rose-600 mb-1">+{formatINR(variance)}</p>
                                                    <button className="text-[10px] font-bold bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors">
                                                        Send for Approval
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {viewMode === 'client_presentation' && (
                <div className="space-y-6">
                    <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl flex items-center justify-between">
                        <div>
                            <h2 className="text-3xl font-bold font-serif mb-2">Material Selections</h2>
                            <p className="text-slate-400">Review and approve materials selected for your project.</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-400 mb-1">Items for Review</p>
                            <p className="text-4xl font-bold">{selections.filter(s => s.status === 'sent_for_approval').length}</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-8">
                        {selections.filter(s => s.status === 'sent_for_approval' || s.status === 'approved').map(item => (
                            <div key={item.id} className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden group flex flex-col">
                                <div className="h-48 bg-slate-100 relative">
                                    {item.photos && item.photos.length > 0 ? (
                                        <img src={item.photos[0]} alt={item.itemName} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                            <Eye size={48} />
                                        </div>
                                    )}
                                    <div className="absolute top-4 right-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm backdrop-blur-md ${item.status === 'approved' ? 'bg-emerald-500/90 text-white' : 'bg-white/90 text-indigo-900'}`}>
                                            {item.status === 'approved' ? 'Approved' : 'Pending Review'}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-6 flex flex-col flex-1">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-1">{item.category} • {item.roomId}</p>
                                            <h3 className="text-xl font-bold text-slate-900">{item.itemName}</h3>
                                        </div>
                                    </div>
                                    {item.notes && (
                                        <p className="text-sm text-slate-600 mb-6 line-clamp-2">{item.notes}</p>
                                    )}
                                    <div className="mt-auto pt-4 border-t border-slate-100">
                                        {item.status !== 'approved' && (
                                            <div className="flex gap-3">
                                                <button 
                                                    onClick={() => updateSelectionStatus(item.id, 'approved')}
                                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle size={16} /> Approve
                                                </button>
                                                <button 
                                                    onClick={() => updateSelectionStatus(item.id, 'to_select')}
                                                    className="flex-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 py-2.5 rounded-xl text-sm font-bold transition-colors"
                                                >
                                                    Request Change
                                                </button>
                                            </div>
                                        )}
                                        {item.status === 'approved' && (
                                            <div className="w-full text-center py-2 text-sm font-bold text-emerald-600 bg-emerald-50 rounded-xl">
                                                Approved for execution
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {selections.filter(s => s.status === 'sent_for_approval' || s.status === 'approved').length === 0 && (
                            <div className="col-span-full py-20 text-center text-slate-400">
                                <CheckCircle size={48} className="mx-auto mb-4 opacity-50" />
                                <p className="text-lg font-medium">No items currently pending review.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Item Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                    <PlusCircle className="text-indigo-600" /> Fast Add Selection
                                </h3>
                                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-full shadow-sm">
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <div className="p-6 overflow-y-auto space-y-8 flex-1">
                                {/* 1. Room Selection (Tiles) */}
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 block">1. Select Room</label>
                                    <div className="flex flex-wrap gap-2">
                                        {availableRooms.map(room => (
                                            <button
                                                key={room}
                                                onClick={() => setNewSelection(prev => ({ ...prev, roomId: room }))}
                                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${newSelection.roomId === room ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-105' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
                                            >
                                                {room}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 2. Category Selection (Tiles) */}
                                <div className={`transition-opacity duration-300 ${!newSelection.roomId ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 block">2. Select Category</label>
                                    <div className="grid grid-cols-4 gap-3">
                                        {PRESET_CATEGORIES.map(cat => (
                                            <button
                                                key={cat.id}
                                                onClick={() => setNewSelection(prev => ({ ...prev, category: cat.id }))}
                                                className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all border ${newSelection.category === cat.id ? 'bg-indigo-50 border-indigo-500 shadow-md ring-2 ring-indigo-200 scale-105' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-slate-50'}`}
                                            >
                                                <span className="text-2xl mb-2">{cat.icon}</span>
                                                <span className={`text-xs font-bold ${newSelection.category === cat.id ? 'text-indigo-700' : 'text-slate-600'}`}>{cat.id}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 3. Item Details */}
                                <div className={`transition-opacity duration-300 ${!newSelection.category ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 block">3. Item Details</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 mb-1 block">Item Name</label>
                                            <input 
                                                type="text" 
                                                placeholder="e.g. Master Bed Headboard"
                                                value={newSelection.itemName}
                                                onChange={(e) => setNewSelection(prev => ({ ...prev, itemName: e.target.value }))}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                                                autoFocus
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 mb-1 block">Allowance Budget (₹)</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-3 text-slate-400 font-bold">₹</span>
                                                <input 
                                                    type="number" 
                                                    placeholder="0"
                                                    value={newSelection.allowancePrice}
                                                    onChange={(e) => setNewSelection(prev => ({ ...prev, allowancePrice: e.target.value }))}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-4 py-3 text-sm font-bold font-mono text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                                <span className="text-xs text-slate-400 font-medium">Room remains selected after adding for rapid data entry.</span>
                                <button 
                                    onClick={handleAddSelection}
                                    disabled={!newSelection.roomId || !newSelection.category || !newSelection.itemName}
                                    className="bg-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-indigo-700 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                                >
                                    <Plus size={18} /> Add Selection
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
