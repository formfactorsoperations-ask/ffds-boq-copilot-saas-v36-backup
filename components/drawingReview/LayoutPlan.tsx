import React, { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eraser, Loader2, MapPinned, X } from 'lucide-react';
import type { PlanBox } from '../../lib/designMeeting';
import { saveLayoutRooms } from '../../services/designMeetingService';
import PdfStage from './PdfStage';
import { CLIENT, roomLabel, useToast } from './ui';

/*
  THE LAYOUT PLAN BESIDE A ROOM.

  A meeting shows the approved layout plan next to every room, with the room
  being presented outlined on it, so the client always knows where in the
  home a drawing is. The rooms are marked on the plan once per project
  (LayoutRooms, below); a plan with no marks is still shown, just without
  the outline.
*/

export interface PlanSheet { drawingId: string; name: string; versionNo: number; pdfPath: string | null }

/** The plan with one room outlined. `loader` serves a plan the browser cannot read itself (the client's portal). */
export const LayoutPanel: React.FC<{
  sheet: PlanSheet; room: string; box: PlanBox | null;
  loader?: () => Promise<ArrayBuffer>; fitHeight?: number; maxWidth?: number; compact?: boolean;
}> = ({ sheet, room, box, loader, fitHeight, maxWidth, compact }) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <div className="flex items-center gap-2 text-[11.5px] font-bold text-[#5F636D]">
      <MapPinned size={14} className="shrink-0" style={{ color: CLIENT }} />
      <span className="min-w-0 flex-1 truncate">{sheet.name} · v{sheet.versionNo}</span>
      {box ? <span style={{ color: CLIENT }}>{roomLabel(room)} outlined</span> : !compact && <span>Room not marked on the plan</span>}
    </div>
    {sheet.pdfPath ? (
      <PdfStage pdfPath={sheet.pdfPath} loader={loader} page={box?.page || 0} zoom={1} marks={[]} tool="select" canMark={false}
        fitHeight={fitHeight} maxWidth={maxWidth} areas={box ? [{ ...box, label: roomLabel(room), active: true }] : null} />
    ) : <div className="grid h-32 place-items-center text-[12.5px] text-[#5F636D]">The plan has no PDF.</div>}
  </div>
);

/* Marks each room on the plan with a box, once; saved for the project. */
export const LayoutRooms: React.FC<{
  orgId: string; projectId: string; sheet: PlanSheet; rooms: string[];
  initial: Record<string, PlanBox>; onClose: () => void;
}> = ({ orgId, projectId, sheet, rooms, initial, onClose }) => {
  const toast = useToast();
  const [boxes, setBoxes] = useState<Record<string, PlanBox>>(initial);
  const [current, setCurrent] = useState(() => rooms.find((r) => !initial[r]) || rooms[0] || '');
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const marked = rooms.filter((r) => boxes[r]).length;

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, onClose]);

  const place = (shape: any) => {
    if (!current || shape?.t !== 'rect') return;
    const next = { ...boxes, [current]: { page, x: shape.x, y: shape.y, w: shape.w, h: shape.h } };
    setBoxes(next);
    const after = rooms.slice(rooms.indexOf(current) + 1).concat(rooms).find((r) => !next[r]);
    if (after) setCurrent(after);
  };
  const clear = (r: string) => { const n = { ...boxes }; delete n[r]; setBoxes(n); setCurrent(r); };

  async function save() {
    setBusy(true);
    try {
      await saveLayoutRooms({ orgId, projectId }, sheet.drawingId, boxes);
      toast({ ok: true, title: `${marked} of ${rooms.length} rooms marked`, sub: 'Each room is outlined on the plan when you present it.' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Not saved', sub: e?.message });
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center overflow-auto p-4" style={{ background: 'rgba(23,25,30,.55)' }} role="dialog" aria-modal="true" aria-labelledby="lr-title">
      <div className="dd-pop flex max-h-[calc(100vh-32px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_24px_60px_-20px_rgba(23,25,30,.5)]">
        <div className="flex items-start gap-3 border-b border-[#EEEEEA] px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="lr-title" className="font-display text-[22px] font-semibold">Mark the rooms on the plan</h2>
            <p className="text-[13px] text-[#5F636D]">{sheet.name} v{sheet.versionNo}. Pick a room, then drag a box over it. Once per project; every meeting then outlines the room it is presenting.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl text-[#4F535C] hover:bg-[#F1F1EC]"><X size={18} /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-wrap gap-4 overflow-auto p-5">
          <div className="min-w-0 flex-[999_1_560px]">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-bold">
              {current ? <span>Drawing a box for <span style={{ color: CLIENT }}>{roomLabel(current)}</span></span> : <span>Every room is marked</span>}
              {pages > 1 && (
                <span className="ml-auto inline-flex items-center gap-1">
                  <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className="grid h-9 w-9 place-items-center rounded-[10px] hover:bg-[#F1F1EC] disabled:opacity-40"><ChevronLeft size={16} /></button>
                  Page {page + 1} of {pages}
                  <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Next page" className="grid h-9 w-9 place-items-center rounded-[10px] hover:bg-[#F1F1EC] disabled:opacity-40"><ChevronRight size={16} /></button>
                </span>
              )}
            </div>
            <div className="rounded-[14px] bg-[#F1F1EC] p-3">
              {sheet.pdfPath && (
                <PdfStage pdfPath={sheet.pdfPath} page={page} zoom={1} marks={[]} tool="rect" canMark={!!current} onPageCount={setPages} onShape={place}
                  fitHeight={typeof window !== 'undefined' ? window.innerHeight - 280 : 600}
                  areas={rooms.filter((r) => boxes[r] && boxes[r].page === page).map((r) => ({ ...boxes[r], label: roomLabel(r), active: r === current }))} />
              )}
            </div>
          </div>
          <div className="flex min-w-[240px] flex-[1_1_240px] flex-col">
            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[.09em] text-[#5F636D]">Rooms · {marked} of {rooms.length} marked</div>
            <div className="flex flex-col gap-1">
              {rooms.map((r) => (
                <div key={r} className="flex items-center gap-2 rounded-[12px] px-2 py-1.5" style={{ background: r === current ? '#FBF1E3' : undefined }}>
                  <button type="button" onClick={() => setCurrent(r)} aria-pressed={r === current} className="flex min-h-[40px] flex-1 items-center gap-2.5 text-left font-bold">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-[12px] text-white" style={{ background: boxes[r] ? '#4146C8' : r === current ? CLIENT : '#DCDCD5' }}>{boxes[r] ? <Check size={13} strokeWidth={3} /> : ''}</span>
                    {roomLabel(r)}
                  </button>
                  {boxes[r] && <button type="button" onClick={() => clear(r)} aria-label={`Redraw ${roomLabel(r)}`} className="grid h-9 w-9 place-items-center rounded-[10px] text-[#5F636D] hover:bg-[#EBEBE5]"><Eraser size={14} /></button>}
                </div>
              ))}
            </div>
            <div className="mt-auto flex gap-2 pt-4">
              <button type="button" onClick={onClose} disabled={busy} className="min-h-[44px] flex-1 whitespace-nowrap rounded-xl border border-[#DCDCD5] bg-white px-4 text-[14px] font-bold hover:border-[#A9AAA2]">Cancel</button>
              <button type="button" onClick={save} disabled={busy} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#4146C8] px-4 text-[14px] font-bold text-white hover:bg-[#3439AD] disabled:opacity-45">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />}Save rooms
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
