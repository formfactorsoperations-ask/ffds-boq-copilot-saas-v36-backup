import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { byDay, cleanMessage, MAX_MESSAGE, roomThread, type MessagePerson, type RoomMessage } from '../../lib/roomMessages';
import { postRoomMessage } from '../../services/roomMessageService';
import { initialsOf } from '../../lib/notify';

/*
  ONE ROOM'S MESSAGES (lib/roomMessages.ts): the thread and the box to write in.

  Used in two places: beside a room's drawings on Design Desk 2.0 (`tone`
  "desk", emerald), and in the Room messages panel of a project's Drawings tab
  (`tone` "console", the brand blue), so the people who cannot open the Design
  Desk reach the same thread. A message is sent with the button or Ctrl + Enter
  and cannot be edited afterwards, so the box says so.
*/

interface Props {
  orgId: string;
  projectId: string;
  room: string;
  /** The room's name as people read it ("Whole home" for the general room). */
  roomName: string;
  /** Every message of the project, or null while they load. */
  messages: RoomMessage[] | null;
  /** Set when the messages could not be read. */
  error?: string | null;
  me: MessagePerson;
  tone?: 'desk' | 'console';
  className?: string;
}

const TONE = {
  desk: { send: 'bg-emerald-600 hover:bg-emerald-700', focus: 'focus:border-emerald-600 focus:ring-emerald-600/20', mine: 'bg-emerald-50', face: 'bg-emerald-600', chip: 'bg-emerald-50 text-emerald-700' },
  console: { send: 'bg-[#3D52A0] hover:bg-[#334486]', focus: 'focus:border-[#3D52A0] focus:ring-[#3D52A0]/30', mine: 'bg-[#3D52A0]/10', face: 'bg-[#3D52A0]', chip: 'bg-[#3D52A0]/10 text-[#3D52A0]' },
};
const clock = (at: number) => new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export default function RoomThread({ orgId, projectId, room, roomName, messages, error, me, tone = 'desk', className = '' }: Props) {
  const t = TONE[tone];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const days = useMemo(() => byDay(roomThread(messages || [], room)), [messages, room]);
  const count = days.reduce((n, d) => n + d.messages.length, 0);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [count, room]);
  useEffect(() => { setText(''); setProblem(null); }, [room, projectId]);

  async function send() {
    const clean = cleanMessage(text);
    if (!clean || busy) return;
    setBusy(true); setProblem(null);
    try {
      await postRoomMessage({ orgId, projectId, room, text: clean, by: me });
      setText('');
    } catch (e: any) {
      setProblem(e?.message || 'The message was not sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`Messages for ${roomName}`} className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.chip}`}><MessageSquare size={18} aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-800">Messages · {roomName}</h3>
          <p className="truncate text-xs text-slate-500">For the design leads and the people on this project. The client never sees them.</p>
        </div>
      </header>

      <div className="min-h-[160px] flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {error ? (
          <p className="py-8 text-center text-sm text-slate-500">{error}</p>
        ) : messages === null ? (
          <div className="grid h-full min-h-[120px] place-items-center text-slate-400"><Loader2 className="animate-spin" aria-label="Loading messages" /></div>
        ) : !count ? (
          <p className="py-8 text-center text-sm text-slate-500">No messages in this room yet. Write the first one below.</p>
        ) : days.map((d) => (
          <div key={d.label}>
            <div className="my-2 text-center text-xs font-bold text-slate-400">{d.label}</div>
            <ul className="flex flex-col gap-2">
              {d.messages.map((m) => {
                const mine = !!me.uid && m.by?.uid === me.uid;
                return (
                  <li key={m.id} className="hud-row-in flex items-start gap-2.5">
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${mine ? t.face : 'bg-slate-400'}`} aria-hidden>{initialsOf(m.by?.name)}</span>
                    <div className={`min-w-0 flex-1 rounded-2xl px-3 py-2 ${mine ? t.mine : 'bg-slate-50'}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <b className="text-sm text-slate-800">{mine ? 'You' : m.by?.name || 'Someone'}</b>
                        <span className="text-xs text-slate-400">{clock(m.at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{m.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div ref={end} />
      </div>

      {!error && (
        <form className="border-t border-slate-100 bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor={`rm-${projectId}-${room}`} className="sr-only">Write a message for {roomName}</label>
          <div className="flex items-end gap-2">
            <textarea id={`rm-${projectId}-${room}`} value={text} rows={2} maxLength={MAX_MESSAGE} disabled={busy} placeholder={`Write to the team about ${roomName}`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
              className={`min-h-[44px] w-full flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 disabled:bg-slate-50 ${t.focus}`} />
            <button type="submit" disabled={busy || !cleanMessage(text)} aria-label="Send the message"
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition-colors disabled:opacity-50 ${t.send}`}>
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Send size={18} aria-hidden />}Send
            </button>
          </div>
          {problem ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{problem}</p>
            : <p className="mt-1.5 text-xs text-slate-500">Ctrl + Enter sends. A message cannot be changed after it is sent.</p>}
        </form>
      )}
    </section>
  );
}
