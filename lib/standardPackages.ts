
import { Item, BoqItem, ProjectContext, ProposalTier, Room } from '../types';
import { id as generateId } from './utils';

// Define the structure for templates
export type TemplateData = Record<string, Record<string, string[]>>;

// --- BUNDLE DEFINITIONS (NEW) ---
export const ADDON_BUNDLES = [
    {
        id: 'bath_reno',
        name: 'Bathroom Renovation (Full)',
        icon: '🚿',
        description: 'Complete overhaul: BBC Civil, Demolition, New Tiling, Doors & Counters.',
        itemIds: [
            'gen-060', // BBC Plumbing
            'gen-061', // Floor Tiles (Auto Qty)
            'gen-062', // Wall Tiles (Auto Qty)
            'gen-063', // Door Frame
            'gen-064', // Door New
            'gen-065', // Wall Niches
            'gen-066', // Washbasin Counter
            'gen-067', // Tiles Material
            'gen-068', // Sanitary Material
            'gen-069', // CP Material
            'gen-026'  // Debris
        ]
    },
    {
        id: 'kitchen_essentials',
        name: 'Kitchen Essentials',
        icon: '🍳',
        description: 'Standard modular setup: Base units, Wall units, Loft & Sink plumbing.',
        itemIds: ['gen-010', 'gen-011', 'gen-012', 'gen-039', 'gen-062']
    },
    {
        id: 'electrical_rewiring',
        name: 'Electrical Rewiring',
        icon: '⚡',
        description: 'Full electrical overhaul: Chasing, Point wiring & Installation.',
        itemIds: ['gen-024', 'gen-025', 'gen-046']
    }
];

// --- INITIAL CONFIGURATION (DEFAULT STATE) ---
export const INITIAL_TEMPLATES: TemplateData = {
    '1-BHK': {
        'living': ['gen-005', 'gen-006'], // TV Unit, Panelling
        'bedroom': ['gen-013', 'gen-019'], // Wardrobe, Study
        'kitchen': ['gen-010', 'gen-012', 'gen-039'], // Cabinets, Plumbing
        'bathroom': ['gen-020', 'gen-040'], // Vanity, Sanitary
        'dining': [], 
        'general': ['gen-026', 'gen-027'] // Debris, Protection (others added dynamically)
    },
    '2-BHK': {
        'living': ['gen-005', 'gen-006', 'gen-003'], 
        'bedroom': ['gen-014', 'gen-019', 'gen-016'], 
        'kitchen': ['gen-010', 'gen-011', 'gen-039'], 
        'bathroom': ['gen-020', 'gen-040'], 
        'dining': ['gen-009'], 
        'general': ['gen-026', 'gen-027']
    },
    '3-BHK': {
        'living': ['gen-005', 'gen-006', 'gen-008', 'gen-003'],
        'bedroom': ['gen-014', 'gen-016', 'gen-019'],
        'kitchen': ['gen-010', 'gen-011', 'gen-037', 'gen-039'],
        'bathroom': ['gen-020', 'gen-040'],
        'dining': ['gen-009'], 
        'general': ['gen-026', 'gen-027']
    },
    'Bathroom-Remodel': {
        'bathroom': [
            'gen-060', 'gen-061', 'gen-062', 'gen-063', 'gen-064', 
            'gen-065', 'gen-066', 'gen-067', 'gen-068', 'gen-069'
        ],
        'general': ['gen-026'] // Debris Removal
    }
};

const FALLBACK_TEMPLATE = INITIAL_TEMPLATES['2-BHK'];

