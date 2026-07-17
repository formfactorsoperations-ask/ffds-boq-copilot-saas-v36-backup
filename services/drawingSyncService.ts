import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { BoqItem, DrawingTrackerItem, DrawingRound } from '../types';

// Category Contract helper to normalize raw categories
export const getContractCategory = (rawCat: string): string => {
    const cat = (rawCat || '').toLowerCase().trim();
    if (cat.includes('ceiling')) return 'ceiling';
    if (cat.includes('electrical') || cat.includes('lighting')) return 'electrical';
    if (cat.includes('floor') || cat.includes('tiling') || cat.includes('flooring')) return 'flooring';
    if (cat.includes('civil') || cat.includes('demolition')) return 'civil';
    if (cat.includes('plumbing') || cat.includes('sanitary') || cat.includes('bathroom')) return 'plumbing';
    if (cat.includes('hvac') || cat.includes('ac') || cat.includes('ducting')) return 'hvac';
    if (cat.includes('kitchen') || cat.includes('modular')) return 'modular_kitchen';
    if (cat.includes('panel') || cat.includes('tv') || cat.includes('wardrobe') || 
        cat.includes('furniture') || cat.includes('carpentry') || cat.includes('bed') || cat.includes('woodwork')) {
        return 'woodwork';
    }
    return cat;
};

// Reverse-index configuration: Mapping execution category to drawing ID prefix or literals clearing that bundle
export const BUNDLE_DRAWING_INDEX: Record<string, string[]> = {
    woodwork: ['elevation_room', 'carpentry_detail_room'],
    ceiling: ['ceiling_layout', 'electrical_looping_layout'],
    plumbing: ['sanitary_layout', 'waterproofing_layout'],
    modular_kitchen: ['kitchen_elevation', 'kitchen_detail_drawing'],
    flooring: ['floor_layout'],
    civil: ['demolition_layout'],
    hvac: ['hvac_layout'],
    electrical: ['electrical_looping_layout']
};

export const getClearingDrawingIdsForBundle = (category: string, allDrawingIds: string[]): string[] => {
    const standardizedCategory = category.toLowerCase().trim();
    const config = BUNDLE_DRAWING_INDEX[standardizedCategory as keyof typeof BUNDLE_DRAWING_INDEX];
    if (!config) return [];
    
    if (standardizedCategory === 'woodwork') {
        return allDrawingIds.filter(id => id.startsWith('elevation_room_') || id.startsWith('carpentry_detail_room_'));
    }
    
    return allDrawingIds.filter(id => config.some(pattern => id === pattern || id.startsWith(pattern)));
};

const normalizeId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');

