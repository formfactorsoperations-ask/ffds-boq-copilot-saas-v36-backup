
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Item, BoqItem, AIStrategy, Room, MarginSuggestion, ProjectContext, CommandAction, AggregatedCategory, FullBoqItem, QuantitySuggestion, ProposalTier, ComparisonRow, AIGeneratedBoqItem, VisionAnalysisResult, TimelinePhase, MaterialSuggestion, AiComparisonResult, AIStatus, LeadProfile, DecisionBrainOutput, ProposalWriterOutput, AuditResult, ValueEngineeringSuggestion, ProfitabilityHotspot, ProjectTask, GeneratedRender, LumpsumBreakdownItem, SiteUpdateRecord, ProjectDecisionRecord } from '../types';
import { id as generateId, formatCurrency, calculateSellPrice } from '../lib/utils';

// Helper to get the AI instance
const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable not set");
    throw new Error("AI services are unavailable. API key is missing.");
  }
  return new GoogleGenAI({ apiKey });
};

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
        // Fallback: try to extract the first valid-looking JSON object or array by balancing brackets
        try {
            const firstBrace = jsonString.indexOf('{');
            const firstBracket = jsonString.indexOf('[');
            
            let startIndex = -1;
            let isObject = false;
            
            if (firstBrace !== -1 && firstBracket !== -1) {
                if (firstBrace < firstBracket) {
                    startIndex = firstBrace;
                    isObject = true;
                } else {
                    startIndex = firstBracket;
                    isObject = false;
                }
            } else if (firstBrace !== -1) {
                startIndex = firstBrace;
                isObject = true;
            } else if (firstBracket !== -1) {
                startIndex = firstBracket;
                isObject = false;
            }
            
            if (startIndex !== -1) {
                const openChar = isObject ? '{' : '[';
                const closeChar = isObject ? '}' : ']';
                let depth = 0;
                let endIndex = -1;
                let inString = false;
                let escapeNext = false;
                
                for (let i = startIndex; i < jsonString.length; i++) {
                    const char = jsonString[i];
                    
                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }
                    
                    if (char === '\\') {
                        escapeNext = true;
                        continue;
                    }
                    
                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }
                    
                    if (!inString) {
                        if (char === openChar) {
                            depth++;
                        } else if (char === closeChar) {
                            depth--;
                            if (depth === 0) {
                                endIndex = i;
                                break;
                            }
                        }
                    }
                }
                
                if (endIndex !== -1) {
                    const extracted = jsonString.substring(startIndex, endIndex + 1);
                    return JSON.parse(extracted) as T;
                }
            }
        } catch (e2) {
            // Ignore extraction errors
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
    const fixedQty = calculateFixedQuantity(item.name, room.size);
    if (fixedQty !== null) return { qty: fixedQty, rationale: 'Calculated using FFDS Standard Formula.' };
    if (!isAiAvailable()) return { qty: 1, rationale: "AI not available." };
    const ai = getAi();
    const ceilingHeight = room.height || projectContext.ceilingHeight || 9.5;
    const prompt = `Estimate qty for item: ${item.name} (${item.unit}) in room: ${room.name} (${room.size} sqft). Context: ${projectContext.config}. Return JSON {qty, rationale}.`;
     try {
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
    try { const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt }); return response.text || "Error"; } catch (e) { return "Error"; }
}

export async function getAiCoachSuggestions(boq: BoqItem[], aggregates: any): Promise<string[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `3 actionable profitability suggestions for interior project. GM: ${aggregates.totalGm}%. Return JSON string array.`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<string[]>(response.text, []);
    } catch (e) { return []; }
}

export async function optimizeMargins(boq: FullBoqItem[], targetGm: number, strategy: AIStrategy): Promise<MarginSuggestion[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const prompt = `Optimize margins to hit ${targetGm}% GM. Strategy: ${strategy}. BOQ: ${JSON.stringify(boq.map(i => ({id: i.id, name: i.name, currentMargin: i.margin})))}. Return JSON array {itemId, itemName, currentMargin, newMargin, rationale}.`;
    try {
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
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        const rooms = parseJsonResponse<Room[]>(response.text, []);
        if (rooms.length > 0) {
            rooms.push({ name: 'Functional', size: area, unit: 'sq ft' });
            rooms.push({ name: 'Others', size: area, unit: 'sq ft' });
        }
        return rooms;
    } catch (e) { return []; }
}

export async function analyzeFloorPlan(imageBase64: string, area: number): Promise<Room[]> {
    if (!isAiAvailable()) return [];
    const ai = getAi();
    const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
    const prompt = `Analyze floor plan image. Total area ${area} sqft. Identify rooms and sizes. Return JSON array {name, size, unit:'sq ft'}.`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts: [imagePart, { text: prompt }] }, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<Room[]>(response.text, []);
    } catch (e) { return []; }
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
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse(response.text, { materialMatrix: [], scopeMatrix: [], tierSummaries: [] });
    } catch (e) { return { materialMatrix: [], scopeMatrix: [], tierSummaries: [] }; }
}

export async function processCommand(command: string, boq: BoqItem[], projectContext: ProjectContext, bank: Item[]): Promise<{ actions: CommandAction[]; summary: string; }> {
    if (!isAiAvailable()) return { actions: [], summary: "AI not available." };
    const ai = getAi();
    const prompt = `Process BOQ command: "${command}". Return JSON {actions: [], summary: string}.`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse(response.text, { actions: [], summary: "Error" });
    } catch (e) { return { actions: [], summary: "Error" }; }
}