// Standard Room Ratios (Percentage of Total Carpet Area)
export const ROOM_DISTRIBUTIONS: Record<string, Array<{ name: string, ratio: number }>> = {
    '1-BHK': [
        { name: 'Living & Dining', ratio: 0.45 },
        { name: 'Master Bedroom', ratio: 0.25 },
        { name: 'Kitchen', ratio: 0.15 },
        { name: 'Master Bathroom', ratio: 0.08 },
    ],
    '2-BHK': [
        { name: 'Living & Dining', ratio: 0.38 },
        { name: 'Master Bedroom', ratio: 0.18 },
        { name: 'Guest Bedroom', ratio: 0.14 },
        { name: 'Kitchen', ratio: 0.12 },
        { name: 'Master Bathroom', ratio: 0.06 },
        { name: 'Common Bathroom', ratio: 0.06 },
    ],
    '3-BHK': [
        { name: 'Living & Dining', ratio: 0.35 },
        { name: 'Master Bedroom', ratio: 0.16 },
        { name: 'Kids Bedroom', ratio: 0.13 },
        { name: 'Guest Bedroom', ratio: 0.12 },
        { name: 'Kitchen', ratio: 0.10 },
        { name: 'Master Bathroom', ratio: 0.05 },
        { name: 'Common Bathroom', ratio: 0.05 },
        { name: 'Powder Room', ratio: 0.04 },
    ],
    '4-BHK': [
        { name: 'Living & Dining', ratio: 0.35 },
        { name: 'Master Bedroom', ratio: 0.15 },
        { name: 'Parents Bedroom', ratio: 0.13 },
        { name: 'Kids Bedroom', ratio: 0.12 },
        { name: 'Guest Bedroom', ratio: 0.10 },
        { name: 'Kitchen', ratio: 0.10 },
        { name: 'Bathrooms (Aggregated)', ratio: 0.15 }, // 3 baths approx
    ],
    'Bathroom-Remodel': [
        { name: 'Master Bathroom', ratio: 1.0 }, // 100% area is the bathroom
    ]
};

