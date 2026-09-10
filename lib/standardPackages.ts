
import { Item, BoqItem, ProjectContext, ProposalTier, Room, CivilScope } from '../types';
import { resolveCivilScope, describeCivilScope } from './civilScope';
import { realRooms, bucketForItem, ensureScopeRooms, uniqueRoomNames, ScopeBucket } from './scopeBuckets';
import { computeTakeoff, classifyRoom, defaultCeiling, DEFAULT_CONVENTIONS, RoomGeometry, TakeoffTotals } from './takeoff';
import { id as generateId, calculateSellPrice } from './utils';

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

/*
  Items the generator will not price on its own.

  Profile lighting is a design decision taken room by room with the client — a
  cove here, nothing there — and deriving it from a room's perimeter put a
  lighting line in every space at a quantity nobody had agreed. It stays in the
  bank and the studio adds it where it belongs.
*/
const NEVER_AUTO_PRICED = new Set(['gen-046']);

/*
  Ceilings on what a single room can be worth.

  Panelling scales with wall area, so a 187 sq ft living room produced 103 sq ft
  of TV wall panelling at ₹1,208 — ₹1,25,495 for one wall. A TV wall is a
  feature, not a surface treatment applied to everything within reach: it is
  budgeted, and above the budget the studio prices it deliberately.

  The quantity is reduced to fit, never the rate. A capped line still reads as a
  real measurement at a real rate — it is the extent that has been assumed
  conservatively, and the estimator can raise it.
*/
const VALUE_CAP_PER_ROOM: { test: RegExp; cap: number }[] = [
  { test: /panelling|panelling|cladding/i, cap: 30000 },
];

const capQuantity = (item: Item, qty: number, sellRate: number): number => {
  const rule = VALUE_CAP_PER_ROOM.find(r => r.test.test(item.name || ''));
  if (!rule || sellRate <= 0) return qty;
  const maxQty = rule.cap / sellRate;
  return qty > maxQty ? Number(maxQty.toFixed(2)) : qty;
};

/** Units where multiplying by a room's area means something. */
const AREA_UNITS = new Set(['sq ft', 'sqft', 'sq.ft', 'sqm', 'sq m', 'sft']);

