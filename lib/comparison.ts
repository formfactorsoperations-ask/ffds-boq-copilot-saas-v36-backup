
import { ProposalTier, AiComparisonResult } from '../types';
import { calculateSellPrice, formatCurrency } from './utils';

const WET_AREAS = ['Kitchen', 'Bath', 'Toilet', 'Wash', 'Utility', 'Dining']; 

// Helper to check room context
const checkRoom = (roomName: string | undefined, type: 'wet' | 'dry' | 'kitchen') => {
    if (!roomName) return false;
    const lower = roomName.toLowerCase();
    if (type === 'kitchen') return lower.includes('kitchen');
    if (type === 'wet') return WET_AREAS.some(w => lower.includes(w.toLowerCase()));
    if (type === 'dry') return !WET_AREAS.some(w => lower.includes(w.toLowerCase()));
    return false;
};

// Helper to extract unique keywords from a list
const extractUniqueKeywords = (text: string, keywords: string[]): string[] => {
    const found = new Set<string>();
    const lowerText = text.toLowerCase();
    keywords.forEach(kw => {
        if (lowerText.includes(kw.toLowerCase())) {
            found.add(kw);
        }
    });
    return Array.from(found);
};

// Predefined Specs for Standard Tiers (Verbatim as per requirement)
const PREDEFINED_SPECS: Record<string, Record<string, string>> = {
    "Essential Elegance": {
        "Plywood (Kitchen & Bath)": "BWP Grade (Economy)",
        "Plywood (Rest of House)": "MR Grade – ₹70–75/sqft",
        "Hardware System": "SS Soft-Close Channels",
        "Laminate – Inner Finish": "₹500/sheet",
        "Laminate – Outer Finish": "₹1200–1500/sheet",
        "Wardrobe Drawers & Lofts": "Basic Shelf Storage",
        "Kitchen Shutters": "Laminate Finish",
        "Paint Finish": "Royale Matt",
        "False Ceiling Material": "—",
        "Electrical Fittings": "Standard (Anchor / GM) equivalent"
    },
    "Comfort Upgrade": {
        "Plywood (Kitchen & Bath)": "BWP Grade (Mid-range)",
        "Plywood (Rest of House)": "MR Grade – ₹85–90/sqft",
        "Hardware System": "SS Soft-Close Channels",
        "Laminate – Inner Finish": "₹550/sheet equivalent",
        "Laminate – Outer Finish": "₹1500–1800/sheet",
        "Wardrobe Drawers & Lofts": "Drawer + Loft (Soft Close)",
        "Kitchen Shutters": "Gloss Laminate",
        "Paint Finish": "Royale Matt",
        "False Ceiling Material": "Local A Channels",
        "Electrical Fittings": "GM Modular / Polycab Wiring equivalent"
    },
    "Complete Harmony": {
        "Plywood (Kitchen & Bath)": "Marine Grade (Premium – Century / Keto Equivalent)",
        "Plywood (Rest of House)": "MR Grade – ₹95–100/sqft",
        "Hardware System": "SS Soft-Close Channels",
        "Laminate – Inner Finish": "₹600/sheet equivalent",
        "Laminate – Outer Finish": "₹1800–2100/sheet (Greenlam / Dorby)",
        "Wardrobe Drawers & Lofts": "Drawer + Loft + Organizer",
        "Kitchen Shutters": "Gloss Laminate",
        "Paint Finish": "Royale Matt",
        "False Ceiling Material": "Local A+ Channels",
        "Electrical Fittings": "Legrand Premium Range equivalent"
    }
};

