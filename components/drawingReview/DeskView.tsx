import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Send, Loader2, Check, X, FileUp, PenTool } from 'lucide-react';
import { watchProjectDrawings, uploadSheet, submitSheet, type ReviewDrawing } from '../../services/drawingReviewService';
import { laneOf, stateOf, matchFile, allowed, type DeskLane, type FileMatch } from '../../lib/drawingReview';
import { thumbnailOf } from '../../lib/pdfRender';
import { SheetCard, Thumb, LANE, roomLabel, firstName, useToast } from './ui';
import type { Me } from './SheetStudio';

/*
  THE DRAWING DESK: a designer's own board.

  The rooms of the project across the top, each showing where its sheets
  are; then the sheets themselves, on the designer's desk or with the Design
  Head or approved. PDFs can be dropped anywhere on the page: each lands on
  the drawing it belongs to, and an unclear name is settled by picking the
  drawing, never by guessing.
*/

interface Props {
  orgId: string;
  projects: { id: string; name: string }[];
  projectId: string | null;
  setProjectId: (id: string) => void;
  role: string;
  me: Me;
  onOpen: (projectId: string, drawingId: string) => void;
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

const ORDER: Record<string, number> = { CHANGES_REQUESTED: 0, DRAFT: 1, NONE: 2 };

export default function DeskView({ orgId, projects, projectId, setProjectId, role, me, onOpen }: Props) {
  const toast = useToast();
  const [drawings, setDrawings] = useState<ReviewDrawing[] | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing[] | null>(null);
  const [note, setNote] = useState('');
  const [sendNow, setSendNow] = useState(true);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [laneHot, setLaneHot] = useState(false);
  const depth = useRef(0);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDrawings(null); setRoom(null);
    if (!projectId) return;
    return watchProjectDrawings(orgId, projectId, setDrawings, () => setDrawings([]));
  }, [orgId, projectId]);

  /* Files dropped anywhere on the page, while the desk is showing. */
  useEffect(() => {
    const has = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => { if (!has(e)) return; depth.current++; setDragOver(true); };
    const leave = (e: DragEvent) => { if (!has(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragOver(false); };
    const over = (e: DragEvent) => { if (has(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault(); depth.current = 0; setDragOver(false);
      start(Array.from(e.dataTransfer!.files));
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [drawings, projectId]);

  const list = drawings || [];
  const project = projects.find((p) => p.id === projectId);
  const rooms = useMemo(() => {
    const m = new Map<string, ReviewDrawing[]>();
    list.forEach((d) => { const k = d.roomName || 'General / Project-Wide'; m.set(k, [...(m.get(k) || []), d]); });
    return [...m.entries()].sort((a, b) => (a[0] === 'General / Project-Wide' ? 1 : b[0] === 'General / Project-Wide' ? -1 : a[0].localeCompare(b[0])));
  }, [drawings]);
  const byLane = (k: DeskLane) => list.filter((d) => laneOf(d.review) === k);
  const desk = byLane('desk').sort((a, b) => ORDER[stateOf(a.review)] - ORDER[stateOf(b.review)]);
  const returned = desk.filter((d) => stateOf(d.review) === 'CHANGES_REQUESTED').length;
  const ready = desk.filter((d) => stateOf(d.review) === 'DRAFT').length;
  const withHead = byLane('review').length;

  function start(files: File[]) {
    if (!files.length) return;
    if (!drawings) { toast({ title: 'One moment', sub: 'The drawings are still loading.' }); return; }
    setNote('');
    setPlacing(files.map((file, i) => {
      const match = matchFile(file.name, list.map((d) => ({ id: d.id, name: d.name, roomName: d.roomName })));
      return { file, key: `${file.name}-${i}-${file.size}`, match, pick: match.kind === 'exact' ? match.id : null, stage: 'ready' };
    }));
  }

  const targetOf = (p: Placing) => (p.match.kind === 'refused' ? null : p.pick);
  const blockedFor = (id: string | null) => {
    const d = list.find((x) => x.id === id);
    return d && !allowed('finalize', d.review) ? 'This sheet is with the Design Head. Pull it back first.' : null;
  };

  async function sendAll() {
    if (!placing || !projectId) return;
    setSending(true);
    let ok = 0, tried = 0;
    for (const p of placing) {
      const id = targetOf(p);
      if (!id || p.stage === 'done' || blockedFor(id)) continue;
      tried++;
      const update = (patch: Partial<Placing>) => setPlacing((all) => all && all.map((x) => (x.key === p.key ? { ...x, ...patch } : x)));
      try {
        update({ stage: 'thumb', error: undefined });
        const thumb = await thumbnailOf(p.file);
        const d = list.find((x) => x.id === id);
        await uploadSheet({ orgId, projectId, drawingId: id }, me.uid, p.file, {
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
    if (tried) toast({ ok: ok === tried, title: `${ok} of ${tried} ${sendNow ? 'sent for review' : 'uploaded'}`, sub: ok < tried ? 'The rest stayed with you, with the reason shown.' : sendNow ? 'Watch them move across your board.' : 'Send them when you are ready.' });
    if (ok === tried && tried) setTimeout(() => setPlacing(null), 900);
  }

  async function sendCard(d: ReviewDrawing) {
    try {
      await submitSheet({ orgId, projectId: d.projectId, drawingId: d.id }, d.review?.rev);
      toast({ ok: true, title: `${d.name} is with the Design Head`, sub: 'Nothing goes to the client from here.' });
    } catch (e: any) {
      toast({ title: 'Not sent', sub: e?.message });
    }
  }

  const card = (d: ReviewDrawing) => {
    const s = stateOf(d.review);
    const action = s === 'DRAFT' ? (
      <>
        <button type="button" onClick={() => sendCard(d)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#5B5BD6] px-3 py-2 text-[13px] font-bold text-white"><Send size={14} />Send v{d.review!.versionNo} for review</button>
        <div className="mt-1 text-center text-[11px] text-[#98A79F]">or drag the card onto the Design Head’s lane</div>
      </>
    ) : s === 'CHANGES_REQUESTED' ? (
      <button type="button" onClick={() => onOpen(d.projectId, d.id)} className="w-full rounded-[10px] bg-[#14211E] px-3 py-2 text-[13px] font-bold text-white">
        {d.review!.marksOpen ? `Fix ${d.review!.marksOpen} note${d.review!.marksOpen === 1 ? '' : 's'}` : 'Drop the fixed sheet'}
      </button>
    ) : s === 'NONE' ? (
      <button type="button" onClick={() => onOpen(d.projectId, d.id)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#14211E] px-3 py-2 text-[13px] font-bold text-white"><Upload size={14} />Start this sheet</button>
    ) : null;
    return <SheetCard key={d.id} d={d} me={me.email} dim={!!room && (d.roomName || 'General / Project-Wide') !== room} draggable={s === 'DRAFT'} onOpen={() => onOpen(d.projectId, d.id)} action={action} />;
  };

  const lane = (k: Exclude<DeskLane, 'desk'>, rows: ReviewDrawing[], sub: string) => (
    <section
      className="flex min-h-[140px] flex-col gap-2.5 rounded-[18px] border-[1.5px] p-2.5 transition"
      style={{ background: `${LANE[k].soft}AA`, borderColor: k === 'review' && laneHot ? LANE.review.ink : 'transparent', borderStyle: k === 'review' && laneHot ? 'dashed' : 'solid' }}
      onDragOver={(e) => { if (k === 'review' && e.dataTransfer.types.includes('text/drawing')) { e.preventDefault(); setLaneHot(true); } }}
      onDragLeave={() => setLaneHot(false)}
      onDrop={(e) => {
        setLaneHot(false);
        const ref = e.dataTransfer.getData('text/drawing');
        if (k !== 'review' || !ref) return;
        e.preventDefault(); e.stopPropagation();
        const d = list.find((x) => `${x.projectId}/${x.id}` === ref);
        if (d && stateOf(d.review) === 'DRAFT') sendCard(d);
      }}
      aria-label={LANE[k].label}
    >
      <div className="flex items-center gap-2 px-1 pt-0.5">
        <span className="min-w-0 flex-1 text-[13px] font-extrabold text-[#14211E]">{LANE[k].label}<small className="block text-[11.5px] font-semibold text-[#66786F]">{sub}</small></span>
        <span className="font-display text-[15px] font-semibold" style={{ color: LANE[k].ink }}>{rows.length}</span>
      </div>
      {rows.length ? <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>{rows.map(card)}</div>
        : <div className="rounded-xl border-[1.5px] border-dashed px-2 py-6 text-center text-[12.5px] text-[#66786F]" style={{ borderColor: `${LANE[k].ink}4D` }}>{k === 'review' ? 'Drag a ready sheet here to send it' : 'Nothing here yet'}</div>}
    </section>
  );

  if (!projects.length) {
    return <div className="mx-auto max-w-md py-24 text-center text-[#66786F]"><PenTool className="mx-auto mb-3" /><p className="text-lg font-semibold text-[#14211E]">No projects yet</p><p className="mt-1">When the studio assigns you to a project, its drawings appear here.</p></div>;
  }

  return (
    <div>
      <section className="mb-6 grid items-stretch gap-6 lg:grid-cols-2">
        <div className="flex flex-col justify-center gap-3.5 px-1 py-2">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[#66786F]">Drawing Desk</p>
          <h1 className="font-display font-medium leading-[1.1] tracking-tight text-[#14211E]" style={{ fontSize: 'clamp(28px, 3.2vw, 40px)' }}>
            Hello, {firstName(me.name)}.<br /><em className="not-italic text-[#3D52A0]">{desk.length} sheet{desk.length === 1 ? '' : 's'}</em> on your desk.
          </h1>
          <p className="max-w-[48ch] text-base text-[#2A3B37]">
            {[returned && `${returned} came back with notes.`, ready && `${ready} ready to send.`, withHead && `${withHead} with the Design Head.`].filter(Boolean).join(' ') || 'Drop a PDF on any drawing to start.'}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" onClick={() => picker.current?.click()} className="inline-flex items-center gap-2 rounded-[10px] bg-[#14211E] px-4 py-2.5 text-[13px] font-bold text-white"><FileUp size={15} />Upload PDFs</button>
            <span className="text-xs text-[#98A79F]">or drag them anywhere on this page</span>
            <input ref={picker} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files || []) as File[]; e.target.value = ''; start(fs); }} />
          </div>
        </div>
        <div className="relative flex flex-col gap-3 overflow-hidden rounded-[18px] border border-[#E1E7E3] bg-white p-4" style={{ boxShadow: '0 1px 2px rgba(20,33,30,.06)' }}>
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(61,82,160,.07) 1.2px, transparent 1.2px)', backgroundSize: '14px 14px' }} />
          <div className="relative flex flex-wrap items-center gap-2.5">
            <h3 className="min-w-0 flex-1 font-display text-[15px] font-semibold text-[#14211E]">{project?.name || 'Project'}</h3>
            {projects.length > 1 && (
              <select value={projectId || ''} onChange={(e) => setProjectId(e.target.value)} className="max-w-[60%] rounded-full border border-[#E1E7E3] bg-[#F3F6F4] px-3 py-1 text-xs font-bold text-[#2A3B37]" aria-label="Project">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div className="relative grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {drawings === null ? <div className="col-span-full py-8 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
              : !rooms.length ? <p className="col-span-full py-6 text-center text-sm text-[#66786F]">No drawings in this project’s tracker yet.</p>
              : rooms.map(([name, ds]) => {
                const lanes = ds.map((d) => laneOf(d.review));
                const worst = lanes.includes('desk') ? 'desk' : lanes.includes('review') ? 'review' : 'approved';
                const on = room === name;
                return (
                  <button key={name} type="button" onClick={() => setRoom(on ? null : name)} aria-pressed={on}
                    className="flex min-h-[64px] flex-col justify-between rounded-xl border px-3 py-2 text-left transition"
                    style={{ background: on ? `${LANE[worst].ink}22` : `${LANE[worst].soft}`, borderColor: on ? LANE[worst].ink : 'transparent' }}>
                    <span className="truncate text-[12.5px] font-bold text-[#2A3B37]">{roomLabel(name)}</span>
                    <span className="flex items-center gap-1">
                      {ds.map((d) => <i key={d.id} title={d.name} className="h-2 w-2 rounded-full" style={{ background: stateOf(d.review) === 'NONE' ? '#C9D2CE' : LANE[laneOf(d.review)].ink }} />)}
                      <span className="ml-auto text-[10.5px] font-semibold text-[#66786F]">{ds.length} sheet{ds.length === 1 ? '' : 's'}</span>
                    </span>
                  </button>
                );
              })}
          </div>
          <div className="relative flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[#66786F]">
            {(Object.keys(LANE) as DeskLane[]).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: LANE[k].ink }} />{k === 'desk' ? 'Your desk' : LANE[k].label}</span>)}
          </div>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <h2 className="font-display text-[19px] font-semibold text-[#14211E]">Sheets</h2>
        {room ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#14211E] py-1 pl-3 pr-1.5 text-xs font-bold text-white">{roomLabel(room)}
            <button type="button" onClick={() => setRoom(null)} aria-label="Show every room" className="grid h-[18px] w-[18px] place-items-center rounded-full bg-white/20"><X size={10} /></button>
          </span>
        ) : <span className="text-[12.5px] text-[#98A79F]">Tap a room to focus on it</span>}
      </div>

      <section className="flex flex-col gap-2.5 rounded-[18px] p-2.5" style={{ background: `${LANE.desk.soft}AA` }} aria-label="On your desk">
        <div className="flex items-center gap-2 px-1 pt-0.5">
          <span className="min-w-0 flex-1 text-[13px] font-extrabold text-[#14211E]">On your desk<small className="block text-[11.5px] font-semibold text-[#66786F]">Your move · drag a ready sheet down to the Design Head</small></span>
          <span className="font-display text-[15px] font-semibold" style={{ color: LANE.desk.ink }}>{desk.length}</span>
        </div>
        {drawings === null ? <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
          : desk.length ? <div className="grid items-start gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>{desk.map(card)}</div>
          : <div className="rounded-xl border-[1.5px] border-dashed px-2 py-6 text-center text-[12.5px] text-[#66786F]" style={{ borderColor: `${LANE.desk.ink}4D` }}>Your desk is clear.</div>}
      </section>
      <div className="mt-3.5 grid items-start gap-3.5 md:grid-cols-2">
        {lane('review', byLane('review'), 'She checks every sheet before anyone else sees it')}
        {lane('approved', byLane('approved'), 'Approved by the Design Head')}
      </div>

      {dragOver && (
        <div className="fixed inset-0 z-[110] grid place-items-center p-6" style={{ background: 'rgba(30,38,60,.55)', backdropFilter: 'blur(3px)' }}>
          <div className="dr-breathe max-w-[520px] rounded-[28px] border-[2.5px] border-dashed border-white px-10 py-14 text-center text-white">
            <h2 className="font-display text-[28px] font-medium">Drop to place your sheets</h2>
            <p className="mt-1.5 opacity-85">Each PDF lands on the drawing it belongs to in {project?.name || 'this project'}.</p>
          </div>
        </div>
      )}

      {placing && (
        <>
          <div className="fixed inset-0 z-[111]" style={{ background: 'rgba(10,16,15,.25)' }} onClick={() => !sending && setPlacing(null)} />
          <aside className="dr-slide fixed bottom-0 right-0 top-0 z-[112] flex w-full max-w-[460px] flex-col bg-white" role="dialog" aria-modal="true" aria-labelledby="dr-place" style={{ boxShadow: '-30px 0 60px -20px rgba(0,0,0,.35)' }}>
            <div className="flex items-start gap-2.5 border-b border-[#ECF0ED] px-5 pb-3 pt-4">
              <div className="flex-1"><p className="text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[#66786F]">{project?.name}</p><h2 id="dr-place" className="font-display text-xl font-semibold text-[#14211E]">Placing {placing.length} file{placing.length === 1 ? '' : 's'}</h2></div>
              {!sending && <button type="button" onClick={() => setPlacing(null)} className="rounded-lg px-2 py-1 text-sm font-bold text-[#66786F] hover:text-[#14211E]">Close</button>}
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-auto px-5 py-4">
              {placing.map((p, i) => {
                const id = targetOf(p);
                const d = list.find((x) => x.id === id);
                const blocked = blockedFor(id);
                const options = p.match.kind === 'choose' ? p.match.options : [];
                const target = (opt: ReviewDrawing, on: boolean, pick: boolean) => (
                  <button key={opt.id} type="button" disabled={!pick || sending} onClick={() => setPlacing((all) => all && all.map((x) => (x.key === p.key ? { ...x, pick: x.pick === opt.id ? null : opt.id } : x)))}
                    className="flex w-full items-center gap-2.5 rounded-[10px] border-[1.5px] p-1.5 text-left transition"
                    style={{ borderColor: on ? '#2E8B6F' : '#E1E7E3', background: on ? '#E1F1EA' : '#fff' }}>
                    <span className="aspect-[1.414/1] w-[52px] shrink-0 overflow-hidden rounded-[3px] bg-[#FBFAF6]" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,.08)' }}><Thumb path={opt.review?.thumbPath} className="h-full w-full" /></span>
                    <span className="min-w-0 text-[12.5px] font-bold leading-tight text-[#14211E]">{opt.name}<small className="block text-[11px] font-semibold text-[#66786F]">{roomLabel(opt.roomName)} · {p.stage === 'done' ? `now v${opt.review?.versionNo || 1}` : `becomes v${(opt.review?.versionNo || 0) + 1}`}</small></span>
                    {on && <Check size={16} className="ml-auto shrink-0 text-[#2E8B6F]" />}
                  </button>
                );
                return (
                  <div key={p.key} className="dr-pop grid gap-2.5 rounded-2xl border p-2.5" style={{ gridTemplateColumns: '56px minmax(0, 1fr)', animationDelay: `${i * 70}ms`, borderColor: p.match.kind === 'refused' || p.stage === 'error' ? '#EBB7C6' : '#E1E7E3', background: p.match.kind === 'refused' ? '#FDF5F8' : '#fff' }}>
                    <div className="relative grid aspect-[1/1.25] place-items-center overflow-hidden rounded-md border border-[#E1E7E3] bg-[#F3F6F4] font-mono text-[9.5px] font-semibold text-[#66786F]">
                      {(p.file.name.split('.').pop() || '').toUpperCase()}
                      <b className="absolute bottom-1 left-1 right-1 rounded-[3px] text-center text-[9px] text-white" style={{ background: p.match.kind === 'refused' ? '#C2416A' : '#3D52A0' }}>{p.match.kind === 'refused' ? 'NO' : 'PDF'}</b>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="truncate text-[12.5px] font-bold text-[#14211E]" title={p.file.name}>{p.file.name}</div>
                      {d && (p.match.kind === 'exact' || p.stage !== 'ready') ? target(d, true, false) : null}
                      {p.match.kind === 'choose' && p.stage === 'ready' && <div className="grid gap-1.5">{options.map((oid) => { const o = list.find((x) => x.id === oid); return o ? target(o, p.pick === oid, true) : null; })}</div>}
                      <div className="text-[11.5px] text-[#66786F]">{p.match.why}</div>
                      {blocked && p.stage === 'ready' && <div className="text-[11.5px] font-bold text-[#C2416A]">{blocked}</div>}
                      {p.stage !== 'ready' && (
                        <>
                          <div className="h-1 overflow-hidden rounded bg-[#ECF0ED]"><i className="block h-full transition-all duration-300" style={{ width: `${p.stage === 'done' || p.stage === 'error' ? 100 : p.stage === 'checking' ? 92 : p.stage === 'thumb' ? 6 : Math.max(8, Math.round((p.fraction || 0) * 85))}%`, background: p.stage === 'done' ? '#2E8B6F' : p.stage === 'error' ? '#C2416A' : '#5B5BD6' }} /></div>
                          <div className="text-[11.5px] font-bold" style={{ color: p.stage === 'done' ? '#2E8B6F' : p.stage === 'error' ? '#C2416A' : '#5B5BD6' }}>
                            {{ thumb: 'Making a preview…', uploading: 'Uploading…', checking: 'Checking the PDF…', done: sendNow ? 'With the Design Head' : 'Uploaded', error: `Kept with you · ${p.error}` }[p.stage as Exclude<Placing['stage'], 'ready'>]}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              <div>
                <label htmlFor="dr-note" className="mb-1 block text-[11.5px] font-bold text-[#2A3B37]">A line for the Design Head <span className="font-medium text-[#98A79F]">(optional)</span></label>
                <textarea id="dr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What changed, or what to look at first" className="w-full rounded-[10px] border border-[#E1E7E3] px-3 py-2 text-[13px] outline-none focus:border-[#5B5BD6]" />
              </div>
            </div>
            <div className="flex flex-col gap-2.5 border-t border-[#ECF0ED] px-5 pb-4 pt-3">
              <label className="flex items-center gap-2.5 rounded-xl bg-[#ECECFC] px-3 py-2.5 text-[12.5px] text-[#14211E]">
                <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} disabled={sending} />
                <span><b>Send to the Design Head now.</b> Untick to upload only and send later.</span>
              </label>
              {(() => {
                const n = placing.filter((p) => targetOf(p) && p.stage !== 'done' && !blockedFor(targetOf(p))).length;
                const finished = placing.every((p) => p.stage === 'done' || p.match.kind === 'refused' || p.stage === 'error');
                return finished && !sending
                  ? <button type="button" onClick={() => setPlacing(null)} className="rounded-[10px] bg-[#14211E] px-4 py-2.5 text-[13px] font-bold text-white">Done</button>
                  : <button type="button" disabled={!n || sending} onClick={sendAll} className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#5B5BD6] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40">
                      {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}{sendNow ? `Send ${n || ''} for review` : `Upload ${n || ''}`}
                    </button>;
              })()}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
