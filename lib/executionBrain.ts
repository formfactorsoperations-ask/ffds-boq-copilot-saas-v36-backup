
import { FullBoqItem, ExecutionBundle, Blocker, ExecutionAction, DecisionDebt, ProcurementBatch, OwnerType, SOFItem, ExecutionBundleStatus } from '../types';
import { id as generateId, calculateSellPrice, formatCurrency } from './utils';

// --- 1. FFDS STANDARD BUNDLE LIBRARY (12 Steps) ---
const BUNDLE_TEMPLATES = [
    { code: 'EB-01', name: 'Site Prep & Protection', gate: 'Possession', tags: ['protection', 'debris'] },
    { code: 'EB-02', name: 'Civil & Demolition', gate: 'EB-01 Done', tags: ['civil', 'demolition', 'masonry'] },
    { code: 'EB-03', name: 'Electrical Rough-ins', gate: 'Layout Freeze', tags: ['conduit', 'chasing', 'wiring'] },
    { code: 'EB-04', name: 'Plumbing Rough-ins', gate: 'Layout Freeze', tags: ['plumbing', 'pipe'] },
    { code: 'EB-05', name: 'False Ceiling (Framing)', gate: 'EB-03 Done', tags: ['framing', 'channel', 'pop'] },
    { code: 'EB-06', name: 'Tiling & Flooring', gate: 'EB-04 Done', tags: ['tile', 'floor', 'granite', 'marble', 'dado'] },
    { code: 'EB-07', name: 'Modular Carpentry (Carcass)', gate: 'EB-06 Done', tags: ['kitchen', 'wardrobe', 'carcass', 'ply', 'box'] },
    { code: 'EB-08', name: 'False Ceiling (Boarding)', gate: 'EB-03 Check', tags: ['gypsum', 'boarding'] },
    { code: 'EB-09', name: 'Painting (Base Prep)', gate: 'EB-08 Done', tags: ['putty', 'primer'] },
    { code: 'EB-10', name: 'Finish Carpentry (Shutters)', gate: 'EB-07 Done', tags: ['shutter', 'laminate', 'acrylic', 'moulding'] },
    { code: 'EB-11', name: 'Electrical Finishing', gate: 'EB-09 Done', tags: ['switch', 'light', 'fan'] },
    { code: 'EB-12', name: 'Final Finishing & Handover', gate: 'All Done', tags: ['paint', 'cleaning', 'handover', 'silicone'] }
];

export const createExecutionBundles = (boq: FullBoqItem[]): ExecutionBundle[] => {
    // Initialize bundles
    const bundles = BUNDLE_TEMPLATES.map(t => ({
        id: generateId(),
        code: t.code,
        name: t.name,
        trade: t.name.split(' ')[0], // Simple heuristic for trade
        itemIds: [] as string[],
        totalValue: 0,
        status: 'locked' as ExecutionBundleStatus,
        gate: t.gate,
        completionPercentage: 0
    }));

    // Assign BOQ items to bundles based on tags
    boq.forEach(item => {
        const text = (item.name + ' ' + item.cat + ' ' + item.specs).toLowerCase();
        const value = calculateSellPrice(item.materials, item.labor, item.margin) * item.qty;
        
        let assigned = false;

        // Specific Logic for Split items (Paint)
        if (text.includes('paint')) {
            // Split paint: Base prep (EB-09) vs Final (EB-12)
            // Ideally we split value, but for simple tracking we'll assign 'Primer/Putty' items to 09 and 'Paint' to 12
            if (text.includes('putty') || text.includes('primer')) {
                const b = bundles.find(x => x.code === 'EB-09');
                if (b) { b.itemIds.push(item.id); b.totalValue += value; assigned = true; }
            } else {
                const b = bundles.find(x => x.code === 'EB-12');
                if (b) { b.itemIds.push(item.id); b.totalValue += value; assigned = true; }
            }
        } 
        // Specific Logic for Carpentry (Carcass vs Finish)
        else if (text.includes('kitchen') || text.includes('wardrobe') || item.cat === 'Carpentry') {
            // Assume 60% is carcass (EB-07) - but since we can't split ID, we check name keywords
            if (text.includes('shutter') || text.includes('finish')) {
                const b = bundles.find(x => x.code === 'EB-10');
                if (b) { b.itemIds.push(item.id); b.totalValue += value; assigned = true; }
            } else {
                const b = bundles.find(x => x.code === 'EB-07');
                if (b) { b.itemIds.push(item.id); b.totalValue += value; assigned = true; }
            }
        }
        else {
            // Standard Tag Matching
            for (const bundle of bundles) {
                const template = BUNDLE_TEMPLATES.find(t => t.code === bundle.code);
                if (template && template.tags.some(tag => text.includes(tag))) {
                    bundle.itemIds.push(item.id);
                    bundle.totalValue += value;
                    assigned = true;
                    break;
                }
            }
        }

        // Fallback to Civil (EB-02) if unassigned
        if (!assigned) {
            const b = bundles.find(x => x.code === 'EB-02');
            if (b) { b.itemIds.push(item.id); b.totalValue += value; }
        }
    });

    // Determine Status
    bundles[0].status = 'active'; // Site Prep starts active
    bundles[0].completionPercentage = 10;

    return bundles;
};