export const detectRoomType = (name: string): string => {
    const n = (name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (n.includes('foyer') || n.includes('entry') || n.includes('entrance')) return 'foyer';
    if (n.includes('liv') || n.includes('hall') || n.includes('sit') || n.includes('drawing')) return 'living';
    if (n.includes('din')) return 'dining';
    if (n.includes('kitch') || n.includes('pantry') || n.includes('modular_kitch')) return 'kitchen';
    if (n.includes('util') || n.includes('dry_balc') || n.includes('wash_area')) return 'utility';
    if (n.includes('master_bed')) return 'master_bedroom';
    if (n.includes('kids_bed')) return 'kids_bedroom';
    if (n.includes('guest_bed')) return 'guest_bedroom';
    if (n.includes('parents_bed')) return 'parents_bedroom';
    if (n.includes('bed')) return 'bedroom';
    if (n.includes('master_bath')) return 'master_bathroom';
    if (n.includes('common_bath')) return 'common_bathroom';
    if (n.includes('powder')) return 'powder_room';
    if (n.includes('bath') || n.includes('toilet') || n.includes('wc') || n.includes('washroom')) return 'bathroom';
    if (n.includes('pooja') || n.includes('mandir') || n.includes('temple')) return 'pooja';
    if (n.includes('balc') || n.includes('deck') || n.includes('terrace')) return 'balcony';
    if (n.includes('office') || n.includes('study') || n.includes('work_from_home')) return 'home_office';
    if (n.includes('dress') || n.includes('walk_in')) return 'dressing_area';
    if (n.includes('servant') || n.includes('staff')) return 'servant_room';
    if (n.includes('recept')) return 'reception';
    if (n.includes('conf')) return 'conference';
    if (n.includes('cabin') || n.includes('director')) return 'director_cabin';
    if (n.includes('workstation')) return 'workstation_area';
    return 'general';
};

const ROOM_TYPE_META: Record<string, { label: string; ratio: number; isWet: boolean }> = {
    foyer: { label: 'Foyer / Entrance', ratio: 0.05, isWet: false },
    living: { label: 'Living Room', ratio: 0.28, isWet: false },
    dining: { label: 'Dining Area', ratio: 0.10, isWet: false },
    kitchen: { label: 'Modular Kitchen', ratio: 0.12, isWet: true },
    utility: { label: 'Utility / Dry Balcony', ratio: 0.04, isWet: true },
    master_bedroom: { label: 'Master Bedroom', ratio: 0.18, isWet: false },
    bedroom: { label: 'Standard Bedroom', ratio: 0.14, isWet: false },
    kids_bedroom: { label: 'Kids Bedroom', ratio: 0.13, isWet: false },
    guest_bedroom: { label: 'Guest Bedroom', ratio: 0.12, isWet: false },
    parents_bedroom: { label: 'Parents Bedroom', ratio: 0.13, isWet: false },
    bathroom: { label: 'Bathroom / Toilet', ratio: 0.06, isWet: true },
    master_bathroom: { label: 'Master Bathroom', ratio: 0.06, isWet: true },
    common_bathroom: { label: 'Common Bathroom', ratio: 0.05, isWet: true },
    powder_room: { label: 'Powder Room', ratio: 0.04, isWet: true },
    pooja: { label: 'Pooja / Mandir', ratio: 0.03, isWet: false },
    balcony: { label: 'Balcony / Deck', ratio: 0.05, isWet: true },
    home_office: { label: 'Home Office / Study', ratio: 0.08, isWet: false },
    dressing_area: { label: 'Walk-in Dressing Area', ratio: 0.05, isWet: false },
    servant_room: { label: 'Staff / Servant Room', ratio: 0.05, isWet: false },
    reception: { label: 'Reception & Waiting', ratio: 0.15, isWet: false },
    conference: { label: 'Conference Room', ratio: 0.20, isWet: false },
    director_cabin: { label: 'Director Cabin', ratio: 0.18, isWet: false },
    workstation_area: { label: 'Open Workstations', ratio: 0.35, isWet: false },
    pantry: { label: 'Office Pantry', ratio: 0.07, isWet: true },
    restroom: { label: 'Restroom', ratio: 0.05, isWet: true },
};

const isLivingArea = (name: string) => {
    const n = (name || '').toLowerCase();
    return n.includes('liv') || n.includes('hall') || n.includes('din') || n.includes('foyer') || n.includes('drawing');
};

const isDryArea = (name: string) => {
    const n = (name || '').toLowerCase();
    const isWet = n.includes('kitch') || n.includes('bath') || n.includes('toilet') || n.includes('wash') || n.includes('balcony') || n.includes('util') || n.includes('pantry');
    return !isWet;
};

export const getSmartDefaultCoefficient = (item: Item): number | undefined => {
    // If explicit coefficient exists on item, use it
    if (item.areaMultiplierCoefficient !== undefined && item.areaMultiplierCoefficient > 0) {
        return item.areaMultiplierCoefficient;
    }

    const name = (item.name || '').toLowerCase();
    const cat = (item.cat || '').toLowerCase();

    // Painting category (Wall painting / Ceiling painting)
    if (cat.includes('paint') || name.includes('painting') || name.includes('paint')) {
        if (name.includes('ceiling')) {
            return 1.0; // Ceiling is exactly room area
        }
        return 3.5; // Wall area approx 3.5x room area
    }

    // Tiling / Flooring
    if (name.includes('tile') || name.includes('tiling') || name.includes('flooring') || name.includes('floor')) {
        if (name.includes('wall')) {
            return 3.0; // Wall tiles approx 3.0x room area
        }
        return 1.15; // Floor tiles with 15% waste buffer
    }

    // False Ceiling
    if (name.includes('ceiling') || name.includes('pop false')) {
        return 1.1; // Ceiling area with 10% waste buffer
    }

    // Electrical Points
    if (cat.includes('electrical') && item.unit === 'nos') {
        return 0.15; // e.g. 0.15 points per sq ft
    }

    return undefined;
};

// Quantity Calculator Logic (Room Specific)
export const calculateQuantity = (item: Item, size: number, ceilingHeight: number = 9.5): number => {
    const customCoeff = getSmartDefaultCoefficient(item);
    if (customCoeff !== undefined && size > 0) {
        return Number((size * customCoeff).toFixed(2));
    }

    const name = (item.name || '').toLowerCase().replace(/\./g, '');
    const unit = (item.unit || '').toLowerCase();
    const safeSize = Math.max(size, 25); // Min room size clamp
    const wallLength = Math.sqrt(safeSize);
    const perimeter = (wallLength * 2) + (wallLength * 1.5 * 2); // Simple rectangular approx

    // Flooring
    if (name.includes('flooring tiles') || name.includes('floor tile') || name.includes('vitrified tile')) {
        return Number((safeSize * 1.15).toFixed(2));
    }

    // Wall Tiles
    if (name.includes('wall tile') || name.includes('dado')) {
        const dadoHeight = name.includes('kitchen') ? 2.5 : 7;
        const wallArea = (perimeter * dadoHeight) - 15;
        return Number(Math.max(20, wallArea).toFixed(2));
    }

    // Waterproofing logic
    if (name.includes('waterproofing') || name.includes('bbc')) {
        return Number((safeSize).toFixed(2));
    }
    
    // Lumpsum items
    if (['door frame', 'door - new', 'wall niches', 'washbasin counter'].some(k => name.includes(k))) {
        return 1;
    }
    
    // Material Provisions
    if (name.includes('actuals')) {
        return 1;
    }

    if (name.includes('wallpaper')) {
        return Number((wallLength * ceilingHeight).toFixed(2));
    }

    if (name.includes('plumbing') && unit === 'nos') {
        return 3;
    }

    if (name.includes('piping') || name.includes('copper')) {
        return 15;
    }

    if (unit === 'sq ft') {
        if (name.includes('shoe')) return 15;
        if (name.includes('study') || name.includes('desk') || name.includes('table')) return 25;
        
        if (name.includes('wardrobe') || name.includes('wardobe')) {
            let width = 4;
            if (safeSize > 160) width = 9;
            else if (safeSize > 130) width = 7;
            else if (safeSize > 100) width = 5;
            const height = name.includes('loft') ? (ceilingHeight - 0.5) : 7;
            return Number((width * height).toFixed(2));
        }

        if (name.includes('kitchen') || name.includes('cabinet') || name.includes('storage')) {
            const runLength = Math.max(10, wallLength * 2.0); 
            if (name.includes('wall') || name.includes('overhead') || name.includes('loft')) {
                return Number((runLength * 2.0).toFixed(2));
            }
            return Number((runLength * 2.5).toFixed(2));
        }

        if (name.includes('tv unit') || name.includes('entertainment')) {
            if (name.includes('drawer') || name.includes('console') || name.includes('low')) return 12;
            const width = safeSize > 150 ? 6 : 4;
            return Number((width * 7).toFixed(2));
        }

        if (name.includes('crockery') || name.includes('bar') || name.includes('showcase')) return 30;
        if (name.includes('mandir') || name.includes('temple')) return 18;
        if (name.includes('vanity') || name.includes('basin')) return 12;
        if (name.includes('bed')) return name.includes('king') ? 40 : name.includes('queen') ? 35 : 30;
        if (name.includes('door')) return 24;
        if (name.includes('headboard')) return 24;
        if (name.includes('panelling') || name.includes('cladding')) {
            const width = wallLength * 0.8;
            return Number((width * ceilingHeight).toFixed(2));
        }
        if (name.includes('mirror')) return 12;
        if (name.includes('curtain') || name.includes('blind')) return Number((wallLength * 7).toFixed(2));
    }

    if (unit === 'lumpsum' || unit === 'nos') return 1;
    return 1;
};

/**
 * Resolves the active template configuration matching the requested typology name.
 */
export const resolveActiveTemplate = (
    templates: TemplateData | undefined,
    configStr: string
): { configKey: string; activeTemplate: Record<string, string[]> } => {
    const all = templates || INITIAL_TEMPLATES;
    const cleanConfig = (configStr || '').trim();

    // 1. Exact match
    if (cleanConfig && all[cleanConfig]) {
        return { configKey: cleanConfig, activeTemplate: all[cleanConfig] };
    }

    // 2. Case-insensitive exact match
    if (cleanConfig) {
        const found = Object.keys(all).find(k => k.toLowerCase() === cleanConfig.toLowerCase());
        if (found && all[found]) {
            return { configKey: found, activeTemplate: all[found] };
        }
    }

    // 3. Substring match (longest matching key)
    if (cleanConfig) {
        const candidates = Object.keys(all).filter(k =>
            cleanConfig.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(cleanConfig.toLowerCase())
        );
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.length - a.length);
            const best = candidates[0];
            return { configKey: best, activeTemplate: all[best] };
        }
    }

    // 4. Default fallback
    const firstKey = Object.keys(all)[0] || '2-BHK';
    return { configKey: firstKey, activeTemplate: all[firstKey] || FALLBACK_TEMPLATE };
};

