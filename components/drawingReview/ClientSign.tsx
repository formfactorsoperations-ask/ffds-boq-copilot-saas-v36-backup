import React, { useEffect, useRef, useState } from 'react';
import { Check, Eraser, Loader2, PenLine, X } from 'lucide-react';
import { cleanSignerName, type DesignMeeting } from '../../lib/designMeeting';
import { signMeeting } from '../../services/designMeetingService';
import { RoomRecord } from './Meetings';
import { shortDate, useToast } from './ui';

/*
  THE CLIENT SIGNS ON THE STUDIO'S SCREEN.

  For a client who is in the room: the record of the meeting, their name, and
  a signature drawn with a finger or a mouse. The alternative is the portal,
  where the client confirms the same record signed in as themselves.
*/

interface Props {
  orgId: string;
  projectId: string;
  meeting: DesignMeeting;
  onClose: () => void;
  onSigned?: (m: DesignMeeting) => void;
}

/* The saved image is at most this wide, which keeps it small enough to store with the meeting. */
const EXPORT_WIDTH = 600;

function usePad() {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 2.4; g.strokeStyle = '#17191E';
      setInked(false);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      const g = canvas.current!.getContext('2d')!;
      const [x, y] = at(e);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke();
      setInked(true);
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return;
      const g = canvas.current!.getContext('2d')!;
      const [x, y] = at(e);
      g.lineTo(x, y); g.stroke();
    },
    onPointerUp: () => { drawing.current = false; },
    onPointerCancel: () => { drawing.current = false; },
  };
  const clear = () => {
    const c = canvas.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setInked(false);
  };
  const image = () => {
    const c = canvas.current!;
    const w = Math.min(EXPORT_WIDTH, c.width);
    const out = document.createElement('canvas');
    out.width = w; out.height = Math.round(c.height * (w / c.width));
    out.getContext('2d')!.drawImage(c, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  };
  return { canvas, handlers, inked, clear, image };
}

export default function ClientSign({ orgId, projectId, meeting, onClose, onSigned }: Props) {
  const toast = useToast();
  const pad = usePad();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const decided = meeting.rooms.filter((r) => r.outcome);
  const ok = !!cleanSignerName(name) && pad.inked;

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, onClose]);

  async function save() {
    if (!ok) return;
    setBusy(true);
    try {
      const m = await signMeeting({ orgId, projectId }, meeting.id, name.trim(), pad.image());
      toast({ ok: true, celebrate: true, title: `Signed by ${name.trim()}`, sub: 'The record is confirmed. The client sees it in their portal too.' });
      if (m) onSigned?.(m);
      onClose();
    } catch (e: any) {
      toast({ title: 'Not saved', sub: e?.message });
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center overflow-auto p-4" style={{ background: 'rgba(23,25,30,.55)' }} role="dialog" aria-modal="true" aria-labelledby="cs-title">
      <div className="dd-pop flex max-h-[calc(100vh-32px)] w-full max-w-[720px] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_24px_60px_-20px_rgba(23,25,30,.5)]">
        <div className="flex items-start gap-3 border-b border-[#EEEEEA] px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="cs-title" className="font-display text-[22px] font-semibold">Confirm the design meeting</h2>
            <p className="text-[13px] text-[#5F636D]">{shortDate(meeting.closedAt || meeting.startedAt)}{meeting.attendees ? ` · with ${meeting.attendees}` : ''}. Please read it through, then sign below.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl text-[#4F535C] hover:bg-[#F1F1EC]"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-2 overflow-auto px-6 py-4">
          {decided.map((r) => <RoomRecord key={r.room} r={{ ...r, charge: null, round: 0 }} included={meeting.includedRounds} />)}
        </div>
        <div className="flex flex-col gap-3 border-t border-[#EEEEEA] px-6 pb-5 pt-4">
          <label className="flex flex-col gap-1 text-[13px] font-bold">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" placeholder="As you would sign it"
              className="min-h-[44px] rounded-[10px] border border-[#DCDCD5] px-3 text-[15px] font-medium outline-none focus:border-[#4146C8] focus:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]" />
          </label>
          <div>
            <div className="mb-1 flex items-center justify-between text-[13px] font-bold">
              <span className="inline-flex items-center gap-1.5"><PenLine size={14} />Sign here</span>
              <button type="button" onClick={pad.clear} disabled={!pad.inked || busy} className="inline-flex min-h-[32px] items-center gap-1 rounded-[9px] px-2 text-[12.5px] font-bold text-[#4F535C] hover:bg-[#F1F1EC] disabled:opacity-40"><Eraser size={13} />Clear</button>
            </div>
            <canvas ref={pad.canvas} {...pad.handlers} aria-label="Signature box: sign with a finger or the mouse"
              className="h-[160px] w-full touch-none rounded-[14px] border-[1.5px] border-dashed border-[#CFCFC7] bg-[#FCFCFA]" style={{ cursor: 'crosshair' }} />
          </div>
          <p className="text-[12.5px] text-[#5F636D]">By signing, you confirm this is a true record of what was shown, what you agreed and what you asked us to change.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="min-h-[44px] rounded-xl px-4 text-[14px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]">Not now</button>
            <button type="button" onClick={save} disabled={!ok || busy} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1F7A57] px-[18px] text-[14px] font-bold text-white hover:bg-[#196649] disabled:opacity-45">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />}Confirm and sign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