// --- 2. SOF GENERATOR (Material Truth Layer) ---
export const generateSOFItems = (bundles: ExecutionBundle[]): SOFItem[] => {
    const sofItems: SOFItem[] = [];

    // Rule: EB-06 (Flooring) needs Tile Selection
    const flooringBundle = bundles.find(b => b.code === 'EB-06');
    if (flooringBundle && flooringBundle.totalValue > 0) {
        sofItems.push({
            id: generateId(),
            name: 'Flooring Tile Selection',
            category: 'Tiling',
            location: 'General / Living',
            linkedBundleId: flooringBundle.id,
            specifications: { brand: '', code: '', finish: '' },
            status: 'pending'
        });
    }

    // Rule: EB-10 (Finish Carpentry) needs Laminates & Handles
    const finishBundle = bundles.find(b => b.code === 'EB-10');
    if (finishBundle && finishBundle.totalValue > 0) {
        sofItems.push({
            id: generateId(),
            name: 'External Laminate / Finish',
            category: 'Carpentry Finishes',
            location: 'Kitchen & Wardrobes',
            linkedBundleId: finishBundle.id,
            specifications: { brand: '', code: '', finish: '' },
            status: 'pending'
        });
        sofItems.push({
            id: generateId(),
            name: 'Handles & Knobs',
            category: 'Hardware',
            location: 'All Joinery',
            linkedBundleId: finishBundle.id,
            specifications: { brand: '', code: '', finish: '' },
            status: 'pending'
        });
    }

    // Rule: EB-09 (Painting) needs Paint Shades
    const paintBundle = bundles.find(b => b.code === 'EB-09');
    if (paintBundle && paintBundle.totalValue > 0) {
        sofItems.push({
            id: generateId(),
            name: 'Wall Paint Shades',
            category: 'Paint',
            location: 'All Rooms',
            linkedBundleId: paintBundle.id,
            specifications: { brand: '', code: '', finish: '' },
            status: 'pending'
        });
    }

    return sofItems;
};

// --- 3. BLOCKER DETECTION ENGINE (Layer 3) ---
export const identifyBlockers = (bundles: ExecutionBundle[], sofItems: SOFItem[] | undefined, projectStartDate: string): Blocker[] => {
    const blockers: Blocker[] = [];
    const daysSinceStart = Math.floor((Date.now() - new Date(projectStartDate).getTime()) / (1000 * 3600 * 24));

    // A. Cash Flow Blocker (Simulation)
    if (daysSinceStart > 15) {
        const activeBundles = bundles.filter(b => b.status === 'active' || b.status === 'ready');
        if (activeBundles.length > 0) {
            blockers.push({
                id: generateId(),
                type: 'payment',
                description: 'Stage 2 Payment Overdue (Material Advance)',
                impactLevel: 'critical',
                blockedBundleIds: activeBundles.map(b => b.id),
                owner: 'client',
                financialImpact: activeBundles.reduce((sum, b) => sum + b.totalValue, 0),
                daysDelayed: daysSinceStart - 15,
                resolved: false
            });
        }
    }

    // B. SOF Decision Blockers (Real Logic)
    if (sofItems) {
        const pendingSOF = sofItems.filter(s => s.status !== 'frozen');
        
        pendingSOF.forEach(sof => {
            const bundle = bundles.find(b => b.id === sof.linkedBundleId);
            // Only block if bundle is ready or active
            if (bundle && (bundle.status === 'active' || bundle.status === 'ready')) {
                blockers.push({
                    id: generateId(),
                    type: 'decision',
                    description: `${sof.name} Pending`,
                    impactLevel: 'high',
                    blockedBundleIds: [bundle.id],
                    owner: 'client',
                    financialImpact: bundle.totalValue * 0.5, 
                    daysDelayed: 3,
                    resolved: false
                });
            }
        });
    }

    return blockers.sort((a, b) => b.financialImpact - a.financialImpact);
};

