/*
  Each person's own desk (lib/opsTeam.ts): the first-week guide, what they
  moved to a later day, and the notes they leave when they close their day.
  One record each in opsPeople, one per closed day in opsDays
  (firestore.rules). Moving a next step to another day is a change to the
  follow-up itself.
*/
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from './firebaseClient';
import type { GuideStepId, Snoozes } from '../lib/opsTeam';

export interface DeskRecord {
  tenantId: string;
  email: string;
  name: string;
  /** The first time this person opened the desk. */
  startedAt: number;
  guide: Partial<Record<GuideStepId, number>>;
  /** "Hide until tomorrow": the day the guide shows again. */
  guideHiddenUntil: string;
  snoozes: Snoozes;
  updatedAt: number;
}

export interface DayNote {
  tenantId: string;
  email: string;
  name: string;
  day: string;
  closed: string[];
  rolled: { title: string; to: string }[];
  note: string;
  at: number;
  readBy: string[];
}

const deskId = (tenantId: string, email: string) => `${tenantId}__${email.toLowerCase()}`;

/** This person's record, made the first time they open the desk. */
export async function loadDeskRecord(tenantId: string, me: { email: string; name: string }): Promise<DeskRecord> {
  const fresh: DeskRecord = { tenantId, email: me.email.toLowerCase(), name: me.name, startedAt: Date.now(), guide: {}, guideHiddenUntil: '', snoozes: {}, updatedAt: Date.now() };
  if (!db || !tenantId || !me.email) return fresh;
  const snap = await getDoc(doc(db, 'opsPeople', deskId(tenantId, me.email)));
  if (!snap.exists()) {
    await setDoc(doc(db, 'opsPeople', deskId(tenantId, me.email)), fresh).catch(() => undefined);
    return fresh;
  }
  const d: any = snap.data();
  return { ...fresh, ...d, guide: d.guide || {}, snoozes: d.snoozes || {} };
}

export async function saveDeskRecord(r: DeskRecord): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'opsPeople', deskId(r.tenantId, r.email)), {
    tenantId: r.tenantId, email: r.email, name: r.name, startedAt: r.startedAt, guide: r.guide,
    guideHiddenUntil: r.guideHiddenUntil, snoozes: r.snoozes, updatedAt: Date.now(),
  });
}

/** Everyone's records, for the lead's team view. */
export async function loadTeamRecords(tenantId: string): Promise<DeskRecord[]> {
  if (!db || !tenantId) return [];
  const snap = await getDocs(query(collection(db, 'opsPeople'), where('tenantId', '==', tenantId)));
  return snap.docs.map((d) => d.data() as DeskRecord);
}

export async function closeDay(n: Omit<DayNote, 'readBy' | 'at'>): Promise<void> {
  await setDoc(doc(db!, 'opsDays', `${n.tenantId}__${n.email.toLowerCase()}__${n.day}`), { ...n, email: n.email.toLowerCase(), at: Date.now(), readBy: [] });
}

/** This person's note for a day, if they closed it. */
export async function loadMyDay(tenantId: string, email: string, day: string): Promise<DayNote | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'opsDays', `${tenantId}__${email.toLowerCase()}__${day}`)).catch(() => null);
  return snap?.exists() ? (snap.data() as DayNote) : null;
}

/** The team's day-end notes since a day, for the lead. */
export async function loadDayNotes(tenantId: string, sinceDay: string): Promise<DayNote[]> {
  if (!db || !tenantId) return [];
  const snap = await getDocs(query(collection(db, 'opsDays'), where('tenantId', '==', tenantId), where('day', '>=', sinceDay)));
  return snap.docs.map((d) => d.data() as DayNote).sort((a, b) => b.at - a.at);
}

export async function markNoteRead(n: DayNote, me: string): Promise<void> {
  await updateDoc(doc(db!, 'opsDays', `${n.tenantId}__${n.email}__${n.day}`), { readBy: [...new Set([...(n.readBy || []), me.toLowerCase()])].slice(0, 20) });
}

/** Move an open next step to another day. */
export async function moveNextStep(projectId: string, followUpId: string, next: { text: string; ownerEmail: string; ownerName: string; due: string }, to: string, me: string): Promise<void> {
  await updateDoc(doc(db!, `projects/${projectId}/followUps`, followUpId), { next: { ...next, due: to }, nextMovedAt: Date.now(), nextMovedBy: me.toLowerCase() });
}
