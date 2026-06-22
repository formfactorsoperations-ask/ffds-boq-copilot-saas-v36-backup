
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

const detectRoomType = (name: string): string => {
    const n = (name || '').toLowerCase();
    if (n.includes('liv') || n.includes('hall') || n.includes('sit')) return 'living';
    if (n.includes('bed') || n.includes('master') || n.includes('guest') || n.includes('kid')) return 'bedroom';
    if (n.includes('kitch') || n.includes('pantry')) return 'kitchen';
    if (n.includes('bath') || n.includes('toilet') || n.includes('wc') || n.includes('wash')) return 'bathroom';
    if (n.includes('din')) return 'dining';
    return 'general';
};

const isLivingArea = (name: string) => {
    const n = (name || '').toLowerCase();
    return n.includes('liv') || n.includes('hall') || n.includes('din') || n.includes('foyer');
};

const isDryArea = (name: string) => {
    const n = (name || '').toLowerCase();
    const isWet = n.includes('kitch') || n.includes('bath') || n.includes('toilet') || n.includes('wash') || n.includes('balcony') || n.includes('util');
    return !isWet;
};

// Quantity Calculator Logic (Room Specific)
export const calculateQuantity = (item: Item, size: number, ceilingHeight: number = 9.5): number => {
    const name = (item.name || '').toLowerCase().replace(/\./g, '');
    const unit = (item.unit || '').toLowerCase();
    const safeSize = Math.max(size, 25); // Min room size clamp
    const wallLength = Math.sqrt(safeSize);
    const perimeter = (wallLength * 2) + (wallLength * 1.5 * 2); // Simple rectangular approx

    // --- NEW LOGIC FOR CUSTOM BATHROOM LIST ---
    
    // Flooring (Item 30 equivalent)
    if (name.includes('flooring tiles') && name.includes('demolish')) {
        // Floor area only
        return Number((safeSize).toFixed(2));
    }

    // Wall Tiles (Item 31 equivalent)
    if (name.includes('wall tiles') && name.includes('demolish')) {
        // Wall Area (Perimeter * Height)
        const wallArea = perimeter * 7; // Approx 7ft height for tiles
        return Number((wallArea).toFixed(2));
    }

    // Waterproofing logic (Item 29)
    if (name.includes('waterproofing') || name.includes('bbc')) {
        return 1; // Lumpsum 1 as per list
    }
    
    // Other new lumpsum items
    if (['door frame', 'door - new', 'wall niches', 'washbasin counter'].some(k => name.includes(k))) {
        return 1;
    }
    
    // Material Provisions
    if (name.includes('actuals')) {
        return 1;
    }

    // --- END NEW LOGIC ---

    if (name.includes('flooring') || (name.includes('tile') && name.includes('floor'))) {
        return Number((safeSize * 1.1).toFixed(2)); 
    }

    if (name.includes('tile') && name.includes('wall')) {
        const dadoHeight = name.includes('kitchen') ? 2 : 7; 
        const area = (perimeter * dadoHeight) - 15; // Deduct door
        return Number(Math.max(20, area).toFixed(2));
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

const ensureRoomsExist = (projectContext: ProjectContext): Room[] => {
    if (projectContext.rooms.length > 0) return projectContext.rooms;
    const config = projectContext.config || '2-BHK';
    const totalArea = projectContext.area || 1000;
    const distribution = ROOM_DISTRIBUTIONS[config] || ROOM_DISTRIBUTIONS['2-BHK'];
    return distribution.map(d => ({
        name: d.name,
        size: Math.round(totalArea * d.ratio),
        unit: 'sq ft' as const
    }));
};

const calculateTotalWallArea = (rooms: Room[], ceilingHeight: number) => {
    return rooms.reduce((total, room) => {
        // Approx perimeter = 4 * sqrt(Area). 
        // 0.85 factor for doors/windows
        const p = Math.sqrt(room.size) * 4;
        const wall = (p * ceilingHeight) * 0.85;
        return total + wall;
    }, 0);
};

export const generateStandardPackages = (projectContext: ProjectContext, bank: Item[], templates: TemplateData): ProposalTier[] => {
    const tiers: { name: string, marginMod: number, rationalePrefix: string, desc: string, filterType: 'base' | 'mid' | 'top' }[] = [
        { 
            name: "Essential Elegance", 
            marginMod: 0.85, 
            rationalePrefix: "Base Spec: 0.8mm Lam, Std H/W",
            desc: "Core Functionality Only",
            filterType: 'base'
        },
        { 
            name: "Comfort Upgrade", 
            marginMod: 1.0, 
            rationalePrefix: "Mid Spec: 1mm Lam, Soft-close",
            desc: "Standard Interiors",
            filterType: 'mid'
        },
        { 
            name: "Complete Harmony", 
            marginMod: 1.25, 
            rationalePrefix: "Top Spec: Acrylic/PU, Premium H/W",
            desc: "Fully Loaded",
            filterType: 'top'
        }
    ];

    const bankMap = new Map(bank.map(i => [i.id, i]));
    const activeRooms = ensureRoomsExist(projectContext);
    const updatedContext = { ...projectContext, rooms: activeRooms };
    
    // Calculate Aggregates for Global Items (Prioritize room sum over generic area if available)
    const totalRoomArea = activeRooms.reduce((sum, r) => sum + r.size, 0);
    const totalCarpetArea = totalRoomArea > 0 ? totalRoomArea : (projectContext.area || 1000);
    
    const ceilingHeight = projectContext.ceilingHeight || 9.5;
    const totalWallArea = calculateTotalWallArea(activeRooms, ceilingHeight);

    const configStr = projectContext.config || '';
    const configKey = Object.keys(templates || INITIAL_TEMPLATES).find(k => configStr.includes(k)) || '2-BHK';
    const activeTemplate = (templates || INITIAL_TEMPLATES)[configKey] || FALLBACK_TEMPLATE;

    return tiers.map(tier => {
        const boqItems: BoqItem[] = [];

        // 1. PROCESS ROOM ITEMS
        activeRooms.forEach(room => {
            const templateKey = detectRoomType(room.name);
            const itemIds = activeTemplate[templateKey] || [];

            itemIds.forEach(bankId => {
                const bankItem = bankMap.get(bankId);
                if (!bankItem) return;

                const itemName = (bankItem.name || '').toLowerCase();
                const itemCat = bankItem.cat;

                // STRICTLY REMOVE GLOBAL ITEMS FROM ROOMS
                // False ceiling, Painting, Electrical are now handled globally to avoid double counting
                // Exception: For Bathroom Remodels, we WANT False Ceiling in the room logic as it's room-specific
                const isBathroomRemodel = configKey === 'Bathroom-Remodel';
                
                if (!isBathroomRemodel && (itemCat === 'Painting' || itemCat === 'Electrical' || itemName.includes('false ceiling'))) return;
                
                // Exclude Loose Furniture
                if (itemCat === 'Loose Furniture') return; 

                // Tier Filtering
                if (tier.filterType === 'base') {
                    if (itemName.includes('tv unit')) return;
                    if (itemName.includes('shoe')) return;
                    if (itemName.includes('crockery')) return;
                    if (itemName.includes('vanity')) return;
                    if (itemName.includes('showcase')) return;
                    if (itemName.includes('panelling')) return;
                    if (itemName.includes('wallpaper')) return;
                    if (itemName.includes('headboard')) return;
                }
                if (tier.filterType === 'mid') {
                    if (itemName.includes('panelling')) return;
                    if (itemName.includes('wallpaper')) return;
                    if (itemName.includes('headboard')) return;
                }

                const qty = calculateQuantity(bankItem, room.size, ceilingHeight);
                const newMargin = Math.max(10, bankItem.margin * tier.marginMod);

                boqItems.push({
                    id: generateId(),
                    bankId: bankItem.id,
                    qty: qty,
                    roomId: room.name,
                    marginOverride: Number(newMargin.toFixed(1)),
                    rationale: tier.rationalePrefix,
                    optional: false
                });
            });
        });

        // 2. PROCESS GENERAL ITEMS (Global / Functional)
        // Ensure core functional items are ALWAYS processed
        // For Bathroom Remodel, we skip generic whole-house painting/elec logic
        const isBathroomRemodel = configKey === 'Bathroom-Remodel';
        
        if (!isBathroomRemodel) {
            const functionalIds = ['gen-021', 'gen-022', 'gen-023', 'gen-024']; // FC, Wall Paint, Ceiling Paint, Elec
            const templateGeneralIds = activeTemplate['general'] || [];
            const combinedGeneralIds = Array.from(new Set([...templateGeneralIds, ...functionalIds]));
            
            combinedGeneralIds.forEach(bankId => {
                const bankItem = bankMap.get(bankId);
                if (!bankItem) return;
                const itemName = (bankItem.name || '').toLowerCase();
                const itemCat = bankItem.cat;

                let qty = 1;
                let skipItem = false;

                // --- SMART QUANTITY LOGIC FOR GENERAL ITEMS ---

                // A. FALSE CEILING
                if (itemName.includes('false ceiling')) {
                    if (tier.filterType === 'base') {
                        skipItem = true; // No FC in base
                    } else if (tier.filterType === 'mid') {
                        // Living + Dining Areas Only
                        const eligibleArea = activeRooms
                            .filter(r => isLivingArea(r.name))
                            .reduce((sum, r) => sum + r.size, 0);
                        qty = Number((eligibleArea * 1.15).toFixed(2));
                    } else {
                        // All Dry Areas (Excludes Kitchen/Bath)
                        const eligibleArea = activeRooms
                            .filter(r => isDryArea(r.name))
                            .reduce((sum, r) => sum + r.size, 0);
                        qty = Number((eligibleArea * 1.15).toFixed(2));
                    }
                }
                // B. PAINTING
                else if (itemCat === 'Painting') {
                    if (itemName.includes('ceiling')) {
                        // Ceiling Paint: Matches Total Carpet Area (approx)
                        qty = Number(totalCarpetArea.toFixed(2));
                    } else {
                        // Wall Paint: Calculated Total Wall Area
                        qty = Number(totalWallArea.toFixed(2));
                    }
                }
                // C. ELECTRICAL
                else if (itemCat === 'Electrical') {
                    // Point Calculation: Approx 1 point per 25 sqft
                    qty = Math.ceil(totalCarpetArea / 25);
                }
                // D. OTHERS (Debris, Protection)
                else if (itemName.includes('debris') || itemName.includes('protection')) {
                    if (bankItem.unit === 'sq ft') qty = totalCarpetArea;
                    if (itemName.includes('debris') && bankItem.unit === 'nos') {
                        qty = Math.ceil(totalCarpetArea / 400); 
                    }
                }

                if (skipItem || qty <= 0) return;

                const newMargin = Math.max(10, bankItem.margin * tier.marginMod);

                boqItems.push({
                    id: generateId(),
                    bankId: bankItem.id,
                    qty: qty,
                    roomId: 'General', 
                    marginOverride: Number(newMargin.toFixed(1)),
                    rationale: tier.rationalePrefix,
                    optional: false
                });
            });
        } else {
            // For Bathroom Remodel, specific generic items
             const templateGeneralIds = activeTemplate['general'] || [];
             templateGeneralIds.forEach(bankId => {
                const bankItem = bankMap.get(bankId);
                if (!bankItem) return;
                // Debris logic specific to small area
                if ((bankItem.name || '').toLowerCase().includes('debris')) {
                    boqItems.push({
                        id: generateId(),
                        bankId: bankItem.id,
                        qty: 1, // 1 Trip usually enough for 1 bath
                        roomId: 'General', 
                        marginOverride: bankItem.margin,
                        rationale: 'Disposal',
                        optional: false
                    });
                }
             });
        }

        return {
            id: generateId(),
            name: tier.name,
            timestamp: Date.now(),
            boq: boqItems,
            projectContext: updatedContext, 
            summary: {
                totalSell: 0, 
                totalCost: 0, // Added to match type definition
                totalGm: 0, 
                itemCount: boqItems.length,
                totalRevenue: 0, // Initializer
                designFee: 0,    // Initializer
                blendedGm: 0     // Initializer
            }
        };
    });
};
