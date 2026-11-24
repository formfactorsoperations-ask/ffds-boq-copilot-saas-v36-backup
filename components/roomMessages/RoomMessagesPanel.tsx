import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { Button } from '../ui/kit';
import { canUseRoomMessages, countByRoom } from '../../lib/roomMessages';
import { GENERAL_ROOM } from '../../lib/designDesk';
import { useProjectMessages } from './useProjectMessages';
import RoomThread from './RoomThread';
import '../projectHeader/projectHeader.css';

/*
  ROOM MESSAGES in a project's Drawings tab.

  One button that opens the project's rooms and their threads. It is here so
  that everyone who may read the messages can: Client Relations cannot open
  the Design Desk, and a studio still on the earlier desk has no room page.
  The button shows only to the roles the rules let in (lib/roomMessages.ts).
*/

interface Props {
  projectId: string;
  /** The rooms of the project's drawings, as the drawings name them (empty or missing: the whole home). */
  rooms: (string | null | undefined)[];
}

const label = (room: string) => (room === GENERAL_ROOM ? 'Whole home' : room);

export default function RoomMessagesPanel({ projectId, rooms }: Props) {
  const { orgData, currentRole, currentRoles, currentUserAuth } = useOrg() as any;
  const orgId = orgData?.tenantId || 'demo-tenant-01';
  const role: string[] = currentRoles?.length ? currentRoles : [String(currentRole || '')];
  const allowed = canUseRoomMessages(role) && !!projectId;
  const [open, setOpen] = useState(false);
  const { messages, error } = useProjectMessages(orgId, projectId, allowed && open);
  const counts = useMemo(() => countByRoom(messages || []), [messages]);
  /* The rooms that have drawings, and any room that already has messages. */
  const list = useMemo(() => {
    const names = new Set<string>(rooms.map((r) => r || GENERAL_ROOM));
    Object.keys(counts).forEach((r) => names.add(r));
    if (!names.size) names.add(GENERAL_ROOM);
    return [...names].sort((a, b) => (a === GENERAL_ROOM ? -1 : b === GENERAL_ROOM ? 1 : a.localeCompare(b)));
  }, [rooms.join('|'), counts]);
  const [room, setRoom] = useState<string | null>(null);
  const current = room && list.includes(room) ? room : list[0];
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  if (!allowed) return null;
  const me = { uid: currentUserAuth?.uid || '', email: String(currentUserAuth?.email || '').toLowerCase(), name: currentUserAuth?.displayName || currentUserAuth?.email || 'You' };

  return (
    <>
      <Button variant="secondary" size="sm" icon={MessageSquare} onClick={() => setOpen(true)}>Room messages</Button>
      {open && (
        <div className="fixed inset-0 z-[300] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Room messages">
          <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="phd-pop relative flex h-[min(680px,calc(100vh-32px))] w-full max-w-[860px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-slate-100 px-6 pb-4 pt-5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Drawings</p>
                <h2 className="text-lg font-bold text-slate-800">Room messages</h2>
                <p className="text-xs text-slate-500">A thread per room, for the design leads and the people on this project. The client never sees them.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 bg-slate-50 p-4 sm:flex-row">
              <nav aria-label="Rooms" className="flex shrink-0 gap-1 overflow-x-auto sm:w-[220px] sm:flex-col sm:overflow-y-auto">
                {list.map((r) => {
                  const on = r === current;
                  return (
                    <button key={r} type="button" onClick={() => setRoom(r)} aria-current={on ? 'true' : undefined}
                      className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${on ? 'bg-[#3D52A0] text-white shadow-sm hud-rail-active' : 'text-slate-700 hover:bg-slate-100'}`}>
                      <span className="min-w-0 flex-1 truncate">{label(r)}</span>
                      {!!counts[r] && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${on ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{counts[r]}</span>}
                    </button>
                  );
                })}
              </nav>
              <RoomThread orgId={orgId} projectId={projectId} room={current} roomName={label(current)} messages={messages} error={error} me={me} tone="console" className="min-h-0 flex-1" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
