import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseClient';
import type { DriveStatus } from '../lib/googleDrive';

/*
  The browser's side of Google Drive (functions/src/googleDrive.ts). It only
  asks: the token stays on the server, and the studio sees the connection
  through `status`.
*/

async function driveCall<T>(action: string, payload: Record<string, unknown> = {}, tenantId?: string): Promise<T> {
  if (!functions) throw new Error('No server is configured.');
  const res: any = await httpsCallable(functions, 'googleDrive', { timeout: 60000 })({ action, tenantId, ...payload });
  return res.data as T;
}

export const driveStatus = (tenantId?: string) => driveCall<DriveStatus>('status', {}, tenantId);

/** Sends the studio to Google to allow the app, and back to this page after. */
export async function connectDrive(tenantId?: string) {
  const { url } = await driveCall<{ url: string }>('start', { returnTo: `${window.location.origin}${window.location.pathname}` }, tenantId);
  window.location.assign(url);
}

export const disconnectDrive = (tenantId?: string) => driveCall<DriveStatus>('disconnect', {}, tenantId);

/** The project's shared folder, for the approval email; null while Drive is not connected. */
export const projectDriveLink = (projectId: string, tenantId?: string) =>
  driveCall<{ link: string | null }>('folder', { projectId }, tenantId).then((r) => r.link).catch(() => null);
