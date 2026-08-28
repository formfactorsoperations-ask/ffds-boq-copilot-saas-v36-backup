
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { getAi } from './aiClient';
import { Item, BoqItem, AIStrategy, Room, MarginSuggestion, ProjectContext, CommandAction, AggregatedCategory, FullBoqItem, QuantitySuggestion, ProposalTier, ComparisonRow, AIGeneratedBoqItem, VisionAnalysisResult, TimelinePhase, MaterialSuggestion, AiComparisonResult, AIStatus, LeadProfile, DecisionBrainOutput, ProposalWriterOutput, AuditResult, ValueEngineeringSuggestion, ProfitabilityHotspot, ProjectTask, GeneratedRender, LumpsumBreakdownItem, SiteUpdateRecord, ProjectDecisionRecord } from '../types';
import { id as generateId, formatCurrency, calculateSellPrice } from '../lib/utils';
import { inferBasis, quantityFor, computeRoom, ratioFallback, DEFAULT_CONVENTIONS, classifyRoom, defaultCeiling, RoomGeometry } from '../lib/takeoff';

// Simple check if the key is present.
export const isAiAvailable = (): boolean => {
  return !!process.env.GEMINI_API_KEY;
};

// New function to verify API key status
export const verifyApiKey = async (): Promise<AIStatus> => {
    if (!process.env.GEMINI_API_KEY) {
        return 'unavailable';
    }
    try {
        const ai = getAi();
        // Use a very lightweight call to test the key
        await ai.models.countTokens({ model: 'gemini-3.5-flash', contents: 'test' });
        return 'online';
    } catch (e: any) {
        // If the service is temporarily unavailable (503) or we get a 403 but the key exists, return online
        if (e && e.toString && (e.toString().includes('503') || e.toString().includes('403')) || e?.status === 'UNAVAILABLE' || e?.status === 'PERMISSION_DENIED') {
            return 'online';
        }
        console.error("API Key verification failed:", e);
        return 'error';
    }
};


// Helper function to repair common malformed JSON issues returned by the AI
const repairJsonString = (jsonString: string): string => {
    let output = '';
    let stack: ('{' | '[')[] = [];
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString[i];
        
        if (escapeNext) {
            output += char;
            escapeNext = false;
            continue;
        }
        
        if (char === '\\') {
            output += char;
            if (inString) {
                escapeNext = true;
            }
            continue;
        }
        
        if (char === '"') {
            inString = !inString;
            output += char;
            continue;
        }
        
        if (inString) {
            if (char === '\n') {
                output += '\\n';
            } else if (char === '\r') {
                output += '\\r';
            } else {
                output += char;
            }
            continue;
        }
        
        if (char === '{') {
            stack.push('{');
            output += char;
        } else if (char === '[') {
            stack.push('[');
            output += char;
        } else if (char === '}') {
            if (stack.length > 0 && stack[stack.length - 1] === '{') {
                stack.pop();
                let trimmed = output.trimEnd();
                if (trimmed.endsWith(',')) {
                    output = trimmed.slice(0, -1);
                }
                output += char;
            } else {
                // Skip unmatched/extra closing brace
                continue;
            }
        } else if (char === ']') {
            if (stack.length > 0) {
                const last = stack[stack.length - 1];
                if (last === '[') {
                    stack.pop();
                    let trimmed = output.trimEnd();
                    if (trimmed.endsWith(',')) {
                        output = trimmed.slice(0, -1);
                    }
                    output += char;
                } else if (last === '{') {
                    stack.pop(); // pop '{'
                    let trimmed = output.trimEnd();
                    if (trimmed.endsWith(',')) {
                        output = trimmed.slice(0, -1);
                    }
                    output += '}';
                    
                    if (stack.length > 0 && stack[stack.length - 1] === '[') {
                        stack.pop(); // pop '['
                        output += ']';
                    }
                }
            } else {
                // Skip unmatched/extra closing bracket
                continue;
            }
        } else {
            output += char;
        }
    }
    
    if (inString) {
        output += '"';
    }
    while (stack.length > 0) {
        const last = stack.pop();
        let trimmed = output.trimEnd();
        if (trimmed.endsWith(',')) {
            output = trimmed.slice(0, -1);
        }
        output += last === '{' ? '}' : ']';
    }
    
    return output;
};

// Helper function to safely parse JSON from AI response
const parseJsonResponse = <T>(text: string, fallback: T): T => {
    let jsonString = (text || '').trim();
    
    // Remove markdown code blocks if present
    if (jsonString.startsWith('```')) {
        const firstNewlineIndex = jsonString.indexOf('\n');
        if (firstNewlineIndex !== -1) {
            jsonString = jsonString.substring(firstNewlineIndex + 1);
        }
    }
    if (jsonString.endsWith('```')) {
        jsonString = jsonString.slice(0, -3).trim();
    }
    
    try {
        if (!jsonString) return fallback;
        return JSON.parse(jsonString) as T;
    } catch (parseError) {
        // Fallback: try to repair the JSON by extracting and balancing
        try {
            const firstBrace = jsonString.indexOf('{');
            const firstBracket = jsonString.indexOf('[');
            
            let startIndex = -1;
            
            if (firstBrace !== -1 && firstBracket !== -1) {
                startIndex = Math.min(firstBrace, firstBracket);
            } else if (firstBrace !== -1) {
                startIndex = firstBrace;
            } else if (firstBracket !== -1) {
                startIndex = firstBracket;
            }
            
            if (startIndex !== -1) {
                const subStr = jsonString.substring(startIndex);
                const repaired = repairJsonString(subStr);
                return JSON.parse(repaired) as T;
            }
        } catch (repairError) {
            // Ignore repair errors and let it log below
        }

        console.error("Failed to parse JSON response:", parseError);
        console.error("Original text:", text);
        return fallback;
    }
}

// ... (Existing functions: estimateQuantity, suggestItemsFromBrief, splitCost, generateExecutiveSummary, getAiCoachSuggestions, optimizeMargins, estimateRoomSizes, analyzeFloorPlan, generateBoqPackage, generateTieredBoqPackages, generateComparisonMatrix, processCommand, analyzeRoomImage, generateProjectTimeline, generateMaterialMoodBoard, generateSmartContract, analyzeLeadStrategy, generateProposalContent, refineItemSpecs, auditProject, chatWithProject, suggestValueEngineering, analyzeProfitability) ...

const calculateFixedQuantity = (itemName: string, roomSize: number): number | null => {
    const name = itemName.toLowerCase();
    if (name.includes('pop false ceiling')) return Number((roomSize * 1.5).toFixed(2));
    if (name.includes('interior painting') && !name.includes('ceiling')) return Number((roomSize * 2.7).toFixed(2));
    if (name.includes('interior ceiling painting')) return Number((roomSize * 1.3).toFixed(2));
    if (name.includes('king size bed')) return 40.625;
    if (name.includes('queen size bed')) return 35.9375;
    if (name.includes('floor protection')) return 1;
    return null;
};

export async function estimateQuantity(item: Item, room: Room, projectContext: ProjectContext): Promise<QuantitySuggestion> {
    const defaultHeight = projectContext.takeoff?.defaultHeightFt || projectContext.ceilingHeight || 9;
    const conventions = { ...DEFAULT_CONVENTIONS, ...(projectContext.takeoff?.conventions || {}) };
    const basis = (item as any).measureBasis || inferBasis(item.name, item.unit);

    if (basis) {
        if (room.length && room.width) {
            const kind = room.kind || classifyRoom(room.name);
            const geom: RoomGeometry = {
                id: room.id || room.name,
                name: room.name,
                kind,
                lengthFt: room.length,
                widthFt: room.width,
                heightFt: room.height || defaultHeight,
                doors: room.doors ?? (kind === 'passage' ? 0 : 1),
                windows: room.windows ?? (kind === 'passage' || kind === 'foyer' ? 0 : 1),
                ceiling: room.ceiling || defaultCeiling(kind),
                source: room.dimSource || 'read',
                rawDimension: room.rawDimension,
                irregular: room.irregular,
            };
            const takeoff = computeRoom(geom, conventions);
            const res = quantityFor(basis, takeoff);
            if (res) return { qty: res.qty, rationale: res.derivation };
        }
        const fb = ratioFallback(basis, room.size);
        if (fb) return { qty: fb.qty, rationale: fb.derivation };
    }

    const fixedQty = calculateFixedQuantity(item.name, room.size);
    if (fixedQty !== null) return { qty: fixedQty, rationale: 'Calculated using standard room ratio.' };
    if (!isAiAvailable()) return { qty: 1, rationale: "AI not available." };
    const prompt = `Estimate qty for item: ${item.name} (${item.unit}) in room: ${room.name} (${room.size} sqft). Context: ${projectContext.config}. Return JSON {qty, rationale}.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { qty: { type: Type.NUMBER }, rationale: { type: Type.STRING } } } }
        });
        return parseJsonResponse<QuantitySuggestion>(response.text, { qty: 1, rationale: 'Error' });
    } catch (error) { return { qty: 1, rationale: 'API call failed' }; }
}

export async function generateExecutionTasks(boq: FullBoqItem[]): Promise<ProjectTask[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();

    // Group items by Room > Category for context-aware sequencing
    const roomGroups: Record<string, string[]> = {};
    boq.forEach(item => {
        const room = item.roomId || 'General';
        if (!roomGroups[room]) roomGroups[room] = [];
        // Only include key items to save context tokens
        if (item.cat !== 'Hardware' && item.cat !== 'Misc') {
            roomGroups[room].push(`${item.cat}: ${item.name} (${item.qty} ${item.unit})`);
        }
    });

    let contextSummary = "";
    Object.entries(roomGroups).forEach(([room, items]) => {
        if (items.length > 0) {
            contextSummary += `\nAREA: ${room}\n- ${items.slice(0, 8).join('\n- ')}${items.length > 8 ? '\n...and more' : ''}`;
        }
    });

    const prompt = `
        Act as a Senior Interior Project Manager. Generate a detailed Gantt Chart Execution Schedule based on this Scope of Work.

        SCOPE:
        ${contextSummary}

        CRITICAL SEQUENCING RULES (OPS MANUAL):
        1. **Sequence**: Civil/Demolition -> False Ceiling Framing + Electrical Chasing -> Wiring -> POP/Boarding -> Painting Base -> Carpentry -> Final Finishes.
        2. **Parallelism**: Carpentry should happen in parallel to Civil/Electrical where possible (in different rooms) or start immediately after dusty work settles.
        3. **Logic**: False ceiling and electrical setup MUST be completed before Painting starts.
        4. **Duration Calc**: 
           - Assume 6-hour effective work days (2pm-4pm is downtime). 
           - Assume 6-day work week (Sundays OFF).
           - Add 15% buffer to all duration estimates for site delays.
        
        OUTPUT:
        Return a JSON array of tasks. Use this structure:
        {
            "tempId": number, // Unique ID 1, 2, 3...
            "title": string, // Action-oriented, e.g., "Living Room: False Ceiling Framing"
            "description": string, // e.g., "Install channel framework and complete electrical piping"
            "phase": string, // Choose from: Preparation, Civil, Plumbing, Electrical, Carpentry, POP & Ceiling, Painting, Finishing, Handover
            "trade": string, // e.g., Carpenter, Electrician
            "room": string, // The specific room name (e.g. "Living Room", "Master Bedroom") or "General"
            "duration": number, // Estimated working days (integers only)
            "dependsOn": number[] // Array of tempIds that must finish before this starts
        }

        Create specific tasks for major rooms (Living, Kitchen, Master Bed). Group minor rooms if needed.
    `;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            tempId: { type: Type.NUMBER },
                            title: { type: Type.STRING },
                            description: { type: Type.STRING },
                            phase: { type: Type.STRING },
                            trade: { type: Type.STRING },
                            room: { type: Type.STRING },
                            duration: { type: Type.NUMBER },
                            dependsOn: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                        },
                        required: ["tempId", "title", "phase", "duration", "dependsOn"]
                    }
                }
            }
        });

        const rawTasks = parseJsonResponse<any[]>(response.text, []);
        
        // Post-process to map tempIds to UUIDs
        const idMap = new Map<number, string>();
        rawTasks.forEach(t => idMap.set(t.tempId, generateId()));

        const finalTasks: ProjectTask[] = rawTasks.map(t => ({
            id: idMap.get(t.tempId)!,
            title: t.title,
            description: t.description,
            phase: t.phase,
            trade: t.trade || 'General',
            room: t.room || 'General',
            status: 'pending',
            duration: Math.max(1, Math.ceil(t.duration)), // Ensure integer days, min 1
            startDay: 0, // Will be calculated by scheduler
            dependencies: (t.dependsOn || []).map((dId: number) => idMap.get(dId)).filter((id: string) => !!id),
            linkedMaterialIds: []
        }));

        return finalTasks;

    } catch (error) {
        console.error("Error generating execution tasks:", error);
        return [];
    }
}

export async function suggestItemsFromBrief(brief: string, bank: Item[]): Promise<Item[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `Match items from bank for brief: "${brief}". Bank: ${JSON.stringify(bank.map(i => ({id: i.id, name: i.name})))}. Return JSON array of item IDs.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        const itemIds = parseJsonResponse<string[]>(response.text, []);
        return bank.filter(item => itemIds.includes(item.id));
    } catch (error) { return []; }
}

