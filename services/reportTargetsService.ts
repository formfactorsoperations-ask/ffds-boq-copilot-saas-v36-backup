/*
  The owner's report targets, read and saved (lib/reportTargets.ts).

  organizations/{tenantId}/ownerReports/targets: only the Owner, Admin and Ops
  Director may read or write it (firestore.rules), because it carries the
  studio's monthly overheads.
*/
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { DEFAULT_TARGETS, storedTargets, targetsOf, type ReportTargets } from '../lib/reportTargets';

const ref = (tenantId: string) => doc(db!, 'organizations', tenantId, 'ownerReports', 'targets');

/** The studio's targets; the defaults when none are saved; null when they could not be read. */
export async function loadTargets(tenantId: string): Promise<ReportTargets | null> {
  if (!db || !tenantId) return { ...DEFAULT_TARGETS };
  try {
    const snap = await getDoc(ref(tenantId));
    return snap.exists() ? targetsOf(snap.data()) : { ...DEFAULT_TARGETS };
  } catch {
    return null;
  }
}

export async function saveTargets(tenantId: string, t: ReportTargets, by: string): Promise<ReportTargets> {
  if (!db || !tenantId) throw new Error('Reports needs the studio to be connected to save targets.');
  const data = storedTargets(t, by, Date.now());
  await setDoc(ref(tenantId), data);
  return targetsOf(data);
}
