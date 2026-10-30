/*
  The founders' plan, read and saved (lib/founderGoals.ts).

  organizations/{tenantId}/founderGoals/plan: only the two founders may read or
  write it (firestore.rules), because it carries their household costs and the
  studio's cash.
*/
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { DEFAULT_PLAN, planOf, storedPlan, type FounderPlan } from '../lib/founderGoals';

const ref = (tenantId: string) => doc(db!, 'organizations', tenantId, 'founderGoals', 'plan');

/** The founders' plan; the defaults when none is saved; null when it could not be read. */
export async function loadPlan(tenantId: string): Promise<FounderPlan | null> {
  if (!db || !tenantId) return { ...DEFAULT_PLAN };
  try {
    const snap = await getDoc(ref(tenantId));
    return snap.exists() ? planOf(snap.data()) : { ...DEFAULT_PLAN };
  } catch {
    return null;
  }
}

export async function savePlan(tenantId: string, p: FounderPlan, by: string): Promise<FounderPlan> {
  if (!db || !tenantId) throw new Error("Founders' goals needs the studio to be connected to save.");
  const data = storedPlan(p, by, Date.now());
  await setDoc(ref(tenantId), data);
  return planOf(data);
}