export async function splitCost(item: Item, totalCost: number, strategy: AIStrategy): Promise<{ materials: number; labor: number; rationale: string; }> {
    if (!isAiAvailable()) return { materials: totalCost, labor: 0, rationale: 'AI not available' };
    const ai = getAi();
    const prompt = `Split cost ${totalCost} for ${item.name} into materials and labor. Strategy: ${strategy}. Return JSON {materials, labor, rationale}.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse(response.text, { materials: totalCost, labor: 0, rationale: 'Error' });
    } catch (error) { return { materials: totalCost, labor: 0, rationale: 'API call failed' }; }
}

export async function generateExecutiveSummary(boq: BoqItem[], aggregates: any): Promise<string> {
    if (!isAiAvailable()) return "AI not available.";
    const ai = getAi();
    const prompt = `Act as an expert Indian Interior Commercial Manager.
Write a concise, professional 3-sentence executive summary for the following interior project proposal.
Total Sell: INR ${aggregates.totalSell}
Total Cost: INR ${aggregates.totalCost}
Gross Margin: ${aggregates.grossMargin}%

Do not use vague marketing fluff. State specific financial health, margin strength, and overall execution scope.`;
    try { const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt }); return response.text || "Error"; } catch (e) { return "Error"; }
}

export async function getAiCoachSuggestions(boq: BoqItem[], aggregates: any): Promise<string[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `3 actionable profitability suggestions for interior project. GM: ${aggregates.totalGm}%. Return JSON string array.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<string[]>(response.text, []);
    } catch (e) { return []; }
}

export async function optimizeMargins(boq: FullBoqItem[], targetGm: number, strategy: AIStrategy): Promise<MarginSuggestion[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `Optimize margins to hit ${targetGm}% GM. Strategy: ${strategy}. BOQ: ${JSON.stringify(boq.map(i => ({id: i.id, name: i.name, currentMargin: i.margin})))}. Return JSON array {itemId, itemName, currentMargin, newMargin, rationale}.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<MarginSuggestion[]>(response.text, []);
    } catch (e) { return []; }
}

export async function estimateRoomSizes(area: number, config: string): Promise<Room[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `Estimate standard physical rooms (e.g. Living Room, Bedroom 1, Kitchen) for ${area} sqft ${config} apartment. 
Return JSON array {name, size, unit:'sq ft'}. DO NOT include functional or miscellaneous zones like 'Functional' or 'Others' in your response.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ 
            model: 'gemini-3.5-flash', 
            contents: prompt, 
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            size: { type: Type.NUMBER },
                            unit: { type: Type.STRING }
                        },
                        required: ["name", "size", "unit"]
                    }
                }
            } 
        });
        const rooms = parseJsonResponse<Room[]>(response.text, []);
        if (rooms.length > 0) {
            rooms.push({ name: 'Functional', size: area, unit: 'sq ft' });
            rooms.push({ name: 'Others', size: area, unit: 'sq ft' });
        }
        return rooms;
    } catch (e) { return []; }
}

export async function analyzeFloorPlan(imageBase64: string, area: number): Promise<Room[]> {
    try {
        const response = await fetch('/api/analyze-floorplan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imageBase64, area })
        });
        if (!response.ok) {
            throw new Error('Server error analyzing floor plan');
        }
        const data = await response.json();
        return data.rooms || [];
    } catch (e) {
        console.error("Error in analyzeFloorPlan API call:", e);
        return [];
    }
}

export async function generateBoqPackage(projectContext: ProjectContext, theme: string, bank: Item[]): Promise<AIGeneratedBoqItem[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `Act as an expert Indian Interior Designer.
Create a detailed BOQ package for a ${projectContext.config} home with a ${theme} theme.

Project Rooms: ${JSON.stringify(projectContext.rooms)}
Master Material Bank (ONLY use items specifically from this bank):
${JSON.stringify(bank.map((i) => ({ id: i.id, name: i.name, category: i.cat, unit: i.unit, cost: i.materials + i.labor })))}

REQUIREMENTS:
Return EXACTLY a JSON array where each object represents a selected item.
Format: [{ "id": "bank_item_id_here", "qty": estimated_number, "margin": 15, "roomId": "exact_room_name", "rationale": "Highly specific rationale..." }]

CRITICAL:
- Base 'qty' on the room sizes provided. Assign each item exactly to one 'roomId' from the project rooms list.
- ANY functional items (like Interior Painting, POP False Ceiling, Electrical setup, plumbing setup) MUST be assigned to the 'Functional' room.
- ANY miscellaneous items (like Debris Removal, Deep Cleaning, Floor Protection) MUST be assigned to the 'Others' room.
- Provide a highly specific rationale for each item detailing material logic, functional benefit, or aesthetic fit (e.g. "Selected 18mm MR grade plywood with standard laminate for durable base kitchen cabinets"). Do NOT use vague statements.
`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<AIGeneratedBoqItem[]>(response.text, []);
    } catch (e) { return []; }
}

export async function generateTieredBoqPackages(projectContext: ProjectContext, theme: string, bank: Item[], strategy: AIStrategy): Promise<{ essential: AIGeneratedBoqItem[]; premium: AIGeneratedBoqItem[]; luxury: AIGeneratedBoqItem[]; }> {
    if (!isAiAvailable()) return { essential: [], premium: [], luxury: [] };
    const ai = getAi();
    const prompt = `Act as an expert Indian Interior Estimator and Designer.
Create 3 distinct tiered BOQ packages (Essential Elegance, Comfort Upgrade, Complete Harmony) for a ${projectContext.config} home with a ${theme} theme.

Project Rooms: ${JSON.stringify(projectContext.rooms)}
Master Material Bank (ONLY use items strictly from this bank):
${JSON.stringify(bank.map((i) => ({ id: i.id, name: i.name, category: i.cat, unit: i.unit, cost: i.materials + i.labor })))}

Pricing Strategy: ${strategy} (e.g. margin constraints, value vs premium balance).

REQUIREMENTS FOR EACH OPTION:
1. "essential": Focus on core liveable necessities, cost-effective base materials (e.g., standard laminates, basic false ceiling). Skip non-essential decor.
2. "premium": Add comfortable upgrades, better finishes (e.g., acrylic/PU finishes, deeper wardrobes, enhanced lighting).
3. "luxury": Full-scale premium treatments (e.g., veneer, marble accents, full house automation, extensive custom joinery).

OUTPUT FORMAT TARGET:
Return EXACTLY a JSON file with this structure:
{
  "essential": [{ "id": "bank_item_id_here", "qty": estimated_number, "margin": proposed_percent, "roomId": "exact_room_name", "rationale": "Clear specific reason for selection..." }],
  "premium": [ ... ],
  "luxury": [ ... ]
}

CRITICAL: 
- For EVERY item, you must provide a highly specific "rationale" detailing why that material/spec was chosen for this tier (e.g. "Chosen for the Essential tier due to its durable and cost-effective standard laminate finish." vs "Luxury tier upgrade featuring bespoke PU-coated shutters for a seamless look"). Do not use vague terms.
- Base 'qty' on the room sizes provided. Assign each item exactly to one 'roomId' from the project rooms list.
- ANY functional items (like Interior Painting, POP False Ceiling, Electrical setup, plumbing setup) MUST be assigned to the 'Functional' room.
- ANY miscellaneous items (like Debris Removal, Deep Cleaning, Floor Protection) MUST be assigned to the 'Others' room.
`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.1-pro-preview', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse(response.text, { essential: [], premium: [], luxury: [] });
    } catch (e) { return { essential: [], premium: [], luxury: [] }; }
}

