/*
  Reads and writes for leads (lib/leads.ts has what they mean, firestore.rules
  who may do what). Client Relations read their own leads only, so their query
  names them; a lead (Owner, Admin, Ops Director) reads the studio's.
*/
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Type } from '@google/genai';
import { db, functions } from './firebaseClient';
import { getAi, aiIsReachable } from './aiClient';
import { FLASH_MODEL } from '../constants/aiModels';
import { blankPerson, readChat, type Lead, type LeadDraft, type LeadStage, type LeadTouch, type Match, type TouchKind } from '../lib/leads';
import type { Enquiry } from '../lib/leadForm';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clip = (v: any, n: number) => String(v ?? '').trim().slice(0, n);

/** A lead as stored, made safe to show whatever an older version wrote. */
function normalise(id: string, d: any): Lead {
  const people = (Array.isArray(d?.people) ? d.people : []).map((p: any, i: number) => ({
    id: String(p?.id || `p${i}`), name: clip(p?.name, 80), role: clip(p?.role, 60), phone: clip(p?.phone, 30), email: clip(p?.email, 120), main: i === 0,
  }));
  return {
    id,
    tenantId: String(d?.tenantId || ''),
    createdAt: Number(d?.createdAt) || 0,
    createdBy: String(d?.createdBy || ''),
    createdByName: String(d?.createdByName || ''),
    ownerEmail: String(d?.ownerEmail || '').toLowerCase(),
    ownerName: String(d?.ownerName || ''),
    people: people.length ? people : [blankPerson(true)],
    home: {
      where: clip(d?.home?.where, 160), type: clip(d?.home?.type, 40), area: Number(d?.home?.area) || null,
      scope: Array.isArray(d?.home?.scope) ? d.home.scope.map((x: any) => clip(x, 40)).slice(0, 10) : [],
      possession: clip(d?.home?.possession, 40), budget: clip(d?.home?.budget, 60),
    },
    source: d?.source || 'other',
    sourceNote: clip(d?.sourceNote, 120),
    enquiry: clip(d?.enquiry, 2000),
    stage: (d?.stage || 'new') as LeadStage,
    lostReason: d?.lostReason ? clip(d.lostReason, 80) : null,
    know: { decides: clip(d?.know?.decides, 160), style: clip(d?.know?.style, 160), seenWork: !!d?.know?.seenWork },
    next: d?.next?.text ? { text: clip(d.next.text, 200), due: String(d.next.due || ''), kind: d.next.kind || 'call' } : null,
    touches: (Array.isArray(d?.touches) ? d.touches : []) as LeadTouch[],
    firstTouchAt: d?.firstTouchAt ?? null,
    lastTouchAt: d?.lastTouchAt ?? null,
    openRequest: d?.openRequest || null,
    projectId: d?.projectId || null,
    updatedAt: Number(d?.updatedAt) || 0,
    updatedBy: String(d?.updatedBy || ''),
  };
}

