import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Columns2, Minus, Plus, MousePointer2, MapPin, Square, MoveUpRight, PenLine,
  Send, Check, Undo2, Info, MessageSquare, Loader2, RotateCcw,
} from 'lucide-react';
import {
  watchDrawing, watchVersions, watchMarks, watchRounds, watchEvents, uploadSheet, submitSheet, withdrawSheet,
  approveSheet, returnSheet, createMark, deleteMark, updateMark, fixMark, setAudience, ReviewError, type ReviewDrawing,
} from '../../services/drawingReviewService';
import { canReview, canUpload, canSetAudience, allowed, stateOf, STATE_LABEL, refusal, guessAudience, type MarkShape, type ReviewMark, type ReviewVersion, type ReviewRound, type ReviewEvent } from '../../lib/drawingReview';
import { thumbnailOf } from '../../lib/pdfRender';
import PdfStage, { type Tool } from './PdfStage';
import { MARK, FIXED, TABLE, roomLabel, ago, shortDate, firstName, useToast } from './ui';

export interface Me { uid: string; email: string; name: string }

interface Props {
  orgId: string;
  projectId: string;
  drawingId: string;
  projectName: string;
  role: string;
  me: Me;
  queue: { projectId: string; drawingId: string }[];
  onClose: () => void;
  onOpen: (next: { projectId: string; drawingId: string }) => void;
}

const TOOLS: [Tool, string, string, React.ComponentType<any>][] = [
  ['select', 'V', 'Select', MousePointer2], ['pin', 'P', 'Pin a note', MapPin], ['rect', 'B', 'Box an area', Square],
  ['arrow', 'A', 'Arrow', MoveUpRight], ['pen', 'D', 'Draw', PenLine],
];
const SHAPE_WORD: Record<string, string> = { pin: 'pin', rect: 'box', arrow: 'arrow', pen: 'sketch' };
const EVENT_WORD: Record<string, string> = { uploaded: 'uploaded', submitted: 'sent for review', withdrawn: 'pulled back', returned: 'returned', approved: 'approved', audience: 'changed who it is for' };

function Ring({ done, total }: { done: number; total: number }) {
  const r = 17, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 42 42" className="h-[42px] w-[42px] shrink-0" role="img" aria-label={`${done} of ${total} fixed`}>
      <circle cx={21} cy={21} r={r} fill="none" stroke="#E1E7E3" strokeWidth={4} />
      <circle cx={21} cy={21} r={r} fill="none" stroke={FIXED} strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={total ? c * (1 - done / total) : c}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset .6s' }} />
      <text x={21} y={25} textAnchor="middle" fontSize={11} fontWeight={700} fill="#14211E">{done}/{total}</text>
    </svg>
  );
}

