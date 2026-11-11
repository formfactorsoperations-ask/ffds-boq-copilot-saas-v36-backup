/*
  The Friday digest's records (lib/fridayDigest.ts): one per project per week
  at projects/{projectId}/digests/{week}. The rules decide who may write,
  approve and mark one sent; the email goes through sendFridayDigest, which
  checks the approval again on the server.
*/
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseClient';
import type { Digest } from '../lib/fridayDigest';

const ref = (projectId: string, week: string) => doc(db!, `projects/${projectId}/digests`, week);

/** This week's digest for each project; a project with none, or that cannot be read, is left out. */
export async function loadDigests(projectIds: string[], week: string): Promise<Record<string, Digest>> {
  if (!db) return {};
  const out: Record<string, Digest> = {};
  await Promise.all(projectIds.slice(0, 120).map(async (id) => {
    const snap = await getDoc(ref(id, week)).catch(() => null);
    if (snap?.exists()) out[id] = snap.data() as Digest;
  }));
  return out;
}

export async function saveDigest(d: Digest): Promise<Digest> {
  const next = { ...d, updatedAt: Date.now() };
  await setDoc(ref(d.projectId, d.week), next);
  return next;
}

export async function markSentOnWhatsApp(d: Digest, me: string): Promise<Digest> {
  const patch = { status: 'sent' as const, sentAt: Date.now(), sentBy: me.toLowerCase(), sentVia: 'whatsapp' as const, updatedAt: Date.now() };
  await updateDoc(ref(d.projectId, d.week), patch);
  return { ...d, ...patch };
}

export async function emailDigest(d: Pick<Digest, 'projectId' | 'week'>): Promise<{ sent: boolean; sandbox: boolean; to: string[] }> {
  const res: any = await httpsCallable(functions, 'sendFridayDigest', { timeout: 30000 })({ projectId: d.projectId, week: d.week });
  return res.data;
}