// Extractor configuration matching the user's specific table rows
const FEATURE_EXTRACTORS = [
    {
        key: 'Plywood (Kitchen & Bath)',
        keywords: ['BWP', 'BWR', 'Marine', 'Waterproof', '710', 'Century', 'Greenply', 'Kitply', 'Sainik', 'Austin', 'Gurjan'],
        filter: (item: any, room: string) => checkRoom(room, 'wet') && (item.cat === 'Carpentry' || item.cat === 'Modular Kitchen')
    },
    {
        key: 'Plywood (Rest of House)',
        keywords: ['MR Grade', 'Commercial', 'Moisture Resistant', '303', 'BWR', 'Century', 'Greenply', 'Kitply', 'Sainik', 'Austin', 'Neem'], 
        filter: (item: any, room: string) => checkRoom(room, 'dry') && item.cat === 'Carpentry'
    },
    {
        key: 'Hardware System',
        keywords: ['Hettich', 'Hafele', 'Blum', 'Ebco', 'Godrej', 'Soft Close', 'Quadra', 'Innotech', 'Tandem', 'Legrabox', 'Telescopic', 'Hydraulic', 'Kich'],
        filter: (item: any) => {
            const text = (item.specs || '') + (item.name || '');
            return text.toLowerCase().includes('hardware') || text.toLowerCase().includes('channel') || text.toLowerCase().includes('hinge') || item.cat === 'Hardware';
        }
    },
    {
        key: 'Laminate – Inner Finish',
        keywords: ['Liner', '0.8mm', 'Off-white', 'Fabric Finish', '0.7mm', '0.9mm', 'White'],
        filter: (item: any) => (item.specs || '').toLowerCase().includes('liner') || (item.specs || '').toLowerCase().includes('internal') || (item.specs || '').toLowerCase().includes('inner')
    },
    {
        key: 'Laminate – Outer Finish',
        keywords: ['1mm', '1.25mm', 'Merino', 'Greenlam', 'Royal Touche', 'Century', 'Vir', 'Sunmica', 'Textured', 'High Gloss', 'Suede', 'Matte', 'Acrylic', 'Veneer', 'PU'],
        // Filter out items that are specifically inner liner to avoid duplication
        filter: (item: any) => item.cat === 'Carpentry' && !((item.specs || '').toLowerCase().includes('liner'))
    },
    {
        key: 'Wardrobe Drawers & Lofts',
        keywords: ['Drawer', 'Shelf', 'Loft', 'Organizer', 'Wicker', 'Pull-out', 'Soft Close', 'Lockable', 'Hanger'],
        filter: (item: any) => (item.name || '').toLowerCase().includes('wardrobe') || (item.name || '').toLowerCase().includes('storage')
    },
    {
        key: 'Kitchen Shutters',
        keywords: ['Acrylic', 'PU', 'Duco', 'Glas', 'Laminate', 'Polymer', 'Acryglass', 'Merino', 'Greenlam', 'Profile', 'Handleless', 'Gola'],
        filter: (item: any, room: string) => checkRoom(room, 'kitchen') || item.cat === 'Modular Kitchen'
    },
    {
        key: 'Paint Finish',
        keywords: ['Royale', 'Apcolite', 'Tractor', 'Velvet', 'Lustre', 'Asian Paints', 'Dulux', 'Berger', 'Matte', 'Satin', 'Aspira', 'Atmos'],
        filter: (item: any) => item.cat === 'Painting'
    },
    {
        key: 'False Ceiling Material',
        keywords: ['Gypsum', 'POP', 'Saint Gobain', 'USG Boral', 'Grid', 'Armstrong', 'Channels', 'Hilux'],
        filter: (item: any) => item.cat === 'Civil' && ((item.name || '').toLowerCase().includes('ceiling') || (item.name || '').toLowerCase().includes('pop'))
    },
    {
        key: 'Electrical Fittings',
        keywords: ['Legrand', 'Schneider', 'Anchor', 'GM', 'Norisys', 'Goldmedal', 'Havells', 'Panasonic', 'Polycab', 'Finolex', 'GreatWhite'],
        filter: (item: any) => item.cat === 'Electrical'
    }
];

