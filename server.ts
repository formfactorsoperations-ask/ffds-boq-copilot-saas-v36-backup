import * as fs from 'fs';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { getAi } from "./services/aiClient";
import { classifyRoom, defaultCeiling } from "./lib/takeoff";

// It's important to use the process.env API key when running on the server
async function startServer() {
  const app = express();
  const PORT = 3000;

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  // Health check endpoints for deployment probes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/healthz", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/_healthz", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/structure-mom", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key missing on server" });
      }

      const { projectName, projectType, knownAttendees, meetingDate, rawNotes } = req.body;
      if (!rawNotes) {
        return res.status(400).json({ error: "No raw notes provided" });
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
             model: "gemini-3.6-flash",
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
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("MoM structuring error:", error);
      res.status(500).json({ error: error.message || "Failed to structure MoM" });
    }
  });

  app.post("/api/predict-handover-delays", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key missing on server" });
      }

      const { projectContext, timelinePhases, calendar, computedSchedule } = req.body;
      const { analyzeTimelineHandoverRisks } = await import("./services/geminiService");
      
      const result = await analyzeTimelineHandoverRisks(projectContext, timelinePhases, calendar, computedSchedule);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("Predict handover delays API error:", error);
      res.status(500).json({ error: error.message || "Failed to predict handover delays" });
    }
  });

  app.post("/api/parse-mom", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key missing on server" });
      }

      const { rawNotes } = req.body;
      if (!rawNotes) {
        return res.status(400).json({ error: "No raw notes provided" });
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
        model: "gemini-3.6-flash",
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

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("MoM parsing error:", error);
      res.status(500).json({ error: error.message || "Failed to parse MoM" });
    }
  });

  // API Route to analyze floor plan image
  app.post("/api/analyze-floorplan", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key missing on server" });
      }

      const { imageBase64, area } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "No image provided" });
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
        model: 'gemini-3.6-flash',
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

      res.json({ success: true, rooms });
    } catch (error: any) {
      console.error("Floor plan analysis error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze floor plan" });
    }
  });

  // API Route to analyze room image
  app.post("/api/analyze-room-image", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key missing on server" });
      }

      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "No image provided" });
      }

      const ai = getAi();
      const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
      const prompt = `Analyze room image. Return JSON with roomType, observations, suggestedItems.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
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
      res.json({ success: true, analysis });
    } catch (error: any) {
      console.error("Room image analysis error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze room image" });
    }
  });

  // API Route to parse decision from screenshot
  app.post("/api/parse-decision-image", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key missing on server" });
      }

      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "No image provided" });
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
        model: 'gemini-3.6-flash',
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
      res.json({ success: true, decision });
    } catch (error: any) {
      console.error("Decision image parse error:", error);
      res.status(500).json({ error: error.message || "Failed to parse decision from image" });
    }
  });

  // API Route to parse unstructured decision text using Gemini
  app.post("/api/parse-decision-text", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key missing on server" });
      }

      const { text, projectRooms } = req.body;
      if (!text) {
        return res.status(400).json({ error: "No text provided" });
      }

      const ai = getAi();
      const prompt = `
      Analyze this raw, unstructured interior design discussion, WhatsApp message, site notes, or verbal transcript. 
      It describes a decision, change request, or site update agreed between the design studio and the client.
      
      We have the following list of active rooms/areas in this project: ${JSON.stringify(projectRooms || [])}.
      
      Extract and structure the details into the following schema:
      - title: A very short, crisp, professional title (e.g., "TV Unit Laminate Selection", "AC Concealed Piping Route").
      - decisionText: A clear, technically accurate, professional summary of the decision. Convert any colloquial, shorthand, or rough notes into polite, formal design language suitable for sharing as an official record. Do not omit technical specs if mentioned.
      - roomName: The room/area. It MUST strictly match one of the pre-defined rooms: ${JSON.stringify(projectRooms || [])}. If no room matches or is mentioned, return an empty string.
      - category: The reason category. Must be exactly one of: 'Site Condition', 'Client Request', 'Design Upgrade', 'Value Engineering'.
      - presentees: A short list or string of people involved/present (e.g., "Amit, Client, Designer").
      - boqImpact: The financial category of impact. Must be exactly one of: 'none' (no cost change), 'rate_change' (rate or existing item modified), 'new_item' (new scope added).
      - impactCostValue: The estimated cost impact in Rupees (INR) as a number. If a cost addition is mentioned (e.g. "+ 15k", "+ 15000", "Rs 1.5 Lakhs"), extract it as a number (e.g. 15000, 15000, 150000). Set to 0 if none or unspecified.
      - impactScheduleDays: The estimated timeline delay in number of days. Set to 0 if none.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              decisionText: { type: "STRING" },
              roomName: { type: "STRING" },
              category: { type: "STRING" },
              presentees: { type: "STRING" },
              boqImpact: { type: "STRING" },
              impactCostValue: { type: "NUMBER" },
              impactScheduleDays: { type: "NUMBER" }
                },
            required: ["title", "decisionText", "roomName", "category", "boqImpact", "impactCostValue", "impactScheduleDays"]
              }
        }
      });

      const responseText = response.text || "{}";
      const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const decision = JSON.parse(cleanedText);
      res.json({ success: true, decision });
    } catch (error: any) {
      console.error("Decision text parse error:", error);
      res.status(500).json({ error: error.message || "Failed to parse decision from text" });
    }
  });

  // API Route to send emails securely without CORS issues on the client
  app.post("/api/send-email", async (req, res) => {
    try {
      const RESEND_API_KEY = process.env.VITE_RESEND_API_KEY || process.env.RESEND_API_KEY;
      
      const { to, subject, html, from, attachments } = req.body;

      if (!RESEND_API_KEY) {
        console.log("[EMAIL SANDBOX] RESEND_API_KEY not configured on server. Simulating instant dispatch to:", to);
        return res.json({ 
          success: true, 
          sandbox: true, 
          message: "Email simulated in sandbox mode (RESEND_API_KEY not configured)." 
        });
      }

      const senderEmail = process.env.EMAIL_FROM || process.env.VITE_RESEND_SENDER_EMAIL || from || 'onboarding@resend.dev';

      const payload: any = {
          from: senderEmail,
          to,
          subject,
          html
      };
      
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
          payload.attachments = attachments;
      }

      // Safe 5-second timeout to prevent hanging UI
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
              errorData = JSON.parse(errorText);
          } catch (e) {
              errorData = { message: errorText || "Resend API Error" };
          }
          return res.status(response.status).json({ error: errorData });
        }

        const responseText = await response.text();
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          data = { message: responseText };
        }
        res.json({ success: true, data });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          console.warn("Resend email request timed out after 5s");
          return res.status(504).json({ error: { message: "Resend gateway timeout (5s limit reached)" } });
        }
        throw fetchErr;
      }
    } catch (error: any) {
      console.error("Server API Email Error:", error);
      res.status(500).json({ error: error.message || "Failed to send email" });
    }
  });

  // MCP Proxy Route
  app.post("/api/mcp/google-calendar", async (req, res) => {
    try {
      const { action, args } = req.body;
      
      // Mocking GCal integration for now to prevent API errors
      if (action === 'list_events') {
        return res.json([]);
      } else if (action === 'create_event') {
        return res.json({ id: "mock-event-" + Date.now(), hangoutLink: "https://meet.google.com/mock-link" });
      } else if (action === 'update_event') {
        return res.json({ id: args.eventId, status: "updated" });
      }
      
      return res.json({ status: "ok" });
    } catch (e: any) {
      console.error("MCP route error", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/log", express.json(), (req, res) => {
    console.log("CLIENT LOG:", req.body);
    try {
      fs.appendFileSync('client_errors.log', JSON.stringify(req.body) + '\n');
    } catch {
      // safe fallback if filesystem is read-only
    }
    res.json({ ok: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Standard Express static serving for production
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))
      ? path.join(process.cwd(), 'dist')
      : path.join(__dirname);
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
}

startServer();