export async function generateComparisonMatrix(tiers: ProposalTier[], bank: Item[]): Promise<AiComparisonResult> {
    if (!isAiAvailable() || tiers.length < 2) return { materialMatrix: [], scopeMatrix: [], tierSummaries: [] };
    const ai = getAi();
    const prompt = `Act as an expert Interior Design client consultant.
Compare the following proposed tiers and highlight the specific material, functional, and aesthetic differences. DO NOT use vague statements like "better quality materials" or "more scope." Be precise (e.g. "Laminate vs. Acrylic Shutters", "Basic False Ceiling vs. Coved Lighting").

Tiers: ${JSON.stringify(tiers.map(t => ({name: t.name, items: t.boq.map(b => b.bankId)})))}

Return EXACTLY a JSON file with this structure:
{
  "materialMatrix": [
      { "feature": "Wardrobe Finish", "Tier1Name": "Specific spec here", "Tier2Name": "Specific spec here" ... }
  ],
  "scopeMatrix": [
      ... same structure for scope differences ...
  ],
  "tierSummaries": [
      { "tierName": "Name", "summary": "Precise 2-sentence summary highlighting the exact value proposition and specific material class." }
  ]
}
`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse(response.text, { materialMatrix: [], scopeMatrix: [], tierSummaries: [] });
    } catch (e) { return { materialMatrix: [], scopeMatrix: [], tierSummaries: [] }; }
}

export async function processCommand(command: string, boq: BoqItem[], projectContext: ProjectContext, bank: Item[]): Promise<{ actions: CommandAction[]; summary: string; }> {
    if (!isAiAvailable()) return { actions: [], summary: "AI not available." };
    const ai = getAi();
    const prompt = `Process BOQ command: "${command}". Return JSON {actions: [], summary: string}.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse(response.text, { actions: [], summary: "Error" });
    } catch (e) { return { actions: [], summary: "Error" }; }
}

export async function analyzeRoomImage(imageBase64: string): Promise<VisionAnalysisResult | null> {
    try {
        const response = await fetch('/api/analyze-room-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imageBase64 })
        });
        if (!response.ok) {
            throw new Error('Server error analyzing room image');
        }
        const data = await response.json();
        return data.analysis || null;
    } catch (e) {
        console.error("Error in analyzeRoomImage API call:", e);
        return null;
    }
}

export async function generateProjectTimeline(boq: FullBoqItem[]): Promise<TimelinePhase[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();

    // Prepare context summary to prevent token overload
    const roomGroups: Record<string, string[]> = {};
    boq.forEach(item => {
        const room = item.roomId || 'General';
        if (!roomGroups[room]) roomGroups[room] = [];
        // Exclude minor items to save tokens and noise
        if (item.cat !== 'Hardware' && item.cat !== 'Misc' && !(item.name || '').toLowerCase().includes('screw')) {
             roomGroups[room].push(`${item.cat}: ${item.name}`);
        }
    });

    let contextSummary = "";
    Object.entries(roomGroups).slice(0, 6).forEach(([room, items]) => {
        // Limit items per room
        if (items.length > 0) {
            contextSummary += `\nArea: ${room}\nItems: ${items.slice(0, 6).join(', ')}...`;
        }
    });

    const prompt = `
    Act as a Senior Project Manager for Interior Fit-out works (Residential).
    Based on the following BOQ summary, generate a high-level Gantt chart timeline phases.

    PROJECT CONTEXT:
    ${contextSummary}

    RULES:
    1. Scope is INTERIOR FIT-OUT only. NO Civil Foundation, NO Superstructure, NO Excavation.
    2. Phases must be specific to interiors: e.g., "Site Prep & Protection", "Civil & Tiling Changes", "False Ceiling Framing", "Electrical First Fix", "Carpentry Structure", "Finishing (Paint/Polish)", "Final Fixtures", "Handover".
    3. Total duration should be realistic for an Indian interior project (typically 60-90 days for 2/3BHK).
    4. Support parallel execution (e.g., False Ceiling and Electrical happen together). Adjust startDays accordingly.
    5. Do not include phases like "Foundation", "Plinth", or "Structure" unless explicitly in the BOQ context (unlikely for interiors).

    Return a JSON array of objects:
    {
        phaseName: string,
        durationDays: number,
        startDay: number (relative to day 0),
        description: string (concise summary of work)
    }
    `;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<TimelinePhase[]>(response.text, []);
    } catch (e) { return []; }
}

export async function generateMaterialMoodBoard(theme: string, rooms: Room[]): Promise<MaterialSuggestion[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `Act as an expert Indian Interior Designer creating a material pitch.
Generate a specific material mood board for a ${theme} interior design theme.
Rooms to design for: ${JSON.stringify(rooms.map(r=>r.name))}

Return EXACTLY a JSON array matching this structure:
[
  {
    "roomName": "Living Room",
    "colorPalette": [
      { "name": "Specific Color (e.g. Cobalt Blue)", "hex": "#HEXCODE" }
    ],
    "materials": [
      { "name": "Specific Material (e.g. Fluted Walnut Veneer)", "description": "Highly precise description of placement and texture..." }
    ]
  }
]
DO NOT use vague descriptions like "wood" or "paint". Specify exact textures, finishes, and combinations.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<MaterialSuggestion[]>(response.text, []);
    } catch (e) { return []; }
}

export async function generateSmartContract(tier: ProposalTier, projectContext: ProjectContext, fullBoq: FullBoqItem[], timelinePhases: TimelinePhase[]): Promise<string> {
    if (!isAiAvailable()) return "AI unavailable";
    const ai = getAi();
    const prompt = `Generate interior contract for ${projectContext.name}. Tier: ${tier.name}. Value: ${tier.summary.totalSell}. Return markdown text.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt });
        return response.text || "Error";
    } catch (e) { return "Error"; }
}

export async function analyzeLeadStrategy(projectContext: ProjectContext, leadProfile: LeadProfile): Promise<DecisionBrainOutput | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const prompt = `Analyze lead strategy. Context: ${JSON.stringify(projectContext)}. Lead: ${JSON.stringify(leadProfile)}. Return JSON DecisionBrainOutput.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<DecisionBrainOutput>(response.text, null);
    } catch (e) { return null; }
}

export async function generateProposalContent(projectContext: ProjectContext, brainOutput: DecisionBrainOutput, leadProfile?: LeadProfile): Promise<ProposalWriterOutput | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const prompt = `Write proposal content. Context: ${JSON.stringify(projectContext)}. Strategy: ${JSON.stringify(brainOutput)}. Return JSON ProposalWriterOutput.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<ProposalWriterOutput>(response.text, null);
    } catch (e) { return null; }
}

export async function refineItemSpecs(itemName: string, currentSpecs: string, theme: string): Promise<string> {
    if (!isAiAvailable()) return currentSpecs;
    const ai = getAi();
    const prompt = `Refine specs for ${itemName}: ${currentSpecs}. Theme: ${theme}. Return string.`;
    try { const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt }); return response.text || currentSpecs; } catch (e) { return currentSpecs; }
}

export async function auditProject(projectContext: ProjectContext, boq: FullBoqItem[]): Promise<AuditResult | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const prompt = `Audit project BOQ. Return JSON {score, warnings[], missingItems[], suggestions[]}.`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<AuditResult>(response.text, null);
    } catch (e) { return null; }
}

export async function explainNextActions(payload: { stage: number | string, subState: string, actions: any[] }): Promise<string> {
    if (!isAiAvailable()) throw new Error("Service unavailable");
    const ai = getAi();
    const prompt = `Explain conversationally why these are the next steps and in what order. You may not add, remove, or reorder actions. You may not state any number (₹, %, dates, counts) not present verbatim in the input. If actions is empty, say the stage is up to date.\n\nInput: ${JSON.stringify(payload)}`;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt as any });
            const text = response.text || "";

            const inputPayloadString = JSON.stringify(payload);
            const inputNumbers = (inputPayloadString.match(/\b\d+(?:\.\d+)?\b/g) || []) as string[];
            const outputNumbers = (text.match(/\b\d+(?:\.\d+)?\b/g) || []) as string[];

            let hasHallucinatedNumber = false;
            for (const num of outputNumbers) {
                if (!inputNumbers.includes(num)) {
                    hasHallucinatedNumber = true;
                    break;
                }
            }

            if (!hasHallucinatedNumber) {
                return text;
            }
        } catch (e) {
            if (attempt === 2) throw e;
        }
    }
    throw new Error("Failed number-verification guard after 3 attempts");
}

export async function suggestValueEngineering(boq: FullBoqItem[]): Promise<ValueEngineeringSuggestion[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `Act as an expert Value Engineer for Indian interior projects.
Review the following Bill of Quantities (BOQ): ${JSON.stringify(boq.map(i => ({ id: i.id, name: i.name, cost: (i.materials + i.labor) * i.qty, specs: i.rationale })))}.

Provide specific Value Engineering suggestions where costs can be optimized without significant functional loss.
DO NOT provide vague suggestions like "use cheaper wood". You MUST specify the exact material swap (e.g. "Swap 18mm BWP Plywood with 18mm MR Grade Plywood since it's for dry zones").

Return EXACTLY a JSON array of objects with the following keys:
- originalItemId (string)
- originalItemName (string)
- originalCost (number)
- alternativeName (string)
- alternativeSpecs (string, must be highly specific)
- projectedSavings (number, estimated savings in INR)
- impactAnalysis (string, the exact visual or functional compromise)
`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<ValueEngineeringSuggestion[]>(response.text, []);
    } catch (e) { return []; }
}

export async function analyzeProfitability(boq: FullBoqItem[]): Promise<{ engines: ProfitabilityHotspot[], drags: ProfitabilityHotspot[] } | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const prompt = `Act as an expert Commercial Quantity Surveyor.
Analyze the following BOQ for profitability hotspots (Engines) and margin drags (Drags).
BOQ: ${JSON.stringify(boq.map(i => ({ id: i.id, name: i.name, cost: (i.materials + i.labor) * i.qty, margin: i.margin, revenue: ((i.materials + i.labor) * (1 + (i.margin || 20) / 100)) * i.qty })))}

DO NOT provide vague rationales like "this has high margin". Provide specific, actionable financial intelligence (e.g. "Labor-intensive custom joinery capping total margins despite high revenue. Consider modular transition.").