export const getSmartDefaultCoefficient = (item: Item): number | undefined => {
    // If explicit coefficient exists on item, use it
    if (item.areaMultiplierCoefficient !== undefined && item.areaMultiplierCoefficient > 0) {
        return item.areaMultiplierCoefficient;
    }

    const name = (item.name || '').toLowerCase();
    const cat = (item.cat || '').toLowerCase();
    const unit = (item.unit || '').toLowerCase();

    /*
      An area coefficient only applies to something measured by area.

      FLOOR PROTECTION is priced in `nos` and its name contains "floor", so the
      tiling branch below handed it 1.15 — a 904 sq ft flat was billed 1,039
      *units* of floor protection at ₹11,500 each, ₹1.19 crore for dust sheets.
      The guard is on the unit rather than on that one item's name because the
      same trap is set for every lumpsum and per-piece item whose description
      happens to mention a surface.
    */
    if (!AREA_UNITS.has(unit)) return undefined;

    /*
      Protection, debris and cleaning are site services measured by the job.
      They are not the floor, whatever their names say.
    */
    if (/protection|debris|cleaning|disposal|scaffold/.test(name)) return undefined;

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

    /*
      Running-foot items run along something.

      Every 'rft' item fell through to the unit default of 1, so profile
      lighting in a 380 sq ft living room was priced as one running foot —
      ₹667 for a whole room. It was invisible while no template contained an
      rft item; making the tiers genuinely differ put five of them in the top
      option at once.

      Lighting and skirting run the room perimeter less openings; copper piping
      runs to the outdoor unit, which is a different animal and stays a stated
      quantity.
    */
    if (unit === 'rft' && !name.includes('copper')) {
        if (name.includes('profile light') || name.includes('cove') || name.includes('strip')) {
            // Perimeter of the dry run, less doorways and the TV wall.
            return Number((perimeter * 0.75).toFixed(2));
        }
        if (name.includes('skirting') || name.includes('beading') || name.includes('moulding')) {
            return Number((perimeter * 0.9).toFixed(2));
        }
        return Number(perimeter.toFixed(2));
    }

    /*
      Lumpsum and per-piece items are counts. They are never an area.

      Every branch below derives a figure from the room's size, and none of them
      checked the unit — so BATHROOM BBC / WATERPROOFING, quoted at ₹22,000 as a
      lumpsum for the bathroom, came back as 903.59 "lumpsums" because the name
      contains "waterproofing". Two crore of waterproofing on a 904 sq ft flat.

      The two exceptions are real counts, not areas: plumbing points and copper
      piping runs, which the studio's own rules put at 3 and 15.
    */
    if (unit === 'lumpsum' || unit === 'nos') {
        if (name.includes('plumbing') && !name.includes('waterproof')) return 3;
        if (name.includes('piping') || name.includes('copper')) return 15;
        return 1;
    }

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
    activeTemplate: Record<string, string[]>,
    configKey?: string
): Room[] => {
    // Buckets stored as rooms by an older version are dropped here, so the fix
    // reaches existing projects without a migration anyone has to run.
    /*
      Names made unique on the way out.

      A plan labels three rooms "Toilet"; the name is the identity a BOQ line
      carries, so three bathrooms' worth of items collapsed into one heading.
      Doing it here means a project saved before this existed is corrected the
      next time it is priced, without a migration anyone has to run.
    */
    const existing = uniqueRoomNames(realRooms(projectContext.rooms));
    if (existing.length > 0) {
        return existing;
    }

    const totalArea = projectContext.area || 1000;

    /*
      The typology's own room list wins, when there is one.

      ROOM_DISTRIBUTIONS has always known that a 3-BHK is three bedrooms and
      three bathrooms; this function ignored it and synthesised one room per
      *template key* instead. A template writes 'bedroom' once and 'bathroom'
      once, so every 3-BHK came out as a flat with one bedroom and one bathroom
      — one wardrobe priced instead of three, one bathroom overhaul instead of
      three. That is most of why a generated BOQ read as under-scoped.
    */
    const distribution = configKey ? ROOM_DISTRIBUTIONS[configKey] : undefined;
    if (distribution?.length) {
        return distribution.map(d => ({
            name: d.name,
            size: Math.max(25, Math.round(totalArea * d.ratio)),
            unit: 'sq ft' as const,
        }));
    }

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

/*
  A room's slot in the template, with a family fallback.

  Templates are written one entry per room *type* — 'bedroom', 'bathroom' — but
  a real 3-BHK has a master bedroom, a kids bedroom and a guest bedroom, and
  three bathrooms of its own. Without the fallback, `detectRoomType` returns
  'master_bathroom', the template has no such key, and the master bathroom is
  priced as nothing at all.
*/
export const ROOM_KEY_FAMILY: Record<string, string> = {
  master_bedroom: 'bedroom', kids_bedroom: 'bedroom',
  guest_bedroom: 'bedroom', parents_bedroom: 'bedroom', servant_room: 'bedroom',
  master_bathroom: 'bathroom', common_bathroom: 'bathroom', powder_room: 'bathroom',
  utility: 'kitchen',
  dressing_area: 'bedroom', home_office: 'bedroom',

  /*
    Deliberately absent: balcony, terrace, foyer and pooja.

    They used to fall back to 'living', so a terrace was priced a TV unit, wall
    panelling and a showcase — five carpentry lines for an open deck. A room
    with no template entry is priced as nothing, which is the honest answer:
    the studio adds what a balcony actually needs. Inventing a TV wall outdoors
    is worse than an empty group somebody fills in.
  */
};

/**
 * The family a room belongs to, for counting rather than for pricing.
 *
 * `detectRoomType` is deliberately fine-grained — it separates a master bedroom
 * from a kids bedroom so a template can price them differently. That precision
 * is wrong for asking "does this flat already have three bedrooms?": a plan
 * labels them "Bedroom", the typology calls them "Master Bedroom", the two
 * types never compare equal, and a top-up concluded every bedroom was missing
 * and added a second full set of rooms with no dimensions.
 */
export const roomFamily = (name: string): string => {
  const t = detectRoomType(name);
  return ROOM_KEY_FAMILY[t] || t;
};

const templateKeyForRoom = (room: Room, activeTemplate: Record<string, string[]>): string | null => {
  const detected = detectRoomType(room.name);
  if (activeTemplate[detected]) return detected;
  const family = ROOM_KEY_FAMILY[detected];
  if (family && activeTemplate[family]) return family;
  // Last resort: a template key whose name appears in the room's own name.
  const loose = Object.keys(activeTemplate).find(
    k => k !== 'general' && room.name.toLowerCase().includes(k.replace(/_/g, ' ')),
  );
  return loose || null;
};

/**
 * The material rate at a given specification grade.
 *
 * Applied to materials only — labour to hang a wardrobe does not change because
 * the laminate is thicker — and only to the trades where grade is a real
 * choice. A lumpsum debris removal line does not have a "premium" version, and
 * scaling it would make the tier difference look like padding, which is exactly
 * what it must not be.
 */
const SPEC_SENSITIVE = new Set(['Carpentry', 'Modular Kitchen', 'Glass & Mirror', 'Decor', 'Loose Furniture']);

const specRate = (item: Item, materialMod: number): number | undefined => {
  if (materialMod === 1 || !SPEC_SENSITIVE.has(item.cat || '')) return undefined;
  return Number(((item.materials || 0) * materialMod).toFixed(2));
};

/**
 * Which rooms a tier enhancement lands in.
 *
 * `habitable` exists because `dry` was putting curtains in the kitchen. A dry
 * room is not the same as a room somebody sits in, and the distinction is the
 * difference between a credible option and one an estimator has to go and
 * delete lines out of.
 */
const roomsForEnhancement = (
  scope: 'living' | 'bedrooms' | 'habitable' | 'dry',
  rooms: Room[],
): Room[] => {
  const living = (r: Room) => /living|dining|hall|foyer/i.test(r.name || '');
  const bedroom = (r: Room) => /bed/i.test(r.name || '');
  if (scope === 'living') return rooms.filter(living);
  if (scope === 'bedrooms') return rooms.filter(bedroom);
  if (scope === 'habitable') return rooms.filter(r => living(r) || bedroom(r));
  return rooms.filter(r => !/bath|toilet|powder|utility|balcon/i.test(r.name || ''));
};

/*
  Whole-flat quantities, from the plan takeoff rather than from a square root.

  Wall area used to be `sqrt(area) * 4 * height * 0.85` per room — every room
  assumed square, a flat 15% knocked off for openings, and nothing at all
  deducted for the wall a wardrobe covers or the dado in a bathroom. The studio
  has a takeoff engine that already does this properly: `computeRoom` deducts
  real doors and windows, subtracts tiled cladding from paint, and knows a false
  ceiling's soffit and faces are not the same surface as the slab.

  Where a room carries real length and width from the plan those are used. Where
  it carries only an area, a rectangle is assumed at the studio's own default
  ratio — still wrong for an L-shaped living room, but wrong in one declared
  place rather than inside three different formulas.
*/
const ROOM_ASPECT = 1.35;

const geometryFor = (room: Room, ceilingHeight: number): RoomGeometry => {
  const kind = room.kind || classifyRoom(room.name);
  const area = Math.max(room.size || 0, 25);
  // A rectangle of the right area at a plausible aspect, when the plan gave none.
  const widthFt = room.width || Math.sqrt(area / ROOM_ASPECT);
  const lengthFt = room.length || area / widthFt;
  return {
    id: room.id || room.name,
    name: room.name,
    kind,
    lengthFt,
    widthFt,
    heightFt: room.height || ceilingHeight,
    doors: room.doors ?? (kind === 'passage' ? 0 : 1),
    windows: room.windows ?? (kind === 'passage' || kind === 'foyer' ? 0 : 1),
    ceiling: room.ceiling || defaultCeiling(kind),
    source: room.dimSource || 'assumed',
    rawDimension: room.rawDimension,
    irregular: room.irregular,
  };
};

const takeoffFor = (rooms: Room[], ceilingHeight: number, conventions?: Partial<typeof DEFAULT_CONVENTIONS>): TakeoffTotals =>
  computeTakeoff(
    rooms.map(r => geometryFor(r, ceilingHeight)),
    { ...DEFAULT_CONVENTIONS, ...(conventions || {}) },
  ).totals;

// ============================================================================
// Civil scope injection
//
// The typology templates are a carpentry list. That is not a criticism of them
// — a studio's 3-BHK template is what a 3-BHK usually needs *made*, and the
// civil work depends on the state of the flat, not on how many bedrooms it has.
// The two were never joined up, so a brief asking for the entire flooring and
// every bathroom redone produced a bill with no civil line in it at all: the
// items exist in the bank (gen-042, gen-060 through gen-067) and no template
// for 1/2/3-BHK lists one.
//
// This resolves the scope switches into bank items with real quantities, and
// the generator merges them in. Anything the template already priced for that
// room wins — the studio's own template is never overruled, only completed.
// ============================================================================

interface PlannedItem {
  bankId: string;
  roomId: string;
  qty: number;
  reason: string;
}

/** Rooms that hold water, by the meta the room synthesiser already uses. */
const isWetRoom = (room: Room): boolean => {
  const meta = ROOM_TYPE_META[detectRoomType(room.name)];
  return !!meta?.isWet;
};

const isBathroom = (room: Room): boolean => /bath|toilet|powder|wc/i.test(room.name || '');
const isKitchen = (room: Room): boolean => /kitchen/i.test(room.name || '');

/**
 * The civil items a scope implies, priced against real rooms.
 *
 * `tier` only reaches the extent decisions — how much of the flat gets a false
 * ceiling — never whether a trade is in scope. A base-tier bathroom overhaul is
 * still a bathroom overhaul; it is the specification that moves between tiers,
 * and that is carried by the margin and the rationale.
 */
function planCivilItems(
  scope: CivilScope,
  ctx: ProjectContext,
  rooms: Room[],
  bank: Map<string, Item>,
  ceilingHeight: number,
  tier: 'base' | 'mid' | 'top',
  ceilingShare: number,
  takeoff: TakeoffTotals,
): PlannedItem[] {
  const out: PlannedItem[] = [];
  const has = (id: string) => bank.has(id);
  const add = (bankId: string, roomId: string, qty: number, reason: string) => {
    if (!has(bankId) || !(qty > 0)) return;
    out.push({ bankId, roomId, qty: Number(qty.toFixed(2)), reason });
  };

  /* Buckets are not rooms; measuring from one double-counts the whole flat. */
  const measured = realRooms(rooms);
  const totalArea = measured.reduce((sum, r) => sum + (r.size || 0), 0) || ctx.area || 1000;
  const bathrooms = measured.filter(isBathroom);
  const wetRooms = measured.filter(isWetRoom);
  const raw = ctx.propertyStatus === 'raw_shell';
  let debris = false;

  /*
    ---- Flooring: one line for the flat, not one per room -------------------

    Flooring was priced room by room, which put a civil line inside every
    bedroom's group and left the Civil scope holding nothing but budget lines.
    A floor is laid as one job over one area and a contractor quotes it that
    way; splitting it per room made the BOQ longer without making it more
    accurate, since the rate is identical everywhere.

    The rooms are still what is measured — the quantity is the sum of their
    areas — so nothing is lost but the fragmentation. Bathrooms are the
    exception below: a wet area is a discrete package with its own waterproofing
    and its own tiling, and it is quoted per bathroom.
  */
  const floorQty = (rooms: Room[], item: Item | undefined) =>
    item ? rooms.reduce((sum, r) => sum + calculateQuantity(item, r.size, ceilingHeight), 0) : 0;

  if (scope.flooring) {
    if (raw) {
      // A shell has no floor to take up. Wet areas get anti-skid, dry areas
      // laminate — two lines, because they are two different materials.
      const wet = bank.get('gen-042');
      const dry = bank.get('gen-043');
      add('gen-042', 'Civil', floorQty(measured.filter(isWetRoom), wet), 'New floor to wet areas — raw shell');
      add('gen-043', 'Civil', floorQty(measured.filter(r => !isWetRoom(r)), dry), 'New floor to dry areas — raw shell');
    } else {
      const item = bank.get('gen-061');
      add('gen-061', 'Civil', floorQty(measured, item), `Existing floor lifted and relaid across ${measured.length} rooms`);
    }
    add('gen-067', 'Civil', 1, 'Tile material budget for the flooring scope');
    debris = true;
  }

  // ---- Bathrooms ----------------------------------------------------------
  if (scope.bathrooms && bathrooms.length) {
    bathrooms.forEach(room => {
      add('gen-060', room.name, 1, 'Base build, plumbing and waterproofing');

      const wall = bank.get('gen-062');
      if (wall) add('gen-062', room.name, calculateQuantity(wall, room.size, ceilingHeight), 'Wall dado stripped and retiled');

      /* Only if the flooring roll-up above has not already covered it. A wet
         area is quoted per bathroom, so this one stays in the room. */
      if (!scope.flooring) {
        const floor = bank.get('gen-061');
        if (floor) add('gen-061', room.name, calculateQuantity(floor, room.size, ceilingHeight), 'Bathroom floor stripped and retiled');
      }

      add('gen-066', room.name, 1, 'Washbasin counter');
      add('gen-065', room.name, 1, 'Recessed niches');
      add('gen-029', room.name, 1, 'Bathroom mirror');
      add('gen-040', room.name, 1, 'Sanitary ware installation');
    });

    // Material budgets, once for the flat rather than once per bathroom.
    add('gen-067', 'Civil', 1, 'Tile material budget for the bathrooms');
    add('gen-068', 'Civil', bathrooms.length, 'Sanitary ware at actuals');
    add('gen-069', 'Civil', bathrooms.length, 'CP fittings at actuals');
    debris = true;
  }

  // ---- Kitchen civil ------------------------------------------------------
  if (scope.kitchenCivil) {
    const kitchen = measured.find(isKitchen);
    if (kitchen) {
      // Civil, so it belongs to the Civil scope like the flooring — there is one
      // kitchen and it is quoted as one package.
      const dado = bank.get('gen-062');
      if (dado) add('gen-062', 'Civil', calculateQuantity(dado, kitchen.size, ceilingHeight), 'Kitchen dado');
      add('gen-039', 'Civil', 2, 'Sink and appliance plumbing points');
      debris = true;
    }
  }

  /*
    ---- Electrical: always, on every project --------------------------------

    Not gated on the rewiring switch. Every fit-out has an electrical labour
    line and a fittings-at-actuals line whatever the state of the flat — a refit
    that touches nothing structural still moves points and still buys fittings.
    Leaving them out when the switch was off produced a BOQ that quietly omitted
    work the studio always does, which is the worst kind of omission: invisible
    until site.

    The rewiring switch changes the extent, not the existence.
  */
  add('gen-024', 'Functional', scope.rewiring ? Math.ceil(totalArea / 25) : Math.ceil(totalArea / 60),
    scope.rewiring ? 'Point wiring across the carpet area' : 'Electrical setup — points moved and made good');
  add('gen-025', 'Functional', 1, 'Electrical fittings at actuals');

  // ---- Plumbing -----------------------------------------------------------
  if (scope.plumbing && wetRooms.length) {
    add('gen-039', 'Functional', wetRooms.length * 3, 'New and shifted points through the wet areas');
  }

  // ---- False ceiling ------------------------------------------------------
  if (scope.falseCeiling) {
    /*
      The takeoff knows which rooms carry a false ceiling and how much of each,
      so the tier share scales that rather than a flat slice of carpet area —
      35% of the whole flat put false ceiling in the bathrooms.
    */
    const share = ceilingShare;
    add('gen-021', 'Functional', (takeoff.falseCeilingSft || totalArea) * share,
      tier === 'base' ? 'POP ceiling — living area' : tier === 'mid' ? 'POP ceiling — living and dining' : 'POP ceiling — all dry areas');
  }

  // ---- Painting -----------------------------------------------------------
  if (scope.painting) {
    // Openings, tiled dado and fitted carpentry are already deducted by the
    // takeoff — a painter does not paint the wall behind a wardrobe.
    add('gen-022', 'Functional', takeoff.wallPaintSft, 'Walls, net of openings and cladding');
    add('gen-023', 'Functional', takeoff.ceilingPaintSft, 'Ceilings');
  }

  // One removal for the job, matching the general-scope rule above.
  if (debris) add('gen-026', 'Others', 1, 'Debris from the civil works');

  return out;
}

export const generateStandardPackages = (
    projectContext: ProjectContext,
    bank: Item[],
    templates: TemplateData,
    mode: 'single' | 'tiered' = 'tiered'
): ProposalTier[] => {
    /*
      What actually separates the three options.

      It used to be margin, and only margin. The tiers carried three "spec
      filters" that excluded items by name — fluted panelling, acoustic panel,
      marble cladding — none of which exists in the bank, plus wallpaper and
      profile light, which exist and appear in no default template. Every filter
      was dead, so all three options generated the identical bill of quantities
      and the client paid 10.6% more for Complete Harmony to receive exactly the
      same work. A comparison screen had nothing to show because there was
      nothing to see.

      Three real levers now, in the order a client understands them:

        materialMod   the same item built to a better specification — thicker
                      laminate, better carcass, soft-close hardware. Written to
                      `baseRate`, so it moves COST, which is what makes the
                      price difference defensible rather than an upsell.

        enhancements  items a tier adds outright. Present in one option and
                      absent from another is the difference a client can see.

        ceilingShare  extent: living only, living and dining, or all dry areas.

      Margin still moves, but it is no longer carrying the whole difference.
    */
    const tiers: {
        name: string;
        marginMod: number;
        /** Multiplier on the material rate — specification, not markup. */
        materialMod: number;
        /** Bank items this tier adds, by the room type they belong in. */
        enhancements: { bankId: string; rooms: 'living' | 'bedrooms' | 'habitable' | 'dry' }[];
        ceilingShare: number;
        rationalePrefix: string;
        desc: string;
        filterType: 'base' | 'mid' | 'top';
    }[] = [
        {
            name: "Essential Elegance",
            marginMod: 0.85,
            materialMod: 0.88,
            enhancements: [],
            ceilingShare: 0.35,
            rationalePrefix: "Base spec: 0.8mm laminate, standard hardware",
            desc: "Core Functional Package",
            filterType: 'base'
        },
        {
            name: "Comfort Upgrade",
            marginMod: 1.0,
            materialMod: 1.0,
            enhancements: [
                { bankId: 'gen-017', rooms: 'bedrooms' }, // dressing mirrors
            ],
            ceilingShare: 0.60,
            rationalePrefix: "Mid spec: 1mm laminate, soft-close hardware",
            desc: "Standard Turnkey Interiors",
            filterType: 'mid'
        },
        {
            name: "Complete Harmony",
            marginMod: 1.25,
            materialMod: 1.35,
            enhancements: [
                { bankId: 'gen-017', rooms: 'bedrooms' },  // dressing mirrors
                { bankId: 'gen-002', rooms: 'living' },    // wall panelling
                { bankId: 'gen-044', rooms: 'bedrooms' },  // feature wallpaper
                { bankId: 'gen-045', rooms: 'habitable' },   // curtains and blinds
            ],
            ceilingShare: 0.85,
            rationalePrefix: "Top spec: acrylic/PU finish, premium hardware",
            desc: "Fully Loaded Luxury Package",
            filterType: 'top'
        }
    ];

    const activeTiers = mode === 'single' ? [tiers[1]] : tiers;

    const bankMap = new Map<string, Item>(bank.map(i => [i.id, i]));
    
    // 1. Resolve exact template
    const { configKey, activeTemplate } = resolveActiveTemplate(templates, projectContext.config);
    
    /*
      2. Rooms — the real ones only.

      "Functional" and "Others" were stored as rooms carrying the whole flat's
      area, so an eight-room 904 sq ft project measured 2,710 sq ft and every
      whole-house quantity came out at roughly three times the property. They
      are buckets; nothing is measured from them.
    */
    const activeRooms = realRooms(ensureRoomsExistForTemplate(projectContext, activeTemplate, configKey));
    /*
      The context the tier carries: real rooms, plus the three scopes at zero
      area. Everything downstream that iterates rooms to decide what to render —
      the proposal, the client BOQ, the editors — needs the scopes to exist, and
      everything that measures uses `realRooms`, which filters them by name.
    */
    const updatedContext = { ...projectContext, config: configKey, rooms: ensureScopeRooms(activeRooms) };
    
    // 3. Calculate Aggregates for Global / General Items
    const totalRoomArea = activeRooms.reduce((sum, r) => sum + r.size, 0);
    const totalCarpetArea = totalRoomArea > 0 ? totalRoomArea : (projectContext.area || 1000);
    
    const ceilingHeight = projectContext.ceilingHeight || 9.5;
    const takeoff = takeoffFor(activeRooms, ceilingHeight, projectContext.takeoff?.conventions);
    const totalWallArea = takeoff.wallPaintSft;

    // What the site needs doing, from the studio's switches or, where they have
    // never been touched, from the Current Site State they already chose.
    const civilScope = resolveCivilScope(projectContext);

    return activeTiers.map(tier => {
        const boqItems: BoqItem[] = [];

        /*
          1. PROCESS ROOM ITEMS

          Iterating rooms, not template keys. The old loop walked the template
          and found *one* room per key, so a template entry for 'bedroom' was
          priced once however many bedrooms the flat had — three wardrobes
          became one. Walking the rooms prices each one against whichever
          template entry it belongs to.
        */
        activeRooms.forEach(matchingRoom => {
            const roomKey = templateKeyForRoom(matchingRoom, activeTemplate);
            if (!roomKey) return;
            const itemIds = activeTemplate[roomKey] || [];

            itemIds.forEach(bankId => {
                const bankItem = bankMap.get(bankId);
                if (!bankItem) return;

                if (NEVER_AUTO_PRICED.has(bankItem.id)) return;

                const newMargin = Math.max(10, Math.min(45, Number((bankItem.margin * tier.marginMod).toFixed(1))));
                const specMaterials = specRate(bankItem, tier.materialMod) ?? (bankItem.materials || 0);
                const sellRate = calculateSellPrice(specMaterials, bankItem.labor || 0, newMargin);
                const qty = capQuantity(bankItem, calculateQuantity(bankItem, matchingRoom.size, ceilingHeight), sellRate);

                boqItems.push({
                    id: generateId(),
                    bankId: bankItem.id,
                    qty: qty,
                    roomId: matchingRoom.name,
                    marginOverride: newMargin,
                    baseRate: specRate(bankItem, tier.materialMod),
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
                // Extent is a tier lever, scaling the area the takeoff says can
                // actually carry a false ceiling.
                qty = Number(((takeoff.falseCeilingSft || totalCarpetArea) * tier.ceilingShare).toFixed(2));
            }
            // Painting in General Scope
            else if (itemCat === 'Painting' || itemName.includes('paint')) {
                // Both from the takeoff: ceiling paint is the slab where there is
                // no false ceiling and the false-ceiling surface where there is.
                qty = Number((itemName.includes('ceiling') ? takeoff.ceilingPaintSft : takeoff.wallPaintSft).toFixed(2));
            }
            // Electrical in General Scope
            else if (itemCat === 'Electrical' || itemName.includes('electrical') || itemName.includes('point wiring')) {
                if (bankItem.unit === 'nos') {
                    qty = Math.ceil(totalCarpetArea / 25);
                } else {
                    qty = 1;
                }
            }
            /*
              Debris & floor protection.

              One, by default. These are quoted to the studio as a job for the
              flat — a van of debris, a set of sheets — not as a count derived
              from carpet area, and a number the estimator has to correct
              downward on every project is worse than a number they have to
              think about once. The area still drives it where the bank item is
              genuinely priced per square foot.
            */
            else if (itemName.includes('debris') || itemName.includes('protection') || itemName.includes('cleaning')) {
                qty = bankItem.unit === 'sq ft' ? totalCarpetArea : 1;
            } else {
                qty = calculateQuantity(bankItem, totalCarpetArea, ceilingHeight);
            }

            if (skipItem || qty <= 0) return;

            const newMargin = Math.max(10, Math.min(45, Number((bankItem.margin * tier.marginMod).toFixed(1))));

            boqItems.push({
                id: generateId(),
                bankId: bankItem.id,
                qty: qty,
                /* Painting and ceilings are Functional, debris and protection
                   are Others. "General Scope" said only "not a room". */
                roomId: bucketForItem(bankItem),
                marginOverride: newMargin,
                baseRate: specRate(bankItem, tier.materialMod),
                rationale: tier.rationalePrefix,
                optional: false
            });
        });

        /*
          3. CIVIL SCOPE

          Merged last and merged politely: a bank item the template already
          priced for that room is left exactly as the template priced it. This
          layer only adds what the typology template has no way of knowing —
          whether the floors are coming up, whether the bathrooms are being
          opened, whether the flat is being rewired.

          Without it a "3-BHK" generated the same carpentry list whether it was
          a raw shell or a finished flat being refitted, and a brief asking for
          the whole floor and every bathroom redone came back with neither.
        */
        /*
          2b. TIER ENHANCEMENTS

          The items a client actually sees when they compare options: profile
          lighting, a panelled wall, a feature paper, curtains. Present in one
          option and absent from another is a difference you can point at, and
          until now there were none — the three tiers shipped identical scope.
        */
        const enhanced = new Set(boqItems.map(i => `${i.bankId}@${i.roomId}`));
        tier.enhancements.forEach(enh => {
            const bankItem = bankMap.get(enh.bankId);
            if (!bankItem || NEVER_AUTO_PRICED.has(enh.bankId)) return;
            roomsForEnhancement(enh.rooms, activeRooms).forEach(room => {
                const key = `${enh.bankId}@${room.name}`;
                if (enhanced.has(key)) return;
                enhanced.add(key);
                const newMargin = Math.max(10, Math.min(45, Number((bankItem.margin * tier.marginMod).toFixed(1))));
                const enhRate = calculateSellPrice(
                    specRate(bankItem, tier.materialMod) ?? (bankItem.materials || 0),
                    bankItem.labor || 0,
                    newMargin);
                boqItems.push({
                    id: generateId(),
                    bankId: enh.bankId,
                    qty: capQuantity(bankItem, calculateQuantity(bankItem, room.size, ceilingHeight), enhRate),
                    roomId: room.name,
                    marginOverride: newMargin,
                    baseRate: specRate(bankItem, tier.materialMod),
                    rationale: `${tier.rationalePrefix} · included at this tier`,
                    optional: false,
                });
            });
        });

        const priced = new Set(boqItems.map(i => `${i.bankId}@${i.roomId}`));
        planCivilItems(civilScope, updatedContext, activeRooms, bankMap, ceilingHeight, tier.filterType, tier.ceilingShare, takeoff)
          .forEach(plan => {
            const key = `${plan.bankId}@${plan.roomId}`;
            if (priced.has(key)) return;
            priced.add(key);

            const bankItem = bankMap.get(plan.bankId);
            if (!bankItem) return;
            const newMargin = Math.max(10, Math.min(45, Number((bankItem.margin * tier.marginMod).toFixed(1))));

            boqItems.push({
              id: generateId(),
              bankId: plan.bankId,
              qty: plan.qty,
              roomId: plan.roomId,
              marginOverride: newMargin,
              rationale: `${tier.rationalePrefix} · ${plan.reason}`,
              optional: false,
            });
          });

        // 4. COMPUTE ACCURATE FINANCIAL TOTALS
        let totalCost = 0;
        let totalSell = 0;

        boqItems.forEach(bItem => {
            const b = bankMap.get(bItem.bankId);
            if (b) {
                // baseRate is the tier's specification rate where one applies —
                // without it the summary would price every tier off the bank
                // rate and report the spec upgrade as pure margin.
                const materials = bItem.baseRate !== undefined ? bItem.baseRate : (b.materials || 0);
                const itemCost = (materials + (b.labor || 0)) * bItem.qty;
                const itemMargin = bItem.marginOverride !== undefined ? bItem.marginOverride : (b.margin || 20);
                const sellRate = calculateSellPrice(materials, b.labor || 0, itemMargin);
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
