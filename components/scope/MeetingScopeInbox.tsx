import React, { useState } from 'react';
import { AlertTriangle, CalendarDays, Loader2, Plus, X } from 'lucide-react';
import type { MomScopeItem } from '../../hooks/useMomScopeQueue';

/*
  "From meetings": the cost and scope items finalised minutes have queued for
  a revision. One quiet card at the top of the revision screen. Each item is
  added where the studio says (a room of the draft, or the Add Item form), or
  set aside; either way the minutes record what became of it.
*/

interface Props {
  items: MomScopeItem[];
  /** Rooms to add into. Absent when items cannot be added here right now. */
  rooms?: string[];
  addLabel?: string;
  /** Shown instead of the add controls when `rooms` is absent. */
  hint?: string;
  onAdd?: (item: MomScopeItem, room: string) => Promise<void> | void;
  onDismiss?: (item: MomScopeItem) => Promise<void> | void;
}

const day = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

export default function MeetingScopeInbox({ items, rooms, addLabel = 'Add', hint, onAdd, onDismiss }: Props) {
  const [roomFor, setRoomFor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!items.length) return null;

  const run = async (key: string, fn: () => Promise<void> | void) => {
    setBusy(key);
    setError(null);
    try { await fn(); } catch (e: any) {
      console.error(e);
      setError(`That did not save: ${e?.message || e}. Please try again.`);
    } finally { setBusy(null); }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#3D52A0]/20 shadow-2xs">
      <div className="px-4 sm:px-5 pt-4 pb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#3D52A0]" />
          <h3 className="text-[13.5px] font-bold text-slate-900">From meetings</h3>
          <span className="text-[12px] text-slate-500">{items.length} cost or scope item{items.length === 1 ? '' : 's'} waiting</span>
        </div>
        {hint && <span className="text-[12px] text-slate-500">{hint}</span>}
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((it) => {
          const room = roomFor[it.key] ?? rooms?.[0] ?? '';
          return (
            <li key={it.key} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 basis-[260px]">
                <p className="text-[13px] font-semibold text-slate-900 leading-snug">{it.text}</p>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  {it.momRef}{it.momRev ? ` Rev ${it.momRev}` : ''} · {it.ref} · {day(it.meetingDate)}
                  {it.owner ? ` · ${it.owner}` : ''}
                  {it.cost && <span className="ml-1.5 text-rose-700 font-bold">Cost</span>}
                  {it.scope && <span className="ml-1.5 text-rose-700 font-bold">Scope</span>}
                </p>
              </div>
              {rooms && onAdd && (
                <div className="flex items-center gap-1.5">
                  {rooms.length > 0 && (
                    <select
                      aria-label={`Room for ${it.ref}`}
                      value={room}
                      onChange={(e) => setRoomFor((r) => ({ ...r, [it.key]: e.target.value }))}
                      className="text-[12px] font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 max-w-[160px] outline-none focus:ring-2 focus:ring-[#3D52A0]/25"
                    >
                      {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                  <button
                    type="button"
                    disabled={busy === it.key}
                    onClick={() => run(it.key, () => onAdd(it, room))}
                    className="px-2.5 py-1.5 rounded-lg bg-[#3D52A0] hover:bg-[#334486] disabled:opacity-60 text-white text-[12px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {busy === it.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {addLabel}
                  </button>
                </div>
              )}
              {onDismiss && (
                <button
                  type="button"
                  disabled={busy === it.key}
                  onClick={() => run(it.key, () => onDismiss(it))}
                  title="Not a change to the scope: take it off this list"
                  className="px-2 py-1.5 rounded-lg text-[12px] font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Set aside
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="px-5 pb-3 text-[12px] font-semibold text-rose-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
    </div>
  );
}