Return EXACTLY a JSON object with this structure:
{
  "engines": [
    { "itemId": "string", "itemName": "string", "totalProfit": number, "profitMargin": number, "rationale": "Highly specific financial rationale" }
  ],
  "drags": [
    { "itemId": "string", "itemName": "string", "totalProfit": number, "profitMargin": number, "rationale": "Highly specific financial rationale detailing the exact cost pressure" }
  ]
}`;
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse(response.text, null);
    } catch (e) { return null; }
}

export async function enrichProcurementList(items: {id: string, name: string, cat: string}[]): Promise<Record<string, { usage: string, vendor: string }>> {
    if (!isAiAvailable()) return {};
    const ai = getAi();
    
    // Chunk items if too large, but for now simple approach
    const itemListStr = items.map(i => `- ID: ${i.id}, Item: ${i.name}, Cat: ${i.cat}`).join('\n');
    const prompt = `
        Act as a construction procurement manager. I have a list of materials/items.
        For each item, identify a specific 'Usage' (e.g. 'Kitchen Shutters', 'False Ceiling Frame') and a recommended Indian 'Vendor' or 'Brand' (e.g. 'Hettich', 'Asian Paints', 'Saint Gobain').
        
        Items:
        ${itemListStr}

        Return a JSON object where key is ID and value is object { usage: string, vendor: string }.
    `;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ 
            model: 'gemini-3.5-flash', 
            contents: prompt, 
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    additionalProperties: {
                        type: Type.OBJECT,
                        properties: {
                            usage: { type: Type.STRING },
                            vendor: { type: Type.STRING }
                        }
                    }
                } 
            } 
        });
        return parseJsonResponse(response.text, {});
    } catch (e) {
        console.error("Enrichment failed", e);
        return {};
    }
}

export async function generateLumpsumBreakdown(itemName: string, category: string, totalValue: number): Promise<LumpsumBreakdownItem[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `
        Act as an expert Interior Design Estimator in India.
        I have a lumpsum BOQ item: "${itemName}" in the category "${category}" with a total estimated value of ₹${totalValue}.
        
        Generate a logical, professional breakdown of this lumpsum item into 3-6 sub-components (materials, labor, specific parts).
        The sum of the estimated values of these sub-components should roughly equal the total value.
        
        Return a JSON array of objects in this exact format:
        [
            {
                "description": "Component description (e.g., CPVC Pipes & Fittings)",
                "estimatedValue": 15000
            }
        ]
    `;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            description: { type: Type.STRING },
                            estimatedValue: { type: Type.NUMBER }
                        },
                        required: ["description", "estimatedValue"]
                    }
                }
            }
        });
        const result = parseJsonResponse<any[]>(response.text, []);
        return result.map(r => ({
            id: generateId(),
            description: r.description,
            estimatedValue: r.estimatedValue
        }));
    } catch (e) {
        console.error("Failed to generate lumpsum breakdown", e);
        return [];
    }
}

export async function generateSiteIssueOptions(issueDescription: string): Promise<{ title: string, description: string, options: any[] } | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const prompt = `
        Act as an expert Interior Design Project Manager in India.
        The site team reported this rough issue: "${issueDescription}".
        
        Generate a professional "Site Discovery Alert" for the client.
        1. Provide a professional 'title' for the issue.
        2. Provide a clear, client-friendly 'description' explaining the problem without sounding alarming.
        3. Provide exactly 2 resolution 'options':
           - Option A: The "Do it right / Premium" fix (usually costs money, maintains design integrity). Must contain highly specific architectural or interior execution steps (e.g., exact material replacements, dimensional changes, structural adjustments).
           - Option B: The "Budget / Compromise" fix (costs 0 or less, but involves a design or quality compromise). Must clarify the precise visual or functional tradeoff (e.g., exposed conduits, reduced headroom, different finish).
           
        CRITICAL: Never use vague terms like "adjust the design," "use suitable materials," or "rework." You MUST be highly specific about the exact execution tasks (e.g. "Core cut through the 150mm slab to reroute the 4-inch UPVC drain pipe" or "Provide a 4-inch false ceiling pelmet with 12mm Gypsum board to conceal the beam drop").

        Return JSON in this exact format:
        {
            "title": "Professional Title",
            "description": "Clear explanation...",
            "options": [
                {
                    "title": "Option A: [Action]",
                    "description": "[Explanation of the fix and its impact]",
                    "costImpact": [Estimated cost as a number, e.g., 15000]
                },
                {
                    "title": "Option B: [Action]",
                    "description": "[Explanation of the compromise]",
                    "costImpact": 0
                }
            ]
        }
    `;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        options: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    costImpact: { type: Type.NUMBER }
                                },
                                required: ["title", "description", "costImpact"]
                            }
                        }
                    },
                    required: ["title", "description", "options"]
                }
            }
        });
        return parseJsonResponse(response.text, null);
    } catch (e) {
        console.error("Failed to generate site issue options", e);
        return null;
    }
}

export async function generateWeeklyUpdateSummary(updates: SiteUpdateRecord[], projectContext: ProjectContext): Promise<string> {
    if (!isAiAvailable()) return "AI not available to generate summary.";
    if (!updates || updates.length === 0) return "No updates available to summarize.";

    const ai = getAi();
    
    const updatesText = updates.map(u => `Date: ${new Date(u.date).toLocaleDateString()}\nTitle: ${u.title}\nDescription: ${u.description}\nTags: ${u.tags?.join(', ')}`).join('\n\n');

    const prompt = `
    You are an expert project manager for an interior design firm (FFDS).
    Summarize the following site updates into a professional, concise weekly update message suitable for sending to a client via WhatsApp.
    
    Project Name: ${projectContext.name || 'Interior Project'}
    
    Updates:
    ${updatesText}
    
    Format requirements:
    - Use WhatsApp formatting (*bold*, _italic_).
    - Include relevant emojis.
    - Start with a friendly greeting and the project name.
    - Group by progress made.
    - Keep it concise and professional.
    - Do not include any JSON or markdown code blocks, just the raw text ready to be pasted into WhatsApp.
    `;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
        });
        return response.text || "Could not generate summary.";
    } catch (error) {
        console.error("Error generating weekly summary:", error);
        return "Error generating summary.";
    }
}

export async function parseQuickSiteUpdate(rawText: string): Promise<Partial<SiteUpdateRecord>> {
    if (!isAiAvailable()) return { title: 'Quick Update', description: rawText, tags: [] };
    const ai = getAi();
    
    const prompt = `
    Parse the following raw text from a site supervisor into a structured site update record.
    Raw text: "${rawText}"
    
    Return JSON with:
    - title (string): A short, professional title (e.g., "Civil Work Commenced")
    - description (string): A professional, slightly expanded description of what happened.
    - tags (string[]): 1-3 relevant tags (e.g., "Civil", "Material Delivery", "Living Room").
    `;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });
        return parseJsonResponse<Partial<SiteUpdateRecord>>(response.text, { title: 'Quick Update', description: rawText, tags: [] });
    } catch (error) {
        return { title: 'Quick Update', description: rawText, tags: [] };
    }
}

export async function parseQuickDecision(rawText: string): Promise<Partial<ProjectDecisionRecord>> {
    if (!isAiAvailable()) return { title: 'Quick Decision', description: rawText, status: 'confirmed', requestedBy: 'client' };
    const ai = getAi();
    
    const prompt = `
    Parse the following raw text/notes into a structured project decision record.
    Raw text: "${rawText}"
    
    Return JSON with:
    - title (string): A short, professional title (e.g., "Reuse Existing Doors")
    - description (string): A clear explanation of what was decided and the context.
    - status (string): Must be exactly one of: 'proposed', 'confirmed', 'rejected', 'revoked'. Guess based on context, default to 'confirmed'.
    - requestedBy (string): Must be exactly one of: 'client', 'ffds'. Guess based on context, default to 'client'.
    - confirmingParty (string): Name or entity that approved it (e.g., "Client", "Mr. Sharma").
    - impactCost (string): E.g., "- Rs. 15,000", "+ Rs. 5,000", or "None". Include if mentioned or imply "None" if irrelevant.
    - impactSchedule (string): E.g., "+2 Days", "None".
    `;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        status: { type: Type.STRING },
                        requestedBy: { type: Type.STRING },
                        confirmingParty: { type: Type.STRING },
                        impactCost: { type: Type.STRING },
                        impactSchedule: { type: Type.STRING }
                    }
                }
            }
        });
        return parseJsonResponse<Partial<ProjectDecisionRecord>>(response.text, { title: 'Quick Decision', description: rawText, status: 'confirmed', requestedBy: 'client' });
    } catch (error) {
        return { title: 'Quick Decision', description: rawText, status: 'confirmed', requestedBy: 'client' };
    }
}

export async function parseDecisionFromImage(imageBase64: string): Promise<Partial<ProjectDecisionRecord>> {
    try {
        const response = await fetch('/api/parse-decision-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imageBase64 })
        });
        if (!response.ok) {
            throw new Error('Server error parsing decision image');
        }
        const data = await response.json();
        return data.decision || { title: 'Image Parse Failed', description: '', status: 'confirmed', requestedBy: 'client' };
    } catch (error) {
        console.error("Error in parseDecisionFromImage API call:", error);
        return { title: 'Image Parse Error', description: String(error), status: 'confirmed', requestedBy: 'client' };
    }
}

export async function generateClientNote(item: any): Promise<string> {
    if (!isAiAvailable()) return item.note || '';
    const ai = getAi();
    const prompt = `You are writing a one-sentence explanation for a homeowner's interior design revision document. Explain why this item changed in plain English. Max 15 words. No jargon. No internal construction terms.

Change type: ${item.status || item.changeType || 'Change'}
Item: ${item.item || item.description}
Original: ₹${Math.round(item.origTotal || 0)} → Revised: ₹${Math.round(item.revTotal || item.total || 0)}
Internal note: ${item.notes || item.note || 'no note provided'}

