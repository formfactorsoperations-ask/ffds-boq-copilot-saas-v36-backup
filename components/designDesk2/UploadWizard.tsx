import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, FileUp, Loader2, Send, X } from 'lucide-react';
import { uploadSheet, type ReviewDrawing } from '../../services/drawingReviewService';
import { allowed, matchFile, refusal, stateOf, MAX_PDF_BYTES } from '../../lib/drawingReview';
import { thumbnailOf, pageCountOf } from '../../lib/pdfRender';
import { landscapeFile, portraitPages } from '../../lib/pdfLandscape';
import { roomLabel, useToast } from '../drawingReview/ui';
import type { Me } from '../drawingReview/SheetStudio';
import { Btn, cx } from './parts';
import '../projectHeader/projectHeader.css';

/*
  THE THREE-STEP UPLOAD (Design Desk 2.0, Phase 1).

  One drawing, one PDF, three small steps: choose the PDF, check it is the
  right drawing, send it to the Design Head. The checks are today's: the name
  match from Add PDFs (lib/drawingReview matchFile), portrait pages turned to
  landscape (lib/pdfLandscape), and the server deciding whether this drawing
  can take a new PDF now (uploadSheet). Nothing is uploaded until step three.
*/

interface Props {
  orgId: string;
  me: Me;
  drawing: ReviewDrawing;
  projectName: string;
  /** The project's drawings, to notice a file named after a different one. */
  siblings: ReviewDrawing[];
  onClose: () => void;
  /** After a successful upload. `sent` is whether it went to the Design Head. */
  onDone?: (sent: boolean) => void;
}

const STEPS = ['Choose the PDF', 'Check it', 'Send it'];