/** The leads this person may see: all of the studio's for a lead, their own for Client Relations. */
export async function loadLeads(tenantId: string, me: string, everyone: boolean): Promise<Lead[]> {
  if (!db || !tenantId) return [];
  const base = collection(db, 'leads');
  const q = everyone
    ? query(base, where('tenantId', '==', tenantId))
    : query(base, where('tenantId', '==', tenantId), where('ownerEmail', '==', me.toLowerCase()));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalise(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
}

/** What is stored: the lead without its id, every field present so the rules can check its shape. */
const stored = (l: Lead) => {
  const { id, ...rest } = l;
  return {
    ...rest,
    people: l.people.map((p, i) => ({ id: p.id, name: clip(p.name, 80), role: clip(p.role, 60), phone: clip(p.phone, 30), email: clip(p.email, 120).toLowerCase(), main: i === 0 })),
    touches: l.touches.slice(-300),
  };
};

export async function createLead(d: LeadDraft, x: { tenantId: string; me: { email: string; name: string }; owner: { email: string; name: string } }): Promise<Lead> {
  const now = Date.now();
  const lead: Lead = {
    id: newId(), tenantId: x.tenantId, createdAt: now, createdBy: x.me.email.toLowerCase(), createdByName: x.me.name,
    ownerEmail: x.owner.email.toLowerCase(), ownerName: x.owner.name,
    people: d.people.filter((p, i) => i === 0 || p.name.trim() || p.phone.trim() || p.email.trim()),
    home: d.home, source: d.source, sourceNote: d.sourceNote, enquiry: d.enquiry, stage: 'new', lostReason: null,
    know: { decides: '', style: '', seenWork: false }, next: d.next.text.trim() ? d.next : null,
    touches: d.enquiry.trim() ? [{ id: newId(), at: now, by: x.me.email.toLowerCase(), byName: x.me.name, kind: 'note', text: `Enquiry: ${d.enquiry.trim().slice(0, 400)}` }] : [],
    firstTouchAt: null, lastTouchAt: null, openRequest: null, projectId: null, updatedAt: now, updatedBy: x.me.email.toLowerCase(),
  };
  await setDoc(doc(db!, 'leads', lead.id), stored(lead));
  return lead;
}

/** Save the lead as it now stands, in this person's name. */
export async function saveLead(l: Lead, me: string): Promise<Lead> {
  const next = { ...l, updatedAt: Date.now(), updatedBy: me.toLowerCase() };
  await setDoc(doc(db!, 'leads', l.id), stored(next));
  return next;
}

/** A touch on the lead: a call, a message, a meeting, a note, or a stage it moved to. */
export function withTouch(l: Lead, t: { kind: TouchKind; text: string; reached?: boolean | null }, me: { email: string; name: string }): Lead {
  const now = Date.now();
  const touch: LeadTouch = { id: newId(), at: now, by: me.email.toLowerCase(), byName: me.name, kind: t.kind, text: clip(t.text, 500), reached: t.reached ?? null };
  const contact = t.kind !== 'note' && t.kind !== 'stage';
  return {
    ...l,
    touches: [...l.touches, touch].slice(-300),
    firstTouchAt: contact && !l.firstTouchAt ? now : l.firstTouchAt,
    lastTouchAt: contact ? now : l.lastTouchAt,
    stage: contact && l.stage === 'new' ? 'talking' : l.stage,
  };
}

export async function deleteLead(id: string): Promise<void> {
  await deleteDoc(doc(db!, 'leads', id));
}

/* ── A pasted WhatsApp chat ─────────────────────────────────────────────── */

export interface ChatRead {
  people: { name: string; phone: string; email: string; role: string }[];
  where: string; type: string; area: number | null; scope: string[]; possession: string; budget: string; enquiry: string;
}

const CHAT_INSTRUCTIONS = `You read the first WhatsApp chat or message between an interior design studio and someone enquiring about work.
Return JSON with what the enquirer says, and only that:
- people: each person on the client's side who is named, with phone and email if given, and role (e.g. "Main contact", "Wife", "Their architect"). The first is the one writing.
- where: the building and area, as written. type: "2 BHK", "3 BHK", "Villa", "Office" and so on. area: carpet area in sq ft as a number, or 0.
- scope: any of "Full home", "Kitchen", "Wardrobes", "Living", "Bathrooms", "Only furniture" that they ask for.
- possession: when they get the keys or want to start, as written. budget: what they say they want to spend, as written, or "".
- enquiry: their first message, in their words, under 300 characters.
Never invent anything. Leave out what is not said.`;

/** The fields a pasted chat gives: the AI when it is reachable, else what can be read without it. */
export async function readLeadChat(text: string): Promise<ChatRead> {
  const plain = readChat(text);
  const fallback: ChatRead = {
    people: plain.people.map((p, i) => ({ ...p, role: i === 0 ? 'Main contact' : '' })),
    where: '', type: '', area: null, scope: [], possession: '', budget: '', enquiry: plain.enquiry,
  };
  if (!aiIsReachable()) return fallback;
  try {
    const res = await getAi().models.generateContent({
      model: FLASH_MODEL,
      contents: [{ role: 'user', parts: [{ text: CHAT_INSTRUCTIONS }, { text: `Chat:\n${text.slice(0, 12000)}` }] }],
      config: {
        responseMimeType: 'application/json', temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            people: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, phone: { type: Type.STRING }, email: { type: Type.STRING }, role: { type: Type.STRING } } } },
            where: { type: Type.STRING }, type: { type: Type.STRING }, area: { type: Type.NUMBER }, scope: { type: Type.ARRAY, items: { type: Type.STRING } },
            possession: { type: Type.STRING }, budget: { type: Type.STRING }, enquiry: { type: Type.STRING },
          },
        },
      },
    });
    const a = JSON.parse(String(res?.text || '{}').replace(/^```(?:json)?\s*/i, '').replace(/```$/, ''));
    const people = (Array.isArray(a?.people) ? a.people : []).map((p: any) => ({ name: clip(p?.name, 80), phone: clip(p?.phone, 30), email: clip(p?.email, 120), role: clip(p?.role, 60) }))
      .filter((p: any) => p.name || p.phone || p.email).slice(0, 6);
    return {
      people: people.length ? people : fallback.people,
      where: clip(a?.where, 160), type: clip(a?.type, 40), area: Number(a?.area) > 0 ? Math.round(Number(a.area)) : null,
      scope: (Array.isArray(a?.scope) ? a.scope : []).map((x: any) => clip(x, 40)).filter(Boolean).slice(0, 6),
      possession: clip(a?.possession, 40), budget: clip(a?.budget, 60), enquiry: clip(a?.enquiry, 500) || fallback.enquiry,
    };
  } catch {
    return fallback;
  }
}