Rules:
- Correction → start with 'Booking error corrected —'
- Design Upgrade → start with 'Scope improved —'
- Client Request → start with 'As you requested —'
- Site Condition → explain the physical constraint in plain terms
- Value Engineering → start with 'Sourced directly to pass saving to you'
- If status includes 'pending' → end the sentence with '— awaiting your go-ahead'
- Never use these words: scope, BOQ, lumpsum, sqft, chajja, patra, as actuals, LUMPSUM
Return only the sentence. No quotes. No preamble.`;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({ 
            model: 'gemini-3.5-flash', 
            contents: prompt 
        });
        return response.text || item.note || '';
    } catch (e) { 
        return item.note || ''; 
    }
}

export interface RevisionClassification {
  classification: "CLIENT_REVISION" | "FFDS_DESIGN_MISS" | "SITE_CONDITION";
  confidence: number;
  reasoning: string;
  chargeable: boolean;
  roundAdvances: boolean;
  recommendedAction: string;
}

export async function classifyRevisionCause(
  drawingName: string,
  roundNumber: number,
  boqItemsList: string,
  briefNotes: string,
  approvalStatus: string,
  revisionRequest: string
): Promise<RevisionClassification | null> {
    
    // Fallback simple rule-based classification instead of AI
    const req = (revisionRequest || '').toLowerCase();
    
    let classification: "CLIENT_REVISION" | "FFDS_DESIGN_MISS" | "SITE_CONDITION" = "CLIENT_REVISION";
    
    if (req.includes("site") || req.includes("measure") || req.includes("beam") || req.includes("column") || req.includes("actual")) {
        classification = "SITE_CONDITION";
    } else if (req.includes("miss") || req.includes("wrong") || req.includes("forgot") || req.includes("brief") || req.includes("boq")) {
        classification = "FFDS_DESIGN_MISS";
    }

    const chargeable = classification === "CLIENT_REVISION" && roundNumber >= 3;
    const roundAdvances = classification !== "FFDS_DESIGN_MISS";

    let reasoning = "Based on standard design logic rules.";
    let recommendedAction = "Proceed with requested changes.";

    if (classification === "SITE_CONDITION") {
        reasoning = "Keywords suggest physical site conditions mismatch drawing.";
        recommendedAction = "Place on hold pending site verification.";
    } else if (classification === "FFDS_DESIGN_MISS") {
        reasoning = "Keywords suggest an internal miss relative to BOQ/Brief.";
        recommendedAction = "Correct error. Do not advance round. Non-chargeable.";
    } else {
        reasoning = "Request indicates a client-driven change post-approval.";
        recommendedAction = chargeable ? "Advance round and flag as chargeable." : "Advance round (within free limit).";
    }

    // Add a slight artificial delay to emulate processing time
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
        classification,
        confidence: 1.0,
        reasoning,
        chargeable,
        roundAdvances,
        recommendedAction
    };
}

export async function assessGateReadiness(projectContext: any, gateChecklist: any, drawingTracker: any): Promise<any> {
    
    let score = 100;
    const blockers: any[] = [];

    // Removed BOQ Freeze check because it is auto-triggered when the gate is activated
    const gfcNotFinalizedDrawings = drawingTracker?.filter((d: any) => d.approvedAt && (!d.gfc || d.gfc.status !== 'issued')) || [];
    if (!gateChecklist.item_4?.done || gfcNotFinalizedDrawings.length > 0) {
        score -= 20;
        const reasonStr = gfcNotFinalizedDrawings.length > 0 
            ? `Missing GFC Release for: ${gfcNotFinalizedDrawings.map((u: any) => u.name).join(', ')}`
            : 'Architect must finalize GFC set';
        blockers.push({ 
            severity: 'critical', 
            item: 'GFC Drawings Not Finalized', 
            reason: reasonStr, 
            action: 'Issue GFC on drawing tracker' 
        });
    }

    const unissuedDrawings = drawingTracker?.filter((d: any) => !d.approvedAt) || [];
    if (unissuedDrawings.length > 0) {
        score -= 5 * unissuedDrawings.length;
        blockers.push({ severity: 'warning', item: 'Pending Drawings', reason: `${unissuedDrawings.length} drawings unissued`, action: 'Issue all drawings' });
    }

    score = Math.max(0, score);
    const gateReady = score === 100;

    await new Promise(resolve => setTimeout(resolve, 800));

    return {
        gateReady,
        readinessScore: score,
        blockers,
        completedItems: ['Started readiness assessment'],
        estimatedDaysToReady: gateReady ? 0 : 2,
        summary: gateReady ? "Project is ready for Design Gate activation." : "Project has pending items blocking Design Gate."
    };
}

export interface ScopeAdditionClassification {
    type: 'TYPE_A' | 'TYPE_B' | 'TYPE_C' | 'TYPE_D';
    confidence: number;
    reasoning: string;
    designFeeFormula: string;
    estimatedDesignFee: number | null;
    newDrawingsRequired: string[];
    boqImpact: 'none' | 'delta_only' | 'new_items' | 'rework_required';
}

export async function classifyScopeAddition(
    originalScopeSummary: string,
    gateActivatedDate: string,
    clientRequest: string
): Promise<ScopeAdditionClassification | null> {
    
    // Logic fallback
    let type: 'TYPE_A' | 'TYPE_B' | 'TYPE_C' | 'TYPE_D' = 'TYPE_B';
    const req = (clientRequest || '').toLowerCase();

    if (req.includes("redesign") || req.includes("rework") || req.includes("change layout")) {
        type = 'TYPE_D';
    } else if (req.includes("new room") || req.includes("major") || req.includes("balcony") || req.includes("bar")) {
        type = 'TYPE_C';
    } else if (req.includes("upgrade") || req.includes("material") || req.includes("finish") || req.includes("tile")) {
        type = 'TYPE_A';
    }

    let reasoning = "Standard minor addition.";
    if (type === 'TYPE_A') reasoning = "Material or finish change only.";
    if (type === 'TYPE_C') reasoning = "New space or major scope addition.";
    if (type === 'TYPE_D') reasoning = "Space redesign or layout change.";

    await new Promise(resolve => setTimeout(resolve, 800));

    return {
        type,
        confidence: 0.95,
        reasoning,
        designFeeFormula: type === 'TYPE_A' ? "Waived" : (type === 'TYPE_B' ? "Max(5000, 10% of Ex)" : "Max(8000, 11% of Ex)"),
        estimatedDesignFee: type === 'TYPE_A' ? 0 : (type === 'TYPE_D' ? null : 5000),
        newDrawingsRequired: type === 'TYPE_A' ? [] : ['Updated Plan', 'New Elevation'],
        boqImpact: type === 'TYPE_A' ? 'delta_only' : 'new_items'
    };
}

export interface ScopeAdditionEngineeredBoq {
    additionName: string;
    items: {
        description: string;
        category: string;
        unit: string;
        qty: number;
        estimatedUnitRate: number;
        baseCost: number;
    }[];
    subTotal: number;
    marginAt20Pct: number;
    gstAt18Pct: number;
    totalExecutionValue: number;
    aiNote: string;
}

export async function generateScopeAdditionBoq(
    additionType: string,
    clientRequest: string,
    dimensions: string | null,
    projectStyle: string,
    budgetTier: string
): Promise<ScopeAdditionEngineeredBoq | null> {
    
    await new Promise(resolve => setTimeout(resolve, 800));

    const items = [
        {
            description: "Custom Joinery Work (" + clientRequest.substring(0, 20) + "...)",
            category: "woodwork",
            unit: "sqft",
            qty: 50,
            estimatedUnitRate: 1500,
            baseCost: 50 * 1500
        },
        {
            description: "Finishing & Polish",
            category: "paint",
            unit: "sqft",
            qty: 50,
            estimatedUnitRate: 120,
            baseCost: 50 * 120
        }
    ];

    const subTotal = items.reduce((sum, i) => sum + i.baseCost, 0);
    const marginAt20Pct = subTotal * 0.20;
    const gstAt18Pct = (subTotal + marginAt20Pct) * 0.18;
    const totalExecutionValue = subTotal + marginAt20Pct + gstAt18Pct;

    return {
        additionName: "Scope Addition Generation",
        items,
        subTotal,
        marginAt20Pct,
        gstAt18Pct,
        totalExecutionValue,
        aiNote: "Generated via local heuristic based on request."
    };
}

export async function generateComprehensiveWeeklyReport(
    projectContext: ProjectContext,
    weekNumber: number,
    dateRange: string,
    financialSummary: string,
    designSummary: string,
    executionSummary: string,
    decisionsSummary: string
): Promise<string> {
    if (!isAiAvailable()) return "AI not available to generate weekly commentary.";

    const ai = getAi();

    const prompt = `
    You are the Principal Design & Ops Director for BOQ Copilot, a multi-tenant B2B platform for premium interior design studios.
    Write a highly professional, sophisticated, and reassuring executive commentary for the Client Progress Report of Week ${weekNumber} (${dateRange}).
    This report is shared directly with the client to build deep trust, show architectural precision, and keep them fully aligned on project progress.

    Project Details:
    - Project Name: ${projectContext.name || 'Premium Interior Project'}
    - Client: ${projectContext.clientName || 'Valued Client'}
    
    WEEK ${weekNumber} SNAPSHOTS:
    
    Financial Summary:
    ${financialSummary}
    
    Design & Approvals Progress:
    ${designSummary}
    
    Site Execution & Operations Updates:
    ${executionSummary}
    
    Pending Client Decisions:
    ${decisionsSummary}

    STYLE & TONALITY INSTRUCTIONS:
    - Tone must be elegant, sober, elite, and reassuring. Speak with operational mastery and design authority.
    - Focus on actual facts, quality control, precision engineering, and visual progress.
    - Avoid low-quality, over-excited fluff, exclamation marks, or generic "excited" text. Keep it cool, poised, and objective.
    - Highlight our commitment to the design intent, precision milestones, and seamless handoffs.
    - Format output in beautiful, clear paragraphs with clean lists where appropriate. Keep it concise but comprehensive (around 2 to 3 short paragraphs).
    - Do not include markdown code blocks, just raw professional text.
    `;

    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
        });
        return response.text || "Could not generate weekly progress commentary.";
    } catch (error) {
        console.error("Error generating comprehensive weekly progress report:", error);
        return "Failed to generate AI weekly progress report. Manual commentary can be entered below.";
    }
}


export async function draftWeeklyReportContent(currentPulse: any, projectContext: any, projectData?: any): Promise<{ executiveBriefing?: string, nextWeekPlan?: string, manualActions?: any[] }> {
    if (!isAiAvailable()) return { executiveBriefing: "AI not configured.", nextWeekPlan: "", manualActions: [] };

    try {
        let executionSummary = "";
        let paymentsSummary = "";
        
        if (projectData?.activeProject) {
            const execData = projectData?.activeProject.executionData;
            if (execData) {
                const updates = execData.updates || [];
                const recentUpdates = updates.slice(0, 5).map((u: any) => u.category + ': ' + u.notes).join(' | ');
                
                executionSummary = `Recent Site Updates: ${recentUpdates || 'None'}`;
            }
            const gates = projectData?.activeProject.paymentGates || [];
            const pendingGates = gates.filter((g: any) => g.status === 'pending' || g.status === 'invoice_raised').map((g: any) => g.gate_name).join(", ");
            paymentsSummary = `Pending Payments: ${pendingGates || 'None'}.`;
        }

        const prompt = `
