import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Presentation, X } from 'lucide-react';
import { isClientSheet, roomOf, GENERAL_ROOM } from '../../lib/designMeeting';
import { stateOf } from '../../lib/drawingReview';
import { setPresenters } from '../../services/designMeetingService';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import { roomLabel, firstName, Initials, useToast } from './ui';
import { STATUS, Chip } from './DeskParts';

/*
  WHO PRESENTS EACH DRAWING.

  The Design Head ticks, per drawing, which of the project's Designers may
  present it to the client. A Designer's meeting then shows only those
  drawings, and only once they are approved. The Design Head and the leads
  present every approved drawing without being listed here.
*/

export interface TeamMember { email: string; name: string }

interface Props {
  orgId: string;
  projectId: string;
  projectName: string;
  drawings: ReviewDrawing[];
  designers: TeamMember[];
  onClose: () => void;
}

const lower = (e: string) => e.trim().toLowerCase();

export default function Presenters({ orgId, projectId, projectName, drawings, designers, onClose }: Props) {
  const toast = useToast();
  const sheets = useMemo(() => drawings.filter(isClientSheet).sort((a, b) => {
    const ra = roomOf(a), rb = roomOf(b);
    return ra === rb ? a.name.localeCompare(b.name) : ra === GENERAL_ROOM ? 1 : rb === GENERAL_ROOM ? -1 : ra.localeCompare(rb);
  }), [drawings]);
  const saved = useMemo(() => Object.fromEntries(sheets.map((d) => [d.id, (d.review?.presenters || []).map(lower).sort()])), [sheets]);
  const [pick, setPick] = useState<Record<string, string[]>>(saved);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, onClose]);

  /* A drawing with no PDF yet has nothing to present; it can be given once one is uploaded. */
  const canGive = (d: ReviewDrawing) => !!d.review && d.review.versionNo !== undefined;
  const has = (id: string, e: string) => (pick[id] || []).includes(e);
  const flip = (id: string, e: string) => setPick((p) => ({ ...p, [id]: has(id, e) ? (p[id] || []).filter((x) => x !== e) : [...(p[id] || []), e].sort() }));
  const rooms = useMemo(() => [...new Set(sheets.map(roomOf))], [sheets]);
  const inRoom = (room: string) => sheets.filter((d) => roomOf(d) === room && canGive(d));
  const allInRoom = (room: string, e: string) => inRoom(room).length > 0 && inRoom(room).every((d) => has(d.id, e));
  const flipRoom = (room: string, e: string) => {
    const on = !allInRoom(room, e);
    setPick((p) => {
      const next = { ...p };
      inRoom(room).forEach((d) => {
        const cur = next[d.id] || [];
        next[d.id] = on ? [...new Set([...cur, e])].sort() : cur.filter((x) => x !== e);
      });
      return next;
    });
  };

  const changed = sheets.filter((d) => canGive(d) && (pick[d.id] || []).join(',') !== (saved[d.id] || []).join(','));
  async function save() {
    if (!changed.length) { onClose(); return; }
    setBusy(true);
    try {
      await setPresenters({ orgId, projectId }, Object.fromEntries(changed.map((d) => [d.id, pick[d.id] || []])));
      toast({ ok: true, title: 'Presenters saved', sub: `${changed.length} drawing${changed.length === 1 ? '' : 's'} updated in ${projectName}` });
      onClose();
    } catch (e: any) {
      toast({ title: 'Not saved', sub: e?.message });
    } finally { setBusy(false); }
  }

  const cols = `minmax(0,1fr) repeat(${Math.max(1, designers.length)}, 76px)`;
  const box = (on: boolean, disabled: boolean, label: string, onClick: () => void) => (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      className="mx-auto grid h-9 w-9 place-items-center rounded-[10px] border transition disabled:opacity-35"
      style={on ? { background: '#4146C8', borderColor: '#4146C8', color: '#fff' } : { background: '#fff', borderColor: '#DCDCD5' }}>
      {on && <Check size={16} strokeWidth={3} />}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center overflow-auto p-4" style={{ background: 'rgba(23,25,30,.55)' }} role="dialog" aria-modal="true" aria-labelledby="pp-title">
      <div className="dd-pop flex max-h-[calc(100vh-32px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_24px_60px_-20px_rgba(23,25,30,.5)]">
        <div className="flex items-start gap-3 border-b border-[#EEEEEA] px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="pp-title" className="font-display text-[22px] font-semibold">Who presents each drawing</h2>
            <p className="text-[13px] text-[#5F636D]">A designer can present a drawing you tick here once you have approved it, at a meeting they run. You and the studio's leads present every approved drawing.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl text-[#4F535C] hover:bg-[#F1F1EC]"><X size={18} /></button>
        </div>

        {!designers.length ? (
          <div className="px-6 py-10 text-center text-[14px] text-[#5F636D]">
            <Presentation className="mx-auto mb-2 text-[#8A8E97]" />
            No designer is on {projectName} yet. Add one from the project's team, then choose what they present.
          </div>
        ) : !sheets.length ? (
          <div className="px-6 py-10 text-center text-[14px] text-[#5F636D]">No drawings for the client in this project yet.</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="sticky top-0 z-[1] grid items-end gap-x-2 border-b border-[#EEEEEA] bg-white px-6 pb-2 pt-3" style={{ gridTemplateColumns: cols }}>
              <span className="text-[11px] font-bold uppercase tracking-[.08em] text-[#5F636D]">Drawing</span>
              {designers.map((p) => (
                <span key={p.email} className="flex flex-col items-center gap-1 text-center" title={p.email}>
                  <Initials name={p.name} size={28} />
                  <span className="w-full truncate text-[12px] font-bold">{firstName(p.name)}</span>
                </span>
              ))}
            </div>
            {rooms.map((room) => (
              <div key={room} className="border-b border-[#EEEEEA] last:border-b-0">
                <div className="grid items-center gap-x-2 bg-[#F6F6F2] px-6 py-1.5" style={{ gridTemplateColumns: cols }}>
                  <span className="truncate text-[13px] font-bold">{roomLabel(room)} <span className="font-semibold text-[#5F636D]">· all</span></span>
                  {designers.map((p) => <span key={p.email}>{box(allInRoom(room, lower(p.email)), !inRoom(room).length || busy, `${firstName(p.name)} presents every drawing in ${roomLabel(room)}`, () => flipRoom(room, lower(p.email)))}</span>)}
                </div>
                {sheets.filter((d) => roomOf(d) === room).map((d) => {
                  const st = stateOf(d.review);
                  const ok = canGive(d);
                  return (
                    <div key={d.id} className="grid items-center gap-x-2 px-6 py-2" style={{ gridTemplateColumns: cols }}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{d.name}{d.review?.versionNo ? <span className="font-medium text-[#8A8E97]"> · v{d.review.versionNo}</span> : null}</span>
                        <Chip small tone={st === 'NONE' ? 'grey' : STATUS[st].tone}>{ok ? STATUS[st].label : 'No PDF yet'}</Chip>
                      </span>
                      {designers.map((p) => <span key={p.email}>{box(has(d.id, lower(p.email)), !ok || busy, `${firstName(p.name)} presents ${d.name}`, () => flip(d.id, lower(p.email)))}</span>)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#EEEEEA] bg-[#FBFBF8] px-6 py-3">
          <span className="mr-auto text-[12px] text-[#5F636D]">{changed.length ? `${changed.length} drawing${changed.length === 1 ? '' : 's'} changed` : 'No changes yet'}</span>
          <button type="button" onClick={onClose} disabled={busy} className="min-h-[44px] rounded-xl px-4 text-[14px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]">Cancel</button>
          <button type="button" onClick={save} disabled={busy || !changed.length} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#4146C8] px-[18px] text-[14px] font-bold text-white hover:bg-[#3439AD] disabled:opacity-45">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />}Save
          </button>
        </div>
      </div>
    </div>
  );
}