export const triggerDrawingSync = async (orgId: string, projectId: string, boqItems: BoqItem[]) => {
    console.log("triggerDrawingSync BOQ items count:", boqItems.length);
    if (boqItems.length > 0) {
        console.log("triggerDrawingSync First BOQ item:", boqItems[0]);
    }
    
    // Normalize categories to lowercase and also to Contract Categories
    const rawCategories = boqItems.map((item: any) => item.cat || item.category || '').filter(Boolean);
    const categories = new Set(rawCategories.map(c => c.toLowerCase()));
    const contractCategories = new Set(rawCategories.map(getContractCategory));
    console.log("triggerDrawingSync contract categories:", Array.from(contractCategories));
    
    // Helper to check if any category matches a keyword under original or contract categories
    const c = (keyword: string) => {
        for (const cat of categories) {
            if (cat.includes(keyword)) return true;
        }
        for (const cat of contractCategories) {
            if (cat.includes(keyword)) return true;
        }
        return false;
    };
    
    const rooms = Array.from(new Set(boqItems.map(i => i.roomId).filter(Boolean)));
    if (rooms.length === 0 && (c('woodwork') || c('carpentry') || c('panel') || c('tv') || c('wardrobe') || c('furniture') || c('bed'))) {
        rooms.push('Overall');
    }

    const generatedDrawings: Omit<DrawingTrackerItem, 'id' | 'currentRound' | 'approvedAt' | 'rounds' | 'isGapFlagged'>[] = [];
    
    // Ceiling drawing and Electrical Looping layout are companion drawings
    if (c('ceiling') || c('electrical') || c('lighting')) {
        generatedDrawings.push({ 
            name: 'Ceiling Layout', 
            boqTriggers: ['False Ceiling'], 
            isMandatory: true, 
            companionOf: 'electrical_looping_layout' 
        });
        generatedDrawings.push({ 
            name: 'Electrical Looping Layout', 
            boqTriggers: ['False Ceiling', 'Electrical'], 
            isMandatory: true, 
            companionOf: 'ceiling_layout' 
        });
    }

    // Floor drawing
    if (c('floor') || c('tiling') || c('flooring')) {
        generatedDrawings.push({ name: 'Floor Layout', boqTriggers: ['Flooring', 'Tiling'], isMandatory: true, companionOf: null });
    }
    
    // Civil drawing
    if (c('civil') || c('demolition')) {
        generatedDrawings.push({ name: 'Demolition Layout', boqTriggers: ['Civil'], isMandatory: true, companionOf: null });
    }
    
    // Plumbing matching both Sanitary and Waterproofing companions
    if (c('plumbing') || c('sanitary') || c('bathroom')) {
        generatedDrawings.push({ name: 'Sanitary Layout', boqTriggers: ['Plumbing', 'Sanitary Ware'], isMandatory: true, companionOf: 'waterproofing_layout' });
        generatedDrawings.push({ name: 'Waterproofing Layout', boqTriggers: ['Waterproofing', 'Plumbing'], isMandatory: true, companionOf: 'sanitary_layout' });
    }
    
    // HVAC drawing
    if (c('ac') || c('hvac') || c('ducting')) {
        generatedDrawings.push({ name: 'HVAC Layout', boqTriggers: ['HVAC'], isMandatory: true, companionOf: null });
    }
    
    // Modular Kitchen drawings
    if (c('kitchen') || c('modular') || c('modular_kitchen')) {
        generatedDrawings.push({ name: 'Kitchen Elevation', boqTriggers: ['Modular Kitchen'], isMandatory: true, companionOf: 'kitchen_detail_drawing' });
        generatedDrawings.push({ name: 'Kitchen Detail Drawing', boqTriggers: ['Modular Kitchen'], isMandatory: true, companionOf: 'kitchen_elevation' });
    }

    // Per-room generation for Custom Woodwork
    for (const roomId of rooms) {
        if (roomId === 'global') continue;
        
        const roomItems = boqItems.filter(i => i.roomId === roomId);
        const hasWoodwork = roomItems.some((i: any) => {
            const normalized = getContractCategory(i.cat || i.category || '');
            return normalized === 'woodwork';
        });
        
        if (hasWoodwork) {
            const eleId = normalizeId(`Elevation - Room ${roomId}`);
            const cartId = normalizeId(`Carpentry Detail - Room ${roomId}`);
            
            generatedDrawings.push({
                name: `Elevation - Room ${roomId}`,
                boqTriggers: ['Carpentry / Woodwork'],
                isMandatory: true,
                companionOf: cartId,
                roomName: roomId
            });

            generatedDrawings.push({
                name: `Carpentry Detail - Room ${roomId}`,
                boqTriggers: ['Carpentry / Woodwork', 'Carpentry Detail'],
                isMandatory: true,
                companionOf: eleId,
                roomName: roomId
            });
        }
    }

    // Now, fetch existing drawings
    const drawingsRef = collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`);
    const existingSnap = await getDocs(drawingsRef);
    const existingDrawings: Record<string, DrawingTrackerItem> = {};
    existingSnap.forEach(d => {
        existingDrawings[d.id] = d.data() as DrawingTrackerItem;
    });

    // Map logic: merge
    for (const gd of generatedDrawings) {
        let drawingId = normalizeId(gd.name);
        const existing = existingDrawings[drawingId];
        
        if (existing) {
            // Update boqTriggers and companionOf only, preserve round/revision states
            await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawingId), {
                boqTriggers: gd.boqTriggers,
                companionOf: gd.companionOf
            });
        } else {
            // Create brand new
            const newDrawing: DrawingTrackerItem = {
                id: drawingId,
                name: gd.name,
                boqTriggers: gd.boqTriggers,
                companionOf: gd.companionOf,
                isMandatory: gd.isMandatory,
                isGapFlagged: false, // will check gap later
                currentRound: 0,
                approvedAt: null,
                rounds: [
                    { roundNumber: 1, issuedAt: null, issuedBy: null, clientFeedbackSubmittedAt: null, status: 'not_issued' },
                    { roundNumber: 2, issuedAt: null, issuedBy: null, clientFeedbackSubmittedAt: null, status: 'not_started' }
                ],
                ...(gd.roomName ? { roomName: gd.roomName } : {})
            };
            await setDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawingId), newDrawing);
            existingDrawings[drawingId] = newDrawing; // register it for gap flagging
        }
    }

    // GAP FLAGGING logic
    const finalDrawingsSnap = await getDocs(drawingsRef);
    const finalDrawings: DrawingTrackerItem[] = finalDrawingsSnap.docs.map(d => d.data() as DrawingTrackerItem);
    
    for (const d of finalDrawings) {
        if (d.companionOf) {
            const companion = finalDrawings.find(x => x.id === d.companionOf);
            
            if (companion) {
                // Check if companion is issued or approved in any round
                const checkIssuedOrApproved = (item: DrawingTrackerItem) => {
                    if (item.approvedAt) return true;
                    return item.rounds.some(r => r.status === 'issued' || r.status === 'in_review' || r.status === 'approved');
                };

                const isCompanionIssued = checkIssuedOrApproved(companion);
                const isThisIssued = checkIssuedOrApproved(d);
                
                // If companion is issued/approved but this drawing is NOT, flag gap!
                const newGapFlag = isCompanionIssued && !isThisIssued;
                if (d.isGapFlagged !== newGapFlag) {
                    await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, d.id), {
                        isGapFlagged: newGapFlag
                    });
                }
            } else {
                // companion missing entirely
                if (!d.isGapFlagged) {
                    await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, d.id), {
                        isGapFlagged: true
                    });
                }
            }
        } else {
            if (d.isGapFlagged) {
                 await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, d.id), {
                    isGapFlagged: false
                 });
            }
        }
    }
};
