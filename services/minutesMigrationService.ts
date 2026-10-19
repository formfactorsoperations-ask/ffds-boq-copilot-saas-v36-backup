import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from './firebaseClient';
import { projectFromDoc } from './dbService';
import { isVisibleToClient } from '../lib/clientVisibility';
import { planMigration, migratedFields, KEEP_DAYS, type MigrationCandidate, type MigrationPlan, type ProjectSources } from '../lib/minutesMigration';

/*
  Bringing older minutes into the new format (lib/minutesMigration.ts), for
  Studio settings → Minutes.

  Every run is recorded beside the studio's minutes:

    organizations/{org}/minutesMigration/{runId}            who, when, how many
    organizations/{org}/minutesMigration/{runId}/items/{k}  each record, and for
                                                             minutes changed in
                                                             place the original

  The original is written before the minutes are touched, so an undo always
  has something to put back. Undo is offered for KEEP_DAYS.
*/

const DAY = 86400000;
const runs = (tenantId: string) => collection(db, `organizations/${tenantId}/minutesMigration`);
const momDoc = (tenantId: string, projectId: string, momId: string) => doc(db, `organizations/${tenantId}/projects/${projectId}/moms`, momId);
const rows = (snap: any) => snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
const itemId = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 300);

/** Firestore refuses `undefined`; drop it (it means "not set"). Timestamps are kept as they are. */
function clean(v: any): any {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: any = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = clean(x);
    return out;
  }
  return v;
}

/** Every project of the studio, with its older minutes from all four places. */
async function sourcesOf(tenantId: string): Promise<ProjectSources[]> {
  const snap = await getDocs(query(collection(db, 'projects'), where('tenantId', '==', tenantId)));
  const projects = snap.docs.map((d) => projectFromDoc(d.id, d.data())).filter(Boolean) as any[];
  const quiet = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  return Promise.all(projects.map(async (p) => {
    const [moms, projectCopies, visits] = await Promise.all([
      quiet(getDocs(collection(db, `organizations/${tenantId}/projects/${p.id}/moms`)).then(rows), [] as any[]),
      quiet(getDocs(collection(db, `projects/${p.id}/moms`)).then(rows), [] as any[]),
      quiet(getDocs(collection(db, `organizations/${tenantId}/projects/${p.id}/siteVisits`)).then(rows), [] as any[]),
    ]);
    return {
      projectId: String(p.id),
      projectName: String(p.context?.name || p.name || 'Project'),
      moms, projectCopies, visits,
      history: Array.isArray(p.context?.momHistory) ? p.context.momHistory : [],
    };
  }));
}

/** The check: nothing is changed. */
export async function checkOlderMinutes(tenantId: string, team: { name: string }[]): Promise<MigrationPlan> {
  return planMigration(await sourcesOf(tenantId), team, (m) => isVisibleToClient(m));
}

export interface MigrationRun {
  id: string;
  at: number;
  by: string;
  byName: string;
  count: number;
  done: number;
  failed: number;
  expiresAt: number;
  state: 'applying' | 'applied' | 'undone';
  undoneAt?: number | null;
}

/** Bring the chosen minutes across. Each is recorded, with its original, before it changes. */
export async function applyMigration(tenantId: string, chosen: MigrationCandidate[], me: { email: string; name: string },
  onProgress?: (done: number) => void): Promise<MigrationRun> {
  const now = Date.now();
  const runRef = doc(runs(tenantId));
  const run: MigrationRun = { id: runRef.id, at: now, by: me.email, byName: me.name, count: chosen.length, done: 0, failed: 0, expiresAt: now + KEEP_DAYS * DAY, state: 'applying' };
  await setDoc(runRef, run);
  for (const c of chosen) {
    try {
      const { id: _id, ...original } = c.raw || {};
      await setDoc(doc(runRef, 'items', itemId(c.key)), clean({
        key: c.key, source: c.source, projectId: c.projectId, momId: c.momId, momRef: c.momRef,
        mode: c.source === 'moms' ? 'updated' : 'created',
        original: c.source === 'moms' ? original : null,
      }));
      const fields = clean(migratedFields(c, me, run.id, now));
      if (c.source === 'moms') await updateDoc(momDoc(tenantId, c.projectId, c.momId), fields);
      else await setDoc(momDoc(tenantId, c.projectId, c.momId), fields);
      run.done++;
    } catch (e) {
      console.warn('Could not bring older minutes across', c.key, e);
      run.failed++;
    }
    onProgress?.(run.done + run.failed);
  }
  run.state = 'applied';
  await updateDoc(runRef, { done: run.done, failed: run.failed, state: run.state });
  return run;
}

/** The latest run, for its undo. */
export async function lastMigration(tenantId: string): Promise<MigrationRun | null> {
  const snap = await getDocs(query(runs(tenantId), orderBy('at', 'desc'), limit(1)));
  return snap.empty ? null : (rows(snap)[0] as MigrationRun);
}

/** Put every record of a run back as it was: originals restored, copies removed. */
export async function undoMigration(tenantId: string, runId: string): Promise<{ restored: number; failed: number }> {
  const runRef = doc(runs(tenantId), runId);
  const run = await getDoc(runRef);
  if (!run.exists()) throw new Error('That run is not on record.');
  if (Date.now() > Number(run.data()?.expiresAt || 0)) throw new Error(`Originals are kept for ${KEEP_DAYS} days; this run is older.`);
  const items = rows(await getDocs(collection(runRef, 'items')));
  let restored = 0;
  let failed = 0;
  for (const it of items) {
    try {
      const ref = momDoc(tenantId, it.projectId, it.momId);
      if (it.mode === 'updated' && it.original) await setDoc(ref, it.original);
      else if (it.mode === 'created') await deleteDoc(ref);
      restored++;
    } catch (e) {
      console.warn('Could not undo', it.key, e);
      failed++;
    }
  }
  await updateDoc(runRef, { state: 'undone', undoneAt: Date.now() });
  return { restored, failed };
}
