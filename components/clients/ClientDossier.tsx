import React, { useState } from 'react';
import { movedNotes, type FollowUpLine } from '../../lib/clientCompose';
import type { FollowUp } from '../../lib/opsDesk';
import { X, ArrowUpRight } from '@/lib/lucide-shim';
import { Button, LABEL } from '../ui/kit';
import { timeAgo } from '../../lib/utils';
import type { FullProjectData } from '../../types';
import type { AggregatedClient } from '../../lib/clientGroups';
import { SideDrawer } from './parts';

/*
  The client's dossier, as the old Clients screen had it: their contact
  details, the studio's notes and their projects.

  New notes go to the Ops Desk follow-up log, from "Add a note" under the
  thread. The notes the old screen kept in this browser (localStorage
  "ffds_client_notes", by client key) are listed here until someone moves
  them there with "Move to follow-ups": once, when asked, never by
  themselves. Each keeps its own id and day (lib/clientCompose movedNotes),
  so moving again writes nothing twice; a note leaves this browser only once
  it is saved.
*/

interface ClientNote { id: string; text: string; createdAt: number; author: string }

const NOTES_KEY = 'ffds_client_notes';

function readNotes(): Record<string, ClientNote[]> {
  try {
    const saved = localStorage.getItem(NOTES_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export default function ClientDossier({ client, onClose, onOpenProject, canLog, onMove }: {
  client: AggregatedClient;
  author: string;
  onClose: () => void;
  onOpenProject: (project: FullProjectData) => void;
  /** May write to the follow-up log. */
  canLog: boolean;
  /** The project the moved notes go to (the client's liveliest). */
  projectId: string;
  /** Writes one moved note; null when it was moved before. */
  onMove: (line: FollowUpLine & { id: string; at: number }) => Promise<FollowUp | null>;
}) {
  const [all, setAll] = useState<Record<string, ClientNote[]>>(readNotes);
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);
  const notes = all[client.clientKey] || [];

  const save = (next: Record<string, ClientNote[]>) => {
    setAll(next);
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(next)); } catch (e) { console.error('Could not save the notes in this browser', e); }
  };
  /* One at a time; each note leaves this browser only once it is in the follow-up log. */
  const move = async () => {
    setMoving(true);
    setMoved(null);
    let done = 0;
    let failed = 0;
    for (const note of notes) {
      try {
        const line = movedNotes(client.clientKey, [note])[0];
        if (line) await onMove(line);
        done++;
        const now = readNotes();
        save({ ...now, [client.clientKey]: (now[client.clientKey] || []).filter((n) => n.id !== note.id) });
      } catch (e: any) {
        console.warn('Clients: moving a note', e?.code || e);
        failed++;
      }
    }
    setMoving(false);
    setMoved(failed ? `${done} moved, ${failed} not moved. Try again.` : `${done === 1 ? 'The note is' : 'The notes are'} in the follow-up log now.`);
  };
  const remove = (id: string) => {
    const now = readNotes();
    save({ ...now, [client.clientKey]: (now[client.clientKey] || []).filter((n) => n.id !== id) });
  };

  return (
    <SideDrawer label={`${client.clientName} · dossier & notes`} onClose={onClose}>
      <div className="p-5 space-y-6">
        <section className="space-y-2">
          <h3 className={LABEL}>Contact</h3>
          <dl className="text-xs space-y-1.5">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Email</dt><dd className="font-medium text-slate-800 select-all break-all text-right">{client.clientEmail || '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-800 select-all text-right">{client.clientPhone || '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Place</dt><dd className="font-medium text-slate-800 text-right">{client.clientLocation || '—'}</dd></div>
          </dl>
        </section>

        <section className="space-y-2.5">
          <h3 className={LABEL}>Notes kept in this browser</h3>
          {notes.length === 0 ? (
            <p className="text-xs text-slate-500">None. New notes go to the follow-up log, from "Add a note" under the thread, so the whole team sees them.</p>
          ) : (
            <>
              <p className="text-[11px] text-slate-500">
                The old Clients screen kept these in this browser only. Move them to the client's follow-ups so the whole team sees them, in the thread and on the Ops Desk.
              </p>
              {canLog && (
                <Button size="sm" variant="primary" onClick={move} disabled={moving}>
                  {moving ? 'Moving…' : `Move ${notes.length === 1 ? 'it' : `all ${notes.length}`} to follow-ups`}
                </Button>
              )}
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="text-slate-800 leading-relaxed break-words">{n.text}</p>
                      <p className="text-[11px] text-slate-500 mt-1">By {n.author} · {timeAgo(n.createdAt)}</p>
                    </div>
                    <button type="button" onClick={() => remove(n.id)} title="Delete note" aria-label="Delete note" className="text-slate-400 hover:text-rose-600 p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {moved && <p className="text-xs font-semibold text-emerald-700" role="status">{moved}</p>}
        </section>

        <section className="space-y-2">
          <h3 className={LABEL}>{client.projects.length === 1 ? 'Project' : 'Projects'}</h3>
          <ul className="space-y-1.5">
            {client.projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-slate-800">{p.context?.name || 'Untitled project'}</span>
                <Button size="sm" variant="quiet" icon={ArrowUpRight} onClick={() => { onOpenProject(p); onClose(); }}>Open</Button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500">Last change {timeAgo(client.lastActivity)}</p>
        </section>
      </div>
    </SideDrawer>
  );
}
