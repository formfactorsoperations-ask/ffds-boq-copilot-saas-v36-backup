import { getAi } from "./aiClient";
import { FLASH_MODEL } from "../constants/aiModels";
import { classifyRoom, defaultCeiling } from "../lib/takeoff";

/*
  THE AI ROUTES, RUNNABLE ANYWHERE.

  These six used to exist only as Express routes in server.ts. The app published
  on AI Studio's *.ai.studio domain is served as static files -- server.ts does
  not run there -- so every /api call came back as index.html and the client
  failed with "Unexpected token '<' ... is not valid JSON". Creating a MoM,
  parsing meeting notes, reading a floor plan, a room photo or a decision
  screenshot, and predicting handover delays all broke in the published app
  while working on localhost.

  The bodies now live here, unchanged, and run wherever they are called:

    - in the browser (services/apiFetch.ts sends these paths here), where
      getAi() talks to the `aiGenerate` callable, so the Gemini key stays a
      Firebase secret and never reaches the client;
    - on the local server (server.ts routes call the same functions), where
      getAi() uses the key from .env.

  Each returns the status and JSON body its route always sent, so every caller
  reads the same shape as before.
*/

export interface TaskResult {
  status: number;
  json: any;
}

const reply = (status: number, json: any): TaskResult => ({ status, json });

/** POST /api/structure-mom */
export async function structureMom(body: any): Promise<TaskResult> {
  try {

    const { projectName, projectType, knownAttendees, meetingDate, rawNotes } = body;
    if (!rawNotes) {
      return reply(400, { error: "No raw notes provided" });
    }

    const ai = getAi();
    
    const systemPrompt = `You are the Minutes-of-Meeting structurer for an interior design studio in Mumbai. Convert rough meeting notes into a structured MoM. Indian interior project context: clients request finish changes, additions, drawing revisions; some requests have cost/scope implications the studio must not miss.

Extract:
- attendees (infer side: client / ffds / vendor where possible)
- decisions: things definitively agreed (finish confirmed, option chosen)
- actionItems: tasks with an owner (client/ffds/vendor) and a due date if stated
- notes: context/discussion with no owner

For EACH action item set flags:
- scope: true if it implies NEW work not in original scope (a new unit, room, element)
- drawing: true if it requires a drawing change/revision
- siteCondition: true if driven by a physical site reality (beam, measurement, service)
- cost: true if it likely changes project cost

Be conservative: if unsure whether something is a decision vs an action, make it an action. NEVER invent attendees, dates, or commitments not present in the notes.
Return ONLY JSON, no markdown fences:
{
"attendees": [{"name": "", "side": "client|ffds|vendor|unknown", "role": ""}],
"decisions": [{"text": ""}],
"actionItems": [{"text": "", "owner": "", "ownerName": "", "dueDateText": "", "flags": {"scope": false, "drawing": false, "siteCondition": false, "cost": false}}],
"notes": [{"text": ""}],
"scopeFlagSummary": "string|null",
  "summary": "2-3 plain sentences the client would understand: what was reviewed, what was agreed, what happens next",
"confidence": 0.9
}`;

    const userPrompt = `Project Name: ${projectName}
Project Type: ${projectType}
Known Attendees: ${knownAttendees}
Meeting Date: ${meetingDate}
Raw Notes:
"""
${rawNotes}
"""`;

    // Define a parse helper with one retry
    const callGenAI = async (retries = 1): Promise<any> => {
      try {
        const response = await ai.models.generateContent({
           model: FLASH_MODEL,
           contents: [
              { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
           ],
           config: {
             responseMimeType: "application/json",
             temperature: 0.2
           }
        });
        let jsonStr = response.text || "{}";
        // strip code fences if model sends them erroneously despite instructions
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(jsonStr);
      } catch (err) {
        if (retries > 0) {
           return callGenAI(retries - 1);
        }
        throw err;
      }
    };

    const result = await callGenAI();
    return reply(200, { success: true, data: result });
  } catch (error: any) {
    console.error("MoM structuring error:", error);
    return reply(500, { error: error.message || "Failed to structure MoM" });
  }
}

/** POST /api/predict-handover-delays */
export async function predictHandoverDelays(body: any): Promise<TaskResult> {
  try {

    const { projectContext, timelinePhases, calendar, computedSchedule } = body;
    const { analyzeTimelineHandoverRisks } = await import("./geminiService");
    
    const result = await analyzeTimelineHandoverRisks(projectContext, timelinePhases, calendar, computedSchedule);
    return reply(200, { success: true, data: result });
  } catch (error: any) {
    console.error("Predict handover delays API error:", error);
    return reply(500, { error: error.message || "Failed to predict handover delays" });
  }
}

/** POST /api/parse-mom */
export async function parseMom(body: any): Promise<TaskResult> {
  try {

    const { rawNotes } = body;
    if (!rawNotes) {
      return reply(400, { error: "No raw notes provided" });
    }

    const ai = getAi();

    const systemPrompt = `You are an expert AI assistant that parses meeting notes / Minutes of Meeting (MoM) for an interior design studio.
Extract and categorize:
1. Decisions: Concrete final agreements, selections, sign-offs, or choices made.
2. Blockers: Potential delays, physical constraints, missing drawings, material delays, or structural issues halting/impacting progress.
3. SOF Changes (Schedule of Finishes variances): Any material, finish, shade, or brand changes compared to original/baseline specifications.

Ensure the output is in JSON matching this schema:
{
"decisions": [
  { "title": "Specific decision title/description" }
],
"blockers": [
  { "title": "Blocker description", "impact": "High / Medium / Low" }
],
"sofChanges": [
  { "item": "Name of item/surface", "original": "Original specification", "new": "New specification / selection" }
]
}

Return ONLY raw JSON, no markdown formatting blocks.`;

    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\nRaw Meeting Notes:\n" + rawNotes }] }
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    let jsonStr = response.text || "{}";
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(jsonStr);

    return reply(200, { success: true, data });
  } catch (error: any) {
    console.error("MoM parsing error:", error);
    return reply(500, { error: error.message || "Failed to parse MoM" });
  }
}

/** POST /api/analyze-floorplan */
export async function analyzeFloorplan(body: any): Promise<TaskResult> {
  try {

    const { imageBase64, area } = body;
    if (!imageBase64) {
      return reply(400, { error: "No image provided" });
    }

    const ai = getAi();
    const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
    const prompt = `You are reading an architectural floor plan for a quantity takeoff.

For EVERY enclosed space including toilets, kitchen, utility, foyer, passage and balconies:
- name: the label printed on the drawing
- rawDimension: the dimension text EXACTLY as printed, e.g. "12'0\\" x 10'6\\"" or "2.90x2.84". Empty string if none is printed.
- lengthFt, widthFt: those dimensions in FEET. Convert if the plan is in metres (1 m = 3.28084 ft).
If no dimension is printed, estimate from the drawing scale and set dimensionPrinted=false.
- dimensionPrinted: true only if you read an actual printed dimension.
- doors, windows: count the door and window symbols on that room's walls.
- irregular: true if the room is L-shaped or not a simple rectangle.

Total carpet area on record is ${area || 0} sq ft — use it as a sanity check, but report what the drawing says.
Do NOT invent rooms. Do NOT merge rooms. Return JSON array only.`;

    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              rawDimension: { type: "STRING" },
              lengthFt: { type: "NUMBER" },
              widthFt: { type: "NUMBER" },
              dimensionPrinted: { type: "BOOLEAN" },
              doors: { type: "NUMBER" },
              windows: { type: "NUMBER" },
              irregular: { type: "BOOLEAN" }
            },
            required: ["name", "lengthFt", "widthFt"]
          }
        }
      }
    });

    const responseText = response.text || "[]";
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const rawRooms = JSON.parse(cleanedText);

    const rooms = (Array.isArray(rawRooms) ? rawRooms : []).map((r: any) => {
      const L = Number(r.lengthFt) || 0;
      const W = Number(r.widthFt) || 0;
      const kind = classifyRoom(String(r.name || ''));
      return {
        name: String(r.name || 'Room'),
        size: Number((L * W).toFixed(2)) || 0,
        unit: 'sq ft' as const,
        length: L || undefined,
        width: W || undefined,
        kind,
        doors: Number(r.doors) || 0,
        windows: Number(r.windows) || 0,
        ceiling: defaultCeiling(kind),
        dimSource: r.dimensionPrinted ? 'read' : 'calculated',
        rawDimension: r.rawDimension ? String(r.rawDimension) : undefined,
        irregular: !!r.irregular,
      };
    }).filter((r: any) => r.size > 0);

    return reply(200, { success: true, rooms });
  } catch (error: any) {
    console.error("Floor plan analysis error:", error);
    return reply(500, { error: error.message || "Failed to analyze floor plan" });
  }
}

