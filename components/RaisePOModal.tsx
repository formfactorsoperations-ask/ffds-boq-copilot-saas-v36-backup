import React, { useState, useEffect, useMemo } from 'react';
import { ProjectContext, MaterialSelection, PurchaseOrder, POLine, Vendor, POScope, POStatus } from '../types';
import { db } from '../services/dbService';
import { generateId } from '../lib/utils';
import { X, Plus, Trash2, ShieldAlert } from 'lucide-react';

interface RaisePOModalProps {
  projectId: string;
  projectContext: ProjectContext;
  selectedSelections: MaterialSelection[];
  onClose: () => void;
  onSuccess: () => void;
  defaultRoomId?: string;
  defaultCategory?: string;
}

export default function RaisePOModal({
  projectId,
  projectContext,
  selectedSelections,
  onClose,
  onSuccess,
  defaultRoomId,
  defaultCategory
}: RaisePOModalProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [vendorName, setVendorName] = useState<string>('');
  
  const [poNumber, setPoNumber] = useState<string>('');
  const [scope, setScope] = useState<POScope>('material');
  const [status, setStatus] = useState<POStatus>('issued'); // Default issued so it commits against budget immediately
  const [taxRate, setTaxRate] = useState<number>(18);
  const [expectedDelivery, setExpectedDelivery] = useState<string>('');
  const [terms, setTerms] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [roomId, setRoomId] = useState<string>('General');
  const [category, setCategory] = useState<string>('General');
  const [selectedRoomOption, setSelectedRoomOption] = useState<string>('General');
  const [selectedCategoryOption, setSelectedCategoryOption] = useState<string>('General');
  
  const [lines, setLines] = useState<POLine[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const roomsOptions = useMemo(() => {
    const list = ['General'];
    if (projectContext.rooms) {
      projectContext.rooms.forEach(r => { if (r.name && !list.includes(r.name)) list.push(r.name); });
    }
    if (projectContext.materialSelections) {
      projectContext.materialSelections.forEach(s => { if (s.roomId && !list.includes(s.roomId)) list.push(s.roomId); });
    }
    return list;
  }, [projectContext]);

  const categoriesOptions = useMemo(() => {
    const list = ['General', 'Modular Kitchen', 'Tiling', 'Painting', 'Woodwork', 'Electrical', 'Plumbing', 'Civil'];
    if (projectContext.materialSelections) {
      projectContext.materialSelections.forEach(s => { if (s.category && !list.includes(s.category)) list.push(s.category); });
    }
    return list;
  }, [projectContext]);

  useEffect(() => {
    const rId = defaultRoomId || selectedSelections[0]?.roomId || 'General';
    const cat = defaultCategory || selectedSelections[0]?.category || 'General';
    
    setRoomId(rId);
    setCategory(cat);
    
    if (roomsOptions.includes(rId)) {
      setSelectedRoomOption(rId);
    } else {
      setSelectedRoomOption('custom');
    }

    if (categoriesOptions.includes(cat)) {
      setSelectedCategoryOption(cat);
    } else {
      setSelectedCategoryOption('custom');
    }
  }, [defaultRoomId, defaultCategory, selectedSelections, roomsOptions, categoriesOptions]);

  // Load vendors and calculate automatic fields
  useEffect(() => {
    const initData = async () => {
      try {
        const loadedVendors = await db.getVendors();
        setVendors(loadedVendors);

        // Pre-fill vendor name if selectedSelections have a vendor
        const firstWithVendor = selectedSelections.find(s => s.vendor && s.vendor.trim());
        if (firstWithVendor) {
          const matchedVendor = loadedVendors.find(v => v.name.toLowerCase() === firstWithVendor.vendor!.trim().toLowerCase());
          if (matchedVendor) {
            setSelectedVendorId(matchedVendor.id);
            setVendorName(matchedVendor.name);
          } else {
            setVendorName(firstWithVendor.vendor!.trim());
          }
        }

        // Generate dynamic PO Number
        const existingPOs = await db.getPurchaseOrders(projectId);
        const count = existingPOs.length + 1;
        const prefix = projectContext.name ? projectContext.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'PRJ') : 'PO';
        setPoNumber(`${prefix}-PO-${String(count).padStart(3, '0')}`);
      } catch (err) {
        console.error('Error initializing RaisePOModal:', err);
      }
    };

    initData();
  }, [projectId, projectContext, selectedSelections]);

  // Pre-fill lines from selected selections
  useEffect(() => {
    if (selectedSelections.length > 0) {
      const initialLines: POLine[] = selectedSelections.map(sel => {
        const rate = sel.quotedPrice || 0;
        const qty = sel.estimatedQty || 1;
        return {
          id: 'line_' + generateId(),
          description: `${sel.itemName || 'Untitled Selection'} (${sel.roomId || 'General'})`,
          qty,
          rate,
          unit: sel.priceUnit || 'unit',
          amount: qty * rate,
          materialSelectionId: sel.id
        };
      });
      setLines(initialLines);
    }
  }, [selectedSelections]);

  // Sync vendor details when selectedVendorId changes
  const handleVendorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedVendorId(val);
    if (val === 'custom') {
      setVendorName('');
    } else {
      const v = vendors.find(x => x.id === val);
      if (v) {
        setVendorName(v.name);
        if (v.paymentTerms) setTerms(v.paymentTerms);
      }
    }
  };

  const handleLineChange = (index: number, field: keyof POLine, value: any) => {
    const updated = [...lines];
    const line = { ...updated[index] };
    if (field === 'qty') {
      line.qty = parseFloat(value) || 0;
      line.amount = line.qty * line.rate;
    } else if (field === 'rate') {
      line.rate = parseFloat(value) || 0;
      line.amount = line.qty * line.rate;
    } else {
      (line as any)[field] = value;
    }
    updated[index] = line;
    setLines(updated);
  };

  const handleAddLine = () => {
    setLines([...lines, {
      id: 'line_' + generateId(),
      description: '',
      qty: 1,
      rate: 0,
      unit: 'unit',
      amount: 0
    }]);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  // Calculations
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const total = subtotal + (subtotal * (taxRate / 100));

  const handleSave = async () => {
    if (!vendorName.trim()) {
      setError('Please specify a Vendor Name.');
      return;
    }
    if (!poNumber.trim()) {
      setError('Please specify a PO Number.');
      return;
    }
    if (lines.length === 0) {
      setError('Please add at least one line item to the PO.');
      return;
    }
    if (lines.some(l => !l.description.trim())) {
      setError('All line items must have descriptions.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Determine final roomId and category for envelope tracking
      const finalRoomId = roomId.trim() || 'General';
      const finalCategory = category.trim() || 'General';

      const newPO: PurchaseOrder = {
        id: 'po_' + generateId(),
        poNumber: poNumber.trim(),
        projectId,
        vendorId: selectedVendorId === 'custom' || !selectedVendorId ? 'custom_vendor' : selectedVendorId,
        vendorName: vendorName.trim(),
        scope,
        status,
        roomId: finalRoomId,
        category: finalCategory,
        lines,
        subtotal,
        taxRate,
        total,
        expectedDelivery: expectedDelivery || undefined,
        terms: terms || undefined,
        notes: notes || undefined,
        payments: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Strip any undefined keys so that Firestore is guaranteed not to throw an error
      const cleanPO = JSON.parse(JSON.stringify(newPO));

      const existingPOs = await db.getPurchaseOrders(projectId);
      await db.savePurchaseOrders(projectId, [cleanPO, ...existingPOs]);

      // If we raised this PO from material selections, let's mark those selections as "ordered"!
      const selectionIdsToMark = lines.map(l => l.materialSelectionId).filter(Boolean) as string[];
      if (selectionIdsToMark.length > 0) {
        const currentSelections = projectContext.materialSelections || [];
        const updatedSelections = currentSelections.map(sel => {
          if (selectionIdsToMark.includes(sel.id)) {
            return { ...sel, status: 'ordered' as any };
          }
          return sel;
        });

        // Save back to project context & persistence
        if (projectContext) {
          projectContext.materialSelections = updatedSelections;
          const allProjs = await db.getProjects();
          const targetProj = allProjs.find(p => p.id === projectId);
          if (targetProj) {
            const updatedProject = {
              ...targetProj,
              context: {
                ...targetProj.context,
                materialSelections: updatedSelections
              },
              lastModified: Date.now()
            };
            await db.saveProject(updatedProject);
          }
        }
      }

      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to save purchase order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0066CC]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200/60 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-[#0066CC]/90 backdrop-blur-md border border-white/20 px-6 py-4 flex items-center justify-between text-white">
          <div>
            <h3 className="text-lg font-black tracking-tight">Raise Purchase Order</h3>
            <p className="text-xs text-sky-200/80 mt-0.5">Pre-filled with selections for {projectContext.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-rose-800">{error}</p>
            </div>
          )}

          {/* Core metadata details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">PO Number</label>
              <input
                type="text"
                value={poNumber}
                onChange={e => setPoNumber(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Vendor selection</label>
              <select
                value={selectedVendorId}
                onChange={handleVendorChange}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none bg-white"
              >
                <option value="">-- Choose Vendor --</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
                <option value="custom">Other / One-off Vendor</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Vendor Name</label>
              <input
                type="text"
                value={vendorName}
                onChange={e => setVendorName(e.target.value)}
                disabled={selectedVendorId !== 'custom' && selectedVendorId !== ''}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="Enter vendor name"
              />
            </div>
          </div>

          {/* Room and Category selection for envelope routing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Room / Location</label>
              <div className="flex gap-2">
                <select
                  value={selectedRoomOption}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedRoomOption(val);
                    if (val !== 'custom') {
                      setRoomId(val);
                    } else {
                      setRoomId('');
                    }
                  }}
                  className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none bg-white"
                >
                  {roomsOptions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                  <option value="custom">Other (Enter Custom Room)...</option>
                </select>
                {selectedRoomOption === 'custom' && (
                  <input
                    type="text"
                    value={roomId}
                    onChange={e => setRoomId(e.target.value)}
                    placeholder="Custom room name"
                    className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Category</label>
              <div className="flex gap-2">
                <select
                  value={selectedCategoryOption}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedCategoryOption(val);
                    if (val !== 'custom') {
                      setCategory(val);
                    } else {
                      setCategory('');
                    }
                  }}
                  className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none bg-white"
                >
                  {categoriesOptions.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="custom">Other (Enter Custom Category)...</option>
                </select>
                {selectedCategoryOption === 'custom' && (
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="Custom category name"
                    className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Scope</label>
              <select
                value={scope}
                onChange={e => setScope(e.target.value as POScope)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none bg-white"
              >
                <option value="material">Materials Only</option>
                <option value="labour">Labour / Installation</option>
                <option value="turnkey">Turnkey / All-in</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as POStatus)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none bg-white"
              >
                <option value="draft">Draft PO</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="issued">Issued (Committed)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Expected Delivery</label>
              <input
                type="date"
                value={expectedDelivery}
                onChange={e => setExpectedDelivery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">GST/Tax rate (%)</label>
              <input
                type="number"
                value={taxRate}
                onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
              />
            </div>
          </div>

          {/* Line items section */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-900">Line Items</span>
              <button
                type="button"
                onClick={handleAddLine}
                className="flex items-center gap-1 text-[11px] font-bold text-[#0066CC] hover:text-[#0055B3] uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5" /> Add line
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={line.id} className="flex gap-2.5 items-center bg-slate-50 border border-slate-100 p-3 rounded-2xl">
                  <div className="flex-grow grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-6">
                      <input
                        type="text"
                        placeholder="Description"
                        value={line.description}
                        onChange={e => handleLineChange(index, 'description', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <input
                        type="number"
                        placeholder="Qty"
                        value={line.qty === 0 ? '' : line.qty}
                        onChange={e => handleLineChange(index, 'qty', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-right focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <input
                        type="number"
                        placeholder="Rate"
                        value={line.rate === 0 ? '' : line.rate}
                        onChange={e => handleLineChange(index, 'rate', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-right focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center justify-end font-mono font-bold text-xs text-slate-700 px-2 select-none">
                      ₹{line.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveLine(index)}
                    className="p-1.5 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-colors text-slate-400 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary Cards, Terms, Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Payment terms</label>
                <textarea
                  value={terms}
                  onChange={e => setTerms(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs font-semibold focus:ring-2 focus:ring-[#0066CC] focus:outline-none h-16"
                  placeholder="e.g. 50% advance, 50% on delivery"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Notes / Internal Instructions</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs font-semibold focus:ring-2 focus:ring-[#0066CC] focus:outline-none h-16"
                  placeholder="e.g. Delivery instructions, quality check remarks"
                />
              </div>
            </div>

            <div className="bg-sky-50/50 rounded-2xl border border-sky-100/50 p-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-mono font-bold">₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>GST ({taxRate}%)</span>
                  <span className="font-mono font-bold">₹{(subtotal * (taxRate / 100)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-sky-100/50 pt-3 mt-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-900">Grand Total</span>
                <span className="text-xl font-black text-slate-900 font-mono">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-end gap-3.5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border border-slate-200 hover:bg-white text-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-[#0066CC] hover:bg-[#0055B3] disabled:bg-sky-400 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-sky-100 flex items-center gap-1.5"
          >
            {saving ? 'Saving...' : 'Raise Purchase Order'}
          </button>
        </div>

      </div>
    </div>
  );
}