/**
 * Builds rooms dynamically based on template room scopes and target carpet area.
 */
export const ensureRoomsExistForTemplate = (
    projectContext: ProjectContext,
    activeTemplate: Record<string, string[]>
): Room[] => {
    if (projectContext.rooms && projectContext.rooms.length > 0) {
        return projectContext.rooms;
    }

    const totalArea = projectContext.area || 1000;
    const templateRoomKeys = Object.keys(activeTemplate).filter(k => k !== 'general');

    if (templateRoomKeys.length === 0) {
        // Fallback to 2-BHK distribution
        const distribution = ROOM_DISTRIBUTIONS['2-BHK'];
        return distribution.map(d => ({
            name: d.name,
            size: Math.round(totalArea * d.ratio),
            unit: 'sq ft' as const
        }));
    }

    // Compute raw ratios from template rooms
    const rawRatios = templateRoomKeys.map(key => {
        const meta = ROOM_TYPE_META[key] || {
            label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            ratio: 0.12,
            isWet: false
        };
        return { key, label: meta.label, rawRatio: meta.ratio };
    });

    const sumRatio = rawRatios.reduce((acc, r) => acc + r.rawRatio, 0);

    return rawRatios.map(r => {
        const normalizedRatio = sumRatio > 0 ? r.rawRatio / sumRatio : (1 / rawRatios.length);
        const roomSize = Math.max(25, Math.round(totalArea * normalizedRatio));
        return {
            name: r.label,
            size: roomSize,
            unit: 'sq ft' as const
        };
    });
};

