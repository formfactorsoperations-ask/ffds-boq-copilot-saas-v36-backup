/*
  Closing the client's portal when a project is terminated (lib/termination).

  Two locks, because either can fail on its own:
    1. The portal copy (projects/{id}/portalView/current) is replaced by a
       tombstone. The portal reads nothing else, so what was published is gone
       and the client is told the project is no longer available.
    2. The project is taken off each client login (the `revokeClientLogin`
       Cloud Function), so the copy cannot be read even if it is sent again.

  services/portalRelease refuses to send a terminated project, so the
  tombstone stands until the project is reopened.
*/
import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions as fbFunctions } from './firebaseClient';

export interface PortalCloseResult {
  /** The portal copy was replaced by the tombstone. */
  tombstoned: boolean;
  /** Logins the project was taken off. */
  revoked: string[];
  /** Logins that could not be reached; remove them from Client contacts by hand. */
  failed: string[];
}

export async function closeClientPortal(projectId: string, tenantId: string, emails: string[]): Promise<PortalCloseResult> {
  const out: PortalCloseResult = { tombstoned: false, revoked: [], failed: [] };
  if (!projectId) return out;
  if (db) {
    try {
      await setDoc(doc(db, 'projects', projectId, 'portalView', 'current'), {
        revoked: true,
        revokedAt: new Date().toISOString(),
        revokedBecause: 'terminated',
      });
      out.tombstoned = true;
    } catch (e) {
      console.warn('Could not close the portal copy for', projectId, e);
    }
  }
  for (const email of emails) {
    if (!fbFunctions) { out.failed.push(email); continue; }
    try {
      await httpsCallable(fbFunctions, 'revokeClientLogin')({ email, projectId, tenantId });
      out.revoked.push(email);
    } catch (e) {
      console.warn('Could not take the project off', email, e);
      out.failed.push(email);
    }
  }
  return out;
}
