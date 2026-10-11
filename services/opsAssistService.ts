/*
  The AI calls behind the Ops Desk's smart assist (lib/opsAssist.ts has the
  rules). Each goes through the studio's server-side Gemini proxy
  (functions/src/ai.ts) like every other AI call in the app, and each is given
  only the project brief, which is built from the copy of the project without
  the studio's money.
*/
import { Type } from '@google/genai';
import { getAi, aiIsReachable } from './aiClient';
import { FLASH_MODEL } from '../constants/aiModels';
import { opsViewOf } from '../functions/src/teamViewStrip';
import {
  ASK_INSTRUCTIONS, CAPTURE_INSTRUCTIONS, PREP_INSTRUCTIONS, briefForPrompt, normaliseCapture,
  type Capture, type ProjectBrief,
} from '../lib/opsAssist';

export const assistAvailable = (): boolean => aiIsReachable();

/** The copy of a project the assist may read: Client Relations already holds it; anyone else's is made here. */
export function safeProjectView(project: any): any {
  return project?._teamView === 'ops' ? project : opsViewOf(project);
}

const parse = <T,>(text: string | undefined, fallback: T): T => {
  try {
    const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
    return t ? JSON.parse(t) : fallback;
  } catch {
    return fallback;
  }
};

const generate = async (parts: any[], schema: any): Promise<string> => {
  const res = await getAi().models.generateContent({
    model: FLASH_MODEL,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
  });
  return res?.text || '';
};

const CAPTURE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    mood: { type: Type.STRING },
    moodQuote: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: ['our_promise', 'client_promise', 'date', 'open_question', 'extra_work'] },
          text: { type: Type.STRING },
          due: { type: Type.STRING },
        },
        required: ['kind', 'text'],
      },
    },
  },
  required: ['summary', 'items'],
};

/** Read a pasted chat, or a recorded voice note, into what was promised, asked and decided. */
export async function captureConversation(input: { text?: string; audio?: { mimeType: string; base64: string } }, today: string, clientName: string): Promise<Capture> {
  const head = { text: `${CAPTURE_INSTRUCTIONS}\nToday is ${today}. The client is ${clientName || 'the client'}.` };
  const body = input.audio
    ? { inlineData: { mimeType: input.audio.mimeType, data: input.audio.base64 } }
    : { text: `Conversation:\n${String(input.text || '').slice(0, 20000)}` };
  return normaliseCapture(parse(await generate([head, body], CAPTURE_SCHEMA), null));
}

export interface Answer { answer: string; sources: string[]; reply: string }

/** Answer a question about one project from its brief. */
export async function askProject(brief: ProjectBrief, question: string): Promise<Answer> {
  const text = await generate(
    [{ text: ASK_INSTRUCTIONS }, { text: `Record:\n${briefForPrompt(brief)}` }, { text: `Question: ${question.slice(0, 500)}` }],
    {
      type: Type.OBJECT,
      properties: { answer: { type: Type.STRING }, sources: { type: Type.ARRAY, items: { type: Type.STRING } }, reply: { type: Type.STRING } },
      required: ['answer'],
    },
  );
  const a = parse<any>(text, {});
  return {
    answer: String(a?.answer || "The records don't say.").slice(0, 1200),
    sources: (Array.isArray(a?.sources) ? a.sources : []).map((s: any) => String(s).slice(0, 80)).slice(0, 6),
    reply: String(a?.reply || '').slice(0, 1000),
  };
}

/** Points to keep in mind, and an agenda, for a meeting with the client. */
export async function prepNotes(brief: ProjectBrief): Promise<{ watchOuts: string[]; agenda: string[] }> {
  const text = await generate(
    [{ text: PREP_INSTRUCTIONS }, { text: `Record:\n${briefForPrompt(brief)}` }],
    {
      type: Type.OBJECT,
      properties: { watchOuts: { type: Type.ARRAY, items: { type: Type.STRING } }, agenda: { type: Type.ARRAY, items: { type: Type.STRING } } },
      required: ['agenda'],
    },
  );
  const p = parse<any>(text, {});
  const list = (v: any, n: number) => (Array.isArray(v) ? v : []).map((s: any) => String(s).replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, n);
  return { watchOuts: list(p?.watchOuts, 4), agenda: list(p?.agenda, 7) };
}

/** A recorded or chosen audio file, as the AI takes it. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
