/*
  Uploaded cover photos (DESIGN.md "Projects: journey, needs you, one list",
  Cover photos).

  "Upload cover" in a project's Details puts the photo in Firebase Storage at
  projects/{projectId}/cover/, beside the decision drawings, under the same
  Storage rule (studio staff of the project's studio, 25 MB at most). The
  project keeps only the address (context.coverPhoto). A new upload removes
  the one it replaces, so a project holds one uploaded cover at a time.
*/
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebaseClient';

/** Larger than this is refused before it is sent: a cover is drawn at most 860px wide. */
export const COVER_MAX_BYTES = 10 * 1024 * 1024;

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };

/** Why a file cannot be a cover, in words for the person choosing it, or null when it can. */
export function coverFileProblem(file: { type?: string; size?: number } | null | undefined): string | null {
  if (!file) return 'Choose a photo first.';
  if (!EXT[String(file.type || '')]) return 'Choose a JPG, PNG, WebP, AVIF or GIF photo.';
  if ((file.size || 0) > COVER_MAX_BYTES) return 'That photo is over 10 MB. Choose a smaller one.';
  return null;
}

export async function uploadCover(projectId: string, file: File, replaces?: string | null): Promise<{ url: string; storagePath: string }> {
  const problem = coverFileProblem(file);
  if (problem) throw new Error(problem);
  if (!storage) throw new Error('Storage is not connected, so the photo could not be uploaded.');
  const storagePath = `projects/${projectId}/cover/${Date.now()}.${EXT[file.type]}`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file, { contentType: file.type, cacheControl: 'public, max-age=31536000' });
  const url = await getDownloadURL(fileRef);
  if (replaces && replaces !== storagePath) await removeCover(replaces);
  return { url, storagePath };
}

/**
 * The studio's default project photo (Studio settings; lib/defaultPhotos):
 * kept at studios/{tenantId}/projectPhoto/, under the studio's own Storage
 * rule. The settings draft decides when it is used, so an earlier photo is
 * left where it is until the studio saves.
 */
export async function uploadStudioPhoto(tenantId: string, file: File): Promise<{ url: string; storagePath: string }> {
  const problem = coverFileProblem(file);
  if (problem) throw new Error(problem);
  if (!storage) throw new Error('Storage is not connected, so the photo could not be uploaded.');
  if (!tenantId) throw new Error('Which studio? Sign in again and retry.');
  const storagePath = `studios/${tenantId}/projectPhoto/${Date.now()}.${EXT[file.type]}`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file, { contentType: file.type, cacheControl: 'public, max-age=31536000' });
  return { url: await getDownloadURL(fileRef), storagePath };
}

/** Take an uploaded cover out of Storage. A cover already gone is not an error. */
export async function removeCover(storagePath: string): Promise<void> {
  if (!storage || !storagePath.startsWith('projects/')) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    /* Already gone, or not ours to delete: the project stops pointing at it either way. */
  }
}
