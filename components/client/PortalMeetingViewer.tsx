import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, Lock, Minus, Plus, Undo2, X } from '@/lib/lucide-shim';
import type { PortalDesignMeeting } from '../../lib/designMeeting';
import type { ReviewMark } from '../../lib/drawingReview';
import { fetchMeetingSheet } from '../../services/clientPortalActions';
import PdfStage from '../drawingReview/PdfStage';
import { LayoutPanel } from '../drawingReview/LayoutPlan';

/*
  THE DRAWINGS FROM A DESIGN MEETING, AS THE CLIENT SAW THEM.

  The exact versions shown, with the client's changes pinned where they asked,
  and the layout plan with the room outlined. View only: the bytes come from
  the portalSheet function to this client's login alone, there is no download
  or print, and their name and the date run across every page. Each opening
  is recorded by the studio, and the client is shown when they looked.
*/

interface Props {
  projectId: string;
  meeting: PortalDesignMeeting;
  clientName: string;
  onClose: () => void;
}

const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const time = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const roomName = (r: string) => (/^general/i.test(r) ? 'Whole home' : r);

export default function PortalMeetingViewer({ projectId, meeting, clientName, onClose }: Props) {
  const [ri, setRi] = useState(0);
  const [si, setSi] = useState(0);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [views, setViews] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, Promise<ArrayBuffer>>());

  const room = meeting.rooms[ri] || meeting.rooms[0];
  const sheet = room.sheets[si] || room.sheets[0];

  /* One request per drawing for this viewer; the answer also says when the client has looked. */
  const bytesOf = (drawingId: string) => () => {
    if (!cache.current.has(drawingId)) {
      const p = fetchMeetingSheet(projectId, meeting.id, drawingId).then((r) => { setViews(r.views); return r.bytes; });
      p.catch((e) => { cache.current.delete(drawingId); setError(e?.message || 'This drawing could not be opened.'); });
      cache.current.set(drawingId, p);
    }
    return cache.current.get(drawingId)!;
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      /* No printing or saving from here. */
      if ((e.ctrlKey || e.metaKey) && /^[ps]$/i.test(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const marks = useMemo(() => room.pins.filter((p) => p.drawingId === sheet?.drawingId && p.page === page)
    .map((p) => ({ id: `p${p.n}`, n: p.n, page: p.page, shape: p.shape, status: 'OPEN', source: 'client' }) as unknown as ReviewMark), [room, sheet, page]);

  const stamp = `Shown to ${clientName} · ${day(meeting.heldAt)} · view only`;
  const watermark = (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -inset-1/2 flex rotate-[-24deg] flex-col justify-center gap-14 opacity-[0.12]">
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="whitespace-nowrap text-[20px] font-extrabold tracking-wide text-slate-900">{`${stamp}   ·   ${stamp}   ·   ${stamp}`}</div>
        ))}
      </div>
    </div>
  );

  const go = (r: number) => { setRi(r); setSi(0); setPage(0); setError(null); };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-50 select-none" role="dialog" aria-modal="true" aria-labelledby="pmv-title"
      onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      <style>{'@media print { body * { visibility: hidden !important; } }'}</style>
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 id="pmv-title" className="font-black text-slate-900 text-lg tracking-tight">Design meeting, {day(meeting.heldAt)}</h2>
          <p className="text-xs font-medium text-slate-500">The drawings as you saw them, with your changes pinned where you asked.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-[#334486]"><Lock className="h-3.5 w-3.5" />View only</span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-5 py-2">
        {meeting.rooms.map((r, i) => (
          <button key={r.room} type="button" onClick={() => go(i)} aria-pressed={i === ri}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3 text-[12.5px] font-bold transition ${i === ri ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {roomName(r.room)}
            {r.outcome === 'agreed' ? <Check className="h-3.5 w-3.5" /> : <span className={`rounded-full px-1.5 text-[10px] ${i === ri ? 'bg-white/20' : 'bg-amber-100 text-amber-800'}`}>{r.changes.length}</span>}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-wrap gap-4 overflow-auto p-4">
        <div className="min-w-0 flex-[999_1_640px]">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {room.sheets.map((s, i) => (
              <button key={s.drawingId} type="button" onClick={() => { setSi(i); setPage(0); setError(null); }} aria-pressed={i === si}
                className={`min-h-[36px] rounded-full border px-3 text-[12px] font-bold ${i === si ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                {s.name} · v{s.versionNo}
              </button>
            ))}
            <span className="ml-auto inline-flex items-center gap-1">
              {pages > 1 && <>
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-xs font-bold text-slate-600">Page {page + 1} of {pages}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Next page" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </>}
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><Minus className="h-4 w-4" /></button>
              <button type="button" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><Plus className="h-4 w-4" /></button>
            </span>
          </div>
          <div className="overflow-auto rounded-2xl bg-slate-100 p-3">
            {error ? <div className="grid h-60 place-items-center p-6 text-center text-sm text-slate-600">{error}</div> : sheet && (
              <React.Fragment key={`${meeting.id}/${sheet.drawingId}`}>
                <PdfStage pdfPath={`portal:${meeting.id}:${sheet.drawingId}`} loader={bytesOf(sheet.drawingId)} page={page} zoom={zoom} marks={marks}
                  tool="select" canMark={false} markColor="#C77A1A" onPageCount={setPages} maxWidth={1400}
                  fitHeight={typeof window !== 'undefined' ? window.innerHeight - 240 : 700} overlay={watermark} />
              </React.Fragment>
            )}
          </div>
          <p className="mt-2 text-[11.5px] text-slate-500">These drawings stay in your portal and can’t be downloaded. Ask your designer if you need a printed copy.</p>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
          {meeting.layout && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Where this is</div>
              <LayoutPanel sheet={{ ...meeting.layout, pdfPath: `portal:${meeting.id}:${meeting.layout.drawingId}` }} loader={bytesOf(meeting.layout.drawingId)}
                room={room.room} box={room.box} maxWidth={360} compact />
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">{room.outcome === 'agreed' ? 'You agreed this room as shown' : 'You asked us to change'}</div>
            {room.outcome === 'agreed' ? (
              <p className="flex items-center gap-2 text-sm text-slate-700"><Check className="h-4 w-4 text-emerald-600" />{roomName(room.room)}: no changes.</p>
            ) : (
              <ol className="space-y-2">
                {room.changes.map((c, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-slate-800"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#C77A1A] text-[11px] font-extrabold text-white">{i + 1}</span>{c}</li>
                ))}
              </ol>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500"><Eye className="h-3.5 w-3.5" />Seen</div>
            <p className="text-slate-600">{views.length ? `You opened these drawings on ${views.slice(-3).map(time).join(', ')}.` : 'Opening now.'}</p>
            {meeting.confirmation
              ? <p className="mt-2 flex items-center gap-1.5 font-semibold text-emerald-700"><Check className="h-4 w-4" />Confirmed by {meeting.confirmation.name} on {day(meeting.confirmation.at)}</p>
              : <p className="mt-2 flex items-center gap-1.5 text-amber-700"><Undo2 className="h-4 w-4" />Not confirmed yet. Close this to confirm the record.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
