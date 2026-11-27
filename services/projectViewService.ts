import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { useOrg } from '../contexts/OrgContext';
import { cleanView, mayChooseView, resolveProjectView, studioWorkspaceOf, type ProjectView, type StudioWorkspaceChoice } from '../lib/projectView';

/*
  A PERSON'S OWN PROJECT VIEW (lib/projectView.ts).

  Kept on their inbox's own document (inbox/{email}), beside their
  notification settings (services/notifyPrefsService), so a choice made on the
  laptop holds on the phone. firestore.rules let the person write
  `projectView` there. A copy is kept in this browser so the right view draws
  from the first second, before Firestore answers.
*/

const local = (email: string) => `studiodesk.projectView.${email}`;
const boxOf = (email: string | null | undefined) => (email ? `inbox/${String(email).toLowerCase()}` : null);

const cached = (email: string | null | undefined): ProjectView | null => {
  if (!email) return null;
  try { return cleanView(window.localStorage.getItem(local(email.toLowerCase()))); } catch { return null; }
};

export async function readPersonalView(email: string | null | undefined): Promise<ProjectView | null> {
  const box = boxOf(email);
  if (!box || !db) return cached(email);
  try {
    const snap = await getDoc(doc(db, box));
    const v = cleanView(snap.exists() ? (snap.data() as any)?.projectView : null);
    try {
      if (v) window.localStorage.setItem(local(email!.toLowerCase()), v);
      else window.localStorage.removeItem(local(email!.toLowerCase()));
    } catch { /* private window */ }
    return v;
  } catch {
    return cached(email);
  }
}

export async function savePersonalView(email: string | null | undefined, view: ProjectView): Promise<void> {
  const box = boxOf(email);
  if (!box) return;
  try { window.localStorage.setItem(local(email!.toLowerCase()), view); } catch { /* private window */ }
  if (!db) return;
  await setDoc(doc(db, box), { projectView: view, updatedAt: Date.now() }, { merge: true });
}

export interface ProjectViewState {
  view: ProjectView;
  studio: StudioWorkspaceChoice;
  personal: ProjectView | null;
  canChoose: boolean;
  setView: (v: ProjectView) => void;
}

/** The view this person sees, and a way to change their own. */
export function useProjectView(): ProjectViewState {
  const { orgData, currentUserAuth } = useOrg() as any;
  const email: string | null = currentUserAuth?.email || null;
  const studio = studioWorkspaceOf(orgData);
  const [personal, setPersonal] = useState<ProjectView | null>(() => cached(email));
  useEffect(() => {
    let live = true;
    setPersonal(cached(email));
    readPersonalView(email).then((v) => { if (live) setPersonal(v); });
    return () => { live = false; };
  }, [email]);
  const setView = useCallback((v: ProjectView) => {
    setPersonal(v);
    savePersonalView(email, v).catch((e) => console.warn('Project view not saved', e?.code || e));
  }, [email]);
  return { view: resolveProjectView(studio, personal), studio, personal, canChoose: mayChooseView(studio), setView };
}
