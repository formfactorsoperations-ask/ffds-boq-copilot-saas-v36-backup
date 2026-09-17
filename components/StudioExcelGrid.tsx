
import React, { useState, useEffect } from 'react';
import { FullBoqItem, Room, BoqItem } from '../types';
import { calculateSellPrice, formatCurrency } from '../lib/utils';
import { DeleteIcon, LinkIcon, PlusIcon, ChevronDownIcon } from './Icons';
import { motion, AnimatePresence } from 'framer-motion';

interface StudioExcelGridProps {
    items: FullBoqItem[];
    rooms: Room[];
    onUpdate: (itemId: string, fieldOrUpdates: keyof BoqItem | Partial<BoqItem>, value?: any) => void;
    onBulkUpdate?: (updates: {itemId: string, updates: Partial<BoqItem>}[]) => void;
    onDelete: (itemId: string) => void;
    onViewInBank: (bankId: string) => void;
    onAddItem: (roomName: string) => void;
    isOwner?: boolean;
    boqFrozen?: boolean;
    highlightedItemIds?: string[];
    lensEnabled?: boolean;
    marginAnalytics?: any;
    searchQuery?: string;
}

const FastInput: React.FC<{
    value: string | number;
    onChange: (val: string | number) => void;
    type?: 'text' | 'number';
    className?: string;
    placeholder?: string;
}> = ({ value, onChange, type = 'text', className = "", placeholder }) => {
    return (
        <input
            type={type}
            value={value !== undefined ? value : ''}
            onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
            placeholder={placeholder}
            className={`bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#3D52A0] focus:bg-white outline-none transition-all w-full px-1 py-0.5 text-sm ${className}`}
        />
    );
};

const STATUS_OPTIONS = [
    { value: 'included_ffds_scope', label: 'Included' },
    { value: 'approved_variation', label: 'Approved Variation' },
    { value: 'as_actuals', label: 'As Actuals' },
    { value: 'provisional_sum', label: 'Provisional Sum' },
    { value: 'pending_finalisation', label: 'Pending Finalisation' },
    { value: 'client_procured', label: 'Client Procured' },
    { value: 'excluded', label: 'Excluded from Firm Scope' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'deleted', label: 'Deleted' },
    { value: 'substituted', label: 'Substituted' },
];

/*
  A figure that flashes once when it changes.

  Editing a quantity moves the line total, the room subtotal and the sheet
  total at once, and none of them are near the cursor. Without a cue the only
  way to know an edit landed is to go and look — which is exactly the doubt
  that made people re-type numbers.

  The first render never flashes: mounting a sheet is not a change.
*/
const FlashValue: React.FC<{ value: number; className?: string; children: React.ReactNode }> = ({ value, className = '', children }) => {
  const [flash, setFlash] = React.useState(false);
  const prev = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (prev.current !== null && prev.current !== value) {
      setFlash(false);
      // Two frames, so the class is genuinely removed before it is re-added —
      // otherwise a second edit inside the animation window does nothing.
      requestAnimationFrame(() => requestAnimationFrame(() => setFlash(true)));
    }
    prev.current = value;
  }, [value]);
  return (
    <span onAnimationEnd={() => setFlash(false)} className={`${flash ? 'boq-flash' : ''} rounded px-1 -mx-1 ${className}`}>
      {children}
    </span>
  );
};

