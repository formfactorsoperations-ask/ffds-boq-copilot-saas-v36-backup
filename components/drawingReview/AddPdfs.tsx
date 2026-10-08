import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileUp, Loader2, Send, Upload, X } from 'lucide-react';
import { watchProjectDrawings, uploadSheet, type ReviewDrawing } from '../../services/drawingReviewService';
import { matchFile, allowed, type FileMatch } from '../../lib/drawingReview';
import { thumbnailOf } from '../../lib/pdfRender';
import { roomLabel, useToast } from './ui';
import { ProjectMark, SheetThumb } from './DeskParts';
import type { Me } from './SheetStudio';

/*
  ADD PDFS: each file lands on the drawing it belongs to, inside one project.
  A name that matches one drawing is confirmed in a line; an unclear one is
  settled by picking the drawing, never by guessing. A sheet that is with the
  Design Head says why it cannot take a new PDF yet.
*/

export interface AddProject { id: string; name: string; code: string; color: string }

interface Props {
  orgId: string;
  me: Me;
  files: File[];
  projects: AddProject[];
  /** The project being looked at; null across all projects, when the panel asks. */
  projectId: string | null;
  onClose: () => void;
  onDone?: (projectId: string) => void;
}

type Placing = {
  file: File;
  key: string;
  match: FileMatch;
  pick: string | null;
  stage: 'ready' | 'thumb' | 'uploading' | 'checking' | 'done' | 'error';
  fraction?: number;
  error?: string;
};