// --- 3. ACTION GENERATOR (Layer 1 Feed) ---
export const generateActions = (blockers: Blocker[]): ExecutionAction[] => {
    return blockers.map(b => {
        let title = `Resolve ${b.description}`;
        let type: ExecutionAction['type'] = 'unblock';

        if (b.type === 'payment') {
            title = "Generate & Send Invoice for Stage 2";
            type = 'verify';
        } else if (b.type === 'decision') {
            title = "Freeze Specs: " + b.description.replace(' Pending', '');
            type = 'procure';
        } else if (b.type === 'vendor') {
            title = "Call Vendor for " + b.description;
            type = 'unblock';
        }

        return {
            id: generateId(),
            title,
            type,
            linkedBlockerId: b.id,
            value: b.financialImpact,
            owner: 'ops' as OwnerType,
            status: 'pending' as const
        };
    }).sort((a, b) => b.value - a.value); 
};

// --- 4. DECISION DEBT TRACKER (Layer 3) ---
export const calculateDecisionDebt = (blockers: Blocker[]): DecisionDebt[] => {
    return blockers
        .filter(b => b.type === 'decision')
        .map(b => ({
            id: generateId(),
            itemCategory: b.description.split(' ')[0],
            daysPending: b.daysDelayed,
            impact: `Stalls ${formatCurrency(b.financialImpact)} of work`,
            resolved: false,
            financialImpact: b.financialImpact
        }));
};

// --- 5. PROCUREMENT INTELLIGENCE (Layer 4) ---
export const generateProcurementPlan = (bundles: ExecutionBundle[], projectStartDate: string): ProcurementBatch[] => {
    const plan: ProcurementBatch[] = [];
    const today = new Date();
    
    // Smart Procurement Mapping based on 12 Bundles
    bundles.forEach(b => {
        if (b.code === 'EB-02') { // Civil
            const reqDate = new Date(projectStartDate);
            reqDate.setDate(reqDate.getDate() + 3); 
            plan.push({
                id: generateId(),
                name: 'Civil Aggregates (Sand, Cement)',
                itemsCount: 4,
                totalCost: 15000,
                orderBy: projectStartDate,
                requiredBy: reqDate.toISOString(),
                status: 'delivered',
                risk: 'none'
            });
        }
        else if (b.code === 'EB-06') { // Tiling
            const reqDate = new Date(projectStartDate);
            reqDate.setDate(reqDate.getDate() + 25); 
            const ordDate = new Date(reqDate); ordDate.setDate(ordDate.getDate() - 10);

            plan.push({
                id: generateId(),
                name: 'Floor Tiles & Adhesive',
                itemsCount: 12,
                totalCost: 85000,
                orderBy: ordDate.toISOString(),
                requiredBy: reqDate.toISOString(),
                status: 'pending',
                risk: 'high' 
            });
        }
        else if (b.code === 'EB-07') { // Carpentry Carcass
            const reqDate = new Date(projectStartDate);
            reqDate.setDate(reqDate.getDate() + 35); 
            const ordDate = new Date(reqDate); ordDate.setDate(ordDate.getDate() - 5);

            plan.push({
                id: generateId(),
                name: 'Plywood & Hardware (Batch 1)',
                itemsCount: 45,
                totalCost: 120000,
                orderBy: ordDate.toISOString(),
                requiredBy: reqDate.toISOString(),
                status: 'pending',
                risk: 'low' 
            });
        }
    });

    return plan.sort((a, b) => new Date(a.orderBy).getTime() - new Date(b.orderBy).getTime());
};
