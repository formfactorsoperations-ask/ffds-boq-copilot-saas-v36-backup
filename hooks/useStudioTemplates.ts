import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { TemplateData } from '../lib/standardPackages';

/**
 * The studio's Standard templates, saved when someone edits them.
 *
 * Templates were loaded from the database (master_data/templates_<tenant>) but
 * no edit was ever written back: Templates & Bank changed them on screen only,
 * so a typology, a room's items or the Option setup was gone on the next
 * reload, and nobody else in the studio ever saw it. The Item bank had a
 * one-second autosave in App.tsx; templates never did.
 *
 * Two setters, because loading must never write:
 *
 *   setTemplates   for what was read (sign-in, a tenant switch). Not saved: if
 *                  the read timed out and fell back to the defaults, saving
 *                  them would overwrite the studio's real templates.
 *   editTemplates  for a person's change (the editors). Saved a second after
 *                  the last change, like the Item bank, and at once if the
 *                  page is closed before then.
 */
export function useStudioTemplates(
  initial: TemplateData,
  save: (templates: TemplateData) => Promise<void> | void,
  delay = 1000,
) {
  const [templates, setState] = useState<TemplateData>(initial);
  /* An edit waiting to be saved. */
  const edited = useRef(false);
  const latest = useRef(templates);
  latest.current = templates;
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    if (!edited.current) return;
    edited.current = false;
    try {
      Promise.resolve(saveRef.current(latest.current)).catch(err => console.error('Could not save the templates:', err));
    } catch (err) {
      console.error('Could not save the templates:', err);
    }
  }, []);

  /** What was read: replaces the templates, and any edit not yet saved, without saving. */
  const setTemplates = useCallback<Dispatch<SetStateAction<TemplateData>>>((next) => {
    edited.current = false;
    setState(next);
  }, []);

  /** A person's change: saved a moment after the last one. */
  const editTemplates = useCallback<Dispatch<SetStateAction<TemplateData>>>((next) => {
    edited.current = true;
    setState(next);
  }, []);

  useEffect(() => {
    if (!edited.current) return;
    const t = setTimeout(flush, delay);
    return () => clearTimeout(t);
  }, [templates, delay, flush]);

  /* Closing the tab within the second still saves the edit. */
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);

  return { templates, setTemplates, editTemplates };
}