export default function UploadWizard({ orgId, me, drawing: d, projectName, siblings, onClose, onDone }: Props) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  /* What step two shows: page one as it will be stored, how many pages, how many were turned. */
  const [look, setLook] = useState<{ url: string | null; pages: number | null; turned: number } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<{ label: string; fraction?: number } | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const nextNo = (d.review?.versionNo || 0) + 1;
  const blocked = !allowed('finalize', d.review) ? refusal('finalize', d.review) : null;
  const fixing = stateOf(d.review) === 'CHANGES_REQUESTED';
  const openNotes = d.review?.marksOpen || 0;

  /* A file named after another drawing of this project is worth a second look; it is never refused for its name. */
  const other = (() => {
    if (!file) return null;
    const m = matchFile(file.name, siblings.map((s) => ({ id: s.id, name: s.name, roomName: s.roomName })));
    if (m.kind !== 'exact' || m.id === d.id) return null;
    return siblings.find((s) => s.id === m.id) || null;
  })();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  /* Step two's preview: drawn from the file as it will be stored, so a turned page shows turned. */
  useEffect(() => {
    if (!file) { setLook(null); return; }
    let live = true;
    let made: string | null = null;
    setLook(null);
    (async () => {
      let stored = file, turned = 0;
      try {
        const portrait = await portraitPages(await file.arrayBuffer());
        if (portrait) { const t = await landscapeFile(file, 'right'); stored = t.file; turned = t.turned; }
      } catch { /* a PDF that cannot be read is caught by the server's check */ }
      const [blob, pages] = await Promise.all([thumbnailOf(stored, 720).catch(() => null), pageCountOf(stored).catch(() => null)]);
      if (!live) return;
      made = blob ? URL.createObjectURL(blob) : null;
      setLook({ url: made, pages, turned });
    })();
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [file]);

  function choose(f: File | undefined | null) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) { setProblem(/\.(dwg|dxf)$/i.test(f.name) ? 'That is a CAD file. Export the drawing as a PDF and choose that.' : 'Only a PDF can be uploaded. Export the drawing as a PDF and choose that.'); return; }
    if (f.size >= MAX_PDF_BYTES) { setProblem('That PDF is over 25 MB. Export it smaller and try again.'); return; }
    setProblem(null); setFile(f); setStep(1);
  }

  async function upload(submit: boolean) {
    if (!file) return;
    setBusy({ label: 'Getting the PDF ready…' });
    try {
      const { file: stored } = await landscapeFile(file, 'right').catch(() => ({ file }));
      const thumb = await thumbnailOf(stored).catch(() => null);
      const res = await uploadSheet({ orgId, projectId: d.projectId, drawingId: d.id }, me.uid, stored, {
        thumb, submit, note: note.trim(), expectedRev: d.review?.rev,
        onStage: (stage, fraction) => setBusy({ label: stage === 'uploading' ? 'Uploading…' : 'Checking the PDF…', fraction }),
      });
      toast(submit
        ? { ok: true, title: `${d.name} is with the Design Head`, sub: `v${res?.versionNo || nextNo} was sent. Nothing goes to the client from here.` }
        : { ok: true, title: `v${res?.versionNo || nextNo} is saved`, sub: 'It is not sent yet. Send it to the Design Head when you are ready.' });
      onDone?.(submit);
      onClose();
    } catch (e: any) {
      toast({ title: 'Upload not saved', sub: e?.message });
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label={`Upload ${d.name}`}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />
      <div className="phd-pop relative w-full max-w-[640px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 px-6 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Upload a drawing · step {step + 1} of 3</p>
            <h2 className="mt-1 truncate text-xl font-bold text-slate-800">{d.name}</h2>
            <p className="truncate text-sm text-slate-500">{projectName} · {roomLabel(d.roomName)} · this will be v{nextNo}</p>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X size={20} /></button>
        </div>

        <ol className="flex gap-2 px-6" aria-label="Upload steps">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined} className={cx('flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold', i === step ? 'flex-1' : 'flex-none sm:flex-1', i === step ? 'bg-emerald-50 text-emerald-800' : i < step ? 'text-emerald-700' : 'text-slate-400')}>
              <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs', i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400')}>{i < step ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
              <span className={cx('truncate', i !== step && 'hidden sm:inline')}>{label}</span>
            </li>
          ))}
        </ol>

        <div className="px-6 py-5">
          {blocked ? (
            <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden /><div><b className="block text-base">This drawing cannot take a new PDF right now</b>{blocked}</div></div>
          ) : step === 0 ? (
            <>
              {fixing && <p className="mb-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">The Design Head asked for {openNotes ? `${openNotes} change${openNotes === 1 ? '' : 's'}` : 'changes'}. Upload the drawing again once they are made.</p>}
              <button type="button" onClick={() => picker.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]); }}
                className={cx('grid w-full place-items-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors', over ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-emerald-500 hover:bg-emerald-50')}>
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-600 text-white"><FileUp size={26} aria-hidden /></span>
                <span className="mt-3 block text-lg font-bold text-slate-800">Choose the PDF of this drawing</span>
                <span className="mt-1 block text-sm text-slate-500">Or drag it here. One PDF, up to 25 MB.</span>
              </button>
              <input ref={picker} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
              {problem && <p role="alert" className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{problem}</p>}
            </>
          ) : step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="grid aspect-[1.414/1] place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {!look ? <Loader2 className="animate-spin text-slate-400" aria-label="Drawing the first page" />
                  : look.url ? <img src={look.url} alt={`First page of ${file?.name}`} className="h-full w-full object-contain" />
                    : <span className="px-4 text-center text-sm text-slate-500">No preview for this PDF. It can still be uploaded.</span>}
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-800">Is this the right drawing?</p>
                <dl className="mt-2 grid gap-2 text-sm">
                  <div><dt className="text-slate-500">Your file</dt><dd className="break-words font-semibold text-slate-800">{file?.name}</dd></div>
                  <div><dt className="text-slate-500">Goes on</dt><dd className="font-semibold text-slate-800">{d.name}, as v{nextNo}</dd></div>
                  {look?.pages ? <div><dt className="text-slate-500">Pages</dt><dd className="font-semibold text-slate-800">{look.pages}</dd></div> : null}
                </dl>
                {other && <p className="mt-3 flex gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden /><span>The file name looks like <b>{other.name}</b>, a different drawing. Check before you go on.</span></p>}
                {!!look?.turned && <p className="mt-3 rounded-2xl bg-slate-100 p-3 text-sm text-slate-700">{look.turned} page{look.turned === 1 ? ' was' : 's were'} upright and will be turned to landscape, as every drawing on the desk is.</p>}
              </div>
            </div>
          ) : (
            <>
              <p className="text-base font-bold text-slate-800">Send it to the Design Head?</p>
              <p className="mt-1 text-sm text-slate-500">The Design Head checks it next. Nothing goes to the client from here.</p>
              <label htmlFor="dd2-note" className="mb-1.5 mt-4 block text-sm font-bold text-slate-700">A note for the Design Head (optional)</label>
              <textarea id="dd2-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} disabled={!!busy} placeholder={fixing ? 'For example: all the notes are done, the tall unit is now 600 deep.' : 'For example: first issue, dimensions still to be checked on site.'}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:bg-slate-50" />
              {busy && (
                <div className="mt-4" role="status">
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-slate-700"><Loader2 size={16} className="animate-spin" aria-hidden />{busy.label}</div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${Math.round((busy.fraction ?? 0.05) * 100)}%` }} /></div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          {blocked ? <><span className="flex-1" /><Btn kind="plain" onClick={onClose}>Close</Btn></>
            : step === 0 ? <><span className="flex-1" /><Btn kind="quiet" onClick={onClose}>Cancel</Btn></>
              : step === 1 ? <>
                <Btn kind="quiet" onClick={() => { setFile(null); setStep(0); }}>Choose another PDF</Btn><span className="flex-1" />
                <Btn kind="primary" big icon={Check} onClick={() => setStep(2)}>Yes, this is it</Btn>
              </> : <>
                <Btn kind="quiet" disabled={!!busy} onClick={() => setStep(1)}>Back</Btn><span className="flex-1" />
                <Btn kind="plain" disabled={!!busy} onClick={() => upload(false)} title="Save the PDF on the drawing without sending it">Save, send later</Btn>
                <Btn kind="primary" big icon={Send} disabled={!!busy} onClick={() => upload(true)}>Send to the Design Head</Btn>
              </>}
        </div>
      </div>
    </div>
  );
}