/** POST /api/analyze-room-image */
export async function analyzeRoomImage(body: any): Promise<TaskResult> {
  try {

    const { imageBase64 } = body;
    if (!imageBase64) {
      return reply(400, { error: "No image provided" });
    }

    const ai = getAi();
    const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
    const prompt = `Analyze room image. Return JSON with roomType, observations, suggestedItems.`;

    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            roomType: { type: "STRING" },
            observations: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            suggestedItems: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  category: { type: "STRING" },
                  qty: { type: "NUMBER" },
                  unit: { type: "STRING" },
                  rationale: { type: "STRING" }
                },
                required: ["name", "category", "qty", "unit", "rationale"]
              }
            }
          },
          required: ["roomType", "observations", "suggestedItems"]
        }
      }
    });

    const responseText = response.text || "{}";
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const analysis = JSON.parse(cleanedText);
    return reply(200, { success: true, analysis });
  } catch (error: any) {
    console.error("Room image analysis error:", error);
    return reply(500, { error: error.message || "Failed to analyze room image" });
  }
}

/** POST /api/parse-decision-image */
export async function parseDecisionImage(body: any): Promise<TaskResult> {
  try {

    const { imageBase64 } = body;
    if (!imageBase64) {
      return reply(400, { error: "No image provided" });
    }

    const ai = getAi();
    const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
    const prompt = `
    Analyze this WhatsApp screenshot or notes image. It contains a decision discussion between a client and an interior design firm.
    
    Return JSON with:
    - title (string): A short, professional title summarizing the decision.
    - description (string): A professional summary of the context, what was discussed, and the final conclusion.
    - status (string): Must be 'confirmed', 'proposed', 'rejected', or 'revoked'.
    - requestedBy (string): 'client' or 'ffds' based on who drove the decision.
    - confirmingParty (string): The name of the person giving the nod (if visible).
    - impactCost (string): e.g., "None", "+ Rs. 15k based on chat", etc.
    - impactSchedule (string): e.g., "None", "Delayed", etc.
    `;

    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            description: { type: "STRING" },
            status: { type: "STRING" },
            requestedBy: { type: "STRING" },
            confirmingParty: { type: "STRING" },
            impactCost: { type: "STRING" },
            impactSchedule: { type: "STRING" }
          },
          required: ["title", "description", "status", "requestedBy"]
        }
      }
    });

    const responseText = response.text || "{}";
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const decision = JSON.parse(cleanedText);
    return reply(200, { success: true, decision });
  } catch (error: any) {
    console.error("Decision image parse error:", error);
    return reply(500, { error: error.message || "Failed to parse decision from image" });
  }
}