export const generateLocalComparison = (tiers: ProposalTier[], bankItems: any[]): AiComparisonResult => {
    const materialRows: any[] = [];
    const scopeRows: any[] = [];

    // 1. MATERIAL MATRIX
    FEATURE_EXTRACTORS.forEach(extractor => {
        const row: any = { feature: extractor.key };
        let hasData = false;

        tiers.forEach(tier => {
            // Priority 1: Check Predefined Specs for exact match
            if (PREDEFINED_SPECS[tier.name] && PREDEFINED_SPECS[tier.name][extractor.key]) {
                row[tier.name] = PREDEFINED_SPECS[tier.name][extractor.key];
                hasData = true;
                return;
            }

            // Priority 2: Dynamic Extraction
            const allKeywords = new Set<string>();
            let itemsFound = false;
            let minRate = Infinity;
            let maxRate = -Infinity;
            let unit = '';
            
            tier.boq.forEach(boqItem => {
                const bankItem = bankItems.find(b => b.id === boqItem.bankId);
                if (!bankItem) return;

                if (extractor.filter(bankItem, boqItem.roomId || '')) {
                    itemsFound = true;
                    
                    const textToSearch = `${bankItem.name || ''} ${bankItem.specs || ''}`;
                    const kws = extractUniqueKeywords(textToSearch, extractor.keywords);
                    kws.forEach(k => allKeywords.add(k));

                    const effectiveMargin = boqItem.marginOverride ?? bankItem.margin;
                    const rate = calculateSellPrice(bankItem.materials, bankItem.labor, effectiveMargin);
                    if (rate < minRate) minRate = rate;
                    if (rate > maxRate) maxRate = rate;
                    unit = bankItem.unit;
                }
            });

            const joinedKeywords = Array.from(allKeywords).join(', ');
            let displayVal = joinedKeywords;

            if (!displayVal && itemsFound) {
                if (extractor.key.includes('Plywood')) displayVal = 'Standard Grade';
                else if (extractor.key.includes('Hardware')) displayVal = 'Standard Fittings';
                else if (extractor.key.includes('Laminate')) displayVal = 'Standard Laminate';
                else displayVal = 'Standard Spec';
            } else if (!itemsFound) {
                displayVal = '-';
            }

            if (itemsFound && minRate !== Infinity && displayVal !== '-' && displayVal.length < 20) {
                const priceStr = minRate === maxRate 
                    ? formatCurrency(minRate) 
                    : `${formatCurrency(minRate)}-${formatCurrency(maxRate)}`;
                
                if (['sq ft', 'rft', 'mtr', 'sheet'].includes(unit)) {
                    displayVal += ` (${priceStr}/${unit})`;
                }
            }

            if (displayVal !== '-') {
                hasData = true;
            }
            row[tier.name] = displayVal;
        });

        // Always push row to maintain table structure if requested, or if data exists
        materialRows.push(row);
    });

    // 2. SCOPE MATRIX
    const allCategories = new Set<string>();
    tiers.forEach(t => t.boq.forEach(bi => {
        const item = bankItems.find(b => b.id === bi.bankId);
        if (item?.cat) allCategories.add(item.cat);
    }));

    Array.from(allCategories).sort().forEach(cat => {
        const row: any = { feature: cat };
        
        const tierValues = tiers.map(tier => {
            const hasCat = tier.boq.some(bi => {
                const item = bankItems.find(b => b.id === bi.bankId);
                return item?.cat === cat;
            });
            return hasCat;
        });

        const allTrue = tierValues.every(v => v === true);
        const allFalse = tierValues.every(v => v === false);

        if (!allFalse && !allTrue) { 
            tiers.forEach((tier, idx) => {
                row[tier.name] = tierValues[idx] ? 'Included' : '-';
            });
            scopeRows.push(row);
        }
    });

    return {
        materialMatrix: materialRows,
        scopeMatrix: scopeRows,
        tierSummaries: tiers.map(t => ({ 
            tierName: t.name, 
            summary: `Est. ${t.boq.length} items` 
        }))
    };
};