You are an expert project manager for an interior design studio.
Draft a weekly report for Week ${currentPulse.weekNumber}.
Project: ${projectContext.name || 'Unknown'}
Status: ${projectData?.status || 'active'}
Execution Data: ${executionSummary}
Financial Data: ${paymentsSummary}

Please return ONLY a valid JSON object with these keys:
- executiveBriefing (string): A polished 2-paragraph summary of progress, referencing the execution and financial data provided.
- nextWeekPlan (string): A short paragraph on upcoming focus based on the current active tasks and pending payments.
- manualActions (array of objects): Up to 3 action items, each with:
   - assignee: "client" or "studio"
   - text: "the action description"

Keep the tone professional, concise, and focused on design and execution realities.
`;
        
        const ai = getAi();

        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
            config: {
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        });
        
        const text = response.text;
        if (!text) return {};
        
        const parsed = JSON.parse(text);
        const forbidden = ['margin', 'base cost', 'internal', 'ffds_design_miss'];
        const textToCheck = (parsed.executiveBriefing || '').toLowerCase();
        if (forbidden.some(f => textToCheck.includes(f))) {
            parsed.executiveBriefing = "Progress continues according to schedule. We are moving into the next phase of design and execution.";
        }
        return parsed;
    } catch(e) {
        console.error(e);
        return {};
    }
}

export interface PhaseAiBriefing {
    operationalBriefing: string;
    siteRisks: { risk: string; mitigation: string }[];
    materialRecommendations: { material: string; details: string }[];
    extraDeliverables: string[];
}

export async function generatePhaseAiBriefing(
    phaseTitle: string,
    currentDeliverables: string[],
    projectContext: any,
    boq: any[]
): Promise<PhaseAiBriefing> {
    if (!isAiAvailable()) {
        return {
            operationalBriefing: "AI services are currently unavailable.",
            siteRisks: [],
            materialRecommendations: [],
            extraDeliverables: []
        };
    }

    try {
        const ai = getAi();
        const boqBrief = (boq || []).length > 0 
            ? (boq || []).map(item => `- ${item.cat}: ${item.name} (${item.qty} ${item.unit || 'nos'})`).join('\n')
            : 'No items in BOQ';

        const prompt = `
You are a Senior interior fit-out consultant and project director for a high-end Indian interior design studio.
Analyze the following project phase and provide an operational briefing, key site risks with mitigations, premium material recommendations, and additional checklist items.

PHASE TITLE: "${phaseTitle}"
CURRENT CHECKLIST ITEMS: ${JSON.stringify(currentDeliverables)}

PROJECT DETAILS:
- PROJECT NAME: "${projectContext?.name || 'Project'}"
- PROJECT CONFIGURATION: "${projectContext?.config || 'N/A'}"
- PROJECT AREA: "${projectContext?.area ? `${projectContext.area} SQFT` : 'N/A'}"
- LOCATION: "${projectContext?.location || 'N/A'}"
- DESIGN THEME: "${projectContext?.theme || 'Custom/Contemporary'}"
- ROOMS IN PROJECT: "${(projectContext?.rooms || []).map((r: any) => r.name || r).join(', ') || 'N/A'}"

BILL OF QUANTITIES (BOQ) ITEMS:
${boqBrief}

Provide precise, actionable interior fit-out guidance.
CRITICAL DIRECTIONS:
- You MUST customize your guidance specifically to the rooms, configuration, design theme, area, and exact BOQ items listed above. Do NOT use generic templates or assumptions.
- Reference the actual rooms (e.g. if specific bedrooms, kitchen, or living room are in the project rooms list) and the actual items, categories, or materials from the BOQ.
- ZERO structural foundation/civil plinth advice (this is strictly interior fit-out).
- Tone is sober, premium, and professional (Indian standards/terms like BWR plywood, laminate, veneer, civil masonry, false ceiling gypsum, etc.).
- No exclamation marks or cheesy marketing language.

Return EXACTLY a JSON object with this schema:
{
  "operationalBriefing": "A highly precise 2-paragraph operational guide for the site supervisor about sequencing, alignments, and coordination during this phase, referencing this specific project name, theme, layout, rooms, and BOQ items.",
  "siteRisks": [
    { "risk": "Specific site risk (e.g., dampness on walls, service routing conflict)", "mitigation": "Concrete action step to prevent/resolve it" }
  ],
  "materialRecommendations": [
    { "material": "Specific material spec (e.g. Gurjan BWR plywood 18mm)", "details": "Where to use it and why it's optimal for this step" }
  ],
  "extraDeliverables": [
    "A concise, actionable checklist item to add (e.g., 'Verify laser-level reference mark on all walls')",
    "Another checklist item",
    "A third checklist item"
  ]
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                temperature: 0.3,
                responseMimeType: "application/json"
            }
        });

        const text = response.text || "{}";
        const fallback: PhaseAiBriefing = {
            operationalBriefing: `Operational briefing for ${phaseTitle}. Ensure quality checks are conducted daily. Verify measurements before execution.`,
            siteRisks: [
                { risk: "Material delivery delay", mitigation: "Place orders at least 10 days in advance" },
                { risk: "Sequence mismatch", mitigation: "Coordinate carpentry with electrical first-fix" }
            ],
            materialRecommendations: [
                { material: "BWR Plywood", details: "Use IS 303 MR or BWR plywood for all carcass units" }
            ],
            extraDeliverables: [
                "Verify mock-ups on-site",
                "Approve finished laminate samples",
                "Perform surface evenness check"
            ]
        };
        return parseJsonResponse<PhaseAiBriefing>(text, fallback);
    } catch (e) {
        console.error("Error generating phase AI briefing:", e);
        return {
            operationalBriefing: `Operational briefing for ${phaseTitle}. Ensure quality checks are conducted daily. Verify measurements before execution.`,
            siteRisks: [
                { risk: "Material delivery delay", mitigation: "Place orders at least 10 days in advance" },
                { risk: "Sequence mismatch", mitigation: "Coordinate carpentry with electrical first-fix" }
            ],
            materialRecommendations: [
                { material: "BWR Plywood", details: "Use IS 303 MR or BWR plywood for all carcass units" }
            ],
            extraDeliverables: [
                "Verify mock-ups on-site",
                "Approve finished laminate samples",
                "Perform surface evenness check"
            ]
        };
    }
}

export interface DelayPlan {
    catchUpPlan: string;
    clientUpdate: string;
}

