import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { ProjectContext } from '../types';
import { buildPortalView, PortalView, PortalStudio, PortalScopeAddition } from '../lib/portalProjection';
import { ClientBoqRow } from '../lib/clientBoq';

/**
 * Reads and writes the client-facing projection at
 * projects/{projectId}/portalView/current.
 *
 * This is the only project data a portal client is allowed to read — Firestore
 * rules grant them this path and deny the project document itself. The studio
 * writes it; the client never does.
 */

const CURRENT = 'current';

function viewRef(projectId: string) {
  return doc(db, 'projects', projectId, 'portalView', CURRENT);
}

/**
 * Rebuild and store the projection for a project.
 *
 * Called whenever what the client should see changes — publishing, unpublishing,
 * or editing something already published. Rebuilding wholesale rather than
 * patching means the stored view can never drift from the visibility state that
 * produced it.
 */
export async function writePortalView(
  projectId: string,
  context: ProjectContext,
  studio?: PortalStudio,
  clientBoq?: ClientBoqRow[],
  clientBoqBaseline?: ClientBoqRow[],
  scopeAdditions?: PortalScopeAddition[],
): Promise<PortalView | null> {
  if (!db || !projectId) return null;
  const view = buildPortalView(projectId, context, studio, clientBoq, clientBoqBaseline, scopeAdditions);
  /*
    Deliberately not caught here.

    This used to log to the console and return null, so a refused write looked
    exactly like a successful one from the outside: the studio pressed the
    button, nothing changed, and the only trace was a console line nobody was
    looking at. A failure to send is the studio's problem to see — the caller
    reports it.
  */
  await setDoc(viewRef(projectId), view as any);
  return view;
}

/** Fetch the projection. Returns null when the studio has not published yet. */
export async function readPortalView(projectId: string): Promise<PortalView | null> {
  if (!db || !projectId) return null;
  try {
    const snap = await getDoc(viewRef(projectId));
    return snap.exists() ? (snap.data() as PortalView) : null;
  } catch (e) {
    console.warn('Could not read portal view for', projectId, e);
    return null;
  }
}

/**
 * Like readPortalView, but says *why* there is nothing.
 *
 * "Not published" and "you are not allowed to read this" both arrive as null
 * through the function above, and they call for opposite responses: publish it,
 * versus fix the rule. Ops needs the difference; the client is still told the
 * same thing either way.
 */
export async function probePortalView(
  projectId: string,
): Promise<{ view: PortalView | null; error?: string }> {
  if (!db || !projectId) return { view: null, error: 'No project open.' };
  try {
    const snap = await getDoc(viewRef(projectId));
    return { view: snap.exists() ? (snap.data() as PortalView) : null };
  } catch (e: any) {
    return { view: null, error: e?.message || String(e) };
  }
}
