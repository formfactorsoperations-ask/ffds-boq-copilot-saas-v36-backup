/*
  GOOGLE DRIVE: THE APPROVED DRAWINGS, IN A FOLDER THE CLIENT CAN OPEN.

  The studio connects its main Google account once (Studio settings →
  Google Drive). Then, when operations send a client the approval email,
  they tick which of the meeting's approved drawings go into the project's
  folder, and those are copied, landscape, into one folder per project:

    My Drive / Studio Desk / <Project name> / <Room> – <Drawing> v<n>.pdf

  The project's folder is shared as "anyone with the link can view", and its
  link goes into the approval email. Studio-only sheets (carpentry details
  the Design Head kept in the studio) are never copied: the folder is the
  client's.

  The app asks Google for `drive.file` only: it can see and change the files
  and folders it created, and nothing else in the account.

  Shared by the browser (Studio settings, the approval email) and the
  googleDrive Cloud Functions, which hold the account's token.
*/

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const ROOT_FOLDER = 'Studio Desk';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Who may connect or disconnect the studio's Drive: it speaks for the whole studio. */
export const DRIVE_ADMIN_ROLES = new Set(['Owner', 'Admin', 'Super Admin']);

/** A name Drive shows as it is: no slashes, no control characters, not too long. */
export function driveName(raw: string, max = 120): string {
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\\/]+/g, '-').replace(/\s+/g, ' ').trim();
  return (s || 'Untitled').slice(0, max);
}

/** The project's folder: its name, as the studio calls it. */
export const projectFolderName = (projectName: string | null | undefined) => driveName(projectName || 'Project');

/** "Master Bedroom – Wardrobe detail v2.pdf": the room first, unless the drawing's name already says it. */
export function drawingFileName(room: string | null | undefined, name: string, versionNo: number): string {
  const r = String(room || '').trim();
  const general = !r || /general|project-wide/i.test(r);
  const base = general || name.toLowerCase().includes(r.toLowerCase()) ? name : `${r} – ${name}`;
  return `${driveName(base, 150)} v${Math.max(1, Math.floor(versionNo) || 1)}.pdf`;
}

/** Drive's own page for a folder. */
export const folderLink = (folderId: string) => `https://drive.google.com/drive/folders/${folderId}`;

/** What the studio sees about the connection; never the token. */
export interface DriveStatus {
  connected: boolean;
  email: string | null;
  connectedAt: number | null;
  connectedBy: string | null;
  /** The last copy that failed, so the studio can see why. */
  lastError?: { at: number; message: string } | null;
}

/** The redirect address Google sends the studio back to: the driveOAuthCallback function. */
export const callbackUrl = (projectId: string, region = 'us-central1') =>
  `https://${region}-${projectId}.cloudfunctions.net/driveOAuthCallback`;