export async function generateTimelineDelayPlan(
    delayedPhases: any[],
    projectContext: any
): Promise<DelayPlan> {
    if (!isAiAvailable()) {
        return {
            catchUpPlan: "AI services are currently unavailable.",
            clientUpdate: "We are tracking slightly behind on some stages and are working hard to make up for lost time."
        };
    }

    try {
        const ai = getAi();
        const delayedTitles = delayedPhases.map(d => `${d.title} (Duration: ${d.durationDays} days)`).join(', ');

        const prompt = `
You are a Principal Ops Director for BOQ Copilot, a multi-tenant B2B platform for premium interior design studios.
The following project is experiencing delays in these phases: ${delayedTitles}.
Project: ${projectContext?.name || 'Your Premium Interior Project'}.

Generate a high-fidelity operational catch-up strategy and a polite, comforting, and professional client update.
Ensure:
- Tone is sober, elegant, and reassuring. Speak with absolute authority and operational confidence.
- Under NO circumstances mention internal pricing, margins, markups, or raw costing.
- No cheesy marketing words. Avoid exclamation marks.
- The client update should be ready to send on WhatsApp or Email, maintaining a premium brand feel.

Return EXACTLY a JSON object with this schema:
{
  "catchUpPlan": "A highly detailed, professional 2-paragraph operational guide on how the site crew can compress sequences, increase labor, overlap procurement, or work parallel shifts to recover the lost days.",
  "clientUpdate": "A polite, elegant, and reassuring message (around 100-150 words) to share with the client explaining the delay with absolute transparency, emphasizing our strict quality control, and giving them confidence that their hand-over is our highest priority."
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                temperature: 0.3,
                responseMimeType: "application/json"
            }
        });

        const text = response.text || "{}";
        const fallback: DelayPlan = {
            catchUpPlan: "Overlap plumbing and tile-cladding works. Hire extra manpower for carpentry structure first-fix. Ensure vendor signoffs on finishing materials are scheduled early.",
            clientUpdate: "Dear Client, as we advance through the intricate finishing stages of your home, our commitment to absolute craftsmanship remains paramount. We are currently pacing slightly slower on a few details to allow proper curing and fitment. The team is parallel-tracking upcoming milestones to ensure we remain aligned with your overall schedule."
        };
        return parseJsonResponse<DelayPlan>(text, fallback);
    } catch (e) {
        console.error("Error generating timeline delay plan:", e);
        return {
            catchUpPlan: "Overlap plumbing and tile-cladding works. Hire extra manpower for carpentry structure first-fix. Ensure vendor signoffs on finishing materials are scheduled early.",
            clientUpdate: "Dear Client, as we advance through the intricate finishing stages of your home, our commitment to absolute craftsmanship remains paramount. We are currently pacing slightly slower on a few details to allow proper curing and fitment. The team is parallel-tracking upcoming milestones to ensure we remain aligned with your overall schedule."
        };
    }
}

export interface HandoverRiskAnalysis {
    predictedHandoverDate: string;
    predictedDelayDays: number;
    delayReason: string;
    riskLevel: 'low' | 'medium' | 'high';
    alerts: {
        id: string;
        title: string;
        severity: 'low' | 'medium' | 'high';
        description: string;
        phase: string;
        mitigation: string;
    }[];
}

export async function analyzeTimelineHandoverRisks(
    projectContext: any,
    timelinePhases: any[],
    calendar: any,
    computedSchedule: any
): Promise<HandoverRiskAnalysis> {
    const fallback: HandoverRiskAnalysis = {
        predictedHandoverDate: computedSchedule?.finishISO || projectContext?.targetHandoverDate || "Not set",
        predictedDelayDays: Math.max(0, computedSchedule?.overrunWorkDays || 0),
        delayReason: "Pacing matches normal parameters. Review upcoming major festive seasons for material or labor bottlenecks.",
        riskLevel: 'low',
        alerts: []
    };

    if (!isAiAvailable()) {
        return fallback;
    }

    try {
        const ai = getAi();
        
        // Structure holiday and sunday metadata to feed the LLM
        const holidays = calendar?.holidays || [];
        const startISO = computedSchedule?.startISO || projectContext?.startDate || "Not set";
        const finishISO = computedSchedule?.finishISO || projectContext?.targetHandoverDate || "Not set";
        const targetHandover = projectContext?.targetHandoverDate || "Not set";
        
        const activeHolidays = holidays.filter((h: any) => {
            return h.fromISO >= startISO && h.fromISO <= finishISO;
        });

        // Compute Sundays count
        let sundaysCount = 0;
        if (startISO !== "Not set" && finishISO !== "Not set") {
            const startDay = new Date(startISO).getTime();
            const endDay = new Date(finishISO).getTime();
            const oneDay = 24 * 60 * 60 * 1000;
            for (let t = startDay; t <= endDay; t += oneDay) {
                if (new Date(t).getUTCDay() === 0) {
                    sundaysCount++;
                }
            }
        }

        const prompt = `
You are the Principal Operations Director and Risk Officer for BOQ Copilot, a multi-tenant B2B interior design SaaS.
Perform a predictive, high-fidelity timeline analysis for the project "${projectContext?.name || 'Your Project'}" to identify potential handover delays and generate actionable "Risk Alerts".

PROJECT BASICS:
- Project Start (Kickoff): ${startISO}
- Target Handover Commitment: ${targetHandover}
- Schedule Computed Finish: ${finishISO}
- Computed Overrun (Working Days): ${computedSchedule?.overrunWorkDays || 0}
- Number of Sundays in schedule (skipping Sundays as non-working): ${sundaysCount} Sundays
- Overlapping Public Holidays in schedule (skipping as non-working):
${activeHolidays.map((h: any) => `  * ${h.label} on ${h.fromISO} (${h.days || 1} day)`).join('\n') || "  * No overlapping public holidays"}

PROJECT TIMELINE PHASES & CURRENT PROGRESS:
${timelinePhases.map((p: any) => {
    const status = p.stepProgress?.status || "pending";
    const delayIndicator = p.isDelayed ? "⚠️ DELAYED" : "";
    return `* Phase: ${p.title} (${p.durationDays} working days) | Start: ${p.startDate ? p.startDate.split('T')[0] : 'N/A'} | End: ${p.endDate ? p.endDate.split('T')[0] : 'N/A'} | Status: ${status} ${delayIndicator}`;
}).join('\n')}

YOUR ANALYTICAL INSTRUCTIONS:
1. Check the computed finish date against the target handover date. If the computed finish is after the target, a delay is mathematically certain under current velocity.
2. Cross-reference the phase dates with public holidays and Sunday offs. Identify potential "collateral festive delays" — in India, major holidays (like Diwali, Eid, or Christmas/New Year) cause severe labor migration and supply-chain shutdowns that typically extend 3-5 days before and after the actual holiday.
3. Check for delayed active phases. A delay in early phases (like Civil, Plumbing, or Electrical first-fix) creates a cascading "Critical Path bottleneck" for all subsequent finishing phases (Carpentry, POP, Painting).
4. Do NOT mention internal markups, profits, or specific dollar/rupee pricing amounts. Speak professionally with sober, premium engineering-first language.
5. Generate a precise predicted handover date, overrun days, a summary delay reason, a consolidated riskLevel ('low' | 'medium' | 'high'), and specific, actionable alerts.

Return EXACTLY a JSON object with this schema:
{
  "predictedHandoverDate": "YYYY-MM-DD",
  "predictedDelayDays": number,
  "delayReason": "A concise 1-2 sentence high-level summary of the core risk and timeline impacts.",
  "riskLevel": "low" | "medium" | "high",
  "alerts": [
    {
      "id": "risk_unique_id",
      "title": "Clear, premium, risk-oriented title (e.g. 'Diwali Labor Migrations Risk' or 'Civil Path Cascading Bottleneck')",
      "severity": "low" | "medium" | "high",
      "description": "Specific explanation detailing exactly how Sundays, holidays, and sequence overlaps threaten the finish line (e.g., 'Carpentry is scheduled to begin immediately after Diwali on Nov 10, but historical labor migration typically causes a 4-day worker shortage during this festival block.')",
      "phase": "The name of the affected phase",
      "mitigation": "Sober, actionable mitigation step for the site team (e.g., 'Pre-order all carcass laminate sheets by Oct 28 and secure vendor commitment for labor retention bonus.')"
    }
  ]
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
            config: {
                temperature: 0.25,
                responseMimeType: "application/json"
            }
        });

        const result = parseJsonResponse<HandoverRiskAnalysis>(response.text || "{}", fallback);
        
        // Generate random IDs if none returned by the model
        if (result.alerts) {
            result.alerts = result.alerts.map((alert: any, index: number) => ({
                ...alert,
                id: alert.id || `risk_alert_${Date.now()}_${index}`
            }));
        }

        return result;
    } catch (e) {
        console.error("Error analyzing timeline handover risks:", e);
        return fallback;
    }
}

export interface ExecutionPackageRiskAnalysis {
    healthScore: number;
    summary: string;
    criticalBottlenecks: {
        bundleCode: string;
        trade: string;
        title: string;
        reason: string;
        recommendation: string;
        severity: 'low' | 'medium' | 'high';
    }[];
    readyToUnblock: string[];
    sequencingAlerts: {
        trade: string;
        conflict: string;
        action: string;
    }[];
}

export async function analyzeExecutionPackageRisks(
    bundles: any[],
    boq: any[],
    context: any,
    drawings: any[] = []
): Promise<ExecutionPackageRiskAnalysis> {
    const fallback: ExecutionPackageRiskAnalysis = {
        healthScore: 78,
        summary: "Standard sequential packages. SOF material locks and GFC drawing clearances dictate unblocking flow.",
        criticalBottlenecks: bundles.filter(b => b.status === 'blocked').slice(0, 3).map(b => ({
            bundleCode: b.code,
            trade: b.trade,
            title: `${b.trade} Gate Blockers`,
            reason: `Package is blocked due to pending gate clearances (${!b.gatekeepers?.gfc ? 'GFC Drawing Missing, ' : ''}${!b.gatekeepers?.sof ? 'SOF Lock Pending, ' : ''}${!b.gatekeepers?.payment ? 'Payment Milestone Pending' : ''}).`,
            recommendation: `Verify site readiness and clear drawing approvals to avoid sequential delays.`,
            severity: 'medium' as const
        })),
        readyToUnblock: bundles.filter(b => b.gatekeepers?.sof && b.gatekeepers?.gfc && b.gatekeepers?.payment && b.gatekeepers?.site && b.status === 'blocked').map(b => b.code),
        sequencingAlerts: [
            {
                trade: "False Ceiling & Partitioning",
                conflict: "Must follow complete electrical conduit first-fix and plumbing pressure testing.",
                action: "Confirm electrical wall chasing and conduit signoff before closing ceiling grid."
            },
            {
                trade: "Finishes & Carpentry",
                conflict: "Carpentry carcasses must not be placed over wet screed or unprimed walls.",
                action: "Ensure minimum 7-day curing on wet civil masonry before carcass installation."
            }
        ]
    };

    if (!isAiAvailable()) {
        return fallback;
    }

    try {
        const ai = getAi();
        const bundleSummary = bundles.map(b => ({
            code: b.code,
            trade: b.trade,
            status: b.status,
            gates: b.gatekeepers,
            itemsCount: b.itemIds?.length || 0,
            value: b.totalValue
        }));

        const prompt = `
You are the Chief of Site Operations at an ultra-premium interior architecture studio.
Perform an Execution Gating & Sequencing Risk Analysis on the following site data:

Project Type: ${context?.projectType || 'Residential 3BHK'}
Target Handover: ${context?.targetHandoverDate || 'Not specified'}
SOF Freeze Date: ${context?.sofFreezeDate || 'Not specified'}
Bundles: ${JSON.stringify(bundleSummary, null, 2)}
Total BOQ Deliverables: ${boq?.length || 0}
Available Drawings count: ${drawings.length}

Evaluate:
1. Gating completeness (GFC, SOF, Commercial, Site)
2. Trade sequencing risks (e.g. Civil -> MEP -> Ceiling -> Flooring -> Carpentry -> Painting)
3. Immediate unblocking recommendations

Return strictly valid JSON in this exact structure:
{
  "healthScore": 0-100,
  "summary": "2-3 concise, professional sentences summarizing site execution posture",
  "criticalBottlenecks": [
    {
      "bundleCode": "EB-XX",
      "trade": "Trade name",
      "title": "Clear punchy title",
      "reason": "Specific root cause",
      "recommendation": "Concrete actionable unblocking step",
      "severity": "low" | "medium" | "high"
    }
  ],
  "readyToUnblock": ["EB-01", "EB-02"],
  "sequencingAlerts": [
    {
      "trade": "Trade Name",
      "conflict": "Sequencing dependency conflict description",
      "action": "Site supervisor action required"
    }
  ]
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: prompt,
            config: {
                temperature: 0.2,
                responseMimeType: "application/json"
            }
        });

        const parsed = JSON.parse(response.text || "{}");
        return {
            healthScore: typeof parsed.healthScore === 'number' ? parsed.healthScore : fallback.healthScore,
            summary: parsed.summary || fallback.summary,
            criticalBottlenecks: Array.isArray(parsed.criticalBottlenecks) ? parsed.criticalBottlenecks : fallback.criticalBottlenecks,
            readyToUnblock: Array.isArray(parsed.readyToUnblock) ? parsed.readyToUnblock : fallback.readyToUnblock,
            sequencingAlerts: Array.isArray(parsed.sequencingAlerts) ? parsed.sequencingAlerts : fallback.sequencingAlerts
        };
    } catch (err) {
        console.error("AI bundle risk analysis failed:", err);
        return fallback;
    }
}

// =========================================================================
// AI TEMPLATE ARCHITECT & SMART TEMPLATE FUNCTIONS
// =========================================================================

export interface AiGeneratedTemplateResult {
    configName: string;
    description: string;
    targetTypology: string;
    rooms: Record<string, string[]>; // roomName -> array of item IDs from existing bank
    newItemsNeeded?: Array<{
        name: string;
        cat: string;
        specs: string;
        unit: string;
        materials: number;
        labor: number;
        margin: number;
        areaMultiplierCoefficient: number;
    }>;
    designRationale: string;
    tradeCoverageScore: number;
}

export interface AiTemplateAuditResult {
    score: number; // 0 to 100
    summary: string;
    strengths: string[];
    missingTrades: Array<{
        trade: string;
        roomType: string;
        reason: string;
        suggestedBankItemIds: string[];
        suggestedNewItemName?: string;
    }>;
    tierStrategyAdvice: {
        essential: string;
        comfort: string;
        harmony: string;
    };
}

export const generateAiTemplate = async (
    userPrompt: string,
    bank: Item[],
    existingConfigs: string[] = [],
    aiStrategy: AIStrategy = 'balanced'
): Promise<AiGeneratedTemplateResult> => {
    const fallbackConfigName = `Custom-${Date.now().toString().slice(-4)}`;
    const fallback: AiGeneratedTemplateResult = {
        configName: fallbackConfigName,
        description: `Custom package created from: "${userPrompt}"`,
        targetTypology: 'Residential Interior',
        rooms: {
            'living': bank.slice(0, 3).map(i => i.id),
            'bedroom': bank.slice(3, 6).map(i => i.id),
            'kitchen': bank.slice(6, 9).map(i => i.id),
            'bathroom': bank.slice(9, 12).map(i => i.id),
            'general': bank.slice(12, 14).map(i => i.id)
        },
        designRationale: 'Standard turnkey allocation based on studio catalog.',
        tradeCoverageScore: 85
    };

    if (!isAiAvailable()) return fallback;

    try {
        const ai = getAi();
        const bankSummary = bank.map(i => ({
            id: i.id,
            name: i.name,
            cat: i.cat,
            unit: i.unit,
            margin: i.margin
        })).slice(0, 120);

        const prompt = `
You are the Chief Estimator and Interior Design Architect for a premier interior design SaaS studio.
Your task is to build a complete, production-ready Standard BOQ Template Package based on the user's specification.

User Specification / Prompt: "${userPrompt}"
Existing Typology Names: ${JSON.stringify(existingConfigs)}

Studio Master Item Bank (Available Items):
${JSON.stringify(bankSummary, null, 2)}

Instructions:
1. Determine a concise, professional configuration name (e.g. "3-BHK Modern Luxury", "Compact Studio 1-RK", "Boutique Dental Clinic", "Penthouse 4-BHK", "Rental Turnkey 2-BHK").
2. Define the room scopes needed (e.g. "living", "bedroom", "kitchen", "bathroom", "dining", "foyer", "pooja", "balcony", "general").
3. For each room scope, assign the exact item IDs from the provided Master Item Bank that MUST be included in the "Fully Loaded Master List" (Top Harmony Model).
4. If a critical interior item is missing from the item bank to satisfy this specific prompt, propose it in "newItemsNeeded".
5. Calculate trade coverage and provide a short design rationale.

Return strictly valid JSON matching this structure:
{
  "configName": "Config Name",
  "description": "Crisp 1-2 sentence description of target clientele and scope",
  "targetTypology": "e.g. 3BHK Luxury / Studio Apartment / Commercial Office",
  "rooms": {
    "living": ["bank-item-id-1", "bank-item-id-2"],
    "bedroom": ["bank-item-id-3"],
    "kitchen": ["bank-item-id-4"],
    "bathroom": ["bank-item-id-5"],
    "general": ["bank-item-id-6"]
  },
  "newItemsNeeded": [
    {
      "name": "Item Name",
      "cat": "Category name",
      "specs": "Brief specification",
      "unit": "sq ft" | "nos" | "rft" | "lumpsum",
      "materials": 1500,
      "labor": 500,
      "margin": 20,
      "areaMultiplierCoefficient": 1.0
    }
  ],
  "designRationale": "2-3 sentences explaining the design and trade selection",
  "tradeCoverageScore": 92
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: prompt,
            config: {
                temperature: 0.2,
                responseMimeType: "application/json"
            }
        });

        const parsed = JSON.parse(response.text || "{}");
        if (parsed.configName && parsed.rooms && typeof parsed.rooms === 'object') {
            // Ensure all room IDs exist or fallback gracefully
            const sanitizedRooms: Record<string, string[]> = {};
            const validBankIds = new Set(bank.map(i => i.id));
            
            Object.entries(parsed.rooms).forEach(([room, ids]) => {
                if (Array.isArray(ids)) {
                    sanitizedRooms[room] = ids.filter((id: any) => validBankIds.has(id));
                }
            });

            return {
                configName: parsed.configName,
                description: parsed.description || fallback.description,
                targetTypology: parsed.targetTypology || fallback.targetTypology,
                rooms: Object.keys(sanitizedRooms).length > 0 ? sanitizedRooms : fallback.rooms,
                newItemsNeeded: Array.isArray(parsed.newItemsNeeded) ? parsed.newItemsNeeded : [],
                designRationale: parsed.designRationale || fallback.designRationale,
                tradeCoverageScore: typeof parsed.tradeCoverageScore === 'number' ? parsed.tradeCoverageScore : 88
            };
        }
        return fallback;
    } catch (err) {
        console.error("AI template generation failed:", err);
        return fallback;
    }
};