const calculateTotalWallArea = (rooms: Room[], ceilingHeight: number) => {
    return rooms.reduce((total, room) => {
        const p = Math.sqrt(room.size) * 4;
        const wall = (p * ceilingHeight) * 0.85;
        return total + wall;
    }, 0);
};

export const generateStandardPackages = (
    projectContext: ProjectContext,
    bank: Item[],
    templates: TemplateData,
    mode: 'single' | 'tiered' = 'tiered'
): ProposalTier[] => {
    const tiers: {
        name: string;
        marginMod: number;
        rationalePrefix: string;
        desc: string;
        filterType: 'base' | 'mid' | 'top';
    }[] = [
        { 
            name: "Essential Elegance", 
            marginMod: 0.85, 
            rationalePrefix: "Base Spec: 0.8mm Lam, Std H/W",
            desc: "Core Functional Package",
            filterType: 'base'
        },
        { 
            name: "Comfort Upgrade", 
            marginMod: 1.0, 
            rationalePrefix: "Mid Spec: 1mm Lam, Soft-close",
            desc: "Standard Turnkey Interiors",
            filterType: 'mid'
        },
        { 
            name: "Complete Harmony", 
            marginMod: 1.25, 
            rationalePrefix: "Top Spec: Acrylic/PU, Premium H/W",
            desc: "Fully Loaded Luxury Package",
            filterType: 'top'
        }
    ];

    const activeTiers = mode === 'single' ? [tiers[1]] : tiers;

    const bankMap = new Map<string, Item>(bank.map(i => [i.id, i]));
    
    // 1. Resolve exact template
    const { configKey, activeTemplate } = resolveActiveTemplate(templates, projectContext.config);
    
    // 2. Synthesize rooms matching template room scopes
    const activeRooms = ensureRoomsExistForTemplate(projectContext, activeTemplate);
    const updatedContext = { ...projectContext, config: configKey, rooms: activeRooms };
    
    // 3. Calculate Aggregates for Global / General Items
    const totalRoomArea = activeRooms.reduce((sum, r) => sum + r.size, 0);
    const totalCarpetArea = totalRoomArea > 0 ? totalRoomArea : (projectContext.area || 1000);
    
    const ceilingHeight = projectContext.ceilingHeight || 9.5;
    const totalWallArea = calculateTotalWallArea(activeRooms, ceilingHeight);

    return activeTiers.map(tier => {
        const boqItems: BoqItem[] = [];

        // 1. PROCESS ROOM ITEMS (Iterate across all template room scopes)
        Object.entries(activeTemplate).forEach(([roomKey, itemIds]) => {
            if (roomKey === 'general') return;

            // Find matching synthesized room
            const matchingRoom = activeRooms.find(r => {
                const detected = detectRoomType(r.name);
                return detected === roomKey || r.name.toLowerCase().includes(roomKey.replace(/_/g, ' '));
            }) || {
                name: roomKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                size: Math.round(totalCarpetArea / Math.max(1, Object.keys(activeTemplate).length - 1)),
                unit: 'sq ft' as const
            };

            itemIds.forEach(bankId => {
                const bankItem = bankMap.get(bankId);
                if (!bankItem) return;

                const itemName = (bankItem.name || '').toLowerCase();
                const itemCat = bankItem.cat;

                // Tier Filtering logic for decorative upgrades
                if (tier.filterType === 'base') {
                    // In Base, exclude high-cost decorative surface cladding/panelling/luxury accents
                    if (itemName.includes('fluted panelling') || itemName.includes('acoustic panel') || itemName.includes('wallpaper') || itemName.includes('profile light')) {
                        return;
                    }
                }
                if (tier.filterType === 'mid') {
                    // In Mid, exclude ultra-luxury acoustic & custom wall cladding
                    if (itemName.includes('acoustic panel') || itemName.includes('marble cladding')) {
                        return;
                    }
                }

                const qty = calculateQuantity(bankItem, matchingRoom.size, ceilingHeight);
                const newMargin = Math.max(10, Math.min(45, Number((bankItem.margin * tier.marginMod).toFixed(1))));

                boqItems.push({
                    id: generateId(),
                    bankId: bankItem.id,
                    qty: qty,
                    roomId: matchingRoom.name,
                    marginOverride: newMargin,
                    rationale: tier.rationalePrefix,
                    optional: false
                });
            });
        });

        // 2. PROCESS GENERAL / WHOLE-HOUSE ITEMS
        const templateGeneralIds = activeTemplate['general'] || [];
        templateGeneralIds.forEach(bankId => {
            const bankItem = bankMap.get(bankId);
            if (!bankItem) return;
            const itemName = (bankItem.name || '').toLowerCase();
            const itemCat = bankItem.cat;

            let qty = 1;
            let skipItem = false;

            // False Ceiling in General Scope
            if (itemName.includes('ceiling') || itemCat === 'False Ceiling') {
                if (tier.filterType === 'base') {
                    // Base: living area only (~30% of carpet area)
                    qty = Number((totalCarpetArea * 0.35).toFixed(2));
                } else if (tier.filterType === 'mid') {
                    // Mid: living + dining (~55% of carpet area)
                    qty = Number((totalCarpetArea * 0.60).toFixed(2));
                } else {
                    // Top: all dry areas (~85% of carpet area)
                    qty = Number((totalCarpetArea * 0.85).toFixed(2));
                }
            }
            // Painting in General Scope
            else if (itemCat === 'Painting' || itemName.includes('paint')) {
                if (itemName.includes('ceiling')) {
                    qty = Number(totalCarpetArea.toFixed(2));
                } else {
                    qty = Number(totalWallArea.toFixed(2));
                }
            }
            // Electrical in General Scope
            else if (itemCat === 'Electrical' || itemName.includes('electrical') || itemName.includes('point wiring')) {
                if (bankItem.unit === 'nos') {
                    qty = Math.ceil(totalCarpetArea / 25);
                } else {
                    qty = 1;
                }
            }
            // Debris & Floor Protection
            else if (itemName.includes('debris') || itemName.includes('protection') || itemName.includes('cleaning')) {
                if (bankItem.unit === 'sq ft') {
                    qty = totalCarpetArea;
                } else if (bankItem.unit === 'nos' || bankItem.unit === 'lumpsum') {
                    qty = Math.max(1, Math.ceil(totalCarpetArea / 500));
                }
            } else {
                qty = calculateQuantity(bankItem, totalCarpetArea, ceilingHeight);
            }

            if (skipItem || qty <= 0) return;

            const newMargin = Math.max(10, Math.min(45, Number((bankItem.margin * tier.marginMod).toFixed(1))));

            boqItems.push({
                id: generateId(),
                bankId: bankItem.id,
                qty: qty,
                roomId: 'General Scope',
                marginOverride: newMargin,
                rationale: tier.rationalePrefix,
                optional: false
            });
        });

        // 3. COMPUTE ACCURATE FINANCIAL TOTALS
        let totalCost = 0;
        let totalSell = 0;

        boqItems.forEach(bItem => {
            const b = bankMap.get(bItem.bankId);
            if (b) {
                const itemCost = ((b.materials || 0) + (b.labor || 0)) * bItem.qty;
                const itemMargin = bItem.marginOverride !== undefined ? bItem.marginOverride : (b.margin || 20);
                const sellRate = (b.materials + b.labor) / (1 - (itemMargin / 100));
                const itemSell = sellRate * bItem.qty;
                totalCost += itemCost;
                totalSell += itemSell;
            }
        });

        const totalGm = totalSell > 0 ? totalSell - totalCost : 0;
        const blendedGm = totalSell > 0 ? (totalGm / totalSell) * 100 : 0;
        const designFee = projectContext.designFee || 0;

        return {
            id: generateId(),
            name: tier.name,
            timestamp: Date.now(),
            boq: boqItems,
            projectContext: updatedContext,
            summary: {
                totalSell: Math.round(totalSell),
                totalCost: Math.round(totalCost),
                totalGm: Math.round(totalGm),
                itemCount: boqItems.length,
                totalRevenue: Math.round(totalSell + designFee),
                designFee: Math.round(designFee),
                blendedGm: Number(blendedGm.toFixed(1))
            }
        };
    });
};
