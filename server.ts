import * as fs from 'fs';
import http from "http";
import express from "express";
import path from "path";
import { createServer as createViteServer, loadEnv } from "vite";
import { requireAccount } from "./lib/requireAccount";
import * as apiTasks from "./services/apiTasks";
import { getAi } from "./services/aiClient";
import { classifyRoom, defaultCeiling } from "./lib/takeoff";
import { FLASH_MODEL } from "./constants/aiModels";

/*
  The server reads .env for itself.

  vite.config.ts calls loadEnv and hands GEMINI_API_KEY to the browser bundle
  through `define`, so the client believed AI was available while every /api
  route on this process answered "Gemini API Key missing on server". Nothing
  loaded .env into Node — there is no dotenv here — and the only symptom was
  analyzeFloorPlan returning an empty array, which the UI rendered as no change
  at all. "Analyze Plan does nothing" was six dead endpoints.

  loadEnv rather than dotenv: it is already a dependency, and it applies exactly
  the same file precedence the client build uses, so the two cannot disagree
  about which key is in force.

  A real environment variable always wins. In production the key comes from the
  host, and a stale .env sitting in the image must not quietly replace it.
*/
const fileEnv = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
for (const [k, v] of Object.entries(fileEnv)) {
  if (process.env[k] === undefined && v !== '') process.env[k] = v;
}

async function startServer() {
  const app = express();
  /*
    3000 is the default, not a requirement.

    The port was a literal, so a second instance — a reviewer's, a test run,
    anything started while the studio's own dev server is up — died on
    EADDRINUSE with nowhere to go. Nothing here needs 3000 specifically: the
    client calls /api/* relative to whatever origin served it, and the sign-off
    links fall back to window.location.origin.
  */
  const PORT = Number(process.env.PORT) || 3000;

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
  });

  /*
    No CORS middleware. It used to be `cors()` -- every origin on the internet
    allowed -- and nothing here is meant to be called from another site: the
    app calls /api relative to the page that served it. 20MB still carries a
    floor-plan image or a PDF attachment as base64.
  */
  app.use(express.json({ limit: '20mb' }));

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

  /*
    Everything under /api below this line needs a signed-in account with a
    studio or client profile. The health checks above stay open for the
    host's probes. See lib/requireAccount.ts.
  */
  app.use("/api", requireAccount(60));

  app.post("/api/structure-mom", async (req, res) => {
    const r = await apiTasks.structureMom(req.body);
    res.status(r.status).json(r.json);
  });

  app.post("/api/predict-handover-delays", async (req, res) => {
    const r = await apiTasks.predictHandoverDelays(req.body);
    res.status(r.status).json(r.json);
  });

  app.post("/api/parse-mom", async (req, res) => {
    const r = await apiTasks.parseMom(req.body);
    res.status(r.status).json(r.json);
  });

  // API Route to analyze floor plan image
  app.post("/api/analyze-floorplan", async (req, res) => {
    const r = await apiTasks.analyzeFloorplan(req.body);
    res.status(r.status).json(r.json);
  });

  // API Route to analyze room image
  app.post("/api/analyze-room-image", async (req, res) => {
    const r = await apiTasks.analyzeRoomImage(req.body);
    res.status(r.status).json(r.json);
  });

  // API Route to parse decision from screenshot
  app.post("/api/parse-decision-image", async (req, res) => {
    const r = await apiTasks.parseDecisionImage(req.body);
    res.status(r.status).json(r.json);
  });

  // API Route to send emails securely without CORS issues on the client
  app.post("/api/send-email", async (req, res) => {
    try {
      const RESEND_API_KEY = process.env.VITE_RESEND_API_KEY || process.env.RESEND_API_KEY;
      
      const { to, subject, html, from, attachments } = req.body;

      /*
        The recipient list is capped and checked, and the sending address is
        the studio's own, from the environment. It used to fall back to
        whatever `from` the caller sent -- so with the route open to anyone,
        it could send mail as anybody. The caller may still choose how the
        name reads, never the address.
      */
      const recipients = (Array.isArray(to) ? to : String(to || '').split(','))
        .map((r: any) => String(r).trim())
        .filter(Boolean);
      const validAddress = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
      if (!recipients.length || recipients.length > 10 || recipients.some((r: string) => !validAddress.test(r))) {
        return res.status(400).json({ error: { message: "Between one and ten valid recipient addresses are needed." } });
      }
      if (!subject || String(subject).length > 300) {
        return res.status(400).json({ error: { message: "A subject of up to 300 characters is needed." } });
      }

      if (!RESEND_API_KEY) {
        console.log("[EMAIL SANDBOX] RESEND_API_KEY not configured on server. Simulating instant dispatch to:", to);
        return res.json({ 
          success: true, 
          sandbox: true, 
          message: "Email simulated in sandbox mode (RESEND_API_KEY not configured)." 
        });
      }

      const senderAddress = process.env.EMAIL_FROM || process.env.VITE_RESEND_SENDER_EMAIL || 'onboarding@resend.dev';
      const displayName = String(from || '').split('<')[0].replace(/["\r\n]/g, '').trim().slice(0, 60);
      const senderEmail = displayName && !senderAddress.includes('<')
        ? `${displayName} <${senderAddress}>`
        : senderAddress;

      const payload: any = {
          from: senderEmail,
          to: recipients,
          subject: String(subject),
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

  /*
    The HTTP server is created up front so Vite can run its HMR websocket on
    it. In middleware mode Vite still injects @vite/client into the page
    regardless of the hmr setting, and `hmr: false` left that client with no
    socket: it opened ws://localhost:3000, the Express server never upgraded
    the connection, and the failure called sendError -- which dereferences the
    socket that does not exist, throws, and is caught by the same handler that
    called it. One error became an unbounded recursion (80,000+ frames), the
    main thread saturated, and the app never finished mounting. Any error in
    dev was fatal and unreadable.
  */
  const server = http.createServer(app);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server },
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

  server.listen(PORT, "0.0.0.0", () => {
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
