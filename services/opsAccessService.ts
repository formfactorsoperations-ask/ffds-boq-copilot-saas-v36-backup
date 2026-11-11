/*
  Saving the Ops Desk's "Who sees what" switches and cover (lib/opsAccess).
  Only the named fields under the studio's opsDesk settings are written, so
  the desk's other settings are never overwritten. The rules let the Owner,
  an Admin or the Ops Director change opsDesk; the server then rebuilds the
  Client Relations copies (functions/src/designView.ts onOpsAccessChange).
*/
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { nextCoverEnd, type OpsAccess, type OpsCover } from '../lib/opsAccess';

export async function saveOpsAccess(tenantId: string, access: OpsAccess): Promise<void> {
  await updateDoc(doc(db!, 'organizations', tenantId), { 'opsDesk.access': access });
}

export async function saveOpsCover(tenantId: string, covers: OpsCover[]): Promise<void> {
  const now = Date.now();
  const live = covers.filter((c) => c.until > now).slice(0, 40);
  await updateDoc(doc(db!, 'organizations', tenantId), { 'opsDesk.cover': live, 'opsDesk.coverNextEnd': nextCoverEnd(live, now) });
}
