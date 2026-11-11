import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseClient';
import type { DriveStatus } from '../lib/googleDrive';

/*
  The browser's side of Google Drive (functions/src/googleDrive.ts). It only
  asks: the token stays on the server, and the studio sees the connection
  through `status`.
*/

/** The googleDrive function is not on the server (not deployed yet): the browser sees a blocked request, reported as "internal". */
export const NOT_DEPLOYED = 'not-deployed';

async function driveCall<T>(action: string, payload: Record<string, unknown> = {}, tenantId?: string): Promise<T> {
  if (!functions) throw new Error('No server is configured.');
  try {
    const res: any = await httpsCallable(functions, 'googleDrive', { timeout: 300000 })({ action, tenantId, ...payload });
    return res.data as T;
  } catch (e: any) {
    const code = String(e?.code || '');
    /* A function that answered says why; one that is missing comes back as a bare "internal" or "not-found". */
    if ((code === 'functions/internal' && /^internal$/i.test(String(e?.message || '').trim())) || code === 'functions/not-found' || code === 'functions/unavailable') {
      throw Object.assign(new Error('The Google Drive service is not on the server yet.'), { code: NOT_DEPLOYED });
    }
    throw e;
  }
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

export type UploadResult = 'copied' | 'already' | 'not-approved' | 'studio' | 'failed';

/** Uploads the drawings operations ticked into the project's folder; returns the folder link and what happened to each. */
export const uploadToDrive = (projectId: string, drawingIds: string[], tenantId?: string) =>
  driveCall<{ link: string; folderName: string; results: Record<string, UploadResult> }>('upload', { projectId, drawingIds }, tenantId);