export async function analyzeRoomImage(imageBase64: string): Promise<VisionAnalysisResult | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
    const prompt = `Analyze room image. Return JSON {roomType, observations: string[], suggestedItems: {name, category, qty, unit, rationale}[]}.`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts: [imagePart, { text: prompt }] }, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<VisionAnalysisResult>(response.text, null);
    } catch (e) { return null; }
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
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<MaterialSuggestion[]>(response.text, []);
    } catch (e) { return []; }
}

export async function generateSmartContract(tier: ProposalTier, projectContext: ProjectContext, fullBoq: FullBoqItem[], timelinePhases: TimelinePhase[]): Promise<string> {
    if (!isAiAvailable()) return "AI unavailable";
    const ai = getAi();
    const prompt = `Generate interior contract for ${projectContext.name}. Tier: ${tier.name}. Value: ${tier.summary.totalSell}. Return markdown text.`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt });
        return response.text || "Error";
    } catch (e) { return "Error"; }
}

export async function analyzeLeadStrategy(projectContext: ProjectContext, leadProfile: LeadProfile): Promise<DecisionBrainOutput | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const prompt = `Analyze lead strategy. Context: ${JSON.stringify(projectContext)}. Lead: ${JSON.stringify(leadProfile)}. Return JSON DecisionBrainOutput.`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<DecisionBrainOutput>(response.text, null);
    } catch (e) { return null; }
}

export async function generateProposalContent(projectContext: ProjectContext, brainOutput: DecisionBrainOutput, leadProfile?: LeadProfile): Promise<ProposalWriterOutput | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const prompt = `Write proposal content. Context: ${JSON.stringify(projectContext)}. Strategy: ${JSON.stringify(brainOutput)}. Return JSON ProposalWriterOutput.`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<ProposalWriterOutput>(response.text, null);
    } catch (e) { return null; }
}

export async function refineItemSpecs(itemName: string, currentSpecs: string, theme: string): Promise<string> {
    if (!isAiAvailable()) return currentSpecs;
    const ai = getAi();
    const prompt = `Refine specs for ${itemName}: ${currentSpecs}. Theme: ${theme}. Return string.`;
    try { const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt }); return response.text || currentSpecs; } catch (e) { return currentSpecs; }
}

export async function auditProject(projectContext: ProjectContext, boq: FullBoqItem[]): Promise<AuditResult | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const prompt = `Audit project BOQ. Return JSON {score, warnings[], missingItems[], suggestions[]}.`;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<AuditResult>(response.text, null);
    } catch (e) { return null; }
}

export async function chatWithProject(message: string, context: { boq: FullBoqItem[], projectContext: ProjectContext, leadProfile: LeadProfile }): Promise<string> {
    if (!isAiAvailable()) return "Service unavailable";
    const ai = getAi();
    const prompt = `Chat context: Project ${context.projectContext.name}. Message: ${message}.`;
    try { const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt }); return response.text || "Error"; } catch (e) { return "Error"; }
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
        const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
        return parseJsonResponse<ValueEngineeringSuggestion[]>(response.text, []);
    } catch (e) { return []; }
}

export async function analyzeProfitability(boq: FullBoqItem[]): Promise<{ engines: ProfitabilityHotspot[], drags: ProfitabilityHotspot[] } | null> {
    if (!isAiAvailable()) return null;
    const ai = getAi();
    const prompt = `Act as an expert Commercial Quantity Surveyor.
Analyze the following BOQ for profitability hotspots (Engines) and margin drags (Drags).
BOQ: ${JSON.stringify(boq.map(i => ({ id: i.id, name: i.name, cost: (i.materials + i.labor) * i.qty, margin: i.margin, revenue: ((i.materials + i.labor) / (1 - (i.margin || 0.2))) * i.qty })))}

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
    if (!isAiAvailable()) return { title: 'Screenshot Upload', description: 'Could not parse automatically. AI is disabled.', status: 'confirmed', requestedBy: 'client' };
    const ai = getAi();
    
    const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
    const prompt = `
    Analyze this WhatsApp screenshot or notes image. It contains a decision discussion between a client and an interior design firm (FFDS).
    
    Return JSON with:
    - title (string): A short, professional title summarizing the decision.
    - description (string): A professional summary of the context, what was discussed, and the final conclusion.
    - status (string): Must be 'confirmed', 'proposed', 'rejected', or 'revoked'.
    - requestedBy (string): 'client' or 'ffds' based on who drove the decision.
    - confirmingParty (string): The name of the person giving the nod (if visible).
    - impactCost (string): e.g., "None", "+ Rs. 15k based on chat", etc.
    - impactSchedule (string): e.g., "None", "Delayed", etc.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, { text: prompt }] },
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
        return parseJsonResponse<Partial<ProjectDecisionRecord>>(response.text, { title: 'Image Parse Failed', description: '', status: 'confirmed', requestedBy: 'client' });
    } catch (error) {
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

    if (!gateChecklist.item_5?.done) {
        score -= 20;
        blockers.push({ severity: 'critical', item: 'BOQ Freeze', reason: 'BOQ is not frozen', action: 'Freeze BOQ' });
    }
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
