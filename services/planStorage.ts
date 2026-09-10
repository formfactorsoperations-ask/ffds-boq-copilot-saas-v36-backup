/*
  Floor plans live in Storage, not in the project document.

  A downscaled plan still weighs 200-270KB as base64, and it was being written
  into `context.floorplanImage` — inside a document Firestore caps at 1 MiB,
  which is also carrying the BOQ, the engagement record and every proposal
  version. The platform console found ten projects past 60% of that cap, one at
  95%. The save path's existing answer was to silently drop the plan and the
  logo from the cloud copy once the document got too big, so the failure mode
  was already live: the studio kept a plan locally that no longer existed in
  the cloud.

  Storage has no such ceiling, and the document keeps a URL of about a hundred
  bytes. The upload path mirrors the one deliverables and decision drawings
  already use, so it inherits whatever bucket rules those rely on.
*/

import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from './firebaseClient';

/**
 * What kind of file a base64 payload holds.
 *
 * `downscalePlanToBase64` returns a JPEG when it re-encoded the image and the
 * original bytes when it did not — a PNG, or a PDF plan — so the type cannot be
 * assumed from the fact that it came back. Storage needs the right content type
 * or the browser will download the file instead of displaying it.
 */
function sniffContentType(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('JVBERi0')) return 'application/pdf';
  if (base64.startsWith('R0lGODdh') || base64.startsWith('R0lGODlh')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'application/octet-stream';
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/octet-stream': 'bin',
};

/**
 * Put a base64 plan in Storage and return the URL to keep in the document.
 *
 * Not keyed by project id: the setup wizard uploads a plan before the project
 * has been created, so a plan that had to wait for an id would either be held
 * in the document — the thing this exists to prevent — or lost if setup were
 * abandoned halfway.
 */
export async function uploadPlanImage(tenantId: string | undefined, base64: string, kind = 'plans'): Promise<string> {
  if (!base64) throw new Error('No plan to upload');

  const contentType = sniffContentType(base64);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `studios/${tenantId || 'demo-tenant-01'}/${kind}/${id}.${EXT[contentType] || 'bin'}`;

  const fileRef = ref(storage, path);
  await uploadString(fileRef, base64, 'base64', { contentType });
  return await getDownloadURL(fileRef);
}

/** How big a base64 payload is once decoded, in KB. */
export function base64KB(base64: string): number {
  if (!base64) return 0;
  return Math.round((base64.length * 3) / 4 / 1024);
}