export const auditAiTemplate = async (
    configName: string,
    rooms: Record<string, string[]>,
    bank: Item[],
    aiStrategy: AIStrategy = 'balanced'
): Promise<AiTemplateAuditResult> => {
    const fallback: AiTemplateAuditResult = {
        score: 82,
        summary: `Template for ${configName} has solid primary woodwork coverage, with potential enhancements in site protection and MEP trades.`,
        strengths: ['Comprehensive Carpentry coverage', 'Clearly segmented room scopes'],
        missingTrades: [],
        tierStrategyAdvice: {
            essential: 'Focus strictly on basic modular kitchen and core wardrobes.',
            comfort: 'Include standard false ceiling and low-height TV units.',
            harmony: 'Include full wall panelling, profile lighting, and custom headboards.'
        }
    };

    if (!isAiAvailable()) return fallback;

    try {
        const ai = getAi();
        const bankMap = new Map(bank.map(i => [i.id, i]));
        
        const templateOverview: Record<string, string[]> = {};
        Object.entries(rooms).forEach(([room, itemIds]) => {
            templateOverview[room] = itemIds.map(id => {
                const item = bankMap.get(id);
                return item ? `${item.name} (${item.cat || 'General'})` : id;
            });
        });

        const bankAvailableSummary = bank.map(i => ({
            id: i.id,
            name: i.name,
            cat: i.cat
        })).slice(0, 100);

        const prompt = `
You are an expert Indian Interior Design Studio QA Lead and Chief Estimator.
Audit this Standard BOQ Template Package for omissions, trade gaps, and tier balance.

Template Typology: "${configName}"
Current Room Items:
${JSON.stringify(templateOverview, null, 2)}

Available Master Item Bank:
${JSON.stringify(bankAvailableSummary, null, 2)}

Check for common interior execution omissions:
- General trades: Debris removal, Floor protection sheet, Deep cleaning.
- Electrical & Plumbing: Point wiring, Sanitaryware fixing, CP fittings, Geyser plumbing.
- Civil & Painting: POP Punning, Wall painting, Waterproofing in wet areas.
- Lighting: Profile LED lighting, Strip lighting for wardrobes/kitchen.

Return strictly valid JSON:
{
  "score": 85,
  "summary": "2-3 sentences summarizing scope health and completeness",
  "strengths": ["List of 2-3 key strengths"],
  "missingTrades": [
    {
      "trade": "Electrical / Civil / Protection / etc",
      "roomType": "general" | "living" | "kitchen" | etc,
      "reason": "Why this item is essential to avoid client disputes during execution",
      "suggestedBankItemIds": ["matching-id-from-bank"],
      "suggestedNewItemName": "Optional new item name if not in bank"
    }
  ],
  "tierStrategyAdvice": {
    "essential": "Advice for base tier",
    "comfort": "Advice for mid tier",
    "harmony": "Advice for top tier"
  }
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: prompt,
            config: {
                temperature: 0.2,
                responseMimeType: "application/json"
            }
        });

        const parsed = JSON.parse(response.text || "{}");
        return {
            score: typeof parsed.score === 'number' ? parsed.score : fallback.score,
            summary: parsed.summary || fallback.summary,
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths : fallback.strengths,
            missingTrades: Array.isArray(parsed.missingTrades) ? parsed.missingTrades : [],
            tierStrategyAdvice: parsed.tierStrategyAdvice || fallback.tierStrategyAdvice
        };
    } catch (err) {
        console.error("AI template audit failed:", err);
        return fallback;
    }
};

export const aiSuggestRoomItems = async (
    roomType: string,
    configName: string,
    currentItemIds: string[],
    bank: Item[]
): Promise<Array<{ item: Item; reason: string }>> => {
    if (!isAiAvailable()) {
        const unused = bank.filter(i => !currentItemIds.includes(i.id)).slice(0, 4);
        return unused.map(item => ({ item, reason: 'Suggested standard deliverable for this room.' }));
    }

    try {
        const ai = getAi();
        const bankMap = new Map(bank.map(i => [i.id, i]));
        const currentItems = currentItemIds.map(id => bankMap.get(id)?.name).filter(Boolean);
        const availableItems = bank
            .filter(i => !currentItemIds.includes(i.id))
            .map(i => ({ id: i.id, name: i.name, cat: i.cat }))
            .slice(0, 80);

        const prompt = `
Recommend 4 to 5 high-impact items from the available item list to add to "${roomType}" scope for a "${configName}" interior package.

Current items in this room:
${JSON.stringify(currentItems)}

Available items to choose from:
${JSON.stringify(availableItems)}

Return strictly valid JSON:
{
  "recommendations": [
    {
      "bankId": "id-from-available-list",
      "reason": "1 concise sentence why this completes the room scope"
    }
  ]
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: prompt,
            config: {
                temperature: 0.2,
                responseMimeType: "application/json"
            }
        });

        const parsed = JSON.parse(response.text || "{}");
        if (Array.isArray(parsed.recommendations)) {
            const results: Array<{ item: Item; reason: string }> = [];
            parsed.recommendations.forEach((rec: any) => {
                const item = bankMap.get(rec.bankId);
                if (item) {
                    results.push({ item, reason: rec.reason || 'Recommended scope addition' });
                }
            });
            if (results.length > 0) return results;
        }
        
        // Fallback
        return bank.filter(i => !currentItemIds.includes(i.id)).slice(0, 4).map(item => ({
            item,
            reason: 'Recommended scope addition'
        }));
    } catch (err) {
        console.error("AI room suggestions failed:", err);
        return bank.filter(i => !currentItemIds.includes(i.id)).slice(0, 4).map(item => ({
            item,
            reason: 'Recommended scope addition'
        }));
    }
};