const SheetStudio: React.FC<Props> = ({ orgId, projectId, drawingId, projectName, role, me, queue, onClose, onOpen }) => {
  const toast = useToast();
  const target = { orgId, projectId, drawingId };
  const [d, setD] = useState<ReviewDrawing | null | undefined>(undefined);
  const [versions, setVersions] = useState<ReviewVersion[]>([]);
  const [marks, setMarks] = useState<ReviewMark[]>([]);
  const [rounds, setRounds] = useState<ReviewRound[]>([]);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [compare, setCompare] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ shape: MarkShape; text: string; blocking: boolean } | null>(null);
  const [retMsg, setRetMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [railTab, setRailTab] = useState<'notes' | 'history'>('notes');
  const [upload, setUpload] = useState<{ stage: string; fraction?: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftBox = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setD(undefined); setViewId(null); setPage(0); setCompare(false); setTool('select'); setSelected(null); setDraft(null); setRetMsg('');
    const off = [
      watchDrawing(orgId, projectId, drawingId, setD),
      watchVersions(orgId, projectId, drawingId, setVersions),
      watchMarks(orgId, projectId, drawingId, setMarks),
      watchRounds(orgId, projectId, drawingId, setRounds),
      watchEvents(orgId, projectId, drawingId, setEvents),
    ];
    return () => off.forEach((f) => f());
  }, [orgId, projectId, drawingId]);

  const r = d?.review;
  const state = stateOf(r);
  const current = versions.find((v) => v.id === r?.versionId) || versions[versions.length - 1] || null;
  const viewing = versions.find((v) => v.id === viewId) || current;
  const isCurrent = !!viewing && viewing.id === current?.id;
  const prev = viewing ? versions.find((v) => v.n === viewing.n - 1) || null : null;
  const onSheet = marks.filter((m) => m.versionId === viewing?.id);
  const fixedFromPrev = isCurrent && prev ? marks.filter((m) => m.versionId === prev.id && m.status === 'FIXED') : [];
  const reviewer = canReview(role);
  const canMark = reviewer && state === 'IN_REVIEW' && isCurrent && !compare;
  const canDecide = reviewer && state === 'IN_REVIEW' && isCurrent;
  const canFix = canUpload(role) && state === 'CHANGES_REQUESTED' && isCurrent;
  const canUploadNew = canUpload(role) && allowed('finalize', r);
  const canSend = canUpload(role) && state === 'DRAFT' && !!r?.versionId;
  const canPullBack = canUpload(role) && state === 'IN_REVIEW' && (!reviewer || r?.designer?.email === me.email);
  const blockingOpen = onSheet.filter((m) => m.blocking && m.status === 'OPEN').length;
  const lastReturn = [...rounds].reverse().find((x) => x.status === 'CHANGES_REQUESTED');
  const qIndex = queue.findIndex((q) => q.drawingId === drawingId && q.projectId === projectId);
  const self = r?.designer?.email === me.email;
  const audience = r?.audience || (d ? guessAudience(d.name) : 'client');

  useEffect(() => { if (!prev) setCompare(false); }, [prev?.id]);
  useEffect(() => { if (draft) setTimeout(() => draftBox.current?.focus(), 30); }, [!!draft]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      if (e.key === 'Escape') { if (draft) setDraft(null); else setTool('select'); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = ({ v: 'select', p: 'pin', b: 'rect', a: 'arrow', d: 'pen' } as Record<string, Tool>)[e.key.toLowerCase()];
      if (t && canMark) setTool(t);
      if (e.key.toLowerCase() === 'c' && prev) setCompare((c) => !c);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [canMark, prev?.id, !!draft]);

  async function act(label: string, fn: () => Promise<any>, ok?: { title: string; sub?: string }) {
    setBusy(label);
    try {
      const res = await fn();
      if (ok) toast({ ...ok, ok: true });
      return res;
    } catch (e: any) {
      const err = e as ReviewError;
      toast({ title: err.code === 'aborted' ? 'This sheet changed a moment ago' : 'Not saved', sub: e?.message });
      return null;
    } finally {
      setBusy(null);
    }
  }

  function goNext() {
    const rest = queue.filter((q) => !(q.drawingId === drawingId && q.projectId === projectId));
    if (rest.length) onOpen(rest[0]); else onClose();
  }

  async function decide(kind: 'approve' | 'return') {
    if (!r) return;
    if (kind === 'return' && !retMsg.trim() && !onSheet.length) {
      toast({ title: 'Mark the sheet or write a line first', sub: 'A returned sheet needs at least one thing to fix.' });
      return;
    }
    const res = await act(kind, () => (kind === 'approve' ? approveSheet(target, r.rev) : returnSheet(target, r.rev, retMsg.trim())),
      kind === 'approve'
        ? { title: `v${r.versionNo} approved${self ? ' (self-approved)' : ''}`, sub: audience === 'client' ? 'Ready for the client meeting, which comes in the next phase.' : 'Final. It stays inside the studio.' }
        : { title: `Back with ${firstName(r.designer?.name)}`, sub: 'No client round used.' });
    if (res) goNext();
  }

  async function saveDraft() {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) { draftBox.current?.focus(); return; }
    const res = await act('mark', () => createMark(target, page, draft.shape, text, draft.blocking));
    if (res) { setDraft(null); setSelected(res.mark?.id || null); }
  }

  async function revise(file: File) {
    if (!/\.pdf$/i.test(file.name)) { toast({ title: 'Only PDFs can be reviewed', sub: 'Export the drawing as a PDF and drop that.' }); return; }
    if (!allowed('finalize', r)) { toast({ title: 'Not now', sub: refusal('finalize', r) }); return; }
    setUpload({ stage: 'Making a preview…' });
    try {
      const thumb = await thumbnailOf(file);
      const res = await uploadSheet(target, me.uid, file, {
        thumb, expectedRev: r?.rev,
        onStage: (stage, fraction) => setUpload({ stage: stage === 'uploading' ? 'Uploading…' : 'Checking the PDF…', fraction }),
      });
      setViewId(null);
      if ((res?.versionNo || 0) > 1) setCompare(true);
      toast({ ok: true, title: `v${res.versionNo} is on the table`, sub: (res?.versionNo || 0) > 1 ? 'Drag the slider to see what changed, then send it.' : 'Send it to the Design Head when you are ready.' });
    } catch (e: any) {
      toast({ title: 'Upload not saved', sub: e?.message });
    } finally {
      setUpload(null);
    }
  }

  if (d === undefined) return <div className="grid min-h-[60vh] place-items-center text-slate-500"><Loader2 className="animate-spin" /></div>;
  if (d === null) return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-lg font-semibold text-[#14211E]">This drawing is not in the tracker any more.</p>
      <button type="button" onClick={onClose} className="mt-4 rounded-xl bg-[#14211E] px-4 py-2 text-sm font-bold text-white">Back</button>
    </div>
  );

  const titleBtn = 'inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-[#DCE5E1] hover:bg-[#3A4643] disabled:opacity-40';
  return (
    <div className="dr-pop">
      <button type="button" onClick={onClose} className="mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-bold text-[#66786F] hover:text-[#14211E]">
        <ChevronLeft size={16} />{reviewer && state === 'IN_REVIEW' ? 'Review inbox' : 'Back'}
      </button>
      <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="min-w-[220px] flex-1">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[#66786F]">
            {projectName} · {roomLabel(d.roomName)}{audience === 'studio' ? ' · studio only' : ''}{reviewer && qIndex >= 0 ? ` · ${qIndex + 1} of ${queue.length} waiting` : ''}
          </p>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#14211E]">{d.name}</h2>
          <p className="text-[12.5px] text-[#66786F]">
            {viewing ? <>v{viewing.n} by {firstName(viewing.by.name)}, {shortDate(viewing.at)}{viewing.note ? ` · “${viewing.note}”` : ''} · <span className="font-semibold text-[#2A3B37]">{STATE_LABEL[state as keyof typeof STATE_LABEL] || 'No PDF yet'}</span></> : 'No PDF yet'}
          </p>
        </div>
        {versions.length > 0 && (
          <div className="inline-flex flex-wrap gap-0.5 rounded-xl border border-[#E1E7E3] bg-white p-[3px]" role="group" aria-label="Versions">
            {versions.map((v) => {
              const rd = [...rounds].reverse().find((x) => x.versionId === v.id);
              const lbl = rd ? ({ OPEN: 'In review', APPROVED: 'Approved', CHANGES_REQUESTED: 'Returned', WITHDRAWN: 'Pulled back' } as any)[rd.status] : 'Draft';
              const on = v.id === viewing?.id;
              return (
                <button key={v.id} type="button" onClick={() => { setViewId(v.id); setCompare(false); setSelected(null); }} aria-pressed={on}
                  className={`flex flex-col items-start rounded-[9px] px-3 py-1 text-xs font-bold leading-tight ${on ? 'bg-[#14211E] text-white' : 'text-[#66786F] hover:text-[#14211E]'}`}>
                  v{v.n}<small className={`text-[10.5px] font-semibold ${on ? 'text-white/70' : 'text-[#98A79F]'}`}>{lbl}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="dr-studio overflow-hidden rounded-[20px]" style={{ background: TABLE, minHeight: 600, boxShadow: '0 2px 6px rgba(20,33,30,.06), 0 30px 60px -20px rgba(20,33,30,.35)' }}>
        <div className="relative flex min-w-0 flex-col" style={{ background: 'radial-gradient(ellipse at 50% 40%, #232C2A, #1A2120 70%)' }}>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-xs text-[#8C9C97]">
            {prev && <button type="button" className={`${titleBtn} ${compare ? 'bg-[#DCE5E1] text-[#1A2120] hover:bg-[#DCE5E1]' : 'bg-[#2E3936]'}`} aria-pressed={compare} onClick={() => setCompare((c) => !c)}><Columns2 size={15} />Compare with v{prev.n}</button>}
            {pages > 1 && (
              <span className="inline-flex items-center gap-1">
                <button type="button" className={`${titleBtn} bg-[#2E3936]`} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Previous sheet"><ChevronLeft size={15} /></button>
                <span className="font-mono">Sheet {page + 1} of {pages}</span>
                <button type="button" className={`${titleBtn} bg-[#2E3936]`} disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} aria-label="Next sheet"><ChevronRight size={15} /></button>
              </span>
            )}
            <span className="flex-1" />
            {viewing && <>
              <button type="button" className={`${titleBtn} bg-[#2E3936]`} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out"><Minus size={15} /></button>
              <span className="min-w-[38px] text-center font-mono">{Math.round(zoom * 100)}%</span>
              <button type="button" className={`${titleBtn} bg-[#2E3936]`} onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))} aria-label="Zoom in"><Plus size={15} /></button>
            </>}
          </div>
          {canMark && (
            <div className="absolute left-3.5 top-14 z-10 flex flex-col gap-1 rounded-2xl p-1.5" role="toolbar" aria-label="Markup tools" style={{ background: 'rgba(36,45,43,.92)', boxShadow: '0 10px 30px -10px rgba(0,0,0,.6)' }}>
              {TOOLS.map(([t, k, n, Icon]) => (
                <button key={t} type="button" title={`${n} (${k})`} aria-label={n} aria-pressed={tool === t} onClick={() => setTool(t)}
                  className="relative grid h-[38px] w-[38px] place-items-center rounded-[10px] text-[#8C9C97] hover:text-white" style={tool === t ? { background: MARK, color: '#fff' } : undefined}>
                  <Icon size={18} /><kbd className="absolute bottom-px right-1 font-mono text-[8.5px] opacity-60">{k}</kbd>
                </button>
              ))}
            </div>
          )}
          <div className={`flex-1 overflow-auto pb-7 pt-3.5 ${canMark ? 'pl-[70px] pr-5' : 'px-5'}`}>
            {viewing ? (
              <PdfStage
                pdfPath={viewing.pdfPath} comparePath={compare && prev ? prev.pdfPath : null} compareLabel={prev ? [`v${prev.n}`, `v${viewing.n}`] : undefined}
                page={page} zoom={zoom} marks={onSheet.filter((m) => m.page === page)} draft={draft?.shape || null} selectedId={selected}
                tool={tool} canMark={canMark && !draft} onPageCount={setPages}
                onSelect={(id) => { setSelected(id); setRailTab('notes'); }}
                onShape={(shape) => { setDraft({ shape, text: '', blocking: false }); setRailTab('notes'); }}
              />
            ) : (
              <div className="mx-auto mt-16 max-w-md text-center text-[#8C9C97]">
                <h3 className="font-display text-xl font-semibold text-[#DCE5E1]">A clear desk</h3>
                <p className="mt-1.5">Drop the first PDF of {d.name} below. It becomes v1, and you can send it to the Design Head straight away.</p>
              </div>
            )}
            {canUploadNew ? (
              <div
                className="mx-auto mt-5 w-full max-w-[880px] rounded-2xl border-[1.5px] border-dashed p-4 text-center text-[#8C9C97] transition"
                style={{ borderColor: 'rgba(220,229,225,.35)' }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.background = 'rgba(63,191,148,.08)'; } }}
                onDragLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.background = ''; const f = e.dataTransfer.files[0]; if (f) revise(f); }}
              >
                {upload ? (
                  <div className="mx-auto max-w-xs">
                    <strong className="block text-sm text-[#DCE5E1]"><Loader2 size={14} className="mr-1 inline animate-spin" />{upload.stage}</strong>
                    {upload.fraction !== undefined && <div className="mt-2 h-1 overflow-hidden rounded bg-[#2E3936]"><i className="block h-full bg-[#3FBF94] transition-all" style={{ width: `${Math.round((upload.fraction || 0) * 100)}%` }} /></div>}
                  </div>
                ) : (
                  <>
                    <strong className="mb-0.5 block text-sm text-[#DCE5E1]">{viewing ? `Drop v${(r?.versionNo || 0) + 1} here when it’s ready` : 'Drop the PDF here'}</strong>
                    It lands on this drawing only.{' '}
                    <button type="button" className="font-bold text-[#3FBF94] underline underline-offset-2" onClick={() => fileInput.current?.click()}>Choose a file</button>
                    {state === 'APPROVED' && <span className="mt-1 block text-[11.5px]">This sheet is approved. A new version goes back for review.</span>}
                  </>
                )}
                <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) revise(f); }} />
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col bg-white lg:max-h-[820px]">
          <div className="flex items-center gap-2.5 border-b border-[#ECF0ED] px-4 pb-2.5 pt-3.5">
            {state === 'CHANGES_REQUESTED' && isCurrent && onSheet.length > 0 && <Ring done={onSheet.filter((m) => m.status === 'FIXED').length} total={onSheet.length} />}
            <div className="flex min-w-0 flex-1 gap-1">
              {(['notes', 'history'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setRailTab(t)} aria-pressed={railTab === t}
                  className={`rounded-lg px-2.5 py-1 font-display text-[15px] font-semibold ${railTab === t ? 'text-[#14211E]' : 'text-[#98A79F] hover:text-[#2A3B37]'}`}>
                  {t === 'notes' ? `Notes${onSheet.length ? ` · ${onSheet.length}` : ''}` : 'History'}
                </button>
              ))}
            </div>
            {canSetAudience(role) ? (
              <select value={audience} disabled={busy === 'audience'} onChange={(e) => act('audience', () => setAudience(target, e.target.value as any), { title: e.target.value === 'client' ? 'Shown to the client in meetings' : 'Kept inside the studio' })}
                className="rounded-md border border-[#E1E7E3] bg-white px-1.5 py-1 text-[11px] font-bold text-[#2A3B37]" aria-label="Who this drawing is for">
                <option value="client">For the client</option>
                <option value="studio">Studio only</option>
              </select>
            ) : (
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${audience === 'studio' ? 'bg-[#FBF0E1] text-[#B4690E]' : 'bg-[#E5F0F9] text-[#2B7BB9]'}`}>{audience === 'studio' ? 'Studio only' : 'For the client'}</span>
            )}
          </div>

          {railTab === 'history' ? (
            <div className="flex-1 overflow-auto px-5 py-4">
              <div className="border-l-2 border-[#E1E7E3] pl-4">
                {[...events].reverse().map((e, i) => (
                  <div key={i} className="relative py-1.5 text-[12.5px] text-[#2A3B37]">
                    <span className="absolute -left-[23px] top-[11px] h-2.5 w-2.5 rounded-full border-2 bg-white" style={{ borderColor: e.type === 'returned' ? '#B4690E' : e.type === 'approved' ? '#2E8B6F' : '#5B5BD6' }} />
                    <b>{firstName(e.by?.name)}</b> {EVENT_WORD[e.type] || e.type}{e.versionNo ? ` v${e.versionNo}` : ''}{e.text ? ` · “${e.text}”` : ''}
                    <span className="ml-1 text-[11px] text-[#98A79F]">{ago(e.at)}</span>
                  </div>
                ))}
                {!events.length && <p className="text-sm text-[#66786F]">Nothing yet.</p>}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-2 overflow-auto p-3">
              {self && reviewer && state === 'IN_REVIEW' && <Callout tone="rv"><b>Your own sheet.</b> As Design Head you can approve it. The history will say it was self-approved.</Callout>}
              {state === 'CHANGES_REQUESTED' && isCurrent && lastReturn && (
                <Callout tone="desk"><b>{firstName(lastReturn.decidedBy?.name)}:</b> {lastReturn.reason ? `“${lastReturn.reason}”` : 'Notes are on the sheet.'} {canFix ? 'Tick each note as you fix it, then drop the new PDF on the table.' : ''}</Callout>
              )}
              {fixedFromPrev.length > 0 && reviewer && (
                <Callout tone="ok"><b>{firstName(r?.designer?.name)} fixed {fixedFromPrev.length} note{fixedFromPrev.length === 1 ? '' : 's'} from v{prev!.n}.</b> Use Compare to check them. “Fixed” is the designer’s word; your approval is still the decision.</Callout>
              )}
              {fixedFromPrev.map((m) => (
                <div key={m.id} className="dr-note gap-2.5 rounded-2xl border border-[#E1E7E3] p-2.5 opacity-80">
                  <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: FIXED }}>{m.n}</span>
                  <div><div className="text-[11.5px] text-[#66786F]"><b className="text-[#2A3B37]">v{prev!.n}</b> · {SHAPE_WORD[m.shape.t]}</div><div className="text-[13px] text-[#66786F] line-through decoration-[#3FBF94]">{m.text}</div></div>
                </div>
              ))}

              {draft && (
                <div className="dr-pop rounded-2xl border-2 p-3" style={{ borderColor: MARK }}>
                  <div className="mb-1.5 flex items-center gap-2 text-[11.5px] font-bold text-[#2A3B37]">
                    <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: MARK }}>{(r?.marksSeq || 0) + 1}</span>
                    New note · {SHAPE_WORD[draft.shape.t]}
                  </div>
                  <textarea ref={draftBox} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveDraft(); if (e.key === 'Escape') setDraft(null); }}
                    placeholder="What should change here?" rows={3} className="w-full rounded-lg border border-[#E1E7E3] px-2.5 py-2 text-[13px] outline-none focus:border-[#F0506E]" />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#C2416A]"><input type="checkbox" checked={draft.blocking} onChange={(e) => setDraft({ ...draft, blocking: e.target.checked })} />Must fix</label>
                    <span className="flex-1" />
                    <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#66786F]" onClick={() => setDraft(null)}>Cancel</button>
                    <button type="button" disabled={busy === 'mark'} className="rounded-lg bg-[#14211E] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={saveDraft}>{busy === 'mark' ? 'Saving…' : 'Save note'}</button>
                  </div>
                </div>
              )}

              {onSheet.map((m) => {
                const done = m.status === 'FIXED';
                return (
                  <div key={m.id} onClick={() => { setSelected(m.id); if (m.page !== page) setPage(m.page); }}
                    className="dr-note cursor-pointer gap-2.5 rounded-2xl border bg-white p-2.5 transition"
                    style={{ borderColor: selected === m.id ? MARK : '#E1E7E3', boxShadow: selected === m.id ? '0 0 0 3px rgba(240,80,110,.15)' : undefined }}>
                    <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold text-white transition-colors" style={{ background: done ? FIXED : MARK }}>{m.n}</span>
                    <div className="min-w-0">
                      <div className="text-[11.5px] text-[#66786F]"><b className="text-[#2A3B37]">{firstName(m.by.name)}</b> · {SHAPE_WORD[m.shape.t]}{pages > 1 ? ` · sheet ${m.page + 1}` : ''}{m.blocking ? <span className="font-extrabold text-[#C2416A]"> · must fix</span> : null}</div>
                      <div className={`mt-0.5 text-[13.5px] ${done ? 'text-[#66786F] line-through decoration-[#3FBF94]' : 'text-[#14211E]'}`}>{m.text}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {canFix && (
                          <button type="button" disabled={busy === `fix-${m.id}`} onClick={(e) => { e.stopPropagation(); act(`fix-${m.id}`, () => fixMark(target, m.id, !done)); }} aria-pressed={done}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${done ? 'border-transparent bg-[#E1F1EA] text-[#2E8B6F]' : 'border-[#E1E7E3] text-[#2A3B37]'}`}>
                            <span className="grid h-[18px] w-[18px] place-items-center rounded-full border-2" style={done ? { background: FIXED, borderColor: FIXED, color: '#fff' } : { borderColor: '#98A79F' }}>{done && <Check size={11} />}</span>
                            {done ? 'Fixed' : 'Mark fixed'}
                          </button>
                        )}
                        {canMark && (
                          <>
                            <button type="button" onClick={(e) => { e.stopPropagation(); act(`blk-${m.id}`, () => updateMark(target, m.id, { blocking: !m.blocking })); }}
                              className={`rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${m.blocking ? 'border-transparent bg-[#FBE9EF] text-[#C2416A]' : 'border-[#E1E7E3] text-[#66786F]'}`} aria-pressed={m.blocking}>Must fix</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); act(`del-${m.id}`, () => deleteMark(target, m.id)); }} className="rounded-full border border-[#E1E7E3] px-2.5 py-1 text-[11.5px] font-bold text-[#66786F]">Remove</button>
                          </>
                        )}
                        {done && !canFix && m.fixedInVersionNo ? <span className="rounded-full bg-[#E1F1EA] px-2 py-0.5 text-[11px] font-bold text-[#2E8B6F]">Fixed in v{m.fixedInVersionNo}</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!onSheet.length && !draft && (
                <Callout tone="rv">
                  {canMark ? <>Pick a tool on the left, or press <b>P</b>, <b>B</b>, <b>A</b> or <b>D</b>, and mark the sheet. Each mark becomes a numbered note for {firstName(r?.designer?.name)}.</>
                    : !viewing ? 'Notes from the Design Head will appear here, pinned to the exact spot on the sheet.'
                    : state === 'DRAFT' ? 'Ready when you are. Send it and the Design Head gets it in her inbox.'
                    : 'No notes on this version.'}
                </Callout>
              )}
            </div>
          )}
          {canDecide && railTab === 'notes' && (
            <div className="flex flex-col gap-1.5 border-t border-[#ECF0ED] px-3.5 py-3">
              <label htmlFor="dr-ret" className="text-[11.5px] font-bold text-[#2A3B37]">A line for {firstName(r?.designer?.name)} <span className="font-medium text-[#98A79F]">(needed to return it)</span></label>
              <textarea id="dr-ret" value={retMsg} onChange={(e) => setRetMsg(e.target.value)} rows={2} placeholder="The summary of what to fix" className="rounded-lg border border-[#E1E7E3] px-2.5 py-2 text-[13px] outline-none focus:border-[#5B5BD6]" />
            </div>
          )}
        </aside>
      </div>

      {(canDecide || canSend || canPullBack) && (
        <div className="sticky bottom-3.5 z-30 mt-4 flex justify-center">
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-[18px] border border-[#E1E7E3] bg-white py-2 pl-4 pr-2" style={{ boxShadow: '0 2px 6px rgba(20,33,30,.06), 0 30px 60px -20px rgba(20,33,30,.35)' }}>
            {canDecide ? (
              <>
                <span className="mr-1.5 max-w-[46ch] text-[12.5px] text-[#66786F]">
                  {blockingOpen ? <b className="text-[#C2416A]">{blockingOpen} must-fix note{blockingOpen === 1 ? '' : 's'} still open.</b>
                    : <>Approving signs off <b className="text-[#14211E]">v{r?.versionNo}</b> exactly{audience === 'studio' ? '. This sheet stays inside the studio.' : '.'}</>}
                </span>
                <button type="button" disabled={!!busy} onClick={() => decide('return')} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#E1E7E3] bg-white px-3.5 py-2 text-[13px] font-bold text-[#2A3B37] disabled:opacity-40">
                  {busy === 'return' ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}Return to {firstName(r?.designer?.name)}
                </button>
                <button type="button" disabled={!!busy || blockingOpen > 0} onClick={() => decide('approve')} className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#2E8B6F] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-40">
                  {busy === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{self ? 'Approve your own sheet' : 'Approve'}
                </button>
              </>
            ) : canSend ? (
              <>
                <span className="mr-1.5 text-[12.5px] text-[#66786F]"><b className="text-[#14211E]">v{r?.versionNo}</b> is ready. The Design Head gets it in her inbox.</span>
                <button type="button" disabled={!!busy} onClick={() => act('send', () => submitSheet(target, r!.rev), { title: `${d.name} is with the Design Head`, sub: 'Nothing goes to the client from here.' })}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#5B5BD6] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-40">
                  {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Send v{r?.versionNo} for review
                </button>
              </>
            ) : (
              <>
                <span className="mr-1.5 text-[12.5px] text-[#66786F]">With the Design Head since {ago(r?.submittedAt)}.</span>
                <button type="button" disabled={!!busy} onClick={() => act('pull', () => withdrawSheet(target, r!.rev), { title: 'Pulled back', sub: 'It is on your desk again. Upload the new PDF and send it.' })}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#E1E7E3] bg-white px-3.5 py-2 text-[13px] font-bold text-[#2A3B37] disabled:opacity-40">
                  <RotateCcw size={15} />Pull it back
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SheetStudio;

function Callout({ tone, children }: { tone: 'rv' | 'desk' | 'ok'; children: React.ReactNode }) {
  const bg = tone === 'rv' ? '#ECECFC' : tone === 'desk' ? '#FBF0E1' : '#E1F1EA';
  return (
    <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed text-[#14211E]" style={{ background: bg }}>
      {tone === 'ok' ? <Check size={16} className="mt-px shrink-0" /> : tone === 'desk' ? <MessageSquare size={16} className="mt-px shrink-0" /> : <Info size={16} className="mt-px shrink-0" />}
      <div>{children}</div>
    </div>
  );
}