export default function AddPdfs({ orgId, me, files: initial, projects, projectId, onClose, onDone }: Props) {
  const toast = useToast();
  const [pid, setPid] = useState<string | null>(projectId);
  const [files, setFiles] = useState<File[]>(initial);
  const [drawings, setDrawings] = useState<ReviewDrawing[] | null>(null);
  const [placing, setPlacing] = useState<Placing[]>([]);
  const [note, setNote] = useState('');
  const [sendNow, setSendNow] = useState(true);
  const [sending, setSending] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const project = projects.find((p) => p.id === pid) || null;

  useEffect(() => { setFiles(initial); }, [initial]);
  useEffect(() => {
    setDrawings(null);
    if (!pid) return;
    return watchProjectDrawings(orgId, pid, setDrawings, () => setDrawings([]));
  }, [orgId, pid]);
  /* Matched once the project's drawings are in; a later change to the tracker does not reshuffle the picks. */
  useEffect(() => {
    if (!drawings) { setPlacing([]); return; }
    const list = drawings.map((d) => ({ id: d.id, name: d.name, roomName: d.roomName }));
    setPlacing(files.map((file, i) => {
      const match = matchFile(file.name, list);
      return { file, key: `${file.name}-${i}-${file.size}`, match, pick: match.kind === 'exact' ? match.id : null, stage: 'ready' };
    }));
  }, [files, drawings === null, pid]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [sending]);

  const list = drawings || [];
  const targetOf = (p: Placing) => (p.match.kind === 'refused' ? null : p.pick);
  const blockedFor = (id: string | null) => {
    const d = list.find((x) => x.id === id);
    return d && !allowed('finalize', d.review) ? 'This sheet is with the Design Head. Pull it back first.' : null;
  };
  const ready = placing.filter((p) => targetOf(p) && p.stage !== 'done' && !blockedFor(targetOf(p))).length;
  const finished = placing.length > 0 && placing.every((p) => p.stage === 'done' || p.match.kind === 'refused' || p.stage === 'error');
  const sorted = useMemo(() => projects, [projects]);

  async function sendAll() {
    if (!pid) return;
    setSending(true);
    let ok = 0, tried = 0;
    for (const p of placing) {
      const id = targetOf(p);
      if (!id || p.stage === 'done' || blockedFor(id)) continue;
      tried++;
      const update = (patch: Partial<Placing>) => setPlacing((all) => all.map((x) => (x.key === p.key ? { ...x, ...patch } : x)));
      try {
        update({ stage: 'thumb', error: undefined });
        const thumb = await thumbnailOf(p.file);
        const d = list.find((x) => x.id === id);
        await uploadSheet({ orgId, projectId: pid, drawingId: id }, me.uid, p.file, {
          note, submit: sendNow, thumb, expectedRev: d?.review?.rev,
          onStage: (stage, fraction) => update({ stage: stage === 'uploading' ? 'uploading' : 'checking', fraction }),
        });
        update({ stage: 'done' });
        ok++;
      } catch (e: any) {
        update({ stage: 'error', error: e?.message || 'Not saved.' });
      }
    }
    setSending(false);
    if (tried) toast({ ok: ok === tried, title: `${ok} of ${tried} ${sendNow ? 'sent for review' : 'uploaded'}`, sub: ok < tried ? 'The rest stayed with you, with the reason shown.' : sendNow ? 'Nothing goes to the client from here.' : 'Send them when you are ready.' });
    if (ok && pid) onDone?.(pid);
    if (ok === tried && tried) setTimeout(onClose, 900);
  }

  const option = (p: Placing, opt: ReviewDrawing, on: boolean, pick: boolean) => {
    const bl = pick ? blockedFor(opt.id) : null;
    return (
      <button key={opt.id} type="button" disabled={!pick || sending || !!bl} aria-pressed={on}
        onClick={() => setPlacing((all) => all.map((x) => (x.key === p.key ? { ...x, pick: x.pick === opt.id ? null : opt.id } : x)))}
        className="flex w-full items-center gap-2.5 rounded-xl border-[1.5px] p-1.5 text-left transition hover:border-[#A9AAA2] disabled:cursor-not-allowed disabled:hover:border-[#E4E4DE]"
        style={{ borderColor: on ? '#2E9D71' : '#E4E4DE', background: on ? '#F1F8F4' : '#fff', opacity: bl ? 0.6 : 1 }}>
        <SheetThumb d={opt} className="w-[52px]" />
        <span className="min-w-0 flex-1 text-[13px] font-bold leading-tight text-[#17191E]">{opt.name}
          <small className="block text-[12px] font-semibold" style={{ color: bl ? '#8F4C07' : '#5F636D' }}>{bl || `${roomLabel(opt.roomName)} · ${p.stage === 'done' ? `now v${opt.review?.versionNo || 1}` : `becomes v${(opt.review?.versionNo || 0) + 1}`}`}</small>
        </span>
        {on && <Check size={18} strokeWidth={2.6} className="shrink-0 text-[#1B6E4F]" />}
      </button>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[111] bg-[rgba(23,25,30,0.42)]" onClick={() => !sending && onClose()} />
      <aside className="dd-slide fixed bottom-0 right-0 top-0 z-[112] flex w-full max-w-[480px] flex-col overflow-hidden bg-white sm:rounded-l-[22px]" role="dialog" aria-modal="true" aria-labelledby="dd-add"
        style={{ boxShadow: '-30px 0 60px -20px rgba(23,25,30,.45)' }}>
        <div className="border-b border-[#EEEEEA] px-[22px] pb-3 pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {project && <div className="mb-1 flex items-center gap-2"><ProjectMark code={project.code} color={project.color} size={22} /><span className="truncate text-[12.5px] font-extrabold" style={{ color: project.color }}>{project.name}</span></div>}
              <h2 id="dd-add" className="font-display text-[21px] font-semibold text-[#17191E]">{files.length ? `Placing ${files.length} file${files.length === 1 ? '' : 's'}` : 'Add PDFs'}</h2>
            </div>
            <button type="button" onClick={onClose} disabled={sending} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-[10px] text-[#4F535C] hover:bg-[#EBEBE5] disabled:opacity-40"><X size={16} strokeWidth={2.4} /></button>
          </div>
          {!projectId && (
            <label className="mt-3 flex items-center gap-2 text-[12.5px] font-bold text-[#4F535C]">Project
              <select value={pid || ''} onChange={(e) => setPid(e.target.value || null)} disabled={sending}
                className="min-h-[38px] min-w-0 flex-1 rounded-[10px] border border-[#DCDCD5] bg-white px-2 font-bold text-[#17191E]">
                <option value="">Choose the project these belong to</option>
                {sorted.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2.5 overflow-auto px-[22px] py-3.5">
          {!files.length && (
            <div className="rounded-[18px] border-2 border-dashed border-[#CFCFC7] bg-[#FAFAF7] px-5 py-8 text-center">
              <div className="font-display text-[18px] font-semibold text-[#17191E]">Drop PDFs here</div>
              <div className="mb-3.5 mt-1 text-[13px] text-[#5F636D]">or anywhere on the Design Desk. Each lands on the drawing it belongs to.</div>
              <button type="button" onClick={() => picker.current?.click()} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#4146C8] px-[18px] text-[14px] font-bold text-white hover:bg-[#3439AD]"><FileUp size={16} />Choose files</button>
            </div>
          )}
          <input ref={picker} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files || []) as File[]; e.target.value = ''; if (fs.length) setFiles(fs); }} />
          {files.length > 0 && !pid && <div className="rounded-xl bg-[#FBF1E3] px-3.5 py-3 text-[13px] text-[#6E3B05]">Choose the project above, and each file is matched to its drawing.</div>}
          {files.length > 0 && pid && drawings === null && <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-[#8A8E97]" /></div>}
          {placing.map((p, i) => {
            const id = targetOf(p);
            const d = list.find((x) => x.id === id);
            const blocked = blockedFor(id);
            const refused = p.match.kind === 'refused';
            const ext = (p.file.name.split('.').pop() || '').toUpperCase().slice(0, 4);
            return (
              <div key={p.key} className="dd-rise flex flex-col gap-2 rounded-2xl border p-3" style={{ animationDelay: `${i * 70}ms`, borderColor: refused || blocked || p.stage === 'error' ? '#F2B8BF' : !id ? '#E9C9A0' : '#E4E4DE', background: refused ? '#FDF5F6' : '#fff' }}>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-[42px] w-[34px] shrink-0 place-items-center rounded-md text-[9.5px] font-extrabold" style={{ background: refused ? '#FCE8EA' : '#ECEDFB', color: refused ? '#B4232F' : '#3A3FB8' }}>{ext}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-[#17191E]" title={p.file.name}>{p.file.name}</span>
                    <span className="block text-[12.5px]" style={{ color: refused || blocked ? '#B4232F' : !id ? '#8F4C07' : '#1B6E4F' }}>
                      {refused ? p.match.why : blocked || (d ? `${p.match.kind === 'exact' ? 'Matched to ' : ''}${d.name} · ${p.stage === 'done' ? `now v${d.review?.versionNo || 1}` : `becomes v${(d.review?.versionNo || 0) + 1}`}` : p.match.why)}
                    </span>
                  </span>
                  {p.stage === 'done' && <span className="dd-pop grid h-7 w-7 place-items-center rounded-full bg-[#2E9D71] text-white"><Check size={15} strokeWidth={3} /></span>}
                </div>
                {p.match.kind === 'choose' && p.stage === 'ready' && (
                  <div className="flex flex-col gap-1.5 pl-11">
                    {p.match.options.map((oid) => { const o = list.find((x) => x.id === oid); return o ? option(p, o, p.pick === oid, true) : null; })}
                  </div>
                )}
                {p.stage !== 'ready' && (
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#EEEEEA]"><i className="block h-full rounded-full transition-all duration-300" style={{ width: `${p.stage === 'done' || p.stage === 'error' ? 100 : p.stage === 'checking' ? 92 : p.stage === 'thumb' ? 6 : Math.max(8, Math.round((p.fraction || 0) * 85))}%`, background: p.stage === 'done' ? '#2E9D71' : p.stage === 'error' ? '#B4232F' : '#4146C8' }} /></div>
                    <div className="mt-1 text-[12px] font-bold" style={{ color: p.stage === 'done' ? '#1B6E4F' : p.stage === 'error' ? '#B4232F' : '#3A3FB8' }}>
                      {{ thumb: 'Making a preview…', uploading: 'Uploading…', checking: 'Checking the PDF…', done: sendNow ? 'With the Design Head' : 'Uploaded', error: `Kept with you · ${p.error}` }[p.stage as Exclude<Placing['stage'], 'ready'>]}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {placing.length > 0 && (
            <div>
              <label htmlFor="dd-note" className="mb-1 block text-[12.5px] font-bold text-[#17191E]">A line for the Design Head <span className="font-medium text-[#8A8E97]">(optional)</span></label>
              <textarea id="dd-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What changed, or what to look at first"
                className="w-full rounded-[10px] border border-[#DCDCD5] px-3 py-2.5 text-[13.5px] outline-none focus:border-[#4146C8] focus:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]" />
            </div>
          )}
        </div>

        {placing.length > 0 && (
          <div className="flex flex-col gap-2.5 border-t border-[#EEEEEA] px-[22px] pb-[18px] pt-3.5">
            <label className="flex min-h-[36px] items-center gap-2.5 rounded-xl bg-[#ECEDFB] px-3 py-2 text-[13px] text-[#17191E]">
              <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} disabled={sending} className="h-[18px] w-[18px] accent-[#4146C8]" />
              <span><b>Send to the Design Head now.</b> Untick to upload only.</span>
            </label>
            {finished && !sending
              ? <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl bg-[#4146C8] px-4 text-[14px] font-bold text-white">Done</button>
              : <button type="button" disabled={!ready || sending} onClick={sendAll} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#4146C8] px-4 text-[14px] font-bold text-white hover:bg-[#3439AD] disabled:opacity-45">
                  {sending ? <Loader2 size={16} className="animate-spin" /> : sendNow ? <Send size={16} /> : <Upload size={16} />}
                  {sending ? 'Sending…' : sendNow ? `Send ${ready || ''} for review` : `Upload ${ready || ''}`}
                </button>}
          </div>
        )}
      </aside>
    </>
  );
}
