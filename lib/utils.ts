
import { FullBoqItem, ProjectTask } from '../types';

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const formatCurrency = (n: number) => {
  return "₹ " + (Number(n) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

export function formatINR(value: any) {
  if (value === null || value === undefined || isNaN(value)) return '₹0';
  const rounded = Math.round(Number(value));
  const absValue = Math.abs(rounded);
  const formatted = absValue.toLocaleString('en-IN');
  return rounded < 0 ? `-₹${formatted}` : `₹${formatted}`;
}

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const formatClientValue = (val: number): string => {
    if (!val || val === 0) return '₹0';
    // Round to nearest 5000 to avoid "calculator precision" look
    const rounded = Math.round(val / 5000) * 5000;
    
    if (rounded >= 100000) {
        return `₹ ${(rounded / 100000).toFixed(2)}L`;
    }
    return `₹ ${rounded.toLocaleString('en-IN')}`;
};

/**
 * Short but exact — lakh/crore for readability, no ₹5,000 rounding.
 * Use this for anything the studio reads about itself. `formatClientValue`
 * deliberately blurs figures for client-facing documents, which makes it wrong
 * for internal analysis: it turns ₹31,967 into "₹30,000".
 */
export const formatCompactINR = (val: number): string => {
    if (!val || !isFinite(val)) return '₹0';
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};

// Markup-on-Cost Formula (Standard Markup)
// Selling Price = Cost * (1 + Margin / 100)
export const calculateSellPrice = (materials: number, labor: number, margin: number): number => {
  const cost = (Number(materials) || 0) + (Number(labor) || 0);
  const marginPercent = (Number(margin) || 0);
  return cost * (1 + marginPercent / 100);
};

/**
 * MARKUP vs MARGIN -- they are not the same number and this app needs both.
 *
 *   markup = profit / COST     28% markup on 100 cost -> sells for 128
 *   margin = profit / SELL     that same job has a 21.9% margin
 *
 * `calculateSellPrice` above prices on MARKUP, so the `margin` field on a BOQ
 * line is really a markup percentage -- that is the pricing model and it stays.
 *
 * What went wrong is that this function returned markup while being named
 * `calculateGrossMargin`, and its callers printed it as "Gross Margin" and
 * benchmarked it against margin-style targets. A job priced at 28% markup
 * displayed "28% gross margin" while the Reports tab, correctly computing
 * profit / revenue, called the same job 21.9%.
 *
 * So: `calculateMarkupPct` is the inverse of `calculateSellPrice` and is the
 * right function when you are talking about what was ADDED to cost.
 * `calculateGrossMargin` now returns a true margin and is the right function
 * whenever the number sits next to revenue.
 */
/**
 * The exact inverse of `calculateSellPrice`: recover cost from a known selling
 * rate. Use this wherever only `selectedRate` survives and the cost has to be
 * backed out — writing `sell * (1 - margin/100)` there silently applies the
 * margin model to a markup-priced number and understates the cost.
 */
export const calculateCostFromSell = (sell: number, margin: number): number => {
  const marginPercent = (Number(margin) || 0);
  return (Number(sell) || 0) / (1 + marginPercent / 100);
};

export const calculateMarkupPct = (sell: number, cost: number): number => {
  if (cost === 0) return 0;
  return ((sell - cost) / cost) * 100;
};

export const calculateGrossMargin = (sell: number, cost: number): number => {
  if (sell === 0) return 0;
  return ((sell - cost) / sell) * 100;
};

/** 28 markup -> 21.9 margin. Used to restate markup-era benchmarks. */
export const markupToMargin = (markupPct: number): number =>
  (markupPct / (100 + markupPct)) * 100;

// Keep a session-local counter to ensure uniqueness even in rapid succession
let idCounter = 0;
export const id = (): string => {
  idCounter += 1;
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}-${idCounter}`;
};


export const escapeHtml = (s: string): string => {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

export const timeAgo = (date: number): string => {
    const seconds = Math.floor((new Date().getTime() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "m ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "just now";
};

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

// --- SMART GRANULAR SCHEDULER ---

// Helper to map item to task key for dependency linking
const mapItemToTaskKey = (item: FullBoqItem): string | null => {
    const name = item.name.toLowerCase();
    const cat = item.cat.toLowerCase();
    
    // Civil
    if (name.includes('demolition')) return 'demo';
    if (cat.includes('civil')) {
        if (name.includes('tile') || name.includes('flooring') || name.includes('marble') || name.includes('granite')) return 'flooring';
        return 'masonry';
    }
    
    // Plumbing
    if (cat.includes('plumbing')) {
        if (name.includes('sanitary') || name.includes('cp') || name.includes('fittings')) return 'plumb-lines'; 
        return 'plumb-lines';
    }

    // Electrical
    if (cat.includes('electrical')) {
        if (name.includes('switch') || name.includes('light') || name.includes('fan') || name.includes('plate')) return 'elec-final';
        if (name.includes('conduit') || name.includes('pipe')) return 'elec-conduit';
        return 'elec-wiring';
    }

    // Ceiling
    if (name.includes('false ceiling') || name.includes('pop') || name.includes('gypsum')) return 'pop-boarding';

    // Carpentry
    if (cat.includes('carpentry') || cat.includes('kitchen') || cat.includes('wardrobe')) {
        if (name.includes('laminate') || name.includes('veneer') || name.includes('finish')) return 'carp-shutters';
        if (name.includes('hardware') || name.includes('handle') || name.includes('hinge')) return 'carp-install';
        return 'carp-structure';
    }

    // Painting
    if (cat.includes('painting') || name.includes('paint') || name.includes('wallpaper')) return 'paint-final';

    return null;
}

export const generateDeterministicSchedule = (boq: FullBoqItem[]): ProjectTask[] => {
    const tasks: ProjectTask[] = [];
    const taskMap = new Map<string, string>(); // Key (e.g., 'civil-start') -> ID
    const taskMaterials = new Map<string, string[]>(); // TaskKey -> Array of Item IDs

    // 1. Distribute BOQ items to tasks
    boq.forEach(item => {
        const key = mapItemToTaskKey(item);
        if (key) {
            const current = taskMaterials.get(key) || [];
            current.push(item.id);
            taskMaterials.set(key, current);
        }
    });

    // Helper to create and push task
    const addTask = (key: string, title: string, phase: string, duration: number, dependencyKeys: string[] = []): string => {
        const newId = id();
        const deps = dependencyKeys.map(k => taskMap.get(k)).filter(id => !!id) as string[];
        
        // Retrieve linked materials for this task key
        const linkedItems = taskMaterials.get(key) || [];

        tasks.push({
            id: newId,
            title,
            phase,
            trade: phase,
            status: 'pending',
            duration,
            startDay: 0, // Calculated later
            dependencies: deps,
            linkedMaterialIds: linkedItems
        });
        taskMap.set(key, newId);
        return newId;
    };

    // 2. Analyze BOQ to determine Scope
    const hasCivil = boq.some(i => i.cat === 'Civil' || i.name.toLowerCase().includes('demolition') || i.name.toLowerCase().includes('tile'));
    const hasFalseCeiling = boq.some(i => i.name.toLowerCase().includes('false ceiling') || i.name.toLowerCase().includes('pop'));
    const hasElectrical = boq.some(i => i.cat === 'Electrical');
    const hasPlumbing = boq.some(i => i.cat === 'Plumbing');
    const hasCarpentry = boq.some(i => i.cat === 'Carpentry' || i.cat === 'Modular Kitchen');
    const hasPainting = boq.some(i => i.cat === 'Painting');

    // 3. GENERATE TASKS & DEPENDENCIES

    // --- PHASE: SITE PREP ---
    addTask('prep', 'Site Protection & Temp Utilities', 'Site Prep', 2, []);
    addTask('material-civil', 'Procure: Sand, Cement, Bricks', 'Procurement', 3, ['prep']);

    // --- PHASE: CIVIL ---
    let civilEndKey = 'prep';
    if (hasCivil) {
        addTask('demo', 'Demolition & Debris Removal', 'Civil Works', 4, ['prep']);
        addTask('masonry', 'Masonry & Plaster Repairs', 'Civil Works', 5, ['demo']);
        addTask('waterproofing', 'Waterproofing (Wet Areas)', 'Civil Works', 4, ['demo']); 
        civilEndKey = 'masonry';
    }

    // --- PHASE: MEP (Elec + Plumbing) ---
    let mepEndKey = civilEndKey;
    if (hasElectrical || hasPlumbing) {
        const startKey = hasCivil ? 'demo' : 'prep';
        
        if (hasElectrical) {
            addTask('elec-chasing', 'Electrical Wall Chasing', 'Electrical & Plumbing', 4, [startKey]);
            addTask('elec-conduit', 'Conduit Pipe Installation', 'Electrical & Plumbing', 3, ['elec-chasing']);
            addTask('elec-wiring', 'Wire Pulling & Cabling', 'Electrical & Plumbing', 4, ['elec-conduit']);
            mepEndKey = 'elec-wiring';
        }
        
        if (hasPlumbing) {
            addTask('plumb-lines', 'Inlet/Outlet Piping', 'Electrical & Plumbing', 5, [startKey]);
            addTask('plumb-test', 'Pressure Testing', 'Electrical & Plumbing', 1, ['plumb-lines']);
        }
    }

    // --- PHASE: TILING & FLOORING ---
    let flooringEndKey = mepEndKey;
    if (hasCivil) { 
        const tileDep = hasPlumbing ? 'plumb-test' : civilEndKey;
        addTask('tiling-material', 'Procure: Tiles & Granite', 'Procurement', 5, [civilEndKey]);
        addTask('flooring', 'Floor Tiling & Skirting', 'Civil Works', 7, [tileDep, 'tiling-material']);
        addTask('dado', 'Kitchen/Toilet Dado Tiling', 'Civil Works', 5, [tileDep, 'tiling-material']);
        flooringEndKey = 'flooring';
    }

    // --- PHASE: FALSE CEILING ---
    let ceilingEndKey = mepEndKey;
    if (hasFalseCeiling) {
        const ceilingStart = hasElectrical ? 'elec-conduit' : civilEndKey;
        addTask('pop-channel', 'POP/Gypsum Framing', 'False Ceiling & POP', 5, [ceilingStart]);
        addTask('pop-boarding', 'Boarding & Cutouts', 'False Ceiling & POP', 4, ['pop-channel']);
        addTask('pop-jointing', 'Jointing & Finishing', 'False Ceiling & POP', 3, ['pop-boarding']);
        ceilingEndKey = 'pop-jointing';
    }

    // --- PHASE: CARPENTRY ---
    let carpentryEndKey = flooringEndKey;
    if (hasCarpentry) {
        addTask('wood-material', 'Procure: Plywood & Hardware', 'Procurement', 4, [flooringEndKey]);
        addTask('carp-structure', 'Carcass & Frames Fabrication', 'Carpentry & Joinery', 12, ['wood-material']);
        addTask('carp-shutters', 'Shutter Pressing & Laminate', 'Carpentry & Joinery', 8, ['carp-structure']);
        addTask('carp-install', 'Hardware & Installation', 'Carpentry & Joinery', 5, ['carp-shutters']);
        carpentryEndKey = 'carp-install';
    }

    // --- PHASE: PAINTING ---
    let paintingEndKey = carpentryEndKey;
    if (hasPainting) {
        const paintStart = ceilingEndKey; 
        addTask('paint-putty', 'Wall Putty & Primer (Base)', 'Painting & Finishing', 6, [paintStart]);
        addTask('paint-final', 'Final Coat Painting', 'Painting & Finishing', 4, [carpentryEndKey, 'paint-putty']);
        paintingEndKey = 'paint-final';
    }

    // --- PHASE: FINISHING & HANDOVER ---
    addTask('elec-final', 'Switch Plates & Light Fitting', 'Electrical & Plumbing', 3, [paintingEndKey]);
    addTask('deep-clean', 'Deep Cleaning & Debris Removal', 'Handover', 2, ['elec-final']);
    addTask('handover', 'Final Walkthrough & Handover', 'Handover', 1, ['deep-clean']);

    return calculateSchedule(tasks);
};

export const calculateSchedule = (tasks: ProjectTask[], _startDate?: string): ProjectTask[] => {
    // Map tasks by ID for easy access
    const taskMap = new Map<string, ProjectTask>();
    tasks.forEach(t => taskMap.set(t.id, { ...t })); 

    // Memoization for recursion
    const memo = new Map<string, number>();

    // Recursive function to calculate end day (relative to 0)
    const resolveEndDay = (taskId: string, stack: Set<string>): number => {
        if (memo.has(taskId)) return memo.get(taskId)!;
        if (stack.has(taskId)) {
            return 0; // Break cycle
        }

        stack.add(taskId);
        const task = taskMap.get(taskId);
        if (!task) return 0;

        let maxDepEnd = 0;
        if (task.dependencies && task.dependencies.length > 0) {
            for (const depId of task.dependencies) {
                maxDepEnd = Math.max(maxDepEnd, resolveEndDay(depId, stack));
            }
        }

        // Set startDay for this task
        task.startDay = maxDepEnd;
        
        const endDay = maxDepEnd + task.duration;
        memo.set(taskId, endDay);
        stack.delete(taskId);
        
        return endDay;
    };

    // Calculate for all tasks
    tasks.forEach(t => resolveEndDay(t.id, new Set()));

    // Return tasks sorted by start day
    return Array.from(taskMap.values()).sort((a, b) => a.startDay - b.startDay);
};

export function getClientViewItems(revisionItems: any[]) {
  // Find paired correction entries (same name, one REMOVE, one ADD)
  const pairedIds = new Set<string>();
  const removeItems = revisionItems.filter(i => i.actionType === 'REMOVE');
  const addItems = revisionItems.filter(i => i.actionType === 'ADD');
  
  removeItems.forEach(rm => {
    const rmName = rm.itemName || rm.item;
    const matchingAdd = addItems.find(add => (add.itemName || add.item) === rmName);
    if (matchingAdd) {
      pairedIds.add(rm.id);
      pairedIds.add(matchingAdd.id);
    }
  });

  const validItems = revisionItems.filter(item => {
    const { actionType, reasonCategory, revTotal = 0, origTotal = 0, id } = item;
    
    // EXCLUSIONS
    if (reasonCategory === 'Correction') return false;
    if (actionType === 'REMOVE' && reasonCategory === 'Correction') return false;
    if (actionType === 'ADD' && reasonCategory === 'Correction') return false;
    if (revTotal === 0 && origTotal === 0) return false;
    if (pairedIds.has(id)) return false;

    // INCLUSIONS
    if (actionType === 'ADD') return true;
    if (actionType === 'REMOVE' && reasonCategory !== 'Correction') return true;
    if ((actionType === 'REVISE_QTY' || actionType === 'REVISE_RATE') && revTotal !== origTotal) return true;
    if (actionType === 'MARK_PENDING') return true;
    if (actionType === 'MARK_VENDOR') return true;

    return false;
  });

  const reductions: any[] = [];
  const additions: any[] = [];
  const pending: any[] = [];
  const actuals: any[] = [];
  
  let totalReductionValue = 0;
  let totalAdditionValue = 0;

  validItems.forEach(item => {
    const { actionType, revTotal = 0, origTotal = 0 } = item;
    
    if (actionType === 'MARK_PENDING') {
      pending.push(item);
    } else if (actionType === 'MARK_VENDOR') {
      actuals.push(item);
    } else if (revTotal < origTotal || actionType === 'REMOVE') {
      reductions.push(item);
      totalReductionValue += Math.round(origTotal - revTotal);
    } else if (revTotal > origTotal || actionType === 'ADD') {
      additions.push(item);
      totalAdditionValue += Math.round(revTotal - origTotal);
    }
  });

  return {
    reductions,
    additions,
    variable: { pending, actuals },
    netSaving: Math.round(totalReductionValue - totalAdditionValue),
    totalReductionValue: Math.round(totalReductionValue),
    totalAdditionValue: Math.round(totalAdditionValue)
  };
}
