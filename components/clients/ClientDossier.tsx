import React, { useState } from 'react';
import { X, ArrowUpRight } from '@/lib/lucide-shim';
import { Button, INPUT, LABEL } from '../ui/kit';
import { timeAgo } from '../../lib/utils';
import type { FullProjectData } from '../../types';
import type { AggregatedClient } from '../../lib/clientGroups';
import { SideDrawer } from './parts';

/*
  The client's dossier, as the old Clients screen had it: their contact
  details, the studio's notes and their projects.

  The notes are still kept in this browser (localStorage "ffds_client_notes",
  by client key) as before. They move to the Ops Desk follow-up log with the
  composer, by a one-time import the person asks for, never by themselves.
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

export default function ClientDossier({ client, author, onClose, onOpenProject }: {
  client: AggregatedClient;
  author: string;
  onClose: () => void;
  onOpenProject: (project: FullProjectData) => void;
}) {
  const [all, setAll] = useState<Record<string, ClientNote[]>>(readNotes);
  const [draft, setDraft] = useState('');
  const notes = all[client.clientKey] || [];

  const save = (next: Record<string, ClientNote[]>) => {
    setAll(next);
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(next)); } catch (e) { console.error('Could not save the notes in this browser', e); }
  };
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const note: ClientNote = { id: Math.random().toString(36).slice(2, 9), text, createdAt: Date.now(), author };
    save({ ...readNotes(), [client.clientKey]: [note, ...(readNotes()[client.clientKey] || [])] });
    setDraft('');
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
          <h3 className={LABEL}>Studio notes</h3>
          <p className="text-[11px] text-slate-500">Kept in this browser only, as before.</p>
          <div className="flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              placeholder="Add a note only the studio sees" aria-label="New note" className={INPUT} />
            <Button size="sm" variant="primary" onClick={add} disabled={!draft.trim()}>Save</Button>
          </div>
          {notes.length === 0 ? (
            <p className="text-xs text-slate-500 py-1">No notes for this client yet.</p>
          ) : (
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
          )}
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
