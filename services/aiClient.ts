import { GoogleGenAI } from "@google/genai";

const MAX_RETRIES = 3;

/**
 * THE AI CLIENT, WITH THE KEY ON THE SERVER.
 *
 * This module used to read `process.env.GEMINI_API_KEY` and build a Gemini
 * client in the browser. Vite's `define` substituted that expression for the
 * literal secret at build time, so the studio's key was sitting in the shipped
 * JavaScript -- confirmed present in dist/assets/index-*.js, byte-identical to
 * the value in .env. Anyone who could load the app could take it.
 *
 * Now there are two paths behind one unchanged `getAi()` signature:
 *
 *   - In a browser, it returns a shim whose `models.generateContent` and
 *     `models.countTokens` call the `aiGenerate` / `aiCountTokens` callables in
 *     functions/src/ai.ts. No key is present client-side at all.
 *   - On the server (server.ts imports this same module and runs under Node),
 *     it builds a real SDK client from the genuine runtime environment. Vite
 *     does not touch that file, so nothing is inlined.
 *
 * The shim returns `{ text }`, which is the whole of what callers read: all
 * forty-four generateContent sites in geminiService use `response.text`.
 */

const isBrowser = typeof window !== "undefined";

/**
 * True when AI can be reached. In the browser this is always true -- whether a
 * key exists is the server's business now, and `verifyApiKey` still makes a
 * real call to find out for certain.
 */
export const aiIsReachable = (): boolean =>
  isBrowser ? true : !!process.env.GEMINI_API_KEY;

/** Retry on rate-limit, unchanged in behaviour from the original wrapper. */
const withRetry = async <T>(run: () => Promise<T>): Promise<T> => {
  let retries = 0;
  while (true) {
    try {
      return await run();
    } catch (error: any) {
      const status = error?.status ?? error?.code;
      const rateLimited =
        status === 429 ||
        status === "resource-exhausted" ||
        /429|rate limit/i.test(String(error?.message || ""));
      if (rateLimited && retries < MAX_RETRIES) {
        retries++;
        const delay = Math.pow(2, retries) * 1000;
        console.warn(
          `Rate limit hit. Retrying in ${delay}ms... (Attempt ${retries}/${MAX_RETRIES})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
};

/* Imported lazily and only in the browser: server.ts shares this module, and
   pulling firebaseClient into Node would initialise a web Firebase app there. */
const callFunction = async (name: string, payload: any) => {
  const [{ httpsCallable }, { functions }] = await Promise.all([
    import("firebase/functions"),
    import("./firebaseClient"),
  ]);
  const res: any = await httpsCallable(functions, name)(payload);
  return res?.data;
};

const browserShim = () => ({
  models: {
    generateContent: async (params: any) =>
      withRetry(async () => {
        const data = await callFunction("aiGenerate", {
          model: params?.model,
          contents: params?.contents,
          config: params?.config,
        });
        return { text: data?.text ?? "" } as any;
      }),
    countTokens: async (params: any) =>
      withRetry(async () => {
        const data = await callFunction("aiCountTokens", {
          model: params?.model,
          contents: params?.contents,
        });
        return { totalTokens: data?.totalTokens ?? 0 } as any;
      }),
  },
});

export const getAi = (): any => {
  if (isBrowser) return browserShim();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  const ai = new GoogleGenAI({ apiKey });
  const original = ai.models.generateContent;
  ai.models.generateContent = async (params: any) =>
    withRetry(() => original.call(ai.models, params));
  return ai;
};