/* ── The duplicate check across the whole studio (functions/src/leads.ts) ── */

/** A match from the server: names, stage and owner only; `mine` when this person can open it. */
export interface StudioMatch extends Match { mine: boolean; ownerName?: string; stageLabel?: string; title?: string; source?: string }

/**
 * Earlier leads and clients anywhere in the studio with this phone or email,
 * including leads this person cannot open. Null when the check could not run
 * (not deployed yet, offline): the screen keeps its own check meanwhile.
 */
export async function studioMatches(people: { phone: string; email: string }[], ignoreLeadId?: string): Promise<StudioMatch[] | null> {
  if (!functions) return null;
  try {
    const res: any = await httpsCallable(functions, 'leadMatches', { timeout: 30000 })({ people: people.slice(0, 8), ignoreLeadId: ignoreLeadId || '' });
    return Array.isArray(res?.data?.matches) ? res.data.matches : [];
  } catch (e: any) {
    console.warn('Duplicate check', e?.code || e);
    return null;
  }
}

/* ── The public enquiry form (lib/leadForm.ts) ──────────────────────────── */

export interface FormDoor { open: boolean; name?: string | null; logo?: string | null; phone?: string | null; email?: string | null }

/** The studio's name and logo for a form link, or `open: false` when the link is not live. */
export async function formDoor(token: string): Promise<FormDoor> {
  if (!functions) return { open: false };
  const res: any = await httpsCallable(functions, 'leadForm', { timeout: 20000 })({ action: 'door', token });
  return res?.data || { open: false };
}

export async function sendEnquiry(token: string, enquiry: Enquiry): Promise<{ ok: boolean; reason?: string; problems?: string[]; name?: string | null }> {
  if (!functions) return { ok: false, reason: 'offline' };
  const res: any = await httpsCallable(functions, 'leadForm', { timeout: 30000 })({ action: 'submit', token, enquiry });
  return res?.data || { ok: false, reason: 'closed' };
}