/*
  A column header that can be sorted and dragged.

  The grip is a 5px strip on the trailing edge rather than a visible divider —
  it appears on hover, so the header stays quiet until someone reaches for it.
  Double-clicking it forgets the stored width and returns the column to auto.
*/
const HeadCell: React.FC<{
  label: string;
  colKey?: string;
  sortKey?: 'name' | 'qty' | 'cost' | 'margin' | 'rate' | 'total';
  align?: 'left' | 'right' | 'center';
  className?: string;
  width?: React.CSSProperties;
  sort: { key: string; dir: 'asc' | 'desc' } | null;
  onSort?: (k: any) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
  onResizeReset?: () => void;
  dragging?: boolean;
}> = ({ label, sortKey, align = 'left', className = '', width, sort, onSort, onResizeStart, onResizeReset, dragging }) => {
  const active = sortKey && sort?.key === sortKey;
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th className={`p-3 relative group/head select-none ${className}`} style={width}
        aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        disabled={!sortKey}
        onClick={() => sortKey && onSort?.(sortKey)}
        className={`flex items-center gap-1 w-full ${justify} ${
          sortKey ? 'cursor-pointer hover:text-slate-700' : 'cursor-default'
        } ${active ? 'text-[#3D52A0]' : ''} uppercase tracking-wider font-bold text-[10px] transition-colors`}
      >
        <span className="truncate">{label}</span>
        {sortKey && (
          <span className={`text-[9px] leading-none transition-all duration-150 ${
            active ? 'opacity-100' : 'opacity-0 group-hover/head:opacity-40'
          }`}>{active && sort!.dir === 'desc' ? '▼' : '▲'}</span>
        )}
      </button>
      {onResizeStart && (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label}`}
          onMouseDown={onResizeStart}
          onDoubleClick={onResizeReset}
          title="Drag to resize · double-click to reset"
          className={`boq-grip absolute top-0 right-0 h-full w-[5px] cursor-col-resize print:hidden ${
            dragging ? 'bg-[#3D52A0]' : 'bg-transparent hover:bg-[#3D52A0]/40'
          }`}
        />
      )}
    </th>
  );
};

const StudioExcelGrid: React.FC<StudioExcelGridProps> = ({ items, rooms, onUpdate, onBulkUpdate, onDelete, onViewInBank, onAddItem, isOwner, boqFrozen, highlightedItemIds = [], lensEnabled, marginAnalytics, searchQuery }) => {
    /*
      What the grid shows, and why so little of it by default.

      Fourteen columns were always on and every row printed its full spec
      paragraph under the name, so a row was three lines tall and the same
      sentence — "including carcass, shutters/panels, basic hardware and
      laminate/paint finish as per approved drawings" — repeated down the
      screen. The information is real; showing all of it at once is what made
      the grid unreadable.

      Compact is the default: one line per row, spec on demand. Nothing is
      removed, only folded.
    */
    /*
      The grid could not tell you what the BOQ came to.

      Every other surface in the app shows a total; the one screen where the
      lines are actually edited had none, so checking the effect of an edit
      meant leaving the grid. Excluded and deleted lines are counted separately
      rather than silently dropped — a line taken out of the firm scope is a
      decision worth seeing the size of.
    */
    const sheetTotals = React.useMemo(() => {
      let firm = 0, excluded = 0, cost = 0, live = 0;
      items.forEach(i => {
        const value = calculateSellPrice(i.materials, i.labor, i.margin) * (i.qty || 0);
        const out = i.boqStatus === 'deleted' || i.boqStatus === 'excluded' || i.boqStatus === 'client_procured';
        if (out) { excluded += value; return; }
        firm += value;
        cost += ((i.materials || 0) + (i.labor || 0)) * (i.qty || 0);
        live += 1;
      });
      return { firm, excluded, cost, live, margin: firm > 0 ? ((firm - cost) / firm) * 100 : 0 };
    }, [items]);

    /*
      Sorting inside the room, never across it.

      Room grouping is the structure of a BOQ — a contractor is handed a room,
      not a global list — so sorting reorders within each group and leaves the
      groups where they are. Sorting the whole sheet by value would destroy the
      only organising principle the document has.
    */
    const [sort, setSort] = useState<{ key: 'name' | 'qty' | 'cost' | 'margin' | 'rate' | 'total'; dir: 'asc' | 'desc' } | null>(null);

    /*
      Flags, not filters.

      Each answers a question an estimator asks out loud while reviewing — what
      is under margin, what did I leave at zero, what is not linked to a
      drawing. They stack, and each carries its own count, so a flag with
      nothing behind it says so instead of filtering to an empty sheet.
    */
    const [flags, setFlags] = useState<Set<string>>(new Set());
    const toggleFlag = (f: string) => setFlags(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });

    /* Column widths, dragged by the studio and remembered per browser. */
    const [colW, setColW] = useState<Record<string, number>>(() => {
      try { return JSON.parse(localStorage.getItem('ffds_boq_colw') || '{}'); } catch { return {}; }
    });
    const [dragCol, setDragCol] = useState<string | null>(null);
    useEffect(() => {
      try { localStorage.setItem('ffds_boq_colw', JSON.stringify(colW)); } catch { /* private mode */ }
    }, [colW]);

    const startResize = (key: string, startX: number, startW: number) => {
      setDragCol(key);
      const move = (e: MouseEvent) => {
        // 90px floor: below this the header label itself clips.
        setColW(prev => ({ ...prev, [key]: Math.max(90, Math.round(startW + (e.clientX - startX))) }));
      };
      const up = () => {
        setDragCol(null);
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };

    /* One handler for every header: click sorts, second click reverses,
       third clears — so a column can always be put back the way it was. */
    const cycleSort = (key: any) => setSort(prev =>
      !prev || prev.key !== key ? { key, dir: 'asc' }
      : prev.dir === 'asc' ? { key, dir: 'desc' }
      : null);

    const headProps = (colKey: string) => ({
      sort,
      onSort: cycleSort,
      width: wOf(colKey),
      dragging: dragCol === colKey,
      onResizeStart: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement;
        startResize(colKey, e.clientX, th?.getBoundingClientRect().width || 120);
      },
      onResizeReset: () => setColW(prev => {
        const next = { ...prev };
        delete next[colKey];
        return next;
      }),
    });

    /** Width style for a resizable column; undefined until it has been dragged. */
    const wOf = (key: string) =>
      colW[key] ? { width: colW[key], minWidth: colW[key], maxWidth: colW[key] } : undefined;

    const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
    const [dimsOverride, setDimsOverride] = useState<boolean | null>(null);

    /*
      L, W and M are three narrow columns that are empty on most projects —
      quantities usually arrive from the takeoff or by hand, not from
      dimensions typed here. So they appear when the project actually uses
      them, and the studio can force them on for one that is about to.
    */
    const projectUsesDims = React.useMemo(
      () => items.some(i => (i.calcLength || 0) > 0 || (i.calcWidth || 0) > 0 || (i.calcMultiplier || 0) > 1),
      [items],
    );
    const showDims = dimsOverride !== null ? dimsOverride : projectUsesDims;

    /* colSpan has to follow the columns, or every group header and empty state
       tears its row open by three cells. */
    const COLS = 14 - (showDims ? 0 : 3);

    const [coModal, setCoModal] = useState<{itemId: string, newStatus: string} | null>(null);
    const [bulkCoModal, setBulkCoModal] = useState<{itemIds: string[], newStatus: string} | null>(null);
    const [coRef, setCoRef] = useState("");
    const [coReason, setCoReason] = useState("");
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [undoStack, setUndoStack] = useState<{itemIds: string[], prevStates: Partial<BoqItem>[]}[]>([]);

    const [linkageModal, setLinkageModal] = useState<string | null>(null);
    const [statusModalId, setStatusModalId] = useState<string | null>(null);
    const [linkageType, setLinkageType] = useState<'drawing' | 'selection_sheet' | 'site_instruction' | 'change_order' | 'direct_execution'>('direct_execution');
    const [linkageRef, setLinkageRef] = useState("");
    const [linkageLabel, setLinkageLabel] = useState("");

    const openLinkageModal = (item: FullBoqItem) => {
        setLinkageModal(item.id);
        const current = item.linkage || { type: 'direct_execution', refId: '', label: '' };
        setLinkageType(current.type as any);
        setLinkageRef(current.refId || "");
        setLinkageLabel(current.label || "");
    };

    const saveLinkage = () => {
        if (!linkageModal) return;
        const updates: Partial<BoqItem> = {
            linkage: {
                type: linkageType,
                refId: linkageRef,
                label: linkageLabel
            }
        };
        onUpdate(linkageModal, updates);
        setLinkageModal(null);
    };

    const handleStatusSelect = (itemId: string, newStatus: string) => {
        const needsCo = boqFrozen || ['deleted', 'substituted', 'approved_variation'].includes(newStatus);

        if (needsCo) {
            setCoModal({ itemId, newStatus });
        } else {
            onUpdate(itemId, 'boqStatus', newStatus);
        }
    };

    const confirmStatusChange = () => {
        if (!coModal) return;
        if (!coRef.trim()) return alert('Change Order Reference is required.');
        if (!coReason.trim()) return alert('Reason is required.');

        const item = items.find(i => i.id === coModal.itemId);
        if (!item) return;

        const currentHistory = Array.isArray(item.statusHistory) ? item.statusHistory : [];
        const newHistoryEntry: any = {
            changedAt: new Date().toISOString(),
            from: item.boqStatus || 'included_ffds_scope',
            to: coModal.newStatus,
            changedBy: isOwner ? 'Owner' : 'Designer',
            changeOrderRef: coRef,
            reason: coReason
        };

        const updates: Partial<BoqItem> = {
            boqStatus: coModal.newStatus as any,
            statusHistory: [...currentHistory, newHistoryEntry]
        };

        onUpdate(coModal.itemId, updates);
        setCoModal(null);
        setCoRef("");
        setCoReason("");
    };

    const confirmBulkStatusChange = () => {
        if (!bulkCoModal || !onBulkUpdate) return;

        const needsCo = boqFrozen || ['deleted', 'substituted', 'approved_variation'].includes(bulkCoModal.newStatus);

        if (needsCo) {
            if (!coRef.trim()) return alert('Change Order Reference is required.');
            if (!coReason.trim()) return alert('Reason is required.');
        }

        const updates: {itemId: string, updates: Partial<BoqItem>}[] = [];
        const prevStates: Partial<BoqItem>[] = [];

        bulkCoModal.itemIds.forEach(id => {
            const item = items.find(i => i.id === id);
            if (!item) return;

            const currentHistory = Array.isArray(item.statusHistory) ? item.statusHistory : [];
            let newHistoryEntry: any = null;

            if (needsCo) {
                newHistoryEntry = {
                    changedAt: new Date().toISOString(),
                    from: item.boqStatus || 'included_ffds_scope',
                    to: bulkCoModal.newStatus,
                    changedBy: isOwner ? 'Owner' : 'Designer',
                    changeOrderRef: coRef,
                    reason: coReason
                };
            }

            prevStates.push({ boqStatus: item.boqStatus, statusHistory: item.statusHistory });

            updates.push({
                itemId: id,
                updates: {
                    boqStatus: bulkCoModal.newStatus as any,
                    ...(newHistoryEntry ? { statusHistory: [...currentHistory, newHistoryEntry] } : {})
                }
            });
        });

        setUndoStack(prev => [...prev, { itemIds: bulkCoModal.itemIds, prevStates }]);
        onBulkUpdate(updates);

        setBulkCoModal(null);
        setCoRef("");
        setCoReason("");
        setSelectedIds(new Set()); // Clear selection after successful bulk action
    };

    // Filter items based on search query
    /*
      What each flag means, defined once so a chip's count and the filter it
      applies can never drift apart.
    */
    const FLAG_TESTS: Record<string, { label: string; test: (i: FullBoqItem) => boolean }> = {
        lowMargin:  { label: 'Under 15% margin', test: i => (i.margin ?? 0) < 15 && i.boqStatus !== 'deleted' && i.boqStatus !== 'excluded' },
        zeroQty:    { label: 'Zero quantity',    test: i => !(i.qty > 0) },
        outOfScope: { label: 'Out of firm scope',test: i => i.boqStatus === 'deleted' || i.boqStatus === 'excluded' || i.boqStatus === 'client_procured' },
        unlinked:   { label: 'No drawing link',  test: i => !(i as any).linkageRef && !(i as any).drawingRef },
    };

    const flagCounts = React.useMemo(() => {
        const c: Record<string, number> = {};
        Object.keys(FLAG_TESTS).forEach(k => { c[k] = items.filter(FLAG_TESTS[k].test).length; });
        return c;
    }, [items]);

    const filteredItems = items.filter(item => {
        // Flags stack: a line has to satisfy every flag that is switched on.
        for (const f of Array.from(flags) as string[]) {
            if (!FLAG_TESTS[f]?.test(item)) return false;
        }
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (item.name?.toLowerCase().includes(q)) ||
               (item.description?.toLowerCase().includes(q)) ||
               (item.cat?.toLowerCase().includes(q)) ||
               (item.roomId?.toLowerCase().includes(q));
    });

    /** Ordering applied inside a room, leaving the rooms themselves alone. */
    const sortRows = (rows: FullBoqItem[]): FullBoqItem[] => {
        if (!sort) return rows;
        const val = (i: FullBoqItem): string | number => {
            switch (sort.key) {
                case 'name':   return (i.name || '').toLowerCase();
                case 'qty':    return i.qty || 0;
                case 'cost':   return ((i.baseRate !== undefined ? i.baseRate : i.materials) || 0) + (i.labor || 0);
                case 'margin': return i.margin || 0;
                case 'rate':   return calculateSellPrice(i.materials, i.labor, i.margin);
                default:       return calculateSellPrice(i.materials, i.labor, i.margin) * (i.qty || 0);
            }
        };
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...rows].sort((a, z) => {
            const av = val(a), zv = val(z);
            if (typeof av === 'string' || typeof zv === 'string') return String(av).localeCompare(String(zv)) * dir;
            return ((av as number) - (zv as number)) * dir;
        });
    };

    // Group items by room
    const grouped: { [key: string]: FullBoqItem[] } = {};
    const unassigned: FullBoqItem[] = [];
    const validRoomNames = new Set(rooms.map(r => r.name));

    filteredItems.forEach(item => {
        const roomName = item.roomId;
        if (roomName && validRoomNames.has(roomName)) {
            if (!grouped[roomName]) grouped[roomName] = [];
            grouped[roomName].push(item);
        } else {
            unassigned.push(item);
        }
    });

    // Determine room order (based on project context order)
    const roomOrder = rooms.map(r => r.name);

    const handleUndo = () => {
        if (undoStack.length === 0 || !onBulkUpdate) return;
        const lastAction = undoStack[undoStack.length - 1];

        const updates = lastAction.itemIds.map((id, index) => ({
            itemId: id,
            updates: lastAction.prevStates[index]
        }));

        onBulkUpdate(updates);
        setUndoStack(prev => prev.slice(0, prev.length - 1));
    };

    useEffect(() => {
        const handleGridKeyDown = (e: KeyboardEvent) => {
            // Ignore if focus is in an input field and it's not our keyboard layer input
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                toggleSelectAll();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            } else if (e.key === '?') {
                // Show shortcuts maybe
            }
        };
        window.addEventListener('keydown', handleGridKeyDown);
        return () => window.removeEventListener('keydown', handleGridKeyDown);
    }, [filteredItems, selectedIds, undoStack, onBulkUpdate]);

    const handleCalcChange = (item: FullBoqItem, field: 'l' | 'w' | 'm', val: number) => {
        const l = field === 'l' ? val : item.calcLength || 0;
        const w = field === 'w' ? val : item.calcWidth || 0;
        const m = field === 'm' ? val : item.calcMultiplier || 1;

        // Auto-calculate Qty if any dimension is entered. If only one is entered, treat the other as 1 (linear measurement)
        let newQty = item.qty;
        if (l > 0 || w > 0) {
            const lEff = l > 0 ? l : 1;
            const wEff = w > 0 ? w : 1;
            const mEff = m > 0 ? m : 1;
            newQty = parseFloat((lEff * wEff * mEff).toFixed(2));
        }

        const updates: Partial<BoqItem> = {
            calcLength: l,
            calcWidth: w,
            calcMultiplier: m,
        };

        if (l > 0 || w > 0) {
            updates.qty = newQty;
        }

        onUpdate(item.id, updates);
    };

    const getStatusUI = (item: FullBoqItem) => {
        const status = item.boqStatus || 'included_ffds_scope';

        let colorClass = "";
        let displayLabel = "Included";

        switch (status) {
            case 'included_ffds_scope':
                colorClass = "bg-[#dcfce7] text-[#15803d]";
                displayLabel = "Included";
                break;
            case 'approved_variation':
                colorClass = "border border-[#15803d] text-[#15803d] bg-white";
                displayLabel = "Approved Variation";
                break;
            case 'as_actuals':
                colorClass = "bg-[#fef9c3] text-[#854d0e]";
                displayLabel = "As Actuals EST";
                break;
            case 'provisional_sum':
                colorClass = "bg-[#fef9c3] text-[#854d0e]";
                displayLabel = "Prov. Sum EST";
                break;
            case 'pending_finalisation':
                colorClass = "bg-[#fef9c3] text-[#854d0e]";
                displayLabel = "Pending Finalisation EST •";
                break;
            case 'client_procured':
                colorClass = "bg-[#f1f5f9] text-[#64748b]";
                displayLabel = "Client Procured";
                break;
            case 'excluded':
                colorClass = "bg-[#f1f5f9] text-[#64748b]";
                displayLabel = "Excluded (Firm)";
                break;
            case 'on_hold':
                colorClass = "bg-[#f1f5f9] text-[#64748b]";
                displayLabel = "On Hold";
                break;
            case 'deleted':
                colorClass = "bg-rose-50 text-rose-700";
                displayLabel = "Deleted";
                break;
            case 'substituted':
                colorClass = "bg-rose-50 text-rose-700";
                displayLabel = "Substituted";
                break;
        }

        return (
            <div
                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold whitespace-nowrap cursor-pointer flex items-center justify-between transition-colors hover:shadow-sm ${colorClass}`}
                title={boqFrozen ? "BOQ is frozen — changes require a Change Order" : "Click to change status"}
                onClick={() => setStatusModalId(item.id)}
            >
                <span>{displayLabel}</span>
                <ChevronDownIcon className="w-3 h-3 ml-1 opacity-50" />
            </div>
        );
    };

    const getLinkageUI = (item: FullBoqItem) => {
        const linkage = item.linkage;
        if (!linkage || linkage.type === 'direct_execution') {
            return (
                <div
                    title="No formal link (direct execution)"
                    className="text-[10px] text-slate-400 border-b border-dashed border-slate-300 w-max cursor-help"
                >
                    Unlinked &mdash; Direct
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-[#334486] uppercase">{linkage.type.replace('_', ' ')}</span>
                <span className="text-[10px] text-slate-500">{linkage.label || linkage.refId}</span>
            </div>
        );
    };

    const toggleSelection = (itemId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredItems.map(i => i.id)));
        }
    };

    const renderRow = (item: FullBoqItem) => {
        const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
        const total = sellPrice * item.qty;

        const isDeletedOrSub = item.boqStatus === 'deleted' || item.boqStatus === 'substituted';
        const opacityClass = isDeletedOrSub ? 'opacity-50' : '';
        const strikeClass = isDeletedOrSub ? 'line-through text-slate-400' : '';
        const isHighlighted = highlightedItemIds?.includes(item.id);
        const isSelected = selectedIds.has(item.id);

        let lensTint = '';
        let rowMargin = item.margin || 0;
        if (lensEnabled && isOwner && !isDeletedOrSub) {
             const mPct = rowMargin;
             if (mPct < 15) lensTint = 'bg-red-50 hover:bg-red-100 shadow-[inset_4px_0_0_#ef4444]';
             else if (mPct < 18) lensTint = 'bg-amber-50 hover:bg-amber-100 shadow-[inset_4px_0_0_#f59e0b]';
        }

        const highlightClass = isSelected ? 'bg-sky-50/70 hover:bg-sky-50 shadow-[inset_4px_0_0_#6366f1]' : isHighlighted ? 'bg-amber-100/50 hover:bg-amber-100/70 shadow-[inset_4px_0_0_#f59e0b]' : lensTint;

        return (
            <React.Fragment key={item.id}>
                <tr id={`item-${item.id}`} tabIndex={0} onClick={(e) => {
                    const tag = (e.target as HTMLElement).tagName;
                    if (tag === 'TD' || tag === 'TR' || tag === 'DIV') {
                        toggleSelection(item.id);
                    }
                }} onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        toggleSelection(item.id);
                    }
                }} className={`group boq-row-in border-b border-slate-100 last:border-0 transition-colors focus:bg-sky-50/30 outline-none ${opacityClass} ${highlightClass || 'bg-white hover:bg-slate-50'}`}>
                    {/* Actions */}
                    {/* Checkbox and chevron side by side, not stacked.

                        Stacked they were ~40px tall and set the floor for every
                        row in the sheet — taller than the content, so folding
                        the spec to one line changed nothing until this did too. */}
                    <td className="p-2 w-14 text-center align-top pt-2.5 print:hidden">
                        <div className="flex items-center justify-center gap-1.5">
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => toggleSelection(item.id)}
                                className="w-3.5 h-3.5 text-[#3D52A0] rounded border-slate-300 focus:ring-[#3D52A0] cursor-pointer"
                            />
                            <button onClick={() => setExpandedRows(prev => ({...prev, [item.id]: !prev[item.id]}))} className="text-slate-400 hover:text-[#3D52A0] transition-colors">
                                <svg className={`w-3.5 h-3.5 transition-transform ${expandedRows[item.id] ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </td>

                    {/* Item Details.
                        The spec is one line in compact and wraps in full-spec
                        mode. It is never dropped — the row still carries it as
                        a title, so hovering reads the whole thing without
                        changing view. */}
                    <td className="p-2 min-w-[200px] align-top" style={wOf('name')}>
                        <div className={`font-bold text-slate-700 text-sm whitespace-normal leading-tight ${strikeClass}`}>{item.name}</div>
                        {item.specs && (
                            <div
                                title={density === 'compact' ? item.specs : undefined}
                                className={`text-[10px] text-slate-400 leading-relaxed mt-0.5 ${
                                    density === 'compact' ? 'truncate max-w-[420px]' : 'whitespace-normal'
                                }`}
                            >{item.specs}</div>
                        )}
                    </td>

                    {/* Status */}
                    <td className="p-2 w-[140px] text-xs align-top pt-2.5" style={wOf('status')}>
                        {getStatusUI(item)}
                        {item.boqStatus === 'substituted' && Array.isArray(item.statusHistory) && (
                            <div className="text-[9px] text-slate-400 mt-1">
                                &rarr; See successors
                            </div>
                        )}
                    </td>

                    {/* Drawing Ref/Linkage */}
                    <td className="p-2 w-[120px] text-xs align-top pt-2.5 hidden lg:table-cell cursor-pointer" onClick={() => openLinkageModal(item)}>
                        {getLinkageUI(item)}
                    </td>

                    {/* Dimensions (L x W x M) */}
                    <td className="p-2 w-[50px] align-top pt-3 hidden print:table-cell text-[10px] text-slate-500 text-center">
                        {(item.calcLength || 1) * (item.calcWidth || 1) * (item.calcMultiplier || 1) > 1 ?
                        `${item.calcLength || 1} x ${item.calcWidth || 1} x ${item.calcMultiplier || 1}` : '-'}
                    </td>
                    {showDims && (<>
                    <td className="p-2 w-[50px] align-top pt-2 print:hidden">
                        <FastInput
                            type="number"
                            value={item.calcLength || ''}
                            onChange={(v) => handleCalcChange(item, 'l', Number(v))}
                            placeholder="L"
                            className="text-center font-medium text-slate-500 bg-slate-50/50 rounded focus:bg-white text-xs"
                        />
                    </td>
                    <td className="p-2 w-[50px] align-top pt-2 print:hidden">
                        <FastInput
                            type="number"
                            value={item.calcWidth || ''}
                            onChange={(v) => handleCalcChange(item, 'w', Number(v))}
                            placeholder="W"
                            className="text-center font-medium text-slate-500 bg-slate-50/50 rounded focus:bg-white text-xs"
                        />
                    </td>
                    <td className="p-2 w-[50px] align-top pt-2 print:hidden">
                        <FastInput
                            type="number"
                            value={item.calcMultiplier || ''}
                            onChange={(v) => handleCalcChange(item, 'm', Number(v))}
                            placeholder="M"
                            className="text-center font-medium text-slate-500 bg-slate-50/50 rounded focus:bg-white text-xs text-[#3D52A0]"
                        />
                    </td>
                    </>)}

                    {/* Qty & Unit */}
                    <td className="p-2 w-[90px] align-top pt-2" style={wOf('qty')}>
                        <div className="flex items-center">
                            <FastInput
                                type="number"
                                value={item.qty}
                                onChange={(v) => onUpdate(item.id, 'qty', v)}
                                className="text-center font-bold text-slate-800 bg-slate-100 rounded w-16"
                            />
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-1">{item.unit}</span>
                        </div>
                    </td>

                    {/* Rate & Margin (Owner Only) */}
                    {isOwner ? (
                        <>
                            <td className="p-2 w-[80px] text-right align-top pt-2 hidden sm:table-cell">
                                <FastInput
                                    type="number"
                                    value={parseFloat((Number(item.baseRate !== undefined ? item.baseRate : item.materials) + Number(item.labor || 0)).toFixed(2))}
                                    onChange={(v) => {
                                        const newCost = Number(v);
                                        const newBaseRate = Math.max(0, newCost - Number(item.labor || 0));
                                        onUpdate(item.id, 'baseRate', parseFloat(newBaseRate.toFixed(2)));
                                    }}
                                    className="text-right font-medium text-slate-600"
                                />
                            </td>
                            <td className="p-2 w-[70px] text-right align-top pt-2 hidden sm:table-cell">
                                <div className="flex items-center justify-end gap-0.5">
                                    <FastInput
                                        type="number"
                                        value={item.margin}
                                        onChange={(v) => onUpdate(item.id, 'marginOverride', v)}
                                        className={`text-right font-bold ${item.margin < 15 ? 'text-red-500' : 'text-emerald-600'}`}
                                    />
                                    <span className="text-xs text-slate-400">%</span>
                                </div>
                            </td>
                            <td className="p-2 w-[100px] text-right font-mono text-xs tabular-nums text-slate-600 align-top pt-3 hidden sm:table-cell">
                                {formatCurrency(sellPrice)}
                            </td>
                        </>
                    ) : (
                        <td colSpan={3} className="p-2 text-center text-[10px] text-slate-300 italic hidden sm:table-cell align-middle">
                            Financials restricted
                        </td>
                    )}

                    {/* Total */}
                    <td className="p-2 w-[120px] text-right font-bold text-slate-800 font-mono tabular-nums align-top pt-3" style={wOf('total')}>
                        <FlashValue value={total} className={strikeClass}>{formatCurrency(total)}</FlashValue>
                        {item.boqStatus === 'deleted' && <div className="text-[9px] text-rose-500 mt-1">₹0 Billed</div>}
                    </td>

                    {/* Bank Link */}
                    <td className="p-2 w-10 text-center align-top pt-3 print:hidden">
                        <button onClick={() => onViewInBank(item.bankId)} className="text-sky-300 hover:text-[#3D52A0] opacity-0 group-hover:opacity-100 transition-opacity" title="Edit Master in Bank">
                            <LinkIcon className="w-3.5 h-3.5" />
                        </button>
                    </td>
                </tr>
                {expandedRows[item.id] && (
                    <tr className="bg-slate-50/50">
                        <td colSpan={COLS} className="p-4 border-b border-slate-100">
                            <div className="pl-12 pr-4">
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Status History</h4>
                                {Array.isArray(item.statusHistory) && item.statusHistory.length > 0 ? (
                                    <ul className="space-y-2">
                                        {item.statusHistory.map((sh, idx) => (
                                            <li key={idx} className="text-xs text-slate-600 flex items-center gap-2">
                                                <span className="text-slate-400 w-[120px]">{new Date(sh.changedAt || (sh as any).date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short'})}</span>
                                                <span className="font-medium text-slate-500">{sh.from}</span>
                                                <span>&rarr;</span>
                                                <span className="font-bold text-slate-700">{sh.to}</span>
                                                <span className="text-slate-400">&middot;</span>
                                                <span>by {sh.changedBy || (sh as any).by}</span>
                                                {(sh.changeOrderRef || (sh as any).coRef) && (
                                                    <>
                                                        <span className="text-slate-400">&middot;</span>
                                                        <span className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded text-[10px]">{sh.changeOrderRef || (sh as any).coRef}</span>
                                                    </>
                                                )}
                                                {sh.reason && (
                                                    <>
                                                        <span className="text-slate-400">&middot;</span>
                                                        <span className="italic">{sh.reason}</span>
                                                    </>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="text-xs text-slate-400 italic">No history available for this item.</div>
                                )}
                            </div>
                        </td>
                    </tr>
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm bg-white pb-24 relative">
            {lensEnabled && isOwner && marginAnalytics && (
                <div className="sticky top-0 left-0 right-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-slate-100 z-50 p-3 flex flex-wrap items-center justify-between shadow-md">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">◐</span>
                            <div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Blended Margin</div>
                                <div className={`text-lg font-bold font-mono ${marginAnalytics.blendedMarginPct < 15 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {marginAnalytics.blendedMarginPct?.toFixed(1) || 0}%
                                </div>
                            </div>
                        </div>
                        <div className="hidden sm:block">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Estimate Risk</div>
                            <div className="text-sm font-bold font-mono text-amber-400">
                                {formatCurrency((marginAnalytics.estimateRisk?.asActualsValue || 0) + (marginAnalytics.estimateRisk?.provisionalValue || 0))}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Floor Violations</div>
                            <div className="text-sm font-bold">
                                {marginAnalytics.floorViolations?.length === 0 ? (
                                    <span className="text-emerald-400">0 Items</span>
                                ) : (
                                    <button className="text-red-400 underline decoration-red-400/30 hover:decoration-red-400">
                                        {marginAnalytics.floorViolations?.length} Items
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Sparkline minimal rendering */}
                    {marginAnalytics.versionTrend && marginAnalytics.versionTrend.length > 0 && (
                        <div className="hidden md:flex flex-col items-end group relative cursor-help">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Erosion Trend</div>
                            <div className="flex items-end gap-[2px] h-6 bg-sky-900 p-1 rounded">
                                {marginAnalytics.versionTrend.slice(-10).map((t: any, i: number) => {
                                    const h = Math.max(10, Math.min(100, (t.blendedMarginPct / 30) * 100)); // normalize relative to 30%
                                    const color = t.blendedMarginPct < 15 ? 'bg-red-500' : t.blendedMarginPct < 18 ? 'bg-amber-500' : 'bg-emerald-500';
                                    return <div key={i} className={`w-3 rounded-t-sm ${color}`} style={{ height: `${h}%` }}></div>
                                })}
                            </div>
                            <div className="absolute top-full right-0 mt-2 w-64 bg-sky-900 text-slate-200 text-xs p-2 rounded shadow-xl hidden group-hover:block z-50">
                                {marginAnalytics.versionTrend.map((t: any) => (
                                    <div key={t.versionNumber} className="flex justify-between border-b border-slate-700 last:border-0 py-1">
                                        <span>v{t.versionNumber}</span>
                                        <span className="font-mono">{t.blendedMarginPct.toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {/* View controls. Deliberately three, and each one earns its place. */}
            <div className="flex items-center gap-2.5 px-3 py-2 border-b border-slate-200 bg-white/70 backdrop-blur-sm flex-wrap print:hidden">
                <span className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-400">View</span>
                <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
                    {(['compact', 'comfortable'] as const).map(d => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDensity(d)}
                            aria-pressed={density === d}
                            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                density === d ? 'bg-[#3D52A0] text-white' : 'text-slate-500 hover:bg-sky-50'
                            }`}
                        >{d === 'compact' ? 'Compact' : 'Full spec'}</button>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={() => setDimsOverride(showDims ? false : true)}
                    aria-pressed={showDims}
                    title={projectUsesDims
                        ? 'This project has dimensions on some lines'
                        : 'No line in this project uses L × W × M'}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-colors ${
                        showDims
                            ? 'bg-[#3D52A0] text-white border-[#3D52A0]'
                            : 'text-slate-500 border-slate-200 bg-white hover:bg-sky-50'
                    }`}
                >L × W × M</button>

                <span className="text-[10.5px] text-slate-400">
                    {filteredItems.length} of {items.length} lines
                    {!projectUsesDims && !showDims && ' · dimension columns hidden, nothing uses them'}
                </span>

                <span className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden="true" />

                {/* A flag with nothing behind it stays visible and says zero —
                    "no line is under margin" is information worth reading. */}
                {Object.keys(FLAG_TESTS).map(key => {
                    const on = flags.has(key);
                    const n = flagCounts[key] || 0;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => toggleFlag(key)}
                            aria-pressed={on}
                            disabled={n === 0 && !on}
                            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
                                on
                                    ? 'bg-[#3D52A0] text-white border-[#3D52A0] shadow-sm'
                                    : n === 0
                                        ? 'text-slate-300 border-slate-100 bg-white cursor-default'
                                        : 'text-slate-500 border-slate-200 bg-white hover:bg-sky-50 hover:border-[#3D52A0]/30'
                            }`}
                        >
                            {FLAG_TESTS[key].label}
                            <span className={`font-mono tabular-nums px-1 rounded ${
                                on ? 'bg-white/20' : n === 0 ? 'bg-slate-50' : 'bg-slate-100'
                            }`}>{n}</span>
                        </button>
                    );
                })}

                {(flags.size > 0 || sort) && (
                    <button
                        type="button"
                        onClick={() => { setFlags(new Set()); setSort(null); }}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700 transition-colors"
                    >Clear</button>
                )}
            </div>

            <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 shadow-[0_1px_0_rgba(203,213,225,1)]">
                    <tr>
                        <th className="p-3 text-center w-14 print:hidden relative">
                             <input
                                 type="checkbox"
                                 checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                                 ref={input => { if (input) input.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredItems.length; }}
                                 onChange={toggleSelectAll}
                                 className="w-3.5 h-3.5 text-[#3D52A0] rounded border-slate-300 focus:ring-[#3D52A0] cursor-pointer absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                             />
                        </th>
                        <HeadCell label="Item Description" sortKey="name" {...headProps('name')} />
                        <HeadCell label="Status" className="w-[140px]" {...headProps('status')} />
                        <HeadCell label="Drawing Ref" className="w-[120px] hidden lg:table-cell" {...headProps('drawing')} />

                        <th className="p-3 w-[50px] text-center text-sky-400 hidden print:table-cell">Area</th>
                        {showDims && (<>
                        <th className="p-3 w-[50px] text-center text-sky-400 print:hidden">L</th>
                        <th className="p-3 w-[50px] text-center text-sky-400 print:hidden">W</th>
                        <th className="p-3 w-[50px] text-center text-sky-400 print:hidden">M</th>
                        </>)}

                        <HeadCell label="Qty" sortKey="qty" align="center" className="w-[90px]" {...headProps('qty')} />

                        {isOwner ? (
                            <>
                                <HeadCell label="Cost" sortKey="cost" align="right" className="w-[80px] hidden sm:table-cell" {...headProps('cost')} />
                                <HeadCell label="Margin" sortKey="margin" align="right" className="w-[70px] hidden sm:table-cell" {...headProps('margin')} />
                                <HeadCell label="Rate" sortKey="rate" align="right" className="w-[100px] hidden sm:table-cell" {...headProps('rate')} />
                            </>
                        ) : (
                            <th colSpan={3} className="p-3 text-center text-slate-400 hidden sm:table-cell">Financials</th>
                        )}
                        <HeadCell label="Total" sortKey="total" align="right" className="w-[120px]" {...headProps('total')} />
                        <th className="p-3 w-10 print:hidden"></th>
                    </tr>
                </thead>
                <tbody className="bg-white" key={`${sort?.key || 'none'}-${sort?.dir || ''}-${Array.from(flags).sort().join(',')}`}>
                    {roomOrder.map(roomName => {
                        const roomItems = grouped[roomName] || [];
                        const roomTotal = roomItems.reduce((sum, i) => sum + (calculateSellPrice(i.materials, i.labor, i.margin) * i.qty), 0);

                        return (
                            <React.Fragment key={roomName}>
                                <tr className="bg-slate-100 border-y border-slate-200">
                                    <td colSpan={COLS} className="px-4 py-2">
                                        <div className="flex justify-between items-center pr-2">
                                            <span className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-2">
                                                🏠 {roomName}
                                                <span className="bg-white px-2 py-0.5 rounded text-[9px] text-slate-400 border border-slate-200 font-medium">{roomItems.length} items</span>
                                                {lensEnabled && isOwner && marginAnalytics?.byRoom && (() => {
                                                    const rData = marginAnalytics.byRoom.find((r: any) => r.roomId === roomName);
                                                    if (!rData) return null;
                                                    return (
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${rData.marginPct < 15 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                                                            {rData.marginPct.toFixed(1)}% M
                                                        </span>
                                                    );
                                                })()}
                                            </span>
                                            <div className="flex items-center gap-4">
                                                <button
                                                    onClick={() => onAddItem(roomName)}
                                                    className="flex items-center gap-1 text-[10px] font-bold text-[#3D52A0] bg-white border border-sky-100 px-3 py-1.5 rounded hover:bg-sky-50 transition-colors shadow-sm whitespace-nowrap print:hidden"
                                                >
                                                    <PlusIcon className="w-3 h-3" /> Add Item
                                                </button>
                                                {isOwner && (
                                                    <span className="font-mono text-xs font-bold text-slate-600 whitespace-nowrap">
                                                        Room Total: {formatCurrency(roomTotal)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                {roomItems.length > 0 ? sortRows(roomItems).map(renderRow) : (
                                    <tr>
                                        <td colSpan={COLS} className="p-4 text-center text-slate-400 text-xs italic border-b border-slate-100">
                                            No items in {roomName} yet.
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}

                    {unassigned.length > 0 && (
                        <>
                            <tr className="bg-slate-100 border-y border-slate-200">
                                <td colSpan={COLS} className="px-4 py-2">
                                    <div className="flex justify-between items-center pr-2">
                                        <span className="font-bold text-slate-600 text-xs uppercase tracking-wide">📦 Unassigned Items</span>
                                        <button
                                            onClick={() => onAddItem("Unassigned")}
                                            className="flex items-center gap-1 text-[10px] font-bold text-[#3D52A0] bg-white border border-sky-100 px-3 py-1.5 rounded hover:bg-sky-50 transition-colors shadow-sm whitespace-nowrap print:hidden"
                                        >
                                            <PlusIcon className="w-3 h-3" /> Add Item
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            {sortRows(unassigned).map(renderRow)}
                        </>
                    )}

                    {items.length === 0 && (
                        <tr>
                            <td colSpan={COLS} className="p-12 text-center text-slate-400 italic">
                                No items in this BOQ yet. Click "+ Add Item" in any room header to start.
                            </td>
                        </tr>
                    )}
                </tbody>

                {/* Sticky, because the figure it carries is the reason for the
                    edit you are making at the top of a long sheet. */}
                {items.length > 0 && (
                    <tfoot className="sticky bottom-0 z-20">
                        <tr className="bg-slate-50/95 backdrop-blur-sm border-t-2 border-slate-300">
                            <td colSpan={COLS - 1} className="px-4 py-2.5">
                                <div className="flex items-center gap-4 flex-wrap text-[11px]">
                                    <span className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-400">
                                        Firm scope
                                    </span>
                                    <span className="text-slate-500">
                                        {sheetTotals.live} {sheetTotals.live === 1 ? 'line' : 'lines'}
                                    </span>
                                    {isOwner && (
                                        <span className="text-slate-500 font-mono tabular-nums">
                                            cost {formatCurrency(sheetTotals.cost)}
                                        </span>
                                    )}
                                    {isOwner && (
                                        <span className={`font-mono tabular-nums font-bold ${
                                            sheetTotals.margin < 15 ? 'text-rose-600' : 'text-emerald-600'
                                        }`}>
                                            {sheetTotals.margin.toFixed(1)}% blended
                                        </span>
                                    )}
                                    {sheetTotals.excluded > 0 && (
                                        <span className="text-slate-400 font-mono tabular-nums" title="Deleted, excluded or client-procured lines — not billed">
                                            {formatCurrency(sheetTotals.excluded)} out of scope
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900 text-[15px] whitespace-nowrap">
                                <FlashValue value={sheetTotals.firm}>{formatCurrency(sheetTotals.firm)}</FlashValue>
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>

            {/* Selection Bulk Action Bar */}
            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 border border-slate-700 shadow-2xl rounded-2xl p-2.5 flex items-center gap-4 z-50 text-slate-200 w-[95%] max-w-5xl"
                    >
                        <div className="flex-1 flex items-center gap-4 pl-2">
                             <div className="flex flex-col">
                                 <span className="font-bold text-white text-sm">
                                     {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
                                 </span>
                                 <span className="text-[10px] text-slate-400 font-mono">
                                     {formatCurrency(
                                         (Array.from(selectedIds) as string[]).reduce((sum: number, id: string) => {
                                             const it = items.find(i => i.id === id);
                                             if (!it) return sum;
                                             return sum + (calculateSellPrice(it.materials, it.labor, it.margin) * (it.qty || 0));
                                         }, 0) as number
                                     )}
                                 </span>
                             </div>

                             <div className="h-6 w-px bg-slate-700 mx-2"></div>

                             <div className="flex flex-wrap gap-2">
                                 <button onClick={() => setBulkCoModal({ itemIds: Array.from(selectedIds), newStatus: 'included_ffds_scope' })} className="px-3 py-1.5 bg-sky-900 hover:bg-[#3D52A0] hover:text-white rounded-lg text-xs font-bold text-slate-300 transition-colors">Set Status</button>
                                 <button onClick={() => {/* TODO */}} className="px-3 py-1.5 bg-sky-900 hover:bg-[#3D52A0] hover:text-white rounded-lg text-xs font-bold text-slate-300 transition-colors">Move Room</button>
                                 <button onClick={() => setLinkageModal('bulk')} className="px-3 py-1.5 bg-sky-900 hover:bg-[#3D52A0] hover:text-white rounded-lg text-xs font-bold text-slate-300 transition-colors">Set Linkage</button>
                                 {isOwner && (
                                     <>
                                        <button onClick={() => {/* TODO */}} className="px-3 py-1.5 bg-sky-900 hover:bg-[#3D52A0] hover:text-white rounded-lg text-xs font-bold text-slate-300 transition-colors">Adjust Margin</button>
                                        <button onClick={() => {/* TODO */}} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${boqFrozen ? 'bg-sky-900 text-slate-500 cursor-not-allowed' : 'bg-sky-900 text-slate-300 hover:bg-[#3D52A0] hover:text-white'}`} disabled={boqFrozen} title={boqFrozen ? "Blocked: BOQ is frozen" : ""}>Refresh Rates</button>
                                     </>
                                 )}
                             </div>
                        </div>
                        {undoStack.length > 0 && (
                            <button onClick={handleUndo} className="px-3 py-2 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors bg-amber-400/10 hover:bg-amber-400/20 rounded-xl mr-2 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                Undo
                            </button>
                        )}
                        <button onClick={() => setSelectedIds(new Set())} className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors bg-sky-900 hover:bg-sky-800 rounded-xl">
                            Clear
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bulk Status / Change Order Requirement Modal */}
            <AnimatePresence>
                {bulkCoModal && (
                    <div className="fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm shadow-2xl flex items-center justify-center p-4 z-[100]">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-xl shadow-2xl w-full max-w-[400px] overflow-hidden"
                        >
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-bold text-slate-800">Bulk Apply Status</h3>
                                <button onClick={() => setBulkCoModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-slate-600 mb-6 font-medium">
                                    Change status for {bulkCoModal.itemIds.length} selected items.
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Select Status</label>
                                        <select
                                            value={bulkCoModal.newStatus}
                                            onChange={e => setBulkCoModal({...bulkCoModal, newStatus: e.target.value})}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                                        >
                                            {STATUS_OPTIONS.filter(o =>
                                                isOwner ||
                                                ['included_ffds_scope', 'pending_finalisation', 'on_hold'].includes(o.value)
                                            ).map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {(boqFrozen || ['deleted', 'substituted', 'approved_variation'].includes(bulkCoModal.newStatus)) && (
                                        <>
                                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-xs text-rose-700 font-medium my-4">
                                                {boqFrozen ? "Wait, BOQ is frozen. A formal Change Order is required for any status modification." : "A formal Change Order is required for this status transition."}
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Change Order Ref</label>
                                                <FastInput value={coRef} onChange={v => setCoRef(String(v))} placeholder="e.g. CO-005" className="w-full border p-2 rounded-lg bg-slate-50" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reason / Notes</label>
                                                <FastInput value={coReason} onChange={v => setCoReason(String(v))} placeholder="Why is this change happening?" className="w-full border p-2 rounded-lg bg-slate-50" />
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="mt-6 flex justify-end gap-3">
                                    <button onClick={() => setBulkCoModal(null)} className="px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-100 text-sm font-bold transition-colors">Cancel</button>
                                    <button onClick={confirmBulkStatusChange} className="px-4 py-2 rounded-lg text-white bg-[#3D52A0] hover:bg-[#334486] text-sm font-bold transition-colors shadow-md">Apply Bulk Change</button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Change Order Requirement Modal (Single) */}
            <AnimatePresence>
                {coModal && (
                    <div className="fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/20 backdrop-blur-sm shadow-2xl flex items-center justify-center p-4 z-[100]">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-xl shadow-2xl w-full max-w-[400px] overflow-hidden"
                        >
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-bold text-slate-800">Change Order Required</h3>
                                <button onClick={() => setCoModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-slate-600 mb-6 font-medium">
                                    {boqFrozen
                                        ? "The BOQ is frozen. ALL status changes require a formal Change Order reference to ensure client signoffs are preserved."
                                        : "This status change alters the financial baseline or scope commitments."}
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">CO Reference</label>
                                        <input
                                            type="text"
                                            value={coRef}
                                            onChange={e => setCoRef(e.target.value)}
                                            placeholder="e.g. CO-001"
                                            className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-slate-50 focus:bg-white focus:outline-sky-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Reason / Note</label>
                                        <textarea
                                            value={coReason}
                                            onChange={e => setCoReason(e.target.value)}
                                            placeholder="Client requested alternative finish..."
                                            className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-slate-50 focus:bg-white focus:outline-sky-500 outline-none resize-none h-20"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                                <button onClick={() => setCoModal(null)} className="px-4 py-2 font-bold text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
                                <button onClick={confirmStatusChange} className="px-4 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white font-bold rounded shadow text-sm">Record Status Change</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Linkage Picker Modal */}
            <AnimatePresence>
                {linkageModal && (
                    <div className="fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/20 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-xl shadow-2xl w-full max-w-[500px] overflow-hidden"
                        >
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-bold text-slate-800">Edit Traceability Linkage</h3>
                                <button onClick={() => setLinkageModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                            </div>

                            <div className="p-4 bg-slate-100 flex gap-2 border-b border-slate-200">
                                {['drawing', 'selection_sheet', 'change_order', 'direct_execution'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setLinkageType(type as any)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${linkageType === type ? 'bg-[#3D52A0] text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        {type.replace('_', ' ').toUpperCase()}
                                    </button>
                                ))}
                            </div>

                            <div className="p-6">
                                {linkageType === 'direct_execution' ? (
                                    <div className="text-sm text-slate-500 italic text-center py-4">
                                        No formal document lineage. Direct execution mode.
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Document Reference ID</label>
                                            <input
                                                type="text"
                                                value={linkageRef}
                                                onChange={e => setLinkageRef(e.target.value)}
                                                placeholder={linkageType === 'drawing' ? 'e.g. DWG-ELEC-04' : linkageType === 'change_order' ? 'e.g. CO-002' : 'e.g. SS-LIVING-01'}
                                                className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-slate-50 focus:bg-white focus:outline-sky-500 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Friendly Label / Description</label>
                                            <input
                                                type="text"
                                                value={linkageLabel}
                                                onChange={e => setLinkageLabel(e.target.value)}
                                                placeholder="e.g. Living Room Ceiling Plan"
                                                className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-slate-50 focus:bg-white focus:outline-sky-500 outline-none"
                                            />
                                        </div>
                                        {linkageType === 'drawing' && (
                                            <div className="bg-sky-50 border border-sky-100 rounded p-3 text-xs text-[#334486] mt-2">
                                                <strong>Tip:</strong> If the drawing is later revised, this linkage helps identify out-of-date items.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                                <button onClick={() => setLinkageModal(null)} className="px-4 py-2 font-bold text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
                                <button onClick={saveLinkage} className="px-4 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white font-bold rounded shadow text-sm">Save Linkage</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Status Modal */}
            <AnimatePresence>
                {statusModalId && (
                    <div className="fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/20 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-xl shadow-2xl w-full max-w-[600px] max-h-[80vh] flex flex-col overflow-hidden border border-slate-200"
                        >
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center z-10">
                                <div>
                                    <h3 className="font-black text-slate-800">Update Item Status</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Select a new status for this lineup item</p>
                                </div>
                                <button onClick={() => setStatusModalId(null)} className="p-2 bg-slate-200/50 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors font-bold text-lg leading-none">
                                    ✕
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto bg-slate-50/50 flex-1">
                                <div className="grid grid-cols-2 gap-3">
                                    {STATUS_OPTIONS.filter(o =>
                                        isOwner ||
                                        ['included_ffds_scope', 'pending_finalisation', 'on_hold'].includes(o.value)
                                    ).map(opt => {
                                        let colorClass = "";
                                        let icon = null;
                                        switch (opt.value) {
                                            case 'included_ffds_scope':
                                                colorClass = "bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100/50 text-emerald-800";
                                                break;
                                            case 'approved_variation':
                                                colorClass = "bg-white border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50 text-emerald-700 shadow-sm";
                                                break;
                                            case 'as_actuals':
                                            case 'provisional_sum':
                                            case 'pending_finalisation':
                                                colorClass = "bg-amber-50 border-amber-200 hover:border-amber-400 hover:bg-amber-100/50 text-amber-800";
                                                break;
                                            case 'deleted':
                                            case 'substituted':
                                                colorClass = "bg-rose-50 border-rose-200 hover:border-rose-400 hover:bg-rose-100/50 text-rose-800";
                                                break;
                                            case 'excluded':
                                            case 'client_procured':
                                                colorClass = "bg-slate-100 border-slate-300 hover:border-slate-500 hover:bg-slate-200 text-slate-700";
                                                break;
                                            default:
                                                colorClass = "bg-slate-50 border-slate-200 hover:border-slate-400 hover:bg-slate-100/50 text-slate-700";
                                        }

                                        return (
                                            <button
                                                key={opt.value}
                                                onClick={() => {
                                                    handleStatusSelect(statusModalId, opt.value);
                                                    setStatusModalId(null);
                                                }}
                                                className={`text-left p-4 rounded-xl border-2 transition-all flex flex-col gap-1 group ${colorClass}`}
                                            >
                                                <span className="font-bold text-sm tracking-tight">{opt.label}</span>
                                                <span className="text-[10px] font-medium opacity-80 uppercase tracking-widest">{opt.value.replace(/_/g, ' ')}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudioExcelGrid;

