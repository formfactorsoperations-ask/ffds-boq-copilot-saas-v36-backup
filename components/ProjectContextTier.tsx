import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Phone, Ruler, Palette, Flag, Info, X, Mail, Maximize2 } from '@/lib/lucide-shim';
import { ProjectContext } from '../types';
import { ImageUp } from 'lucide-react';
import { auth } from '../services/firebaseClient';
import { coverOf, COVER_SOURCE_WORDS, isDefaultSource } from '../lib/coverPhoto';
import { useOrg } from '../contexts/OrgContext';
import { uploadCover, removeCover, coverFileProblem } from '../services/coverStorage';
import { Button } from './ui/kit';
import './projectHeader/projectHeader.css';

interface Props {
  projectContext: ProjectContext;
  /** With both of these, the drawer offers "Upload cover" (Phase 2 of the Projects screen). */
  projectId?: string | null;
  setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

/**
 * The cover photo, at the top of the drawer: the photo the Projects screen
 * shows for this project (lib/coverPhoto), with "Upload cover" and, for an
 * uploaded or picked cover, "Remove cover". Studio only: the client's portal
 * does not show it.
 */
export function CoverPhotoPanel({ projectContext, projectId, setProjectContext }: Required<Pick<Props, 'projectContext'>> & {
  projectId: string;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { orgData } = useOrg();
  const cover = coverOf(projectContext, 900, { studioPhoto: orgData?.defaultProjectPhoto?.url, project: { id: projectId, context: projectContext } });
  const set = projectContext.coverPhoto;
  useEffect(() => setFailed(false), [cover.url]);

  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = '';
    const bad = coverFileProblem(file);
    if (bad || !file) { setProblem(bad); return; }
    setBusy(true);
    setProblem(null);
    try {
      const { url, storagePath } = await uploadCover(projectId, file, set?.source === 'upload' ? set.storagePath : null);
      const by = auth?.currentUser?.email || undefined;
      setProjectContext((prev) => ({ ...prev, coverPhoto: { url, source: 'upload', storagePath, setAt: Date.now(), ...(by ? { setBy: by } : {}) } }));
    } catch (e: any) {
      setProblem(e?.message || 'The photo could not be uploaded. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (set?.source === 'upload' && set.storagePath) await removeCover(set.storagePath);
    setProjectContext((prev) => ({ ...prev, coverPhoto: null }));
  };

  return (
    <section aria-label="Cover photo" className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Cover photo</p>
      <div className="relative h-40 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
        {cover.url && !failed ? (
          <img src={cover.url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400">
            <Ruler className="w-5 h-5" aria-hidden />
            <span className="text-[11px] font-bold">No render yet</span>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5">
        {cover.url && !failed ? COVER_SOURCE_WORDS[cover.source] : 'Upload a photo, or set a render as the cover under Drawings → Renders.'} The Projects screen shows it; the client does not see it.
      </p>
      <div className="flex flex-wrap gap-2 mt-2.5">
        <Button size="sm" variant="secondary" icon={ImageUp} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Uploading…' : 'Upload cover'}
        </Button>
        {set && !busy && <Button size="sm" variant="quiet" onClick={remove}>Remove cover</Button>}
        {isDefaultSource(cover.source) && !failed && <span className="self-center text-[11px] font-semibold text-slate-500">No render yet</span>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="hidden"
          aria-label="Choose a cover photo" onChange={(e) => choose(e.target.files?.[0])} />
      </div>
      {problem && <p role="alert" className="text-[11px] font-semibold text-rose-700 mt-1.5">{problem}</p>}
    </section>
  );
}

/**
 * The project's facts, in a drawer that slides in from the right.
 *
 * They used to open inline under the project bar, which pushed the bar onto
 * three rows every time -- and the Designer picker lived in there too. The bar
 * now stays one line (H1 in the header mockups); the facts come out of the
 * way when asked for, and who works on the project is the team faces in the
 * bar itself (ProjectTeamButton).
 */
export const ProjectContextTier: React.FC<Props> = ({ projectContext, projectId, setProjectContext }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  // `cap` only where the value is a word from a list; never on an email.
  const facts: { icon: React.ElementType; label: string; value: string; meta?: string; cap?: boolean }[] = [
    { icon: MapPin, label: 'Location', value: projectContext.location || 'No location set', meta: projectContext.name || undefined },
    { icon: Phone, label: 'Contact', value: projectContext.clientPhone || 'No telephone', meta: projectContext.clientName || 'Unnamed client' },
    { icon: Mail, label: 'Client email', value: projectContext.clientEmail || '—' },
    { icon: Ruler, label: 'Configuration', value: projectContext.config || 'Not set', meta: projectContext.area ? `${projectContext.area} sq ft` : 'Area not set' },
    { icon: Maximize2, label: 'Ceiling', value: `${projectContext.ceilingHeight || 9.5} ft` },
    { icon: Palette, label: 'Style', value: projectContext.theme || 'Not specified', cap: true },
    { icon: Flag, label: 'Milestone', value: String(projectContext.status || 'lead').replace(/_/g, ' '), cap: true },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="phd-lift flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-[#3D52A0] bg-sky-50 border border-sky-100 hover:bg-sky-100 shrink-0 cursor-pointer"
      >
        <Info className="w-3.5 h-3.5" />
        Details
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[300]" role="dialog" aria-label="Project details">
          <div className="phd-scrim absolute inset-0 bg-[#12182F]/25 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="phd-drawer absolute top-0 right-0 bottom-0 w-full max-w-[380px] bg-white border-l border-slate-200 shadow-2xl p-5 overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Project details</p>
                <h2 className="text-[17px] font-extrabold text-slate-900 leading-tight mt-1">{projectContext.name || 'Untitled project'}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            {projectId && setProjectContext && (
              <CoverPhotoPanel projectContext={projectContext} projectId={projectId} setProjectContext={setProjectContext} />
            )}
            <div className="grid gap-2">
              {facts.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.label} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <span className="w-8 h-8 rounded-xl grid place-items-center bg-[#E8ECFB] text-[#3D52A0] shrink-0"><Icon className="w-4 h-4" /></span>
                    <div className="min-w-0">
                      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{f.label}</div>
                      <div className={`text-[13.5px] font-bold text-slate-900 break-words ${f.cap ? 'capitalize' : ''}`}>{f.value}</div>
                      {f.meta && <div className="text-[11.5px] text-slate-500 break-words">{f.meta}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
};

export default ProjectContextTier;
