import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

// It's important to use the process.env API key when running on the server
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

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

      const ai = new GoogleGenAI({ apiKey });
      
      const systemPrompt = `You are the Minutes-of-Meeting structurer for FFDS BOQ Copilot, an interior design studio in Mumbai. Convert rough meeting notes into a structured MoM. Indian interior project context: clients request finish changes, additions, drawing revisions; some requests have cost/scope implications the studio must not miss.

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
             model: "gemini-2.5-flash",
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

  // API Route to send emails securely without CORS issues on the client
  app.post("/api/send-email", async (req, res) => {
    try {
      const RESEND_API_KEY = process.env.VITE_RESEND_API_KEY || process.env.RESEND_API_KEY;
      
      if (!RESEND_API_KEY) {
        return res.status(500).json({ error: "Resend API Key is missing on the server" });
      }

      const { to, subject, html, from, attachments } = req.body;

      const senderEmail = process.env.EMAIL_FROM || process.env.VITE_RESEND_SENDER_EMAIL || from || 'onboarding@resend.dev';

      const payload: any = {
          from: senderEmail,
          to,
          subject,
          html
      };
      
      if (attachments) {
          payload.attachments = attachments;
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch (e) {
            errorData = { message: errorText || "Unknown error" };
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Standard Express static serving for production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
