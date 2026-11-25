/*
  The client portal's actions on the Clients screen (handoff 5.6; owner's
  decision D4: kept as they are).

  A login is the client's email and a temporary password the studio issues,
  made on the server (createClientLogin, resetClientPassword,
  revokeClientLogin; functions/src/index.ts CLIENT_LOGIN_ROLES), so the studio
  is never signed out of its own account. Each change is also marked on the
  project (lib/clientContacts withPortalMark), which is what the card's state
  and the thread read. The portal link is `?portal=<token>`; reissuing it
  stops the old one working.

  Project changes go through the Clients screen's safe save (App.tsx
  handleClientProjectUpdate), never straight to the database.
*/
import { httpsCallable } from 'firebase/functions';
import { functions as fbFunctions } from '../../services/firebaseClient';
import { issuePortalAccess, portalTokenOf } from '../../services/portalAccessService';
import { publicAppOrigin } from '../../lib/publicUrl';
import { withPortalMark } from '../../lib/clientContacts';
import type { FullProjectData } from '../../types';

export type SaveProject = (projectId: string, patch: Record<string, any>) => Promise<'saved' | 'open'>;

export const portalUrl = (token: string) => `${publicAppOrigin()}/?portal=${token}`;

/** The project's portal link, minted and saved first when it has none (or when asked for a new one). */
export async function portalLink(project: FullProjectData, save: SaveProject, fresh = false): Promise<string> {
  const ctx: any = project.context || {};
  const have = fresh ? null : portalTokenOf(ctx);
  if (have) return portalUrl(have);
  const access = issuePortalAccess(project.id, ctx.clientEmail);
  await save(project.id, { portalAccess: access });
  return portalUrl(access.token);
}

async function callable(name: string, data: Record<string, any>): Promise<any> {
  if (!fbFunctions) throw new Error('Cannot reach the server. Check your connection and try again.');
  const res: any = await httpsCallable(fbFunctions, name)(data);
  return res?.data || {};
}

export interface Issued { email: string; password: string; reset: boolean }

/** Give access: their login made (or its password renewed), and the project marked. */
export async function giveAccess(project: FullProjectData, email: string, name: string, tenantId: string, by: string | null, save: SaveProject): Promise<Issued> {
  const r = await callable('createClientLogin', { email, projectId: project.id, tenantId, clientName: name });
  await save(project.id, { clientPortal: withPortalMark(project.context, email, true, by).clientPortal });
  return { email: r.email || email, password: r.tempPassword || '', reset: false };
}

/** Reset password: a new temporary one, shown once; they must change it at first sign-in. */
export async function resetPassword(project: FullProjectData, email: string, tenantId: string, by: string | null, save: SaveProject): Promise<Issued> {
  const r = await callable('resetClientPassword', { email, tenantId });
  await save(project.id, { clientPortal: withPortalMark(project.context, email, true, by).clientPortal });
  return { email: r.email || email, password: r.tempPassword || '', reset: true };
}

/** Remove access: this project leaves their login (others stay), and is marked taken away. */
export async function removeAccess(project: FullProjectData, email: string, tenantId: string, by: string | null, save: SaveProject): Promise<void> {
  await callable('revokeClientLogin', { email, projectId: project.id, tenantId });
  await save(project.id, { clientPortal: withPortalMark(project.context, email, false, by).clientPortal });
}

/** The invite to send: the link and their username, and the password only when asked. */
export function inviteText(o: { clientName: string; studioName: string; link: string; email: string; password?: string | null }): string {
  const first = o.clientName.trim().split(/\s+/).filter((w) => !/^(mr|mrs|ms|dr)\.?$/i.test(w))[0] || o.clientName.trim();
  return [
    `Hi ${first}, your ${o.studioName} client portal is ready.`,
    `Open: ${o.link}`,
    `Sign in with: ${o.email}`,
    ...(o.password ? [`Temporary password: ${o.password} (you'll be asked to choose your own when you sign in)`] : []),
  ].join('\n');
}
