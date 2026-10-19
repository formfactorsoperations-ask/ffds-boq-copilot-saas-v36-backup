import React, { useMemo, useState } from 'react';
import { ShieldCheck, MessageSquare, Undo2, Check, Loader2, Pencil, Trash2, X } from '@/lib/lucide-shim';
import {
  allLines, checksOf, diffTopics, flaggedCount, newId, lineRefs, fmtShortDay, needsOwner,
  type MinutesContent, type MinutesTopic, type ReviewNote, type CorrectionLine,
} from '../../lib/minutes';
import { Panel, Seg, KindChip, Avatar, Chip, CheckRow, EYEBROW, input, btnPri, btnSec, btnSm, linkBtn } from './MinutesBits';

/*
  APPROVING (mockup 3).

  The Ops Director reads the minutes exactly as the client will, comments on
  the line he means, and either approves or returns them with notes. When
  minutes come back a second time -- or a revision answers a client's
  correction -- "Changes only" shows just what is new or different.
*/

export interface QueueRow { key: string; projectName: string; title: string; who: string; when: string; chip?: React.ReactNode; on: boolean; onOpen: () => void }

export interface ReviewProps {
  key?: React.Key;
  content: MinutesContent;
  /** What the reviewer saw last time, or the issued minutes for a revision. */
  before?: MinutesTopic[] | null;
  writtenBy: string;
  sentAt?: number | null;
  carriedFrom?: string | null;
  corrections?: CorrectionLine[];
  revisionNumber?: number | null;
  queue: QueueRow[];
  me: { email: string; name: string };
  onReturn: (notes: ReviewNote[]) => Promise<void>;
  onApprove: (sendMyself: boolean) => Promise<void>;
  onEdit: () => void;
}

