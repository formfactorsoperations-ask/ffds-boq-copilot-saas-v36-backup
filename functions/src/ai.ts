import { onCall, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenAI } from "@google/genai";
import { rateLimiter, requireStaff } from "./guards";

/**
 * GEMINI, BEHIND THE SERVER.
 *
 * The studio's Gemini key used to be inlined into the client bundle by Vite's
 * `define` (vite.config.ts), which meant every browser that loaded the app was
 * handed the secret in plain text -- it was recoverable from the shipped JS in
 * seconds, and authentication did nothing to prevent it because the file is
 * served to authenticated users too.
 *
 * The key now lives only here, as a Firebase secret, and never leaves the
 * server. The client sends a prompt and gets text back.
 *
 * Deploying this needs the secret set once:
 *
 *   firebase functions:secrets:set GEMINI_API_KEY
 *   firebase deploy --only functions:aiGenerate,functions:aiCountTokens
 *
 * The old key has already shipped in every build made before this change, so
 * it must be treated as compromised and rotated -- setting the secret here is
 * the natural moment to set the NEW one.
 */

/* cors:true because the app is served from localhost in development and from
   the hosting domain in production, and submitClientAction in index.ts already
   needs the same. CORS is not the security boundary here -- requireAuth is. */
const OPTS: CallableOptions = { secrets: ["GEMINI_API_KEY"], cors: true };

const client = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Configuration fault, not a caller fault -- say so plainly rather than
    // letting it surface as a generic internal error.
    throw new HttpsError(
      "failed-precondition",
      "GEMINI_API_KEY is not configured on the server."
    );
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Surfaces what actually went wrong.
 *
 * Without this the SDK's error was swallowed and the client saw a bare
 * "INTERNAL" with nothing in the logs to explain it -- index.ts wraps its own
 * callables in a withDiagnostics helper for exactly this reason and these two
 * were not. The message is logged server-side and echoed to the caller, which
 * is safe: the key is never part of an SDK error, only the model name and the
 * request shape are.
 */
const explain = async <T>(where: string, run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (e: any) {
    if (e instanceof HttpsError) throw e;
    const detail = e?.message || String(e);
    logger.error(`[${where}] Gemini call failed`, {
      message: detail,
      status: e?.status,
      code: e?.code,
      name: e?.name,
    });
    throw new HttpsError("internal", `Gemini call failed: ${detail}`);
  }
};

/*
  Studio staff only. "Signed in" was the whole check, and Google sign-in is
  open to anybody, so any stranger with a Google account could run Gemini on
  the studio's bill. The models are the ones the app asks for
  (constants/aiModels.ts); anything else is refused, so a caller cannot pick
  the most expensive model there is.
*/
const ALLOWED_MODELS = new Set(["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.1-pro-preview"]);
const underLimit = rateLimiter(150, 10 * 60 * 1000);

const requireAuth = async (request: any, model?: string) => {
  const staff = await requireStaff(request);
  if (model !== undefined && !ALLOWED_MODELS.has(String(model))) {
    throw new HttpsError("invalid-argument", `The model "${model}" is not enabled for this studio.`);
  }
  if (!underLimit(staff.uid)) {
    throw new HttpsError("resource-exhausted", "Too many AI requests. Try again in a few minutes.");
  }
};

/**
 * Mirrors `ai.models.generateContent` for the client.
 *
 * Returns only `{ text }` because that is the entirety of what the app reads
 * off a response -- all forty-four call sites in geminiService use
 * `response.text` and nothing else. Sending the whole response object back
 * would be shipping candidate metadata and safety ratings nobody consumes.
 */
export const aiGenerate = onCall(OPTS, async (request) => {
  const { model, contents, config } = (request.data || {}) as {
    model?: string;
    contents?: unknown;
    config?: unknown;
  };
  await requireAuth(request, model);
  if (!model || contents === undefined || contents === null) {
    throw new HttpsError("invalid-argument", "`model` and `contents` are required.");
  }
  return await explain("aiGenerate", async () => {
    const res = await client().models.generateContent({ model, contents, config } as any);
    return { text: res.text ?? "" };
  });
});

/** Mirrors `ai.models.countTokens`, used as the cheap liveness probe. */
export const aiCountTokens = onCall(OPTS, async (request) => {
  const { model, contents } = (request.data || {}) as {
    model?: string;
    contents?: unknown;
  };
  await requireAuth(request, model);
  if (!model || contents === undefined || contents === null) {
    throw new HttpsError("invalid-argument", "`model` and `contents` are required.");
  }
  return await explain("aiCountTokens", async () => {
    const res = await client().models.countTokens({ model, contents } as any);
    return { totalTokens: res.totalTokens ?? 0 };
  });
});
