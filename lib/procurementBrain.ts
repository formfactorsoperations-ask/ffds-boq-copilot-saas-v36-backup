
import { MaterialLogItem } from '../types';

// The "Brain" for procurement logic
export const suggestProcurementDetails = (item: MaterialLogItem): { usage: string, vendor: string } => {
    const desc = (item.description || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    const specs = (item.specs || '').toLowerCase();
    
    let usage = "General Consumption";
    let vendor = "Local Hardware / Market";

    // 1. CARPENTRY & WOOD
    if (cat.includes('carpentry') || desc.includes('ply') || desc.includes('wood')) {
        if (desc.includes('laminate') || desc.includes('mica') || desc.includes('veneer')) {
            usage = "Surface Finishing (Shutters/Panels)";
            vendor = "Merino / Royal Touche / Greenlam";
        } else if (desc.includes('hardware') || desc.includes('hinge') || desc.includes('channel')) {
            usage = "Joinery Fittings";
            vendor = "Hettich / Hafele / Ebco (Auth. Distributor)";
        } else if (desc.includes('adhesive') || desc.includes('fevicol') || desc.includes('glue')) {
            usage = "Bonding Agent";
            vendor = "Pidilite (Official Dealer)";
        } else {
            usage = "Structural Framework (Carcass)";
            vendor = "Century / Greenply / Local Wholesaler";
        }
    }

    // 2. ELECTRICAL
    else if (cat.includes('electrical') || desc.includes('light') || desc.includes('wire')) {
        if (desc.includes('wire') || desc.includes('cable')) {
            usage = "Internal Wiring Loops";
            vendor = "Polycab / Finolex / RR Kabel";
        } else if (desc.includes('switch') || desc.includes('socket') || desc.includes('plate')) {
            usage = "Switchgear & Plates";
            vendor = "Legrand / Schneider / GM / Anchor";
        } else if (desc.includes('light') || desc.includes('led') || desc.includes('strip')) {
            usage = "Lighting Fixtures";
            vendor = "Philips / Wipro / Hybec / Local Specialist";
        } else if (desc.includes('fan')) {
            usage = "Ceiling Appliances";
            vendor = "Atomberg / Crompton / Havells";
        }
    }

    // 3. CIVIL & TILING
    else if (cat.includes('civil') || desc.includes('tile') || desc.includes('cement')) {
        if (desc.includes('adhesive') || desc.includes('grout')) {
            usage = "Tile Fixing Chemical";
            vendor = "Laticrete / Roff / Ardex";
        } else if (desc.includes('paint') || desc.includes('putty') || desc.includes('primer')) {
            usage = "Wall Preparation & Finish";
            vendor = "Asian Paints / Dulux / Birla White";
        } else {
            usage = "Flooring / Wall Cladding";
            vendor = "Kajaria / Somany / Simpolo (Direct Dealer)";
        }
    }
    
    // 4. PLUMBING & SANITARY
    else if (cat.includes('plumbing') || desc.includes('pipe') || desc.includes('basin')) {
        if (desc.includes('pipe') || desc.includes('elbow')) {
            usage = "Water Supply / Drainage Lines";
            vendor = "Astral / Ashirvad / Prince";
        } else {
            usage = "Sanitaryware & CP Fittings";
            vendor = "Jaquar / Kohler / Hindware";
        }
    }

    // 5. FALSE CEILING
    else if (cat.includes('ceiling') || desc.includes('pop') || desc.includes('gypsum')) {
        usage = "Ceiling Framework & Boarding";
        vendor = "Saint Gobain (Gyproc) / Hillux";
    }

    // 6. SITE SERVICES
    else if (desc.includes('debris') || desc.includes('protection')) {
        usage = "Site Logistics";
        vendor = "Local Agency / Contractor";
    }

    return { usage, vendor };
}