export default function MinutesReview(p: ReviewProps) {
  const diff = useMemo(() => (p.before ? diffTopics(p.before, p.content.topics) : null), [p.before, p.content.topics]);
  const [view, setView] = useState<'all' | 'changes'>(diff && (diff.changed.size || diff.removed.length) ? 'changes' : 'all');
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [commenting, setCommenting] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [general, setGeneral] = useState('');
  const [sendMyself, setSendMyself] = useState(false);
  const [busy, setBusy] = useState<'return' | 'approve' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refs = useMemo(() => lineRefs(p.content.topics), [p.content.topics]);

  const checks = useMemo(() => {
    const base = checksOf(p.content).filter((c) => c.blocking);
    const flagged = flaggedCount(p.content.topics);
    return [
      ...base,
      ...(flagged ? [{ ok: true, blocking: false, text: `${flagged} item${flagged === 1 ? '' : 's'} flagged for scope or cost` }] : []),
      ...(p.carriedFrom ? [{ ok: true, blocking: false, text: `Carried forward from ${p.carriedFrom}` }] : []),
    ];
  }, [p.content, p.carriedFrom]);

  const addNote = (lineId: string | null, text: string) => {
    if (!text.trim()) return;
    setNotes((n) => [...n, { id: newId('rn'), lineId, text: text.trim(), by: p.me.email, byName: p.me.name, at: Date.now() }]);
  };
  const lineText = (id: string | null) => {
    if (!id) return 'The minutes';
    const hit = allLines(p.content.topics).find((x) => x.line.id === id);
    return hit ? `${hit.topic.title || 'Topic'} · ${hit.line.kind}` : 'A line';
  };
  const run = async (which: 'return' | 'approve') => {
    setBusy(which);
    setError(null);
    try {
      if (which === 'return') {
        const all = general.trim() ? [...notes, { id: newId('rn'), lineId: null, text: general.trim(), by: p.me.email, byName: p.me.name, at: Date.now() }] : notes;
        await p.onReturn(all);
      } else await p.onApprove(sendMyself);
    } catch (e: any) {
      setError(e?.message || 'That did not go through. Check your connection and try again.');
      setBusy(null);
    }
  };
  const noteCount = notes.length + (general.trim() ? 1 : 0);

  return (
    <div className="grid gap-5 p-4 sm:p-5 grid-cols-1 xl:grid-cols-[290px_minmax(0,1fr)_320px]">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-1 self-start hud-panel-in">
        <p className={`${EYEBROW} px-3 pt-1 pb-2`}>Waiting for you · {p.queue.length}</p>
        {p.queue.map((q, i) => (
          <button key={q.key} type="button" onClick={q.onOpen} aria-current={q.on ? 'true' : undefined}
            className={`w-full text-left px-3 py-2.5 rounded-xl hud-row-in ${q.on ? 'bg-[#3D52A0]/10 ring-1 ring-[#3D52A0]/30' : 'hover:bg-slate-50'}`} style={{ animationDelay: `${i * 30}ms` }}>
            <span className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-800 flex-1 truncate">{q.projectName}</span>{q.chip}</span>
            <span className="block text-xs text-slate-600 truncate">{q.title}</span>
            <span className="block text-[11px] text-slate-500 mt-0.5">{q.who} · {q.when}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 min-w-0 hud-panel-in">
        <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-slate-100">
          <Avatar name={p.writtenBy} />
          <p className="text-sm text-slate-700 flex-1 min-w-[160px]"><b>{p.writtenBy}</b> sent {p.revisionNumber ? `revision ${p.revisionNumber}` : 'these'} for approval{p.sentAt ? ` · ${ago(p.sentAt)}` : ''}</p>
          <Seg label="What to show" value={view} onChange={setView}
            options={[{ id: 'all', label: 'As the client sees it' }, ...(diff ? [{ id: 'changes' as const, label: `Changes only · ${diff.changed.size + diff.removed.length}` }] : [])]} />
        </div>
        {p.content.revisionNote && <p className="mt-4 text-xs rounded-lg bg-[#3D52A0]/5 border border-[#3D52A0]/20 px-3 py-2 text-slate-700"><b>What changed:</b> {p.content.revisionNote}</p>}
        {p.content.summary && <p className="mt-4 text-sm text-slate-700 leading-relaxed"><span className={EYEBROW}>In brief · </span>{p.content.summary}</p>}
        <div className="mt-4 space-y-3">
          {p.content.topics.map((t, ti) => {
            const lines = t.lines.filter((l) => l.text.trim() && (view === 'all' || diff?.changed.has(l.id)));
            if (!lines.length) return null;
            return (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 hud-row-in" style={{ animationDelay: `${ti * 30}ms` }}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 grid place-items-center text-[11px] font-black text-slate-700 tabular-nums">{ti + 1}</span>
                  <p className="font-bold text-slate-800">{t.title || 'Untitled topic'}</p>
                </div>
                <div className="space-y-2">
                  {lines.map((l) => {
                    const mine = notes.filter((n) => n.lineId === l.id);
                    const fix = p.corrections?.find((c) => c.lineId === l.id);
                    const changed = diff?.changed.has(l.id) && view === 'all';
                    return (
                      <div key={l.id} className={`rounded-xl border bg-white px-3 py-2.5 ${changed ? 'border-[#3D52A0]/40' : 'border-slate-200'}`}>
                        <button type="button" onClick={() => { setCommenting(l.id); setDraft(''); }} className="w-full flex items-start gap-2.5 text-left group" aria-label="Comment on this line">
                          {refs[l.id] && <span className="text-[11px] font-bold text-slate-400 w-6 mt-0.5 tabular-nums shrink-0">{refs[l.id]}</span>}
                          <KindChip kind={l.kind} />
                          <span className="text-sm text-slate-800 flex-1">{l.text}</span>
                          {changed && <Chip tone="brand">Changed</Chip>}
                          <MessageSquare className="w-4 h-4 text-slate-300 group-hover:text-[#3D52A0] shrink-0" />
                        </button>
                        {needsOwner(l.kind) && (l.owner?.name || l.due || l.flags?.cost || l.flags?.scope) && (
                          <div className="flex flex-wrap items-center gap-2 mt-2 sm:pl-[86px]">
                            {l.owner?.name && <span className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700">{l.owner.name}</span>}
                            {l.due && <span className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700">{fmtShortDay(l.due)}</span>}
                            {l.flags?.cost && <Chip>Cost impact</Chip>}{l.flags?.scope && <Chip>Scope</Chip>}{l.flags?.drawing && <Chip>Drawing</Chip>}
                          </div>
                        )}
                        {fix && <p className="mt-2 sm:ml-[86px] text-xs rounded-lg bg-rose-50 border border-rose-200 text-rose-900 px-2.5 py-1.5"><b>The client asked:</b> {fix.text}</p>}
                        {mine.map((n) => (
                          <div key={n.id} className="mt-2 sm:ml-[86px] rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 flex gap-2 items-start">
                            <p className="text-xs text-amber-900 flex-1"><b>You:</b> {n.text}</p>
                            <button type="button" onClick={() => setNotes((x) => x.filter((y) => y.id !== n.id))} aria-label="Remove this note" className="text-amber-700 hover:text-rose-700"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        {commenting === l.id && (
                          <form className="mt-2 sm:ml-[86px] flex gap-2" onSubmit={(e) => { e.preventDefault(); addNote(l.id, draft); setCommenting(null); }}>
                            <input autoFocus className={input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What should change on this line?" aria-label="Your note" />
                            <button type="submit" className={btnSm} disabled={!draft.trim()}>Add</button>
                            <button type="button" className={btnSm} onClick={() => setCommenting(null)}>Cancel</button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {view === 'changes' && diff?.removed.map(({ line, topicTitle }) => (
            <div key={line.id} className="rounded-xl border border-dashed border-slate-300 px-3 py-2 flex items-center gap-2.5">
              <Trash2 className="w-4 h-4 text-slate-400" /><KindChip kind={line.kind} /><span className="text-sm text-slate-500 line-through flex-1">{line.text}</span><span className="text-[11px] text-slate-400">{topicTitle}</span>
            </div>
          ))}
          {view === 'changes' && diff && !diff.changed.size && !diff.removed.length && <p className="text-sm text-slate-500">Nothing changed since you last read them.</p>}
        </div>
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-slate-400" />Click any line to comment on it</p>
      </div>

      <div className="space-y-5 min-w-0">
        <Panel icon={ShieldCheck} title="Checks" blurb="Before it goes to the client">
          <ul className="space-y-2">{checks.map((c, i) => <CheckRow key={c.text} c={c} i={i} />)}</ul>
        </Panel>
        <Panel icon={MessageSquare} title="Your notes" blurb="The writer sees each one on its line">
          {notes.length ? (
            <ul className="space-y-2">{notes.map((n) => <li key={n.id} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900"><b>{lineText(n.lineId)}:</b> {n.text}</li>)}</ul>
          ) : <p className="text-xs text-slate-500">None yet. Click a line to add one.</p>}
          <textarea className={`${input} mt-3 min-h-[56px] text-xs`} value={general} onChange={(e) => setGeneral(e.target.value)} placeholder="A note on the minutes as a whole (optional)" aria-label="A note on the minutes as a whole" />
        </Panel>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2.5 hud-panel-in">
          <button type="button" className={`${btnSec} w-full`} disabled={!noteCount || !!busy} onClick={() => run('return')}>
            {busy === 'return' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}Return with {noteCount || 'no'} note{noteCount === 1 ? '' : 's'}
          </button>
          <button type="button" className={`${btnPri} w-full`} disabled={!!busy || !!noteCount} onClick={() => run('approve')}>
            {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{sendMyself ? 'Approve and send' : 'Approve'}
          </button>
          <label className="flex items-center gap-2 text-xs text-slate-600 px-1 cursor-pointer">
            <input type="checkbox" checked={sendMyself} onChange={(e) => setSendMyself(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-[#3D52A0]" />
            Approve and send to the client myself
          </label>
          <p className="text-[11px] text-slate-500 px-1">{noteCount ? 'Remove your notes to approve, or return the minutes with them.' : `Approving puts your name and the time on the minutes.${sendMyself ? '' : ` ${p.writtenBy} then sends them.`}`}</p>
          <button type="button" className={`${linkBtn} px-1`} onClick={p.onEdit} disabled={!!busy}><Pencil className="w-3.5 h-3.5" />Edit them myself</button>
          {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
